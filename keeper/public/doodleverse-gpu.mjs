// Explicit, bounded WebGPU work for a proposed founder proof. A valid hash does
// not establish the GPU model, hardware provenance, coin issuance or adoption.
// Algorithm: FIPS 180-4 SHA-256(prefix32 || unsigned big-endian nonce32).
export const DOODLEVERSE_GPU_LIMITS = Object.freeze({
  minDifficulty: 16, maxDifficulty: 24, maxMs: 60000,
  maxCandidates: 4194304, batchSize: 8192, restMs: 40, workgroupSize: 64,
});
const MAX_NONCE = (1n << 256n) - 1n;
const NONE = 0xffffffff, OUTPUT_BYTES = 36, PARAM_BYTES = 80;
const USAGE = { MAP_READ: 1, COPY_SRC: 4, COPY_DST: 8, STORAGE: 128 };
const HALT = Symbol('doodleverse-work-stopped');

function nonceNumber(value) {
  if (typeof value !== 'string' || !/^(0|[1-9][0-9]{0,77})$/.test(value)) throw Error('Nonce must be an unsigned decimal integer.');
  const nonce = BigInt(value);
  if (nonce > MAX_NONCE) throw Error('Nonce exceeds 256 bits.');
  return nonce;
}
function checkPrefix(prefix) {
  if (!(prefix instanceof Uint8Array) || prefix.length !== 32) throw Error('The work prefix must contain exactly 32 bytes.');
}
function checkDifficulty(bits) {
  if (!Number.isInteger(bits) || bits < 16 || bits > 24) throw Error('Work difficulty must be between 16 and 24 bits.');
}
export function encodeDoodleverseWork(prefix, nonce) {
  checkPrefix(prefix);
  const bytes = new Uint8Array(64); bytes.set(prefix);
  let value = nonceNumber(nonce);
  for (let i = 63; i >= 32; i--) { bytes[i] = Number(value & 255n); value >>= 8n; }
  return bytes;
}
export function meetsDoodleverseTarget(digest, difficultyBits) {
  checkDifficulty(difficultyBits);
  if (!(digest instanceof Uint8Array) || digest.length !== 32) return false;
  const wholeBytes = difficultyBits >> 3, rest = difficultyBits & 7;
  for (let i = 0; i < wholeBytes; i++) if (digest[i] !== 0) return false;
  return rest === 0 || (digest[wholeBytes] >> (8 - rest)) === 0;
}
function parameterBytes(prefix, nonce, count, difficultyBits) {
  const message = encodeDoodleverseWork(prefix, nonce.toString());
  const view = new DataView(message.buffer), bytes = new ArrayBuffer(PARAM_BYTES), out = new DataView(bytes);
  // WebGPU buffer scalars are little-endian; SHA-256 message words are big-endian.
  for (let i = 0; i < 16; i++) out.setUint32(i * 4, view.getUint32(i * 4, false), true);
  out.setUint32(64, count, true); out.setUint32(68, difficultyBits, true);
  return bytes;
}
const hex = bytes => Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');

// Each invocation processes two SHA-256 blocks: the exact 64-byte message, then
// 0x80, zero padding, and its 512-bit length. Only the smallest successful index
// is shared. No digest/index pair can be torn by simultaneous successful lanes.
export const DOODLEVERSE_SHA256_WGSL = /* wgsl */ `
struct Parameters { words: array<u32, 20>, }
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
fn rotr(x: u32, n: u32) -> u32 { return (x >> n) | (x << (32u - n)); }
fn sha256_work(offset: u32) -> array<u32, 8> {
  var message: array<u32, 16>;
  for (var i = 0u; i < 16u; i++) { message[i] = params.words[i]; }
  var carry = offset;
  for (var i = 15i; i >= 8i; i--) {
    let old = message[i];
    message[i] = old + carry;
    carry = select(0u, 1u, message[i] < old);
  }
  var state = array<u32, 8>(0x6a09e667u,0xbb67ae85u,0x3c6ef372u,0xa54ff53au,
    0x510e527fu,0x9b05688cu,0x1f83d9abu,0x5be0cd19u);
  for (var block = 0u; block < 2u; block++) {
    var w: array<u32, 64>;
    if (block == 0u) {
      for (var i = 0u; i < 16u; i++) { w[i] = message[i]; }
    } else { w[0] = 0x80000000u; w[15] = 512u; }
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
  }
  return state;
}
@compute @workgroup_size(64)
fn search(@builtin(global_invocation_id) id: vec3<u32>) {
  if (id.x >= params.words[16]) { return; }
  let digest = sha256_work(id.x);
  if ((digest[0] >> (32u - params.words[17])) == 0u) { atomicMin(&result.candidate, id.x); }
}
@compute @workgroup_size(1)
fn self_test() {
  let digest = sha256_work(params.words[16]);
  for (var i = 0u; i < 8u; i++) { result.digest[i] = digest[i]; }
}
`;

/** One user-started attempt. Importing this module does no work. The optional
 * second argument is a test seam for WebGPU and the clock, never a CPU miner.
 * Stop destroys this attempt's device; an already submitted bounded dispatch
 * may finish in the driver, but its result can no longer be accepted.
 */
export async function mineDoodleverseGpu({ prefix, difficultyBits = 20, signal,
  isVisible = () => true, onProgress = () => {}, maxMs = DOODLEVERSE_GPU_LIMITS.maxMs,
  maxCandidates = DOODLEVERSE_GPU_LIMITS.maxCandidates, startNonce = '0' } = {}, environment = {}) {
  checkPrefix(prefix); checkDifficulty(difficultyBits);
  if (!Number.isSafeInteger(maxMs) || maxMs < 1 || maxMs > DOODLEVERSE_GPU_LIMITS.maxMs) throw Error('A GPU attempt must last at most 60 seconds.');
  if (!Number.isSafeInteger(maxCandidates) || maxCandidates < 1 || maxCandidates > DOODLEVERSE_GPU_LIMITS.maxCandidates) throw Error('A GPU attempt may search at most 4,194,304 candidates.');
  if (typeof isVisible !== 'function' || typeof onProgress !== 'function') throw Error('Invalid work callbacks.');
  let nextNonce = nonceNumber(startNonce);
  const fixedPrefix = prefix.slice(), gpu = environment.gpu ?? globalThis.navigator?.gpu;
  const doc = environment.document ?? globalThis.document, page = environment.page ?? globalThis.window;
  const now = environment.now ?? (() => performance.now()), deadline = now() + maxMs;
  let attempts = 0, device, closed = false, ending, timer, restTimer, resolveEnd;
  const end = new Promise(resolve => { resolveEnd = resolve; }), buffers = [];
  const destroy = value => { try { value?.destroy(); } catch {} };
  function finish(reason) {
    if (ending || closed) return;
    ending = reason; destroy(device); resolveEnd(HALT);
  }
  function checkpoint() {
    if (!ending && (signal?.aborted || doc?.visibilityState === 'hidden' || !isVisible())) finish('stopped');
    if (!ending && now() >= deadline) finish('exhausted');
    if (ending) throw HALT;
  }
  async function active(promise, lateCleanup) {
    const pending = Promise.resolve(promise).then(value => {
      if ((closed || ending) && lateCleanup) lateCleanup(value);
      return value;
    });
    let value;
    try { value = await Promise.race([pending, end]); }
    catch (error) { checkpoint(); throw error; }
    try { checkpoint(); } catch (error) { if (value !== HALT && lateCleanup) lateCleanup(value); throw error; }
    if (value === HALT) throw HALT;
    return value;
  }
  const stop = () => finish('stopped');
  const visibility = () => { if (doc?.visibilityState === 'hidden') stop(); };
  const gpuError = event => finish(Error(`GPU work failed: ${event.error?.message || 'device validation error'}`));
  try {
    checkpoint();
    if (!gpu?.requestAdapter) throw Error('WebGPU is unavailable here. Use a supported secure browser; no CPU fallback was started.');
    if (!globalThis.crypto?.subtle) throw Error('Secure Web Crypto is required to verify GPU results.');
    signal?.addEventListener('abort', stop, { once: true });
    doc?.addEventListener('visibilitychange', visibility);
    page?.addEventListener('pagehide', stop);
    timer = setTimeout(() => finish('exhausted'), maxMs);
    onProgress({ attempts, backend: 'webgpu', phase: 'preparing' }); checkpoint();
    const adapter = await active(gpu.requestAdapter({ powerPreference: 'high-performance', forceFallbackAdapter: false }));
    if (!adapter) throw Error('No WebGPU adapter is available. No CPU fallback was started.');
    const fallback = adapter.info?.isFallbackAdapter ?? adapter.isFallbackAdapter;
    if (fallback !== false) throw Error('A hardware WebGPU adapter could not be confirmed. Software fallback mining is disabled.');
    device = await active(adapter.requestDevice(), destroy);
    device.addEventListener('uncapturederror', gpuError);
    device.lost.then(info => { if (!closed && !ending) finish(Error(`GPU device was lost: ${info.message || info.reason || 'unknown reason'}`)); }, error => finish(error));
    const shader = device.createShaderModule({ label: 'Doodleverse SHA-256', code: DOODLEVERSE_SHA256_WGSL });
    const messages = await active(shader.getCompilationInfo());
    if (messages.messages.some(message => message.type === 'error')) throw Error('This browser could not compile the SHA-256 GPU shader.');
    const layout = device.createBindGroupLayout({ entries: [
      { binding: 0, visibility: 4, buffer: { type: 'read-only-storage' } },
      { binding: 1, visibility: 4, buffer: { type: 'storage' } },
    ] });
    const pipelineLayout = device.createPipelineLayout({ bindGroupLayouts: [layout] });
    const testPipeline = await active(device.createComputePipelineAsync({ layout: pipelineLayout, compute: { module: shader, entryPoint: 'self_test' } }));
    const searchPipeline = await active(device.createComputePipelineAsync({ layout: pipelineLayout, compute: { module: shader, entryPoint: 'search' } }));
    const allocate = (size, usage) => { const buffer = device.createBuffer({ size, usage }); buffers.push(buffer); return buffer; };
    const params = allocate(PARAM_BYTES, USAGE.STORAGE | USAGE.COPY_DST);
    const output = allocate(OUTPUT_BYTES, USAGE.STORAGE | USAGE.COPY_SRC | USAGE.COPY_DST);
    const readback = allocate(OUTPUT_BYTES, USAGE.MAP_READ | USAGE.COPY_DST);
    const group = device.createBindGroup({ layout, entries: [
      { binding: 0, resource: { buffer: params } }, { binding: 1, resource: { buffer: output } },
    ] });
    async function dispatch(pipeline, input, groups) {
      checkpoint();
      const reset = new Uint32Array(OUTPUT_BYTES / 4); reset[0] = NONE;
      device.queue.writeBuffer(params, 0, input); device.queue.writeBuffer(output, 0, reset);
      const encoder = device.createCommandEncoder(), pass = encoder.beginComputePass();
      pass.setPipeline(pipeline); pass.setBindGroup(0, group); pass.dispatchWorkgroups(groups); pass.end();
      encoder.copyBufferToBuffer(output, 0, readback, 0, OUTPUT_BYTES);
      checkpoint(); device.queue.submit([encoder.finish()]);
      await active(readback.mapAsync(1));
      try { return readback.getMappedRange().slice(0); } finally { readback.unmap(); }
    }
    // A known 64-byte ASCII vector and carry through seven nonce limbs test
    // byte order, arithmetic and both SHA-256 blocks on the selected device.
    const vectors = [
      { prefix: new Uint8Array(32).fill(0x61), nonce: BigInt('0x' + '61'.repeat(32)), offset: 0,
        expected: 'ffe054fe7ae0cb6dc65c3af9b61d5209f439851db43d0ba5997337df154668eb' },
      { prefix: Uint8Array.from({ length: 32 }, (_, i) => i), nonce: (1n << 224n) - 1n, offset: 1 },
    ];
    for (const vector of vectors) {
      const expected = vector.expected || hex(new Uint8Array(await active(crypto.subtle.digest('SHA-256', encodeDoodleverseWork(vector.prefix, (vector.nonce + BigInt(vector.offset)).toString())))));
      const testOutput = new DataView(await dispatch(testPipeline, parameterBytes(vector.prefix, vector.nonce, vector.offset, difficultyBits), 1));
      const actual = new Uint8Array(32), actualView = new DataView(actual.buffer);
      for (let i = 0; i < 8; i++) actualView.setUint32(i * 4, testOutput.getUint32(4 + i * 4, true), false);
      if (expected !== hex(actual)) throw Error('GPU SHA-256 self-test failed. No proof was accepted.');
    }
    checkpoint(); onProgress({ attempts, backend: 'webgpu', phase: 'searching' });
    while (attempts < maxCandidates && nextNonce <= MAX_NONCE) {
      checkpoint();
      const count = Number([BigInt(DOODLEVERSE_GPU_LIMITS.batchSize), BigInt(maxCandidates - attempts), MAX_NONCE - nextNonce + 1n].reduce((a, b) => a < b ? a : b));
      const started = now();
      const outputBytes = await dispatch(searchPipeline, parameterBytes(fixedPrefix, nextNonce, count, difficultyBits), Math.ceil(count / DOODLEVERSE_GPU_LIMITS.workgroupSize));
      attempts += count;
      const candidate = new DataView(outputBytes).getUint32(0, true);
      if (candidate !== NONE) {
        if (candidate >= count) throw Error('GPU returned an out-of-range proof candidate.');
        const nonce = (nextNonce + BigInt(candidate)).toString();
        const digest = new Uint8Array(await active(crypto.subtle.digest('SHA-256', encodeDoodleverseWork(fixedPrefix, nonce))));
        if (!meetsDoodleverseTarget(digest, difficultyBits)) throw Error('GPU candidate failed independent SHA-256 verification. No proof was accepted.');
        checkpoint();
        return { nonce, digest: hex(digest), attempts, backend: 'webgpu' };
      }
      nextNonce += BigInt(count);
      onProgress({ attempts, backend: 'webgpu', phase: 'searching' }); checkpoint();
      if (attempts >= maxCandidates || nextNonce > MAX_NONCE) break;
      // Rest at least 40 ms and at least three times the preceding dispatch's
      // elapsed time. This bounds scheduling, not measured GPU utilization.
      const restMs = Math.min(deadline - now(), Math.max(DOODLEVERSE_GPU_LIMITS.restMs, (now() - started) * 3));
      try { await active(new Promise(resolve => { restTimer = setTimeout(resolve, restMs); })); }
      finally { clearTimeout(restTimer); }
    }
    return { exhausted: true, attempts };
  } catch (error) {
    if (error === HALT) {
      if (ending instanceof Error) throw ending;
      return { [ending === 'stopped' ? 'stopped' : 'exhausted']: true, attempts };
    }
    throw error;
  } finally {
    closed = true; clearTimeout(timer); clearTimeout(restTimer);
    signal?.removeEventListener('abort', stop); doc?.removeEventListener('visibilitychange', visibility); page?.removeEventListener('pagehide', stop);
    device?.removeEventListener('uncapturederror', gpuError);
    for (const buffer of buffers) destroy(buffer);
    destroy(device);
  }
}
