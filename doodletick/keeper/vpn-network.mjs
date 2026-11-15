// The browser speaks only to its own loopback Keeper. This bridge binds and
// originates peer traffic on the VPN interface; it never proxies arbitrary URLs.
import http from 'node:http';
import { networkInterfaces } from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { randomBytes, timingSafeEqual, createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { makeRendezvous } from './rendezvous.mjs';
import { validVpnDescription, vpnIP, VPN_PORT } from './public/vpn-description.mjs';
const exec = promisify(execFile), token = n => randomBytes(n).toString('base64url');
const same = (a, b) => typeof a === 'string' && typeof b === 'string' && Buffer.byteLength(a) === Buffer.byteLength(b) && timingSafeEqual(Buffer.from(a), Buffer.from(b));
const failure = (message, status = 400) => Object.assign(new Error(message), { status });
const batchHash = messages => createHash('sha256').update(JSON.stringify(messages)).digest('hex');
const send = (res, status, data) => { res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' }); res.end(JSON.stringify(data)); return true; };
async function body(req, max = 1100000) {
  if (!req.headers['content-type']?.startsWith('application/json')) throw failure('JSON required.', 415);
  const chunks = []; let size = 0;
  for await (const chunk of req) { size += chunk.length; if (size > max) throw failure('Request too large.', 413); chunks.push(chunk); }
  try { const v = JSON.parse(Buffer.concat(chunks).toString('utf8')); if (!v || typeof v !== 'object' || Array.isArray(v)) throw Error(); return v; }
  catch { throw failure('Invalid JSON object.'); }
}
export async function readTailscaleStatus() {
  const windowsPath = 'C:/Program Files/Tailscale/tailscale.exe';
  const executable = process.platform === 'win32' && existsSync(windowsPath) ? windowsPath : 'tailscale';
  try { const { stdout } = await exec(executable, ['status', '--json'], { windowsHide: true, timeout: 4000, maxBuffer: 4 * 1024 * 1024 }); return JSON.parse(stdout); }
  catch (error) { throw failure(error.code === 'ENOENT' ? 'Install Tailscale, sign in, then refresh here.' : 'Connect Tailscale to your private network, then refresh here.', 503); }
}
export function parseTailscaleStatus(raw, interfaces = networkInterfaces()) {
  const network = raw?.CurrentTailnet?.MagicDNSSuffix?.toLowerCase().replace(/\.$/, '');
  const ip = raw?.Self?.TailscaleIPs?.find(vpnIP);
  if (raw?.BackendState !== 'Running' || raw.TUN !== true || raw.Self?.Online !== true || !ip || !/^[a-z0-9][a-z0-9.-]{2,250}$/.test(network || '') || !Object.values(interfaces).flat().some(v => v?.address === ip && !v.internal)) throw failure('Connect Tailscale to your private network. A local VPN adapter is required.', 503);
  const belongs = p => p && p.DNSName?.toLowerCase().replace(/\.$/, '').endsWith('.' + network) && (!p.KeyExpiry || Date.parse(p.KeyExpiry) > Date.now());
  if (!belongs(raw.Self)) throw failure('Your VPN network identity could not be checked.', 503);
  const peers = Object.values(raw.Peer || {}).filter(p => belongs(p) && p.Online === true).flatMap(p => p.TailscaleIPs.filter(vpnIP).map(address => ({ ip: address, name: String(p.HostName || address).slice(0, 100) })));
  return { network, ip, name: String(raw.Self.HostName || ip).slice(0, 100), peers };
}
// Explicit source binding avoids using an internet proxy or another interface.
export function requestVpnPeer({ ip, source, route, method = 'GET', headers = {}, data }) {
  return new Promise((resolve, reject) => {
    const bytes = data === undefined ? null : Buffer.from(JSON.stringify(data));
    const req = http.request({ hostname: ip, port: VPN_PORT, localAddress: source, path: route, method, agent: false,
      headers: { ...headers, ...(bytes ? { 'Content-Type': 'application/json', 'Content-Length': bytes.length } : {}) } }, res => {
      const chunks = []; let size = 0;
      res.on('data', chunk => { size += chunk.length; if (size > 2000000) { res.destroy(); reject(failure('Peer response too large.')); } else chunks.push(chunk); });
      res.on('error', () => reject(failure('Peer response interrupted.', 503))); res.on('end', () => { try { resolve({ status: res.statusCode, data: JSON.parse(Buffer.concat(chunks).toString('utf8')) }); } catch { reject(failure('This computer is not running a compatible Keeper.')); } });
    });
    req.setTimeout(5000, () => req.destroy(failure('The other Keeper is unreachable. Check that it is open and your VPN allows TCP 4318.', 503)));
    req.on('error', () => reject(failure('The other Keeper is unreachable. Check that it is open and your VPN allows TCP 4318.', 503)));
    req.end(bytes);
  });
}
function frameBytes(messages) {
  if (!Array.isArray(messages) || !messages.length || messages.length > 64) throw failure('Invalid message batch.');
  let bytes = 0;
  for (const m of messages) {
    if (!m || !['text', 'binary', 'open', 'ready', 'close'].includes(m.kind)) throw failure('Invalid VPN message.');
    if (m.kind === 'text') { if (typeof m.data !== 'string' || Buffer.byteLength(m.data) > 200000) throw failure('Message too large.'); }
    else if (m.kind === 'binary') { if (typeof m.data !== 'string' || m.data.length > 21848 || !/^[A-Za-z0-9+/]*={0,2}$/.test(m.data) || Buffer.from(m.data, 'base64').length > 16384) throw failure('Invalid binary chunk.'); }
    else if (m.data !== undefined) throw failure('Invalid control message.');
    bytes += Buffer.byteLength(JSON.stringify(m));
  }
  if (bytes > 1000000) throw failure('Batch too large.'); return bytes;
}
export async function createVpnNetwork({ readStatus = readTailscaleStatus, interfaces = networkInterfaces, requestPeer = requestVpnPeer, listenAddress = ip => ip, listenPort = VPN_PORT, sourceAddress = req => req.socket.remoteAddress, refreshMs = 3000, garden } = {}) {
  let state = null, listener = null, error = 'Checking your private network…', refreshing, closed = false, rendezvous = makeRendezvous();
  const channels = new Map(), rates = new Map();
  const allowed = ip => state && (ip === state.ip || state.peers.some(p => p.ip === ip));
  const destroyChannel = ch => { channels.delete(ch.id); ch.closed = true; ch.wake?.(); };
  async function reset() { for (const ch of channels.values()) destroyChannel(ch); rendezvous = makeRendezvous(); if (listener) { const old = listener; listener = null; old.closeAllConnections(); await new Promise(r => old.close(r)); } }
  async function refresh() {
    if (refreshing) return refreshing;
    refreshing = (async () => {
      try {
        const next = parseTailscaleStatus(await readStatus(), interfaces());
        if (closed) return;
        if (state?.ip !== next.ip || state?.network !== next.network) { await reset(); state = next; }
        else state = next;
        for (const ch of channels.values()) if (ch.remote && !allowed(ch.remote.ip) || Date.now() - ch.touched > 60000) destroyChannel(ch);
        if (!listener) { const server = http.createServer(handlePeer); server.requestTimeout = 15000; server.headersTimeout = 10000; server.maxConnections = 128; await new Promise((resolve, reject) => { server.once('error', reject); server.listen(listenPort, listenAddress(state.ip), resolve); }); listener = server; }
        error = '';
      } catch (e) { state = null; error = e.code === 'EADDRINUSE' ? 'Another Keeper is using the private network port. Close that Keeper and refresh.' : e.message || 'Private VPN unavailable.'; await reset(); }
    })().finally(() => { refreshing = null; }); return refreshing;
  }
  const ready = () => { if (!state || !listener || error) throw failure(error || 'Private VPN unavailable.', 503); };
  const status = () => ({ mode: 'private-vpn', provider: 'Tailscale', ready: Boolean(state && listener && !error), message: error || 'Connected to your private network.', ...(state ? { network: state.network, ip: state.ip, name: state.name, peers: state.peers } : {}) });
  async function remote(ip, route, options = {}) {
    ready(); if (!vpnIP(ip) || !allowed(ip)) throw failure('That computer is not an online member of your private network.', 403);
    const network = state.network, result = await requestPeer({ ip, source: state.ip, route, ...options });
    if (!state || state.network !== network || !allowed(ip)) throw failure('VPN membership changed. Reconnect.', 403);
    return result;
  }
  async function deliver(ch, messages) {
    // Reuse exactly the same sequence and payload until the receiver acknowledges it.
    const data = { from: ch.id, seq: ch.outSeq + 1, messages };
    for (let attempt = 0; attempt < 3; attempt++) {
      if (ch.closed) throw failure('Connection closed.', 410);
      try {
        const result = await remote(ch.remote.ip, '/vpn-peer/' + ch.remote.channel, { method: 'POST', headers: { Authorization: 'Bearer ' + ch.remote.token }, data });
        if (result.status === 200) { ch.outSeq++; return result; }
        if (![429, 502, 503, 504].includes(result.status) || attempt === 2) return result;
      } catch (e) { if (e.status !== 503 || attempt === 2) throw e; }
      await new Promise(resolve => setTimeout(resolve, 200 * 2 ** attempt));
    }
  }
  async function handlePeer(req, res) {
    try {
      ready(); const ip = sourceAddress(req)?.replace(/^::ffff:/, '');
      if (req.headers.host !== `${state.ip}:${VPN_PORT}` || req.headers.origin || !allowed(ip)) return send(res, 403, { error: 'Private network members only.' });
      const now = Date.now(); for (const [key, rate] of rates) if (now - rate.at > 60000) rates.delete(key);
      if (!rates.has(ip)) rates.set(ip, { at: now, count: 0 }); if (++rates.get(ip).count > 4000) throw failure('Peer request limit reached.', 429);
      const url = new URL(req.url, 'http://vpn');
      if (url.pathname === '/vpn-peer/status' && req.method === 'GET') return send(res, 200, { version: '0.1b', network: state.network });
      const gardenPeer = /^\/garden-api\/(info|account|action)$/.exec(url.pathname);
      if (gardenPeer && garden) return gardenRoute(req, res, gardenPeer[1]);
      if (await rendezvous(req, res, url)) return;
      const match = /^\/vpn-peer\/([A-Za-z0-9_-]{32})$/.exec(url.pathname);
      if (!match || req.method !== 'POST') return send(res, 404, { error: 'Not found.' });
      const ch = channels.get(match[1]);
      if (!ch || !same(req.headers.authorization, 'Bearer ' + ch.secret) || !ch.remote || ch.remote.ip !== ip) throw failure('Connection is not authorized.', 403);
      const packet = await body(req), bytes = frameBytes(packet.messages);
      if (packet.from !== ch.remote.channel || !Number.isSafeInteger(packet.seq) || packet.seq < 1) throw failure('Unexpected peer sequence.', 409);
      const digest = batchHash(packet.messages);
      if (packet.seq === ch.inSeq && digest === ch.inHash) return send(res, 200, { ok: true });
      if (packet.seq !== ch.inSeq + 1) throw failure('Unexpected peer sequence.', 409);
      if (ch.bytes + bytes > 4000000 || ch.events.length + packet.messages.length > 2048) throw failure('Peer is not reading messages.', 429);
      ch.inSeq = packet.seq; ch.inHash = digest; ch.bytes += bytes;
      for (const m of packet.messages) ch.events.push({ cursor: ++ch.cursor, message: m });
      ch.wake?.(); return send(res, 200, { ok: true });
    } catch (e) { if (!res.headersSent) send(res, e.status || 503, { error: e.status ? e.message : 'Private connection unavailable.' }); }
  }
  async function gardenRoute(req, res, route) {
    try {
      if (route === 'info' && req.method === 'GET') return send(res, 200, await garden.info());
      if (route !== 'info' && req.method === 'POST') return send(res, 200, await garden.dispatch(await body(req, 60000), route === 'account'));
      return send(res, 405, { error: 'Method not supported.' });
    } catch (e) { return send(res, e.status || 503, { error: e.status ? e.message : 'The garden could not save this action. Refresh and retry.' }); }
  }
  async function handleLocal(req, res, url) {
    if (!url.pathname.startsWith('/vpn-api/')) return false;
    try {
      if (url.pathname === '/vpn-api/status' && req.method === 'GET') { await refresh(); return send(res, 200, status()); }
      const gardenLocal = /^\/vpn-api\/garden\/(self|100\.[\d.]+)\/(info|account|action)$/.exec(url.pathname);
      if (gardenLocal && garden) {
        if (gardenLocal[1] === 'self') return gardenRoute(req, res, gardenLocal[2]);
        const data = req.method === 'POST' ? await body(req, 60000) : undefined;
        const result = await remote(gardenLocal[1], '/garden-api/' + gardenLocal[2], { method: req.method, data });
        return send(res, result.status, result.data);
      }
      ready();
      const lobby = /^\/vpn-api\/lobby\/(self|100\.[\d.]+)\/(rooms(?:\/[A-Za-z0-9_-]+)*)$/.exec(url.pathname);
      if (lobby) { const data = ['POST', 'PATCH'].includes(req.method) ? await body(req, 100000) : undefined; const result = await remote(lobby[1] === 'self' ? state.ip : lobby[1], '/arcade-api/' + lobby[2], { method: req.method, headers: req.headers.authorization ? { Authorization: req.headers.authorization } : {}, data }); return send(res, result.status, result.data); }
      if (url.pathname === '/vpn-api/channels' && req.method === 'POST') {
        if (channels.size >= 32) throw failure('Too many open private connections.', 429);
        const data = await body(req, 1000); if (!['doodleverse-v1', 'doodletick-files-v1'].includes(data.label)) throw failure('Invalid channel.');
        const ch = { id: token(24), secret: token(32), local: token(32), label: data.label, remote: null, inSeq: 0, outSeq: 0, clientSeq: 0, cursor: 0, ack: 0, events: [], bytes: 0, touched: Date.now(), sending: false, polling: false };
        channels.set(ch.id, ch);
        return send(res, 201, { reliableDelivery: true, localToken: ch.local, description: { format: 'doodletick-vpn-v1', network: state.network, ip: state.ip, port: VPN_PORT, channel: ch.id, token: ch.secret, label: ch.label } });
      }
      const match = /^\/vpn-api\/channels\/([A-Za-z0-9_-]{32})(?:\/(bind|send|events))?$/.exec(url.pathname);
      if (!match) return send(res, 404, { error: 'Not found.' });
      const ch = channels.get(match[1]); if (!ch || !same(req.headers.authorization, 'Bearer ' + ch.local)) throw failure('Connection expired. Make a new invitation.', 410);
      ch.touched = Date.now();
      if (!match[2] && req.method === 'DELETE') {
        destroyChannel(ch);
        if (ch.remote) {
          // A close frame follows the last accepted batch, never overtaking it.
          Promise.resolve(ch.outTask).catch(() => {}).then(() => remote(ch.remote.ip, '/vpn-peer/' + ch.remote.channel, { method: 'POST', headers: { Authorization: 'Bearer ' + ch.remote.token }, data: { from: ch.id, seq: ch.outSeq + 1, messages: [{ kind: 'close' }] } })).catch(() => {});
        }
        return send(res, 200, { ok: true });
      }
      if (match[2] === 'bind' && req.method === 'POST') {
        const d = await body(req, 2000);
        if (!validVpnDescription(d) || d.network !== state.network || d.label !== ch.label || !allowed(d.ip) || d.channel === ch.id) throw failure('Both Keepers must be on this private VPN network.', 403);
        if (ch.remote && JSON.stringify(ch.remote) !== JSON.stringify(d)) throw failure('This invitation has already been paired.', 409);
        ch.remote = d; return send(res, 200, { ok: true });
      }
      if (match[2] === 'send' && req.method === 'POST') {
        if (!ch.remote) throw failure('Peer not paired.');
        const data = await body(req); frameBytes(data.messages);
        const digest = batchHash(data.messages), seq = data.clientSeq;
        if (seq !== undefined) {
          if (!Number.isSafeInteger(seq) || seq < 1) throw failure('Invalid client sequence.');
          if (seq === ch.clientSeq && digest === ch.clientHash) return send(res, 200, { ok: true });
          if (seq !== ch.clientSeq + 1) throw failure('Unexpected client sequence.', 409);
          if (ch.sending && seq === ch.pendingSeq && digest === ch.pendingHash) {
            const result = await ch.outTask; return send(res, result.status, result.data);
          }
        }
        if (ch.sending) throw failure('Send messages in order.', 409);
        ch.sending = true;
        ch.pendingSeq = seq; ch.pendingHash = digest;
        try {
          ch.outTask = (async () => {
            const result = await deliver(ch, data.messages);
            if (result.status === 200 && seq !== undefined) { ch.clientSeq = seq; ch.clientHash = digest; }
            return result;
          })();
          const result = await ch.outTask; return send(res, result.status, result.data);
        } finally { ch.sending = false; }
      }
      if (match[2] === 'events' && req.method === 'GET') {
        if (ch.polling) throw failure('Only one reader is allowed.', 409);
        const ack = Number(url.searchParams.get('after') || 0);
        if (!Number.isSafeInteger(ack) || ack < ch.ack || ack > ch.cursor) throw failure('Invalid event cursor.');
        ch.ack = ack; ch.events = ch.events.filter(e => e.cursor > ack); ch.bytes = ch.events.reduce((n, e) => n + Buffer.byteLength(JSON.stringify(e.message)), 0);
        ch.polling = true;
        try {
          if (!ch.events.length && !ch.closed) await new Promise(resolve => { const done = () => { clearTimeout(timer); res.off('close', done); ch.wake = null; resolve(); }; const timer = setTimeout(done, 15000); ch.wake = done; res.once('close', done); });
          if (res.destroyed) return true; if (ch.closed) throw failure('VPN connection closed.', 410);
          return send(res, 200, { events: ch.events.slice(0, 64) });
        } finally { ch.polling = false; }
      }
      return send(res, 405, { error: 'Method not supported.' });
    } catch (e) { return send(res, e.status || 503, { error: e.status ? e.message : 'Private connection unavailable.' }); }
  }
  await refresh(); const timer = setInterval(() => refresh(), refreshMs); timer.unref();
  return { handleLocal, refresh, status, address: () => listener?.address(), close: async () => { closed = true; clearInterval(timer); await refreshing; await reset(); state = null; } };
}
