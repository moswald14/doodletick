// SPDX-License-Identifier: GPL-3.0-only
// Pepecoin-compatible wire format. Scrypt is PoW; SHA256d identifies blocks/transactions.
import { createHash, scryptSync, randomBytes } from 'node:crypto';

export const SCRYPT_NETWORKS = Object.freeze({
  main: Object.freeze({ genesis: '0307d627595365a02cbcfd7c2614be41b1f38989ac550f5499343226f1d2d9bb', p2pkh: 31, p2sh: 50, founder: '76a914eff02da0f09c559243ffe295d6c2fd9acc61cea888ac', enabled: true }),
  test: Object.freeze({ genesis: '99e61f98fedac138dfb311d88779023b60aa9601f87d1c35d94e9a837f75ce05', p2pkh: 65, p2sh: 127, founder: '76a914751e76e8199196d454941c45d1b3a323f1433bd688ac', enabled: true }),
  regtest: Object.freeze({ genesis: 'e410039c6dc7111cf8b680962a2fc7fdafec5878f96dce4e79043d754417a44e', p2pkh: 112, p2sh: 123, founder: '76a914751e76e8199196d454941c45d1b3a323f1433bd688ac', enabled: true }),
});
export const sha256d = bytes => createHash('sha256').update(createHash('sha256').update(bytes).digest()).digest();
const fail = message => { throw Object.assign(new Error(message), { code: 'DVC_SCRYPT_INVALID' }); };
const bytes = (hex, size) => {
  if (typeof hex !== 'string' || !/^(?:[0-9a-f]{2})+$/.test(hex) || (size !== undefined && hex.length !== size * 2)) fail('Invalid hexadecimal data.');
  return Buffer.from(hex, 'hex');
};
const integer = (n, max = Number.MAX_SAFE_INTEGER) => {
  if (!Number.isSafeInteger(n) || n < 0 || n > max) fail('Invalid integer.');
  return n;
};
export function compactSize(n) {
  integer(n, 0xffffffff);
  if (n < 253) return Buffer.from([n]);
  const out = Buffer.alloc(n <= 65535 ? 3 : 5);
  out[0] = n <= 65535 ? 253 : 254;
  if (n <= 65535) out.writeUInt16LE(n, 1); else out.writeUInt32LE(n, 1);
  return out;
}
function u32(n) { const b = Buffer.alloc(4); b.writeUInt32LE(integer(n, 0xffffffff)); return b; }
function u64(n) { const b = Buffer.alloc(8); b.writeBigUInt64LE(BigInt(integer(n))); return b; }
function scriptHeight(n) {
  integer(n, 0x7fffffff);
  if (n <= 16) return Buffer.from([n === 0 ? 0 : 0x50 + n]);
  const out = [];
  while (n) { out.push(n & 255); n = Math.floor(n / 256); }
  if (out.at(-1) & 128) out.push(0);
  return Buffer.from([out.length, ...out]);
}
export function addressScript(address, network) {
  if (!SCRYPT_NETWORKS[network] || typeof address !== 'string' || !/^[1-9A-HJ-NP-Za-km-z]{26,35}$/.test(address)) fail('Enter a receiving address from this Doodleverse network. Ethereum and Pepecoin addresses are not accepted.');
  const alphabet = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
  let value = 0n;
  for (const letter of address) value = value * 58n + BigInt(alphabet.indexOf(letter));
  let hex = value.toString(16); if (hex.length % 2) hex = '0' + hex;
  const decoded = Buffer.concat([Buffer.alloc(address.match(/^1*/)[0].length), Buffer.from(hex, 'hex')]);
  if (decoded.length !== 25 || !sha256d(decoded.subarray(0, 21)).subarray(0, 4).equals(decoded.subarray(21))) fail('Receiving address checksum is invalid.');
  const params = SCRYPT_NETWORKS[network], hash = decoded.subarray(1, 21);
  if (decoded[0] === params.p2pkh) return Buffer.concat([Buffer.from('76a914', 'hex'), hash, Buffer.from('88ac', 'hex')]);
  if (decoded[0] === params.p2sh) return Buffer.concat([Buffer.from('a914', 'hex'), hash, Buffer.from('87', 'hex')]);
  fail('The receiving address belongs to a different network.');
}
export function targetFromBits(bits) {
  const compact = bytes(bits, 4).readUInt32BE();
  const size = compact >>> 24, word = compact & 0x7fffff;
  if ((compact & 0x800000) || !word || size > 34) fail('Invalid compact mining target.');
  const target = size <= 3 ? BigInt(word) >> BigInt(8 * (3 - size)) : BigInt(word) << BigInt(8 * (size - 3));
  if (target <= 0n || target >= 1n << 256n) fail('Mining target is outside 256 bits.');
  return target.toString(16).padStart(64, '0');
}
export function createScryptWork(template, address, network, extraNonce = randomBytes(12)) {
  if (!SCRYPT_NETWORKS[network]?.enabled) fail('This chain is not enabled for mining.');
  const script = addressScript(address, network);
  if (!template || typeof template !== 'object') fail('Invalid node template.');
  integer(template.height, 0x7fffffff); if (!template.height) fail('Invalid block height.');
  integer(template.version, 0x7fffffff);
  if ((template.version >>> 16) !== 0x4456 || (template.version & 0x100)) fail('Unexpected chain or AuxPoW template.');
  integer(template.curtime, 0xffffffff); integer(template.mintime, 0xffffffff);
  if (template.curtime < template.mintime) fail('Node supplied an invalid block time.');
  const target = targetFromBits(template.bits);
  if (target !== template.target) fail('Node target disagrees with compact difficulty.');
  integer(template.coinbasevalue, 21000000 * 100000000);
  integer(template.dvcminerreward, template.coinbasevalue);
  if (!Buffer.isBuffer(extraNonce) || extraNonce.length !== 12) fail('A 12-byte extra nonce is required.');
  const sig = Buffer.concat([scriptHeight(template.height), Buffer.from([12]), extraNonce, Buffer.from([3, 68, 86, 67])]);
  const outputs = [[template.dvcminerreward, script]];
  const founder = template.dvcfoundation;
  if (template.height === 1) {
    if (founder?.required !== true || founder.value !== 1000000 * 100000000 || founder.scriptPubKey !== SCRYPT_NETWORKS[network].founder) fail('Founder output differs from the pinned allocation.');
    if (template.coinbasevalue !== template.dvcminerreward + founder.value) fail('Founder reward sum is invalid.');
    outputs.push([founder.value, bytes(founder.scriptPubKey)]);
  } else if (founder !== undefined || template.coinbasevalue !== template.dvcminerreward) fail('Unexpected founder reward.');
  // Segwit is disabled on the launch chains. Reject an unfamiliar activated rule,
  // rather than constructing a block with missing witness commitments.
  if (!Array.isArray(template.rules) || template.rules.length || template.vbrequired !== 0 || Object.hasOwn(template, 'default_witness_commitment')) fail('The node requires mining rules this adapter does not support.');
  if (!Array.isArray(template.transactions) || template.transactions.length > 10000) fail('Template has too many transactions.');
  const transactions = template.transactions.map(tx => bytes(tx.data));
  if (transactions.reduce((sum, tx) => sum + tx.length, 0) > 950000) fail('Template exceeds the mining adapter block limit.');
  const coinbase = Buffer.concat([u32(1), Buffer.from([1]), Buffer.alloc(32), Buffer.from('ffffffff', 'hex'), compactSize(sig.length), sig, Buffer.from('ffffffff', 'hex'), compactSize(outputs.length), ...outputs.flatMap(([value, output]) => [u64(value), compactSize(output.length), output]), u32(0)]);
  let hashes = [sha256d(coinbase), ...template.transactions.map((tx, i) => {
    const claimed = bytes(tx.txid, 32).reverse(), actual = sha256d(transactions[i]);
    if (!claimed.equals(actual)) fail('Transaction identifier mismatch or unsupported witness transaction.');
    return claimed;
  })];
  while (hashes.length > 1) {
    if (hashes.length % 2) hashes.push(hashes.at(-1));
    const level = []; for (let i = 0; i < hashes.length; i += 2) level.push(sha256d(Buffer.concat([hashes[i], hashes[i + 1]])));
    hashes = level;
  }
  const header = Buffer.concat([u32(template.version), bytes(template.previousblockhash, 32).reverse(), hashes[0], u32(template.curtime), u32(parseInt(template.bits, 16)), u32(0)]);
  const body = Buffer.concat([compactSize(transactions.length + 1), coinbase, ...transactions]);
  return { header, body, target, height: template.height, previous: template.previousblockhash, address, reward: template.dvcminerreward };
}
export function solveScryptCandidate(work, nonce) {
  integer(nonce, 0xffffffff);
  const header = Buffer.from(work.header); header.writeUInt32LE(nonce, 76);
  // One submitted candidate is independently verified; this is never a CPU search.
  const digest = scryptSync(header, header, 32, { N: 1024, r: 1, p: 1, maxmem: 2 * 1024 * 1024 });
  if (BigInt('0x' + Buffer.from(digest).reverse().toString('hex')) > BigInt('0x' + work.target)) fail('The submitted Scrypt proof does not meet this job target.');
  return { block: Buffer.concat([header, work.body]).toString('hex'), hash: sha256d(header).reverse().toString('hex') };
}
