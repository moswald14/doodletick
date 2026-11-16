// SPDX-License-Identifier: GPL-3.0-only
// Signing-only injected-provider adapter. No transactions, approvals, arbitrary
// typed data, network switching, account deployment, or generic RPC surface.
import { recipientTypedData, recipientContext, attachRecipientSignature, normalizeRecipientAddress, encodeRecipient1271Call } from './doodleverse-recipient.mjs';

const HASH = /^0x[0-9a-f]{64}$/, DECIMAL = /^(0|[1-9][0-9]{0,77})$/;
const WRAPPER = '6492'.repeat(16);
const MAX_UINT = (1n << 256n) - 1n, MAX_SIGNATURE_BYTES = 8192, MAX_CODE_BYTES = 65536;
const METHODS = new Set(['eth_requestAccounts', 'eth_accounts', 'eth_chainId', 'eth_getBlockByNumber', 'eth_getCode', 'eth_call', 'eth_signTypedData_v4']);
const sameAccounts = (a, b) => a.length === b.length && a.every(value => b.includes(value));
const fail = (message, code = 'WALLET_INVALID') => Object.assign(new Error(message), { code });
function uint(value, label, positive = false) {
  if (typeof value !== 'string' || !DECIMAL.test(value) || BigInt(value) > MAX_UINT || positive && value === '0') throw fail('Invalid ' + label + '.');
  return value;
}
function quantity(value, label, positive = false) {
  if (typeof value !== 'string' || !/^0x(?:0|[1-9a-f][0-9a-f]*)$/i.test(value) || value.length > 66) throw fail('Invalid wallet ' + label + '.');
  return uint(BigInt(value).toString(), label, positive);
}
function accounts(value) {
  if (!Array.isArray(value) || !value.length || value.length > 32) throw fail('The wallet did not expose a supported account list.');
  const result = value.map(normalizeRecipientAddress);
  if (new Set(result).size !== result.length) throw fail('The wallet returned duplicate accounts.');
  return result;
}
function block(value) {
  if (!value || typeof value !== 'object') throw fail('The verification block is unavailable.');
  const number = quantity(value.number, 'block number');
  if (typeof value.hash !== 'string' || !HASH.test(value.hash.toLowerCase())) throw fail('Invalid verification block hash.');
  return Object.freeze({ number, hash: value.hash.toLowerCase() });
}
function requestedBlock(value) {
  if (!value || typeof value !== 'object' || Object.keys(value).sort().join(',') !== 'hash,number' || !HASH.test(value.hash)) throw fail('Invalid requested verification block.');
  return Object.freeze({ number: uint(value.number, 'verification block'), hash: value.hash });
}
function accountCode(value) {
  if (typeof value !== 'string' || !/^0x(?:[0-9a-f]{2})*$/i.test(value) || value.length > 2 + MAX_CODE_BYTES * 2) throw fail('Account code was unavailable or too large.');
  if (value.toLowerCase().startsWith('0xef0100')) throw fail('EIP-7702 delegated accounts are not supported by this verifier.', 'WALLET_UNSUPPORTED');
  return value === '0x' ? 'eoa' : 'erc1271';
}
function signatureHex(value) {
  if (typeof value !== 'string' || !/^0x(?:[0-9a-f]{2})+$/i.test(value) || value.length > 2 + MAX_SIGNATURE_BYTES * 2) throw fail('The wallet returned an unsupported signature size or encoding.');
  if (value.toLowerCase().endsWith(WRAPPER)) throw fail('ERC-6492 counterfactual signatures are not supported. No account deployment was requested.', 'WALLET_UNSUPPORTED');
  return value.toLowerCase();
}
function guardNow(signal, guard) {
  if (signal?.aborted) throw fail('Wallet attempt canceled. A wallet prompt may still be open.', 'WALLET_CANCELED');
  if (guard) {
    const result = guard();
    if (result?.then) throw fail('The wallet state guard must be synchronous.');
    if (result === false) throw fail('The source proof or creator changed. Review again.', 'WALLET_STALE');
  }
}
function metadata(value, max = 80) { return typeof value === 'string' ? value.replace(/[\u0000-\u001f\u007f-\u009f]/g, '').slice(0, max) : ''; }
function supportedProvider(value) { try { return value && typeof value.request === 'function' && typeof value.on === 'function' && typeof value.removeListener === 'function'; } catch { return false; } }
function walletError(error) {
  if (error?.code === 4001) return fail('The wallet request was declined. Nothing was signed or submitted by this app.', 4001);
  if ([4200, -32601, -32602].includes(error?.code)) return fail('This wallet does not support the required signing or exact-block verification method. No fallback was attempted.', 'WALLET_UNSUPPORTED');
  return fail('The wallet could not complete the requested operation. No fallback was attempted.', 'WALLET_REQUEST_FAILED');
}

export function createDoodleverseWallet({
  eventTarget = globalThis.window, getLegacyProvider = () => globalThis.window?.ethereum,
  onChange = () => {}, rpcTimeoutMs = 7500, signatureTimeoutMs = 120000, now = Date.now
} = {}) {
  if (![rpcTimeoutMs, signatureTimeoutMs].every(value => Number.isSafeInteger(value) && value > 0 && value <= 120000)) throw fail('Invalid wallet request deadline.');
  const providers = new Map(), snapshots = new WeakMap(), consumed = new WeakSet();
  let active = null, generation = 0, selected = null, chainId = null, exposed = [], phase = 'disconnected', error = null;
  let discovering = false, disposed = false, promptPending = false, signing = false, latestSnapshot = null;
  const list = () => [...providers.values()].map(row => Object.freeze({ id: row.id, name: row.name, rdns: row.rdns, kind: row.kind }));
  const state = () => Object.freeze({ phase, providerId: active?.id || null, accounts: Object.freeze([...exposed]), address: selected, chainId, generation, error, providers: Object.freeze(list()) });
  const emit = (reason, invalidated = false) => { try { onChange({ reason, invalidated, state: state() }); } catch { /* A rendering error cannot authorize a wallet operation. */ } };
  function detach() {
    if (active) for (const [name, handler] of active.listeners) { try { active.provider.removeListener(name, handler); } catch {} }
  }
  function invalidate(reason, invalidated, clear = false) {
    generation++; latestSnapshot = null; error = reason;
    if (clear) { detach(); active = null; selected = null; chainId = null; exposed = []; phase = 'disconnected'; }
    emit(reason, invalidated);
  }
  function announce(event) {
    try {
      const { info, provider } = event.detail || {};
      if (!info || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(info.uuid) || !supportedProvider(provider)) return;
      const id = 'eip6963:' + info.uuid.toLowerCase();
      if (!providers.has(id) && providers.size >= 16) return;
      const old = providers.get(id);
      providers.set(id, { id, provider, name: metadata(info.name) || 'Announced wallet', rdns: metadata(info.rdns, 160), kind: 'eip6963' });
      if (old && old.provider !== provider && active?.id === id) invalidate('The selected injected provider was replaced. Connect again.', true, true);
      else emit('providers-discovered');
    } catch { /* Ignore malformed/untrusted announcements, including icons. */ }
  }
  function discover({ includeLegacy = false } = {}) {
    if (disposed) return [];
    if (!discovering && eventTarget?.addEventListener) { eventTarget.addEventListener('eip6963:announceProvider', announce); discovering = true; }
    if (includeLegacy) {
      let provider; try { provider = getLegacyProvider(); } catch {}
      if (supportedProvider(provider)) {
        const old = providers.get('legacy');
        providers.set('legacy', { id: 'legacy', provider, name: 'Other injected wallet (legacy)', rdns: '', kind: 'legacy' });
        if (old && old.provider !== provider && active?.id === 'legacy') invalidate('The legacy injected provider was replaced. Connect again.', true, true);
      } else if (providers.delete('legacy') && active?.id === 'legacy') invalidate('The legacy injected provider is unavailable.', true, true);
    }
    if (eventTarget?.dispatchEvent) eventTarget.dispatchEvent(new Event('eip6963:requestProvider'));
    return list();
  }
  function session() {
    if (!active || disposed) throw fail('Choose and connect a wallet first.');
    return { generation, provider: active.provider, request: active.request, id: active.id };
  }
  function current(token, signal, guard) {
    guardNow(signal, guard);
    if (!active || disposed || token.generation !== generation || token.provider !== active.provider) throw fail('Wallet selection changed. Review again.', 'WALLET_STALE');
    let liveRequest; try { liveRequest = active.provider.request; } catch {}
    if (token.request !== liveRequest || providers.get(token.id)?.provider !== token.provider) {
      invalidate('The selected injected provider was replaced. Connect again.', true, true);
      throw fail('Wallet provider changed. Review again.', 'WALLET_STALE');
    }
    if (token.id === 'legacy') {
      let provider; try { provider = getLegacyProvider(); } catch {}
      if (provider !== token.provider) { invalidate('The legacy injected provider was replaced. Connect again.', true, true); throw fail('Wallet provider changed. Review again.', 'WALLET_STALE'); }
    }
  }
  async function rpc(token, method, params, { signal, guard, prompt = false } = {}) {
    current(token, signal, guard);
    if (!METHODS.has(method)) throw fail('Wallet method is not permitted.');
    if (prompt && promptPending) throw fail('A wallet prompt is still open. Finish or cancel it in the wallet before trying again.', 'WALLET_PENDING');
    if (prompt) promptPending = true;
    const underlying = Promise.resolve().then(() => { current(token, signal, guard); return token.request.call(token.provider, { method, params }); });
    if (prompt) underlying.then(() => { promptPending = false; }, () => { promptPending = false; });
    const result = await new Promise((resolve, reject) => {
      let settled = false;
      const done = (fn, value) => { if (settled) return; settled = true; clearTimeout(timer); signal?.removeEventListener('abort', aborted); fn(value); };
      const aborted = () => done(reject, fail('Wallet attempt canceled. A wallet prompt may still be open.', 'WALLET_CANCELED'));
      const timer = setTimeout(() => done(reject, fail('The wallet request timed out. A wallet prompt may still be open.', 'WALLET_TIMEOUT')), prompt ? signatureTimeoutMs : rpcTimeoutMs);
      signal?.addEventListener('abort', aborted, { once: true });
      underlying.then(value => done(resolve, value), reason => done(reject, reason?.code?.startsWith?.('WALLET_') ? reason : walletError(reason)));
      if (signal?.aborted) aborted();
    });
    current(token, signal, guard); return result;
  }
  function bind(row) {
    const provider = row.provider, listeners = [];
    active = { ...row, request: provider.request, listeners };
    const on = (name, handler) => { listeners.push([name, handler]); provider.on(name, handler); };
    on('accountsChanged', value => {
      if (active?.provider !== provider) return;
      let next; try { next = accounts(value); } catch { next = []; }
      if (phase === 'connecting' && !latestSnapshot) { exposed = next; emit('connecting-accounts'); return; }
      exposed = next; selected = null; phase = next.length ? 'choose-account' : 'disconnected';
      invalidate('Wallet accounts changed. Select an account and review again.', true);
    });
    on('chainChanged', value => {
      if (active?.provider !== provider) return;
      try { chainId = quantity(value, 'chain ID', true); } catch { chainId = null; }
      if (phase === 'connecting' && !latestSnapshot) { emit('connecting-chain'); return; }
      invalidate('Wallet network changed. Review again on the selected network.', true);
    });
    on('disconnect', () => { if (active?.provider === provider) invalidate('The wallet disconnected.', true, true); });
  }
  async function connect(id, { signal } = {}) {
    if (disposed || promptPending) throw fail('Finish any open wallet prompt before connecting.', 'WALLET_PENDING');
    const row = providers.get(id);
    if (!row || !supportedProvider(row.provider)) throw fail('Select a discovered wallet explicitly.');
    detach(); generation++; latestSnapshot = null; selected = null; chainId = null; exposed = []; error = null; phase = 'connecting';
    const attemptGeneration = generation;
    try {
      bind(row); const token = session(); emit('connecting');
      const consent = accounts(await rpc(token, 'eth_requestAccounts', [], { signal, prompt: true }));
      chainId = quantity(await rpc(token, 'eth_chainId', [], { signal }), 'chain ID', true);
      const fresh = accounts(await rpc(token, 'eth_accounts', [], { signal }));
      if (!sameAccounts(consent, fresh)) throw fail('Wallet accounts changed during connection. Connect again.', 'WALLET_STALE');
      exposed = fresh; selected = fresh.length === 1 ? fresh[0] : null; phase = selected ? 'connected' : 'choose-account'; error = null; emit('connected'); return state();
    } catch (reason) { if (generation === attemptGeneration && active?.provider === row.provider) invalidate(reason.message, false, true); throw reason; }
  }
  function select(address) {
    const token = session(); current(token);
    const normalized = normalizeRecipientAddress(address);
    if (!exposed.includes(normalized)) throw fail('Select one of the accounts exposed by this wallet.');
    generation++; latestSnapshot = null; selected = normalized; phase = 'connected'; error = null; emit('account-selected'); return state();
  }
  async function recheck(token, snapshot, options) {
    current(token, options.signal, options.guard);
    const ids = accounts(await rpc(token, 'eth_accounts', [], options));
    if (!sameAccounts(ids, exposed) || !ids.includes(snapshot.address)) {
      exposed = ids; selected = null; phase = 'choose-account';
      invalidate('Wallet accounts changed. Select an account and review again.', true);
      throw fail('Wallet accounts changed. Review again.', 'WALLET_STALE');
    }
    const liveChain = quantity(await rpc(token, 'eth_chainId', [], options), 'chain ID', true);
    if (liveChain !== snapshot.chainId) {
      chainId = liveChain; invalidate('Wallet network changed. Review again.', true);
      throw fail('Wallet network changed. Review again.', 'WALLET_STALE');
    }
  }
  async function canonicalBlock(token, expected, options) {
    const found = block(await rpc(token, 'eth_getBlockByNumber', ['0x' + BigInt(expected.number).toString(16), false], options));
    if (found.number !== expected.number || found.hash !== expected.hash) throw fail('The verification block changed or is not canonical. Review again.', 'WALLET_REORG');
  }
  async function readRecipientContext({ sourceProofId, verificationBlock, signal, guard } = {}) {
    if (!HASH.test(sourceProofId || '')) throw fail('A verified source proof ID is required.');
    if (!selected || !chainId) throw fail('Select an account and network before review.');
    generation++; latestSnapshot = null; const token = session(), options = { signal, guard };
    const address = selected, expectedChain = chainId;
    await recheck(token, { address, chainId: expectedChain }, options);
    const chosenBlock = verificationBlock ? requestedBlock(verificationBlock) : block(await rpc(token, 'eth_getBlockByNumber', ['latest', false], options));
    await canonicalBlock(token, chosenBlock, options);
    const accountType = accountCode(await rpc(token, 'eth_getCode', [address, { blockHash: chosenBlock.hash, requireCanonical: true }], options));
    await canonicalBlock(token, chosenBlock, options);
    await recheck(token, { address, chainId: expectedChain }, options);
    current(token, signal, guard);
    const snapshot = Object.freeze({ providerId: token.id, generation: token.generation, address, chainId: expectedChain, verificationBlock: chosenBlock, accountType, sourceProofId });
    snapshots.set(snapshot, token); latestSnapshot = snapshot; emit('recipient-reviewed'); return snapshot;
  }
  function assertCurrent(snapshot) {
    const token = snapshots.get(snapshot);
    if (!token || latestSnapshot !== snapshot || selected !== snapshot.address || chainId !== snapshot.chainId) throw fail('Wallet review is no longer current.', 'WALLET_STALE');
    current(token); return snapshot;
  }
  function matches(context, snapshot) {
    if (context.address !== snapshot.address || context.chainId !== snapshot.chainId || context.accountType !== snapshot.accountType ||
        context.sourceProofId !== snapshot.sourceProofId || context.verificationBlock.number !== snapshot.verificationBlock.number ||
        context.verificationBlock.hash !== snapshot.verificationBlock.hash) throw fail('The proposal differs from the reviewed wallet, source proof or verification block.', 'WALLET_STALE');
  }
  function verifier({ snapshot, signal, guard } = {}) {
    assertCurrent(snapshot);
    return async request => {
      assertCurrent(snapshot); guardNow(signal, guard);
      if (!request || snapshot.accountType !== 'erc1271' || request.address !== snapshot.address || request.chainId !== snapshot.chainId ||
          request.blockNumber !== snapshot.verificationBlock.number || request.blockHash !== snapshot.verificationBlock.hash || !HASH.test(request.digest)) throw fail('Smart-account verification does not match the reviewed context.');
      const signature = signatureHex(request.signature), digest = request.digest, token = snapshots.get(snapshot);
      const verificationSignal = request.signal && signal ? AbortSignal.any([request.signal, signal]) : request.signal || signal;
      const options = { signal: verificationSignal, guard };
      await recheck(token, snapshot, options); await canonicalBlock(token, snapshot.verificationBlock, options);
      if (accountCode(await rpc(token, 'eth_getCode', [snapshot.address, { blockHash: snapshot.verificationBlock.hash, requireCanonical: true }], options)) !== 'erc1271') throw fail('The reviewed smart account has no deployed contract code.');
      const data = encodeRecipient1271Call({ digest, signature });
      const result = await rpc(token, 'eth_call', [{ to: snapshot.address, data, gas: '0x7a120' }, { blockHash: snapshot.verificationBlock.hash, requireCanonical: true }], options);
      if (typeof result !== 'string' || !/^0x1626ba7e(?:0{56})?$/i.test(result)) throw fail('The smart account did not verify this authorization.', 'WALLET_BAD_SIGNATURE');
      await canonicalBlock(token, snapshot.verificationBlock, options); await recheck(token, snapshot, options);
      assertCurrent(snapshot); guardNow(verificationSignal, guard);
      return { verified: true, method: 'erc1271', chainId: snapshot.chainId, blockNumber: snapshot.verificationBlock.number, blockHash: snapshot.verificationBlock.hash };
    };
  }
  async function signRecipient(proposal, { snapshot, signal, guard } = {}) {
    assertCurrent(snapshot); guardNow(signal, guard);
    if (signing || consumed.has(snapshot)) throw fail('Review a fresh authorization before signing again.');
    consumed.add(snapshot); signing = true;
    const token = snapshots.get(snapshot), options = { signal, guard };
    try {
      // Clone before any await: caller edits cannot swap the payload being signed.
      const frozenInput = structuredClone(proposal); matches(recipientContext(frozenInput), snapshot);
      const typedData = await recipientTypedData(frozenInput, { requireFresh: true, now: now(), signal });
      assertCurrent(snapshot); guardNow(signal, guard);
      await recheck(token, snapshot, options); await canonicalBlock(token, snapshot.verificationBlock, options);
      const beforePrompt = now();
      if (beforePrompt < frozenInput.manifest.issuedAt || beforePrompt >= frozenInput.manifest.expiresAt) throw fail('Recipient authorization expired or its clock changed. Review again.');
      const signature = signatureHex(await rpc(token, 'eth_signTypedData_v4', [snapshot.address, JSON.stringify(typedData)], { ...options, prompt: true }));
      await recheck(token, snapshot, options);
      const result = await attachRecipientSignature(frozenInput, signature, { verifyContractSignature: verifier({ snapshot, signal, guard }), now: now(), signal });
      assertCurrent(snapshot); guardNow(signal, guard);
      await canonicalBlock(token, snapshot.verificationBlock, options); await recheck(token, snapshot, options);
      assertCurrent(snapshot); guardNow(signal, guard);
      const finished = now();
      if (finished < result.manifest.issuedAt || finished >= result.manifest.expiresAt) throw fail('Recipient authorization expired or its clock changed. Review again.');
      return result;
    } finally { signing = false; }
  }
  function disconnect() { invalidate('Wallet connection cleared locally. Any wallet prompt must be closed in the wallet.', false, true); }
  function dispose() { disconnect(); disposed = true; if (discovering) eventTarget?.removeEventListener('eip6963:announceProvider', announce); providers.clear(); }
  return Object.freeze({ discover, state, connect, select, selectAccount: select, readRecipientContext, assertCurrent, signRecipient, authorize: signRecipient, verifier, disconnect, cancel: disconnect, dispose, destroy: dispose });
}
