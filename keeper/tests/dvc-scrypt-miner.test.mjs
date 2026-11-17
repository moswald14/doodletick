// SPDX-License-Identifier: GPL-3.0-only
import test from 'node:test';
import assert from 'node:assert/strict';
import { scryptSync } from 'node:crypto';
import { DVC_SCRYPT_ALGORITHM, encodeScryptHeaderNonce, hashScryptHeader, scryptHashMeetsTarget, mineScryptGpu } from '../public/dvc-scrypt-miner.mjs';

const HEADER = Uint8Array.from({ length: 80 }, (_, i) => i), MAX_NONCE = 0xffffffff;
const LOW = '0'.repeat(63) + '1', HIGH = 'f'.repeat(64), NONE = 0xffffffff;
const nativeHash = header => scryptSync(header, header, 32, { N: 1024, r: 1, p: 1, maxmem: 1048576 });
const targetFor = hash => Buffer.from(hash).reverse().toString('hex');
const below = target => (BigInt('0x' + target) - 1n).toString(16).padStart(64, '0');
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };
const turn = () => new Promise(resolve => setImmediate(resolve));

// Exercises buffer protocol and cancellation, not WGSL execution. Independent
// Node/OpenSSL Scrypt supplies mock readback. Real browser GPU self-tests remain
// necessary to establish that a particular device executes the shader correctly.
function fixture(options = {}) {
  const stats = { adapters: 0, devices: 0, destroyed: 0, dispatches: [], buffers: [], phase: 'idle' };
  const doc = new EventTarget(); doc.visibilityState = 'visible';
  const page = new EventTarget(), lost = deferred(), entered = deferred();
  const device = Object.assign(new EventTarget(), {
    lost: lost.promise,
    destroy() { stats.destroyed++; options.destroy?.(); },
    createShaderModule(desc) { stats.shader = desc.code; return { async getCompilationInfo() { return { messages: options.compileError ? [{ type: 'error', message: 'fixture failure' }] : [] }; } }; },
    createBindGroupLayout: desc => desc, createPipelineLayout: desc => desc,
    async createComputePipelineAsync(desc) { if (options.pipelineGate) { entered.resolve(); await options.pipelineGate; } return { entryPoint: desc.compute.entryPoint }; },
    createBuffer(desc) {
      const buffer = { size: desc.size, usage: desc.usage, bytes: new ArrayBuffer(desc.size > 4096 ? 0 : desc.size), destroyed: false, mapped: false,
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
          const params = new DataView(command.group.entries[0].resource.buffer.bytes), output = new DataView(command.group.entries[1].resource.buffer.bytes), header = Buffer.alloc(80);
          for (let i = 0; i < 20; i++) header.writeUInt32BE(params.getUint32(i * 4, true), i * 4);
          const nonce = header.readUInt32LE(76), count = params.getUint32(80, true);
          const target = Array.from({ length: 8 }, (_, i) => params.getUint32(84 + i * 4, true).toString(16).padStart(8, '0')).join('');
          const entry = { type: command.pipeline.entryPoint, phase: stats.phase, nonce, count, target, groups: command.groups, prefix: header.subarray(0, 76).toString('hex') };
          stats.dispatches.push(entry);
          if (entry.type === 'self_test') {
            header.writeUInt32LE(nonce + count, 76);
            const digest = nativeHash(header);
            for (let i = 0; i < 8; i++) output.setUint32(4 + i * 4, digest.readUInt32BE(i * 4), true);
            if (options.badSelfTest?.(entry)) output.setUint32(4, output.getUint32(4, true) ^ 1, true);
          } else {
            assert.equal(entry.type, 'search');
            const candidate = stats.phase === 'self-testing' ? (BigInt('0x' + targetFor(nativeHash(header))) <= BigInt('0x' + target) ? 0 : NONE) : options.candidate?.(entry) ?? NONE;
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
  const run = (args = {}) => mineScryptGpu({ header: HEADER, target: LOW, startNonce: 0, maxCandidates: 1, ...args,
    onProgress: event => { stats.phase = event.phase; args.onProgress?.(event); } }, environment);
  const work = () => stats.dispatches.filter(row => row.phase === 'searching');
  const clean = () => { assert.equal(stats.destroyed, 1); assert.ok(stats.buffers.every(buffer => buffer.destroyed)); };
  return { stats, doc, page, device, lost, entered, environment, run, work, clean };
}

test('nonce encoding preserves the 76-byte header prefix and uses unsigned little endian', () => {
  const original = HEADER.slice();
  for (const nonce of [0, 1, 255, 256, 65535, 65536, 0x7fffffff, 0x80000000, MAX_NONCE]) {
    const bytes = encodeScryptHeaderNonce(HEADER, nonce);
    assert.equal(bytes.length, 80); assert.notEqual(bytes, HEADER);
    assert.deepEqual(bytes.subarray(0, 76), HEADER.subarray(0, 76));
    assert.equal(new DataView(bytes.buffer).getUint32(76, true), nonce);
  }
  assert.deepEqual(HEADER, original);
  const pooled = Buffer.from(HEADER), pooledOriginal = Buffer.from(pooled), encoded = encodeScryptHeaderNonce(pooled, 257);
  assert.deepEqual(pooled, pooledOriginal); assert.equal(new DataView(encoded.buffer).getUint32(76, true), 257);
  assert.deepEqual(encoded.subarray(0, 76), HEADER.subarray(0, 76));
  for (const nonce of [-1, '0', 1n, 1.5, MAX_NONCE + 1, Infinity, null]) assert.throws(() => encodeScryptHeaderNonce(HEADER, nonce));
  for (const header of [new Uint8Array(79), new Uint8Array(81), Array(80).fill(0)]) assert.throws(() => encodeScryptHeaderNonce(header, 0));
});

test('single-header reference matches independent OpenSSL Scrypt and two fixed golden hashes', async () => {
  assert.equal(DVC_SCRYPT_ALGORITHM, 'scrypt');
  assert.equal(await hashScryptHeader(new Uint8Array(80)), '161d0876f3b93b1048cda1bdeaa7332ee210f7131b42013cb43913a6553a4b69');
  assert.equal(await hashScryptHeader(encodeScryptHeaderNonce(HEADER, 65536)), '4778a8ceeea3b11105aaa864cc6843bea6cbf2b5620b07aa3ff3983a4e20d9cf');
  for (const bytes of [HEADER, new Uint8Array(80).fill(255), Uint8Array.from({ length: 80 }, (_, i) => (i * 167 + 31) & 255)]) {
    for (const nonce of [0, 255, 256, 0x80000000, MAX_NONCE]) {
      const header = encodeScryptHeaderNonce(bytes, nonce);
      assert.equal(await hashScryptHeader(header), nativeHash(header).toString('hex'));
    }
  }
});

test('single-header verification snapshots input, yields, and can be aborted', async () => {
  const header = Buffer.from(HEADER), expected = nativeHash(header).toString('hex');
  const pending = hashScryptHeader(header); header.fill(0); assert.equal(await pending, expected);
  const controller = new AbortController(); let yielded = false;
  const aborted = hashScryptHeader(HEADER, { signal: controller.signal });
  setTimeout(() => { yielded = true; controller.abort(); }, 0);
  await assert.rejects(aborted, { name: 'AbortError' }); assert.equal(yielded, true);
  await assert.rejects(hashScryptHeader(new Uint8Array(79)), /80-byte/);
  await assert.rejects(hashScryptHeader(HEADER, { signal: {} }), /cancellation/);
});

test('consensus comparison reverses raw digest bytes and compares every one of 256 bits inclusively', () => {
  for (const header of [new Uint8Array(80), HEADER, new Uint8Array(80).fill(255)]) {
    const digest = nativeHash(header), target = targetFor(digest);
    assert.equal(scryptHashMeetsTarget(digest.toString('hex'), target), true);
    assert.equal(scryptHashMeetsTarget(digest.toString('hex'), below(target)), false);
  }
  assert.equal(scryptHashMeetsTarget('01' + '00'.repeat(31), LOW), true);
  assert.equal(scryptHashMeetsTarget('00'.repeat(31) + '01', LOW), false);
  assert.equal(scryptHashMeetsTarget(HIGH, HIGH), true);
  for (const target of ['0'.repeat(64), 'F'.repeat(64), '0x' + HIGH, 'z'.repeat(64), HIGH.slice(1)]) assert.throws(() => scryptHashMeetsTarget(HIGH, target));
  for (const digest of ['F'.repeat(64), HIGH.slice(1), null]) assert.throws(() => scryptHashMeetsTarget(digest, HIGH));
});

test('malformed inputs and oversized budgets fail before accessing any GPU', async () => {
  const f = fixture();
  for (const args of [{ header: new Uint8Array(79) }, { target: '0'.repeat(64) }, { target: 'F'.repeat(64) }, { target: HIGH.slice(1) },
    { maxSeconds: 0 }, { maxSeconds: 60.001 }, { maxSeconds: Infinity }, { maxSeconds: '60' },
    { maxCandidates: 0 }, { maxCandidates: 1048577 }, { maxCandidates: 1.5 }, { intensity: 'fast' }, { intensity: 'constructor' },
    { startNonce: '0' }, { startNonce: MAX_NONCE + 1 }, { signal: {} }, { isVisible: false }]) await assert.rejects(f.run(args));
  await assert.rejects(mineScryptGpu({ header: HEADER, target: HIGH, onProgress: null }, f.environment));
  assert.equal(f.stats.adapters, 0);
});

test('unavailable, software fallback and unconfirmed adapters cannot start work', async () => {
  await assert.rejects(mineScryptGpu({ header: HEADER, target: LOW }, { gpu: null }), /WebGPU is unavailable.*No CPU miner/);
  const missing = fixture({ noAdapter: true }); await assert.rejects(missing.run(), /No WebGPU adapter/);
  for (const options of [{ fallback: true }, { legacyFallback: true }, { unknownFallback: true }]) { const f = fixture(options); await assert.rejects(f.run(), /hardware WebGPU adapter/); assert.equal(f.stats.devices, 0); }
  const legacy = fixture({ legacyFallback: false }); assert.equal((await legacy.run()).status, 'exhausted'); legacy.clean();
});

test('startup verifies zero header, nonce byte carry, exact target equality and one-less rejection', async () => {
  const f = fixture(), result = await f.run();
  assert.equal(result.status, 'exhausted'); assert.equal(result.attempts, 1); assert.equal(result.nextNonce, 1);
  const self = f.stats.dispatches.filter(row => row.phase === 'self-testing'); assert.equal(self.length, 4);
  assert.deepEqual(self.filter(row => row.type === 'self_test').map(row => [row.nonce, row.count]), [[0, 0], [65535, 1]]);
  const bounds = self.filter(row => row.type === 'search'); assert.equal(BigInt('0x' + bounds[0].target) - BigInt('0x' + bounds[1].target), 1n);
  assert.equal(bounds[0].target, '694b3a55a61339b43c01421b13f710e22e33a7eabda1cd48103bb9f376081d16'); f.clean();
});

test('shader compilation, either known hash and full-target self-test failures prevent searching', async () => {
  for (const options of [{ compileError: true }, { badSelfTest: e => e.nonce === 0 }, { badSelfTest: e => e.nonce === 65535 }, { badTargetTest: true }]) {
    const f = fixture(options); await assert.rejects(f.run(), /compile|self-test failed/); assert.equal(f.work().length, 0); f.clean();
  }
});

test('hardware candidates are independently verified and use a snapshot of the header', async () => {
  const candidateHeader = encodeScryptHeaderNonce(HEADER, 10), expected = nativeHash(candidateHeader);
  const f = fixture({ candidate: () => 3 }), header = HEADER.slice();
  const result = await f.run({ header, startNonce: 7, target: targetFor(expected), maxCandidates: 5,
    onProgress: ({ phase }) => { if (phase === 'preparing') header.fill(255); } });
  assert.equal(result.status, 'found'); assert.equal(result.nonce, 10); assert.equal(result.hash, expected.toString('hex'));
  assert.deepEqual(result.header, candidateHeader); assert.equal(result.attempts, 5); assert.equal(result.nextNonce, 12);
  assert.equal(result.algorithm, 'scrypt'); assert.equal(result.backend, 'webgpu'); assert.ok(result.elapsedMs >= 0);
  assert.equal(f.work()[0].prefix, Buffer.from(HEADER.subarray(0, 76)).toString('hex')); f.clean();
});

test('a one-bit target miss and an out-of-range candidate cannot become valid work', async () => {
  const digest = nativeHash(encodeScryptHeaderNonce(HEADER, 0));
  const badHash = fixture({ candidate: () => 0 }); await assert.rejects(badHash.run({ target: below(targetFor(digest)) }), /independent Scrypt digest/); badHash.clean();
  const badIndex = fixture({ candidate: () => 1 }); await assert.rejects(badIndex.run({ target: HIGH, maxCandidates: 1 }), /out-of-range/); badIndex.clean();
});

test('Eco and Balanced bound scratch memory, nonce batches and paced scheduling', async () => {
  for (const [intensity, batch, minimumPause] of [['eco', 64, 90], ['balanced', 128, 30]]) {
    const f = fixture(), started = performance.now(), result = await f.run({ intensity, maxCandidates: batch + 5 });
    assert.equal(result.status, 'exhausted'); assert.equal(result.attempts, batch + 5); assert.equal(result.nextNonce, batch + 5);
    assert.deepEqual(f.work().map(row => [row.nonce, row.count, row.groups]), [[0, batch, batch / 64], [batch, 5, 1]]);
    assert.equal(f.stats.buffers.find(buffer => buffer.size > 4096).size, batch * 128 * 1024);
    assert.ok(performance.now() - started >= minimumPause);
    assert.equal(f.stats.preference.forceFallbackAdapter, false); assert.equal(f.stats.preference.powerPreference, intensity === 'eco' ? 'low-power' : 'high-performance'); f.clean();
  }
});

test('default nonce comes from header and the final uint32 nonce is searched once without wrapping', async () => {
  const original = fixture(), expectedNonce = new DataView(HEADER.buffer).getUint32(76, true);
  const fromHeader = await original.run({ startNonce: undefined }); assert.equal(original.work()[0].nonce, expectedNonce); assert.equal(fromHeader.nextNonce, expectedNonce + 1); original.clean();
  for (const found of [false, true]) {
    const f = fixture({ candidate: () => found ? 0 : NONE }); const result = await f.run({ startNonce: MAX_NONCE, maxCandidates: 4000, target: found ? HIGH : LOW });
    assert.equal(result.status, found ? 'found' : 'exhausted'); assert.equal(result.attempts, 1); assert.equal(result.nextNonce, null);
    assert.equal(f.work()[0].nonce, MAX_NONCE); assert.equal(f.work()[0].count, 1); f.clean();
  }
});

test('already aborted or hidden rounds remain inert', async () => {
  const f = fixture(), controller = new AbortController(); controller.abort();
  for (const args of [{ signal: controller.signal }, { isVisible: () => false }]) {
    const result = await f.run({ startNonce: 9, ...args }); assert.equal(result.status, 'stopped'); assert.equal(result.attempts, 0); assert.equal(result.nextNonce, 9); assert.equal(result.nonce, null); assert.equal(result.hash, null);
  }
  f.doc.visibilityState = 'hidden'; assert.equal((await f.run()).status, 'stopped'); assert.equal(f.stats.adapters, 0);
});

test('Stop interrupts adapter discovery; late devices are destroyed without launching work', async () => {
  for (const kind of ['adapter', 'device']) {
    const gate = deferred(), f = fixture({ [kind + 'Gate']: gate.promise }), controller = new AbortController();
    const pending = f.run({ signal: controller.signal }); await f.entered.promise; controller.abort(); assert.equal((await pending).status, 'stopped');
    gate.resolve(); await turn(); assert.equal(f.stats.dispatches.length, 0);
    if (kind === 'adapter') assert.equal(f.stats.devices, 0); else f.clean();
  }
});

test('hidden during compilation, page exit and caller lock predicates cancel pending results', async () => {
  const gate = deferred(), compiling = fixture({ pipelineGate: gate.promise }); const pending = compiling.run(); await compiling.entered.promise;
  compiling.doc.visibilityState = 'hidden'; compiling.doc.dispatchEvent(new Event('visibilitychange'));
  compiling.doc.visibilityState = 'visible'; compiling.doc.dispatchEvent(new Event('visibilitychange'));
  assert.equal((await pending).status, 'stopped'); gate.resolve(); await turn(); assert.equal(compiling.work().length, 0); compiling.clean();
  const readGate = deferred(), leaving = fixture({ candidate: () => 0, map: async (stats, entered) => { if (stats.phase === 'searching') { entered.resolve(); await readGate.promise; } } });
  const late = leaving.run({ target: HIGH }); await leaving.entered.promise; leaving.page.dispatchEvent(new Event('pagehide'));
  const result = await late; assert.equal(result.status, 'stopped'); assert.equal(result.nonce, null); assert.equal(result.attempts, 0); readGate.resolve(); await turn(); leaving.clean();
  let visible = true; const locked = fixture({ candidate: () => 0, map: async stats => { if (stats.phase === 'searching') visible = false; } });
  assert.equal((await locked.run({ target: HIGH, isVisible: () => visible })).status, 'stopped'); locked.clean();
});

test('Stop during independent verification rejects a valid late CPU result', async t => {
  const gate = deferred(), entered = deferred(), controller = new AbortController(), nativeDerive = crypto.subtle.deriveBits.bind(crypto.subtle);
  const f = fixture({ candidate: () => 0 });
  t.mock.method(crypto.subtle, 'deriveBits', async (...args) => { if (f.stats.phase === 'searching') { entered.resolve(); await gate.promise; } return nativeDerive(...args); });
  const pending = f.run({ target: HIGH, signal: controller.signal }); await entered.promise; controller.abort();
  const result = await pending; assert.equal(result.status, 'stopped'); assert.equal(result.nonce, null); assert.equal(result.hash, null); assert.equal(result.attempts, 1); gate.resolve(); await turn(); f.clean();
});

test('deadline covers discovery, late device acquisition and independent verification', async t => {
  const stalled = fixture({ adapterGate: new Promise(() => {}) }), timed = await stalled.run({ maxSeconds: .02 });
  assert.equal(timed.status, 'exhausted'); assert.equal(timed.attempts, 0); assert.equal(stalled.stats.devices, 0);
  let clock = 0; const lateDevice = fixture({ now: () => clock, beforeDevice: () => { clock = 1000; } });
  assert.equal((await lateDevice.run({ maxSeconds: 1 })).status, 'exhausted'); assert.equal(lateDevice.stats.dispatches.length, 0); lateDevice.clean();
  clock = 0; const f = fixture({ candidate: () => 0, now: () => clock }), nativeDerive = crypto.subtle.deriveBits.bind(crypto.subtle);
  t.mock.method(crypto.subtle, 'deriveBits', async (...args) => { const result = await nativeDerive(...args); if (f.stats.phase === 'searching') clock = 1000; return result; });
  const result = await f.run({ target: HIGH, maxSeconds: 1 }); assert.equal(result.status, 'exhausted'); assert.equal(result.nonce, null); assert.equal(result.attempts, 1); assert.equal(result.elapsedMs, 1000); f.clean();
});

test('device loss and validation errors release every buffer during stuck readback', async () => {
  for (const kind of ['lost', 'validation']) {
    const gate = deferred(), f = fixture({ map: async (stats, entered) => { entered.resolve(); await gate.promise; } });
    const pending = f.run(); await f.entered.promise;
    if (kind === 'lost') f.lost.resolve({ reason: 'unknown', message: 'fixture device' }); else f.device.dispatchEvent(new Event('uncapturederror'));
    await assert.rejects(pending, /GPU device was lost|GPU work failed/); gate.resolve(); await turn(); f.clean();
  }
});

test('readback rejection caused by Stop remains stopped and listeners cannot restart work', async () => {
  const gate = deferred(), controller = new AbortController(), f = fixture({ map: async (stats, entered) => { entered.resolve(); await gate.promise; }, destroy: () => gate.reject(Error('Destroyed buffer')) });
  const pending = f.run({ signal: controller.signal }); await f.entered.promise; controller.abort(); assert.equal((await pending).status, 'stopped');
  f.doc.visibilityState = 'hidden'; f.doc.dispatchEvent(new Event('visibilitychange')); f.page.dispatchEvent(new Event('pagehide')); f.device.dispatchEvent(new Event('uncapturederror')); f.clean();
});
