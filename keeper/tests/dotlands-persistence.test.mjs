import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { once } from 'node:events';
import { newIdentity, hash, EPOCH } from '../public/core.mjs';
import { dotlandsRequest, verifyDotlandsResponse } from '../public/dotlands-protocol.mjs';
import { gardenRequest, HOUR, recipe } from '../public/mushroom-core.mjs';
import { createGardenLedger } from '../garden-ledger.mjs';
import { createDotlandsStore } from '../dotlands-store.mjs';
import { createDotlandsHttpHandler } from '../dotlands-http.mjs';

async function fixture(t, options = {}) {
  const dataDir = await mkdtemp(path.join(tmpdir(), 'dotlands-saved-test-'));
  const keeper = await newIdentity('test_keeper'), host = await newIdentity('test_host'), guest = await newIdentity('test_guest'), other = await newIdentity('test_other');
  const balances = new Map([host, guest, other].map(i => [i.fingerprint, 10])), paid = new Set(); let attempts = 0;
  const chargeAdmission = async ({ owner, room, price }) => {
    attempts++;
    const key = owner + ':' + room;
    if (paid.has(key)) return { paid: true };
    if ((balances.get(owner) || 0) < price) throw Object.assign(new Error('Not enough Doodle Coins.'), { status: 402 });
    balances.set(owner, balances.get(owner) - price); paid.add(key); return { paid: true };
  };
  let time = Date.now(), store = await createDotlandsStore({ dataDir, identity: keeper, now: () => time, chargeAdmission, ...options });
  const request = (who, operation, args = {}) => dotlandsRequest(who, keeper.fingerprint, operation, args, time);
  const call = async (who, operation, args = {}) => {
    const proof = await request(who, operation, args), reply = await store.dispatch(proof);
    assert(await verifyDotlandsResponse(reply, keeper.fingerprint, await hash(proof.record)));
    assert.equal(reply.record.owner, who.fingerprint); return reply.record.data;
  };
  t.after(async () => { await store.idle(); await rm(dataDir, { recursive: true, force: true }); });
  return { dataDir, keeper, host, guest, other, balances, paid, request, call, chargeAdmission,
    get attempts() { return attempts; }, get store() { return store; },
    setTime(value) { time = value; },
    async restart(extra = {}) { await store.idle(); store = await createDotlandsStore({ dataDir, identity: keeper, now: () => time, chargeAdmission, ...extra }); },
  };
}

test('saved games survive every browser closing and a Keeper restart; every human pays once', async t => {
  const f = await fixture(t);
  let board = await f.call(f.host, 'create', { name: 'Host', acceptPrice: 1, seed: 'durable-test' });
  const code = board.code;
  board = await f.call(f.guest, 'join', { code, name: 'Guest', acceptPrice: 1 });
  assert.equal(f.balances.get(f.host.fingerprint), 9); assert.equal(f.balances.get(f.guest.fingerprint), 9);
  board = await f.call(f.host, 'start', { code, expectedRevision: board.revision, fillBots: false });
  board = await f.call(f.host, 'action', { code, type: 'endTurn', expectedRevision: board.revision });
  const saved = structuredClone(board.state); await f.restart();
  const hostReturn = await f.call(f.host, 'join', { code }), guestReturn = await f.call(f.guest, 'join', { code });
  assert.equal(hostReturn.seat, 0); assert.equal(guestReturn.seat, 1); assert.deepEqual(hostReturn.state, saved); assert.deepEqual(guestReturn.state, saved);
  assert.equal(f.attempts, 2, 'Returning never invokes payment');
  board = await f.call(f.guest, 'action', { code, type: 'endTurn', expectedRevision: guestReturn.revision });
  assert.equal(board.state.currentPlayer, 0); assert.equal(board.state.round, 2);
  f.setTime(Date.now() + 365 * 86400000); await f.restart();
  assert.equal((await f.call(f.host, 'list')).rooms[0].code, code, 'Rooms have no idle expiry');
  assert.equal((await f.call(f.other, 'list')).rooms.length, 0);
});

test('signed identity, Keeper, membership, turn, revision and maximum army remain authoritative', async t => {
  const f = await fixture(t);
  let board = await f.call(f.host, 'create', { name: 'Host', acceptPrice: 1 });
  const code = board.code;
  board = await f.call(f.guest, 'join', { code, name: 'Guest', acceptPrice: 1 });
  await assert.rejects(f.call(f.guest, 'start', { code, expectedRevision: board.revision }), { status: 403 });
  await assert.rejects(f.call(f.other, 'snapshot', { code }), { status: 403 });
  const forged = await f.request(f.other, 'snapshot', { code }); forged.record.owner = f.host.fingerprint;
  await assert.rejects(f.store.dispatch(forged), { status: 403 });
  await assert.rejects(f.store.dispatch(await dotlandsRequest(f.host, 'a'.repeat(43), 'snapshot', { code })), { status: 403 });
  board = await f.call(f.host, 'start', { code, expectedRevision: board.revision, fillBots: false });
  await assert.rejects(f.call(f.guest, 'action', { code, type: 'endTurn', expectedRevision: board.revision }), { status: 403 });
  await assert.rejects(f.call(f.host, 'action', { code, type: 'endTurn', expectedRevision: board.revision - 1 }), { status: 409 });
  const e = globalThis.DotlandsEngine;
  let action;
  for (const from of board.state.tiles) for (const to of e.neighbors(board.state, from.id)) {
    const amount = e.maxSend(board.state, from.id, to.id);
    if (!action && amount > 1 && e.previewMove(board.state, from.id, to.id, amount).ok) action = { from: from.id, to: to.id, amount };
  }
  assert(action); const expected = structuredClone(board.state); e.applyMove(expected, action.from, action.to, action.amount);
  const moved = await f.call(f.host, 'action', { code, type: 'move', ...action, amount: 1, expectedRevision: board.revision });
  assert.deepEqual(moved.state, expected);
  assert.equal(JSON.stringify(moved).includes('token'), false); assert.equal(JSON.stringify(moved).includes('peerId'), false);
});

test('duplicate creation, join and turn retries remain once-only through concurrency and restarts', async t => {
  const f = await fixture(t), create = await f.request(f.host, 'create', { name: 'Host', acceptPrice: 1, maxPlayers: 2 });
  const [one, two] = await Promise.all([f.store.dispatch(create), f.store.dispatch(create)]);
  assert.equal(one.record.data.code, two.record.data.code); assert.equal(f.paid.size, 1);
  const code = one.record.data.code; f.setTime(Date.now() + 86400000); await f.restart();
  assert.equal((await f.store.dispatch(create)).record.data.code, code);
  const joins = await Promise.allSettled([f.call(f.guest, 'join', { code, name: 'Guest', acceptPrice: 1 }), f.call(f.other, 'join', { code, name: 'Other', acceptPrice: 1 })]);
  assert.equal(joins.filter(r => r.status === 'fulfilled').length, 1); assert.equal(f.paid.size, 2);
  let board = await f.call(f.host, 'join', { code }); board = await f.call(f.host, 'start', { code, expectedRevision: board.revision, fillBots: false });
  const turn = await f.request(f.host, 'action', { code, type: 'endTurn', expectedRevision: board.revision });
  const answers = await Promise.all([f.store.dispatch(turn), f.store.dispatch(turn)]);
  assert.equal(answers[0].record.data.revision, answers[1].record.data.revision);
  f.setTime(Date.now() + 2 * 86400000); await f.restart(); assert.deepEqual((await f.store.dispatch(turn)).record.data.state, answers[0].record.data.state);
});

test('a debit followed by a failed room write recovers the reserved seat without charging twice', async t => {
  const f = await fixture(t); let writes = 0;
  await f.restart({ writeSnapshot: async bytes => {
    if (++writes === 2) throw Error('Injected final-write failure');
    await writeFile(path.join(f.dataDir, 'dotlands-rooms.json'), bytes);
  } });
  const proof = await f.request(f.host, 'create', { name: 'Host', acceptPrice: 1 });
  await assert.rejects(f.store.dispatch(proof), /final-write/);
  assert.equal(f.balances.get(f.host.fingerprint), 9);
  const pending = (await f.call(f.host, 'list')).rooms[0]; assert(pending.paymentPending);
  f.setTime(Date.now() + 86400000); await f.restart();
  const resumed = (await f.store.dispatch(proof)).record.data;
  assert.equal(resumed.seat, 0); assert.equal(f.balances.get(f.host.fingerprint), 9); assert.equal(f.paid.size, 1);
  assert.equal((await f.call(f.host, 'list')).rooms[0].paymentPending, false);
});

test('an old exact guest admission recovers both pending and completed entry while new old intents expire', async t => {
  const f = await fixture(t), board = await f.call(f.host, 'create', { name: 'Host', acceptPrice: 1 });
  const join = await f.request(f.guest, 'join', { code: board.code, name: 'Guest', acceptPrice: 1 });
  const expiredNew = await f.request(f.other, 'create', { name: 'Other', acceptPrice: 1 });
  let writes = 0;
  await f.restart({ writeSnapshot: async bytes => {
    if (++writes === 2) throw Error('Injected guest-final-write failure');
    await writeFile(path.join(f.dataDir, 'dotlands-rooms.json'), bytes);
  } });
  await assert.rejects(f.store.dispatch(join), /guest-final-write/);
  assert.equal(f.balances.get(f.guest.fingerprint), 9);
  f.setTime(Date.now() + 86400000); await f.restart();
  assert.equal((await f.store.dispatch(join)).record.data.seat, 1);
  await f.restart();
  assert.equal((await f.store.dispatch(join)).record.data.seat, 1);
  assert.equal(f.balances.get(f.guest.fingerprint), 9);
  await assert.rejects(f.store.dispatch(expiredNew), { status: 409 });
  assert.equal(f.balances.get(f.other.fingerprint), 10);
});

test('real garden fees and saved seats recover together after a paid-write failure and restart', async t => {
  const dataDir = await mkdtemp(path.join(tmpdir(), 'dotlands-garden-recovery-'));
  const keeper = await newIdentity('test_keeper'), host = await newIdentity('test_host'), guest = await newIdentity('test_guest');
  let time = EPOCH + 100 * HOUR, garden, store;
  async function reopen(options = {}) {
    await Promise.all([garden?.idle(), store?.idle()]);
    garden = await createGardenLedger({ dataDir, identity: keeper, now: () => time });
    store = await createDotlandsStore({ dataDir, identity: keeper, now: () => time,
      chargeAdmission: args => garden.chargeArcadeAdmission(args), ...options });
  }
  await reopen();
  t.after(async () => { await Promise.all([garden.idle(), store.idle()]); await rm(dataDir, { recursive: true, force: true }); });
  const account = async who => (await garden.dispatch(await gardenRequest(who, keeper.fingerprint, 'account', {}, 0, time), true)).record;
  const gardenAct = async (who, operation, args = {}) => garden.dispatch(await gardenRequest(who, keeper.fingerprint, operation, args, (await account(who)).sequence + 1, time));
  for (const who of [host, guest]) {
    await gardenAct(who, 'join');
    await gardenAct(who, 'plant', { recipe: recipe({ kind: 'dot-mushroom', version: 1, name: 'Recovery test', settings: { seed: who === host ? 138 : 139 }, patch: null }), credit: 'Test fixture', rightsConfirmed: true });
  }
  time += 4 * HOUR;
  async function failFinalWrite(proof) {
    let writes = 0;
    await reopen({ writeSnapshot: async bytes => {
      if (++writes === 2) throw Error('Injected final room write failure');
      await writeFile(path.join(dataDir, 'dotlands-rooms.json'), bytes);
    } });
    await assert.rejects(store.dispatch(proof), /final room write/);
    const before = await account(proof.record.owner === host.fingerprint ? host : guest);
    assert.equal(before.history.filter(e => e.record.result.action === 'arcade-admission').length, 1);
    time += 24 * HOUR; await reopen();
    const recovered = (await store.dispatch(proof)).record.data;
    const after = await account(proof.record.owner === host.fingerprint ? host : guest);
    assert.equal(after.balance, before.balance, 'Recovery cannot settle or spend another coin');
    assert.equal(after.sequence, before.sequence, 'Existing entitlement is returned without a second debit');
    return recovered;
  }
  const created = await failFinalWrite(await dotlandsRequest(host, keeper.fingerprint, 'create', { name: 'Host', acceptPrice: 1 }, time));
  const joined = await failFinalWrite(await dotlandsRequest(guest, keeper.fingerprint, 'join', { code: created.code, name: 'Guest', acceptPrice: 1 }, time));
  assert.equal(created.seat, 0); assert.equal(joined.seat, 1);
  await reopen();
  const returned = (await store.dispatch(await dotlandsRequest(host, keeper.fingerprint, 'snapshot', { code: created.code }, time))).record.data;
  assert.equal(returned.players.length, 2);
  assert.equal((await account(host)).history.filter(e => e.record.result.action === 'arcade-admission').length, 1);
  assert.equal((await account(guest)).history.filter(e => e.record.result.action === 'arcade-admission').length, 1);
});

test('insufficient funds, missing fee consent, illegal moves and failed saves preserve balances and boards', async t => {
  const f = await fixture(t);
  await assert.rejects(f.call(f.host, 'create', { name: 'Host' }), { status: 402 }); assert.equal(f.attempts, 0);
  f.balances.set(f.other.fingerprint, 0);
  await assert.rejects(f.call(f.other, 'create', { name: 'Other', acceptPrice: 1 }), { status: 402 });
  assert.equal((await f.call(f.other, 'list')).rooms.length, 0);
  let board = await f.call(f.host, 'create', { name: 'Host', acceptPrice: 1 }); const code = board.code;
  board = await f.call(f.host, 'start', { code, expectedRevision: board.revision, fillBots: true });
  const before = structuredClone(board.state);
  await assert.rejects(f.call(f.host, 'action', { code, type: 'move', from: '999,999', to: '0,0', expectedRevision: board.revision }), { status: 400 });
  await f.restart({ writeSnapshot: async () => { throw Error('Injected disk full'); } });
  await assert.rejects(f.call(f.host, 'action', { code, type: 'endTurn', expectedRevision: board.revision }), /disk full/);
  assert.deepEqual((await f.call(f.host, 'snapshot', { code })).state, before);
  await f.restart(); assert.deepEqual((await f.call(f.host, 'snapshot', { code })).state, before);
});

test('unchanged snapshots stay small and corrupt storage fails closed without replacing saved bytes', async t => {
  const f = await fixture(t), board = await f.call(f.host, 'create', { name: 'Host', acceptPrice: 1 });
  const unchanged = await f.call(f.host, 'snapshot', { code: board.code, knownRevision: board.revision });
  assert.equal(unchanged.unchanged, true); assert.equal(unchanged.state, undefined); assert(JSON.stringify(unchanged).length < 100);
  const file = path.join(f.dataDir, 'dotlands-rooms.json'), envelope = JSON.parse(await readFile(file));
  envelope.record.revision++; const damaged = JSON.stringify(envelope); await writeFile(file, damaged); await f.restart();
  assert.equal((await f.store.info()).record.available, false); assert(f.store.unavailable);
  await assert.rejects(f.call(f.host, 'create', { name: 'Host', acceptPrice: 1 }), { status: 503 });
  assert.equal(await readFile(file, 'utf8'), damaged);
});

test('HTTP keeps the Keeper boundary, signs authenticated errors and rejects unbounded bodies', async t => {
  const f = await fixture(t), handler = createDotlandsHttpHandler({ store: f.store });
  const server = http.createServer(async (req, res) => { if (!await handler(req, res, new URL(req.url, 'http://localhost'))) { res.writeHead(404); res.end(); } });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(() => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); }));
  const base = 'http://127.0.0.1:' + server.address().port;
  const info = await (await fetch(base + '/api/dotlands/info')).json(); assert(await verifyDotlandsResponse(info, f.keeper.fingerprint));
  const proof = await f.request(f.host, 'snapshot', { code: 'ABC234' });
  const headers = { 'Content-Type': 'application/json', 'X-Keeper-Request': '1' };
  const response = await fetch(base + '/api/dotlands/request', { method: 'POST', headers, body: JSON.stringify(proof) });
  assert.equal(response.status, 404); const failure = await response.json(); assert(await verifyDotlandsResponse(failure, f.keeper.fingerprint, await hash(proof.record))); assert.equal(failure.record.status, 404);
  assert.equal((await fetch(base + '/api/dotlands/request', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(proof) })).status, 403);
  assert.equal((await fetch(base + '/api/dotlands/request', { method: 'POST', headers: { ...headers, Origin: 'https://outside.example' }, body: JSON.stringify(proof) })).status, 403);
  assert.equal((await fetch(base + '/api/dotlands/request', { method: 'POST', headers, body: JSON.stringify({ large: 'x'.repeat(9000) }) })).status, 413);
});
