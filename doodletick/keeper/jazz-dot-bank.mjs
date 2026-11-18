// SPDX-License-Identifier: GPL-3.0-only
import { Worker } from 'node:worker_threads';

const PARTS = Object.freeze(['piano', 'bass', 'drums']);
const DRUMS = Object.freeze(['ride', 'brush', 'kick', 'hat', 'stick']);
const MAX_VOICE_BYTES = 32768, MAX_BANK_BYTES = 32 * 1024 * 1024;
const error = (code, message) => Object.assign(Error(message), { code });
const inputError = () => error('JAZZ_DOT_INPUT', 'Choose up to three saved Dot Wave voices, each no larger than 32 KB, then try again.');
const workerError = () => error('JAZZ_DOT_WORKER', 'Keeper could not prepare this Dot Wave sound. Try again.');

// This boundary only copies bounded plain data. Fourier normalization and all
// sample/effect preparation belong to the worker; saved recipes are semantically
// normalized by the voice store before reaching this factory.
function assignmentsCopy(input) {
  let nodes = 0; const ancestors = new Set();
  function copy(value, depth = 0) {
    if (++nodes > 12288 || depth > 14) throw inputError();
    if (value === null || typeof value === 'boolean') return value;
    if (typeof value === 'number') { if (!Number.isFinite(value)) throw inputError(); return value; }
    if (typeof value === 'string') { if (value.length > MAX_VOICE_BYTES) throw inputError(); return value; }
    if (!value || typeof value !== 'object' || ancestors.has(value)) throw inputError();
    const array = Array.isArray(value), prototype = Object.getPrototypeOf(value);
    if (array ? prototype !== Array.prototype || value.length > 128 : prototype !== Object.prototype && prototype !== null) throw inputError();
    const descriptors = Object.getOwnPropertyDescriptors(value), keys = Reflect.ownKeys(descriptors);
    if (keys.length > (array ? 129 : 40) || array && keys.length !== value.length + 1) throw inputError();
    const output = array ? [] : {}; ancestors.add(value);
    for (const key of keys) {
      const descriptor = descriptors[key];
      if (typeof key !== 'string' || ['__proto__', 'prototype', 'constructor'].includes(key) || !Object.hasOwn(descriptor, 'value')) throw inputError();
      if (array && key === 'length') continue;
      if (array && !/^(0|[1-9][0-9]*)$/.test(key)) throw inputError();
      output[key] = copy(descriptor.value, depth + 1);
    }
    ancestors.delete(value); return output;
  }
  const selected = copy(input);
  if (!selected || typeof selected !== 'object' || Array.isArray(selected) || Object.keys(selected).some(part => !PARTS.includes(part))) throw inputError();
  for (const voice of Object.values(selected)) {
    if (voice === null) continue;
    if (!voice || typeof voice !== 'object' || Array.isArray(voice)
      || Object.keys(voice).some(key => !['kind', 'version', 'name', 'attribution', 'recipe'].includes(key))
      || voice.kind !== 'doodle-jazz-dot-voice' || voice.version !== 1 || typeof voice.name !== 'string' || !voice.name.trim() || voice.name.length > 64
      || !voice.recipe || typeof voice.recipe !== 'object' || Array.isArray(voice.recipe)
      || !['dot-wave-library', 'dot-wave-studio', 'dot-mushroom'].includes(voice.recipe.kind)
      || Buffer.byteLength(JSON.stringify(voice), 'utf8') > MAX_VOICE_BYTES) throw inputError();
  }
  if (Buffer.byteLength(JSON.stringify(selected), 'utf8') > MAX_VOICE_BYTES * 3 + 64) throw inputError();
  return selected;
}

/** Internal worker protocol check; full sample scans run in the worker. */
export function validateJazzDotBank(bank, rate, checkSamples = true) {
  const invalid = () => { throw error('JAZZ_DOT_RESULT', 'Keeper received an invalid Dot Wave sample bank. Try another sound.'); };
  if (!bank || typeof bank !== 'object' || Array.isArray(bank) || bank.rate !== rate
    || Object.keys(bank).length !== 4 || !Number.isInteger(rate) || rate < 8000 || rate > 48000) invalid();
  let bytes = 0; const buffers = new Set();
  function samples(data) {
    if (!(data instanceof Float32Array) || !(data.buffer instanceof ArrayBuffer) || data.byteOffset !== 0 || data.byteLength !== data.buffer.byteLength
      || !data.length || data.length > Math.ceil(rate * 4) || buffers.has(data.buffer)) invalid();
    bytes += data.byteLength; if (bytes > MAX_BANK_BYTES) invalid(); buffers.add(data.buffer);
    if (checkSamples) for (const value of data) if (!Number.isFinite(value)) invalid();
  }
  for (const [part, first, count] of [['piano', 45, 15], ['bass', 30, 10]]) {
    if (!Array.isArray(bank[part]) || bank[part].length !== count) invalid();
    for (let index = 0; index < count; index++) {
      const item = bank[part][index];
      if (!item || typeof item !== 'object' || Object.keys(item).length !== 2 || item.note !== first + index * 3) invalid();
      samples(item.data);
    }
  }
  if (!bank.drums || typeof bank.drums !== 'object' || Array.isArray(bank.drums) || Object.keys(bank.drums).length !== DRUMS.length) invalid();
  for (const kind of DRUMS) samples(bank.drums[kind]);
  return [...buffers];
}

/** Prepare a complete replacement bank without blocking the live audio loop.
 * Only fixed, owned JavaScript executes. The worker receives musical recipes,
 * no host environment, user identities, executable paths or native bindings.
 */
export async function buildJazzDotBankInWorker(assignments = {}, { rate = 24000, signal, timeoutMs = 20000 } = {}) {
  if (!Number.isInteger(rate) || rate < 8000 || rate > 48000 || !Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 30000
    || signal !== undefined && !(signal instanceof AbortSignal)) throw inputError();
  if (signal?.aborted) throw error('JAZZ_DOT_CANCELLED', 'Dot Wave sound preparation was cancelled.');
  const selected = assignmentsCopy(assignments);
  return new Promise((resolve, reject) => {
    let worker, timer, closeTimer, finished = false, result = null;
    const finish = async failure => {
      if (finished) return; finished = true; clearTimeout(timer); clearTimeout(closeTimer); signal?.removeEventListener('abort', abort);
      if (failure) {
        try { await worker?.terminate(); } catch { /* Owned pure-JS worker already exited. */ }
        reject(failure);
      } else resolve(result);
    };
    const abort = () => { void finish(error('JAZZ_DOT_CANCELLED', 'Dot Wave sound preparation was cancelled.')); };
    try {
      worker = new Worker(new URL('./jazz-dot-worker.mjs', import.meta.url), {
        workerData: { rate, assignments: selected }, env: {}, execArgv: [], argv: [],
        resourceLimits: { maxOldGenerationSizeMb: 64, maxYoungGenerationSizeMb: 8, codeRangeSizeMb: 8, stackSizeMb: 4 },
        stdin: false, stdout: true, stderr: true
      });
      // Fixed DSP code does not print. Drain/discard rather than inheriting any
      // upstream diagnostics or allowing an unread output pipe to hold memory.
      worker.stdout.resume(); worker.stderr.resume();
      worker.on('error', () => { void finish(workerError()); });
      worker.on('message', message => {
        if (finished) return;
        if (!message || message.type !== 'bank' || result) {
          const failure = message?.type === 'failed'
            ? error('JAZZ_DOT_BUILD', 'This Dot Wave voice could not be prepared for Jazz. Choose another sound or simplify its effects.') : workerError();
          void finish(failure); return;
        }
        try { validateJazzDotBank(message.bank, rate, false); result = message.bank; worker.postMessage({ type: 'received' }); }
        catch { void finish(workerError()); return; }
        // Success is returned only after the owned worker acknowledges receipt
        // by closing its port and exiting. A stuck close remains a failure.
        closeTimer = setTimeout(() => { void finish(workerError()); }, 1000);
      });
      worker.on('exit', code => { if (!finished) void finish(code === 0 && result ? null : workerError()); });
      signal?.addEventListener('abort', abort, { once: true });
      timer = setTimeout(() => { void finish(error('JAZZ_DOT_TIMEOUT', 'Dot Wave sound preparation took too long. Try a simpler voice or fewer effects.')); }, timeoutMs);
      if (signal?.aborted) abort();
    } catch { void finish(workerError()); }
  });
}
