// SPDX-License-Identifier: GPL-3.0-only
// Disposable in-memory providers and public test keys only. No wallet/network.
import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { createHash } from 'node:crypto';
import { createDoodleverseWallet } from '../public/doodleverse-wallet.mjs';
import { newIdentity } from '../public/core.mjs';
import { createFounderProposal, verifyFounderProposal, createFounderProof, verifyFounderProof, proofMessage, meetsTarget } from '../public/doodleverse-coin.mjs';
import { createRecipientProposal, verifyRecipientAuthorization, recipientTypedData, encodeRecipient1271Call, RECIPIENT_LIMITS } from '../public/doodleverse-recipient.mjs';
import { SigningKey, computeAddress, TypedDataEncoder } from '../public/recipient-crypto.mjs';

const key = new SigningKey('0x' + '1'.repeat(64)), otherKey = new SigningKey('0x' + '2'.repeat(64));
const address = computeAddress(key.publicKey).toLowerCase(), otherAddress = computeAddress(otherKey.publicKey).toLowerCase();
const HASH = '0x' + 'a'.repeat(64), NEXT_HASH = '0x' + 'b'.repeat(64), BLOCK = { number: '16', hash: HASH };
const UUID = 'c154755b-1d7f-4ea8-8819-70588d1ff093';
const turn = () => new Promise(resolve => setImmediate(resolve));
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };
let identity, sourceProof, sourceProofId;
test.before(async () => {
  identity = await newIdentity('WalletFixture');
  const proposal = await createFounderProposal(identity, { difficulty: 16 }), checked = await verifyFounderProposal(proposal);
  for (let nonce = 0n; nonce < 4194304n; nonce++) {
    const digest = createHash('sha256').update(proofMessage(checked.challengeHex, nonce.toString())).digest('hex');
    if (meetsTarget(digest, checked.targetHex)) { sourceProof = await createFounderProof(proposal, nonce.toString()); break; }
  }
  assert(sourceProof); sourceProofId = '0x' + (await verifyFounderProof(sourceProof)).proofId;
});
function announce(target, provider, uuid = UUID, more = {}) {
  const event = new Event('eip6963:announceProvider');
  Object.defineProperty(event, 'detail', { value: { provider, info: { uuid, name: 'Fixture wallet', rdns: 'test.fixture', ...more } } });
  target.dispatchEvent(event);
}
class Provider extends EventEmitter {
  constructor() { super(); this.calls = []; this.accounts = [address]; this.chain = '0x1'; this.code = '0x'; this.blockHash = HASH; this.magic = '0x1626ba7e' + '0'.repeat(56); this.intercept = null; }
  async request(request) {
    const copy = structuredClone(request); this.calls.push(copy);
    const value = () => {
      switch (request.method) {
        case 'eth_requestAccounts': case 'eth_accounts': return [...this.accounts];
        case 'eth_chainId': return this.chain;
        case 'eth_getBlockByNumber': assert.equal(request.params[1], false); return { number: '0x10', hash: this.blockHash };
        case 'eth_getCode': assert.deepEqual(request.params[1], { blockHash: HASH, requireCanonical: true }); return this.code;
        case 'eth_signTypedData_v4': {
          const data = JSON.parse(request.params[1]), types = { ...data.types }; delete types.EIP712Domain;
          return key.sign(TypedDataEncoder.hash(data.domain, types, data.message)).serialized;
        }
        case 'eth_call': assert.equal(request.params[0].gas, '0x7a120'); assert.deepEqual(request.params[1], { blockHash: HASH, requireCanonical: true }); return this.magic;
        default: assert.fail('Prohibited wallet method requested: ' + request.method);
      }
    };
    return this.intercept ? this.intercept(copy, value) : value();
  }
}
function fixture(t, options = {}) {
  const target = new EventTarget(), provider = new Provider(), changes = [];
  let legacy = provider;
  const wallet = createDoodleverseWallet({ eventTarget: target, getLegacyProvider: () => legacy, onChange: event => changes.push(event), rpcTimeoutMs: 200, signatureTimeoutMs: 500, ...options });
  wallet.discover(); announce(target, provider);
  t.after(() => wallet.destroy());
  return { wallet, provider, target, changes, replaceLegacy: value => { legacy = value; } };
}
async function review(f, options = {}, proposalOptions = {}) {
  if (!f.wallet.state().providerId) await f.wallet.connect('eip6963:' + UUID);
  const snapshot = await f.wallet.readRecipientContext({ sourceProofId, ...options });
  const proposal = await createRecipientProposal(identity, sourceProof, { ...snapshot, difficulty: 16, ...proposalOptions });
  return { snapshot, proposal };
}
function signerCount(provider) { return provider.calls.filter(call => call.method === 'eth_signTypedData_v4').length; }

test('EIP6963 discovery never requests accounts, trusts no brand and never touches untrusted icons', t => {
  const f = fixture(t);
  const info = { name: '<b>Coinbase impostor</b>', rdns: 'untrusted.example' };
  Object.defineProperty(info, 'icon', { enumerable: true, get() { assert.fail('Wallet icons must not be read'); } });
  const event = new Event('eip6963:announceProvider');
  Object.defineProperty(event, 'detail', { value: { provider: new Provider(), info: Object.assign(Object.create(null), { uuid: 'd154755b-1d7f-4ea8-8819-70588d1ff093', name: info.name, rdns: info.rdns }) } });
  Object.defineProperty(event.detail.info, 'icon', { get() { assert.fail('Wallet icons must not be read'); } });
  f.target.dispatchEvent(event);
  const rows = f.wallet.discover();
  assert.equal(rows.length, 2); assert.equal(f.provider.calls.length, 0);
  assert.equal(f.wallet.state().providerId, null);
  assert.equal(rows[1].name, info.name);
  for (const row of rows) assert.deepEqual(Object.keys(row).sort(), ['id', 'kind', 'name', 'rdns']);
  announce(f.target, new Provider(), 'bad UUID'); assert.equal(f.wallet.discover().length, 2);
  assert.equal(f.wallet.request, undefined); assert.equal(f.wallet.signTypedData, undefined);
});
test('legacy injection is an explicit unnamed choice and replacement invalidates its snapshot', async t => {
  const f = fixture(t);
  assert(!f.wallet.discover().some(row => row.kind === 'legacy'));
  assert.equal(f.wallet.discover({ includeLegacy: true }).find(row => row.id === 'legacy').name, 'Other injected wallet (legacy)');
  await f.wallet.connect('legacy'); const snapshot = await f.wallet.readRecipientContext({ sourceProofId });
  f.replaceLegacy(new Provider());
  assert.throws(() => f.wallet.assertCurrent(snapshot), /provider changed/i);
  assert.equal(f.wallet.state().address, null); assert(f.changes.some(event => event.invalidated));
});
test('multiple accounts require explicit selection and normal connect/select do not emit invalidation', async t => {
  const f = fixture(t); f.provider.accounts = [address, otherAddress];
  const connected = await f.wallet.connect('eip6963:' + UUID);
  assert.deepEqual(connected.accounts, [address, otherAddress]); assert.equal(connected.address, null); assert.equal(connected.chainId, '1');
  await assert.rejects(f.wallet.readRecipientContext({ sourceProofId }), /Select an account/);
  assert.throws(() => f.wallet.select('0x' + '3'.repeat(40)), /exposed/);
  f.wallet.select(otherAddress); assert.equal((await f.wallet.readRecipientContext({ sourceProofId })).address, otherAddress);
  assert(f.changes.every(event => !event.invalidated));
});
test('EOA authorization sends one fixed protocol message and verifies it without financial RPC calls', async t => {
  const f = fixture(t), { snapshot, proposal } = await review(f);
  assert(Object.isFrozen(snapshot)); assert(Object.isFrozen(snapshot.verificationBlock));
  const signed = await f.wallet.signRecipient(proposal, { snapshot });
  assert.equal((await verifyRecipientAuthorization(signed)).method, 'eoa-offline');
  assert.equal(proposal.walletSignature, null);
  const calls = f.provider.calls, sign = calls.find(call => call.method === 'eth_signTypedData_v4'), data = JSON.parse(sign.params[1]);
  assert.equal(sign.params[0], address); assert.equal(data.domain.chainId, '1');
  assert.equal(data.domain.name, 'Doodleverse Founder Recipient'); assert.equal(data.message.allocationAtoms, '100000000000000');
  assert.equal(data.message.sourceProofId, sourceProofId); assert.equal(data.message.recipient, address);
  assert.equal(data.domain.verifyingContract, undefined);
  assert.deepEqual(data, await recipientTypedData(proposal));
  assert.equal(signerCount(f.provider), 1);
  const allowed = new Set(['eth_requestAccounts', 'eth_accounts', 'eth_chainId', 'eth_getBlockByNumber', 'eth_getCode', 'eth_signTypedData_v4']);
  for (const call of calls) assert(allowed.has(call.method));
  await assert.rejects(f.wallet.signRecipient(proposal, { snapshot }), /fresh authorization/);
  assert.equal(signerCount(f.provider), 1);
});
test('arbitrary typed data and changed recipient/source/block are rejected before the wallet prompt', async t => {
  const f = fixture(t);
  for (const change of [
    () => ({ domain: { name: 'Permit2' }, types: {}, message: {} }),
    value => { value.manifest.recipient.address = otherAddress; return value; },
    value => { value.manifest.sourceProofId = NEXT_HASH; return value; },
    value => { value.manifest.verificationBlock.hash = NEXT_HASH; return value; },
    value => { value.manifest.allocationAtoms = '1'; return value; }
  ]) {
    const { snapshot, proposal } = await review(f);
    await assert.rejects(f.wallet.signRecipient(change(structuredClone(proposal)), { snapshot }));
  }
  assert.equal(signerCount(f.provider), 0);
});
test('signature rejection and unsupported results have no signing or transaction fallback', async t => {
  const f = fixture(t);
  for (const value of [Object.assign(Error('private provider text'), { code: 4001 }), '0xzz', '0x' + '11'.repeat(8193), '0x' + '11'.repeat(20) + '6492'.repeat(16)]) {
    const { snapshot, proposal } = await review(f);
    f.provider.intercept = (request, normal) => {
      if (request.method !== 'eth_signTypedData_v4') return normal();
      if (value instanceof Error) throw value; return value;
    };
    await assert.rejects(f.wallet.signRecipient(proposal, { snapshot }), value instanceof Error ? /declined/ : undefined);
    f.provider.intercept = null;
  }
  assert.equal(signerCount(f.provider), 4);
  assert(!f.provider.calls.some(call => /personal_sign|eth_sign$|sendTransaction|approve|switch|sendCalls/.test(call.method)));
});
test('a signature from another EOA does not verify the selected recipient', async t => {
  const f = fixture(t), { snapshot, proposal } = await review(f);
  f.provider.intercept = (request, normal) => {
    if (request.method !== 'eth_signTypedData_v4') return normal();
    const data = JSON.parse(request.params[1]), types = { ...data.types }; delete types.EIP712Domain;
    return otherKey.sign(TypedDataEncoder.hash(data.domain, types, data.message)).serialized;
  };
  await assert.rejects(f.wallet.signRecipient(proposal, { snapshot }), /does not match/);
});
test('account and chain events invalidate even when the old values are restored', async t => {
  const f = fixture(t), { snapshot } = await review(f);
  f.provider.emit('chainChanged', '0x2'); f.provider.emit('chainChanged', '0x1');
  assert.throws(() => f.wallet.assertCurrent(snapshot), /no longer current/);
  const next = await f.wallet.readRecipientContext({ sourceProofId });
  f.provider.emit('accountsChanged', [otherAddress]); f.provider.emit('accountsChanged', [address]);
  assert.throws(() => f.wallet.assertCurrent(next)); assert.equal(f.wallet.state().address, null);
  assert(f.changes.filter(event => event.invalidated).length >= 4);
});
test('every awaited context RPC discards results after provider disconnect', async t => {
  for (let boundary = 1; boundary <= 8; boundary++) {
    const f = fixture(t); await f.wallet.connect('eip6963:' + UUID); let calls = 0;
    f.provider.intercept = (request, normal) => { const result = normal(); if (++calls === boundary) f.provider.emit('disconnect'); return result; };
    await assert.rejects(f.wallet.readRecipientContext({ sourceProofId }), /changed|canceled|current/i);
    assert.equal(f.wallet.state().address, null); assert.equal(signerCount(f.provider), 0);
  }
});
test('every awaited EOA signing RPC discards results after account changes', async t => {
  for (let boundary = 1; boundary <= 9; boundary++) {
    const f = fixture(t), { snapshot, proposal } = await review(f); let calls = 0;
    f.provider.intercept = (request, normal) => { const result = normal(); if (++calls === boundary) f.provider.emit('accountsChanged', [otherAddress]); return result; };
    await assert.rejects(f.wallet.signRecipient(proposal, { snapshot }), /changed|current/i);
    assert.equal(f.wallet.state().address, null);
  }
});
test('canceling a pending connect rejects promptly and a late account reply cannot reconnect', async t => {
  const f = fixture(t), gate = deferred(), abort = new AbortController();
  f.provider.intercept = (request, normal) => request.method === 'eth_requestAccounts' ? gate.promise : normal();
  const pending = f.wallet.connect('eip6963:' + UUID, { signal: abort.signal });
  await turn(); abort.abort(); await assert.rejects(pending, /canceled/);
  await assert.rejects(f.wallet.connect('eip6963:' + UUID), /open wallet prompt/);
  gate.resolve([address]); await turn(); assert.equal(f.wallet.state().address, null);
  assert.equal(f.provider.calls.length, 1);
});
test('canceling a signature discards late signatures and prevents a second prompt until the first settles', async t => {
  const f = fixture(t), { snapshot, proposal } = await review(f), gate = deferred(), prompted = deferred(), abort = new AbortController();
  f.provider.intercept = (request, normal) => {
    if (request.method !== 'eth_signTypedData_v4') return normal();
    prompted.resolve(normal()); return gate.promise;
  };
  const pending = f.wallet.signRecipient(proposal, { snapshot, signal: abort.signal });
  const realSignature = await prompted.promise; abort.abort(); f.wallet.cancel();
  await assert.rejects(pending, /canceled/);
  await assert.rejects(f.wallet.connect('eip6963:' + UUID), /open wallet prompt/);
  gate.resolve(realSignature); await turn();
  assert.equal(f.wallet.state().address, null); assert.equal(signerCount(f.provider), 1);
});
test('source/vault guard changes after a crypto await or RPC discard the signature result', async t => {
  const f = fixture(t), { snapshot, proposal } = await review(f); let valid = true;
  f.provider.intercept = (request, normal) => { const result = normal(); if (request.method === 'eth_signTypedData_v4') valid = false; return result; };
  await assert.rejects(f.wallet.signRecipient(proposal, { snapshot, guard: () => valid }), /source proof or creator changed/i);
  assert.equal(signerCount(f.provider), 1);
});
test('provider replacement and request-function replacement reject stale reviews', async t => {
  const f = fixture(t), { snapshot } = await review(f);
  announce(f.target, new Provider());
  assert.throws(() => f.wallet.assertCurrent(snapshot)); assert.equal(f.wallet.state().providerId, null);
  const g = fixture(t), reviewed = await review(g);
  g.provider.request = async () => assert.fail('Replaced RPC must not be called');
  await assert.rejects(g.wallet.signRecipient(reviewed.proposal, { snapshot: reviewed.snapshot }), /provider changed/i);
  assert.equal(g.wallet.state().providerId, null); assert(g.changes.some(event => event.invalidated));
});
test('silent account or network changes are detected by fresh reads and emit invalidation', async t => {
  for (const change of [provider => { provider.accounts = [otherAddress]; }, provider => { provider.chain = '0x2'; }]) {
    const f = fixture(t), { snapshot, proposal } = await review(f); change(f.provider);
    await assert.rejects(f.wallet.signRecipient(proposal, { snapshot }), /changed/);
    assert(f.changes.some(event => event.invalidated)); assert.equal(signerCount(f.provider), 0);
  }
});
test('review rejects noncanonical or unavailable blocks and unsupported code without numeric fallback', async t => {
  for (const mode of ['reorg', 'unsupported-block', 'delegation', 'large-code']) {
    const f = fixture(t); await f.wallet.connect('eip6963:' + UUID);
    f.provider.intercept = (request, normal) => {
      if (request.method === 'eth_getCode') {
        if (mode === 'unsupported-block') throw Object.assign(Error('Unsupported object'), { code: -32602 });
        if (mode === 'delegation') return '0xef0100' + '12'.repeat(20);
        if (mode === 'large-code') return '0x' + '00'.repeat(65537);
        const code = normal(); f.provider.blockHash = NEXT_HASH; return code;
      }
      return normal();
    };
    await assert.rejects(f.wallet.readRecipientContext({ sourceProofId }));
    const codeCalls = f.provider.calls.filter(call => call.method === 'eth_getCode');
    assert.equal(codeCalls.length, 1); assert.equal(typeof codeCalls[0].params[1], 'object'); assert.equal(signerCount(f.provider), 0);
  }
});
test('ERC1271 uses a bounded fixed read-only call on the exact canonical chain/block', async t => {
  const f = fixture(t); f.provider.code = '0x60006000';
  const { snapshot, proposal } = await review(f);
  f.provider.intercept = (request, normal) => request.method === 'eth_signTypedData_v4' ? '0x1234' : normal();
  const signed = await f.wallet.signRecipient(proposal, { snapshot });
  const verified = await verifyRecipientAuthorization(signed, { verifyContractSignature: f.wallet.verifier({ snapshot }) });
  assert.equal(verified.method, 'erc1271'); assert.equal(verified.walletAuthorized, true);
  const calls = f.provider.calls.filter(call => call.method === 'eth_call');
  assert.equal(calls.length, 2);
  for (const call of calls) {
    assert.deepEqual(Object.keys(call.params[0]).sort(), ['data', 'gas', 'to']);
    assert.equal(call.params[0].to, address);
    assert.equal(call.params[0].data, encodeRecipient1271Call({ digest: verified.typedDataDigest, signature: '0x1234' }));
    assert.deepEqual(call.params[1], { blockHash: HASH, requireCanonical: true });
  }
});
test('ERC1271 wrong magic, revert, wrong chain and post-call reorg stay unverified', async t => {
  for (const mode of ['magic', 'revert', 'chain', 'reorg']) {
    const f = fixture(t); f.provider.code = '0x6000'; const { snapshot, proposal } = await review(f);
    f.provider.intercept = (request, normal) => {
      if (request.method === 'eth_signTypedData_v4') return '0x1234';
      if (request.method === 'eth_call') {
        if (mode === 'magic') return '0xffffffff' + '0'.repeat(56);
        if (mode === 'revert') throw Error('Revert');
        const result = normal(); if (mode === 'chain') f.provider.chain = '0x2'; else f.provider.blockHash = NEXT_HASH; return result;
      }
      return normal();
    };
    await assert.rejects(f.wallet.signRecipient(proposal, { snapshot }));
    assert.equal(f.provider.calls.filter(call => call.method === 'eth_call').length, 1);
  }
});
test('verification hook rejects substituted contexts and snapshots request data before awaiting', async t => {
  const f = fixture(t); f.provider.code = '0x6000'; const { snapshot } = await review(f), verify = f.wallet.verifier({ snapshot });
  const request = { address, chainId: '1', blockNumber: BLOCK.number, blockHash: BLOCK.hash, digest: NEXT_HASH, signature: '0x1234' };
  for (const update of [{ address: otherAddress }, { chainId: '2' }, { blockHash: NEXT_HASH }, { blockNumber: '15' }]) await assert.rejects(verify({ ...request, ...update }), /does not match/);
  assert.equal(f.provider.calls.filter(call => call.method === 'eth_call').length, 0);
  f.provider.intercept = (call, normal) => { if (call.method === 'eth_accounts') request.digest = HASH; return normal(); };
  const expectedDigest = request.digest;
  assert.equal((await verify(request)).verified, true);
  assert.equal(f.provider.calls.find(call => call.method === 'eth_call').params[0].data, encodeRecipient1271Call({ digest: expectedDigest, signature: '0x1234' }));
});
test('historical verification never silently changes to latest and missing archival state fails', async t => {
  const f = fixture(t); await f.wallet.connect('eip6963:' + UUID); f.provider.calls = [];
  const snapshot = await f.wallet.readRecipientContext({ sourceProofId, verificationBlock: BLOCK });
  assert.equal(snapshot.verificationBlock.hash, HASH);
  assert(f.provider.calls.filter(call => call.method === 'eth_getBlockByNumber').every(call => call.params[0] === '0x10'));
  f.provider.intercept = (call, normal) => { if (call.method === 'eth_getCode') throw Object.assign(Error('Missing archive'), { code: -32001 }); return normal(); };
  await assert.rejects(f.wallet.readRecipientContext({ sourceProofId, verificationBlock: BLOCK }), /could not complete/);
});
test('expired reviews never open the signature prompt and expiry during verification rejects the result', async t => {
  // Both protocol creation and adapter verification must share the controlled
  // clock. Wall time can advance during review while this clock stays frozen.
  const initialTime = Date.UTC(2026, 10, 15);
  let clock = initialTime; const f = fixture(t, { now: () => clock });
  let reviewed = await review(f, {}, { now: clock }); clock = reviewed.proposal.manifest.expiresAt;
  await assert.rejects(f.wallet.signRecipient(reviewed.proposal, { snapshot: reviewed.snapshot }), /expired/); assert.equal(signerCount(f.provider), 0);
  clock = initialTime; reviewed = await review(f, {}, { now: clock });
  f.provider.intercept = (call, normal) => { const value = normal(); if (call.method === 'eth_getBlockByNumber') clock = reviewed.proposal.manifest.expiresAt; return value; };
  await assert.rejects(f.wallet.signRecipient(reviewed.proposal, { snapshot: reviewed.snapshot }), /expired/); assert.equal(signerCount(f.provider), 0);
  f.provider.intercept = null; clock = initialTime; reviewed = await review(f, {}, { now: clock });
  f.provider.intercept = (call, normal) => { const value = normal(); if (call.method === 'eth_signTypedData_v4') clock += RECIPIENT_LIMITS.lifetimeMs + 1; return value; };
  await assert.rejects(f.wallet.signRecipient(reviewed.proposal, { snapshot: reviewed.snapshot }), /expired/);
});
test('timeouts and disposal bound unfinished operations without reading or signing again', async t => {
  const f = fixture(t, { rpcTimeoutMs: 10 }); await f.wallet.connect('eip6963:' + UUID);
  f.provider.intercept = () => new Promise(() => {});
  await assert.rejects(f.wallet.readRecipientContext({ sourceProofId }), /timed out/);
  const count = f.provider.calls.length; f.wallet.destroy();
  announce(f.target, new Provider()); assert.deepEqual(f.wallet.discover(), []);
  await assert.rejects(f.wallet.readRecipientContext({ sourceProofId }));
  assert.equal(f.provider.calls.length, count);
});
