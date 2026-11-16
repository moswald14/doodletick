import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createVpnNetwork } from '../vpn-network.mjs';
import { brokerBase } from '../public/arcade-room.mjs';
import { createKeeperServer } from '../server.mjs';

test('local network adapter never invokes old VPN hooks or starts a peer listener', async () => {
  const forbidden = () => assert.fail('Legacy VPN behavior must be inert');
  const network = await createVpnNetwork({ readStatus: forbidden, interfaces: forbidden, requestPeer: forbidden, listenAddress: forbidden });
  assert.equal(network.status().mode, 'local-direct'); assert.equal(network.address(), null);
  assert.equal(network.status().ready, true); assert.deepEqual(network.status().peers, []);
  await network.refresh(); await network.close(); assert.equal(network.status().ready, false);
});
test('directory selection rejects all remote and redirected endpoints', () => {
  for (const value of ['100.64.0.1', 'vpn:100.64.0.1', 'https://public.test', 'http://localhost:4317', '../self', '192.168.1.2']) assert.throws(() => brokerBase(value));
  assert.equal(brokerBase(''), 'self'); assert.equal(brokerBase('self'), 'self');
});
test('local directory stays usable behind the Keeper origin boundary; legacy bridges fail closed', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'doodle-local-')); let keeper;
  try {
    keeper = await createKeeperServer({ port: 0, dataDir: dir }); const base = 'http://127.0.0.1:' + keeper.port;
    assert.equal((await (await fetch(base + '/vpn-api/status')).json()).mode, 'local-direct');
    assert.equal(keeper.server.address().address, '127.0.0.1'); assert.equal(keeper.vpn.address(), null);
    assert.equal((await fetch(base + '/vpn-api/channels', { method: 'POST' })).status, 410);
    assert.equal((await fetch(base + '/vpn-api/lobby/self/rooms')).status, 200);
    assert.equal((await fetch(base + '/vpn-api/lobby/100.64.0.1/rooms')).status, 410);
    assert.equal((await fetch(base + '/vpn-api/garden/100.64.0.1/info')).status, 410);
    assert.equal((await fetch(base + '/arcade-api/rooms')).status, 404);
    assert.equal((await fetch(base + '/api/status')).status, 200);
    assert.equal((await fetch(base + '/vpn-api/status', { headers: { origin: 'https://attacker.test' } })).status, 403);
    const policy = (await fetch(base + '/')).headers.get('content-security-policy');
    assert.deepEqual(policy.match(/connect-src ([^;]+);/)[1].split(' '), ["'self'", 'https://geocoding-api.open-meteo.com', 'https://api.open-meteo.com', 'https://ethereum-rpc.publicnode.com']);
    const created = await fetch(base + '/vpn-api/lobby/self/rooms', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: 'Fixture room', game: 'four', host: 'test_host', discoverable: true }) });
    assert.equal(created.status, 201); assert.equal((await (await fetch(base + '/vpn-api/lobby/self/rooms')).json()).rooms.length, 1);
  } finally { await keeper?.close(); await rm(dir, { recursive: true, force: true }); }
});
test('HA package removes network privileges, VPN runtime and public listener configuration', async () => {
  const read = name => readFile(new URL('../../doodletick/' + name, import.meta.url), 'utf8');
  assert(!/NET_ADMIN|NET_RAW|\/dev\/net\/tun|ports:/.test(await read('config.yaml')));
  assert(!/tailscale|iptables|iproute2/.test(await read('Dockerfile')));
  assert(!/spawn\(|execFile\(/.test(await read('main.mjs')));
});
