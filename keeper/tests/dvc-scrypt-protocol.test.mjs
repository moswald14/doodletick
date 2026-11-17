// SPDX-License-Identifier: GPL-3.0-only
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, scryptSync } from 'node:crypto';
import { readFile, mkdtemp, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { SCRYPT_NETWORKS, addressScript, createScryptWork, solveScryptCandidate, targetFromBits, compactSize, sha256d } from '../dvc-scrypt-protocol.mjs';
import { createCoreRpc, createScryptBridge, scryptBridgeFromEnvironment } from '../dvc-scrypt-node.mjs';
import { createScryptHttpHandler } from '../dvc-scrypt-http.mjs';

const hash = bytes => createHash('sha256').update(createHash('sha256').update(bytes).digest()).digest();
function encodeAddress(prefix, payload = Buffer.alloc(20, 17)) {
  const data = Buffer.concat([Buffer.from([prefix]), payload]);
  const checked = Buffer.concat([data, hash(data).subarray(0, 4)]);
  let n = BigInt('0x' + checked.toString('hex')), result = '';
  while (n) { result = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'[Number(n % 58n)] + result; n /= 58n; }
  return result;
}
const address = encodeAddress(112), founder = SCRYPT_NETWORKS.regtest.founder;
const base = () => ({ version: 0x44560004, height: 2, curtime: 1794873800, mintime: 1794873721,
  previousblockhash: '11'.repeat(32), bits: '207fffff', target: '7fffff' + '00'.repeat(29),
  rules: [], vbrequired: 0, transactions: [], coinbasevalue: 5000000000, dvcminerreward: 5000000000 });
function nonceFor(header, target) {
  for (let nonce = 0; nonce < 100; nonce++) {
    const candidate = Buffer.from(header); candidate.writeUInt32LE(nonce, 76);
    const proof = scryptSync(candidate, candidate, 32, { N: 1024, r: 1, p: 1, maxmem: 1024 * 1024 });
    if (BigInt('0x' + Buffer.from(proof).reverse().toString('hex')) <= BigInt('0x' + target)) return nonce;
  }
  throw Error('Disposable regtest nonce search failed');
}
function fixture(overrides = {}) {
  const state = { tip: '11'.repeat(32), submitted: [], block: null, ...overrides };
  const rpc = async (method, params = []) => {
    if (method === 'getblockhash') return state.genesis ?? SCRYPT_NETWORKS.regtest.genesis;
    if (method === 'getnetworkinfo') return { subversion: '/DoodleverseCore:1.1.0/', connections: 1 };
    if (method === 'getblockchaininfo') return { chain: 'regtest', blocks: 1 };
    if (method === 'getblocktemplate') return state.template ?? base();
    if (method === 'getbestblockhash') return state.tip;
    if (method === 'submitblock') { state.submitted.push(params[0]); state.block = hash(Buffer.from(params[0].slice(0, 160), 'hex')).reverse().toString('hex'); return state.reject ?? null; }
    if (method === 'getblockheader') return state.header ?? { hash: state.block, height: 2, confirmations: 1 };
    throw Error('Unexpected RPC method');
  };
  return { state, rpc };
}

test('all pinned chain identifiers, Scrypt proofs and merkle roots match the independent Core manifest', async () => {
  const manifest = JSON.parse(await readFile(new URL('../../doodleverse-core/chain-manifest.json', import.meta.url), 'utf8'));
  for (const [name, item] of Object.entries(manifest.networks)) {
    assert.equal(SCRYPT_NETWORKS[name].genesis, item.hash);
    assert.equal(SCRYPT_NETWORKS[name].p2pkh, item.pubkey_address_prefix);
    assert.equal(SCRYPT_NETWORKS[name].founder, item.founder_script);
    const header = Buffer.from(item.header, 'hex');
    assert.equal(hash(header).reverse().toString('hex'), item.hash);
    assert.equal(hash(Buffer.from(item.transaction, 'hex')).reverse().toString('hex'), item.merkle_root);
    const pow = scryptSync(header, header, 32, { N: 1024, r: 1, p: 1, maxmem: 1024 * 1024 });
    assert.equal(Buffer.from(pow).reverse().toString('hex'), item.scrypt_pow);
    assert.ok(BigInt('0x' + item.scrypt_pow) <= BigInt('0x' + targetFromBits(item.bits.slice(2))));
  }
});

test('receiving addresses require checksum and exact new-chain network prefix', () => {
  assert.equal(addressScript(address, 'regtest').toString('hex'), '76a914' + '11'.repeat(20) + '88ac');
  assert.equal(addressScript(encodeAddress(123), 'regtest').toString('hex'), 'a914' + '11'.repeat(20) + '87');
  for (const bad of [address.slice(0, -1) + (address.endsWith('1') ? '2' : '1'), encodeAddress(31), encodeAddress(56), '0x' + '11'.repeat(20), '__proto__']) assert.throws(() => addressScript(bad, 'regtest'));
  assert.throws(() => createScryptWork(base(), address, 'main'));
});

test('coinbase wire amounts, BIP34 height, merkle bytes and header fields are serialized for Core', () => {
  const t = { ...base(), height: 1, coinbasevalue: 100005000000000, dvcfoundation: { required: true, value: 100000000000000, scriptPubKey: founder } };
  const work = createScryptWork(t, address, 'regtest', Buffer.alloc(12, 7));
  assert.equal(work.header.length, 80); assert.equal(work.header.readUInt32LE(0), 0x44560004);
  assert.equal(work.header.readUInt32LE(68), t.curtime); assert.equal(work.header.readUInt32LE(72), 0x207fffff);
  const tx = work.body.subarray(1); assert.equal(tx[0], 1); assert.equal(tx[4], 1);
  const sigLength = tx[41]; assert.equal(tx[42], 0x51); // minimal height 1 opcode
  let offset = 42 + sigLength + 4; assert.equal(tx[offset++], 2);
  assert.equal(tx.readBigUInt64LE(offset), 5000000000n); offset += 8;
  const firstSize = tx[offset++]; offset += firstSize;
  assert.equal(tx.readBigUInt64LE(offset), 100000000000000n); offset += 8;
  const founderSize = tx[offset++]; assert.equal(tx.subarray(offset, offset + founderSize).toString('hex'), founder);
  assert.deepEqual(work.header.subarray(36, 68), hash(tx));
  const nonce = nonceFor(work.header, work.target), solved = solveScryptCandidate(work, nonce);
  assert.equal(solved.block.slice(160), work.body.toString('hex'));
  assert.equal(solved.hash, hash(Buffer.from(solved.block.slice(0, 160), 'hex')).reverse().toString('hex'));
});

test('template rules, reward sums, target encodings and transaction commitments fail closed', () => {
  for (const change of [ { rules: ['!new-rule'] }, { rules: undefined }, { vbrequired: 1 }, { default_witness_commitment: '' },
    { version: 4 }, { version: 0x44560104 }, { target: 'ff'.repeat(32) }, { bits: '20800001' }, { bits: '23000001' },
    { dvcminerreward: -1 }, { coinbasevalue: 5000000001 }, { curtime: 1 }, { height: 0 },
    { dvcfoundation: { required: true, value: 100000000000000, scriptPubKey: founder } },
    { transactions: [{ data: '00', txid: '00'.repeat(32) }] } ]) assert.throws(() => createScryptWork({ ...base(), ...change }, address, 'regtest'));
  const first = { ...base(), height: 1, coinbasevalue: 100005000000000, dvcfoundation: { required: true, value: 100000000000000, scriptPubKey: founder } };
  for (const change of [{ value: 1 }, { required: false }, { scriptPubKey: '51' }]) assert.throws(() => createScryptWork({ ...first, dvcfoundation: { ...first.dvcfoundation, ...change } }, address, 'regtest'));
  assert.throws(() => createScryptWork(first, 'nFXpqKGstGktjrogxmR28tu6ccJCfGSTEk', 'regtest'));
  assert.equal(compactSize(253).toString('hex'), 'fdfd00'); assert.equal(compactSize(65536).toString('hex'), 'fe00000100');
});

test('accepted submissions are independently verified, committed by Core and usable only once', async () => {
  const { rpc, state } = fixture(), bridge = createScryptBridge({ rpc });
  assert.equal((await bridge.status()).height, 1);
  const job = await bridge.job(address), nonce = nonceFor(Buffer.from(job.header, 'hex'), job.target);
  const accepted = await bridge.submit(job.id, nonce);
  assert.equal(accepted.accepted, true); assert.equal(accepted.hash, state.block); assert.equal(state.submitted.length, 1);
  await assert.rejects(bridge.submit(job.id, nonce), /expired|already/);
});

test('foreign genesis, stale/rejected work and incomplete confirmation replies cannot award rewards', async () => {
  await assert.rejects(createScryptBridge({ rpc: fixture({ genesis: '00'.repeat(32) }).rpc }).job(address), /pinned/);
  for (const change of [{ stale: true }, { reject: 'bad-cb-amount' }, { header: { height: 2 } },
    { header: { height: 2, confirmations: 1, hash: '00'.repeat(32) } }, { header: { height: 2, confirmations: -1 } }]) {
    const { rpc, state } = fixture(change), bridge = createScryptBridge({ rpc });
    const job = await bridge.job(address), nonce = nonceFor(Buffer.from(job.header, 'hex'), job.target);
    if (change.stale) state.tip = '33'.repeat(32);
    await assert.rejects(bridge.submit(job.id, nonce));
  }
});

test('job capacity and expiration are bounded and default bridge never enables mainnet', async () => {
  let time = 1000; const { rpc } = fixture(), bridge = createScryptBridge({ rpc, now: () => time, maxJobs: 1 });
  const job = await bridge.job(address); await assert.rejects(bridge.job(address), /limit/);
  time += 120001; await assert.rejects(bridge.submit(job.id, 0), /expired/);
  await bridge.job(address);
  assert.equal((await createScryptBridge().status()).connected, false);
  assert.throws(() => createScryptBridge({ rpc, network: 'main' }));
  await assert.rejects(scryptBridgeFromEnvironment({ DVC_CORE_RPC_URL: 'http://evil.example' }).status(), /settings/);
});

test('RPC authenticates only to explicit loopback and exposes no wallet or arbitrary methods', async t => {
  const temp = await mkdtemp(path.join(os.tmpdir(), 'dvc-rpc-test-')); t.after(() => rm(temp, { recursive: true, force: true }));
  const cookieFile = path.join(temp, '.cookie'); await writeFile(cookieFile, '__cookie__:' + 'a'.repeat(64));
  const seen = [];
  const rpc = createCoreRpc({ url: 'http://127.0.0.1:18473/', cookieFile, fetcher: async (url, options) => {
    seen.push({ url, options }); return new Response(JSON.stringify({ id: 1, error: null, result: { blocks: 2 } }));
  } });
  assert.deepEqual(await rpc('getblockchaininfo'), { blocks: 2 });
  assert.ok(seen[0].options.headers.Authorization.startsWith('Basic '));
  await assert.rejects(rpc('dumpprivkey', ['address']), /not exposed/); assert.equal(seen.length, 1);
  for (const url of ['http://example.com/', 'http://localhost/', 'https://127.0.0.1/', 'http://127.0.0.1/other', 'http://user:pass@127.0.0.1/']) assert.throws(() => createCoreRpc({ url, cookieFile }));
  await writeFile(cookieFile, 'bad'); await assert.rejects(rpc('getblockchaininfo'), /unavailable/);
});

test('HTTP job surface requires request protection and exact bounded fields', async t => {
  const { rpc } = fixture(); const handler = createScryptHttpHandler({ bridge: createScryptBridge({ rpc }) });
  const server = http.createServer(async (req, res) => { if (!await handler(req, res, new URL(req.url, 'http://localhost'))) { res.writeHead(404); res.end(); } });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve)); t.after(() => new Promise(resolve => server.close(resolve)));
  const url = 'http://127.0.0.1:' + server.address().port;
  assert.equal((await fetch(url + '/scrypt/status')).status, 200);
  const post = (body, extra = {}) => fetch(url + '/scrypt/job', { method: 'POST', headers: { 'Content-Type': 'application/json', ...extra }, body });
  assert.equal((await post(JSON.stringify({ address }))).status, 403);
  assert.equal((await post('{"address":"x","address":"y"}', { 'X-Keeper-Request': '1' })).status, 400);
  assert.equal((await post(JSON.stringify({ address, rpc: 'dumpwallet' }), { 'X-Keeper-Request': '1' })).status, 400);
  const response = await post(JSON.stringify({ address }), { 'X-Keeper-Request': '1' }); assert.equal(response.status, 200);
  const job = await response.json(); assert.equal(job.header.length, 160); assert.equal(job.address, address); assert.equal(job.network, 'regtest');
});
