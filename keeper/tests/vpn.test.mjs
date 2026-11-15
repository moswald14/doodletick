import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { parseTailscaleStatus } from '../vpn-network.mjs';
import { validVpnDescription, vpnIP } from '../public/vpn-description.mjs';
import { brokerBase } from '../public/arcade-room.mjs';
import { createKeeperServer } from '../server.mjs';
import { simulatedKeepers, statusFixture } from './vpn-fixture.mjs';
const iface = { vpn: [{ address: '100.64.0.1', internal: false }] };
test('VPN requires running daemon, real adapter, same-network names and current membership', () => {
  const raw = statusFixture(); assert.equal(parseTailscaleStatus(raw, iface).peers.length, 2);
  for (const change of [{ BackendState: 'Stopped' }, { TUN: false }, { Self: { ...raw.Self, Online: false } }, { CurrentTailnet: null }]) assert.throws(() => parseTailscaleStatus({ ...raw, ...change }, iface));
  assert.throws(() => parseTailscaleStatus(raw, {})); assert.throws(() => parseTailscaleStatus(raw, { loopback: [{ address: '100.64.0.1', internal: true }] }));
  raw.Peer['100.64.0.2'].DNSName = 'shared.another.ts.net.'; raw.Peer['100.64.0.3'].Online = false; assert.equal(parseTailscaleStatus(raw, iface).peers.length, 0);
  raw.Peer['100.64.0.2'].DNSName = 'host.test.ts.net.attacker.'; assert.equal(parseTailscaleStatus(raw, iface).peers.length, 0);
});
test('public, LAN, malformed and redirected endpoints cannot become VPN destinations', () => {
  for (const ip of ['127.0.0.1', '192.168.0.1', '8.8.8.8', '100.63.1.1', '100.128.1.1', '100.64.0.256', '100.064.0.1', '100.64.0.1@attacker.test', '100.64.0.1/../../']) assert.equal(vpnIP(ip), false);
  assert(vpnIP('100.64.0.1')); assert(vpnIP('100.127.255.255'));
  for (const value of ['https://public.test', 'http://localhost:4317', '100.64.0.1:80']) assert.throws(() => brokerBase(value));
  assert.equal(brokerBase(''), 'self'); assert.equal(brokerBase('100.64.0.1'), '100.64.0.1');
  assert(!validVpnDescription({ ip: '100.64.0.1' }));
});
test('missing VPN fails closed while local vault, witness and static UI stay usable', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'doodle-vpn-off-')); let keeper;
  try {
    keeper = await createKeeperServer({ port: 0, dataDir: dir, vpnOptions: { readStatus: async () => { throw new Error('VPN test offline.'); } } }); const base = 'http://127.0.0.1:' + keeper.port;
    assert.equal((await (await fetch(base + '/vpn-api/status')).json()).ready, false);
    assert.equal((await fetch(base + '/vpn-api/channels', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"label":"doodleverse-v1"}' })).status, 503);
    assert.equal((await fetch(base + '/vpn-api/lobby/self/rooms')).status, 503);
    assert.equal((await fetch(base + '/arcade-api/rooms')).status, 404);
    assert.equal((await fetch(base + '/api/status')).status, 200); assert.equal((await fetch(base + '/')).status, 200);
    assert.equal((await fetch(base + '/vpn-api/status', { headers: { origin: 'https://attacker.test' } })).status, 403);
    assert.match((await fetch(base + '/')).headers.get('content-security-policy'), /connect-src 'self';/);
  } finally { await keeper?.close(); await rm(dir, { recursive: true, force: true }); }
});
test('two native bridges enforce source membership, capabilities, ordering, bounds and revocation', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'doodle-vpn-wire-')); const net = await simulatedKeepers(dir, 2); const [a, b] = net.nodes;
  const api = async (node, route, method = 'GET', data, auth) => { const r = await fetch(node.base + '/vpn-api/' + route, { method, headers: { ...(data ? { 'content-type': 'application/json' } : {}), ...(auth ? { authorization: 'Bearer ' + auth } : {}) }, ...(data ? { body: JSON.stringify(data) } : {}) }); return { status: r.status, data: await r.json() }; };
  try {
    const make = async n => (await api(n, 'channels', 'POST', { label: 'doodleverse-v1' })).data;
    const ca = await make(a), cb = await make(b), routeA = 'channels/' + ca.description.channel, routeB = 'channels/' + cb.description.channel;
    assert(validVpnDescription(ca.description)); assert.equal((await api(a, routeA + '/bind', 'POST', { ...cb.description, ip: '8.8.8.8' }, ca.localToken)).status, 403);
    assert.equal((await api(a, routeA + '/bind', 'POST', { ...cb.description, network: 'other.ts.net' }, ca.localToken)).status, 403);
    assert.equal((await api(a, routeA + '/bind', 'POST', cb.description, ca.localToken)).status, 200);
    assert.equal((await api(b, routeB + '/bind', 'POST', ca.description, cb.localToken)).status, 200);
    const peerRoute = '/vpn-peer/' + cb.description.channel, packet = { from: ca.description.channel, seq: 1, messages: [{ kind: 'text', data: 'Private 🪐 hello' }] };
    assert.equal((await net.requestPeer({ ip: b.ip, source: '8.8.8.8', route: peerRoute, method: 'POST', headers: { Authorization: 'Bearer ' + cb.description.token }, data: packet })).status, 403);
    assert.equal((await net.requestPeer({ ip: b.ip, source: a.ip, route: peerRoute, method: 'POST', headers: { Authorization: 'Bearer wrong' }, data: packet })).status, 403);
    assert.equal((await api(a, routeA + '/send', 'POST', { messages: packet.messages }, ca.localToken)).status, 200);
    const events = (await api(b, routeB + '/events', 'GET', null, cb.localToken)).data.events; assert.equal(events[0].message.data, 'Private 🪐 hello');
    assert.equal((await net.requestPeer({ ip: b.ip, source: a.ip, route: peerRoute, method: 'POST', headers: { Authorization: 'Bearer ' + cb.description.token }, data: packet })).status, 200);
    assert.equal((await api(a, routeA + '/send', 'POST', { messages: [{ kind: 'binary', data: Buffer.alloc(16385).toString('base64') }] }, ca.localToken)).status, 400);
    assert.equal((await api(b, routeB + '/events?after=999', 'GET', null, cb.localToken)).status, 400);
    assert.equal((await api(a, 'lobby/100.64.0.99/rooms')).status, 403);
    for (const route of ['/api/status', '/api/witness', '/index.html', '/.doodletick/witness-key.json', '/vpn-api/status']) assert.equal((await net.requestPeer({ ip: b.ip, source: a.ip, route })).status, 404);
    a.raw.Peer[b.ip].Online = false; await a.keeper.vpn.refresh(); assert.equal((await api(a, routeA + '/send', 'POST', { messages: packet.messages }, ca.localToken)).status, 410);
    b.raw.BackendState = 'Stopped'; await b.keeper.vpn.refresh(); assert.equal(b.keeper.vpn.status().ready, false); assert.equal(b.keeper.vpn.address(), undefined);
  } finally { await net.close(); await rm(dir, { recursive: true, force: true }); }
});
test('production transport binds both listener and outbound traffic to VPN with no public fallback', async () => {
  const code = await readFile(new URL('../vpn-network.mjs', import.meta.url), 'utf8');
  assert.match(code, /localAddress: source/); assert.match(code, /listenAddress = ip => ip/);
  for (const name of ['arcade-link.mjs', 'peers.mjs']) { const source = await readFile(new URL('../public/' + name, import.meta.url), 'utf8'); assert(!source.includes('RTCPeerConnection')); assert(!source.includes('stun.cloudflare')); }
});
