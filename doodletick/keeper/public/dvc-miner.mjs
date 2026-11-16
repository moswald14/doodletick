// SPDX-License-Identifier: GPL-3.0-only
// DVC work engine; independent from the immutable founder-proof formats.
// Each attempt is explicit and bounded. Web Crypto verifies, never mines.
export const DVC_MINING_ALGORITHMS = Object.freeze([
  Object.freeze({ id: 'sha256', name: 'SHA-256' }),
  Object.freeze({ id: 'sha256d', name: 'SHA-256d (double SHA-256)' }),
]);
const PROFILES = Object.freeze({
  eco: Object.freeze({ batchSize: 1024, restMs: 80, restFactor: 6, powerPreference: 'low-power' }),
  balanced: Object.freeze({ batchSize: 8192, restMs: 40, restFactor: 3, powerPreference: 'high-performance' }),
  fast: Object.freeze({ batchSize: 32768, restMs: 8, restFactor: .5, powerPreference: 'high-performance' }),
});
const MAX_NONCE = (1n << 256n) - 1n, MAX_MS = 60000, MAX_CANDIDATES = 4194304;
const NONE = 0xffffffff, OUTPUT_BYTES = 36, PARAM_BYTES = 112, WORKGROUP_SIZE = 64;
const USAGE = { MAP_READ: 1, COPY_SRC: 4, COPY_DST: 8, STORAGE: 128 };
const HALT = Symbol('dvc-gpu-attempt-ended');
const hex = bytes => Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
const has = (object, key) => Object.prototype.hasOwnProperty.call(object, key);
function nonceNumber(value) {
  if (typeof value !== 'string' || !/^(0|[1-9][0-9]{0,77})$/.test(value)) throw Error('Nonce must be an unsigned decimal integer.');
  const nonce = BigInt(value); if (nonce > MAX_NONCE) throw Error('Nonce exceeds 256 bits.'); return nonce;
}
function checkPrefix(prefix) { if (!(prefix instanceof Uint8Array) || prefix.length !== 32) throw Error('DVC work needs a 32-byte prefix.'); }
function checkAlgorithm(algorithm) { if (!DVC_MINING_ALGORITHMS.some(row => row.id === algorithm)) throw Error('Choose SHA-256 or SHA-256d.'); }
function checkTarget(target) { if (typeof target !== 'string' || !/^[0-9a-f]{64}$/.test(target) || /^0{64}$/.test(target)) throw Error('DVC work needs a nonzero, lowercase 256-bit hex target.'); }
export function encodeDvcWork(prefix, nonce) {
  checkPrefix(prefix); let value = nonceNumber(nonce);
  const message = new Uint8Array(64); message.set(prefix);
  for (let i = 63; i >= 32; i--) { message[i] = Number(value & 255n); value >>= 8n; }
  return message;
}
export async function digestDvcWork(prefix, nonce, algorithm = 'sha256') {
  checkAlgorithm(algorithm); const message = encodeDvcWork(prefix, nonce);
  if (!globalThis.crypto?.subtle) throw Error('Secure Web Crypto is required to verify DVC work.');
  let digest = await crypto.subtle.digest('SHA-256', message);
  if (algorithm === 'sha256d') digest = await crypto.subtle.digest('SHA-256', digest);
  return hex(new Uint8Array(digest));
}
function parameterBytes(prefix, nonce, count, algorithm, targetHex) {
  const message = encodeDvcWork(prefix, nonce.toString()), input = new DataView(message.buffer);
  const bytes = new ArrayBuffer(PARAM_BYTES), output = new DataView(bytes);
  // SHA words are big-endian; storage-buffer u32 scalars are little-endian.
  for (let i = 0; i < 16; i++) output.setUint32(i * 4, input.getUint32(i * 4, false), true);
  output.setUint32(64, count, true); output.setUint32(68, algorithm === 'sha256d' ? 1 : 0, true);
  for (let i = 0; i < 8; i++) output.setUint32(72 + i * 4, Number.parseInt(targetHex.slice(i * 8, i * 8 + 8), 16), true);
  return bytes;
}
function outputDigest(bytes) {
  const input = new DataView(bytes), digest = new Uint8Array(32), output = new DataView(digest.buffer);
  for (let i = 0; i < 8; i++) output.setUint32(i * 4, input.getUint32(4 + i * 4, true), false);
  return hex(digest);
}

const SHADER = /* wgsl */ `
struct Parameters { words: array<u32, 28>, }
struct Result { candidate: atomic<u32>, digest: array<u32, 8>, }
@group(0) @binding(0) var<storage, read> params: Parameters;
@group(0) @binding(1) var<storage, read_write> result: Result;
const K: array<u32, 64> = array<u32, 64>(
  0x428a2f98u,0x71374491u,0xb5c0fbcfu,0xe9b5dba5u,0x3956c25bu,0x59f111f1u,0x923f82a4u,0xab1c5ed5u,
  0xd807aa98u,0x12835b01u,0x243185beu,0x550c7dc3u,0x72be5d74u,0x80deb1feu,0x9bdc06a7u,0xc19bf174u,
  0xe49b69c1u,0xefbe4786u,0x0fc19dc6u,0x240ca1ccu,0x2de92c6fu,0x4a7484aau,0x5cb0a9dcu,0x76f988dau,
  0x983e5152u,0xa831c66du,0xb00327c8u,0xbf597fc7u,0xc6e00bf3u,0xd5a79147u,0x06ca6351u,0x14292967u,
  0x27b70a85u,0x2e1b2138u,0x4d2c6dfcu,0x53380d13u,0x650a7354u,0x766a0abbu,0x81c2c92eu,0x92722c85u,
  0xa2bfe8a1u,0xa81a664bu,0xc24b8b70u,0xc76c51a3u,0xd192e819u,0xd6990624u,0xf40e3585u,0x106aa070u,
  0x19a4c116u,0x1e376c08u,0x2748774cu,0x34b0bcb5u,0x391c0cb3u,0x4ed8aa4au,0x5b9cca4fu,0x682e6ff3u,
  0x748f82eeu,0x78a5636fu,0x84c87814u,0x8cc70208u,0x90befffau,0xa4506cebu,0xbef9a3f7u,0xc67178f2u
);
const INITIAL: array<u32, 8> = array<u32, 8>(0x6a09e667u,0xbb67ae85u,0x3c6ef372u,0xa54ff53au,
  0x510e527fu,0x9b05688cu,0x1f83d9abu,0x5be0cd19u);
fn rotr(x: u32, n: u32) -> u32 { return (x >> n) | (x << (32u - n)); }
fn compress(input_state: array<u32, 8>, message: array<u32, 16>) -> array<u32, 8> {
  var state = input_state;
  var w: array<u32, 64>;
  for (var i = 0u; i < 16u; i++) { w[i] = message[i]; }
  for (var i = 16u; i < 64u; i++) {
    let x = w[i - 15u]; let y = w[i - 2u];
    let s0 = rotr(x, 7u) ^ rotr(x, 18u) ^ (x >> 3u);
    let s1 = rotr(y, 17u) ^ rotr(y, 19u) ^ (y >> 10u);
    w[i] = w[i - 16u] + s0 + w[i - 7u] + s1;
  }
  var a = state[0]; var b = state[1]; var c = state[2]; var d = state[3];
  var e = state[4]; var f = state[5]; var g = state[6]; var h = state[7];
  for (var i = 0u; i < 64u; i++) {
    let s1 = rotr(e, 6u) ^ rotr(e, 11u) ^ rotr(e, 25u);
    let ch = (e & f) ^ (~e & g);
    let t1 = h + s1 + ch + K[i] + w[i];
    let s0 = rotr(a, 2u) ^ rotr(a, 13u) ^ rotr(a, 22u);
    let maj = (a & b) ^ (a & c) ^ (b & c);
    let t2 = s0 + maj;
    h = g; g = f; f = e; e = d + t1; d = c; c = b; b = a; a = t1 + t2;
  }
  state[0] += a; state[1] += b; state[2] += c; state[3] += d;
  state[4] += e; state[5] += f; state[6] += g; state[7] += h;
  return state;
}
fn work_hash(offset: u32) -> array<u32, 8> {
  var message: array<u32, 16>;
  for (var i = 0u; i < 16u; i++) { message[i] = params.words[i]; }
  var carry = offset;
  for (var i = 15i; i >= 8i; i--) {
    let old = message[i]; message[i] = old + carry;
    carry = select(0u, 1u, message[i] < old);
  }
  var padding: array<u32, 16>;
  padding[0] = 0x80000000u; padding[15] = 512u;
  var digest = compress(compress(INITIAL, message), padding);
  if (params.words[17] == 1u) {
    var second: array<u32, 16>;
    for (var i = 0u; i < 8u; i++) { second[i] = digest[i]; }
    second[8] = 0x80000000u; second[15] = 256u;
    digest = compress(INITIAL, second);
  }
  return digest;
}
fn meets_target(digest: array<u32, 8>) -> bool {
  for (var i = 0u; i < 8u; i++) {
    if (digest[i] < params.words[18u + i]) { return true; }
    if (digest[i] > params.words[18u + i]) { return false; }
  }
  return true;
}
@compute @workgroup_size(64)
fn search(@builtin(global_invocation_id) id: vec3<u32>) {
  if (id.x >= params.words[16]) { return; }
  if (meets_target(work_hash(id.x))) { atomicMin(&result.candidate, id.x); }
}
@compute @workgroup_size(1)
fn self_test() {
  let digest = work_hash(params.words[16]);
  for (var i = 0u; i < 8u; i++) { result.digest[i] = digest[i]; }
}
`;

/** A new hardware attempt; imports and construction never launch work.
 * environment is a GPU/clock/event seam for tests, not a CPU mining backend.
 * Already-submitted bounded GPU work may finish after Stop; no late result is
 * accepted. nextNonce denotes the end of fully returned batches (null at 2^256).
 */
export async function mineDvcGpu({ prefix, targetHex, algorithm = 'sha256', startNonce = '0', signal,
  isVisible = () => true, onProgress = () => {}, maxMs = MAX_MS, maxCandidates = MAX_CANDIDATES,
  intensity = 'balanced' } = {}, environment = {}) {
  checkPrefix(prefix); checkTarget(targetHex); checkAlgorithm(algorithm);
  if (!Number.isSafeInteger(maxMs) || maxMs < 1 || maxMs > MAX_MS) throw Error('A DVC GPU attempt must last at most 60 seconds.');
  if (!Number.isSafeInteger(maxCandidates) || maxCandidates < 1 || maxCandidates > MAX_CANDIDATES) throw Error('A DVC GPU attempt may search at most 4,194,304 candidates.');
  if (typeof intensity !== 'string' || !has(PROFILES, intensity)) throw Error('Choose eco, balanced or fast GPU intensity.');
  if (typeof isVisible !== 'function' || typeof onProgress !== 'function') throw Error('Invalid DVC mining callbacks.');
  if (signal !== undefined && !(signal instanceof AbortSignal)) throw Error('Invalid DVC cancellation signal.');
  let nextNonce = nonceNumber(startNonce);
  const fixedPrefix = prefix.slice(), profile = PROFILES[intensity];
  const gpu = has(environment, 'gpu') ? environment.gpu : globalThis.navigator?.gpu;
  const doc = has(environment, 'document') ? environment.document : globalThis.document;
  const page = has(environment, 'page') ? environment.page : globalThis.window;
  const now = environment.now ?? (() => performance.now()), startedAt = now(), deadline = startedAt + maxMs;
  let attempts = 0, device, closed = false, ending, timer, restTimer, resolveEnd;
  const end = new Promise(resolve => { resolveEnd = resolve; }), buffers = [], destroyed = new WeakSet();
  const destroy = value => { if (!value || destroyed.has(value)) return; destroyed.add(value); try { value.destroy(); } catch {} };
  const result = (status, nonce = null, digest = null) => ({ status, nonce, digest, attempts, elapsedMs: Math.max(0, now() - startedAt), nextNonce: nextNonce <= MAX_NONCE ? nextNonce.toString() : null, algorithm, backend: 'webgpu' });
  function finish(reason) { if (ending || closed) return; ending = reason; destroy(device); resolveEnd(HALT); }
  function checkpoint() {
    if (!ending && (signal?.aborted || doc?.visibilityState === 'hidden' || !isVisible())) finish('stopped');
    if (!ending && now() >= deadline) finish('exhausted');
    if (ending) throw HALT;
  }
  async function active(promise, lateCleanup) {
    const pending = Promise.resolve(promise).then(value => { if ((closed || ending) && lateCleanup) lateCleanup(value); return value; });
    let value;
    try { value = await Promise.race([pending, end]); } catch (error) { checkpoint(); throw error; }
    try { checkpoint(); } catch (error) { if (value !== HALT && lateCleanup) lateCleanup(value); throw error; }
    if (value === HALT) throw HALT; return value;
  }
  const stop = () => finish('stopped');
  const visibility = () => { if (doc?.visibilityState === 'hidden') stop(); };
  const gpuError = () => finish(Error('DVC GPU work failed a device validation check. No result was accepted.'));
  const progress = phase => { onProgress({ phase, attempts, elapsedMs: Math.max(0, now() - startedAt), nextNonce: nextNonce <= MAX_NONCE ? nextNonce.toString() : null, algorithm, intensity, backend: 'webgpu' }); checkpoint(); };
  try {
    checkpoint();
    if (!gpu?.requestAdapter) throw Error('WebGPU is unavailable. No CPU miner was started.');
    if (!globalThis.crypto?.subtle) throw Error('Secure Web Crypto is required to verify DVC GPU results.');
    signal?.addEventListener('abort', stop, { once: true }); doc?.addEventListener('visibilitychange', visibility); page?.addEventListener('pagehide', stop);
    timer = setTimeout(() => finish('exhausted'), maxMs);
    progress('preparing');
    const adapter = await active(gpu.requestAdapter({ powerPreference: profile.powerPreference, forceFallbackAdapter: false }));
    if (!adapter) throw Error('No WebGPU adapter is available. No CPU miner was started.');
    if ((adapter.info?.isFallbackAdapter ?? adapter.isFallbackAdapter) !== false) throw Error('A hardware WebGPU adapter could not be confirmed. Software fallback mining is disabled.');
    device = await active(adapter.requestDevice(), destroy);
    device.addEventListener('uncapturederror', gpuError);
    device.lost.then(() => { if (!closed && !ending) finish(Error('The DVC GPU device was lost. Restart mining to try again.')); }, () => finish(Error('The DVC GPU device was lost. Restart mining to try again.')));
    const shader = device.createShaderModule({ label: 'DVC SHA-256 / SHA-256d', code: SHADER });
    const compilation = await active(shader.getCompilationInfo());
    if (compilation.messages.some(message => message.type === 'error')) throw Error('The DVC GPU shader could not compile. No CPU miner was started.');
    const layout = device.createBindGroupLayout({ entries: [
      { binding: 0, visibility: 4, buffer: { type: 'read-only-storage' } }, { binding: 1, visibility: 4, buffer: { type: 'storage' } },
    ] });
    const pipelineLayout = device.createPipelineLayout({ bindGroupLayouts: [layout] });
    const testPipeline = await active(device.createComputePipelineAsync({ layout: pipelineLayout, compute: { module: shader, entryPoint: 'self_test' } }));
    const searchPipeline = await active(device.createComputePipelineAsync({ layout: pipelineLayout, compute: { module: shader, entryPoint: 'search' } }));
    const allocate = (size, usage) => { const buffer = device.createBuffer({ size, usage }); buffers.push(buffer); return buffer; };
    const params = allocate(PARAM_BYTES, USAGE.STORAGE | USAGE.COPY_DST);
    const output = allocate(OUTPUT_BYTES, USAGE.STORAGE | USAGE.COPY_SRC | USAGE.COPY_DST);
    const readback = allocate(OUTPUT_BYTES, USAGE.MAP_READ | USAGE.COPY_DST);
    const group = device.createBindGroup({ layout, entries: [{ binding: 0, resource: { buffer: params } }, { binding: 1, resource: { buffer: output } }] });
    async function dispatch(pipeline, input, groups) {
      checkpoint(); const reset = new Uint32Array(OUTPUT_BYTES / 4); reset[0] = NONE;
      device.queue.writeBuffer(params, 0, input); device.queue.writeBuffer(output, 0, reset);
      const encoder = device.createCommandEncoder(), pass = encoder.beginComputePass();
      pass.setPipeline(pipeline); pass.setBindGroup(0, group); pass.dispatchWorkgroups(groups); pass.end();
      encoder.copyBufferToBuffer(output, 0, readback, 0, OUTPUT_BYTES);
      checkpoint(); device.queue.submit([encoder.finish()]); await active(readback.mapAsync(1));
      try { return readback.getMappedRange().slice(0); } finally { readback.unmap(); }
    }
    progress('self-testing');
    const ascii = { prefix: new Uint8Array(32).fill(0x61), nonce: BigInt('0x' + '61'.repeat(32)), offset: 0,
      sha256: 'ffe054fe7ae0cb6dc65c3af9b61d5209f439851db43d0ba5997337df154668eb', sha256d: '64d28424725a6f219efb17d6f8e4036719bf9e1a8ec2388c22cfb5fc412d46bc' };
    const carry = { prefix: Uint8Array.from({ length: 32 }, (_, i) => i), nonce: (1n << 224n) - 1n, offset: 1 };
    for (const { id } of DVC_MINING_ALGORITHMS) {
      for (const vector of [ascii, carry]) {
        const expected = vector[id] || await active(digestDvcWork(vector.prefix, (vector.nonce + BigInt(vector.offset)).toString(), id));
        const actual = outputDigest(await dispatch(testPipeline, parameterBytes(vector.prefix, vector.nonce, vector.offset, id, targetHex), 1));
        if (actual !== expected) throw Error(`GPU ${id} self-test failed. No result was accepted.`);
      }
      // Exact equality must pass; one less must fail in the final digest word.
      // This tests all 256 target bits, rather than a leading-zero shortcut.
      for (const [target, expectedIndex] of [[ascii[id], 0], [(BigInt('0x' + ascii[id]) - 1n).toString(16).padStart(64, '0'), NONE]]) {
        const actual = new DataView(await dispatch(searchPipeline, parameterBytes(ascii.prefix, ascii.nonce, 1, id, target), 1)).getUint32(0, true);
        if (actual !== expectedIndex) throw Error(`GPU ${id} target self-test failed. No result was accepted.`);
      }
    }
    progress('searching');
    while (attempts < maxCandidates && nextNonce <= MAX_NONCE) {
      checkpoint();
      const count = Number([BigInt(profile.batchSize), BigInt(maxCandidates - attempts), MAX_NONCE - nextNonce + 1n].reduce((a, b) => a < b ? a : b));
      const batchStarted = now(), base = nextNonce;
      const bytes = await dispatch(searchPipeline, parameterBytes(fixedPrefix, base, count, algorithm, targetHex), Math.ceil(count / WORKGROUP_SIZE));
      attempts += count; nextNonce += BigInt(count);
      const candidate = new DataView(bytes).getUint32(0, true);
      if (candidate !== NONE) {
        if (candidate >= count) throw Error('GPU returned an out-of-range DVC candidate.');
        const nonce = (base + BigInt(candidate)).toString(), digest = await active(digestDvcWork(fixedPrefix, nonce, algorithm));
        if (digest > targetHex) throw Error('GPU candidate failed independent DVC digest verification. No result was accepted.');
        checkpoint(); return result('found', nonce, digest);
      }
      progress('searching');
      if (attempts >= maxCandidates || nextNonce > MAX_NONCE) break;
      const restMs = Math.min(deadline - now(), Math.max(profile.restMs, (now() - batchStarted) * profile.restFactor));
      try { await active(new Promise(resolve => { restTimer = setTimeout(resolve, restMs); })); } finally { clearTimeout(restTimer); }
    }
    checkpoint(); return result('exhausted');
  } catch (error) {
    if (error === HALT) { if (ending instanceof Error) throw ending; return result(ending === 'stopped' ? 'stopped' : 'exhausted'); }
    throw error;
  } finally {
    closed = true; clearTimeout(timer); clearTimeout(restTimer);
    signal?.removeEventListener('abort', stop); doc?.removeEventListener('visibilitychange', visibility); page?.removeEventListener('pagehide', stop);
    device?.removeEventListener('uncapturederror', gpuError); for (const buffer of buffers) destroy(buffer); destroy(device);
  }
}
