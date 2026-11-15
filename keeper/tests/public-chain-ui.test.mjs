// SPDX-License-Identifier: GPL-3.0-only
// Deterministic lifecycle tests with a minimal DOM and injected provider. No real wallet/RPC.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createPublicChainUI } from '../public/public-chain.mjs';
import { GARDEN_ARTIFACT, word } from '../public/public-chain-wallet.mjs';

const owner = '0x' + '11'.repeat(20), garden = '0x' + '33'.repeat(20);
function fixture() {
  const globals = new Map(['Option', 'document', 'window', 'crypto', 'localStorage'].map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)]));
  const elements = new Map(), clickListeners = new Map(), documentListeners = new Map(), windowListeners = new Map(), walletListeners = new Map(), requests = [];
  let releaseMining, digests = 0;
  const miningReply = new Promise(resolve => { releaseMining = resolve; });
  function element() { return { value: '', textContent: '', disabled: false, checked: false, addEventListener() {}, removeEventListener() {}, replaceChildren(...children) { this.value = children[0]?.value || ''; } }; }
  const container = { classList: { add() {} }, innerHTML: '', querySelector(selector) { if (!elements.has(selector)) elements.set(selector, element()); return elements.get(selector); }, addEventListener(name, fn) { clickListeners.set(name, fn); }, removeEventListener(name) { clickListeners.delete(name); } };
  const provider = {
    on(name, fn) { walletListeners.set(name, fn); }, removeListener(name) { walletListeners.delete(name); },
    async request({ method, params }) {
      requests.push(method);
      if (method === 'eth_requestAccounts' || method === 'eth_accounts') return [owner];
      if (method === 'eth_chainId') return '0x1';
      if (method === 'eth_getCode') return GARDEN_ARTIFACT.deployedBytecode;
      if (method === 'eth_call') {
        const selector = params[0].data.slice(2, 10), methods = GARDEN_ARTIFACT.selectors;
        if (selector === methods['recipesOf(address)']) return '0x' + word(32) + word(1) + word(1);
        if (selector === methods['miningState(bytes32)']) return miningReply;
        return '0x' + word(0);
      }
      throw new Error('Unexpected request in read-only fixture: ' + method);
    },
  };
  globalThis.Option = class { constructor(label, value) { this.value = value; } };
  globalThis.document = { hidden: false, addEventListener(name, fn) { documentListeners.set(name, fn); }, removeEventListener(name) { documentListeners.delete(name); } };
  globalThis.window = { isSecureContext: true, ethereum: provider, addEventListener(name, fn) { windowListeners.set(name, fn); }, removeEventListener(name) { windowListeners.delete(name); } };
  globalThis.localStorage = { getItem() { return null; }, setItem() {}, removeItem() {} };
  Object.defineProperty(globalThis, 'crypto', { configurable: true, value: { getRandomValues: value => value, subtle: { async digest() { digests++; return new Uint8Array(32); } } } });
  const ui = createPublicChainUI(container, { getRecipe: () => null });
  const field = name => container.querySelector(`[data-field="${name}"]`), button = name => container.querySelector(`[data-action="${name}"]`);
  const click = action => clickListeners.get('click')?.({ target: { closest: () => ({ dataset: { action } }) } });
  const flush = () => new Promise(resolve => setImmediate(resolve));
  return {
    ui, field, button, click, flush, requests, digests: () => digests,
    resolve() { releaseMining('0x' + word(7) + word(100) + word(0) + word(1)); },
    walletChange() { walletListeners.get('accountsChanged')?.(); },
    pagehide() { windowListeners.get('pagehide')?.(); },
    hideDocument() { document.hidden = true; documentListeners.get('visibilitychange')?.(); },
    showDocument() { document.hidden = false; documentListeners.get('visibilitychange')?.(); },
    async ready() { ui.setVisible(true); click('connect'); await flush(); field('contract').value = garden; click('attach'); await flush(); },
    cleanup() {
      ui.destroy();
      for (const [name, descriptor] of globals) descriptor ? Object.defineProperty(globalThis, name, descriptor) : delete globalThis[name];
    },
  };
}

test('public UI does not request wallet access when created or made visible', async () => {
  const f = fixture();
  try { f.ui.setVisible(true); await f.flush(); assert.deepEqual(f.requests, []); assert.equal(f.digests(), 0); }
  finally { f.cleanup(); }
});

for (const action of ['hide and return', 'Stop', 'document hide and return', 'pagehide', 'wallet change']) {
  test(`pending mining challenge cannot restart after ${action}`, async () => {
    const f = fixture();
    try {
      await f.ready(); f.click('mine'); await f.flush();
      assert.equal(f.button('stop').disabled, false, 'Stop is available during the RPC');
      if (action === 'hide and return') { f.ui.setVisible(false); f.ui.setVisible(true); }
      if (action === 'Stop') f.click('stop');
      if (action === 'document hide and return') { f.hideDocument(); f.showDocument(); }
      if (action === 'pagehide') f.pagehide();
      if (action === 'wallet change') f.walletChange();
      f.resolve(); await f.flush();
      assert.equal(f.digests(), 0); assert.equal(f.button('proof').disabled, true);
      assert.equal(f.requests.includes('eth_sendTransaction'), false);
    } finally { f.cleanup(); }
  });
}

test('a visible user-started session finds a proof without submitting it, and hiding discards it', async () => {
  const f = fixture();
  try {
    await f.ready(); f.click('mine'); await f.flush(); f.resolve(); await f.flush();
    assert.equal(f.digests(), 1); assert.equal(f.button('proof').disabled, false);
    assert.equal(f.requests.includes('eth_sendTransaction'), false);
    f.ui.setVisible(false); f.ui.setVisible(true);
    assert.equal(f.button('proof').disabled, true); assert.equal(f.digests(), 1);
  } finally { f.cleanup(); }
});
