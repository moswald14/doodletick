// SPDX-License-Identifier: GPL-3.0-only
// Native DVC signatures only. No EVM transactions, approvals or network changes.
import { genesis, transferTypedData, attachTransferSignature } from './dvc-core.mjs';

const ADDRESS = /^0x[0-9a-f]{40}$/i, MAX_UINT = (1n << 256n) - 1n;
const METHODS = new Set(['eth_requestAccounts', 'eth_accounts', 'eth_chainId', 'eth_signTypedData_v4']);
const localErrors = new WeakSet();
const fail = (message, code = 'DVC_WALLET_INVALID') => { const error = Object.assign(new Error(message), { code }); localErrors.add(error); return error; };
const text = value => typeof value === 'string' ? value.replace(/[\u0000-\u001f\u007f-\u009f]/g, '').slice(0, 80) : '';
function address(value) { if (typeof value !== 'string' || !ADDRESS.test(value)) throw fail('The wallet returned an invalid account.'); return value.toLowerCase(); }
function accounts(value) {
  if (!Array.isArray(value) || !value.length || value.length > 32) throw fail('The wallet did not expose a supported account.');
  const result = value.map(address); if (new Set(result).size !== result.length) throw fail('The wallet returned duplicate accounts.'); return result;
}
function chain(value) { if (typeof value !== 'string' || !/^0x(?:0|[1-9a-f][0-9a-f]{0,63})$/i.test(value) || BigInt(value) > MAX_UINT) throw fail('The wallet returned an invalid network.'); return BigInt(value).toString(); }
const same = (a, b) => a.length === b.length && a.every(value => b.includes(value));
function providerOK(value) { try { return value && typeof value.request === 'function' && typeof value.on === 'function' && typeof value.removeListener === 'function'; } catch { return false; } }
function sanitized(error) { let code; try { code = error?.code; } catch {} return code === 4001 ? fail('The wallet request was declined. No DVC transfer was submitted.', 4001) : fail('The wallet could not complete this native DVC request. No alternate signing method was attempted.', 'DVC_WALLET_REQUEST'); }

export function createDvcWallet({ eventTarget = globalThis.window, getLegacyProvider = () => globalThis.window?.ethereum, onChange = () => {}, rpcTimeoutMs = 7500, signatureTimeoutMs = 120000 } = {}) {
  if (![rpcTimeoutMs, signatureTimeoutMs].every(value => Number.isSafeInteger(value) && value > 0 && value <= 120000)) throw fail('Invalid wallet deadline.');
  const network = genesis(), providers = new Map(), snapshots = new WeakMap(), consumed = new WeakSet();
  let active = null, generation = 0, selected = null, chainId = null, exposed = [], phase = 'disconnected', disposed = false, listening = false, promptPending = false, latest = null;
  const state = () => ({ phase, providerId: active?.id ?? null, address: selected, chainId, accounts: [...exposed], generation, promptPending,
    providers: [...providers.values()].map(row => ({ id: row.id, name: row.name })) });
  const emit = (reason, invalidated = false) => { try { onChange({ reason, invalidated, state: state() }); } catch {} };
  function clearReview(reason, invalidated = true) { generation++; latest = null; emit(reason, invalidated); }
  function disconnect(notify = true) {
    if (active) for (const [name, listener] of active.listeners) { try { active.provider.removeListener(name, listener); } catch {} }
    active = null; selected = chainId = null; exposed = []; phase = 'disconnected'; generation++; latest = null; if (notify) emit('Wallet disconnected.', true);
  }
  function announce(event) {
    try {
      const { info, provider } = event.detail || {};
      if (!info || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(info.uuid) || !providerOK(provider)) return;
      const id = 'eip6963:' + info.uuid.toLowerCase(); if (!providers.has(id) && providers.size >= 16) return;
      if (active?.id === id && active.provider !== provider) disconnect();
      providers.set(id, { id, name: text(info.name) || 'Announced wallet', provider }); emit('Wallets found.');
    } catch {}
  }
  function discover({ includeLegacy = false } = {}) {
    if (disposed) return [];
    if (!listening) { eventTarget?.addEventListener('eip6963:announceProvider', announce); listening = true; }
    if (includeLegacy) {
      let provider; try { provider = getLegacyProvider(); } catch {}
      if (providerOK(provider)) {
        if (active?.id === 'legacy' && active.provider !== provider) disconnect();
        providers.set('legacy', { id: 'legacy', name: 'Other injected wallet (legacy)', provider });
      } else { providers.delete('legacy'); if (active?.id === 'legacy') disconnect(); }
    }
    eventTarget?.dispatchEvent(new Event('eip6963:requestProvider')); emit('Wallets found.'); return state().providers;
  }
  function token() { if (disposed || !active) throw fail('Choose and connect a wallet first.'); return { generation, provider: active.provider, request: active.request, id: active.id }; }
  function current(value, signal, guard) {
    if (signal?.aborted) throw fail('Native DVC wallet work canceled. A wallet prompt may still be open.', 'DVC_WALLET_CANCELED');
    if (guard) { const result = guard(); if (result === false || result?.then) throw fail('The DVC review changed. Review again.', 'DVC_WALLET_STALE'); }
    let live, legacy;
    try { live = active?.provider.request; if (value.id === 'legacy') legacy = getLegacyProvider(); } catch { throw fail('The wallet provider is unavailable.', 'DVC_WALLET_STALE'); }
    if (disposed || !active || value.generation !== generation || value.provider !== active.provider || value.request !== live || providers.get(value.id)?.provider !== value.provider) throw fail('Wallet selection changed. Review again.', 'DVC_WALLET_STALE');
    if (value.id === 'legacy' && legacy !== value.provider) throw fail('The wallet provider changed. Connect again.', 'DVC_WALLET_STALE');
  }
  async function rpc(value, method, params, { signal, guard, prompt = false } = {}) {
    current(value, signal, guard); if (!METHODS.has(method)) throw fail('This wallet operation is not permitted.');
    if (prompt && promptPending) throw fail('Finish or cancel the open wallet prompt before trying again.', 'DVC_WALLET_PENDING');
    if (prompt) promptPending = true;
    const pending = Promise.resolve().then(() => { current(value, signal, guard); return value.request.call(value.provider, { method, params }); });
    if (prompt) pending.then(() => { promptPending = false; emit('Wallet prompt closed.'); }, () => { promptPending = false; emit('Wallet prompt closed.'); });
    const result = await new Promise((resolve, reject) => {
      let done = false;
      const finish = (callback, value) => { if (done) return; done = true; clearTimeout(timer); signal?.removeEventListener('abort', abort); callback(value); };
      const abort = () => finish(reject, fail('Native DVC wallet work canceled. A wallet prompt may still be open.', 'DVC_WALLET_CANCELED'));
      const timer = setTimeout(() => finish(reject, fail('The wallet request timed out. Its prompt may still be open.', 'DVC_WALLET_TIMEOUT')), prompt ? signatureTimeoutMs : rpcTimeoutMs);
      signal?.addEventListener('abort', abort, { once: true });
      pending.then(value => finish(resolve, value), error => finish(reject, localErrors.has(error) ? error : sanitized(error)));
      if (signal?.aborted) abort();
    });
    current(value, signal, guard); return result;
  }
  function bind(row) {
    active = { ...row, request: row.provider.request, listeners: [] };
    const on = (name, listener) => { active.listeners.push([name, listener]); row.provider.on(name, listener); };
    on('accountsChanged', value => {
      if (active?.provider !== row.provider) return;
      try { exposed = accounts(value); } catch { exposed = []; }
      if (phase === 'connecting') return;
      selected = null; phase = exposed.length ? 'choose-account' : 'disconnected'; clearReview('Wallet accounts changed. Choose an account again.');
    });
    on('chainChanged', value => { if (active?.provider !== row.provider) return; try { chainId = chain(value); } catch { chainId = null; } if (phase !== 'connecting') clearReview('Wallet network changed. Review again.'); });
    on('disconnect', () => { if (active?.provider === row.provider) disconnect(); });
  }
  async function connect(id, { signal } = {}) {
    if (disposed || promptPending) throw fail('Finish any open wallet prompt before connecting.', 'DVC_WALLET_PENDING');
    const row = providers.get(id); if (!row || !providerOK(row.provider)) throw fail('Choose a discovered wallet.');
    disconnect(false); phase = 'connecting';
    try { bind(row); } catch { disconnect(false); const error = fail('The wallet provider could not initialize.'); emit(error.message, true); throw error; }
    const value = token(); emit('Connecting wallet.');
    try {
      const approved = accounts(await rpc(value, 'eth_requestAccounts', [], { signal, prompt: true }));
      const network = chain(await rpc(value, 'eth_chainId', [], { signal }));
      const fresh = accounts(await rpc(value, 'eth_accounts', [], { signal }));
      if (!same(approved, fresh)) throw fail('Wallet accounts changed during connection.');
      exposed = fresh; chainId = network; selected = fresh.length === 1 ? fresh[0] : null; phase = selected ? 'connected' : 'choose-account'; emit('Wallet connected.'); return state();
    } catch (error) { if (active?.provider === row.provider && generation === value.generation) { disconnect(false); emit(error.message, true); } throw error; }
  }
  function select(value) { const next = address(value); if (!active || !exposed.includes(next)) throw fail('Choose an account exposed by this wallet.'); selected = next; phase = 'connected'; clearReview('Wallet account selected.'); return state(); }
  async function recheck(value, snapshot, options) {
    const fresh = accounts(await rpc(value, 'eth_accounts', [], options));
    const network = chain(await rpc(value, 'eth_chainId', [], options));
    if (!same(fresh, exposed) || !fresh.includes(snapshot.address) || network !== snapshot.chainId) { clearReview('Wallet account or network changed.'); throw fail('Wallet account or network changed. Review again.', 'DVC_WALLET_STALE'); }
  }
  async function review({ signal, guard } = {}) {
    if (!selected || chainId === null) throw fail('Connect and choose your DVC account.');
    generation++; latest = null; const value = token(), snapshot = Object.freeze({ address: selected, chainId, generation });
    await recheck(value, snapshot, { signal, guard }); snapshots.set(snapshot, value); latest = snapshot; return snapshot;
  }
  function assertCurrent(snapshot) { const value = snapshots.get(snapshot); if (!value || latest !== snapshot || snapshot.address !== selected || snapshot.chainId !== chainId) throw fail('The transfer review is no longer current.', 'DVC_WALLET_STALE'); current(value); return snapshot; }
  async function signTransfer(draft, { snapshot, signal, guard } = {}) {
    assertCurrent(snapshot); if (consumed.has(snapshot)) throw fail('Review a fresh transfer before signing again.');
    const copy = structuredClone(draft), typed = transferTypedData(copy, { genesis: network });
    if (copy.sender !== snapshot.address) throw fail('The transfer sender differs from the selected wallet.');
    const value = snapshots.get(snapshot), options = { signal, guard }; consumed.add(snapshot);
    await recheck(value, snapshot, options); assertCurrent(snapshot);
    const signature = await rpc(value, 'eth_signTypedData_v4', [snapshot.address, JSON.stringify(typed)], { ...options, prompt: true });
    await recheck(value, snapshot, options); assertCurrent(snapshot); current(value, signal, guard);
    try { return attachTransferSignature(copy, signature, { genesis: network }); } catch { throw fail('This signature does not match the selected native DVC sender. Smart-account and delegated signatures are unsupported.'); }
  }
  function cancel() { clearReview('Native DVC wallet work canceled.'); }
  function destroy() { if (disposed) return; disconnect(); disposed = true; if (listening) eventTarget?.removeEventListener('eip6963:announceProvider', announce); providers.clear(); }
  return Object.freeze({ state, discover, connect, select, review, assertCurrent, signTransfer, cancel, disconnect, destroy });
}
