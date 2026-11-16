// SPDX-License-Identifier: GPL-3.0-only
// Public native-DVC protocol surface. Host/ingress authentication remains with
// the embedding server; this handler never accepts peer or node configuration.
import { parseStrictJSON } from './public/dvc-core.mjs';

const MAX_BODY = 512 * 1024, MAX_SEGMENT = 8, MAX_MEMPOOL_REPLY = 256;
const POST_PATHS = new Set(['/dvc/job', '/dvc/block', '/dvc/transfer', '/dvc/locate', '/dvc/segment']);
const DECIMAL = /^(0|[1-9][0-9]{0,15})$/;
const KNOWN_ERRORS = Object.freeze({
  DVC_INVALID: [400, 'Invalid DVC protocol request.'],
  DVC_BLOCK_INVALID: [400, 'The DVC block did not pass validation.'],
  DVC_TRANSFER_INVALID: [400, 'The DVC transfer did not pass validation.'],
  DVC_BODY_TOO_LARGE: [400, 'The DVC request exceeds the body limit.'],
  DVC_BODY_TIMEOUT: [400, 'The DVC request body timed out.'],
  DVC_ORIGIN: [403, 'Same-origin access is required.'],
  DVC_CONFLICT: [409, 'The DVC chain or pending account state changed. Refresh and retry.'],
  DVC_NONCE: [409, 'The transfer nonce does not follow the current pending account sequence.'],
  DVC_BALANCE: [409, 'The transfer exceeds the available confirmed balance after pending spends.'],
  DVC_ANCESTOR: [409, 'The segment ancestor is unavailable. Find a common ancestor first.'],
  DVC_RATE_LIMIT: [429, 'Too many DVC mutations. Wait before retrying.'],
  DVC_CAPACITY: [503, 'This DVC node has reached its configured capacity.'],
  DVC_STORAGE: [503, 'DVC storage is unavailable. No in-memory update was committed.'],
  DVC_CLOSED: [503, 'This DVC node is closing or unavailable.'],
});
const failure = code => Object.assign(new Error(code), { code });
function plain(value, keys) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).sort().join(',') !== [...keys].sort().join(',')) throw failure('DVC_INVALID');
  return value;
}
function number(value, fallback, max) {
  if (value === null || value === undefined) return fallback;
  if (typeof value !== 'string' || !DECIMAL.test(value) || BigInt(value) > BigInt(max)) throw failure('DVC_INVALID');
  return Number(value);
}
function query(url, allowed) {
  for (const key of url.searchParams.keys()) if (!allowed.includes(key) || url.searchParams.getAll(key).length !== 1) throw failure('DVC_INVALID');
}
function sameOrigin(req) {
  const site = req.headers['sec-fetch-site'];
  if (site && site !== 'same-origin' && site !== 'none') return false;
  const origin = req.headers.origin;
  if (!origin) return true; // Non-browser peers are authenticated by the host.
  try {
    const parsed = new URL(origin);
    const protocol = req.socket?.encrypted ? 'https:' : 'http:';
    return parsed.origin === origin && parsed.protocol === protocol && parsed.host === req.headers.host;
  } catch { return false; }
}
async function readBody(req, maxBytes, timeoutMs) {
  if (String(req.headers['content-type'] || '').split(';', 1)[0].trim().toLowerCase() !== 'application/json') throw failure('DVC_INVALID');
  if (req.headers['content-encoding'] && req.headers['content-encoding'] !== 'identity') throw failure('DVC_INVALID');
  const length = req.headers['content-length'];
  if (length !== undefined && (!DECIMAL.test(length) || BigInt(length) > BigInt(maxBytes))) throw failure('DVC_BODY_TOO_LARGE');
  const bytes = await new Promise((resolve, reject) => {
    let size = 0, settled = false;
    const chunks = [];
    const cleanup = () => { clearTimeout(timer); req.off('data', data); req.off('end', end); req.off('aborted', aborted); req.off('error', aborted); };
    const finish = (fn, value) => { if (settled) return; settled = true; cleanup(); fn(value); };
    const data = chunk => {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      size += buffer.length;
      if (size > maxBytes) { req.pause(); finish(reject, failure('DVC_BODY_TOO_LARGE')); return; }
      chunks.push(buffer);
    };
    const end = () => finish(resolve, Buffer.concat(chunks, size));
    const aborted = () => finish(reject, failure('DVC_INVALID'));
    const timer = setTimeout(() => { req.pause(); finish(reject, failure('DVC_BODY_TIMEOUT')); }, timeoutMs);
    timer.unref?.();
    req.on('data', data); req.once('end', end); req.once('aborted', aborted); req.once('error', aborted);
    if (req.aborted || req.destroyed) aborted();
  });
  try { return parseStrictJSON(new TextDecoder('utf-8', { fatal: true }).decode(bytes), { maxBytes }); }
  catch { throw failure('DVC_INVALID'); }
}

export function createDvcHttpHandler({
  node, now = Date.now, maxBodyBytes = MAX_BODY, bodyTimeoutMs = 15000,
  mutationLimit = 120, mutationWindowMs = 60000, maxRateClients = 1024,
  authorize = null, originAllowed = sameOrigin,
} = {}) {
  if (!node || typeof node.status !== 'function') throw Error('A DVC node is required.');
  for (const [value, min, max] of [[maxBodyBytes, 1, MAX_BODY], [bodyTimeoutMs, 1, 60000], [mutationLimit, 1, 10000], [mutationWindowMs, 1, 3600000], [maxRateClients, 1, 10000]]) {
    if (!Number.isSafeInteger(value) || value < min || value > max) throw Error('Invalid DVC HTTP limit.');
  }
  const rates = new Map();
  function rate(req) {
    const time = now();
    if (!Number.isSafeInteger(time) || time < 0) throw failure('DVC_CLOSED');
    for (const [key, value] of rates) if (value.until <= time) rates.delete(key);
    const key = req.socket?.remoteAddress || 'local'; // Never trust forwarded client headers.
    let row = rates.get(key);
    if (!row) {
      if (rates.size >= maxRateClients) throw failure('DVC_RATE_LIMIT');
      row = { count: 0, until: time + mutationWindowMs }; rates.set(key, row);
    }
    if (++row.count > mutationLimit) throw failure('DVC_RATE_LIMIT');
  }
  return async function handleDvc(req, res, suppliedUrl) {
    let url;
    try { url = suppliedUrl || new URL(req.url, 'http://dvc.invalid'); }
    catch { return false; }
    if (url.pathname !== '/dvc' && !url.pathname.startsWith('/dvc/')) return false;
    const send = (status, payload, close = false) => {
      if (res.destroyed || res.writableEnded) return;
      const headers = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };
      if (close) headers.Connection = 'close';
      if (status === 429) headers['Retry-After'] = String(Math.ceil(mutationWindowMs / 1000));
      res.writeHead(status, headers);
      res.end(JSON.stringify(payload), () => { if (close && !req.complete) req.destroy(); });
    };
    try {
      if (String(req.url || '').length > 2048 || !originAllowed(req) || authorize && !await authorize(req)) throw failure('DVC_ORIGIN');
      if (req.method === 'GET') {
        if (url.pathname === '/dvc/status') { query(url, []); send(200, await node.status()); }
        else if (url.pathname === '/dvc/locators') { query(url, []); send(200, await node.locators()); }
        else if (url.pathname.startsWith('/dvc/account/')) {
          query(url, []); const address = url.pathname.slice('/dvc/account/'.length);
          if (!/^0x[0-9a-f]{40}$/.test(address)) throw failure('DVC_INVALID');
          send(200, await node.account(address));
        } else if (url.pathname === '/dvc/chain') {
          query(url, ['from', 'limit']);
          const from = number(url.searchParams.get('from'), 1, Number.MAX_SAFE_INTEGER);
          const limit = number(url.searchParams.get('limit'), MAX_SEGMENT, MAX_SEGMENT);
          if (from < 1 || limit < 1) throw failure('DVC_INVALID');
          send(200, await node.getSegment({ from: String(from), limit }));
        } else if (url.pathname === '/dvc/mempool') {
          query(url, ['limit']); const limit = number(url.searchParams.get('limit'), 64, MAX_MEMPOOL_REPLY);
          if (limit < 1) throw failure('DVC_INVALID'); send(200, await node.getMempool({ limit }));
        } else send(404, { code: 'DVC_NOT_FOUND', error: 'DVC route not found.' });
      } else if (req.method === 'POST' && POST_PATHS.has(url.pathname)) {
        query(url, []); rate(req);
        const body = await readBody(req, maxBodyBytes, bodyTimeoutMs);
        let result;
        if (url.pathname === '/dvc/job') { plain(body, ['miner', 'algorithm']); result = await node.createJob(body); }
        else if (url.pathname === '/dvc/block') result = await node.submitBlock(body);
        else if (url.pathname === '/dvc/transfer') result = await node.submitTransfer(body);
        else if (url.pathname === '/dvc/locate') { plain(body, ['locators']); result = await node.locate(body); }
        else { plain(body, ['ancestorHash', 'blocks']); result = await node.ingestSegment(body); }
        send(200, result);
      } else send(405, { code: 'DVC_METHOD', error: 'DVC method not supported.' });
    } catch (error) {
      let code;
      try { const value = error?.code; if (typeof value === 'string' && Object.hasOwn(KNOWN_ERRORS, value)) code = value; } catch {}
      const known = code ? KNOWN_ERRORS[code] : null;
      const [status, message] = known || [503, 'The DVC node could not complete this request.'];
      send(status, { code: code || 'DVC_UNAVAILABLE', error: message }, req.method === 'POST' && !req.complete);
    }
    return true;
  };
}
