// SPDX-License-Identifier: GPL-3.0-only
// Minimal DOM + deferred fake miner. No browser GPU, user key, RPC, or publication.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { newIdentity } from '../public/core.mjs';
import { createFounderProposal, verifyFounderProposal, proofMessage, meetsTarget, PROOF_FORMAT, PROPOSAL_FORMAT } from '../public/doodleverse-coin.mjs';
import { createDoodleverseCoinUI } from '../public/doodleverse-coin-ui.mjs';

let founder, other, proposal, winning;
test.before(async () => {
  founder = await newIdentity('UiFixtureFounder'); other = await newIdentity('UiFixtureOther');
  proposal = await createFounderProposal(founder, { difficulty: 16, now: Date.UTC(2026, 10, 15) });
  const verified = await verifyFounderProposal(proposal);
  for (let nonce = 0n; nonce < 4194304n; nonce++) {
    const digest = createHash('sha256').update(proofMessage(verified.challengeHex, nonce.toString())).digest('hex');
    if (meetsTarget(digest, verified.targetHex)) { winning = { nonce: nonce.toString(), digest, attempts: 1, backend: 'webgpu' }; break; }
  }
  assert.ok(winning);
});

function fixture({ saved = proposal, clipboard = 'available' } = {}) {
  const originals = new Map(['document', 'window', 'localStorage', 'crypto', 'navigator'].map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)]));
  const nativeCrypto = globalThis.crypto, originalCreateUrl = URL.createObjectURL, originalRevokeUrl = URL.revokeObjectURL;
  const elements = new Map(), clicks = new Map(), docEvents = new Map(), windowEvents = new Map();
  const storage = new Map(saved ? [['doodleverse-prelaunch-founder-proof-v1', JSON.stringify(saved)]] : []);
  let candidateRequest = null, releaseCandidate, exportBlob = null, openVaultCalls = 0, backendCalls = 0, copiedText = null;
  let verifyGate = null, verifyWaiting = false, signGate = null, signWaiting = false;
  function element() {
    const events = new Map();
    return { value: '', checked: false, disabled: false, textContent: '', files: [], addEventListener(name, fn) { events.set(name, fn); }, removeEventListener(name) { events.delete(name); },
      fire(name) { return events.get(name)?.(); }, click() {}, focus() {}, select() {} };
  }
  const container = { classList: { add() {} }, innerHTML: '', querySelector(selector) { if (!elements.has(selector)) elements.set(selector, element()); return elements.get(selector); },
    addEventListener(name, fn) { clicks.set(name, fn); }, removeEventListener(name) { clicks.delete(name); } };
  const cryptoFacade = { getRandomValues: nativeCrypto.getRandomValues.bind(nativeCrypto), subtle: new Proxy(nativeCrypto.subtle, {
    get(target, property) {
      if (property === 'verify') return async (...args) => {
        if (verifyGate) { const wait = verifyGate; verifyGate = null; verifyWaiting = true; await wait; }
        return target.verify(...args);
      };
      if (property === 'sign') return async (...args) => {
        if (signGate) { const wait = signGate; signGate = null; signWaiting = true; await wait; }
        return target.sign(...args);
      };
      return typeof target[property] === 'function' ? target[property].bind(target) : target[property];
    },
  }) };
  Object.defineProperty(globalThis, 'crypto', { configurable: true, value: cryptoFacade });
  globalThis.document = { hidden: false, addEventListener(name, fn) { docEvents.set(name, fn); }, removeEventListener(name) { docEvents.delete(name); }, createElement() { return { click() {} }; } };
  globalThis.window = { addEventListener(name, fn) { windowEvents.set(name, fn); }, removeEventListener(name) { windowEvents.delete(name); } };
  globalThis.localStorage = { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) };
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: clipboard === 'missing' ? {} : { clipboard: { async writeText(text) { if (clipboard === 'denied') throw new Error('Clipboard permission denied.'); copiedText = text; } } } });
  URL.createObjectURL = blob => { exportBlob = blob; return 'blob:fixture-public-export'; }; URL.revokeObjectURL = () => {};
  const mineCandidate = async options => { backendCalls++; candidateRequest = options; return new Promise(resolve => { releaseCandidate = resolve; }); };
  const ui = createDoodleverseCoinUI(container, { mineCandidate, onUnlockRequest: () => { openVaultCalls++; } });
  const field = name => container.querySelector(`[data-dvc-field="${name}"]`), button = name => container.querySelector(`[data-dvc-action="${name}"]`);
  field('difficulty').value = '16';
  const click = action => clicks.get('click')?.({ target: { closest: () => ({ dataset: { dvcAction: action } }) } });
  const flush = () => new Promise(resolve => setTimeout(resolve, 0));
  const until = async predicate => { for (let n = 0; n < 2000; n++) { if (predicate()) return; await flush(); } throw new Error('Fixture condition did not settle.'); };
  return {
    ui, container, field, button, click, flush, until, storage,
    backendCalls: () => backendCalls, request: () => candidateRequest, exportBlob: () => exportBlob, vaultCalls: () => openVaultCalls,
    copiedText: () => copiedText,
    finish(value = winning) { releaseCandidate?.(value); },
    gateVerification() { let release; verifyWaiting = false; verifyGate = new Promise(resolve => { release = resolve; }); return { release, waiting: () => verifyWaiting }; },
    gateSigning() { let release; signWaiting = false; signGate = new Promise(resolve => { release = resolve; }); return { release, waiting: () => signWaiting }; },
    hideDocument() { document.hidden = true; docEvents.get('visibilitychange')?.(); },
    showDocument() { document.hidden = false; docEvents.get('visibilitychange')?.(); },
    pagehide() { windowEvents.get('pagehide')?.(); },
    async ready() {
      ui.unlock(founder); ui.setVisible(false); ui.setVisible(true);
      await until(() => field('proposal').textContent.startsWith('Signed proposal') && field('identity').textContent.includes(founder.fingerprint));
      field('consent').checked = true; field('consent').fire('change');
      await until(() => button('start').disabled === false);
    },
    cleanup() {
      ui.destroy(); URL.createObjectURL = originalCreateUrl; URL.revokeObjectURL = originalRevokeUrl;
      for (const [name, descriptor] of originals) descriptor ? Object.defineProperty(globalThis, name, descriptor) : delete globalThis[name];
    },
  };
}

test('mount, restore, unlock and visibility never start GPU work or create a new identity', async () => {
  const f = fixture();
  try {
    await f.ready(); assert.equal(f.backendCalls(), 0);
    assert.equal(f.storage.size, 1); assert.equal(JSON.parse([...f.storage.values()][0]).publicKey, founder.publicKey);
    assert.match(f.container.innerHTML, /Spendable here/); assert.match(f.container.innerHTML, /does not pin an official founder key/);
    f.click('unlock'); assert.equal(f.vaultCalls(), 1);
  } finally { f.cleanup(); }
});

test('creating a proposal uses only the unlocked key and never exports its private vault fields', async () => {
  const f = fixture({ saved: null });
  try {
    f.ui.unlock(founder); f.ui.setVisible(true);
    await f.until(() => f.field('identity').textContent.includes(founder.fingerprint));
    f.field('consent').checked = true; f.field('consent').fire('change'); f.click('create');
    await f.until(() => f.field('proposal').textContent.startsWith('Signed proposal') && !f.button('export').disabled);
    assert.equal(f.backendCalls(), 0); f.click('export');
    const text = await f.exportBlob().text(), parsed = JSON.parse(text);
    assert.deepEqual(Object.keys(parsed).sort(), ['format', 'manifest', 'publicKey', 'signature']); assert.equal(parsed.format, PROPOSAL_FORMAT);
    for (const secret of [founder.privateKey.d, founder.username, 'privateKey', 'password', 'encryptedVault']) assert.equal(text.includes(secret), false);
    await verifyFounderProposal(parsed);
  } finally { f.cleanup(); }
});

test('withdrawing acknowledgement while signing cancels creation without restoring consent', async () => {
  const f = fixture({ saved: null });
  try {
    f.ui.unlock(founder); f.ui.setVisible(true);
    await f.until(() => f.field('identity').textContent.includes(founder.fingerprint));
    f.field('consent').checked = true; f.field('consent').fire('change');
    const gate = f.gateSigning(); f.click('create'); await f.until(gate.waiting);
    f.field('consent').checked = false; f.field('consent').fire('change');
    gate.release(); await f.flush(); await f.flush();
    assert.equal(f.field('consent').checked, false); assert.equal(f.storage.size, 0);
    assert.equal(f.field('proposal').textContent, 'No signed proposal yet.'); assert.equal(f.backendCalls(), 0);
  } finally { f.cleanup(); }
});

for (const action of ['Stop', 'hide and return', 'document hide and return', 'lock', 'account change', 'pagehide']) {
  test(`a pending GPU result cannot become a proof after ${action}`, async () => {
    const f = fixture();
    try {
      await f.ready(); f.click('start'); await f.until(() => f.backendCalls() === 1);
      assert.equal(f.button('stop').disabled, false);
      if (action === 'Stop') f.click('stop');
      if (action === 'hide and return') { f.ui.setVisible(false); f.ui.setVisible(true); }
      if (action === 'document hide and return') { f.hideDocument(); f.showDocument(); }
      if (action === 'lock') f.ui.lock();
      if (action === 'account change') f.ui.unlock(other);
      if (action === 'pagehide') f.pagehide();
      assert.equal(f.request().signal.aborted, true);
      f.finish(); await f.flush(); await f.flush();
      assert.match(f.field('proof').textContent, /^No verified work proof/);
      assert.equal(JSON.parse([...f.storage.values()][0]).format, PROPOSAL_FORMAT);
      assert.equal(f.backendCalls(), 1);
    } finally { f.cleanup(); }
  });
}

test('hiding while initial signature verification is pending prevents a late GPU start', async () => {
  const f = fixture();
  try {
    await f.ready(); const gate = f.gateVerification(); f.click('start'); await f.until(gate.waiting);
    assert.equal(f.button('stop').disabled, false);
    f.ui.setVisible(false); f.ui.setVisible(true); gate.release(); await f.flush(); await f.flush();
    assert.equal(f.backendCalls(), 0); assert.match(f.field('proof').textContent, /^No verified/);
  } finally { f.cleanup(); }
});

test('locking during final proof verification cannot restore a proof after unlock', async () => {
  const f = fixture();
  try {
    await f.ready(); f.click('start'); await f.until(() => f.backendCalls() === 1);
    const gate = f.gateVerification(); f.finish(); await f.until(gate.waiting);
    f.ui.lock(); f.ui.unlock(founder); gate.release(); await f.flush(); await f.flush();
    assert.match(f.field('proof').textContent, /^No verified/); assert.equal(f.backendCalls(), 1);
    assert.equal(JSON.parse([...f.storage.values()][0]).format, PROPOSAL_FORMAT);
  } finally { f.cleanup(); }
});

test('a manual result becomes an independently verified public-only proof export', async () => {
  const f = fixture();
  try {
    await f.ready(); f.click('start'); await f.until(() => f.backendCalls() === 1); f.finish();
    await f.until(() => f.field('proof').textContent.startsWith('Verified prelaunch proof') && !f.button('export').disabled);
    assert.equal(f.button('stop').disabled, true); f.click('export');
    const text = await f.exportBlob().text(), parsed = JSON.parse(text);
    assert.equal(parsed.format, PROOF_FORMAT);
    assert.deepEqual(Object.keys(parsed).sort(), ['format', 'proof', 'proposal']);
    assert.deepEqual(Object.keys(parsed.proof).sort(), ['algorithm', 'digest', 'nonce']);
    assert.deepEqual(Object.keys(parsed.proposal).sort(), ['format', 'manifest', 'publicKey', 'signature']);
    for (const secret of [founder.privateKey.d, founder.username, 'privateKey', 'password', 'encryptedVault']) assert.equal(text.includes(secret), false);
    assert.match(f.field('status').textContent, /download requested/);
    f.click('copy'); await f.until(() => f.copiedText() !== null);
    assert.equal(f.copiedText(), text); assert.equal(f.field('copy-text').value, text); assert.equal(f.field('copy-panel').hidden, false);
    assert.equal(f.button('copy').textContent, 'Copy public proof');
  } finally { f.cleanup(); }
});

test('copying a signed proposal uses the exact public export serialization and no private vault fields', async () => {
  const f = fixture();
  try {
    await f.ready(); f.click('export'); const exported = await f.exportBlob().text();
    f.click('copy'); await f.until(() => f.copiedText() !== null);
    assert.equal(f.copiedText(), exported); assert.equal(f.field('copy-text').value, exported);
    assert.equal(f.button('copy').textContent, 'Copy selected proposal');
    assert.equal(f.field('copy-panel').hidden, false);
    assert.match(f.container.innerHTML, /<textarea[^>]*readonly/);
    for (const secret of [founder.privateKey.d, founder.username, 'privateKey', 'password', 'encryptedVault']) assert.equal(exported.includes(secret), false);
    await verifyFounderProposal(JSON.parse(exported));
  } finally { f.cleanup(); }
});

for (const clipboard of ['missing', 'denied']) {
  test(`clipboard ${clipboard} shows a readonly public record without needing browser privileges`, async () => {
    const f = fixture({ clipboard });
    try {
      await f.ready(); f.click('copy'); await f.until(() => f.field('status').textContent.startsWith('Clipboard unavailable'));
      assert.equal(f.copiedText(), null); assert.equal(f.field('copy-panel').hidden, false);
      const parsed = JSON.parse(f.field('copy-text').value); await verifyFounderProposal(parsed);
      assert.deepEqual(Object.keys(parsed).sort(), ['format', 'manifest', 'publicKey', 'signature']);
      for (const secret of [founder.privateKey.d, founder.username, 'privateKey', 'password']) assert.equal(f.field('copy-text').value.includes(secret), false);
    } finally { f.cleanup(); }
  });
}

test('GPU digest mismatch cannot be accepted or overwrite the saved proposal', async () => {
  const f = fixture();
  try {
    await f.ready(); f.click('start'); await f.until(() => f.backendCalls() === 1);
    f.finish({ ...winning, digest: 'f'.repeat(64) });
    await f.until(() => f.field('status').textContent.includes('disagreed'));
    assert.match(f.field('proof').textContent, /^No verified/); assert.equal(JSON.parse([...f.storage.values()][0]).format, PROPOSAL_FORMAT);
  } finally { f.cleanup(); }
});
