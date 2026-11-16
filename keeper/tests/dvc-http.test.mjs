// SPDX-License-Identifier: GPL-3.0-only
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { SigningKey, computeAddress, TypedDataEncoder } from '../public/recipient-crypto.mjs';
import { genesis, workDigest, createTransferDraft, transferTypedData, attachTransferSignature } from '../public/dvc-core.mjs';
import { createDvcNode } from '../dvc-node.mjs';
import { createDvcHttpHandler } from '../dvc-http.mjs';

const key = new SigningKey('0x' + '7'.repeat(64));
const sender = computeAddress(key.publicKey).toLowerCase(), recipient = '0x' + '8'.repeat(40), miner = '0x' + '9'.repeat(40);
const NOW = 1795816000000, target = ((1n << 252n) - 1n).toString(16).padStart(64, '0');
function network(name) { return genesis('doodleverse-regtest-http-' + name, { founderAddress: sender, initialBaseTarget: target, maxBaseTarget: target }); }
function signed(g, fields = {}) {
  const draft = createTransferDraft({ sender, recipient, amountAtoms: '2500', nonce: '0', validUntilHeight: '100', ...fields }, { genesis: g });
  const typed = transferTypedData(draft, { genesis: g });
  return attachTransferSignature(draft, key.sign(TypedDataEncoder.hash(typed.domain, { DoodleverseTransfer: typed.types.DoodleverseTransfer }, typed.message)).serialized, { genesis: g });
}
function solve(job) {
  for (let n = 0n; n < 1000000n; n++) {
    const nonce = n.toString(), digest = workDigest(job.prefixHex, nonce, job.algorithm);
    if (BigInt('0x' + digest) <= BigInt('0x' + job.targetHex)) return { ...job.block, nonce, digest };
  }
  throw Error('Regtest proof search exhausted.');
}
async function serve(t, g, options = {}) {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'dvc-http-'));
  const node = await createDvcNode({ dataDir: dir, genesis: g, now: () => NOW });
  const handler = createDvcHttpHandler({ node, ...options });
  const server = http.createServer(async (req, res) => { if (!await handler(req, res)) { res.writeHead(404); res.end('outside'); } });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const base = `http://127.0.0.1:${server.address().port}`;
  t.after(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); await node.close(); await rm(dir, { recursive: true, force: true }); });
  const request = async (pathname, { method = 'GET', body, headers = {} } = {}) => {
    const response = await fetch(base + pathname, { method, headers: { ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...headers }, ...(body === undefined ? {} : { body: typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body) }) });
    const text = await response.text(); let value; try { value = JSON.parse(text); } catch { value = text; }
    return { status: response.status, headers: response.headers, value };
  };
  return { dir, node, server, base, request };
}

test('HTTP exposes bounded public status/accounts/locators and explicit mining receipts', async t => {
  const g = network('routes'), f = await serve(t, g);
  const status = await f.request('/dvc/status');
  assert.equal(status.status, 200); assert.equal(status.value.networkId, g.networkId);
  assert.match(status.headers.get('content-type'), /^application\/json/); assert.equal(status.headers.get('cache-control'), 'no-store');
  assert.equal(status.headers.get('access-control-allow-origin'), null);
  assert.deepEqual((await f.request('/dvc/locators')).value.locators, [g.hash]);
  const job = await f.request('/dvc/job', { method: 'POST', body: { miner, algorithm: 'sha256d' } });
  assert.equal(job.status, 200); assert.equal(job.value.block.parent, g.hash);
  assert.equal(f.node.status().tip.height, '0'); // Asking for a job never mines it.
  const block = solve(job.value), accepted = await f.request('/dvc/block', { method: 'POST', body: block });
  assert.equal(accepted.status, 200);
  assert.deepEqual({ accepted: accepted.value.accepted, canonical: accepted.value.canonical, hash: accepted.value.hash, height: accepted.value.height }, { accepted: true, canonical: true, hash: block.digest, height: '1' });
  const duplicate = await f.request('/dvc/block', { method: 'POST', body: block });
  assert.equal(duplicate.value.accepted, true); assert.equal(duplicate.value.canonical, true); assert.equal(duplicate.value.reason, 'already-known');
  const account = (await f.request('/dvc/account/' + miner)).value;
  assert.equal(account.tipHash, block.digest); assert.equal(account.availableAtoms, '0'); assert.equal(account.immatureAtoms, '5000000000'); assert(Array.isArray(account.recentTransactions));
  assert.equal((await f.request('/outside')).value, 'outside');
});

test('same-origin and strict JSON boundaries reject cross-site requests, duplicate keys and unexpected fields', async t => {
  const f = await serve(t, network('boundaries'));
  assert.equal((await f.request('/dvc/status', { headers: { Origin: f.base } })).status, 200);
  assert.equal((await f.request('/dvc/status', { headers: { Origin: 'https://other.invalid' } })).status, 403);
  assert.equal((await f.request('/dvc/status', { headers: { 'Sec-Fetch-Site': 'cross-site' } })).status, 403);
  const cases = [
    { body: `{"miner":"${miner}","miner":"${sender}","algorithm":"sha256"}` },
    { body: `{"miner":"${miner}","\\u006diner":"${sender}","algorithm":"sha256"}` },
    { body: { miner, algorithm: 'sha256', peerUrl: 'https://other.invalid' } },
    { body: { miner, algorithm: 'sha256' }, headers: { 'Content-Type': 'text/plain' } },
    { body: Buffer.from([0xc3, 0x28]) },
    { body: '['.repeat(34) + '0' + ']'.repeat(34) },
  ];
  for (const options of cases) assert.equal((await f.request('/dvc/job', { method: 'POST', ...options })).status, 400);
  assert.equal((await f.request('/dvc/chain?limit=9')).status, 400);
  assert.equal((await f.request('/dvc/chain?from=1&from=2')).status, 400);
  assert.equal((await f.request('/dvc/mempool?limit=257')).status, 400);
  assert.equal((await f.request('/dvc/status?peerUrl=x')).status, 400);
  assert.equal((await f.request('/dvc/locate', { method: 'POST', body: { locators: Array(65).fill(f.node.status().genesis.hash) } })).status, 400);
  assert.equal(f.node.status().tip.height, '0');
});

test('streamed body size, declared length and receive deadline are bounded', async t => {
  const f = await serve(t, network('body'), { maxBodyBytes: 128, bodyTimeoutMs: 40 });
  assert.equal((await f.request('/dvc/job', { method: 'POST', body: '{"padding":"' + 'x'.repeat(129) + '"}' })).status, 400);
  async function raw(headers, write) {
    return new Promise((resolve, reject) => {
      const req = http.request(f.base + '/dvc/job', { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers } }, res => {
        let data = ''; res.on('data', chunk => { data += chunk; }); res.on('end', () => { req.destroy(); resolve({ status: res.statusCode, value: JSON.parse(data) }); });
      });
      req.on('error', error => { if (error.code !== 'ECONNRESET') reject(error); }); write(req);
    });
  }
  const declared = await raw({ 'Content-Length': '129' }, req => { req.write('{}'); });
  assert.equal(declared.status, 400); assert.equal(declared.value.code, 'DVC_BODY_TOO_LARGE');
  const chunked = await raw({ 'Transfer-Encoding': 'chunked' }, req => { req.write('x'.repeat(129)); });
  assert.equal(chunked.status, 400); assert.equal(chunked.value.code, 'DVC_BODY_TOO_LARGE');
  const timeout = await raw({ 'Transfer-Encoding': 'chunked' }, req => { req.write('{'); });
  assert.equal(timeout.status, 400); assert.equal(timeout.value.code, 'DVC_BODY_TIMEOUT');
});

test('mutation rate limits return semantic retry responses and expire without affecting reads', async t => {
  let time = 0; const f = await serve(t, network('rate'), { now: () => time, mutationLimit: 2, mutationWindowMs: 1000 });
  const options = { method: 'POST', body: { miner, algorithm: 'sha256' } };
  assert.equal((await f.request('/dvc/job', options)).status, 200);
  assert.equal((await f.request('/dvc/job', options)).status, 200);
  const limited = await f.request('/dvc/job', options);
  assert.equal(limited.status, 429); assert.equal(limited.headers.get('retry-after'), '1');
  assert.equal((await f.request('/dvc/status')).status, 200);
  time = 1001; assert.equal((await f.request('/dvc/job', options)).status, 200);
});

test('concurrent HTTP transfers preserve nonce and overspend semantics without leaking raw errors', async t => {
  const g = network('transfer'), f = await serve(t, g), a = signed(g), b = signed(g, { amountAtoms: '3500' });
  const answers = await Promise.all([a, b].map(body => f.request('/dvc/transfer', { method: 'POST', body })));
  assert.deepEqual(answers.map(value => value.status).sort(), [200, 409]);
  const rejected = answers.find(value => value.status === 409);
  assert.equal(rejected.value.code, 'DVC_NONCE'); assert(!JSON.stringify(rejected.value).includes(sender));
  const balance = await f.request('/dvc/transfer', { method: 'POST', body: signed(g, { nonce: '1', amountAtoms: g.founderAtoms }) });
  assert.equal(balance.status, 409); assert.equal(balance.value.code, 'DVC_BALANCE');
  const account = (await f.request('/dvc/account/' + sender)).value;
  assert.equal(account.nextNonce, '1'); assert.equal(account.networkId, g.networkId); assert.equal(account.height, '0');
  assert.equal((await f.request('/dvc/mempool?limit=1')).value.transactions.length, 1);
});

test('unknown internal failures become generic 503 responses and authorization can deny access', async t => {
  const g = network('errors'), f = await serve(t, g, { node: { status() { throw Error('secret filesystem path and private token'); } } });
  const error = await f.request('/dvc/status'); assert.equal(error.status, 503);
  assert.equal(error.value.code, 'DVC_UNAVAILABLE'); assert(!JSON.stringify(error.value).includes('private token'));
  const inherited = await serve(t, g, { node: { status() { throw { code: 'constructor', message: 'secret' }; } } });
  const inheritedError = await inherited.request('/dvc/status'); assert.equal(inheritedError.status, 503); assert.equal(inheritedError.value.code, 'DVC_UNAVAILABLE');
  const denied = await serve(t, g, { authorize: () => false }); assert.equal((await denied.request('/dvc/status')).status, 403);
});

test('two HTTP nodes synchronize full validated pages and transfers without sharing storage', async t => {
  const g = network('sync'), a = await serve(t, g), b = await serve(t, g);
  for (let i = 0; i < 10; i++) {
    const job = (await a.request('/dvc/job', { method: 'POST', body: { miner, algorithm: i % 2 ? 'sha256d' : 'sha256' } })).value;
    assert.equal((await a.request('/dvc/block', { method: 'POST', body: solve(job) })).status, 200);
  }
  const locators = (await b.request('/dvc/locators')).value;
  const common = (await a.request('/dvc/locate', { method: 'POST', body: { locators: locators.locators } })).value;
  assert.equal(common.height, '0');
  let height = 1;
  while (height <= 10) {
    const page = (await a.request('/dvc/chain?from=' + height + '&limit=8')).value;
    const result = await b.request('/dvc/segment', { method: 'POST', body: { ancestorHash: page.ancestorHash, blocks: page.blocks } });
    assert.equal(result.status, 200); assert.equal(result.value.adopted, true); height += page.blocks.length;
  }
  assert.deepEqual(b.node.status().tip, a.node.status().tip);
  const payment = signed(g); await a.request('/dvc/transfer', { method: 'POST', body: payment });
  const pool = (await a.request('/dvc/mempool?limit=8')).value;
  assert.equal((await b.request('/dvc/transfer', { method: 'POST', body: pool.transactions[0] })).status, 200);
  assert.equal(b.node.account(sender).pendingOutAtoms, a.node.account(sender).pendingOutAtoms);
  assert.notEqual(a.dir, b.dir);
});
