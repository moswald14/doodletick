// SPDX-License-Identifier: GPL-3.0-only
import test from 'node:test';
import assert from 'node:assert/strict';
import { JazzNamingClient } from '../public/jazz-name-client.mjs';
import { PEPE_CHAIN_ID, PEPE_CONTRACT } from '../public/jazz-name-contract.mjs';
import { payer, recipient, context, result, txHash, testTime } from './jazz-name-fixture.mjs';
function fixture() {
  const store = new Map(), calls = [], walletCalls = [];
  const f = { account: payer, chain: '0x1', sendError: null, sends: 0, walletPause: null, ready: true, serverStatus: 'quoted', paid: false,
    q: { id: '12'.repeat(16), capability: '34'.repeat(32), payer, recipient, context, amount: (5000n * 10n ** 18n).toString(), chainId: PEPE_CHAIN_ID, contract: PEPE_CONTRACT, expiresAt: testTime + 300000, status: 'quoted' } };
  const storage = { getItem: key => store.get(key) || null, setItem: (key, value) => store.set(key, value) };
  const fetcher = async (url, init) => {
    calls.push({ url, init }); const op = url.split('/').at(-1);
    const reply = op === 'config' ? { ready: f.ready, recipient } : op === 'quote' ? f.q
      : { id: f.q.id, status: f.serverStatus, paid: f.paid, hash: f.paid ? txHash : null, message: 'Fixture status', result: f.serverStatus === 'complete' ? result : null };
    return { ok: true, json: async () => structuredClone(reply) };
  };
  const provider = { request: async request => {
    walletCalls.push(request);
    switch (request.method) {
      case 'eth_requestAccounts': case 'eth_accounts': return [f.account];
      case 'eth_chainId': return f.chain;
      case 'eth_call': return '0x' + (10000n * 10n ** 18n).toString(16).padStart(64, '0');
      case 'eth_estimateGas': return '0x10000';
      case 'eth_gasPrice': return '0x1';
      case 'eth_getBalance': return '0x100000000';
      case 'eth_sendTransaction': f.sends++; if (f.walletPause) await f.walletPause; if (f.sendError) throw f.sendError; f.serverStatus = 'pending'; return txHash;
      default: throw new Error('Unexpected wallet method.');
    }
  } };
  f.client = new JazzNamingClient({ fetcher, storage, now: () => testTime });
  Object.assign(f, { storage, store, fetcher, provider, calls, walletCalls }); return f;
}
async function quoted(f) { await f.client.config(); await f.client.getQuote(f.provider, context); }

test('getting a quote never sends money; only explicit Pay opens one exact transfer', async () => {
  const f = fixture(); await quoted(f); assert.equal(f.sends, 0);
  await f.client.pay(f.provider); assert.equal(f.sends, 1);
  const tx = f.walletCalls.find(call => call.method === 'eth_sendTransaction').params[0];
  assert.equal(tx.to, PEPE_CONTRACT); assert.equal(tx.chainId, '0x1'); assert.equal(tx.value, '0x0');
  assert.equal(tx.data.slice(0, 10), '0xa9059cbb');
  assert(f.calls.every(c => c.url.startsWith('./api/jazz-name/')));
  assert(f.calls.filter(c => c.init.method === 'POST').every(c => c.init.headers['X-Keeper-Request'] === '1'));
  assert(!f.walletCalls.some(c => /sign|approve/i.test(c.method)));
  await assert.rejects(f.client.pay(f.provider), /do not pay again/i); assert.equal(f.sends, 1);
});

test('expired quotes, changed accounts, changed networks and disabled service cannot send money', async () => {
  for (const change of [f => { f.client.receipt.expiresAt = testTime; }, f => { f.account = recipient; }, f => { f.chain = '0x2105'; }, f => { f.ready = false; }]) {
    const f = fixture(); await quoted(f); change(f);
    await assert.rejects(f.client.pay(f.provider)); assert.equal(f.sends, 0);
  }
});

test('rapid Pay clicks send once and the hash is saved before payment checking', async () => {
  const f = fixture(); await quoted(f);
  let release; f.walletPause = new Promise(resolve => { release = resolve; });
  const first = f.client.pay(f.provider);
  await assert.rejects(f.client.pay(f.provider), /Resume/);
  release(); await first; assert.equal(f.sends, 1);
  assert.equal(JSON.parse([...f.store.values()][0]).hash, txHash);
});

test('an unknown wallet outcome survives refresh as recovery-only and never offers another send', async () => {
  const f = fixture(); await quoted(f); f.sendError = new Error('Disconnected after broadcast');
  await assert.rejects(f.client.pay(f.provider), /Do not pay again/); assert.equal(f.client.receipt.status, 'uncertain');
  const restored = new JazzNamingClient({ fetcher: f.fetcher, storage: f.storage, now: () => testTime });
  await restored.check(); assert.equal(restored.receipt.status, 'uncertain');
  await assert.rejects(restored.pay(f.provider), /do not pay again/i); assert.equal(f.sends, 1);
  f.serverStatus = 'pending'; await restored.check(txHash); assert.equal(restored.receipt.hash, txHash);
});

test('explicit wallet rejection can be retried but unavailable storage blocks the wallet dialog', async () => {
  const f = fixture(); await quoted(f); f.sendError = Object.assign(new Error('Rejected'), { code: 4001 });
  await assert.rejects(f.client.pay(f.provider), /canceled/); assert.equal(f.client.receipt.status, 'quoted');
  f.storage.setItem = () => { throw new Error('Storage disabled'); };
  await assert.rejects(f.client.pay(f.provider), /cannot save/); assert.equal(f.sends, 1);
});

test('restoring a paid result or retrying generation never sends a second transfer', async () => {
  const f = fixture(); await quoted(f); await f.client.pay(f.provider);
  f.paid = true; f.serverStatus = 'retry'; await f.client.check(); await f.client.retry();
  f.serverStatus = 'complete'; await f.client.check(); assert.deepEqual(f.client.receipt.result, result);
  const restored = new JazzNamingClient({ fetcher: f.fetcher, storage: f.storage, now: () => testTime });
  await restored.check(); assert.deepEqual(restored.receipt.result, result); assert.equal(f.sends, 1);
});

test('tampered quote recipients and tokens are rejected before a transfer', async () => {
  for (const change of [q => { q.recipient = payer; }, q => { q.contract = recipient; }, q => { q.chainId = '0x2105'; }]) {
    const f = fixture(); change(f.q); await f.client.config();
    await assert.rejects(f.client.getQuote(f.provider, context)); assert.equal(f.sends, 0);
  }
});

test('the default browser fetch retains its global receiver', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async function () { assert.equal(this, globalThis); return { ok: true, json: async () => ({ ready: false }) }; };
  try {
    const client = new JazzNamingClient({ storage: { getItem: () => null } });
    assert.equal((await client.config()).ready, false);
  } finally { globalThis.fetch = original; }
});
