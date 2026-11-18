// Installed behind Keeper's existing loopback or authenticated ingress boundary.
const fail = (message, status = 400) => Object.assign(new Error(message), { status });
const MAX_BODY = 8192;
function sameOrigin(req) {
  if (req.headers['sec-fetch-site'] && !['same-origin', 'none'].includes(req.headers['sec-fetch-site'])) return false;
  if (!req.headers.origin) return true;
  try { const origin = new URL(req.headers.origin); return origin.origin === req.headers.origin && origin.host === req.headers.host && origin.protocol === (req.socket?.encrypted ? 'https:' : 'http:'); }
  catch { return false; }
}
async function readBody(req, timeoutMs) {
  if (String(req.headers['content-type'] || '').split(';')[0].trim().toLowerCase() !== 'application/json' || req.headers['content-encoding'] && req.headers['content-encoding'] !== 'identity') throw fail('Use an uncompressed JSON request.', 415);
  if (req.headers['content-length'] !== undefined && (!/^\d+$/.test(req.headers['content-length']) || Number(req.headers['content-length']) > MAX_BODY)) throw fail('The room request is too large.', 413);
  const bytes = await new Promise((resolve, reject) => {
    let size = 0, done = false; const chunks = [];
    const cleanup = () => { clearTimeout(timer); req.off('data', data); req.off('end', end); req.off('aborted', aborted); req.off('error', aborted); };
    const finish = (fn, value) => { if (done) return; done = true; cleanup(); fn(value); };
    const data = chunk => { size += chunk.length; if (size > MAX_BODY) { req.pause(); finish(reject, fail('The room request is too large.', 413)); } else chunks.push(chunk); };
    const end = () => finish(resolve, Buffer.concat(chunks));
    const aborted = () => finish(reject, fail('The room request was interrupted.'));
    const timer = setTimeout(() => { req.pause(); finish(reject, fail('The room request timed out.', 408)); }, timeoutMs); timer.unref?.();
    req.on('data', data); req.once('end', end); req.once('aborted', aborted); req.once('error', aborted);
    if (req.aborted || req.destroyed) aborted();
  });
  try { return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); }
  catch { throw fail('The room request is not valid JSON.'); }
}
export function createDotlandsHttpHandler({ store, now = Date.now, bodyTimeoutMs = 5000 } = {}) {
  if (!store?.info || !store?.dispatch) throw Error('A saved Dotlands store is required.');
  let windowAt = now(), requests = 0;
  return async (req, res, url) => {
    if (!url.pathname.startsWith('/api/dotlands/')) return false;
    let proof;
    const send = (status, payload) => {
      if (res.destroyed || res.writableEnded) return;
      const close = status >= 400 && !req.complete;
      res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...(close ? { Connection: 'close' } : {}) });
      res.end(JSON.stringify(payload), () => { if (close) req.destroy(); });
    };
    try {
      if (!sameOrigin(req)) throw fail('Open saved Dotlands rooms from this Keeper.', 403);
      if (url.search || req.url.length > 256) throw fail('Unexpected saved-room query.');
      const time = now();
      if (time - windowAt >= 60000 || time < windowAt) { windowAt = time; requests = 0; }
      if (++requests > 2400) throw fail('The saved-room service is busy. Try again shortly.', 429);
      if (req.method === 'GET' && url.pathname === '/api/dotlands/info') send(200, await store.info());
      else if (req.method === 'POST' && url.pathname === '/api/dotlands/request') {
        if (req.headers['x-keeper-request'] !== '1') throw fail('A Keeper request header is required.', 403);
        proof = await readBody(req, bodyTimeoutMs);
        send(200, await store.dispatch(proof));
      } else send(404, { error: 'Saved-room route not found.' });
    } catch (e) {
      const status = Number.isInteger(e.status) ? e.status : 503;
      const signed = proof && await store.errorResponse?.(proof, e).catch(() => null);
      send(status, signed || { error: e.status ? e.message : 'The saved-room service is unavailable. Your saved games have not been replaced.' });
    }
    return true;
  };
}
