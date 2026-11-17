import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
const publicRoot = fileURLToPath(new URL('./public/', import.meta.url));
const security = {
  'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer',
  'Content-Security-Policy': "default-src 'self'; script-src 'self'; worker-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self' https://geocoding-api.open-meteo.com https://api.open-meteo.com https://ethereum-rpc.publicnode.com; object-src 'none'; base-uri 'self'; frame-ancestors 'self'; form-action 'self'"
};
export function createIngressServer({ keeperPort, control, ingressIP = '172.30.32.2', healthy = () => true }) {
  return http.createServer(async (req, res) => {
    const reply = (code, data, type = 'application/json') => {
      res.writeHead(code, { ...security, 'Content-Type': type }); res.end(typeof data === 'string' ? data : JSON.stringify(data));
    };
    const source = req.socket.remoteAddress?.replace(/^::ffff:/, '');
    if (req.url === '/health' && req.method === 'GET' && [ingressIP, '127.0.0.1', '::1'].includes(source)) {
      try {
        const r = await fetch(`http://127.0.0.1:${keeperPort}/api/status`, { signal: AbortSignal.timeout(2500) });
        return reply(r.ok && healthy() ? 200 : 503, { ok: r.ok && healthy() });
      } catch { return reply(503, { ok: false }); }
    }
    // Never trust a client-supplied forwarding header as proof of ingress authentication.
    if (source !== ingressIP) return reply(403, { error: 'Open this app through Home Assistant.' });
    if (!['GET', 'POST', 'PATCH', 'DELETE'].includes(req.method)) return reply(405, { error: 'Method not allowed.' });
    if (req.method !== 'GET' && req.headers['x-keeper-request'] !== '1') return reply(403, { error: 'Missing request protection.' });
    // Relative request targets only; the proxy can never select another upstream.
    if (!req.url.startsWith('/') || req.url.startsWith('//') || /[\\\r\n]/.test(req.url)) return reply(400, { error: 'Invalid path.' });
    try {
      if (req.url === '/addon-api/status' && req.method === 'GET') return reply(200, await control.status());
      if (req.url === '/addon-api/connect' && req.method === 'POST') { req.resume(); return reply(410, { error: 'VPN enrollment has been removed. Use direct signed pairing in the app.' }); }
      if (req.url.startsWith('/addon-api/')) return reply(404, { error: 'Not found.' });
      if (req.method === 'GET' && ['/ha.mjs', '/ha.css'].includes(req.url)) {
        return reply(200, await readFile(publicRoot + req.url.slice(1), 'utf8'), req.url.endsWith('.mjs') ? 'text/javascript' : 'text/css');
      }
      // Ingress must remain authenticated: no service worker or offline shell here.
      if (req.url.split('?')[0] === '/sw.mjs') return reply(404, { error: 'Offline shell is disabled for ingress.' });
      const headers = { host: `127.0.0.1:${keeperPort}` };
      for (const name of ['content-type', 'authorization']) if (req.headers[name]) headers[name] = req.headers[name];
      const upstream = http.request({ hostname: '127.0.0.1', port: keeperPort, path: req.url, method: req.method, headers }, response => {
        const pageSecurity = req.url.split('?')[0] === '/telephone.html' ? { ...security, 'Content-Security-Policy': security['Content-Security-Policy'].replace("connect-src 'self'", "connect-src 'self' https://api.gdeltproject.org") } : security;
        res.writeHead(response.statusCode, { 'Content-Type': response.headers['content-type'] || 'application/octet-stream', ...pageSecurity });
        response.pipe(res);
        response.on('error', () => res.destroy());
      });
      let bytes = 0;
      req.on('data', chunk => { bytes += chunk.length; if (bytes > 1200000) { upstream.destroy(); if (!res.headersSent) reply(413, { error: 'Request too large.' }); } });
      upstream.setTimeout(30000, () => upstream.destroy());
      upstream.on('error', () => { if (!res.headersSent) reply(502, { error: 'Keeper is restarting. Try again shortly.' }); else res.destroy(); });
      req.on('aborted', () => upstream.destroy());
      res.on('close', () => upstream.destroy());
      req.pipe(upstream);
    } catch { if (!res.headersSent) reply(503, { error: 'Keeper setup is temporarily unavailable.' }); }
  });
}
