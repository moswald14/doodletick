// SPDX-License-Identifier: GPL-3.0-only
// Disposable keys, fake wallet prompts and a controlled miner. No live account/RPC.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { newIdentity } from '../public/core.mjs';
import { createFounderProposal, createFounderProof, verifyFounderProposal, proofMessage, meetsTarget } from '../public/doodleverse-coin.mjs';
import { attachRecipientSignature, recipientTypedData, verifyRecipientAuthorization, verifyRecipientProof } from '../public/doodleverse-recipient.mjs';
import { SigningKey, computeAddress, TypedDataEncoder } from '../public/recipient-crypto.mjs';
import { createDoodleverseRecipientUI } from '../public/doodleverse-recipient-ui.mjs';

let founder, source;
const key = new SigningKey('0x' + '13'.repeat(32)), address = computeAddress(key.publicKey).toLowerCase();
function candidate(challenge, target) {
  for (let nonce = 0n; nonce < 4194304n; nonce++) {
    const digest = createHash('sha256').update(proofMessage(challenge, nonce.toString())).digest('hex');
    if (meetsTarget(digest, target)) return { nonce: nonce.toString(), digest };
  }
  throw new Error('Disposable test work exhausted its bound.');
}
test.before(async () => {
  founder = await newIdentity('DisposableRecipientUi');
  const p = await createFounderProposal(founder, { difficulty: 16 }), check = await verifyFounderProposal(p);
  source = await createFounderProof(p, candidate(check.challengeHex, check.targetHex).nonce);
});
function deferred() { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; }
function fixture({ saved = null } = {}) {
  const originals = new Map(['document', 'window', 'localStorage', 'navigator'].map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)]));
  const elements = new Map(), events = new Map(), docEvents = new Map(), winEvents = new Map();
  const storage = new Map([['doodleverse-prelaunch-founder-proof-v1', JSON.stringify(source)]]);
  if (saved) storage.set('doodleverse-founder-recipient-v2', JSON.stringify(saved));
  const originalCreate = URL.createObjectURL, originalRevoke = URL.revokeObjectURL;
  let copied = null, blob = null, signGate = null, reviewGate = null, signWaiting = false, reviewWaiting = false, mining = null, releaseMining;
  let preparedProposal = null, signedProposal = null, connects = 0, signs = 0, starts = 0, change;
  const state = { phase: 'disconnected', providerId: null, accounts: [], address: null, chainId: null, generation: 0, providers: [] };
  function element() { const listeners = new Map(); return { value: '', disabled: false, checked: false, hidden: false, textContent: '', files: [], children: [],
    addEventListener: (event, cb) => listeners.set(event, cb), removeEventListener: event => listeners.delete(event),
    fire: event => listeners.get(event)?.(), append(child) { this.children.push(child); }, replaceChildren(...children) { this.children = children; }, click() {}, focus() {}, select() {} }; }
  const container = { classList: { add() {} }, innerHTML: '', querySelector(selector) { if (!elements.has(selector)) elements.set(selector, element()); return elements.get(selector); }, addEventListener: (name, cb) => events.set(name, cb), removeEventListener: name => events.delete(name) };
  globalThis.document = { hidden: false, createElement: element, createDocumentFragment: element, addEventListener: (name, cb) => docEvents.set(name, cb), removeEventListener: name => docEvents.delete(name) };
  globalThis.window = { addEventListener: (name, cb) => winEvents.set(name, cb), removeEventListener: name => winEvents.delete(name) }; window.top = window.self = window;
  globalThis.localStorage = { getItem: name => storage.get(name) ?? null, setItem: (name, value) => storage.set(name, value) };
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { clipboard: { async writeText(text) { copied = text; } } } });
  URL.createObjectURL = value => { blob = value; return 'blob:disposable-recipient'; }; URL.revokeObjectURL = () => {};
  const notify = (reason, invalidated = false) => change?.({ reason, invalidated, state: { ...state } });
  const wallet = {
    state: () => ({ ...state }),
    discover() { state.providers = [{ id: 'fixture', name: '<Fixture Wallet>', kind: 'eip6963' }]; notify('providers-discovered'); },
    async connect(id) { connects++; state.providerId = id; state.accounts = [address]; state.address = address; state.chainId = '1'; state.phase = 'connected'; state.generation++; notify('connected'); },
    select(value) { if (!state.providerId || !state.accounts.includes(value)) throw Error('Choose and connect a wallet first.'); state.address = value; state.generation++; notify('selected'); },
    cancel() { this.disconnect(); },
    disconnect() { state.generation++; state.providerId = state.address = state.chainId = null; state.accounts = []; notify('disconnected'); },
    destroy() { this.disconnect(); },
    assertCurrent(snap) { if (snap.generation !== state.generation || snap.address !== state.address || snap.chainId !== state.chainId) throw Error('Wallet changed.'); },
    async readRecipientContext({ sourceProofId, verificationBlock }) {
      if (reviewGate) { reviewWaiting = true; await reviewGate.promise; reviewGate = null; }
      return { providerId: state.providerId, generation: state.generation, address: state.address, chainId: state.chainId, accountType: 'eoa', sourceProofId,
        verificationBlock: verificationBlock ?? { number: '123', hash: '0x' + 'ab'.repeat(32) } };
    },
    verifier() { return undefined; },
    async signRecipient(proposal) {
      signs++; preparedProposal = proposal;
      const typed = await recipientTypedData(proposal), { EIP712Domain, ...types } = typed.types;
      const signature = key.sign(TypedDataEncoder.hash(typed.domain, types, typed.message)).serialized;
      if (signGate) { signWaiting = true; await signGate.promise; signGate = null; }
      signedProposal = await attachRecipientSignature(proposal, signature); return signedProposal;
    },
  };
  const ui = createDoodleverseRecipientUI(container, { walletFactory: ({ onChange }) => { change = onChange; return wallet; }, mineCandidate: async opts => { starts++; mining = opts; return new Promise(resolve => { releaseMining = resolve; }); } });
  const field = name => container.querySelector(`[data-dvr-field="${name}"]`), button = name => container.querySelector(`[data-dvr-action="${name}"]`);
  field('difficulty').value = '16';
  const click = action => events.get('click')?.({ target: { closest: () => ({ dataset: { dvrAction: action } }) } });
  const flush = () => new Promise(resolve => setTimeout(resolve, 0));
  const until = async predicate => { for (let i = 0; i < 3000; i++) { if (predicate()) return; await flush(); } throw Error('Recipient UI condition did not settle: ' + field('status').textContent); };
  return { ui, wallet, field, button, click, flush, until, storage, container, copied: () => copied, blob: () => blob, counts: () => ({ connects, signs, starts }),
    prepared: () => preparedProposal, signed: () => signedProposal, request: () => mining,
    async ready() { ui.setSourceProof(source); ui.unlock(founder); ui.setVisible(true); await until(() => field('source').textContent.includes(source.proof.digest) === false && field('source').textContent.startsWith('Original creator proof:') && field('identity').textContent.includes(founder.fingerprint)); click('discover'); field('provider').value = 'fixture'; field('provider').fire('change'); click('connect'); await until(() => !button('review').disabled); },
    async review() { click('review'); await until(() => !field('message-panel').hidden && !button('review').disabled); field('consent').checked = true; field('consent').fire('change'); },
    async approve() { await this.review(); click('sign'); await until(() => !button('start').disabled); },
    gateSign() { signGate = deferred(); return { release: () => signGate.resolve(), waiting: () => signWaiting }; },
    gateReview() { reviewGate = deferred(); return { release: () => reviewGate.resolve(), waiting: () => reviewWaiting }; },
    invalidate() { state.generation++; notify('accounts-changed', true); },
    hide() { document.hidden = true; docEvents.get('visibilitychange')?.(); },
    async finishWork() { const check = await verifyRecipientAuthorization(signedProposal); releaseMining(candidate(check.challengeHex, check.targetHex)); },
    cleanup() { ui.destroy(); URL.createObjectURL = originalCreate; URL.revokeObjectURL = originalRevoke; for (const [name, descriptor] of originals) descriptor ? Object.defineProperty(globalThis, name, descriptor) : delete globalThis[name]; },
  };
}

test('wallet work is explicit; the original source and private fields never change', async () => {
  const f = fixture();
  try {
    await f.ready(); assert.deepEqual(f.counts(), { connects: 1, signs: 0, starts: 0 });
    await f.review(); assert.match(f.field('review').textContent, /1,000,000/); assert.match(f.field('review').textContent, /chain 1/); assert.ok(f.field('review').textContent.includes(address)); assert.ok(!f.field('review').textContent.includes('Invalid Date'));
    f.click('sign'); await f.until(() => !f.button('start').disabled); assert.equal(f.counts().starts, 0); f.click('start'); await f.until(() => f.counts().starts === 1); await f.finishWork();
    await f.until(() => f.field('progress').textContent.startsWith('Fresh wallet-linked GPU proof independently verified'));
    f.click('copy'); await f.until(() => f.copied()); const exported = JSON.parse(f.copied());
    assert.equal((await verifyRecipientProof(exported)).walletAuthorized, true);
    assert.deepEqual(exported.proposal.sourceProof, source); assert.equal(f.storage.get('doodleverse-prelaunch-founder-proof-v1'), JSON.stringify(source));
    for (const secret of [founder.privateKey.d, founder.username, 'password', 'privateKey', 'encryptedVault', 'nabu.casa']) assert.equal(f.copied().includes(secret), false);
    assert.match(f.field('record').textContent, /Spendable DVC: 0/);
  } finally { f.cleanup(); }
});

for (const action of ['cancel', 'hide', 'lock', 'wallet event', 'source change', 'withdraw consent']) {
  test(`late wallet signature is discarded after ${action}`, async () => {
    const f = fixture();
    try {
      await f.ready(); await f.review(); const gate = f.gateSign(); f.click('sign'); await f.until(gate.waiting);
      if (action === 'cancel') f.click('stop');
      if (action === 'hide') f.hide();
      if (action === 'lock') f.ui.lock();
      if (action === 'wallet event') f.invalidate();
      if (action === 'source change') f.ui.setSourceProof(null);
      if (action === 'withdraw consent') { f.field('consent').checked = false; f.field('consent').fire('change'); }
      gate.release(); await f.until(() => f.signed()); await f.flush();
      assert.equal(f.storage.has('doodleverse-founder-recipient-v2'), false); assert.equal(f.button('start').disabled, true); assert.equal(f.counts().starts, 0);
    } finally { f.cleanup(); }
  });
}
test('late review cannot restore consent or a prepared proposal after cancellation', async () => {
  const f = fixture();
  try { await f.ready(); const gate = f.gateReview(); f.click('review'); await f.until(gate.waiting); f.click('stop'); gate.release(); await f.flush(); await f.flush(); assert.equal(f.field('message-panel').hidden, true); assert.equal(f.field('consent').checked, false); assert.equal(f.button('sign').disabled, true); } finally { f.cleanup(); }
});
test('choosing an exposed account retains the wallet connection for review', async () => {
  const f = fixture();
  try { await f.ready(); f.field('account').value = address; f.field('account').fire('change'); assert.equal(f.wallet.state().address, address); assert.equal(f.wallet.state().providerId, 'fixture'); assert.equal(f.button('review').disabled, false); await f.review(); assert.ok(f.field('review').textContent.includes(address)); } finally { f.cleanup(); }
});
for (const action of ['cancel', 'hide', 'lock', 'wallet event']) {
  test(`late GPU candidate cannot replace signed record after ${action}`, async () => {
    const f = fixture();
    try {
      await f.ready(); await f.approve(); const saved = f.storage.get('doodleverse-founder-recipient-v2'); f.click('start'); await f.until(() => f.counts().starts === 1);
      if (action === 'cancel') f.click('stop'); if (action === 'hide') f.hide(); if (action === 'lock') f.ui.lock(); if (action === 'wallet event') f.invalidate();
      assert.equal(f.request().signal.aborted, true); await f.finishWork(); await f.flush(); await f.flush();
      assert.equal(f.storage.get('doodleverse-founder-recipient-v2'), saved); assert.ok(!f.field('record').textContent.includes('fresh work verified'));
    } finally { f.cleanup(); }
  });
}
test('restoring a public authorization never connects, signs or mines', async () => {
  const first = fixture(); let saved;
  try { await first.ready(); await first.approve(); saved = first.signed(); } finally { first.cleanup(); }
  const f = fixture({ saved });
  try { await f.until(() => f.field('record').textContent.includes('Recipient signatures verified')); assert.deepEqual(f.counts(), { connects: 0, signs: 0, starts: 0 }); assert.equal(f.button('start').disabled, true); } finally { f.cleanup(); }
});
test('an unsigned creator record never claims that the wallet signed', async () => {
  const first = fixture(); let unsigned;
  try { await first.ready(); await first.approve(); unsigned = structuredClone(first.prepared()); } finally { first.cleanup(); }
  const f = fixture({ saved: unsigned });
  try { await f.until(() => f.field('record').textContent.includes('wallet signature missing')); assert.ok(!f.field('record').textContent.includes('Recipient signatures verified')); assert.deepEqual(f.counts(), { connects: 0, signs: 0, starts: 0 }); } finally { f.cleanup(); }
});
