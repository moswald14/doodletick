// SPDX-License-Identifier: GPL-3.0-only
// Disposable EOA keys and in-process providers only; no extension or live RPC.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createDvcWallet } from '../public/dvc-wallet.mjs';
import { createTransferDraft, verifyTransfer, MAIN_NETWORK_ID } from '../public/dvc-core.mjs';
import { SigningKey, computeAddress, TypedDataEncoder } from '../public/recipient-crypto.mjs';

const key = new SigningKey('0x' + '39'.repeat(32)), otherKey = new SigningKey('0x' + '40'.repeat(32));
const address = computeAddress(key.publicKey).toLowerCase(), otherAddress = computeAddress(otherKey.publicKey).toLowerCase();
const providerId = 'eip6963:198f3d43-4ea2-48fa-9398-3e9079916823';
function deferred() { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; }
const flush = () => new Promise(resolve => setTimeout(resolve, 0));
async function until(predicate) { for (let i = 0; i < 100; i++) { if (predicate()) return; await flush(); } assert.fail('Wallet fixture did not settle.'); }
function fixture(options = {}) {
  const target = new EventTarget(), calls = [], changes = [], listeners = new Map();
  let exposed = options.accounts || [address], chain = '0x1', requestHook = null, signHook = null;
  const provider = { on(name, fn) { listeners.set(name, fn); }, removeListener(name, fn) { if (listeners.get(name) === fn) listeners.delete(name); },
    async request(request) {
      calls.push(structuredClone(request));
      if (requestHook) { const value = requestHook(request); if (value !== undefined) return value; }
      if (request.method === 'eth_accounts' || request.method === 'eth_requestAccounts') return [...exposed];
      if (request.method === 'eth_chainId') return chain;
      if (request.method === 'eth_signTypedData_v4') {
        const data = JSON.parse(request.params[1]), { EIP712Domain, ...types } = data.types;
        const signature = key.sign(TypedDataEncoder.hash(data.domain, types, data.message)).serialized;
        return signHook ? signHook(signature, request) : signature;
      }
      throw Error('Unpermitted fixture request.');
    } };
  const announce = (value = provider) => { const event = new Event('eip6963:announceProvider'); Object.defineProperty(event, 'detail', { value: { info: { uuid: providerId.slice(8), name: '<Disposable>\nWallet', icon: 'data:untrusted', rdns: 'fixture.invalid' }, provider: value } }); target.dispatchEvent(event); };
  target.addEventListener('eip6963:requestProvider', () => announce());
  const wallet = createDvcWallet({ eventTarget: target, getLegacyProvider: () => provider, onChange: value => changes.push(value), ...options });
  return { wallet, provider, calls, changes, listeners, announce,
    setAccounts(value, emit = true) { exposed = value; if (emit) listeners.get('accountsChanged')?.(value); },
    setChain(value, emit = true) { chain = value; if (emit) listeners.get('chainChanged')?.(value); },
    hookRequest(value) { requestHook = value; }, hookSign(value) { signHook = value; },
    async ready() { wallet.discover(); await wallet.connect(providerId); },
    draft(sender = address) { return createTransferDraft({ sender, recipient: otherAddress, amountAtoms: '123456789', feeAtoms: '1000', nonce: '0', validUntilHeight: '144' }); },
  };
}

test('native wallet is inert until explicit discovery and connection, then signs only fixed native typed data', async () => {
  const f = fixture();
  try {
    assert.deepEqual(f.calls, []); assert.deepEqual(f.wallet.state().providers, []);
    f.wallet.discover(); assert.equal(f.calls.length, 0); assert.equal(f.wallet.state().providers[0].name, '<Disposable>Wallet');
    await f.wallet.connect(providerId); const snapshot = await f.wallet.review();
    const signed = await f.wallet.signTransfer(f.draft(), { snapshot }); const verified = verifyTransfer(signed, { height: '1' });
    assert.equal(verified.sender, address); assert.equal(verified.amountAtoms, '123456789');
    const sign = f.calls.find(row => row.method === 'eth_signTypedData_v4'), data = JSON.parse(sign.params[1]);
    assert.equal(sign.params[0], address); assert.equal(data.domain.name, 'Doodleverse Native Coin'); assert.equal(data.domain.salt, '0x' + MAIN_NETWORK_ID);
    assert.equal(data.domain.chainId, undefined); assert.equal(data.primaryType, 'DoodleverseTransfer');
    assert.deepEqual(data.message, { networkId: MAIN_NETWORK_ID, sender: address, recipient: otherAddress, amountAtoms: '123456789', feeAtoms: '1000', nonce: '0', validUntilHeight: '144' });
    assert.deepEqual([...new Set(f.calls.map(row => row.method))].sort(), ['eth_accounts', 'eth_chainId', 'eth_requestAccounts', 'eth_signTypedData_v4'].sort());
    await assert.rejects(f.wallet.signTransfer(f.draft(), { snapshot }), /fresh transfer/);
  } finally { f.wallet.destroy(); }
});

test('multiple exposed accounts require explicit selection and spoofed or old reviews cannot sign', async () => {
  const f = fixture({ accounts: [address, otherAddress] });
  try {
    await f.ready(); assert.equal(f.wallet.state().address, null); await assert.rejects(f.wallet.review(), /choose/);
    f.wallet.select(address); const snapshot = await f.wallet.review();
    await assert.rejects(f.wallet.signTransfer(f.draft(), { snapshot: { ...snapshot } }), /no longer current/);
    await f.wallet.review(); await assert.rejects(f.wallet.signTransfer(f.draft(), { snapshot }), /no longer current/);
    assert.equal(f.calls.some(row => row.method === 'eth_signTypedData_v4'), false);
    assert.throws(() => f.wallet.select('0x' + '00'.repeat(20)), /exposed/);
  } finally { f.wallet.destroy(); }
});

for (const change of ['account event', 'network event', 'silent account', 'silent network', 'provider replacement']) {
  test(`a ${change} invalidates transfer review before any signature prompt`, async () => {
    const f = fixture();
    try {
      await f.ready(); const snapshot = await f.wallet.review();
      if (change === 'account event') f.setAccounts([otherAddress]);
      if (change === 'network event') f.setChain('0x2');
      if (change === 'silent account') f.setAccounts([otherAddress], false);
      if (change === 'silent network') f.setChain('0x2', false);
      if (change === 'provider replacement') f.announce({ ...f.provider });
      await assert.rejects(f.wallet.signTransfer(f.draft(), { snapshot }), /changed|no longer current/);
      assert.equal(f.calls.some(row => row.method === 'eth_signTypedData_v4'), false);
    } finally { f.wallet.destroy(); }
  });
}

for (const interrupt of ['abort', 'cancel', 'account', 'network', 'guard', 'destroy']) {
  test(`a late wallet signature is discarded after ${interrupt}`, async () => {
    const f = fixture(), gate = deferred(), controller = new AbortController(); let allowed = true;
    try {
      await f.ready(); const snapshot = await f.wallet.review(); f.hookSign(signature => gate.promise.then(() => signature));
      const pending = f.wallet.signTransfer(f.draft(), { snapshot, signal: controller.signal, guard: () => allowed });
      const rejection = assert.rejects(pending, /canceled|changed|no longer current|review changed/i);
      await until(() => f.calls.some(row => row.method === 'eth_signTypedData_v4'));
      if (interrupt === 'abort') controller.abort(); if (interrupt === 'cancel') f.wallet.cancel();
      if (interrupt === 'account') f.setAccounts([otherAddress]); if (interrupt === 'network') f.setChain('0x2');
      if (interrupt === 'guard') allowed = false; if (interrupt === 'destroy') f.wallet.destroy();
      gate.resolve(); await rejection;
      assert.equal(f.calls.filter(row => row.method === 'eth_signTypedData_v4').length, 1);
    } finally { gate.resolve(); f.wallet.destroy(); }
  });
}

test('a timed-out signing prompt stays reserved until the underlying extension finishes', async () => {
  const f = fixture({ signatureTimeoutMs: 15 }), gate = deferred();
  try {
    await f.ready(); const snapshot = await f.wallet.review(); f.hookSign(signature => gate.promise.then(() => signature));
    await assert.rejects(f.wallet.signTransfer(f.draft(), { snapshot }), /timed out/);
    assert.equal(f.wallet.state().promptPending, true); await assert.rejects(f.wallet.connect(providerId), /open wallet prompt/);
    gate.resolve(); await until(() => !f.wallet.state().promptPending);
    assert.equal(f.calls.filter(row => row.method === 'eth_signTypedData_v4').length, 1);
  } finally { gate.resolve(); f.wallet.destroy(); }
});

test('read deadlines bound a provider that ignores cancellation', async () => {
  const f = fixture({ rpcTimeoutMs: 15 });
  try { await f.ready(); f.hookRequest(request => request.method === 'eth_accounts' ? new Promise(() => {}) : undefined); await assert.rejects(f.wallet.review(), /timed out/); }
  finally { f.wallet.destroy(); }
});

test('provider error details and rejected or foreign signatures never leave the adapter', async () => {
  const f = fixture();
  try {
    await f.ready(); let snapshot = await f.wallet.review();
    f.hookSign(() => { throw Object.assign(Error('SECRET wallet metadata https://invalid/' + address), { code: -32603 }); });
    await assert.rejects(f.wallet.signTransfer(f.draft(), { snapshot }), error => !error.message.includes('SECRET') && !error.message.includes(address) && error.code === 'DVC_WALLET_REQUEST');
    snapshot = await f.wallet.review(); f.hookSign(() => { throw Object.assign(Error('SECRET'), { code: 4001 }); });
    await assert.rejects(f.wallet.signTransfer(f.draft(), { snapshot }), /declined/);
    snapshot = await f.wallet.review(); f.hookSign((_signature, request) => { const data = JSON.parse(request.params[1]); return otherKey.sign(TypedDataEncoder.hash(data.domain, { DoodleverseTransfer: data.types.DoodleverseTransfer }, data.message)).serialized; });
    await assert.rejects(f.wallet.signTransfer(f.draft(), { snapshot }), /does not match/);
    assert.equal(f.calls.filter(row => row.method === 'eth_signTypedData_v4').length, 3);
  } finally { f.wallet.destroy(); }
});

test('draft replay domain, sender and extra fields are checked before prompting', async () => {
  const f = fixture();
  try {
    await f.ready(); const snapshot = await f.wallet.review();
    for (const draft of [{ ...f.draft(), networkId: '0'.repeat(64) }, { ...f.draft(), spender: otherAddress }, f.draft(otherAddress)]) {
      await assert.rejects(f.wallet.signTransfer(draft, { snapshot }));
    }
    assert.equal(f.calls.some(row => row.method === 'eth_signTypedData_v4'), false);
  } finally { f.wallet.destroy(); }
});

test('destroy removes provider listeners and makes the wallet inert', async () => {
  const f = fixture(); await f.ready(); assert.equal(f.listeners.size, 3); f.wallet.destroy(); assert.equal(f.listeners.size, 0);
  const count = f.calls.length; assert.deepEqual(f.wallet.discover(), []); await assert.rejects(f.wallet.connect(providerId)); assert.equal(f.calls.length, count);
});

test('a provider initialization exception is sanitized and partial listeners are removed', async () => {
  const f = fixture();
  try {
    f.wallet.discover(); let calls = 0; const originalOn = f.provider.on;
    f.provider.on = (name, callback) => { if (++calls === 2) throw Error('SECRET extension internals'); originalOn(name, callback); };
    await assert.rejects(f.wallet.connect(providerId), error => /could not initialize/.test(error.message) && !error.message.includes('SECRET'));
    assert.equal(f.listeners.size, 0); assert.equal(f.wallet.state().address, null); assert.equal(f.calls.length, 0);
  } finally { f.wallet.destroy(); }
});
