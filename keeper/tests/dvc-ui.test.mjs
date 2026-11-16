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
function fixture({ availableAtoms = '1000000000', pendingOutAtoms = '0', requestTimeoutMs = 1000, browserPeerCount = () => 0, repeatDelayMs = 20 } = {}) {
  const elements = new Map(), doc = new EventTarget(), win = new EventTarget(), calls = [], walletCalls = [], listeners = new Map(), jobs = [];
  doc.hidden = false; doc.createElement = tag => new Element(tag); doc.defaultView = win; win.top = win.self = win;
  let copied = '', wallet, accountNonce = '0', pending = pendingOutAtoms, available = availableAtoms, immature = '0', history = [], serverHook = null, requestHook = null, signGate = null;
  let exposed = [address], chain = '0x1', mining = null, releaseMining = null, rejectMining = null, nativeState = validateChain([], { now });
  const consoleLog = []; let executeCommand, consoleEnabled = false, consoleDestroyed = false, discoveries = 0;
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
  win.addEventListener('eip6963:requestProvider', () => { discoveries++; const event = new Event('eip6963:announceProvider'); Object.defineProperty(event, 'detail', { value: { info: { uuid: id.slice(8), name: 'Disposable UI Wallet' }, provider } }); win.dispatchEvent(event); });
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
  const ui = createDvcUI(container, { document: doc, window: win, fetchImpl, requestTimeoutMs, getBrowserPeerCount: browserPeerCount, repeatDelayMs,
    consoleFactory: (_host, { execute }) => { executeCommand = execute; return { write(text, level = 'output') { consoleLog.push({ text, level }); }, setEnabled(value) { consoleEnabled = value; }, destroy() { consoleDestroyed = true; } }; },
    walletFactory: opts => { wallet = createDvcWallet({ ...opts, eventTarget: win, getLegacyProvider: () => null, rpcTimeoutMs: 1000, signatureTimeoutMs: 1000 }); return wallet; },
    mineCandidate: opts => { mining = opts; return new Promise((resolve, reject) => { releaseMining = resolve; rejectMining = reject; }); } });
  const click = name => { const target = button(name); if (target.disabled) return false; const event = new Event('click'); Object.defineProperty(event, 'target', { value: target }); container.dispatchEvent(event); return true; };
  const until = async predicate => { for (let i = 0; i < 250; i++) { if (predicate()) return; await flush(); } assert.fail('UI did not settle: ' + field('status').textContent + ' / ' + field('progress').textContent); };
  return { ui, wallet, calls, walletCalls, container, field, button, click, until, getStatus, getAccount, jobs, mining: () => mining, copied: () => copied,
    discoveries: () => discoveries,
    consoleLog, command: (command, args = []) => executeCommand({ command, args }), consoleEnabled: () => consoleEnabled, consoleDestroyed: () => consoleDestroyed,
    hookServer(fn) { serverHook = fn; }, hookWallet(fn) { requestHook = fn; }, setNonce(value) { accountNonce = value; }, setPending(value) { pending = value; },
    async activate() { ui.setActive(true); await until(() => field('node').textContent.startsWith('Block')); },
    setPayout(value) { field('mining-address').value = value; field('mining-address').fire('input'); },
    async addressReady(value = address) { await this.activate(); this.setPayout(value); await until(() => !button('refresh').disabled && field('mining-available').textContent !== 'Unavailable'); },
    async ready() { await this.activate(); click('discover'); field('provider').value = id; field('provider').fire('change'); click('connect'); await until(() => !button('mine').disabled); },
    async review(amount = '1.25') { field('recipient').value = recipient; field('amount').value = amount; field('amount').fire('input'); click('review'); await until(() => !field('review-panel').hidden && !button('review').disabled); field('consent').checked = true; field('consent').fire('change'); },
    gateSignature() { signGate = deferred(); return { release() { signGate.resolve(); }, waiting: () => walletCalls.some(row => row.method === 'eth_signTypedData_v4') }; },
    hide() { doc.hidden = true; doc.dispatchEvent(new Event('visibilitychange')); }, show() { doc.hidden = false; doc.dispatchEvent(new Event('visibilitychange')); },
    pagehide() { win.dispatchEvent(new Event('pagehide')); }, accountChange() { exposed = [recipient]; listeners.get('accountsChanged')?.(exposed); }, networkChange() { chain = '0x2'; listeners.get('chainChanged')?.(chain); },
    finishMining(result) { releaseMining(result); }, failMining(message) { rejectMining(Error(message)); }, cleanup() { signGate?.resolve(); releaseMining?.({ status: 'stopped' }); ui.destroy(); },
  };
}

test('an address alone mines and collects an independently valid block with no wallet discovery or RPC', async () => {
  const f = fixture({ availableAtoms: '0' });
  try {
    f.hookWallet(() => { throw Error('Mining must not request a wallet.'); });
    await f.addressReady(computeAddress(key.publicKey));
    assert.equal(f.wallet.state().address, null); assert.equal(f.button('mine').disabled, false);
    assert.equal(f.button('review').disabled, true); assert.equal(f.button('send').disabled, true);
    assert.equal(f.field('available').textContent, 'Unavailable'); assert.equal(f.field('mining-available').textContent, '0.00000000 DVC');
    assert.equal(f.mining(), null); assert.match(await f.command('balance'), new RegExp(address));
    const running = f.command('mine'); await f.until(() => !!f.mining());
    assert.equal(f.jobs[0].header.miner, address); assert.equal(f.mining().isVisible(), true);
    f.finishMining(fixtureWork(f.jobs[0])); await running;
    assert.match(f.field('catcher').textContent, /1 block accepted/); assert.equal(f.field('mining-immature').textContent, '50.00000000 DVC');
    assert.equal(f.field('immature').textContent, 'Unavailable'); assert.equal(f.walletCalls.length, 0); assert.equal(f.discoveries(), 0);
    assert.equal(f.button('review').disabled, true); assert.equal(f.calls.find(row => row.path === '/block').body.miner, address);
  } finally { f.cleanup(); }
});

test('invalid mining addresses never request a job or echo rejected input into the console', async () => {
  const f = fixture();
  try {
    await f.activate();
    for (const value of ['', '0x1234', '0x' + '0'.repeat(40), '0x52908400098527886E0F7030069857D2E4169Ee7', '<img src=x onerror=private-marker>']) {
      f.setPayout(value); await f.until(() => !f.button('refresh').disabled);
      assert.equal(f.button('mine').disabled, true); await f.command('mine');
      assert.equal(f.jobs.length, 0); assert.equal(f.mining(), null); assert.equal(f.field('mining-available').textContent, 'Unavailable');
    }
    assert.equal(f.walletCalls.length, 0); assert.equal(f.discoveries(), 0);
    assert.doesNotMatch(JSON.stringify(f.consoleLog), /private-marker|0x1234|529084/);
  } finally { f.cleanup(); }
});

test('a rich mining destination cannot fund a poor signing wallet or change its reviewed sender', async () => {
  const f = fixture({ availableAtoms: '1000000' });
  try {
    f.hookServer(path => path === '/account/' + recipient ? json({ ...f.getAccount(recipient), availableAtoms: '100000000000', totalAtoms: '100000000000' }) : undefined);
    await f.addressReady(recipient); assert.equal(f.field('mining-available').textContent, '1000.00000000 DVC');
    assert.equal(f.button('review').disabled, true);
    f.click('discover'); f.field('provider').value = id; f.field('provider').fire('change'); f.click('connect');
    await f.until(() => f.field('available').textContent === '0.01000000 DVC' && !f.button('connect').disabled);
    assert.equal(f.field('mining-address').value, recipient);
    const walletCount = f.walletCalls.length, running = f.command('mine'); await f.until(() => !!f.mining());
    assert.equal(f.jobs[0].header.miner, recipient); assert.equal(f.walletCalls.length, walletCount);
    f.finishMining({ status: 'exhausted' }); await running;
    f.field('recipient').value = recipient; f.field('amount').value = '1'; f.click('review');
    await f.until(() => /does not cover/.test(f.field('status').textContent));
    assert.equal(f.walletCalls.some(row => row.method === 'eth_signTypedData_v4'), false); assert.equal(f.calls.some(row => row.path === '/transfer'), false);
    await f.review('0.001'); assert.match(f.field('review').textContent, new RegExp('From: ' + address));
    f.click('send'); await f.until(() => f.calls.some(row => row.path === '/transfer') && !f.button('mine').disabled);
    const transfer = f.calls.find(row => row.path === '/transfer').body;
    assert.equal(transfer.sender, address); assert.equal(transfer.recipient, recipient); assert.equal(verifyTransfer(transfer, { height: '1' }).valid, true);
    assert.equal(f.field('mining-available').textContent, '1000.00000000 DVC');
  } finally { f.cleanup(); }
});

test('using a wallet address is explicit, and disconnecting keeps the selected mining destination usable', async () => {
  const f = fixture();
  try {
    await f.ready(); assert.equal(f.field('mining-address').value, address);
    f.setPayout(recipient); await f.until(() => !f.button('refresh').disabled);
    f.click('use-wallet-address'); await f.until(() => !f.button('refresh').disabled);
    assert.equal(f.field('mining-address').value, address);
    f.click('disconnect'); assert.equal(f.wallet.state().address, null); assert.equal(f.field('mining-address').value, address);
    assert.equal(f.button('mine').disabled, false); assert.equal(f.button('review').disabled, true);
    const walletCount = f.walletCalls.length; f.click('mine'); await f.until(() => !!f.mining());
    assert.equal(f.jobs[0].header.miner, address); assert.equal(f.walletCalls.length, walletCount);
    f.finishMining({ status: 'exhausted' }); await f.until(() => !f.button('mine').disabled);
  } finally { f.cleanup(); }
});

test('late watched-account data cannot restore the previous payout after an address edit', async () => {
  const f = fixture(), held = deferred(); let waiting = false;
  try {
    await f.addressReady();
    f.hookServer(path => { if (path === '/account/' + address) { waiting = true; return held.promise; } if (path === '/account/' + recipient) return json({ ...f.getAccount(recipient), availableAtoms: '300000000', totalAtoms: '300000000' }); });
    f.click('refresh'); await f.until(() => waiting); f.setPayout(recipient);
    await f.until(() => f.field('mining-available').textContent === '3.00000000 DVC');
    held.resolve(json({ ...f.getAccount(address), availableAtoms: '99900000000', totalAtoms: '99900000000' })); await flush(); await flush();
    assert.equal(f.field('mining-available').textContent, '3.00000000 DVC'); assert.match(await f.command('balance'), new RegExp(recipient));
    assert.equal(f.field('available').textContent, 'Unavailable'); assert.equal(f.button('review').disabled, true);
  } finally { held.resolve(json(f.getAccount())); f.cleanup(); }
});

for (const phase of ['account', 'job', 'GPU', 'receipt']) test(`editing the payout cancels old mining work during ${phase}`, async () => {
  const f = fixture(), held = deferred(); let waiting = false;
  const job = createMiningJob(validateChain([], { now }), { miner: address, algorithm: 'sha256', now });
  try {
    await f.addressReady(); await f.command('repeat', ['on']);
    if (phase === 'account' || phase === 'job') f.hookServer(path => { if (path === (phase === 'account' ? '/account/' + address : '/job')) { waiting = true; return held.promise; } });
    const running = f.command('mine');
    if (phase === 'account' || phase === 'job') await f.until(() => waiting);
    else {
      await f.until(() => !!f.mining());
      if (phase === 'receipt') { f.hookServer(path => { if (path === '/block') { waiting = true; return held.promise; } }); f.finishMining(fixtureWork(f.jobs[0])); await f.until(() => waiting); }
    }
    f.setPayout(recipient); assert.equal(f.field('repeat').checked, false);
    if (f.mining()) assert.equal(f.mining().signal.aborted, true);
    if (phase === 'account') held.resolve(json(f.getAccount(address)));
    if (phase === 'job') held.resolve(json({ networkId: MAIN_NETWORK_ID, prefixHex: job.prefixHex, targetHex: job.targetHex, algorithm: 'sha256', block: finalizeBlock(job, '0') }));
    if (phase === 'GPU') f.finishMining(fixtureWork(f.jobs[0]));
    if (phase === 'receipt') held.resolve(json({ accepted: true, canonical: true, hash: fixtureWork(f.jobs[0]).digest, height: '1' }));
    await running; await f.until(() => !f.button('refresh').disabled);
    assert.equal(f.field('mining-address').value, recipient); assert.match(f.field('catcher').textContent, /0 blocks accepted/);
    assert.equal(f.field('mining-immature').textContent, '0.00000000 DVC'); assert.equal(f.walletCalls.length, 0);
    assert.equal(f.calls.filter(row => row.path === '/block').length, phase === 'receipt' ? 1 : 0);
    assert.equal(f.jobs.length, phase === 'GPU' || phase === 'receipt' ? 1 : 0);
  } finally { held.resolve(json(f.getAccount())); f.cleanup(); }
});

test('address-only repeat keeps the payout fixed and turning it off starts no more work', async () => {
  const f = fixture();
  try {
    await f.addressReady(); f.click('nightcap'); const running = f.command('mine'); await f.until(() => !!f.mining());
    const first = f.mining(); f.finishMining({ status: 'exhausted' }); await f.until(() => f.mining() !== first);
    assert.equal(f.jobs.length, 2); assert.ok(f.jobs.every(job => job.header.miner === address));
    await f.command('repeat', ['off']); f.finishMining({ status: 'stopped' }); await running;
    assert.equal(f.jobs.length, 2); assert.equal(f.walletCalls.length, 0); assert.equal(f.discoveries(), 0);
  } finally { f.cleanup(); }
});

test('command console reports loaded state without connecting, signing or mining automatically', async () => {
  const f = fixture();
  try {
    assert.equal(f.consoleEnabled(), false);
    await f.activate(); assert.equal(f.consoleEnabled(), true);
    assert.match(await f.command('status'), /Block 0/);
    assert.match(await f.command('status'), /Latest loaded/);
    await f.command('balance'); assert.equal(f.consoleLog.at(-1).level, 'error');
    assert.equal(f.walletCalls.length, 0); assert.equal(f.mining(), null);
    await f.command('wallets'); f.field('provider').value = id; f.field('provider').fire('change'); await f.command('connect');
    assert.match(await f.command('balance'), /Available: 10\.00000000 DVC/);
    assert.equal(f.walletCalls.some(row => row.method === 'eth_signTypedData_v4'), false);
    f.hide(); assert.equal(f.consoleEnabled(), false); const calls = f.calls.length;
    await f.command('mine'); await f.command('connect'); assert.equal(f.calls.length, calls); assert.equal(f.mining(), null);
  } finally { f.cleanup(); }
  assert.equal(f.consoleDestroyed(), true);
});

test('console mining shares the button limits, rejects overlapping work, and stops immediately', async () => {
  const f = fixture();
  try {
    await f.ready(); await f.command('algorithm', ['sha256d']); await f.command('intensity', ['eco']);
    const running = f.command('mine'); await f.until(() => !!f.mining());
    assert.equal(f.mining().algorithm, 'sha256d'); assert.equal(f.mining().intensity, 'eco');
    assert.equal(f.mining().maxMs, 60000); assert.equal(f.mining().maxCandidates, 4194304);
    assert.equal(f.button('mine').disabled, true);
    await f.command('mine'); await f.command('algorithm', ['sha256']); assert.equal(f.jobs.length, 1);
    assert.equal(f.field('algorithm').value, 'sha256d');
    await f.command('stop'); assert.equal(f.mining().signal.aborted, true); assert.equal(f.button('stop').disabled, true);
    f.finishMining({ status: 'found', algorithm: 'sha256d', nonce: '0', digest: '0'.repeat(64) }); await running;
    assert.equal(f.calls.some(row => row.path === '/block'), false);
    assert.equal(f.consoleLog.some(row => /accepted/.test(row.text)), false);
  } finally { f.cleanup(); }
});

test('GPU failures are logged safely with actionable adapter guidance and no raw error echo through status', async () => {
  const f = fixture();
  try {
    await f.ready(); const attempt = f.command('mine'); await f.until(() => !!f.mining());
    f.failMining('No WebGPU adapter is available. No CPU miner was started.'); await attempt;
    assert.equal(f.consoleLog.at(-1).level, 'error'); assert.match(f.consoleLog.at(-1).text, /restart the browser/);
    const previous = f.mining(); const next = f.command('mine'); await f.until(() => f.mining() !== previous);
    const privateError = 'driver detail private-marker-should-not-copy <img src=x onerror=alert(1)>';
    f.failMining(privateError); await next;
    assert.equal(f.consoleLog.at(-1).level, 'error'); assert.doesNotMatch(JSON.stringify(f.consoleLog), /private-marker|<img/);
    assert.doesNotMatch(await f.command('status'), /private-marker|<img/);
    assert.equal(f.calls.some(row => row.path === '/block'), false);
  } finally { f.cleanup(); }
});

test('console samples progress and never reports late work after hiding the view', async () => {
  const f = fixture();
  try {
    await f.ready(); const running = f.command('mine'); await f.until(() => !!f.mining());
    const before = f.consoleLog.length;
    for (let elapsedMs = 0; elapsedMs < 10000; elapsedMs += 100) f.mining().onProgress({ phase: 'searching', attempts: elapsedMs, elapsedMs });
    assert.equal(f.consoleLog.length - before, 3);
    f.hide(); const hiddenCount = f.consoleLog.length;
    f.mining().onProgress({ phase: 'searching', attempts: 20000, elapsedMs: 12000 });
    f.finishMining({ status: 'exhausted' }); await running;
    assert.equal(f.consoleLog.length, hiddenCount); assert.equal(f.calls.some(row => row.path === '/block'), false);
    f.show(); await f.until(() => f.consoleEnabled()); assert.equal(f.jobs.length, 1);
  } finally { f.cleanup(); }
});

test('console does not expose transfer signing or arbitrary action commands', async () => {
  const f = fixture();
  try {
    await f.ready(); const calls = f.calls.length, walletCalls = f.walletCalls.length;
    for (const command of ['send', 'sign', 'eval', 'fetch', 'shutdown', 'transfer']) await f.command(command);
    await f.command('algorithm', ['unlisted']); await f.command('intensity', ['999']);
    assert.equal(f.calls.length, calls); assert.equal(f.walletCalls.length, walletCalls); assert.equal(f.mining(), null);
    assert.equal(f.field('algorithm').value, 'sha256'); assert.equal(f.field('intensity').value, 'balanced');
    assert.equal(f.consoleLog.slice(-8).every(row => row.level === 'error'), true);
  } finally { f.cleanup(); }
});

test('Nightcap configures SHA-256 Eco repeat without connecting or starting, and starts fresh after reopening', async () => {
  const f = fixture();
  try {
    await f.activate(); assert.equal(f.field('repeat').checked, false);
    f.click('nightcap'); assert.equal(f.field('algorithm').value, 'sha256'); assert.equal(f.field('intensity').value, 'eco'); assert.equal(f.field('repeat').checked, true);
    assert.equal(f.jobs.length, 0); assert.equal(f.walletCalls.length, 0); assert.match(f.field('mushroom-art').innerHTML, /<svg/);
    f.hide(); assert.equal(f.field('repeat').checked, false); f.show(); await flush(); assert.equal(f.jobs.length, 0);
  } finally { f.cleanup(); }
});

test('Keep mining repeats exhausted rounds sequentially and repeat off cancels the current round', async () => {
  const f = fixture();
  try {
    await f.ready(); await f.command('repeat', ['on']); assert.equal(f.jobs.length, 0);
    const running = f.command('mine'); await f.until(() => f.jobs.length === 1 && !!f.mining()); const first = f.mining();
    f.finishMining({ status: 'exhausted' }); await f.until(() => f.jobs.length === 2 && f.mining() !== first);
    assert.equal(f.mining().maxMs, 60000); assert.equal(f.field('repeat').disabled, false);
    await f.command('repeat', ['off']); assert.equal(f.field('repeat').checked, false); assert.equal(f.mining().signal.aborted, true);
    f.finishMining({ status: 'exhausted' }); await running; await new Promise(resolve => setTimeout(resolve, 35));
    assert.equal(f.jobs.length, 2); assert.equal(f.calls.some(row => row.path === '/block'), false);
  } finally { f.cleanup(); }
});

test('auto catcher records only accepted work and refreshes immature rewards before the following round', async () => {
  const f = fixture();
  try {
    await f.ready(); f.click('nightcap'); const running = f.command('mine'); await f.until(() => !!f.mining());
    const first = f.mining(); f.finishMining(fixtureWork(f.jobs[0]));
    await f.until(() => f.jobs.length === 2 && f.mining() !== first);
    assert.match(f.field('catcher').textContent, /1 block accepted this session/);
    assert.match(f.field('immature').textContent, /^50\.00000000 DVC$/);
    assert.equal(f.jobs[1].header.parent, f.getStatus().tip.hash);
    assert.equal(f.calls.filter(row => row.path === '/block').length, 1);
    f.field('repeat').checked = false; f.field('repeat').fire('change'); assert.equal(f.mining().signal.aborted, true);
    f.finishMining({ status: 'stopped' }); await running;
    f.accountChange(); assert.match(f.field('catcher').textContent, /1 block accepted this session/);
    f.setPayout(recipient); assert.match(f.field('catcher').textContent, /0 blocks accepted this session/);
  } finally { f.cleanup(); }
});

for (const transition of ['hide', 'pagehide', 'accountChange', 'networkChange']) test(`repeat mining cancels pending work and resets after ${transition}`, async () => {
  const f = fixture();
  try {
    await f.ready(); await f.command('repeat', ['on']); const running = f.command('mine'); await f.until(() => !!f.mining());
    f[transition](); assert.equal(f.field('repeat').checked, false); assert.equal(f.mining().signal.aborted, true);
    f.finishMining({ status: 'found', algorithm: 'sha256', nonce: '0', digest: '0'.repeat(64) }); await running;
    await new Promise(resolve => setTimeout(resolve, 35)); assert.equal(f.jobs.length, 1); assert.equal(f.calls.some(row => row.path === '/block'), false);
  } finally { f.cleanup(); }
});

test('hiding during the interval between rounds prevents a fresh job', async () => {
  const f = fixture({ repeatDelayMs: 80 });
  try {
    await f.ready(); await f.command('repeat', ['on']); const running = f.command('mine'); await f.until(() => !!f.mining());
    f.finishMining({ status: 'exhausted' }); await f.until(() => /Preparing the next round/.test(f.field('progress').textContent));
    f.hide(); await running; await new Promise(resolve => setTimeout(resolve, 100));
    assert.equal(f.jobs.length, 1); assert.equal(f.field('repeat').checked, false);
  } finally { f.cleanup(); }
});

test('an old in-flight status response cannot roll back or stop the next mining round', async () => {
  const f = fixture(), delayed = deferred();
  try {
    await f.ready(); await f.command('repeat', ['on']); const running = f.command('mine'); await f.until(() => !!f.mining());
    const oldStatus = f.getStatus(), first = f.mining(); let holdStatus = true;
    f.hookServer(path => path === '/status' && holdStatus ? delayed.promise : undefined);
    f.click('refresh'); await f.until(() => f.button('refresh').disabled); holdStatus = false;
    f.finishMining(fixtureWork(f.jobs[0])); await f.until(() => f.jobs.length === 2 && f.mining() !== first);
    delayed.resolve(json(oldStatus)); await flush(); await flush();
    assert.match(f.field('node').textContent, /Block 1/); assert.equal(f.mining().signal.aborted, false); assert.equal(f.field('repeat').checked, true);
    await f.command('stop'); f.finishMining({ status: 'stopped' }); await running;
  } finally { delayed.resolve(json(f.getStatus())); f.cleanup(); }
});

test('a GPU failure or invalid miner result turns repeat off without retrying', async () => {
  for (const invalid of [false, true]) {
    const f = fixture();
    try {
      await f.ready(); await f.command('repeat', ['on']); const running = f.command('mine'); await f.until(() => !!f.mining());
      if (invalid) f.finishMining({ status: 'unexpected' }); else f.failMining('No WebGPU adapter is available. No CPU miner was started.');
      await running; await new Promise(resolve => setTimeout(resolve, 35));
      assert.equal(f.field('repeat').checked, false); assert.equal(f.jobs.length, 1); assert.equal(f.calls.some(row => row.path === '/block'), false);
    } finally { f.cleanup(); }
  }
});

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
    assert.equal(f.field('mining-available').textContent, '6.74999000 DVC'); assert.match(await f.command('balance'), /Available: 6\.74999000 DVC/);
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
    gate.resolve(json(f.getAccount())); await flush(); await flush(); assert.equal(f.field('available').textContent, 'Unavailable'); assert.equal(f.button('review').disabled, true); assert.equal(f.wallet.state().address, null);
    assert.equal(f.button('mine').disabled, false); assert.equal(f.field('mining-address').value, address);
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
