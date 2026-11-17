// SPDX-License-Identifier: GPL-3.0-only
import { parseStrictJSON } from './public/dvc-core.mjs';

export function createScryptHttpHandler({ bridge, now = Date.now }) {
  let interval = 0, requests = 0, active = 0;
  return async (req, res, url) => {
    if (!url.pathname.startsWith('/scrypt/')) return false;
    const send = (status, value) => { res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(value)); return true; };
    const paths = { '/scrypt/status': 'GET', '/scrypt/job': 'POST', '/scrypt/submit': 'POST' };
    if (!Object.hasOwn(paths, url.pathname)) return send(404, { error: 'Not found.' });
    if (req.method !== paths[url.pathname] || url.search) return send(400, { error: 'Invalid mining request.' });
    // Host/origin checks and HA ingress authentication remain in the embedding server.
    if (req.method === 'POST' && req.headers['x-keeper-request'] !== '1') return send(403, { error: 'Open the miner through this Keeper.' });
    if (now() - interval >= 60000) { interval = now(); requests = 0; }
    if (++requests > 90 || active >= 2) return send(429, { error: 'Too many mining requests; wait briefly.' });
    active++;
    try {
      if (req.method === 'GET') return send(200, await bridge.status());
      if (req.headers['content-type']?.split(';')[0].trim() !== 'application/json' || req.headers['content-encoding']) return send(415, { error: 'JSON required.' });
      const body = await new Promise((resolve, reject) => {
        const chunks = []; let size = 0;
        const finish = (fn, value) => { clearTimeout(timer); req.off('data', onData); req.off('end', onEnd); req.off('error', onError); req.off('aborted', onError); fn(value); };
        const onError = () => finish(reject, Error('Invalid request body'));
        const onData = chunk => { size += chunk.length; if (size > 2048) { req.pause(); onError(); } else chunks.push(chunk); };
        const onEnd = () => finish(resolve, Buffer.concat(chunks).toString('utf8'));
        const timer = setTimeout(() => { req.pause(); onError(); }, 5000); timer.unref?.();
        req.on('data', onData); req.once('end', onEnd); req.once('error', onError); req.once('aborted', onError);
      });
      let value;
      try { value = parseStrictJSON(body, { maxBytes: 2048 }); } catch { return send(400, { error: 'Invalid JSON.' }); }
      const expected = url.pathname === '/scrypt/job' ? 'address' : 'id,nonce';
      if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).sort().join(',') !== expected) return send(400, { error: 'Invalid mining fields.' });
      return send(200, url.pathname === '/scrypt/job' ? await bridge.job(value.address) : await bridge.submit(value.id, value.nonce));
    } catch (error) {
      const known = error.code === 'DVC_SCRYPT' || error.code === 'DVC_SCRYPT_INVALID';
      return send(known ? error.status || 400 : 503, { error: known ? error.message : 'The mining connection is unavailable.' });
    } finally { active--; }
  };
}
