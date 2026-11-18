import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { getEventListeners } from 'node:events';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { djMakeBank, DJRenderer } from '../public/jazz-core.mjs';
import { parseJazzDotVoice, buildJazzDotBank } from '../public/jazz-dot-voices.mjs';
import { buildJazzDotBankInWorker, validateJazzDotBank } from '../jazz-dot-bank.mjs';

const voice = () => parseJazzDotVoice({ id: 'worker-fixture', name: 'Worker sound', real: Array(128).fill(0),
  imag: Array.from({ length: 128 }, (_, index) => index === 1 ? .65 : index === 3 ? .15 : 0), effects: [] });
const digest = bank => {
  const hash = createHash('sha256'); hash.update(String(bank.rate));
  for (const item of [...bank.piano, ...bank.bass]) { hash.update(String(item.note)); hash.update(Buffer.from(item.data.buffer)); }
  for (const data of Object.values(bank.drums)) hash.update(Buffer.from(data.buffer));
  return hash.digest('hex');
};

test('a real worker produces a complete deterministic bank while the parent event loop keeps running', async () => {
  const assignments = { piano: voice(), drums: voice() }, expected = buildJazzDotBank(djMakeBank(8000), assignments);
  let ticks = 0; const timer = setInterval(() => { ticks++; }, 1);
  let bank;
  try { bank = await buildJazzDotBankInWorker(assignments, { rate: 8000 }); }
  finally { clearInterval(timer); }
  assert(ticks >= 2, 'Preparing sounds must leave the parent event loop responsive.');
  assert.equal(digest(bank), digest(expected)); assert.equal(bank.piano.length, 15); assert.equal(bank.bass.length, 10);
  assert.equal(validateJazzDotBank(bank, 8000).length, 30);
  const renderer = new DJRenderer(48000, bank, { seed: 43 }), left = new Float32Array(480), right = new Float32Array(480);
  let energy = 0;
  for (let frame = 0; frame < 30; frame++) {
    renderer.render(left, right);
    for (let index = 0; index < left.length; index++) { assert(Number.isFinite(left[index]) && Number.isFinite(right[index])); energy += left[index] ** 2 + right[index] ** 2; }
  }
  assert(energy > .1);
});

test('the default bank rate is 24 kHz and null assignments restore the original instruments', async () => {
  const actual = await buildJazzDotBankInWorker({ piano: null, bass: null, drums: null });
  assert.equal(actual.rate, 24000); assert.equal(digest(actual), digest(djMakeBank(24000)));
});

test('three instruments at the maximum supported rate and effects count fit the bounded worker', async () => {
  const selected = voice(); selected.recipe.waves[0].effects = Array.from({ length: 6 }, () => ({ type: 'reverb', enabled: true, mix: .4, size: 2, decay: .8 }));
  const bank = await buildJazzDotBankInWorker({ piano: selected, bass: selected, drums: selected }, { rate: 48000 });
  const buffers = validateJazzDotBank(bank, 48000);
  assert.equal(buffers.length, 30); assert(buffers.reduce((bytes, buffer) => bytes + buffer.byteLength, 0) <= 16 * 1024 * 1024);
});

test('the worker receives its own plain recipe snapshot, independent of later caller edits', async () => {
  const selected = voice(), expected = buildJazzDotBank(djMakeBank(8000), { bass: selected });
  const pending = buildJazzDotBankInWorker({ bass: selected }, { rate: 8000 });
  selected.recipe.waves[0].imag.fill(0); selected.name = 'Changed after request';
  assert.equal(digest(await pending), digest(expected));
});

test('invalid, executable, oversized or non-normalized inputs fail before a worker can run them', async () => {
  let getterCalls = 0;
  const getter = {}; Object.defineProperty(getter, 'piano', { enumerable: true, get() { getterCalls++; return voice(); } });
  const cyclic = {}; cyclic.piano = cyclic;
  const oversized = voice(); oversized.attribution.source = '界'.repeat(12000);
  const sparse = voice(); sparse.recipe.waves[0].imag = new Array(128);
  const nonfinite = voice(); nonfinite.recipe.waves[0].imag[1] = NaN;
  for (const value of [null, [], { arbitrary: voice() }, { piano: { name: 'raw recipe', ...voice().recipe } }, { piano: oversized }, { piano: sparse }, { piano: nonfinite }, getter, cyclic,
    { piano: { ...voice(), script: 'do not run' } }, JSON.parse('{"__proto__":{"unsafe":true}}')]) {
    await assert.rejects(buildJazzDotBankInWorker(value, { rate: 8000, timeoutMs: 1 }), { code: 'JAZZ_DOT_INPUT' });
  }
  assert.equal(getterCalls, 0); assert.equal({}.unsafe, undefined);
  for (const options of [{ rate: 7999 }, { rate: 48001 }, { rate: 24000.5 }, { timeoutMs: 0 }, { timeoutMs: 30001 }, { signal: {} }])
    await assert.rejects(buildJazzDotBankInWorker({}, options), { code: 'JAZZ_DOT_INPUT' });
});

test('full recipe validation stays in the worker and returns a safe actionable failure', async () => {
  const invalid = voice(); invalid.recipe.waves[0].url = 'https://example.invalid/private-reference';
  await assert.rejects(buildJazzDotBankInWorker({ piano: invalid }, { rate: 8000 }), failure => {
    assert.equal(failure.code, 'JAZZ_DOT_BUILD'); assert.match(failure.message, /Choose another sound/);
    assert(!failure.message.includes('private-reference')); return true;
  });
});

test('cancellation and deadlines terminate owned workers and remove abort listeners', async () => {
  const cancelled = new AbortController(); cancelled.abort();
  await assert.rejects(buildJazzDotBankInWorker({}, { rate: 8000, signal: cancelled.signal }), { code: 'JAZZ_DOT_CANCELLED' });
  const active = new AbortController(), pending = buildJazzDotBankInWorker({ piano: voice() }, { rate: 8000, signal: active.signal });
  queueMicrotask(() => active.abort());
  await assert.rejects(pending, { code: 'JAZZ_DOT_CANCELLED' }); assert.equal(getEventListeners(active.signal, 'abort').length, 0);
  const deadline = new AbortController();
  await assert.rejects(buildJazzDotBankInWorker({}, { rate: 8000, signal: deadline.signal, timeoutMs: 1 }), { code: 'JAZZ_DOT_TIMEOUT' });
  assert.equal(getEventListeners(deadline.signal, 'abort').length, 0);
  const success = new AbortController(); await buildJazzDotBankInWorker({}, { rate: 8000, signal: success.signal });
  assert.equal(getEventListeners(success.signal, 'abort').length, 0);
});

test('bank transfer checks reject nonfinite samples, extra pitches, aliases and out-of-bound buffers', () => {
  const bank = djMakeBank(8000); assert.equal(validateJazzDotBank(bank, 8000).length, 30);
  const sample = bank.piano[0].data[1]; bank.piano[0].data[1] = Infinity;
  assert.throws(() => validateJazzDotBank(bank, 8000), { code: 'JAZZ_DOT_RESULT' }); bank.piano[0].data[1] = sample;
  assert.throws(() => validateJazzDotBank({ ...bank, rate: 9000 }, 8000), { code: 'JAZZ_DOT_RESULT' });
  assert.throws(() => validateJazzDotBank({ ...bank, piano: [...bank.piano, bank.piano[0]] }, 8000), { code: 'JAZZ_DOT_RESULT' });
  const bass = bank.bass[0].data; bank.bass[0].data = bank.piano[0].data;
  assert.throws(() => validateJazzDotBank(bank, 8000), { code: 'JAZZ_DOT_RESULT' }); bank.bass[0].data = bass;
  const kick = bank.drums.kick; bank.drums.kick = new Float32Array(32001);
  assert.throws(() => validateJazzDotBank(bank, 8000), { code: 'JAZZ_DOT_RESULT' }); bank.drums.kick = kick;
  bank.drums.kick = kick.subarray(1); assert.throws(() => validateJazzDotBank(bank, 8000), { code: 'JAZZ_DOT_RESULT' });
});

test('success, timeout and abort leave a parent process free to exit naturally without inherited preloads', { timeout: 30000 }, async () => {
  const moduleUrl = new URL('../jazz-dot-bank.mjs', import.meta.url).href;
  const source = `import assert from 'node:assert/strict';
    import {buildJazzDotBankInWorker} from ${JSON.stringify(moduleUrl)};
    process.env.NODE_OPTIONS = '--require=__jazz_worker_must_not_inherit_this__';
    const result = await buildJazzDotBankInWorker({}, {rate:8000}); assert.equal(result.rate,8000);
    await assert.rejects(buildJazzDotBankInWorker({}, {rate:8000,timeoutMs:1}), {code:'JAZZ_DOT_TIMEOUT'});
    const controller = new AbortController(), pending = buildJazzDotBankInWorker({}, {rate:8000,signal:controller.signal});
    queueMicrotask(()=>controller.abort()); await assert.rejects(pending,{code:'JAZZ_DOT_CANCELLED'});
    console.log('jazzDotWorkerCleanExit');`;
  const preload = 'data:text/javascript,' + encodeURIComponent('import {isMainThread} from "node:worker_threads"; if(!isMainThread) throw Error("Worker inherited parent preload");');
  const output = await new Promise((resolve, reject) => {
    const env = Object.fromEntries(['SystemRoot', 'TEMP', 'TMP'].filter(key => process.env[key] !== undefined).map(key => [key, process.env[key]]));
    const child = spawn(process.execPath, ['--import', preload, '--input-type=module', '-e', source], { cwd: fileURLToPath(new URL('../../', import.meta.url)), env, shell: false, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '', stderr = '', finished = false;
    const timer = setTimeout(() => { child.kill('SIGKILL'); finish(Error('Pure-JS sound worker prevented natural process exit.')); }, 25000);
    function finish(failure) { if (finished) return; finished = true; clearTimeout(timer); if (failure) reject(failure); else resolve(stdout); }
    child.on('error', finish);
    child.stdout.on('data', chunk => { stdout += chunk; if (stdout.length > 1024) { child.kill('SIGKILL'); finish(Error('Unexpected worker canary output.')); } });
    child.stderr.on('data', chunk => { stderr += chunk; if (stderr.length > 8192) { child.kill('SIGKILL'); finish(Error('Unexpected worker canary diagnostics.')); } });
    child.on('close', (code, signal) => finish(code === 0 && signal === null ? null : Error('Worker canary did not exit cleanly: ' + stderr.slice(0, 1000))));
  });
  assert.equal(output.trim(), 'jazzDotWorkerCleanExit');
});
