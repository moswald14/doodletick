import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { DOODLEVERSE_GPU_LIMITS, encodeDoodleverseWork, meetsDoodleverseTarget, mineDoodleverseGpu } from '../public/doodleverse-gpu.mjs';

const PREFIX = Uint8Array.from({ length: 32 }, (_, i) => i);
const KNOWN_NONCE = '5559', KNOWN_HASH = '00004062061d99e4df2fd4123b18167566925f222214f696d45463e496957485';
const MAX_NONCE = (1n << 256n) - 1n;
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };
const turn = () => new Promise(resolve => setImmediate(resolve));

// This fixture models WebGPU scheduling/buffers, not WGSL execution. Independent
// Node SHA-256 supplies self-test readback and known candidate fixtures. Actual
// shader/driver correctness still requires the browser's two startup self-tests.
function fixture(options = {}) {
  const stats = { adapterRequests: 0, deviceRequests: 0, destroyed: 0, dispatches: [], buffers: [] };
  const doc = new EventTarget(); doc.visibilityState = 'visible';
  const page = new EventTarget(), lost = deferred(), entered = deferred();
  const device = Object.assign(new EventTarget(), {
    lost: lost.promise,
    destroy() { stats.destroyed++; options.destroy?.(); },
    createShaderModule(desc) { stats.shader = desc.code; return { async getCompilationInfo() { return { messages: options.compileError ? [{ type: 'error' }] : [] }; } }; },
    createBindGroupLayout: desc => desc,
    createPipelineLayout: desc => desc,
    async createComputePipelineAsync(desc) { if (options.pipelineGate) { entered.resolve(); await options.pipelineGate; } return { entryPoint: desc.compute.entryPoint }; },
    createBuffer(desc) {
      const buffer = { bytes: new ArrayBuffer(desc.size), destroyed: false, mapped: false,
        destroy() { this.destroyed = true; },
        async mapAsync() { if (options.map) await options.map(stats, entered); this.mapped = true; },
        getMappedRange() { assert(this.mapped); return this.bytes; }, unmap() { this.mapped = false; },
      };
      stats.buffers.push(buffer); return buffer;
    },
    createBindGroup: desc => desc,
    createCommandEncoder() {
      const command = {};
      return {
        beginComputePass() { return {
          setPipeline(pipeline) { command.pipeline = pipeline; },
          setBindGroup(index, group) { assert.equal(index, 0); command.group = group; },
          dispatchWorkgroups(groups) { command.groups = groups; }, end() {},
        }; },
        copyBufferToBuffer(source, sourceOffset, target, targetOffset, size) { command.copy = { source, sourceOffset, target, targetOffset, size }; },
        finish: () => command,
      };
    },
    queue: {
      writeBuffer(buffer, offset, input) {
        const bytes = ArrayBuffer.isView(input) ? new Uint8Array(input.buffer, input.byteOffset, input.byteLength) : new Uint8Array(input);
        new Uint8Array(buffer.bytes).set(bytes, offset);
      },
      submit(commands) {
        for (const command of commands) {
          const params = new DataView(command.group.entries[0].resource.buffer.bytes);
          const output = new DataView(command.group.entries[1].resource.buffer.bytes);
          const message = Buffer.alloc(64);
          for (let i = 0; i < 16; i++) message.writeUInt32BE(params.getUint32(i * 4, true), i * 4);
          const nonce = BigInt('0x' + message.subarray(32).toString('hex')), count = params.getUint32(64, true);
          const entry = { type: command.pipeline.entryPoint, groups: command.groups, nonce, count, difficulty: params.getUint32(68, true), prefix: message.subarray(0, 32).toString('hex') };
          stats.dispatches.push(entry); stats.current = entry;
          if (entry.type === 'self_test') {
            Buffer.from((nonce + BigInt(count)).toString(16).padStart(64, '0'), 'hex').copy(message, 32);
            const digest = createHash('sha256').update(message).digest();
            for (let i = 0; i < 8; i++) output.setUint32(4 + i * 4, digest.readUInt32BE(i * 4), true);
            if (options.badSelfTest) output.setUint32(4, 0, true);
          } else {
            assert.equal(entry.type, 'search');
            const candidate = options.candidate?.(entry) ?? 0xffffffff;
            output.setUint32(0, candidate, true);
          }
          const c = command.copy;
          new Uint8Array(c.target.bytes, c.targetOffset, c.size).set(new Uint8Array(c.source.bytes, c.sourceOffset, c.size));
          options.submitted?.(entry, stats);
        }
      },
    },
  });
  const adapter = {
    info: { isFallbackAdapter: options.fallback ?? false },
    async requestDevice() { stats.deviceRequests++; if (options.deviceGate) { entered.resolve(); await options.deviceGate; } options.beforeDevice?.(); return device; },
  };
  if (options.legacyFallback !== undefined) { delete adapter.info; adapter.isFallbackAdapter = options.legacyFallback; }
  if (options.unknownFallback) delete adapter.info;
  const gpu = { async requestAdapter(request) {
    stats.adapterRequests++; assert.equal(request.forceFallbackAdapter, false);
    if (options.adapterGate) { entered.resolve(); await options.adapterGate; }
    return options.noAdapter ? null : adapter;
  } };
  const environment = { gpu, document: doc, page, ...(options.now ? { now: options.now } : {}) };
  const run = args => mineDoodleverseGpu({ prefix: PREFIX, difficultyBits: 16, maxCandidates: 1, ...args }, environment);
  function clean() { assert(stats.destroyed > 0); assert(stats.buffers.every(buffer => buffer.destroyed)); }
  return { stats, doc, page, device, lost, entered, environment, run, clean };
}

test('work encoding is exactly prefix32 plus big-endian unsigned nonce32', () => {
  for (const nonce of [0n, 1n, 1n << 32n, 1n << 224n, MAX_NONCE]) {
    const bytes = encodeDoodleverseWork(PREFIX, nonce.toString());
    assert.equal(bytes.length, 64);
    assert.equal(Buffer.from(bytes.subarray(0, 32)).toString('hex'), Buffer.from(PREFIX).toString('hex'));
    assert.equal(Buffer.from(bytes.subarray(32)).toString('hex'), nonce.toString(16).padStart(64, '0'));
  }
  const ascii = encodeDoodleverseWork(new Uint8Array(32).fill(0x61), BigInt('0x' + '61'.repeat(32)).toString());
  assert.equal(createHash('sha256').update(ascii).digest('hex'), 'ffe054fe7ae0cb6dc65c3af9b61d5209f439851db43d0ba5997337df154668eb');
  assert.equal(createHash('sha256').update(encodeDoodleverseWork(PREFIX, KNOWN_NONCE)).digest('hex'), KNOWN_HASH);
  for (const nonce of [-1, '01', '-1', '1.0', ' 1', 1, '', (MAX_NONCE + 1n).toString()]) assert.throws(() => encodeDoodleverseWork(PREFIX, nonce));
  assert.throws(() => encodeDoodleverseWork(new Uint8Array(31), '0'));
});

test('target comparisons include every accepted boundary and exclude the next bit', () => {
  for (let bits = 16; bits <= 24; bits++) {
    const limit = Buffer.from(((1n << BigInt(256 - bits)) - 1n).toString(16).padStart(64, '0'), 'hex');
    assert(meetsDoodleverseTarget(limit, bits));
    const over = Buffer.from((1n << BigInt(256 - bits)).toString(16).padStart(64, '0'), 'hex');
    assert.equal(meetsDoodleverseTarget(over, bits), false);
  }
  assert.equal(meetsDoodleverseTarget(new Uint8Array(31), 16), false);
  for (const bits of [0, 15, 25, 20.5, '20']) assert.throws(() => meetsDoodleverseTarget(new Uint8Array(32), bits));
});

test('invalid difficulty, duration and candidate budgets cannot request an adapter', async () => {
  const f = fixture();
  for (const args of [{ difficultyBits: 15 }, { difficultyBits: 25 }, { maxMs: 0 }, { maxMs: 60001 }, { maxMs: 1.5 },
    { maxCandidates: 0 }, { maxCandidates: 4194305 }, { maxCandidates: Infinity }, { startNonce: '01' }]) await assert.rejects(f.run(args));
  assert.equal(f.stats.adapterRequests, 0);
  assert.equal(DOODLEVERSE_GPU_LIMITS.maxCandidates, 4194304);
});

test('missing, fallback and unidentifiable adapters fail without a CPU mining fallback', async () => {
  await assert.rejects(mineDoodleverseGpu({ prefix: PREFIX }, { gpu: {} }), /WebGPU is unavailable.*no CPU fallback/i);
  const missing = fixture({ noAdapter: true }); await assert.rejects(missing.run(), /No WebGPU adapter/);
  for (const options of [{ fallback: true }, { legacyFallback: true }, { unknownFallback: true }]) {
    const f = fixture(options); await assert.rejects(f.run(), /hardware WebGPU adapter/); assert.equal(f.stats.deviceRequests, 0);
  }
  const legacy = fixture({ legacyFallback: false }); assert((await legacy.run()).exhausted); legacy.clean();
});

test('already hidden or aborted work never asks for a device', async () => {
  const f = fixture(), controller = new AbortController(); controller.abort();
  assert.deepEqual(await f.run({ signal: controller.signal }), { stopped: true, attempts: 0 });
  assert.deepEqual(await f.run({ isVisible: () => false }), { stopped: true, attempts: 0 });
  f.doc.visibilityState = 'hidden'; assert((await f.run()).stopped);
  assert.equal(f.stats.adapterRequests, 0);
});

test('shader compilation and full digest self-test failures stop before proof search', async () => {
  for (const options of [{ compileError: true }, { badSelfTest: true }]) {
    const f = fixture(options);
    await assert.rejects(f.run(), /compile|self-test failed/);
    assert.equal(f.stats.dispatches.filter(entry => entry.type === 'search').length, 0); f.clean();
  }
});

test('a hardware candidate is independently verified and binds the original prefix snapshot', async () => {
  const f = fixture({ candidate: () => 5559 }), prefix = PREFIX.slice();
  const result = await f.run({ prefix, maxCandidates: 8192, onProgress: ({ phase }) => { if (phase === 'preparing') prefix.fill(255); } });
  assert.deepEqual(result, { nonce: KNOWN_NONCE, digest: KNOWN_HASH, attempts: 8192, backend: 'webgpu' });
  assert.deepEqual(f.stats.dispatches.map(entry => entry.type), ['self_test', 'self_test', 'search']);
  assert.equal(f.stats.dispatches[1].nonce, (1n << 224n) - 1n);
  assert.equal(f.stats.dispatches[1].count, 1); f.clean();
});

test('invalid or out-of-range GPU candidates are never exported as proofs', async () => {
  for (const [candidate, pattern] of [[0, /independent SHA-256/], [8192, /out-of-range/]]) {
    const f = fixture({ candidate: () => candidate });
    await assert.rejects(f.run({ maxCandidates: 8192 }), pattern); f.clean();
  }
});

test('work stops at the exact candidate budget, with bounded dispatches and an actual rest', async () => {
  const f = fixture(), start = performance.now();
  assert.deepEqual(await f.run({ maxCandidates: 8197 }), { exhausted: true, attempts: 8197 });
  const search = f.stats.dispatches.filter(entry => entry.type === 'search');
  assert.deepEqual(search.map(entry => [entry.nonce, entry.count, entry.groups]), [[0n, 8192, 128], [8192n, 5, 1]]);
  assert(performance.now() - start >= 35); f.clean();
});

test('the final 256-bit nonce is searched once, without wrapping or repeated work', async () => {
  const f = fixture();
  assert.deepEqual(await f.run({ maxCandidates: 8192, startNonce: MAX_NONCE.toString() }), { exhausted: true, attempts: 1 });
  const search = f.stats.dispatches.filter(entry => entry.type === 'search');
  assert.equal(search.length, 1); assert.equal(search[0].nonce, MAX_NONCE); assert.equal(search[0].count, 1); f.clean();
});

test('Stop returns while adapter discovery is unresolved, and never starts after it resolves', async () => {
  const gate = deferred(), f = fixture({ adapterGate: gate.promise }), controller = new AbortController();
  const result = f.run({ signal: controller.signal }); await f.entered.promise; controller.abort();
  assert.deepEqual(await result, { stopped: true, attempts: 0 });
  gate.resolve(); await turn(); assert.equal(f.stats.deviceRequests, 0);
});

test('a device that arrives after Stop is destroyed and never receives work', async () => {
  const gate = deferred(), f = fixture({ deviceGate: gate.promise }), controller = new AbortController();
  const result = f.run({ signal: controller.signal }); await f.entered.promise; controller.abort();
  assert((await result).stopped); gate.resolve(); await turn();
  assert.equal(f.stats.dispatches.length, 0); f.clean();
});

test('a device arriving on the deadline is also destroyed before assignment', async () => {
  let clock = 0;
  const f = fixture({ now: () => clock, beforeDevice: () => { clock = 1000; } });
  assert((await f.run({ maxMs: 1000 })).exhausted);
  assert.equal(f.stats.dispatches.length, 0); f.clean();
});

test('hide then show during pipeline compilation cannot revive a stopped attempt', async () => {
  const gate = deferred(), f = fixture({ pipelineGate: gate.promise });
  const result = f.run(); await f.entered.promise;
  f.doc.visibilityState = 'hidden'; f.doc.dispatchEvent(new Event('visibilitychange'));
  f.doc.visibilityState = 'visible'; f.doc.dispatchEvent(new Event('visibilitychange'));
  assert((await result).stopped); gate.resolve(); await turn(); assert.equal(f.stats.dispatches.length, 0); f.clean();
});

test('page navigation cancels pending readback and ignores its later success', async () => {
  const gate = deferred(), f = fixture({ map: async (stats, entered) => { if (stats.current.type === 'search') { entered.resolve(); await gate.promise; } }, candidate: () => 5559 });
  const result = f.run({ maxCandidates: 8192 }); await f.entered.promise;
  f.page.dispatchEvent(new Event('pagehide')); assert((await result).stopped);
  gate.resolve(); await turn(); f.clean();
});

test('native readback rejection during device destruction is still a cancelled result', async () => {
  const gate = deferred(), controller = new AbortController();
  const f = fixture({ map: async (stats, entered) => { entered.resolve(); await gate.promise; },
    destroy: () => gate.reject(new DOMException('Buffer destroyed', 'AbortError')) });
  const result = f.run({ signal: controller.signal }); await f.entered.promise; controller.abort();
  assert.deepEqual(await result, { stopped: true, attempts: 0 }); f.clean();
});

test('a custom lock predicate is rechecked after asynchronous GPU readback', async () => {
  let visible = true;
  const f = fixture({ map: async stats => { if (stats.current.type === 'search') visible = false; }, candidate: () => 5559 });
  assert((await f.run({ maxCandidates: 8192, isVisible: () => visible })).stopped); f.clean();
});

test('Stop while independent CPU verification is pending rejects even a valid late result', async t => {
  const gate = deferred(), entered = deferred(), controller = new AbortController(), nativeDigest = crypto.subtle.digest.bind(crypto.subtle);
  let calls = 0;
  t.mock.method(crypto.subtle, 'digest', async (...args) => { if (++calls === 2) { entered.resolve(); await gate.promise; } return nativeDigest(...args); });
  const f = fixture({ candidate: () => 5559 }), result = f.run({ maxCandidates: 8192, signal: controller.signal });
  await entered.promise; controller.abort(); assert.deepEqual(await result, { stopped: true, attempts: 8192 });
  gate.resolve(); await turn(); f.clean();
});

test('a candidate completing verification at the deadline is not accepted', async t => {
  let clock = 0, calls = 0; const nativeDigest = crypto.subtle.digest.bind(crypto.subtle);
  t.mock.method(crypto.subtle, 'digest', async (...args) => { const result = await nativeDigest(...args); if (++calls === 2) clock = 1000; return result; });
  const f = fixture({ candidate: () => 5559, now: () => clock });
  assert.deepEqual(await f.run({ maxCandidates: 8192, maxMs: 1000 }), { exhausted: true, attempts: 8192 }); f.clean();
});

test('the wall-clock limit also ends an unresolved adapter request', async () => {
  const f = fixture({ adapterGate: new Promise(() => {}) });
  assert.deepEqual(await f.run({ maxMs: 10 }), { exhausted: true, attempts: 0 }); assert.equal(f.stats.deviceRequests, 0);
});

test('device loss during pending readback fails clearly and releases every buffer', async () => {
  const gate = deferred(), f = fixture({ map: async (stats, entered) => { if (stats.current.type === 'search') { entered.resolve(); await gate.promise; } } });
  const result = f.run(); await f.entered.promise;
  f.lost.resolve({ reason: 'unknown', message: 'fixture device disconnected' });
  await assert.rejects(result, /GPU device was lost.*disconnected/); gate.resolve(); await turn(); f.clean();
});

test('GPU validation errors cancel the attempt instead of accepting readback', async () => {
  const gate = deferred(), f = fixture({ map: async (stats, entered) => { entered.resolve(); await gate.promise; } });
  const result = f.run(); await f.entered.promise;
  const event = new Event('uncapturederror'); event.error = { message: 'fixture invalid buffer' }; f.device.dispatchEvent(event);
  await assert.rejects(result, /GPU work failed.*invalid buffer/); gate.resolve(); await turn(); f.clean();
});
