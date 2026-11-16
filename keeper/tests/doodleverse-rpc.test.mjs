// SPDX-License-Identifier: GPL-3.0-only
// Disposable addresses and mocked HTTP only. Never contacts a wallet or node.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createEthereumReadService } from '../public/doodleverse-rpc.mjs';
import { encodeRecipient1271Call } from '../public/doodleverse-recipient.mjs';

const ADDRESS = '0x' + 'ab'.repeat(20), HASH = '0x' + 'cd'.repeat(32), DIGEST = '0x' + 'ef'.repeat(32);
const BLOCK = { blockHash: HASH, requireCanonical: true };
const CALL = { to: ADDRESS, data: encodeRecipient1271Call({ digest: DIGEST, signature: '0x1234' }), gas: '0x7a120' };
const clone = value => structuredClone(value);
const request = (method, params) => ({ method, params });
const chain = () => request('eth_chainId', []);
const code = () => request('eth_getCode', [ADDRESS, clone(BLOCK)]);
const call = () => request('eth_call', [clone(CALL), clone(BLOCK)]);
const response = value => new Response(JSON.stringify(value), { status: 200, headers: { 'content-type': 'application/json' } });
const defer = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
function setup(handler = payload => ({ jsonrpc: '2.0', id: payload.id, result: '0x1' }), options = {}) {
  const calls = [];
  const service = createEthereumReadService({ ...options, fetchImpl: async (url, init) => {
    const payload = JSON.parse(init.body); calls.push({ url, init, payload });
    const value = await handler(payload, init); return value instanceof Response || value?.text || value?.body ? value : response(value);
  } });
  return { service, calls };
}
async function rejected(promise, expected) {
  let caught;
  await assert.rejects(promise, error => { caught = error; return error.code === expected; });
  return caught;
}

test('service construction is inert, frozen and fixed to Ethereum mainnet', async () => {
  const f = setup(); assert.equal(f.calls.length, 0); assert.equal(Object.isFrozen(f.service), true);
  assert.equal(f.service.id, 'publicnode-ethereum'); assert.equal(f.service.chainId, '1');
  assert.equal(await f.service.request(chain()), '0x1');
  const [{ url, init, payload }] = f.calls;
  assert.equal(url, 'https://ethereum-rpc.publicnode.com'); assert.equal(init.method, 'POST');
  assert.equal(init.credentials, 'omit'); assert.equal(init.referrerPolicy, 'no-referrer'); assert.equal(init.redirect, 'error'); assert.equal(init.cache, 'no-store');
  assert.deepEqual(init.headers, { 'Content-Type': 'application/json' }); assert.deepEqual(payload, { jsonrpc: '2.0', id: 1, method: 'eth_chainId', params: [] });
});

test('only allowlisted reads reach the network, with unique matching IDs', async () => {
  const f = setup(payload => ({ jsonrpc: '2.0', id: payload.id, result: payload.method === 'eth_getBlockByNumber' ? { number: '0x10', hash: HASH, transactions: ['unneeded'] } : payload.method === 'eth_getCode' ? '0x6000' : payload.method === 'eth_call' ? '0x1626ba7e' : '0x1' }));
  assert.deepEqual(await f.service.request(request('eth_getBlockByNumber', ['latest', false])), { number: '0x10', hash: HASH });
  await f.service.request(request('eth_getBlockByNumber', ['0x0', false]));
  assert.equal(await f.service.request(code()), '0x6000'); assert.equal(await f.service.request(call()), '0x1626ba7e');
  assert.deepEqual(f.calls.map(c => c.payload.id), [1, 2, 3, 4]); assert.deepEqual(f.calls[2].payload.params, [ADDRESS, BLOCK]); assert.deepEqual(f.calls[3].payload.params, [CALL, BLOCK]);
});

test('transactions, wallet methods, arbitrary methods and extra request properties are denied before fetch', async () => {
  const f = setup();
  for (const method of ['eth_sendTransaction', 'eth_sendRawTransaction', 'eth_sign', 'personal_sign', 'eth_signTypedData_v4', 'eth_requestAccounts', 'eth_accounts', 'wallet_switchEthereumChain', 'eth_getBalance', 'eth_estimateGas', '<private-address>']) {
    const error = await rejected(f.service.request(request(method, [])), 'RPC_INVALID_REQUEST');
    assert.equal(error.rpcMethod, undefined); assert.equal(error.message.includes(method), false);
  }
  for (const value of [null, [], { ...chain(), url: 'https://example.invalid' }, { ...chain(), id: 1 }, { method: 'eth_chainId' }, request('eth_chainId', [1])]) await rejected(f.service.request(value), 'RPC_INVALID_REQUEST');
  assert.equal(f.calls.length, 0);
});

test('block reads require latest or canonical quantities and false transaction expansion', async () => {
  const f = setup();
  for (const params of [['pending', false], ['safe', false], ['earliest', false], ['0x00', false], ['0x01', false], ['0X1', false], ['0xA', false], ['0x' + 'f'.repeat(65), false], [0, false], [HASH, true], ['latest', true], ['latest'], ['latest', false, {}]]) {
    await rejected(f.service.request(request('eth_getBlockByNumber', params)), 'RPC_INVALID_REQUEST');
  }
  assert.equal(f.calls.length, 0);
});

test('code and signature reads require an exact canonical block hash without downgrade', async () => {
  const f = setup();
  for (const invalidBlock of ['latest', '0x10', { blockNumber: '0x10' }, { blockHash: HASH }, { blockHash: HASH, requireCanonical: false }, { blockHash: HASH, requireCanonical: true, blockNumber: '0x10' }, { blockHash: '0x1234', requireCanonical: true }]) {
    await rejected(f.service.request(request('eth_getCode', [ADDRESS, invalidBlock])), 'RPC_INVALID_REQUEST');
    await rejected(f.service.request(request('eth_call', [CALL, invalidBlock])), 'RPC_INVALID_REQUEST');
  }
  for (const invalidAddress of ['0x1234', ADDRESS + '00', 'https://example.invalid', null]) await rejected(f.service.request(request('eth_getCode', [invalidAddress, BLOCK])), 'RPC_INVALID_REQUEST');
  assert.equal(f.calls.length, 0);
});

test('eth_call permits only fixed gas and canonical isValidSignature ABI data', async () => {
  const f = setup();
  const data = CALL.data, malformed = [
    { ...CALL, value: '0x0' }, { ...CALL, from: ADDRESS }, { ...CALL, gas: '0x7a121' }, { ...CALL, gas: undefined }, { ...CALL, to: null },
    { ...CALL, data: '0xa9059cbb' + data.slice(10) }, { ...CALL, data: '0x1626ba7e' }, { ...CALL, data: data + '00' },
    { ...CALL, data: data.slice(0, 74) + '0'.repeat(62) + '60' + data.slice(138) },
    { ...CALL, data: data.slice(0, 138) + '0'.repeat(64) + data.slice(202) },
    { ...CALL, data: data.slice(0, 138) + 'f'.repeat(64) + data.slice(202) },
    { ...CALL, data: data.slice(0, -1) + '1' },
    { ...CALL, data: data.slice(0, 202) + '00'.repeat(8193) },
  ];
  for (const value of malformed) await rejected(f.service.request(request('eth_call', [value, BLOCK])), 'RPC_INVALID_REQUEST');
  assert.equal(f.calls.length, 0);
});

test('requests are snapshotted before waits and accessor/toJSON data cannot run', async () => {
  const f = setup(payload => ({ jsonrpc: '2.0', id: payload.id, result: '0x' }));
  const value = code(), pending = f.service.request(value); value.params[0] = '0x' + '11'.repeat(20); value.params[1].blockHash = '0x' + '22'.repeat(32);
  await pending; assert.deepEqual(f.calls[0].payload.params, [ADDRESS, BLOCK]);
  let ran = false;
  const evil = { params: [] }; Object.defineProperty(evil, 'method', { get() { ran = true; throw new Error('private material'); } });
  await rejected(f.service.request(evil), 'RPC_INVALID_REQUEST'); assert.equal(ran, false);
  const evilBlock = { ...BLOCK, toJSON() { ran = true; return 'latest'; } };
  await rejected(f.service.request(request('eth_getCode', [ADDRESS, evilBlock])), 'RPC_INVALID_REQUEST'); assert.equal(ran, false);
  const evilOptions = {}; Object.defineProperty(evilOptions, 'signal', { get() { ran = true; throw new Error('private material'); } });
  await rejected(f.service.request(chain(), evilOptions), 'RPC_INVALID_REQUEST'); assert.equal(ran, false);
  for (const options of [null, { signal: {} }, { endpoint: 'https://example.invalid' }]) await rejected(f.service.request(chain(), options), 'RPC_INVALID_REQUEST');
});

test('already-aborted requests send nothing; active cancellation defeats a fetch that ignores abort', async () => {
  const f = setup(() => new Promise(() => {}));
  const before = new AbortController(); before.abort(); await rejected(f.service.request(chain(), { signal: before.signal }), 'RPC_CANCELED'); assert.equal(f.calls.length, 0);
  const active = new AbortController(), pending = f.service.request(chain(), { signal: active.signal }); await new Promise(resolve => setImmediate(resolve));
  active.abort(); const error = await rejected(pending, 'RPC_CANCELED'); assert.equal(error.rpcMethod, 'eth_chainId'); assert.equal(f.calls[0].init.signal.aborted, true);
});

test('the deadline bounds a never-resolving fetch and leaves no late result usable', async () => {
  const gate = defer(), f = setup(() => gate.promise, { timeoutMs: 10 });
  await rejected(f.service.request(chain()), 'RPC_TIMEOUT'); assert.equal(f.calls[0].init.signal.aborted, true);
  gate.resolve(response({ jsonrpc: '2.0', id: 1, result: '0x1' })); await new Promise(resolve => setImmediate(resolve));
  assert.equal(f.calls.length, 1);
});

test('deadline and caller cancellation also bound body reads and non-stream text waits', async () => {
  let cancellations = 0;
  const blockedStream = () => ({ ok: true, status: 200, headers: { get: () => null }, body: { getReader: () => ({ read: () => new Promise(() => {}), cancel() { cancellations++; return new Promise(() => {}); }, releaseLock() {} }) } });
  const timed = setup(blockedStream, { timeoutMs: 10 }); await rejected(timed.service.request(chain()), 'RPC_TIMEOUT'); assert.equal(cancellations, 1);
  const canceled = setup(blockedStream), abort = new AbortController(), pending = canceled.service.request(chain(), { signal: abort.signal });
  await new Promise(resolve => setImmediate(resolve)); abort.abort(); await rejected(pending, 'RPC_CANCELED'); assert.equal(cancellations, 2);
  const text = setup(() => ({ ok: true, status: 200, headers: { get: () => null }, text: () => new Promise(() => {}) }), { timeoutMs: 10 });
  await rejected(text.service.request(chain()), 'RPC_TIMEOUT');
});

test('content length and streamed/fallback UTF-8 bytes are bounded before parsing', async () => {
  const tooLong = setup(() => new Response('{}', { status: 200, headers: { 'content-length': '2048' } }), { maxBytes: 1024 });
  await rejected(tooLong.service.request(chain()), 'RPC_TOO_LARGE');
  const stream = setup(() => new Response('x'.repeat(1025)), { maxBytes: 1024 }); await rejected(stream.service.request(chain()), 'RPC_TOO_LARGE');
  const unicode = setup(() => ({ ok: true, status: 200, headers: { get: () => null }, text: async () => 'é'.repeat(513) }), { maxBytes: 1024 });
  await rejected(unicode.service.request(chain()), 'RPC_TOO_LARGE');
});

test('malformed envelopes, ambiguous duplicate keys and mismatched reply IDs are rejected', async () => {
  for (const raw of [
    '{', '[]', 'null', '{"jsonrpc":"1.0","id":1,"result":"0x1"}', '{"jsonrpc":"2.0","id":"1","result":"0x1"}',
    '{"jsonrpc":"2.0","id":2,"result":"0x1"}', '{"jsonrpc":"2.0","id":1}',
    '{"jsonrpc":"2.0","id":1,"result":"0x1","error":{"code":-1,"message":"no"}}',
    '{"jsonrpc":"2.0","id":1,"result":"0x1","extra":true}',
    '{"jsonrpc":"2.0","id":2,"id":1,"result":"0x1"}', '{"jsonrpc":"2.0","id":1,"result":"0x2","resu\\u006ct":"0x1"}',
  ]) {
    const f = setup(() => new Response(raw)); await rejected(f.service.request(chain()), 'RPC_MALFORMED');
  }
});

test('bounded JSON inspection rejects excessive depth and node count', async () => {
  const deep = '['.repeat(34) + '0' + ']'.repeat(34);
  const many = '[' + Array(100001).fill('0').join(',') + ']';
  for (const raw of [deep, many]) {
    const f = setup(() => new Response(raw)); await rejected(f.service.request(chain()), 'RPC_MALFORMED');
  }
});

test('invalid result types and wrong-chain replies cannot be accepted', async () => {
  for (const result of [null, {}, 1, '1', '0x01', '0xA']) { const f = setup(p => ({ jsonrpc: '2.0', id: p.id, result })); await rejected(f.service.request(chain()), 'RPC_MALFORMED'); }
  const wrong = setup(p => ({ jsonrpc: '2.0', id: p.id, result: '0x89' })); await rejected(wrong.service.request(chain()), 'RPC_WRONG_CHAIN');
  for (const result of [null, { number: '0x01', hash: HASH }, { number: '0x1', hash: '0x12' }]) { const f = setup(p => ({ jsonrpc: '2.0', id: p.id, result })); await rejected(f.service.request(request('eth_getBlockByNumber', ['latest', false])), 'RPC_MALFORMED'); }
  for (const result of ['0x0', 'javascript:', '0x' + '11'.repeat(65537)]) { const f = setup(p => ({ jsonrpc: '2.0', id: p.id, result })); await rejected(f.service.request(code()), 'RPC_MALFORMED'); }
  const longCall = setup(p => ({ jsonrpc: '2.0', id: p.id, result: '0x' + '00'.repeat(33) })); await rejected(longCall.service.request(call()), 'RPC_MALFORMED');
  const emptyCode = setup(p => ({ jsonrpc: '2.0', id: p.id, result: '0X' })); assert.equal(await emptyCode.service.request(code()), '0x');
});

test('remote errors retain only the safe method and integer code, never message/data/address', async () => {
  const secret = `private ${ADDRESS} signature ${CALL.data}`, f = setup(p => ({ jsonrpc: '2.0', id: p.id, error: { code: -32602, message: secret, data: { password: secret } } }));
  const error = await rejected(f.service.request(call()), 'RPC_REMOTE_ERROR'); assert.equal(error.rpcCode, -32602); assert.equal(error.rpcMethod, 'eth_call');
  assert.match(error.message, /eth_call.*-32602/); assert.equal(error.message.includes(ADDRESS), false); assert.equal(error.message.includes('private'), false);
  assert.deepEqual(Object.keys(error), ['code', 'rpcMethod', 'rpcCode']); assert.equal(error.cause, undefined); assert.equal(error.data, undefined);
});

test('malformed remote errors, HTTP failures and transport exceptions disclose no raw data', async () => {
  for (const error of [{ code: -1.5, message: ADDRESS }, { code: '-1', message: ADDRESS }, { code: 2147483648, message: ADDRESS }, { code: -32602 }, { code: -1, message: ADDRESS, debug: ADDRESS }]) {
    const f = setup(p => ({ jsonrpc: '2.0', id: p.id, error })); const caught = await rejected(f.service.request(chain()), 'RPC_MALFORMED'); assert.equal(caught.rpcCode, undefined); assert.equal(caught.message.includes(ADDRESS), false);
  }
  const denied = setup(() => new Response(ADDRESS, { status: 403 })); const httpError = await rejected(denied.service.request(chain()), 'RPC_HTTP'); assert.equal(httpError.message.includes(ADDRESS), false);
  const exploded = setup(() => { throw Object.assign(new Error(ADDRESS), { code: -32602, data: CALL }); });
  const transportError = await rejected(exploded.service.request(code()), 'RPC_FAILED'); assert.equal(transportError.rpcCode, undefined); assert.equal(transportError.message.includes(ADDRESS), false);
});

test('invalid configuration cannot turn this into an unbounded or arbitrary endpoint transport', () => {
  for (const options of [{ timeoutMs: 0 }, { timeoutMs: Infinity }, { timeoutMs: 30001 }, { maxBytes: 0 }, { maxBytes: 2097153 }, { maxBytes: NaN }, { fetchImpl: null }]) assert.throws(() => createEthereumReadService(options), { code: 'RPC_CONFIGURATION' });
});
