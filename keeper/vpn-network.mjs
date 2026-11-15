// Compatibility URL names are retained for local clients. This adapter has no
// peer listener, subprocess, remote proxy, network membership or public port.
// Its caller must enforce the loopback / authenticated ingress boundary.
import { makeRendezvous } from './rendezvous.mjs';
const failure = (message, status = 400) => Object.assign(new Error(message), { status });
const send = (res, status, data) => { res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' }); res.end(JSON.stringify(data)); return true; };
async function body(req, max = 60000) {
  if (!req.headers['content-type']?.startsWith('application/json')) throw failure('JSON required.', 415);
  const chunks = []; let size = 0;
  for await (const chunk of req) { size += chunk.length; if (size > max) throw failure('Request too large.', 413); chunks.push(chunk); }
  try { const value = JSON.parse(Buffer.concat(chunks).toString('utf8')); if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error(); return value; }
  catch { throw failure('Invalid JSON object.'); }
}
export async function createVpnNetwork({ garden } = {}) {
  let closed = false;
  const rendezvous = makeRendezvous();
  const status = () => ({
    mode: 'local-direct', provider: 'Doodleverse WebRTC', ready: !closed,
    directory: 'this-keeper', peers: [], encrypted: 'DTLS', iceServers: [],
    message: 'Pair browsers with signed invitation and answer codes, then compare spirographs. Direct reachability is required; no relay or Internet-wide discovery is configured.'
  });
  async function handleLocal(req, res, url) {
    if (!url.pathname.startsWith('/vpn-api/')) return false;
    try {
      if (closed) throw failure('Keeper is closing.', 503);
      if (url.pathname === '/vpn-api/status' && req.method === 'GET') return send(res, 200, status());
      const gardenPath = url.pathname.match(/^\/vpn-api\/garden\/([^/]+)\/(info|account|action)$/);
      if (gardenPath) {
        if (gardenPath[1] !== 'self') throw failure('Remote garden bridges are unavailable. This Keeper has its own separate garden; previous remote data has not been moved.', 410);
        if (!garden) throw failure('This Keeper has no garden.', 503);
        const action = gardenPath[2];
        if (action === 'info' && req.method === 'GET') return send(res, 200, await garden.info());
        if (['account', 'action'].includes(action) && req.method === 'POST') return send(res, 200, await garden.dispatch(await body(req), action === 'account'));
        throw failure('Method not supported.', 405);
      }
      const lobbyPath = url.pathname.match(/^\/vpn-api\/lobby\/([^/]+)(\/.*)$/);
      if (lobbyPath) {
        if (lobbyPath[1] !== 'self') throw failure('Room codes work only through this same Keeper. Use signed invitation and answer codes between separate Keepers.', 410);
        const local = new URL('/arcade-api' + lobbyPath[2] + url.search, 'http://localhost');
        return await rendezvous(req, res, local);
      }
      if (url.pathname.startsWith('/vpn-api/channels')) throw failure('Legacy VPN bridges have been removed. Create a new direct WebRTC invitation.', 410);
      return send(res, 404, { error: 'Not found.' });
    } catch (error) { return send(res, error.status || 503, { error: error.status ? error.message : 'Local Keeper operation unavailable.' }); }
  }
  return { handleLocal, refresh: async () => status(), status, address: () => null, close: async () => { closed = true; } };
}
