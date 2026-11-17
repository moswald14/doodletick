// SPDX-License-Identifier: GPL-3.0-only
// Litecoin/Pepecoin proof of work: scrypt(header80, header80, N=1024, r=1,
// p=1, dkLen=32). Algorithm steps follow RFC 7914 sections 3-6.
// This module never starts on import and has no network, wallet or CPU-mining path.
export const DVC_SCRYPT_ALGORITHM = 'scrypt';
const PROFILES = Object.freeze({
  eco: Object.freeze({ batchSize: 64, restMs: 100, restFactor: 4, powerPreference: 'low-power' }),
  balanced: Object.freeze({ batchSize: 128, restMs: 40, restFactor: 1, powerPreference: 'high-performance' }),
});
const MAX_NONCE = 0xffffffff, MAX_SECONDS = 60, MAX_CANDIDATES = 1048576;
const NONE = 0xffffffff, OUTPUT_BYTES = 36, PARAM_BYTES = 116, WORKGROUP_SIZE = 64;
const SCRATCH_BYTES_PER_NONCE = 1024 * 128;
const USAGE = { MAP_READ: 1, COPY_SRC: 4, COPY_DST: 8, STORAGE: 128 };
const HALT = Symbol('scrypt-gpu-round-ended');
const hex = bytes => Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
const reverseHex = value => value.match(/../g).reverse().join('');
const has = (object, key) => Object.prototype.hasOwnProperty.call(object, key);
function checkHeader(header) { if (!(header instanceof Uint8Array) || header.length !== 80) throw Error('Scrypt work needs an 80-byte block header.'); }
function checkNonce(nonce) { if (!Number.isSafeInteger(nonce) || nonce < 0 || nonce > MAX_NONCE) throw Error('Scrypt nonce must be an unsigned 32-bit integer.'); return nonce; }
function checkTarget(target) { if (typeof target !== 'string' || !/^[0-9a-f]{64}$/.test(target) || /^0{64}$/.test(target)) throw Error('Scrypt work needs a nonzero, lowercase 256-bit hex target.'); }

/** Copies the header; only its last four bytes, the little-endian nonce, change. */
export function encodeScryptHeaderNonce(header, nonce) {
  checkHeader(header); checkNonce(nonce);
  const copy = new Uint8Array(header); new DataView(copy.buffer).setUint32(76, nonce, true); return copy;
}

/** target is the usual big-endian numeric hex. hash is raw Scrypt output bytes,
 * whose consensus uint256 value is little-endian, not the displayed block hash. */
export function scryptHashMeetsTarget(hash, target) {
  checkTarget(target);
  if (typeof hash !== 'string' || !/^[0-9a-f]{64}$/.test(hash)) throw Error('Invalid Scrypt digest.');
  return BigInt('0x' + reverseHex(hash)) <= BigInt('0x' + target);
}

const rotl = (x, n) => (x << n) | (x >>> (32 - n));
function salsa208(block, x) {
  x.set(block);
  for (let round = 0; round < 4; round++) {
    x[4] ^= rotl((x[0] + x[12]) >>> 0, 7); x[8] ^= rotl((x[4] + x[0]) >>> 0, 9);
    x[12] ^= rotl((x[8] + x[4]) >>> 0, 13); x[0] ^= rotl((x[12] + x[8]) >>> 0, 18);
    x[9] ^= rotl((x[5] + x[1]) >>> 0, 7); x[13] ^= rotl((x[9] + x[5]) >>> 0, 9);
    x[1] ^= rotl((x[13] + x[9]) >>> 0, 13); x[5] ^= rotl((x[1] + x[13]) >>> 0, 18);
    x[14] ^= rotl((x[10] + x[6]) >>> 0, 7); x[2] ^= rotl((x[14] + x[10]) >>> 0, 9);
    x[6] ^= rotl((x[2] + x[14]) >>> 0, 13); x[10] ^= rotl((x[6] + x[2]) >>> 0, 18);
    x[3] ^= rotl((x[15] + x[11]) >>> 0, 7); x[7] ^= rotl((x[3] + x[15]) >>> 0, 9);
    x[11] ^= rotl((x[7] + x[3]) >>> 0, 13); x[15] ^= rotl((x[11] + x[7]) >>> 0, 18);
    x[1] ^= rotl((x[0] + x[3]) >>> 0, 7); x[2] ^= rotl((x[1] + x[0]) >>> 0, 9);
    x[3] ^= rotl((x[2] + x[1]) >>> 0, 13); x[0] ^= rotl((x[3] + x[2]) >>> 0, 18);
    x[6] ^= rotl((x[5] + x[4]) >>> 0, 7); x[7] ^= rotl((x[6] + x[5]) >>> 0, 9);
    x[4] ^= rotl((x[7] + x[6]) >>> 0, 13); x[5] ^= rotl((x[4] + x[7]) >>> 0, 18);
    x[11] ^= rotl((x[10] + x[9]) >>> 0, 7); x[8] ^= rotl((x[11] + x[10]) >>> 0, 9);
    x[9] ^= rotl((x[8] + x[11]) >>> 0, 13); x[10] ^= rotl((x[9] + x[8]) >>> 0, 18);
    x[12] ^= rotl((x[15] + x[14]) >>> 0, 7); x[13] ^= rotl((x[12] + x[15]) >>> 0, 9);
    x[14] ^= rotl((x[13] + x[12]) >>> 0, 13); x[15] ^= rotl((x[14] + x[13]) >>> 0, 18);
  }
  for (let i = 0; i < 16; i++) block[i] = (block[i] + x[i]) >>> 0;
}
function blockMix(x, block, salsaWork) {
  for (let i = 0; i < 16; i++) block[i] = x[i + 16] ^ x[i];
  salsa208(block, salsaWork); x.set(block);
  for (let i = 0; i < 16; i++) block[i] ^= x[i + 16];
  salsa208(block, salsaWork); x.set(block, 16);
}

/** Bounded single-header reference verification, never nonce searching.
 * PBKDF2 uses Web Crypto; ROMix yields every 256 steps so Stop stays responsive.
 * The raw output bytes are returned as hex, without display-hash reversal. */
export async function hashScryptHeader(header, { signal } = {}) {
  checkHeader(header);
  if (signal !== undefined && !(signal instanceof AbortSignal)) throw Error('Invalid Scrypt cancellation signal.');
  if (!globalThis.crypto?.subtle) throw Error('Secure Web Crypto is required to verify Scrypt work.');
  const check = () => { if (signal?.aborted) throw signal.reason ?? new DOMException('Scrypt verification stopped.', 'AbortError'); };
  check(); const fixed = new Uint8Array(header), subtle = globalThis.crypto.subtle;
  const key = await subtle.importKey('raw', fixed, 'PBKDF2', false, ['deriveBits']); check();
  const initial = await subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: fixed, iterations: 1 }, key, 1024); check();
  const x = new Uint32Array(32), input = new DataView(initial), v = new Uint32Array(1024 * 32);
  const block = new Uint32Array(16), salsaWork = new Uint32Array(16);
  for (let i = 0; i < 32; i++) x[i] = input.getUint32(i * 4, true);
  for (let phase = 0; phase < 2; phase++) {
    for (let i = 0; i < 1024; i++) {
      if (phase === 0) v.set(x, i * 32);
      else { const at = (x[16] & 1023) * 32; for (let word = 0; word < 32; word++) x[word] ^= v[at + word]; }
      blockMix(x, block, salsaWork);
      if ((i & 255) === 255) { await new Promise(resolve => setTimeout(resolve, 0)); check(); }
    }
  }
  const mixed = new Uint8Array(128), output = new DataView(mixed.buffer);
  for (let i = 0; i < 32; i++) output.setUint32(i * 4, x[i], true);
  const digest = await subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: mixed, iterations: 1 }, key, 256); check();
  return hex(new Uint8Array(digest));
}

function parameterBytes(header, nonce, countOrOffset, target) {
  const input = new DataView(encodeScryptHeaderNonce(header, nonce).buffer);
  const bytes = new ArrayBuffer(PARAM_BYTES), output = new DataView(bytes);
  for (let i = 0; i < 20; i++) output.setUint32(i * 4, input.getUint32(i * 4, false), true);
  output.setUint32(80, countOrOffset, true);
  for (let i = 0; i < 8; i++) output.setUint32(84 + i * 4, Number.parseInt(target.slice(i * 8, i * 8 + 8), 16), true);
  return bytes;
}
function outputDigest(bytes) {
  const input = new DataView(bytes), digest = new Uint8Array(32), output = new DataView(digest.buffer);
  for (let i = 0; i < 8; i++) output.setUint32(i * 4, input.getUint32(4 + i * 4, true), false);
  return hex(digest);
}

const SHADER = /* wgsl */ `
struct Parameters { words: array<u32, 29>, }
struct Result { candidate: atomic<u32>, digest: array<u32, 8>, }
struct HmacStates { inner: array<u32, 8>, outer: array<u32, 8>, }
@group(0) @binding(0) var<storage, read> params: Parameters;
@group(0) @binding(1) var<storage, read_write> result: Result;
@group(0) @binding(2) var<storage, read_write> scratch: array<u32>;
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
fn rotl(x: u32, n: u32) -> u32 { return (x << n) | (x >> (32u - n)); }
fn swap(x: u32) -> u32 { return (x >> 24u) | ((x >> 8u) & 0x0000ff00u) | ((x << 8u) & 0x00ff0000u) | (x << 24u); }
fn compress(state: array<u32, 8>, message: array<u32, 16>) -> array<u32, 8> {
  var w: array<u32, 64>;
  for (var i = 0u; i < 16u; i++) { w[i] = message[i]; }
  for (var i = 16u; i < 64u; i++) {
    let x = w[i - 15u]; let y = w[i - 2u];
    w[i] = w[i - 16u] + (rotr(x, 7u) ^ rotr(x, 18u) ^ (x >> 3u)) + w[i - 7u] + (rotr(y, 17u) ^ rotr(y, 19u) ^ (y >> 10u));
  }
  var a = state[0]; var b = state[1]; var c = state[2]; var d = state[3];
  var e = state[4]; var f = state[5]; var g = state[6]; var h = state[7];
  for (var i = 0u; i < 64u; i++) {
    let t1 = h + (rotr(e, 6u) ^ rotr(e, 11u) ^ rotr(e, 25u)) + ((e & f) ^ (~e & g)) + K[i] + w[i];
    let t2 = (rotr(a, 2u) ^ rotr(a, 13u) ^ rotr(a, 22u)) + ((a & b) ^ (a & c) ^ (b & c));
    h = g; g = f; f = e; e = d + t1; d = c; c = b; b = a; a = t1 + t2;
  }
  return array<u32, 8>(state[0] + a, state[1] + b, state[2] + c, state[3] + d,
    state[4] + e, state[5] + f, state[6] + g, state[7] + h);
}
fn hmac_states(header: array<u32, 20>) -> HmacStates {
  var first: array<u32, 16>;
  for (var i = 0u; i < 16u; i++) { first[i] = header[i]; }
  var tail: array<u32, 16>;
  for (var i = 0u; i < 4u; i++) { tail[i] = header[16u + i]; }
  tail[4] = 0x80000000u; tail[15] = 640u;
  // An 80-byte HMAC key exceeds SHA-256's 64-byte block, so hash it first.
  let key = compress(compress(INITIAL, first), tail);
  var inner: array<u32, 16>; var outer: array<u32, 16>;
  for (var i = 0u; i < 16u; i++) { inner[i] = 0x36363636u; outer[i] = 0x5c5c5c5cu; }
  for (var i = 0u; i < 8u; i++) { inner[i] ^= key[i]; outer[i] ^= key[i]; }
  return HmacStates(compress(INITIAL, inner), compress(INITIAL, outer));
}
fn hmac_finish(inner_digest: array<u32, 8>, outer: array<u32, 8>) -> array<u32, 8> {
  var tail: array<u32, 16>;
  for (var i = 0u; i < 8u; i++) { tail[i] = inner_digest[i]; }
  tail[8] = 0x80000000u; tail[15] = 768u;
  return compress(outer, tail);
}
fn initial_pbkdf(header: array<u32, 20>, states: HmacStates) -> array<u32, 32> {
  var first: array<u32, 16>;
  for (var i = 0u; i < 16u; i++) { first[i] = header[i]; }
  let prefix = compress(states.inner, first);
  var tail: array<u32, 16>;
  for (var i = 0u; i < 4u; i++) { tail[i] = header[16u + i]; }
  tail[5] = 0x80000000u; tail[15] = 1184u;
  var output: array<u32, 32>;
  for (var block = 0u; block < 4u; block++) {
    tail[4] = block + 1u;
    let digest = hmac_finish(compress(prefix, tail), states.outer);
    for (var i = 0u; i < 8u; i++) { output[block * 8u + i] = swap(digest[i]); }
  }
  return output;
}
fn salsa208(input: array<u32, 16>) -> array<u32, 16> {
  var x = input;
  for (var round = 0u; round < 4u; round++) {
    x[4] ^= rotl(x[0] + x[12], 7u); x[8] ^= rotl(x[4] + x[0], 9u);
    x[12] ^= rotl(x[8] + x[4], 13u); x[0] ^= rotl(x[12] + x[8], 18u);
    x[9] ^= rotl(x[5] + x[1], 7u); x[13] ^= rotl(x[9] + x[5], 9u);
    x[1] ^= rotl(x[13] + x[9], 13u); x[5] ^= rotl(x[1] + x[13], 18u);
    x[14] ^= rotl(x[10] + x[6], 7u); x[2] ^= rotl(x[14] + x[10], 9u);
    x[6] ^= rotl(x[2] + x[14], 13u); x[10] ^= rotl(x[6] + x[2], 18u);
    x[3] ^= rotl(x[15] + x[11], 7u); x[7] ^= rotl(x[3] + x[15], 9u);
    x[11] ^= rotl(x[7] + x[3], 13u); x[15] ^= rotl(x[11] + x[7], 18u);
    x[1] ^= rotl(x[0] + x[3], 7u); x[2] ^= rotl(x[1] + x[0], 9u);
    x[3] ^= rotl(x[2] + x[1], 13u); x[0] ^= rotl(x[3] + x[2], 18u);
    x[6] ^= rotl(x[5] + x[4], 7u); x[7] ^= rotl(x[6] + x[5], 9u);
    x[4] ^= rotl(x[7] + x[6], 13u); x[5] ^= rotl(x[4] + x[7], 18u);
    x[11] ^= rotl(x[10] + x[9], 7u); x[8] ^= rotl(x[11] + x[10], 9u);
    x[9] ^= rotl(x[8] + x[11], 13u); x[10] ^= rotl(x[9] + x[8], 18u);
    x[12] ^= rotl(x[15] + x[14], 7u); x[13] ^= rotl(x[12] + x[15], 9u);
    x[14] ^= rotl(x[13] + x[12], 13u); x[15] ^= rotl(x[14] + x[13], 18u);
  }
  for (var i = 0u; i < 16u; i++) { x[i] += input[i]; }
  return x;
}
fn block_mix(input: array<u32, 32>) -> array<u32, 32> {
  var t: array<u32, 16>; var output: array<u32, 32>;
  for (var i = 0u; i < 16u; i++) { t[i] = input[16u + i] ^ input[i]; }
  t = salsa208(t);
  for (var i = 0u; i < 16u; i++) { output[i] = t[i]; t[i] ^= input[16u + i]; }
  t = salsa208(t);
  for (var i = 0u; i < 16u; i++) { output[16u + i] = t[i]; }
  return output;
}
fn final_pbkdf(mixed: array<u32, 32>, states: HmacStates) -> array<u32, 8> {
  var first: array<u32, 16>; var second: array<u32, 16>; var tail: array<u32, 16>;
  for (var i = 0u; i < 16u; i++) { first[i] = swap(mixed[i]); second[i] = swap(mixed[16u + i]); }
  tail[0] = 1u; tail[1] = 0x80000000u; tail[15] = 1568u;
  return hmac_finish(compress(compress(compress(states.inner, first), second), tail), states.outer);
}
fn work_hash(offset: u32, lane: u32) -> array<u32, 8> {
  var header: array<u32, 20>;
  for (var i = 0u; i < 20u; i++) { header[i] = params.words[i]; }
  header[19] = swap(swap(header[19]) + offset);
  let states = hmac_states(header); var x = initial_pbkdf(header, states);
  let base = lane * 32768u;
  for (var i = 0u; i < 1024u; i++) {
    for (var word = 0u; word < 32u; word++) { scratch[base + i * 32u + word] = x[word]; }
    x = block_mix(x);
  }
  for (var i = 0u; i < 1024u; i++) {
    let at = base + (x[16] & 1023u) * 32u;
    for (var word = 0u; word < 32u; word++) { x[word] ^= scratch[at + word]; }
    x = block_mix(x);
  }
  return final_pbkdf(x, states);
}
fn meets_target(digest: array<u32, 8>) -> bool {
  for (var i = 0u; i < 8u; i++) {
    let limb = swap(digest[7u - i]);
    if (limb < params.words[21u + i]) { return true; }
    if (limb > params.words[21u + i]) { return false; }
  }
  return true;
}
@compute @workgroup_size(64)
fn search(@builtin(global_invocation_id) id: vec3<u32>) {
  if (id.x >= params.words[20]) { return; }
  if (meets_target(work_hash(id.x, id.x))) { atomicMin(&result.candidate, id.x); }
}
@compute @workgroup_size(1)
fn self_test() {
  let digest = work_hash(params.words[20], 0u);
  for (var i = 0u; i < 8u; i++) { result.digest[i] = digest[i]; }
}
`;

/** Explicit hardware-only round. The caller owns any opt-in repeated rounds.
 * Header nonce defaults to the supplied header's uint32 at byte 76. A round is
 * bounded to 60 wall-clock seconds including preparation and verification.
 * Already submitted work can finish after Stop, but its result is never accepted.
 * environment is a lifecycle test seam, not a CPU mining implementation. */
export async function mineScryptGpu({ header, target, startNonce, signal,
  isVisible = () => true, onProgress = () => {}, maxSeconds = MAX_SECONDS,
  maxCandidates = MAX_CANDIDATES, intensity = 'balanced' } = {}, environment = {}) {
  checkHeader(header); checkTarget(target);
  if (typeof maxSeconds !== 'number' || !Number.isFinite(maxSeconds) || maxSeconds <= 0 || maxSeconds > MAX_SECONDS) throw Error('A Scrypt GPU round must last at most 60 seconds.');
  if (!Number.isSafeInteger(maxCandidates) || maxCandidates < 1 || maxCandidates > MAX_CANDIDATES) throw Error('A Scrypt GPU round may search at most 1,048,576 candidates.');
  if (typeof intensity !== 'string' || !has(PROFILES, intensity)) throw Error('Choose eco or balanced Scrypt GPU intensity.');
  if (typeof isVisible !== 'function' || typeof onProgress !== 'function') throw Error('Invalid Scrypt mining callbacks.');
  if (signal !== undefined && !(signal instanceof AbortSignal)) throw Error('Invalid Scrypt cancellation signal.');
  const fixedHeader = new Uint8Array(header), profile = PROFILES[intensity];
  let nextNonce = checkNonce(startNonce ?? new DataView(fixedHeader.buffer).getUint32(76, true));
  const gpu = has(environment, 'gpu') ? environment.gpu : globalThis.navigator?.gpu;
  const doc = has(environment, 'document') ? environment.document : globalThis.document;
  const page = has(environment, 'page') ? environment.page : globalThis.window;
  const now = environment.now ?? (() => performance.now()), startedAt = now(), deadline = startedAt + maxSeconds * 1000;
  let attempts = 0, device, closed = false, ending, timer, restTimer, resolveEnd;
  const end = new Promise(resolve => { resolveEnd = resolve; }), buffers = [], destroyed = new WeakSet();
  const verifier = new AbortController();
  const destroy = value => { if (!value || destroyed.has(value)) return; destroyed.add(value); try { value.destroy(); } catch {} };
  const result = (status, nonce = null, candidateHeader = null, hash = null) => ({ status, nonce, header: candidateHeader, hash, attempts,
    elapsedMs: Math.max(0, now() - startedAt), nextNonce: nextNonce <= MAX_NONCE ? nextNonce : null, algorithm: DVC_SCRYPT_ALGORITHM, backend: 'webgpu' });
  function finish(reason) { if (ending || closed) return; ending = reason; verifier.abort(); destroy(device); resolveEnd(HALT); }
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
  const gpuError = () => finish(Error('Scrypt GPU work failed a device validation check. No result was accepted.'));
  const progress = phase => { onProgress({ phase, attempts, elapsedMs: Math.max(0, now() - startedAt), nextNonce: nextNonce <= MAX_NONCE ? nextNonce : null,
    algorithm: DVC_SCRYPT_ALGORITHM, intensity, backend: 'webgpu' }); checkpoint(); };
  try {
    checkpoint();
    if (!gpu?.requestAdapter) throw Error('WebGPU is unavailable. No CPU miner was started.');
    if (!globalThis.crypto?.subtle) throw Error('Secure Web Crypto is required to verify Scrypt GPU results.');
    signal?.addEventListener('abort', stop, { once: true }); doc?.addEventListener('visibilitychange', visibility); page?.addEventListener('pagehide', stop);
    timer = setTimeout(() => finish('exhausted'), maxSeconds * 1000);
    progress('preparing');
    const adapter = await active(gpu.requestAdapter({ powerPreference: profile.powerPreference, forceFallbackAdapter: false }));
    if (!adapter) throw Error('No WebGPU adapter is available. No CPU miner was started.');
    if ((adapter.info?.isFallbackAdapter ?? adapter.isFallbackAdapter) !== false) throw Error('A hardware WebGPU adapter could not be confirmed. Software fallback mining is disabled.');
    device = await active(adapter.requestDevice(), destroy);
    device.addEventListener('uncapturederror', gpuError);
    device.lost.then(() => { if (!closed && !ending) finish(Error('The Scrypt GPU device was lost. Restart mining to try again.')); }, () => finish(Error('The Scrypt GPU device was lost. Restart mining to try again.')));
    const shader = device.createShaderModule({ label: 'DVC Scrypt 1024/1/1', code: SHADER });
    const compilation = await active(shader.getCompilationInfo());
    const compileError = compilation.messages.find(message => message.type === 'error');
    if (compileError) throw Error('The Scrypt GPU shader could not compile. No CPU miner was started. ' + (compileError.message ?? ''));
    const layout = device.createBindGroupLayout({ entries: [
      { binding: 0, visibility: 4, buffer: { type: 'read-only-storage' } }, { binding: 1, visibility: 4, buffer: { type: 'storage' } },
      { binding: 2, visibility: 4, buffer: { type: 'storage' } },
    ] });
    const pipelineLayout = device.createPipelineLayout({ bindGroupLayouts: [layout] });
    const testPipeline = await active(device.createComputePipelineAsync({ layout: pipelineLayout, compute: { module: shader, entryPoint: 'self_test' } }));
    const searchPipeline = await active(device.createComputePipelineAsync({ layout: pipelineLayout, compute: { module: shader, entryPoint: 'search' } }));
    const allocate = (size, usage) => { const buffer = device.createBuffer({ size, usage }); buffers.push(buffer); return buffer; };
    const params = allocate(PARAM_BYTES, USAGE.STORAGE | USAGE.COPY_DST);
    const output = allocate(OUTPUT_BYTES, USAGE.STORAGE | USAGE.COPY_SRC | USAGE.COPY_DST);
    const readback = allocate(OUTPUT_BYTES, USAGE.MAP_READ | USAGE.COPY_DST);
    const scratch = allocate(profile.batchSize * SCRATCH_BYTES_PER_NONCE, USAGE.STORAGE);
    const group = device.createBindGroup({ layout, entries: [{ binding: 0, resource: { buffer: params } },
      { binding: 1, resource: { buffer: output } }, { binding: 2, resource: { buffer: scratch } }] });
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
    const zero = new Uint8Array(80), patterned = Uint8Array.from({ length: 80 }, (_, i) => i);
    // Independently generated with OpenSSL/Node scryptSync(N=1024,r=1,p=1).
    const zeroHash = '161d0876f3b93b1048cda1bdeaa7332ee210f7131b42013cb43913a6553a4b69';
    const vectors = [
      { header: zero, nonce: 0, offset: 0, hash: zeroHash },
      { header: patterned, nonce: 65535, offset: 1, hash: '4778a8ceeea3b11105aaa864cc6843bea6cbf2b5620b07aa3ff3983a4e20d9cf' },
    ];
    for (const vector of vectors) {
      const actual = outputDigest(await dispatch(testPipeline, parameterBytes(vector.header, vector.nonce, vector.offset, target), 1));
      if (actual !== vector.hash) throw Error('GPU Scrypt hash self-test failed. No result was accepted.');
    }
    const exact = reverseHex(zeroHash), below = (BigInt('0x' + exact) - 1n).toString(16).padStart(64, '0');
    for (const [threshold, expected] of [[exact, 0], [below, NONE]]) {
      const actual = new DataView(await dispatch(searchPipeline, parameterBytes(zero, 0, 1, threshold), 1)).getUint32(0, true);
      if (actual !== expected) throw Error('GPU Scrypt target self-test failed. No result was accepted.');
    }
    progress('searching');
    while (attempts < maxCandidates && nextNonce <= MAX_NONCE) {
      checkpoint();
      const count = Math.min(profile.batchSize, maxCandidates - attempts, MAX_NONCE - nextNonce + 1);
      const batchStarted = now(), base = nextNonce;
      const bytes = await dispatch(searchPipeline, parameterBytes(fixedHeader, base, count, target), Math.ceil(count / WORKGROUP_SIZE));
      attempts += count; nextNonce += count;
      const candidate = new DataView(bytes).getUint32(0, true);
      if (candidate !== NONE) {
        if (candidate >= count) throw Error('GPU returned an out-of-range Scrypt candidate.');
        const nonce = base + candidate, candidateHeader = encodeScryptHeaderNonce(fixedHeader, nonce);
        const hash = await active(hashScryptHeader(candidateHeader, { signal: verifier.signal }));
        if (!scryptHashMeetsTarget(hash, target)) throw Error('GPU candidate failed independent Scrypt digest verification. No result was accepted.');
        checkpoint(); return result('found', nonce, candidateHeader, hash);
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
    closed = true; verifier.abort(); clearTimeout(timer); clearTimeout(restTimer);
    signal?.removeEventListener('abort', stop); doc?.removeEventListener('visibilitychange', visibility); page?.removeEventListener('pagehide', stop);
    device?.removeEventListener('uncapturederror', gpuError); for (const buffer of buffers) destroy(buffer); destroy(device);
  }
}
