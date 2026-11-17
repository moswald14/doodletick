// SPDX-License-Identifier: GPL-3.0-only
const failure = (message, status = 400, code = 'SHELF_INVALID') => Object.assign(new Error(message), { status, code });
const MAX_BODY = 2048;
function sameOrigin(req) {
  if (req.headers['sec-fetch-site'] && !['same-origin', 'none'].includes(req.headers['sec-fetch-site'])) return false;
  if (!req.headers.origin) return true;
  try { const origin = new URL(req.headers.origin); return origin.origin === req.headers.origin && origin.host === req.headers.host && origin.protocol === (req.socket?.encrypted ? 'https:' : 'http:'); }
  catch { return false; }
}
async function readBody(req, timeoutMs) {
  if (String(req.headers['content-type'] || '').split(';')[0].trim().toLowerCase() !== 'application/json' || req.headers['content-encoding'] && req.headers['content-encoding'] !== 'identity') throw failure('Use an uncompressed JSON request.', 415);
  if (req.headers['content-length'] !== undefined && (!/^\d+$/.test(req.headers['content-length']) || Number(req.headers['content-length']) > MAX_BODY)) throw failure('The Shelf Defense request is too large.', 413);
  const bytes = await new Promise((resolve, reject) => {
    let size = 0, done = false; const chunks = [];
    const cleanup = () => { clearTimeout(timer); req.off('data', data); req.off('end', end); req.off('aborted', aborted); req.off('error', aborted); };
    const finish = (fn, value) => { if (done) return; done = true; cleanup(); fn(value); };
    const data = chunk => { size += chunk.length; if (size > MAX_BODY) { req.pause(); finish(reject, failure('The Shelf Defense request is too large.', 413)); } else chunks.push(chunk); };
    const end = () => finish(resolve, Buffer.concat(chunks));
    const aborted = () => finish(reject, failure('The Shelf Defense request was interrupted.'));
    const timer = setTimeout(() => { req.pause(); finish(reject, failure('The Shelf Defense request timed out.', 408)); }, timeoutMs); timer.unref?.();
    req.on('data', data); req.once('end', end); req.once('aborted', aborted); req.once('error', aborted);
    if (req.aborted || req.destroyed) aborted();
  });
  try { return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); }
  catch { throw failure('The Shelf Defense request is not valid JSON.'); }
}

/** Installed behind the existing local-host / authenticated ingress boundary. */
export function createShelfIdleHttpHandler({ store, now = Date.now, bodyTimeoutMs = 5000 } = {}) {
  if (!store?.status || !store?.action) throw Error('A Shelf Defense store is required.');
  let rateWindow = 0, mutations = 0;
  return async (req, res, url) => {
    if (!url.pathname.startsWith('/api/shelf-idle/')) return false;
    const send = (status, payload) => {
      if (res.destroyed || res.writableEnded) return;
      const close = status >= 400 && !req.complete;
      res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...(close ? { Connection: 'close' } : {}) });
      res.end(JSON.stringify(payload), () => { if (close) req.destroy(); });
    };
    try {
      if (!sameOrigin(req)) throw failure('Open Shelf Defense from this Keeper.', 403, 'SHELF_ORIGIN');
      if (url.search || req.url.length > 256) throw failure('Unexpected Shelf Defense query.');
      if (req.method === 'GET' && url.pathname === '/api/shelf-idle/status') send(200, await store.status());
      else if (req.method === 'POST' && url.pathname === '/api/shelf-idle/action') {
        if (req.headers['x-keeper-request'] !== '1') throw failure('A Keeper request header is required.', 403, 'SHELF_ORIGIN');
        const time = now();
        if (time - rateWindow >= 60000 || time < rateWindow) { rateWindow = time; mutations = 0; }
        if (++mutations > 600) throw failure('The shared shelf is busy. Try again in a minute.', 429, 'SHELF_RATE');
        send(200, await store.action(await readBody(req, bodyTimeoutMs)));
      } else send(404, { error: 'Shelf Defense route not found.', code: 'SHELF_NOT_FOUND' });
    } catch (error) {
      const status = Number.isInteger(error.status) ? error.status : 503;
      send(status, { available: false, code: error.code || 'SHELF_UNAVAILABLE', error: error.status ? error.message : 'Shelf Defense is unavailable. Your saved game has not been replaced.' });
    }
    return true;
  };
}
