// SPDX-License-Identifier: GPL-3.0-only
// In-process DOM/node fixtures and disposable EOA signatures. Never live balances,
// a real extension or network access. GPU dispatch remains the miner test's scope.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createDvcUI, parseDvcAmount, formatDvcAmount } from '../public/dvc-ui.mjs';
import { createDvcWallet } from '../public/dvc-wallet.mjs';
import { genesis, MAIN_NETWORK_ID, MAIN_NETWORK_NAME, DVC_RULES, verifyTransfer, validateChain, validateBlock, createMiningJob, finalizeBlock, workDigest } from '../public/dvc-core.mjs';
import { SigningKey, computeAddress, TypedDataEncoder } from '../public/recipient-crypto.mjs';

const key = new SigningKey('0x' + '39'.repeat(32)), other = new SigningKey('0x' + '40'.repeat(32));
const address = computeAddress(key.publicKey).toLowerCase(), recipient = computeAddress(other.publicKey).toLowerCase();
const id = 'eip6963:198f3d43-4ea2-48fa-9398-3e9079916823', network = genesis(), now = (network.timestamp + 1) * 1000;
function deferred() { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; }
const flush = () => new Promise(resolve => setTimeout(resolve, 0));
const json = value => new Response(JSON.stringify(value), { status: 200, headers: { 'Content-Type': 'application/json' } });
function fixtureWork(job) {
  const algorithm = job.header.algorithm;
  // Known disposable work is independently checked, with a bounded rebuild if
  // the launch manifest changes before release. No fixture is persisted.
  let nonce = algorithm === 'sha256' ? '1011245' : '243429', digest = workDigest(job.prefixHex, nonce, algorithm);
  if (digest > job.targetHex) {
    const bytes = Buffer.concat([Buffer.from(job.prefixHex, 'hex'), Buffer.alloc(32)]); let found = false;
    for (let i = 0; i < 4194304; i++) { bytes.writeUInt32BE(i, 60); let raw = createHash('sha256').update(bytes).digest(); if (algorithm === 'sha256d') raw = createHash('sha256').update(raw).digest(); digest = raw.toString('hex'); if (digest <= job.targetHex) { nonce = String(i); found = true; break; } }
    assert.equal(found, true, 'Disposable fixture proof was not found within its bound.');
  }
  return { status: 'found', algorithm, nonce, digest };
}
class Element extends EventTarget {
  constructor(tag = 'div') { super(); this.tagName = tag; this.value = ''; this.textContent = ''; this.disabled = false; this.hidden = false; this.checked = false; this.children = []; this.dataset = {}; this.classList = { add() {} }; }
  fire(name) { this.dispatchEvent(new Event(name)); }
  append(...children) { this.children.push(...children); }
  replaceChildren(...children) { this.children = children; }
  select() { this.selected = true; }
  closest() { return this; }
}
function fixture({ availableAtoms = '1000000000', pendingOutAtoms = '0', requestTimeoutMs = 1000, browserPeerCount = () => 0 } = {}) {
  const elements = new Map(), doc = new EventTarget(), win = new EventTarget(), calls = [], walletCalls = [], listeners = new Map(), jobs = [];
  doc.hidden = false; doc.createElement = tag => new Element(tag); doc.defaultView = win; win.top = win.self = win;
  let copied = '', wallet, accountNonce = '0', pending = pendingOutAtoms, available = availableAtoms, immature = '0', history = [], serverHook = null, requestHook = null, signGate = null;
  let exposed = [address], chain = '0x1', mining = null, releaseMining = null, nativeState = validateChain([], { now });
  win.navigator = { clipboard: { async writeText(value) { copied = value; } } };
  const container = new Element(); container.ownerDocument = doc;
  Object.defineProperty(container, 'innerHTML', { set(value) {
    this.markup = value;
    for (const match of value.matchAll(/<([a-z]+)\b([^>]*\bdata-native-(field|action)="([^"]+)"[^>]*)>/g)) {
      const key = `[data-native-${match[3]}="${match[4]}"]`, element = new Element(match[1]);
      element.hidden = /\shidden(?:\s|$)/.test(match[2]); element.dataset[match[3] === 'field' ? 'nativeField' : 'nativeAction'] = match[4]; elements.set(key, element);
    }
  } });
  container.querySelector = selector => { if (!elements.has(selector)) throw Error('Missing fixture element ' + selector); return elements.get(selector); };
  const field = name => container.querySelector(`[data-native-field="${name}"]`), button = name => container.querySelector(`[data-native-action="${name}"]`);
  const provider = { on(name, fn) { listeners.set(name, fn); }, removeListener(name, fn) { if (listeners.get(name) === fn) listeners.delete(name); }, async request(request) {
    walletCalls.push(structuredClone(request));
    if (requestHook) { const result = requestHook(request); if (result !== undefined) return result; }
    if (request.method === 'eth_requestAccounts' || request.method === 'eth_accounts') return [...exposed];
    if (request.method === 'eth_chainId') return chain;
    if (request.method === 'eth_signTypedData_v4') {
      const data = JSON.parse(request.params[1]), { EIP712Domain, ...types } = data.types;
      const signature = key.sign(TypedDataEncoder.hash(data.domain, types, data.message)).serialized;
      if (signGate) await signGate.promise; return signature;
    }
    throw Error('Unexpected wallet RPC.');
  } };
  win.addEventListener('eip6963:requestProvider', () => { const event = new Event('eip6963:announceProvider'); Object.defineProperty(event, 'detail', { value: { info: { uuid: id.slice(8), name: 'Disposable UI Wallet' }, provider } }); win.dispatchEvent(event); });
  const getStatus = () => ({ networkId: MAIN_NETWORK_ID, genesis: network, tip: { height: nativeState.height, hash: nativeState.tipHash, chainWork: nativeState.chainWork, timestamp: nativeState.timestamp, baseTarget: nativeState.history.at(-1).baseTarget },
    supply: { issuedAtoms: nativeState.issuedAtoms, mineableRemainingAtoms: (BigInt(DVC_RULES.miningReserveAtoms) - BigInt(nativeState.minedAtoms)).toString(), maxSupplyAtoms: DVC_RULES.maxSupplyAtoms }, mempoolSize: history.filter(row => row.status === 'pending').length, peers: { configured: 2, connected: 1 } });
  const getAccount = (who = address) => ({ networkId: MAIN_NETWORK_ID, tipHash: nativeState.tipHash, height: nativeState.height, address: who, availableAtoms: available, immatureAtoms: immature, totalAtoms: (BigInt(available) + BigInt(immature)).toString(), nextNonce: accountNonce, pendingOutAtoms: pending, recentTransactions: history });
  const fetchImpl = async (url, options) => {
    const path = url.slice('./dvc'.length), body = options.body ? JSON.parse(options.body) : undefined; calls.push({ url, path, body, options });
    if (serverHook) { const result = serverHook(path, body, options); if (result !== undefined) return result; }
    if (path === '/status') return json(getStatus());
    if (path.startsWith('/account/')) return json(getAccount(path.slice(9)));
    if (path === '/job') {
      const job = createMiningJob(nativeState, { miner: body.miner, algorithm: body.algorithm, now }); jobs.push(job);
      return json({ networkId: MAIN_NETWORK_ID, prefixHex: job.prefixHex, targetHex: job.targetHex, algorithm: body.algorithm, block: finalizeBlock(job, '0') });
    }
    if (path === '/block') {
      nativeState = validateBlock(body, nativeState, { now }); immature = nativeState.pendingCoinbases.filter(row => row.miner === address).reduce((total, row) => total + BigInt(row.amountAtoms), 0n).toString();
      return json({ accepted: true, canonical: true, hash: nativeState.tipHash, height: nativeState.height });
    }
    if (path === '/transfer') {
      const verified = verifyTransfer(body, { height: (BigInt(nativeState.height) + 1n).toString() }); assert.equal(body.nonce, accountNonce);
      pending = (BigInt(pending) + BigInt(body.amountAtoms) + BigInt(body.feeAtoms)).toString(); accountNonce = (BigInt(accountNonce) + 1n).toString(); history = [{ ...verified, status: 'pending' }, ...history];
      return json({ accepted: true, id: verified.id });
    }
    throw Error('Unexpected fixture path.');
  };
  const ui = createDvcUI(container, { document: doc, window: win, fetchImpl, requestTimeoutMs, getBrowserPeerCount: browserPeerCount,
    walletFactory: opts => { wallet = createDvcWallet({ ...opts, eventTarget: win, getLegacyProvider: () => null, rpcTimeoutMs: 1000, signatureTimeoutMs: 1000 }); return wallet; },
    mineCandidate: opts => { mining = opts; return new Promise(resolve => { releaseMining = resolve; }); } });
  const click = name => { const target = button(name); if (target.disabled) return false; const event = new Event('click'); Object.defineProperty(event, 'target', { value: target }); container.dispatchEvent(event); return true; };
  const until = async predicate => { for (let i = 0; i < 250; i++) { if (predicate()) return; await flush(); } assert.fail('UI did not settle: ' + field('status').textContent + ' / ' + field('progress').textContent); };
  return { ui, wallet, calls, walletCalls, container, field, button, click, until, getStatus, getAccount, jobs, mining: () => mining, copied: () => copied,
    hookServer(fn) { serverHook = fn; }, hookWallet(fn) { requestHook = fn; }, setNonce(value) { accountNonce = value; }, setPending(value) { pending = value; },
    async activate() { ui.setActive(true); await until(() => field('node').textContent.startsWith('Block')); },
    async ready() { await this.activate(); click('discover'); field('provider').value = id; field('provider').fire('change'); click('connect'); await until(() => !button('mine').disabled); },
    async review(amount = '1.25') { field('recipient').value = recipient; field('amount').value = amount; field('amount').fire('input'); click('review'); await until(() => !field('review-panel').hidden && !button('review').disabled); field('consent').checked = true; field('consent').fire('change'); },
    gateSignature() { signGate = deferred(); return { release() { signGate.resolve(); }, waiting: () => walletCalls.some(row => row.method === 'eth_signTypedData_v4') }; },
    hide() { doc.hidden = true; doc.dispatchEvent(new Event('visibilitychange')); }, show() { doc.hidden = false; doc.dispatchEvent(new Event('visibilitychange')); },
    pagehide() { win.dispatchEvent(new Event('pagehide')); }, accountChange() { exposed = [recipient]; listeners.get('accountsChanged')?.(exposed); }, networkChange() { chain = '0x2'; listeners.get('chainChanged')?.(chain); },
    finishMining(result) { releaseMining(result); }, cleanup() { signGate?.resolve(); releaseMining?.({ status: 'stopped' }); ui.destroy(); },
  };
}

test('native amount parsing preserves all eight decimals without floating-point rounding', () => {
  assert.equal(parseDvcAmount('0.00000001'), '1'); assert.equal(parseDvcAmount('21000000'), DVC_RULES.maxSupplyAtoms); assert.equal(formatDvcAmount('123456789'), '1.23456789');
  for (const value of ['0', '-1', '1e2', '0.000000001', '01', '21000000.00000001', 'NaN']) assert.throws(() => parseDvcAmount(value));
});

test('view creation is inert and inactive or reopened views never connect, sign or mine automatically', async () => {
  const f = fixture();
  try {
    await flush(); assert.equal(f.calls.length, 0); assert.equal(f.walletCalls.length, 0); assert.equal(f.mining(), null);
    assert.match(f.container.markup, />MINE NOW</); assert.match(f.container.markup, /not an Ethereum token or a Coinbase wallet balance/);
    await f.activate(); assert.equal(f.calls.length, 1); assert.equal(f.walletCalls.length, 0); assert.equal(f.field('available').textContent, 'Unavailable');
    assert.match(f.field('node').textContent, /1 peers connected/); assert.match(f.field('network').textContent, new RegExp(MAIN_NETWORK_NAME));
    f.ui.setActive(false); const count = f.calls.length; await flush(); assert.equal(f.calls.length, count); f.ui.setActive(true); await flush();
    assert.equal(f.walletCalls.length, 0); assert.equal(f.mining(), null);
  } finally { f.cleanup(); }
});

test('connected peer display combines node peers with a bounded browser peer count', async () => {
  let count = 3;
  const f = fixture({ browserPeerCount: () => { if (count === 'throw') throw Error('unavailable'); return count; } });
  try {
    await f.activate(); assert.match(f.field('node').textContent, /4 peers connected/); assert.doesNotMatch(f.field('node').textContent, /\d\/\d/);
    for (const value of [-1, 5, 2.5, '2', NaN, 'throw']) { count = value; f.click('refresh'); await f.until(() => !f.button('refresh').disabled); assert.match(f.field('node').textContent, /1 peers connected/); }
    count = 4; f.click('refresh'); await f.until(() => !f.button('refresh').disabled); assert.match(f.field('node').textContent, /5 peers connected/);
  } finally { f.cleanup(); }
});

test('real native signature requires full review plus a separate click, and pending sends reserve the amount and fee once', async () => {
  const f = fixture({ pendingOutAtoms: '200000000' });
  try {
    await f.ready(); assert.equal(f.field('available').textContent, '8.00000000 DVC'); assert.equal(f.field('pending').textContent, '2.00000000 DVC');
    await f.review(); assert.equal(f.walletCalls.some(row => row.method === 'eth_signTypedData_v4'), false);
    for (const text of [address, recipient, MAIN_NETWORK_ID, 'Amount: 1.25000000 DVC', 'Fee: 0.00001000 DVC', 'Total: 1.25001000 DVC']) assert.ok(f.field('review').textContent.includes(text), text);
    f.click('send'); await f.until(() => f.calls.some(row => row.path === '/transfer') && !f.button('mine').disabled);
    const submitted = f.calls.find(row => row.path === '/transfer').body; assert.equal(verifyTransfer(submitted, { height: '1' }).valid, true);
    assert.equal(f.walletCalls.filter(row => row.method === 'eth_signTypedData_v4').length, 1); assert.equal(f.field('review-panel').hidden, true);
    assert.equal(f.field('available').textContent, '6.74999000 DVC'); assert.equal(f.field('pending').textContent, '3.25001000 DVC'); assert.match(f.field('status').textContent, /pending/);
    assert.match(f.field('transactions').children[0].textContent, /pending · 1.25000000 DVC/);
    for (const call of f.calls) { assert.match(call.url, /^\.\/dvc\/(status|account\/0x[0-9a-f]{40}|transfer)$/); assert.equal(call.options.credentials, 'same-origin'); assert.equal(call.options.redirect, 'error'); assert.equal(call.options.referrerPolicy, 'no-referrer'); assert.equal(call.options.cache, 'no-store'); }
    assert.deepEqual([...new Set(f.walletCalls.map(row => row.method))].sort(), ['eth_accounts', 'eth_chainId', 'eth_requestAccounts', 'eth_signTypedData_v4'].sort());
  } finally { f.cleanup(); }
});

test('a receive request is explicitly created and contains only native public payment details', async () => {
  const f = fixture();
  try {
    await f.ready(); assert.equal(f.field('request').value, ''); f.field('receive-amount').value = '0.12345678'; f.click('request');
    const request = JSON.parse(f.field('request').value); assert.deepEqual(request, { format: 'doodleverse-payment-request-v1', networkId: MAIN_NETWORK_ID, genesisHash: MAIN_NETWORK_ID, recipient: address, amountAtoms: '12345678' });
    f.click('copy-request'); await f.until(() => !!f.copied()); assert.equal(f.copied(), f.field('request').value);
    f.field('receive-amount').value = '2'; f.field('receive-amount').fire('input'); assert.equal(f.field('request').value, '');
    f.accountChange(); assert.equal(f.field('receive-address').value, ''); assert.equal(f.field('transactions').children[0].textContent, 'Account activity unavailable.');
  } finally { f.cleanup(); }
});

test('recipient checksum mistakes are rejected before review or a wallet prompt', async () => {
  const f = fixture();
  try {
    await f.ready(); f.field('recipient').value = '0x52908400098527886E0F7030069857D2E4169Ee7'; f.field('amount').value = '1'; f.click('review');
    await f.until(() => /checksum/.test(f.field('status').textContent)); assert.equal(f.field('review-panel').hidden, true); assert.equal(f.walletCalls.some(row => row.method === 'eth_signTypedData_v4'), false);
  } finally { f.cleanup(); }
});

test('a node storage fault makes all spending and mining balances unavailable', async () => {
  const f = fixture();
  try {
    await f.ready(); f.hookServer(path => path === '/status' ? json({ ...f.getStatus(), healthy: false, error: 'DVC_STORAGE' }) : undefined); f.click('refresh');
    await f.until(() => /Restore node storage/.test(f.field('status').textContent)); assert.equal(f.field('available').textContent, 'Unavailable'); assert.equal(f.button('mine').disabled, true); assert.equal(f.button('review').disabled, true);
  } finally { f.cleanup(); }
});

test('pending funds cannot be spent twice and a changed nonce invalidates a prepared transfer before the wallet prompt', async () => {
  const f = fixture({ pendingOutAtoms: '900000000' });
  try {
    await f.ready(); f.field('recipient').value = recipient; f.field('amount').value = '1'; f.click('review'); await f.until(() => /does not cover/.test(f.field('status').textContent));
    assert.equal(f.walletCalls.some(row => row.method === 'eth_signTypedData_v4'), false); await f.review('0.5'); f.setNonce('1');
    f.click('send'); await f.until(() => /out of date/.test(f.field('status').textContent)); assert.equal(f.field('review-panel').hidden, true);
    assert.equal(f.walletCalls.some(row => row.method === 'eth_signTypedData_v4'), false); assert.equal(f.calls.some(row => row.path === '/transfer'), false);
  } finally { f.cleanup(); }
});

for (const interrupt of ['stop', 'hide', 'leave view', 'pagehide', 'disconnect', 'account', 'network', 'edit amount', 'withdraw consent']) {
  test(`a late real native signature cannot submit after ${interrupt}`, async () => {
    const f = fixture();
    try {
      await f.ready(); await f.review(); const gate = f.gateSignature(); f.click('send'); await f.until(gate.waiting);
      if (interrupt === 'stop') f.click('stop'); if (interrupt === 'hide') f.hide(); if (interrupt === 'leave view') f.ui.setActive(false);
      if (interrupt === 'pagehide') f.pagehide(); if (interrupt === 'disconnect') f.click('disconnect'); if (interrupt === 'account') f.accountChange(); if (interrupt === 'network') f.networkChange();
      if (interrupt === 'edit amount') { f.field('amount').value = '7'; f.field('amount').fire('input'); }
      if (interrupt === 'withdraw consent') { f.field('consent').checked = false; f.field('consent').fire('change'); }
      gate.release(); await f.until(() => !f.wallet.state().promptPending); await flush();
      assert.equal(f.calls.some(row => row.path === '/transfer'), false); assert.equal(f.field('review-panel').hidden, true);
      assert.equal(f.walletCalls.filter(row => row.method === 'eth_signTypedData_v4').length, 1);
    } finally { f.cleanup(); }
  });
}

test('wrong network data disconnects the wallet, clears balances, and cannot authorize mining', async () => {
  const f = fixture();
  try {
    await f.ready(); f.hookServer(path => path === '/status' ? json({ ...f.getStatus(), networkId: '0'.repeat(64) }) : undefined);
    f.click('mine'); await f.until(() => /different DVC network/.test(f.field('status').textContent));
    assert.equal(f.wallet.state().address, null); assert.equal(f.field('available').textContent, 'Unavailable'); assert.equal(f.button('mine').disabled, true); assert.equal(f.mining(), null);
  } finally { f.cleanup(); }
});

test('a failed balance refresh makes balances unavailable instead of displaying a fabricated zero or old spendable funds', async () => {
  const f = fixture();
  try {
    await f.ready(); f.hookServer(path => path.startsWith('/account/') ? new Response('SECRET remote detail', { status: 500 }) : undefined); f.click('refresh');
    await f.until(() => f.field('available').textContent === 'Unavailable'); assert.equal(f.button('review').disabled, true); assert.equal(f.field('status').textContent.includes('SECRET'), false);
  } finally { f.cleanup(); }
});

test('late data from a previous account cannot restore balances or review controls', async () => {
  const f = fixture(), gate = deferred(); let waiting = false;
  try {
    await f.ready(); f.hookServer(path => { if (path.startsWith('/account/')) { waiting = true; return gate.promise; } }); f.click('refresh'); await f.until(() => waiting); f.accountChange();
    gate.resolve(json(f.getAccount())); await flush(); await flush(); assert.equal(f.field('available').textContent, 'Unavailable'); assert.equal(f.button('mine').disabled, true); assert.equal(f.wallet.state().address, null);
  } finally { gate.resolve(json(f.getAccount())); f.cleanup(); }
});

for (const failure of ['network wait', 'body wait', 'oversized body', 'oversized header', 'invalid JSON', 'duplicate JSON', 'mismatched account', 'inconsistent pending']) {
  test(`bounded node loading handles ${failure} without unsafe wallet work`, async () => {
    const f = fixture({ requestTimeoutMs: 15 }); let canceled = false;
    try {
      if (failure === 'network wait') f.hookServer(() => new Promise(() => {}));
      if (failure === 'body wait') f.hookServer(() => ({ ok: true, headers: new Headers(), body: { getReader: () => ({ read: () => new Promise(() => {}), cancel: () => { canceled = true; }, releaseLock() {} }) } }));
      if (failure === 'oversized body') f.hookServer(() => new Response('x'.repeat(1024 * 1024 + 1)));
      if (failure === 'oversized header') f.hookServer(() => new Response('', { headers: { 'content-length': String(1024 * 1024 + 1) } }));
      if (failure === 'invalid JSON') f.hookServer(() => new Response('not json SECRET'));
      if (failure === 'duplicate JSON') f.hookServer(() => new Response('{"networkId":"' + '0'.repeat(64) + '",' + JSON.stringify(f.getStatus()).slice(1)));
      if (failure === 'mismatched account') f.hookServer(path => path.startsWith('/account/') ? json({ ...f.getAccount(), address: recipient }) : undefined);
      if (failure === 'inconsistent pending') f.setPending('1000000001');
      if (['mismatched account', 'inconsistent pending'].includes(failure)) {
        await f.activate(); f.click('discover'); f.field('provider').value = id; f.field('provider').fire('change'); f.click('connect');
      } else f.ui.setActive(true);
      await f.until(() => /time|limit|unreadable|does not match|reconciled/.test(f.field('status').textContent));
      assert.equal(f.field('available').textContent, 'Unavailable'); assert.equal(f.button('mine').disabled, true); assert.equal(f.field('status').textContent.includes('SECRET'), false);
      if (failure === 'body wait') assert.equal(canceled, true);
    } finally { f.cleanup(); }
  });
}

for (const algorithm of ['sha256', 'sha256d']) {
  test(`${algorithm} UI work submits a real verified block and exposes only immature rewards`, async () => {
    const f = fixture({ availableAtoms: '0' });
    try {
      await f.ready(); f.field('algorithm').value = algorithm; f.field('intensity').value = 'eco'; f.click('mine'); await f.until(() => !!f.mining());
      const options = f.mining(), job = f.jobs.at(-1); assert.equal(options.algorithm, algorithm); assert.equal(options.intensity, 'eco'); assert.equal(options.maxMs, 60000); assert.equal(options.maxCandidates, 4194304);
      f.finishMining(fixtureWork(job)); await f.until(() => f.calls.some(row => row.path === '/block') && !f.button('mine').disabled);
      assert.equal(f.calls.filter(row => row.path === '/block').length, 1); assert.match(f.field('progress').textContent, /immature for six blocks/);
      assert.equal(f.field('available').textContent, '0.00000000 DVC'); assert.equal(f.field('immature').textContent, '50.00000000 DVC'); assert.equal(f.button('review').disabled, true);
      assert.equal(f.walletCalls.some(row => row.method === 'eth_signTypedData_v4'), false);
    } finally { f.cleanup(); }
  });
}

for (const mismatch of ['digest', 'height', 'canonical', 'accepted']) {
  test(`a mining receipt with a different ${mismatch} cannot claim this block was accepted`, async () => {
    const f = fixture();
    try {
      await f.ready(); f.hookServer((path, body) => {
        if (path !== '/block') return;
        const receipt = { accepted: true, canonical: true, hash: body.digest, height: body.height };
        if (mismatch === 'digest') receipt.hash = '12'.repeat(32); if (mismatch === 'height') receipt.height = (BigInt(body.height) + 1n).toString();
        if (mismatch === 'canonical') receipt.canonical = false; if (mismatch === 'accepted') receipt.accepted = false;
        return json(receipt);
      });
      f.click('mine'); await f.until(() => !!f.mining()); f.finishMining(fixtureWork(f.jobs.at(-1)));
      await f.until(() => /did not confirm this exact block/.test(f.field('status').textContent));
      assert.match(f.field('progress').textContent, /^Mining stopped\./); assert.equal(f.calls.filter(row => row.path === '/block').length, 1);
      assert.equal(f.field('immature').textContent, '0.00000000 DVC'); assert.equal(f.button('mine').disabled, false);
    } finally { f.cleanup(); }
  });
}

for (const interrupt of ['stop', 'hide', 'leave view', 'account', 'network', 'destroy']) {
  test(`GPU work is canceled and late candidates cannot submit after ${interrupt}`, async () => {
    const f = fixture();
    try {
      await f.ready(); f.click('mine'); await f.until(() => !!f.mining()); const options = f.mining();
      if (interrupt === 'stop') f.click('stop'); if (interrupt === 'hide') f.hide(); if (interrupt === 'leave view') f.ui.setActive(false);
      if (interrupt === 'account') f.accountChange(); if (interrupt === 'network') f.networkChange(); if (interrupt === 'destroy') f.ui.destroy();
      assert.equal(options.signal.aborted, true); assert.equal(options.isVisible(), false);
      f.finishMining({ status: 'found', algorithm: 'sha256', nonce: '0', digest: '0'.repeat(64) }); await flush(); await flush(); assert.equal(f.calls.some(row => row.path === '/block'), false);
      if (interrupt === 'hide') { f.show(); await flush(); assert.equal(f.calls.filter(row => row.path === '/job').length, 1); }
    } finally { f.cleanup(); }
  });
}

test('tampered work jobs and invalid GPU results never reach the block endpoint', async () => {
  const f = fixture();
  try {
    await f.ready(); f.hookServer((path, body) => {
      if (path !== '/job') return;
      const job = createMiningJob(validateChain([], { now }), { miner: recipient, algorithm: body.algorithm, now });
      return json({ networkId: MAIN_NETWORK_ID, prefixHex: job.prefixHex, targetHex: job.targetHex, algorithm: body.algorithm, block: finalizeBlock(job, '0') });
    });
    f.click('mine'); await f.until(() => /does not match/.test(f.field('status').textContent)); assert.equal(f.mining(), null);
    f.hookServer(null); f.click('mine'); await f.until(() => !!f.mining()); f.finishMining({ status: 'found', algorithm: 'sha256', nonce: '0', digest: '0'.repeat(64) });
    await f.until(() => /independent verification/.test(f.field('status').textContent)); assert.equal(f.calls.some(row => row.path === '/block'), false);
  } finally { f.cleanup(); }
});
