// SPDX-License-Identifier: GPL-3.0-only
import { parentPort, workerData } from 'node:worker_threads';
import { djMakeBank } from './public/jazz-core.mjs';
import { buildJazzDotBank, parseJazzDotVoice, JAZZ_DOT_PARTS, JAZZ_DOT_MAX_BYTES } from './public/jazz-dot-voices.mjs';
import { validateJazzDotBank } from './jazz-dot-bank.mjs';

// One fixed build per worker, then transfer ownership of every sample buffer.
// No microphone, files, network, native media or host environment is involved.
if (parentPort) {
  let waiting = false, closeTimer;
  parentPort.on('message', message => {
    if (waiting && message?.type === 'received' && Object.keys(message).length === 1) {
      waiting = false; clearTimeout(closeTimer); parentPort.close();
    }
  });
  try {
    const { rate, assignments } = workerData || {};
    if (!Number.isInteger(rate) || rate < 8000 || rate > 48000 || !assignments || typeof assignments !== 'object' || Array.isArray(assignments)
      || Object.keys(assignments).some(part => !JAZZ_DOT_PARTS.includes(part))
      || Buffer.byteLength(JSON.stringify(assignments), 'utf8') > JAZZ_DOT_MAX_BYTES * 3 + 64) throw Error('Invalid musical recipe envelope.');
    const selected = Object.fromEntries(Object.entries(assignments).map(([part, voice]) => [part, voice === null ? null : parseJazzDotVoice(voice)]));
    const bank = buildJazzDotBank(djMakeBank(rate), selected), transfer = validateJazzDotBank(bank, rate);
    waiting = true; parentPort.postMessage({ type: 'bank', bank }, transfer);
    closeTimer = setTimeout(() => { waiting = false; parentPort.close(); }, 2000);
  } catch {
    parentPort.postMessage({ type: 'failed' }); parentPort.close();
  }
}
