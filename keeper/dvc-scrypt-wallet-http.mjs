// SPDX-License-Identifier: GPL-3.0-only
import { parseStrictJSON } from './public/dvc-core.mjs';

export function createScryptWalletHttpHandler({ wallet, now = Date.now }) {
  let interval = 0, requests = 0, active = 0;
  return async (req, res, url) => {
    if (!url.pathname.startsWith('/scrypt/wallet/')) return false;
    const send = (status, value) => {
      res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...(value.retryAfter ? { 'Retry-After': String(value.retryAfter) } : {}) });
      res.end(JSON.stringify(value)); return true;
    };
    const operation = url.pathname === '/scrypt/wallet/balance' ? 'balance' : url.pathname === '/scrypt/wallet/broadcast' ? 'broadcast' : null;
    if (!operation) return send(404, { error: 'Not found.' });
    if (req.method !== 'POST' || url.search) return send(400, { error: 'Invalid wallet request.' });
    // The embedding Keeper/HA gateway retains host, origin and ingress checks.
    if (req.headers['x-keeper-request'] !== '1') return send(403, { error: 'Open the wallet through this Keeper.' });
    if (req.headers['content-type']?.split(';')[0].trim() !== 'application/json' || req.headers['content-encoding']) return send(415, { error: 'JSON required.' });
    if (now() - interval >= 60000) { interval = now(); requests = 0; }
    if (++requests > 60 || active >= 2) return send(429, { error: 'Too many wallet requests. Retry shortly.', retryAfter: 2 });
    active++;
    try {
      const limit = operation === 'balance' ? 256 : 66000;
      const body = await new Promise((resolve, reject) => {
        const chunks = []; let size = 0, finished = false;
        const finish = (fn, value) => {
          if (finished) return; finished = true; clearTimeout(timer);
          req.off('data', onData); req.off('end', onEnd); req.off('error', onError); req.off('aborted', onError); fn(value);
        };
        const onError = () => finish(reject, Object.assign(Error('Invalid wallet request body.'), { code: 'DVC_SCRYPT_WALLET', status: 400 }));
        const onData = chunk => { size += chunk.length; if (size > limit) { req.pause(); onError(); } else chunks.push(chunk); };
        const onEnd = () => finish(resolve, Buffer.concat(chunks).toString('utf8'));
        const timer = setTimeout(() => { req.pause(); onError(); }, 5000); timer.unref?.();
        req.on('data', onData); req.once('end', onEnd); req.once('error', onError); req.once('aborted', onError);
      });
      let value;
      try { value = parseStrictJSON(body, { maxBytes: limit }); } catch { return send(400, { error: 'Invalid wallet JSON.' }); }
      const fields = operation === 'balance' ? 'address' : 'expectedTxid,rawTransaction';
      if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).sort().join(',') !== fields) return send(400, { error: 'Unexpected wallet fields. Never send passwords or private keys.' });
      return send(200, operation === 'balance' ? await wallet.balance(value.address) : await wallet.broadcast(value.rawTransaction, value.expectedTxid));
    } catch (error) {
      const known = ['DVC_SCRYPT_WALLET', 'DVC_SCRYPT', 'DVC_SCRYPT_INVALID'].includes(error.code);
      return send(known ? error.status || 400 : 503, { error: known ? error.message : 'The native wallet connection is unavailable.', ...(error.syncing === true ? { syncing: true, height: error.height, targetHeight: error.targetHeight, retryAfter: 2 } : {}) });
    } finally { active--; }
  };
}
