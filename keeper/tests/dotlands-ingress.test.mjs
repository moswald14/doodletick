import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createKeeperServer } from '../server.mjs';
import { createIngressServer } from '../../doodletick/gateway.mjs';
import { createGardenLedger } from '../garden-ledger.mjs';
import { newIdentity, hash, EPOCH } from '../public/core.mjs';
import { gardenRequest, verifyGardenResponse, recipe, HOUR } from '../public/mushroom-core.mjs';
import { dotlandsRequest, verifyDotlandsResponse } from '../public/dotlands-protocol.mjs';

const control = { status: async () => ({ mode: 'local-direct', ready: true, peers: [] }) };
const vpnOptions = { readStatus: async () => { throw Error('Isolated test: no VPN'); } };
const headers = { 'Content-Type': 'application/json', 'X-Keeper-Request': '1', Origin: 'https://homeassistant.example' };

async function fixture(t, paidPlayers = false) {
  const dataDir = await mkdtemp(path.join(tmpdir(), 'dotlands-ingress-'));
  const witness = await newIdentity('ingress_keeper'), host = await newIdentity('ingress_host'), guest = await newIdentity('ingress_guest');
  const time = Date.now(); let keeper, gateway, base;
  async function stop() {
    if (gateway) { const server = gateway; gateway = null; server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
    if (keeper) { const current = keeper; keeper = null; await current.close(); }
  }
  t.after(async () => { await stop(); await rm(dataDir, { recursive: true, force: true }); });
  // These generated test keys and earned coins are isolated from every real Keeper.
  await writeFile(path.join(dataDir, 'witness-key.json'), JSON.stringify(witness), { flag: 'wx', mode: 0o600 });
  if (paidPlayers) {
    const plantedAt = EPOCH + Math.floor((time - EPOCH) / HOUR) * HOUR - 4 * HOUR;
    const garden = await createGardenLedger({ dataDir, identity: witness, now: () => plantedAt });
    for (const [index, player] of [host, guest].entries()) {
      await garden.dispatch(await gardenRequest(player, witness.fingerprint, 'join', {}, 1, plantedAt));
      await garden.dispatch(await gardenRequest(player, witness.fingerprint, 'plant', {
        recipe: recipe({ kind: 'dot-mushroom', version: 1, name: 'Ingress fixture', settings: { seed: 138 + index }, patch: null }),
        credit: 'Disposable test fixture', rightsConfirmed: true,
      }, 2, plantedAt));
    }
    await garden.idle();
  }
  async function start() {
    keeper = await createKeeperServer({ dataDir, port: 0, vpnOptions, gardenOptions: { now: () => time } });
    // Loopback stands in for the already authenticated HA ingress proxy only in this fixture.
    gateway = createIngressServer({ keeperPort: keeper.port, control, ingressIP: '127.0.0.1' });
    await new Promise((resolve, reject) => { gateway.once('error', reject); gateway.listen(0, '127.0.0.1', resolve); });
    base = `http://127.0.0.1:${gateway.address().port}`;
  }
  await start();
  async function request(player, operation, args = {}, status = 200) {
    const proof = await dotlandsRequest(player, witness.fingerprint, operation, args);
    const response = await fetch(base + '/api/dotlands/request', { method: 'POST', headers, body: JSON.stringify(proof) });
    const envelope = await response.json();
    assert.equal(response.status, status, envelope.record?.error || operation);
    assert(await verifyDotlandsResponse(envelope, witness.fingerprint, await hash(proof.record)));
    assert.equal(envelope.record.owner, player.fingerprint);
    return envelope.record;
  }
  async function account(player) {
    const proof = await gardenRequest(player, witness.fingerprint, 'account', {}, 0, time);
    const response = await fetch(base + '/vpn-api/garden/self/account', { method: 'POST', headers, body: JSON.stringify(proof) });
    assert.equal(response.status, 200); const envelope = await response.json();
    assert(await verifyGardenResponse(envelope, witness.fingerprint)); return envelope.record;
  }
  return { witness, host, guest, request, account, get base() { return base; }, async restart() { await stop(); await start(); } };
}

test('ingress protects signed saved-room requests and a rejected entry leaves no room', async t => {
  const f = await fixture(t);
  const info = await (await fetch(f.base + '/api/dotlands/info')).json();
  assert(await verifyDotlandsResponse(info, f.witness.fingerprint));
  assert.equal(info.record.price, 1);
  const proof = await dotlandsRequest(f.host, f.witness.fingerprint, 'create', { name: 'Host', acceptPrice: 1 });
  const blocked = await fetch(f.base + '/api/dotlands/request', { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: headers.Origin }, body: JSON.stringify(proof) });
  assert.equal(blocked.status, 403); await blocked.arrayBuffer();
  assert.deepEqual((await f.request(f.host, 'list')).data.rooms, []);
  assert.match((await f.request(f.host, 'create', { name: 'Host', acceptPrice: 1 }, 402)).error, /garden/i);
  assert.deepEqual((await f.request(f.host, 'list')).data.rooms, []);
  for (const file of ['dotlands-rooms.json', 'dotlands-rooms.json.next', 'garden-ledger.json', 'witness-key.json']) {
    const response = await fetch(f.base + '/' + file); assert.equal(response.status, 404); await response.arrayBuffer();
  }
});

test('paid saved game survives Keeper and ingress restart with free identity-based return', async t => {
  const f = await fixture(t, true);
  let board = (await f.request(f.host, 'create', { name: 'Host', acceptPrice: 1, seed: 'ingress-save-test' })).data;
  const code = board.code;
  board = (await f.request(f.guest, 'join', { code, name: 'Guest', acceptPrice: 1 })).data;
  for (const player of [f.host, f.guest]) {
    const account = await f.account(player);
    assert.equal(account.balance, 3); assert.equal(account.sequence, 3);
    assert.equal(account.history.filter(receipt => receipt.record.result.action === 'arcade-admission').length, 1);
  }
  board = (await f.request(f.host, 'start', { code, expectedRevision: board.revision, fillBots: false })).data;
  await f.request(f.guest, 'action', { code, type: 'endTurn', expectedRevision: board.revision }, 403);
  board = (await f.request(f.host, 'action', { code, type: 'endTurn', expectedRevision: board.revision })).data;
  const saved = structuredClone(board.state);
  await f.restart();
  const hostReturn = (await f.request(f.host, 'join', { code })).data;
  const guestReturn = (await f.request(f.guest, 'join', { code })).data;
  assert.equal(hostReturn.seat, 0); assert.equal(guestReturn.seat, 1);
  assert.deepEqual(hostReturn.state, saved); assert.deepEqual(guestReturn.state, saved);
  assert.equal((await f.request(f.host, 'list')).data.rooms[0].code, code);
  for (const player of [f.host, f.guest]) {
    const account = await f.account(player);
    assert.equal(account.balance, 3); assert.equal(account.sequence, 3);
    assert.equal(account.history.filter(receipt => receipt.record.result.action === 'arcade-admission').length, 1);
  }
  board = (await f.request(f.guest, 'action', { code, type: 'endTurn', expectedRevision: guestReturn.revision })).data;
  assert.equal(board.state.currentPlayer, 0); assert.equal(board.state.round, 2);
});
