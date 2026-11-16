// Transport-independent, bounded pull sync. Remote peers can supply public
// history; only the local node's full consensus validator can accept it.
import { parseStrictJSON } from './dvc-core.mjs';

const MAX_BYTES = 600000;
const decimal = value => typeof value === 'string' && /^(0|[1-9][0-9]{0,19})$/.test(value);
const hash = value => typeof value === 'string' && /^[0-9a-f]{64}$/.test(value);
const fail = message => { throw new Error(message); };
export const DVC_READ_METHODS = Object.freeze(['status', 'locators', 'locate', 'chain', 'mempool']);

export function createDvcApi({ fetchImpl = globalThis.fetch, timeoutMs = 15000 } = {}) {
  return async function request(method, params = {}, { signal } = {}) {
    let route, verb = 'GET', body;
    if (method === 'status' || method === 'locators' || method === 'mempool') route = method;
    else if (method === 'chain') {
      if (!decimal(params.from) || !Number.isInteger(params.limit) || params.limit < 1 || params.limit > 8) fail('Invalid history request.');
      route = `chain?from=${params.from}&limit=${params.limit}`;
    } else if (['locate', 'segment', 'transfer'].includes(method)) { route = method; verb = 'POST'; body = JSON.stringify(params); }
    else fail('Unsupported DVC request.');
    if (body && new TextEncoder().encode(body).length > 524288) fail('DVC request is too large.');
    const response = await fetchImpl('./dvc/' + route, {
      method: verb, cache: 'no-store', credentials: 'same-origin', redirect: 'error',
      headers: { 'X-Keeper-Request': '1', ...(body ? { 'Content-Type': 'application/json' } : {}) },
      ...(body ? { body } : {}), signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(timeoutMs)]) : AbortSignal.timeout(timeoutMs)
    });
    if (!response.headers.get('content-type')?.startsWith('application/json')) fail('Keeper did not return DVC data.');
    const reader = response.body.getReader(); const chunks = []; let length = 0;
    try {
      for (;;) { const { done, value } = await reader.read(); if (done) break; length += value.length; if (length > MAX_BYTES) fail('DVC response is too large.'); chunks.push(value); }
    } catch (error) { await reader.cancel().catch(() => {}); throw error; }
    const bytes = new Uint8Array(length); let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
    const data = parseStrictJSON(new TextDecoder('utf-8', { fatal: true }).decode(bytes), { maxBytes: MAX_BYTES });
    if (!response.ok) throw Object.assign(new Error(data.error || 'Keeper rejected DVC data.'), { status: response.status });
    return data;
  };
}

export function createDvcSync({ local, remote, networkId, genesisHash, maxPages = 4 }) {
  if (!hash(networkId) || !hash(genesisHash) || !Number.isInteger(maxPages) || maxPages < 1 || maxPages > 16) fail('Invalid sync configuration.');
  let cursor = null, transactionCursor = 0, running = false;
  const check = status => {
    if (status?.networkId !== networkId || (status.genesis?.hash || status.genesis) !== genesisHash || !decimal(status.tip?.height) || !hash(status.tip?.hash)) fail('Peer belongs to a different or invalid Doodleverse chain.');
    return status;
  };
  return {
    async round({ signal } = {}) {
      if (running) fail('DVC sync is already running.'); running = true;
      try {
        signal?.throwIfAborted();
        const own = check(await local('status', {}, { signal })), peer = check(await remote('status', {}, { signal }));
        let received = 0, imported = 0;
        if (peer.tip.hash !== own.tip.hash) {
          const known = await local('locators', {}, { signal });
          if (known.networkId !== networkId || !Array.isArray(known.locators) || known.locators.length > 64 || known.locators.some(h => !hash(h))) fail('Invalid local block locators.');
          const locators = [...new Set([...(cursor ? [cursor] : []), ...known.locators])].slice(0, 64);
          if (!locators.includes(genesisHash)) locators[locators.length - 1] = genesisHash;
          const common = await remote('locate', { locators }, { signal });
          if (!decimal(common.height) || !hash(common.hash) || !locators.includes(common.hash)) fail('Peer did not identify shared history.');
          let ancestorHash = common.hash, from = BigInt(common.height) + 1n;
          for (let page = 0; page < maxPages && from <= BigInt(peer.tip.height); page++) {
            signal?.throwIfAborted();
            const segment = await remote('chain', { from: String(from), limit: 8 }, { signal });
            signal?.throwIfAborted();
            if (segment.networkId !== networkId || segment.ancestorHash !== ancestorHash || segment.from !== String(from) || !Array.isArray(segment.blocks) || segment.blocks.length < 1 || segment.blocks.length > 8) fail('Peer returned inconsistent history.');
            const last = segment.blocks.at(-1);
            if (!hash(last.digest) || !decimal(last.height) || BigInt(last.height) !== from + BigInt(segment.blocks.length) - 1n) fail('Peer returned invalid block positions.');
            // The local endpoint validates every header, signature and proof and
            // persists an adopted branch before this call returns.
            await local('segment', { ancestorHash, blocks: segment.blocks }, { signal });
            ancestorHash = last.digest; cursor = ancestorHash; from += BigInt(segment.blocks.length); received += segment.blocks.length;
          }
        }
        const pool = await remote('mempool', {}, { signal });
        if (pool.networkId !== networkId || !Array.isArray(pool.transactions) || pool.transactions.length > 64) fail('Invalid peer transaction pool.');
        const selected = Array.from({ length: Math.min(8, pool.transactions.length) }, (_, i) => pool.transactions[(transactionCursor + i) % pool.transactions.length]);
        transactionCursor = pool.transactions.length ? (transactionCursor + selected.length) % pool.transactions.length : 0;
        for (const transaction of selected) {
          signal?.throwIfAborted();
          try { const result = await local('transfer', transaction, { signal }); if (result.accepted) imported++; }
          catch (error) { if (![400, 409].includes(error.status)) throw error; }
        }
        const status = check(await local('status', {}, { signal }));
        return { received, imported, height: status.tip.height, tipHash: status.tip.hash, peerHeight: peer.tip.height, converged: status.tip.hash === peer.tip.hash };
      } finally { running = false; }
    },
    reset() { cursor = null; transactionCursor = 0; }
  };
}

// Narrow RPC over an already authenticated, encrypted channel. Peers can read
// public DVC history only. They cannot choose URLs, write files or call HA APIs.
export function createDvcRpc({ send, local, timeoutMs = 20000, now = Date.now }) {
  let sequence = 0, closed = false, windowAt = now(), reads = 0;
  const pending = new Map();
  function finish(id, error, result) { const item = pending.get(id); if (!item) return; pending.delete(id); clearTimeout(item.timer); item.signal?.removeEventListener('abort', item.abort); error ? item.reject(error) : item.resolve(result); }
  return {
    request(method, params = {}, { signal } = {}) {
      if (closed || !DVC_READ_METHODS.includes(method) || pending.size >= 4 || signal?.aborted) return Promise.reject(new Error('DVC peer is unavailable.'));
      const id = String(++sequence);
      return new Promise((resolve, reject) => {
        const abort = () => finish(id, new Error('DVC peer request stopped.'));
        const timer = setTimeout(() => finish(id, new Error('DVC peer timed out.')), timeoutMs);
        pending.set(id, { resolve, reject, timer, signal, abort }); signal?.addEventListener('abort', abort, { once: true });
        Promise.resolve(send({ type: 'dvc-rpc-v1', kind: 'request', id, method, params })).then(sent => { if (!sent) finish(id, new Error('DVC peer disconnected.')); }, () => finish(id, new Error('DVC peer disconnected.')));
      });
    },
    async receive(packet) {
      if (closed) return;
      if (new TextEncoder().encode(JSON.stringify(packet)).length > MAX_BYTES || packet?.type !== 'dvc-rpc-v1' || !/^[1-9][0-9]{0,12}$/.test(packet.id || '')) fail('Invalid DVC peer packet.');
      if (packet.kind === 'response') { finish(packet.id, packet.error ? new Error('Peer could not serve DVC history.') : null, packet.result); return; }
      if (packet.kind !== 'request' || !DVC_READ_METHODS.includes(packet.method)) fail('Unsupported DVC peer operation.');
      if (now() - windowAt >= 60000) { windowAt = now(); reads = 0; }
      if (++reads > 120) fail('DVC peer request limit reached.');
      let response;
      try { response = { type: 'dvc-rpc-v1', kind: 'response', id: packet.id, result: await local(packet.method, packet.params) }; }
      catch { response = { type: 'dvc-rpc-v1', kind: 'response', id: packet.id, error: 'History unavailable.' }; }
      await send(response);
    },
    close() { closed = true; for (const id of pending.keys()) finish(id, new Error('DVC peer disconnected.')); }
  };
}
