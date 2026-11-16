// SPDX-License-Identifier: GPL-3.0-only
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { DVC_MINING_ALGORITHMS, encodeDvcWork, digestDvcWork, mineDvcGpu } from '../public/dvc-miner.mjs';

const PREFIX = Uint8Array.from({ length: 32 }, (_, i) => i), MAX_NONCE = (1n << 256n) - 1n;
const LOW = '0'.repeat(63) + '1', HIGH = 'f'.repeat(64), NONE = 0xffffffff;
const hash = (message, algorithm) => { let value = createHash('sha256').update(message).digest(); if (algorithm === 'sha256d') value = createHash('sha256').update(value).digest(); return value; };
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };
const turn = () => new Promise(resolve => setImmediate(resolve));

// Models WebGPU lifecycle, buffers and dispatch protocol, NOT WGSL execution.
// Node's independent SHA implementation supplies self-test readback. Root must
// still run the startup self-tests and both algorithms on actual browser GPU.
function fixture(options = {}) {
  const stats = { adapters: 0, devices: 0, destroyed: 0, dispatches: [], buffers: [], phase: 'idle' };
  const doc = new EventTarget(); doc.visibilityState = 'visible';
  const page = new EventTarget(), lost = deferred(), entered = deferred();
  const device = Object.assign(new EventTarget(), {
    lost: lost.promise,
    destroy() { stats.destroyed++; options.destroy?.(); },
    createShaderModule(desc) { stats.shader = desc.code; return { async getCompilationInfo() { return { messages: options.compileError ? [{ type: 'error' }] : [] }; } }; },
    createBindGroupLayout: desc => desc, createPipelineLayout: desc => desc,
    async createComputePipelineAsync(desc) { if (options.pipelineGate) { entered.resolve(); await options.pipelineGate; } return { entryPoint: desc.compute.entryPoint }; },
    createBuffer(desc) {
      const buffer = { bytes: new ArrayBuffer(desc.size), destroyed: false, mapped: false,
        destroy() { this.destroyed = true; },
        async mapAsync() { if (options.map) await options.map(stats, entered); this.mapped = true; },
        getMappedRange() { assert(this.mapped); return this.bytes; }, unmap() { this.mapped = false; } };
      stats.buffers.push(buffer); return buffer;
    },
    createBindGroup: desc => desc,
    createCommandEncoder() {
      const command = {};
      return { beginComputePass() { return { setPipeline(p) { command.pipeline = p; }, setBindGroup(i, group) { assert.equal(i, 0); command.group = group; }, dispatchWorkgroups(groups) { command.groups = groups; }, end() {} }; },
        copyBufferToBuffer(source, sourceOffset, target, targetOffset, size) { command.copy = { source, sourceOffset, target, targetOffset, size }; }, finish: () => command };
    },
    queue: {
      writeBuffer(buffer, offset, input) { const bytes = ArrayBuffer.isView(input) ? new Uint8Array(input.buffer, input.byteOffset, input.byteLength) : new Uint8Array(input); new Uint8Array(buffer.bytes).set(bytes, offset); },
      submit(commands) {
        for (const command of commands) {
          const params = new DataView(command.group.entries[0].resource.buffer.bytes), output = new DataView(command.group.entries[1].resource.buffer.bytes), message = Buffer.alloc(64);
          for (let i = 0; i < 16; i++) message.writeUInt32BE(params.getUint32(i * 4, true), i * 4);
          const nonce = BigInt('0x' + message.subarray(32).toString('hex')), count = params.getUint32(64, true), algorithm = params.getUint32(68, true) === 1 ? 'sha256d' : 'sha256';
          const target = Array.from({ length: 8 }, (_, i) => params.getUint32(72 + i * 4, true).toString(16).padStart(8, '0')).join('');
          const entry = { type: command.pipeline.entryPoint, phase: stats.phase, nonce, count, algorithm, target, groups: command.groups, prefix: message.subarray(0, 32).toString('hex') };
          stats.dispatches.push(entry); stats.current = entry;
          if (entry.type === 'self_test') {
            Buffer.from((nonce + BigInt(count)).toString(16).padStart(64, '0'), 'hex').copy(message, 32);
            const digest = hash(message, algorithm);
            for (let i = 0; i < 8; i++) output.setUint32(4 + i * 4, digest.readUInt32BE(i * 4), true);
            if (options.badSelfTest?.(entry)) output.setUint32(4, output.getUint32(4, true) ^ 1, true);
          } else {
            assert.equal(entry.type, 'search');
            const candidate = stats.phase === 'self-testing' ? (hash(message, algorithm).toString('hex') <= target ? 0 : NONE) : options.candidate?.(entry) ?? NONE;
            output.setUint32(0, options.badTargetTest && stats.phase === 'self-testing' ? 0 : candidate, true);
          }
          const c = command.copy; new Uint8Array(c.target.bytes, c.targetOffset, c.size).set(new Uint8Array(c.source.bytes, c.sourceOffset, c.size)); options.submitted?.(entry, stats);
        }
      },
    },
  });
  const adapter = { info: { isFallbackAdapter: options.fallback ?? false }, async requestDevice() { stats.devices++; if (options.deviceGate) { entered.resolve(); await options.deviceGate; } options.beforeDevice?.(); return device; } };
  if (options.legacyFallback !== undefined) { delete adapter.info; adapter.isFallbackAdapter = options.legacyFallback; }
  if (options.unknownFallback) delete adapter.info;
  const gpu = { async requestAdapter(request) { stats.adapters++; stats.preference = request; if (options.adapterGate) { entered.resolve(); await options.adapterGate; } return options.noAdapter ? null : adapter; } };
  const environment = { gpu, document: doc, page, ...(options.now ? { now: options.now } : {}) };
  const run = (args = {}) => mineDvcGpu({ prefix: PREFIX, targetHex: LOW, maxCandidates: 1, ...args, onProgress: event => { stats.phase = event.phase; args.onProgress?.(event); } }, environment);
  const work = () => stats.dispatches.filter(row => row.phase === 'searching');
  const clean = () => { assert.equal(stats.destroyed, 1); assert.ok(stats.buffers.every(buffer => buffer.destroyed)); };
  return { stats, doc, page, device, lost, entered, environment, run, work, clean };
}

test('work encoding is exactly prefix32 plus unsigned big-endian nonce32 with no overflow', () => {
  for (const nonce of [0n, 1n, (1n << 32n) - 1n, 1n << 32n, 1n << 224n, MAX_NONCE]) {
    const bytes = encodeDvcWork(PREFIX, nonce.toString()); assert.equal(bytes.length, 64);
    assert.deepEqual(bytes.subarray(0, 32), PREFIX); assert.equal(Buffer.from(bytes.subarray(32)).toString('hex'), nonce.toString(16).padStart(64, '0'));
  }
  for (const nonce of [-1, 1, '01', '-1', '1.0', ' 1', '', (MAX_NONCE + 1n).toString()]) assert.throws(() => encodeDvcWork(PREFIX, nonce));
  for (const prefix of [new Uint8Array(31), new Uint8Array(33), Array(32).fill(0)]) assert.throws(() => encodeDvcWork(prefix, '0'));
});

test('both Web Crypto digest algorithms match independent known answers and differ', async () => {
  const prefix = new Uint8Array(32).fill(0x61), nonce = BigInt('0x' + '61'.repeat(32)).toString();
  assert.equal(await digestDvcWork(prefix, nonce, 'sha256'), 'ffe054fe7ae0cb6dc65c3af9b61d5209f439851db43d0ba5997337df154668eb');
  assert.equal(await digestDvcWork(prefix, nonce, 'sha256d'), '64d28424725a6f219efb17d6f8e4036719bf9e1a8ec2388c22cfb5fc412d46bc');
  for (const algorithm of ['sha256', 'sha256d']) for (const value of ['0', (1n << 224n).toString(), MAX_NONCE.toString()]) assert.equal(await digestDvcWork(PREFIX, value, algorithm), hash(encodeDvcWork(PREFIX, value), algorithm).toString('hex'));
  await assert.rejects(digestDvcWork(PREFIX, '0', 'scrypt')); assert.equal(Object.isFrozen(DVC_MINING_ALGORITHMS), true);
});

test('invalid targets, algorithms, budgets, intensity and signals fail before GPU access', async () => {
  const f = fixture();
  for (const args of [{ targetHex: '0'.repeat(64) }, { targetHex: 'F'.repeat(64) }, { targetHex: '0x' + HIGH }, { targetHex: HIGH.slice(1) }, { targetHex: 'z'.repeat(64) },
    { algorithm: 'bitcoin' }, { maxMs: 0 }, { maxMs: 60001 }, { maxMs: 1.5 }, { maxCandidates: 0 }, { maxCandidates: 4194305 }, { maxCandidates: Infinity },
    { intensity: 'constructor' }, { intensity: 'max' }, { startNonce: '01' }, { signal: {} }, { isVisible: false }, { onProgress: null }]) {
    if (args.onProgress === null) await assert.rejects(mineDvcGpu({ prefix: PREFIX, targetHex: LOW, ...args }, f.environment)); else await assert.rejects(f.run(args));
  }
  assert.equal(f.stats.adapters, 0);
});

test('unavailable, fallback and unconfirmed adapters never start a CPU miner', async () => {
  await assert.rejects(mineDvcGpu({ prefix: PREFIX, targetHex: LOW }, { gpu: null }), /WebGPU is unavailable.*No CPU miner/);
  const missing = fixture({ noAdapter: true }); await assert.rejects(missing.run(), /No WebGPU adapter/);
  for (const options of [{ fallback: true }, { legacyFallback: true }, { unknownFallback: true }]) { const f = fixture(options); await assert.rejects(f.run(), /hardware WebGPU adapter/); assert.equal(f.stats.devices, 0); }
  const legacy = fixture({ legacyFallback: false }); assert.equal((await legacy.run()).status, 'exhausted'); legacy.clean();
});

test('already aborted or hidden work is inert and reports its untouched nonce', async () => {
  const f = fixture(), controller = new AbortController(); controller.abort();
  for (const args of [{ signal: controller.signal }, { isVisible: () => false }]) { const result = await f.run({ startNonce: '9', ...args }); assert.equal(result.status, 'stopped'); assert.equal(result.attempts, 0); assert.equal(result.nextNonce, '9'); assert.equal(result.nonce, null); }
  f.doc.visibilityState = 'hidden'; assert.equal((await f.run()).status, 'stopped'); assert.equal(f.stats.adapters, 0);
});

test('each attempt self-tests both algorithms, seven-limb carry and exact target equality', async () => {
  const f = fixture(); const result = await f.run({ algorithm: 'sha256' });
  assert.equal(result.status, 'exhausted'); assert.equal(result.attempts, 1); assert.equal(result.nextNonce, '1');
  const self = f.stats.dispatches.filter(row => row.phase === 'self-testing'); assert.equal(self.length, 8);
  for (const algorithm of ['sha256', 'sha256d']) {
    const vectors = self.filter(row => row.algorithm === algorithm && row.type === 'self_test'); assert.equal(vectors.length, 2); assert.equal(vectors[1].nonce, (1n << 224n) - 1n); assert.equal(vectors[1].count, 1);
    const bounds = self.filter(row => row.algorithm === algorithm && row.type === 'search'); assert.equal(BigInt('0x' + bounds[0].target) - BigInt('0x' + bounds[1].target), 1n);
  }
  f.clean();
});

test('compilation, either algorithm, carry and full-target self-test failures prevent user work', async () => {
  for (const options of [{ compileError: true }, { badSelfTest: entry => entry.algorithm === 'sha256' }, { badSelfTest: entry => entry.algorithm === 'sha256d' }, { badSelfTest: entry => entry.count === 1 }, { badTargetTest: true }]) {
    const f = fixture(options); await assert.rejects(f.run(), /compile|self-test failed/); assert.equal(f.work().length, 0); f.clean();
  }
});

test('both algorithms independently verify hardware candidates and preserve a prefix snapshot', async () => {
  for (const algorithm of ['sha256', 'sha256d']) {
    const f = fixture({ candidate: () => 3 }), prefix = PREFIX.slice(), expected = hash(encodeDvcWork(prefix, '10'), algorithm).toString('hex');
    const result = await f.run({ prefix, algorithm, startNonce: '7', targetHex: expected, maxCandidates: 5, onProgress: ({ phase }) => { if (phase === 'preparing') prefix.fill(255); } });
    assert.equal(result.status, 'found'); assert.equal(result.nonce, '10'); assert.equal(result.digest, expected); assert.equal(result.attempts, 5); assert.equal(result.nextNonce, '12'); assert.equal(result.algorithm, algorithm); assert.equal(result.backend, 'webgpu'); assert.ok(result.elapsedMs >= 0);
    assert.equal(f.work()[0].prefix, Buffer.from(PREFIX).toString('hex')); f.clean();
  }
});

test('a final-word target failure and an out-of-range candidate can never become valid work', async () => {
  for (const algorithm of ['sha256', 'sha256d']) {
    const digest = hash(encodeDvcWork(PREFIX, '0'), algorithm).toString('hex');
    const below = (BigInt('0x' + digest) - 1n).toString(16).padStart(64, '0');
    const f = fixture({ candidate: () => 0 }); await assert.rejects(f.run({ algorithm, targetHex: below }), /independent DVC digest/); f.clean();
  }
  const f = fixture({ candidate: () => 1 }); await assert.rejects(f.run({ targetHex: HIGH, maxCandidates: 1 }), /out-of-range/); f.clean();
});

test('eco, balanced and fast use bounded batches, exact candidate budgets and paced scheduling', async () => {
  for (const [intensity, batch, minimumPause] of [['eco', 1024, 70], ['balanced', 8192, 30], ['fast', 32768, 3]]) {
    const f = fixture(), start = performance.now(), result = await f.run({ intensity, maxCandidates: batch + 5 });
    assert.equal(result.status, 'exhausted'); assert.equal(result.attempts, batch + 5); assert.equal(result.nextNonce, String(batch + 5));
    assert.deepEqual(f.work().map(row => [row.nonce, row.count, row.groups]), [[0n, batch, batch / 64], [BigInt(batch), 5, 1]]);
    assert.ok(performance.now() - start >= minimumPause); assert.equal(f.stats.preference.forceFallbackAdapter, false); assert.equal(f.stats.preference.powerPreference, intensity === 'eco' ? 'low-power' : 'high-performance'); f.clean();
  }
});

test('the final nonce is searched once without wrapping, including a valid final candidate', async () => {
  for (const found of [false, true]) {
    const f = fixture({ candidate: () => found ? 0 : NONE }); const result = await f.run({ startNonce: MAX_NONCE.toString(), maxCandidates: 4000, targetHex: found ? HIGH : LOW });
    assert.equal(result.status, found ? 'found' : 'exhausted'); assert.equal(result.attempts, 1); assert.equal(result.nextNonce, null);
    assert.equal(f.work()[0].nonce, MAX_NONCE); assert.equal(f.work()[0].count, 1); f.clean();
  }
});

test('Stop interrupts unresolved adapter discovery, without later device creation', async () => {
  const gate = deferred(), f = fixture({ adapterGate: gate.promise }), controller = new AbortController();
  const pending = f.run({ signal: controller.signal }); await f.entered.promise; controller.abort(); assert.equal((await pending).status, 'stopped');
  gate.resolve(); await turn(); assert.equal(f.stats.devices, 0);
});

test('late devices after Stop or deadline are destroyed exactly once before work', async () => {
  const gate = deferred(), f = fixture({ deviceGate: gate.promise }), controller = new AbortController();
  const pending = f.run({ signal: controller.signal }); await f.entered.promise; controller.abort(); assert.equal((await pending).status, 'stopped');
  gate.resolve(); await turn(); assert.equal(f.stats.dispatches.length, 0); f.clean();
  let clock = 0; const timed = fixture({ now: () => clock, beforeDevice: () => { clock = 1000; } });
  assert.equal((await timed.run({ maxMs: 1000 })).status, 'exhausted'); assert.equal(timed.stats.dispatches.length, 0); timed.clean();
});

test('hide then show during compilation cannot revive an attempt', async () => {
  const gate = deferred(), f = fixture({ pipelineGate: gate.promise }); const pending = f.run(); await f.entered.promise;
  f.doc.visibilityState = 'hidden'; f.doc.dispatchEvent(new Event('visibilitychange')); f.doc.visibilityState = 'visible'; f.doc.dispatchEvent(new Event('visibilitychange'));
  assert.equal((await pending).status, 'stopped'); gate.resolve(); await turn(); assert.equal(f.stats.dispatches.length, 0); f.clean();
});

test('navigation and lock predicates cancel pending readback before accepting a candidate', async () => {
  const gate = deferred(), f = fixture({ candidate: () => 0, map: async (stats, entered) => { if (stats.phase === 'searching') { entered.resolve(); await gate.promise; } } });
  const pending = f.run({ targetHex: HIGH }); await f.entered.promise; f.page.dispatchEvent(new Event('pagehide'));
  const result = await pending; assert.equal(result.status, 'stopped'); assert.equal(result.nonce, null); assert.equal(result.attempts, 0); assert.equal(result.nextNonce, '0'); gate.resolve(); await turn(); f.clean();
  let visible = true; const lock = fixture({ candidate: () => 0, map: async stats => { if (stats.phase === 'searching') visible = false; } });
  assert.equal((await lock.run({ targetHex: HIGH, isVisible: () => visible })).status, 'stopped'); lock.clean();
});

test('Stop while independent digest verification is pending rejects its valid late result', async t => {
  const gate = deferred(), entered = deferred(), controller = new AbortController(), nativeDigest = crypto.subtle.digest.bind(crypto.subtle);
  const f = fixture({ candidate: () => 0 });
  t.mock.method(crypto.subtle, 'digest', async (...args) => { if (f.stats.phase === 'searching') { entered.resolve(); await gate.promise; } return nativeDigest(...args); });
  const pending = f.run({ targetHex: HIGH, algorithm: 'sha256d', signal: controller.signal }); await entered.promise; controller.abort();
  const result = await pending; assert.equal(result.status, 'stopped'); assert.equal(result.nonce, null); assert.equal(result.digest, null); assert.equal(result.attempts, 1); assert.equal(result.nextNonce, '1'); gate.resolve(); await turn(); f.clean();
});

test('verification at the deadline cannot return success', async t => {
  let clock = 0; const f = fixture({ candidate: () => 0, now: () => clock }), nativeDigest = crypto.subtle.digest.bind(crypto.subtle);
  t.mock.method(crypto.subtle, 'digest', async (...args) => { const result = await nativeDigest(...args); if (f.stats.phase === 'searching') clock = 1000; return result; });
  const result = await f.run({ targetHex: HIGH, maxMs: 1000 }); assert.equal(result.status, 'exhausted'); assert.equal(result.nonce, null); assert.equal(result.attempts, 1); assert.equal(result.elapsedMs, 1000); f.clean();
});

test('the wall-clock budget also bounds an adapter promise that never settles', async () => {
  const f = fixture({ adapterGate: new Promise(() => {}) }); const result = await f.run({ maxMs: 20 });
  assert.equal(result.status, 'exhausted'); assert.equal(result.attempts, 0); assert.equal(result.nextNonce, '0'); assert.equal(f.stats.devices, 0);
});

test('device loss and validation errors release buffers while readback is stuck', async () => {
  for (const kind of ['lost', 'validation']) {
    const gate = deferred(), f = fixture({ map: async (stats, entered) => { entered.resolve(); await gate.promise; } });
    const pending = f.run(); await f.entered.promise;
    if (kind === 'lost') f.lost.resolve({ reason: 'unknown', message: 'fixture device' }); else f.device.dispatchEvent(new Event('uncapturederror'));
    await assert.rejects(pending, /GPU device was lost|GPU work failed/); gate.resolve(); await turn(); f.clean();
  }
});

test('readback rejection caused by Stop remains stopped and all listeners are removed', async () => {
  const gate = deferred(), controller = new AbortController(), f = fixture({ map: async (stats, entered) => { entered.resolve(); await gate.promise; }, destroy: () => gate.reject(Error('Destroyed buffer')) });
  const pending = f.run({ signal: controller.signal }); await f.entered.promise; controller.abort(); assert.equal((await pending).status, 'stopped');
  f.doc.visibilityState = 'hidden'; f.doc.dispatchEvent(new Event('visibilitychange')); f.page.dispatchEvent(new Event('pagehide')); f.device.dispatchEvent(new Event('uncapturederror')); f.clean();
});
