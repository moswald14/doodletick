import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { newIdentity, hash, EPOCH, sign } from '../public/core.mjs';
import { recipe, newRecipe, mushroomId, renderMushroom, gardenRequest, verifyGardenResponse, HOUR, playerAddress, parseAddress } from '../public/mushroom-core.mjs';
import { createGardenLedger } from '../garden-ledger.mjs';
import { simulatedKeepers } from './vpn-fixture.mjs';
import { createKeeperServer } from '../server.mjs';
const makeRecipe = (seed = 134) => recipe({ kind: 'dot-mushroom', version: 1, name: 'Spore test', settings: { seed }, patch: null });
async function fixture(fn, options = {}) {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'doodle-garden-'));
  const keeper = await newIdentity('garden_keeper'), alice = await newIdentity('alice'), bob = await newIdentity('bob'), cara = await newIdentity('cara');
  let time = EPOCH + HOUR * 100, ledger = await createGardenLedger({ dataDir: dir, identity: keeper, now: () => time, ...options });
  const query = async who => (await ledger.dispatch(await gardenRequest(who, keeper.fingerprint, 'account', {}, 0, time), true)).record;
  const command = async (who, action, args = {}) => ledger.dispatch(await gardenRequest(who, keeper.fingerprint, action, args, (await query(who)).sequence + 1, time));
  const plant = (who, seed = 134) => command(who, 'plant', { recipe: makeRecipe(seed), credit: who.username, rightsConfirmed: true });
  try {
    await fn({ dir, keeper, alice, bob, cara, query, command, plant, request: async (who, action, args = {}) => gardenRequest(who, keeper.fingerprint, action, args, (await query(who)).sequence + 1, time),
      get ledger() { return ledger; }, setTime: v => { time = v; }, advance: hours => { time += hours * HOUR; }, get time() { return time; },
      restart: async () => { ledger = await createGardenLedger({ dataDir: dir, identity: keeper, now: () => time }); } });
  } finally { await ledger.idle(); await rm(dir, { recursive: true, force: true }); }
}

test('original Dot Wave recipes preserve sound; names, motion and unknown metadata do not multiply generators', async () => {
  const r = makeRecipe(), id = await mushroomId(r);
  assert.equal(await mushroomId({ ...r, name: 'renamed', motion: { speed: 2, depth: 1 }, ignored: 'metadata' }), id);
  assert.notEqual(await mushroomId(makeRecipe(135)), id);
  const expected = globalThis.MushroomDSP.render(new Float32Array(96000), 24000, r.settings);
  assert.deepEqual(renderMushroom(r).samples, expected.samples);
  assert.deepEqual(recipe(JSON.parse(JSON.stringify(r))), r);
  for (const bad of [{ ...r, version: 9 }, { ...r, settings: { seed: 0 } }, { ...r, patch: {} }, { ...r, settings: { growth: Infinity } }]) assert.throws(() => recipe(bad));
});
test('collision recipe round-trips and uses the same original renderer', async () => {
  const p = { kind: 'dot-wave-studio', project: globalThis.StudioDSP.defaultProject(), pitch: 134, level: -12, volume: .5, inverted: false };
  const r = recipe({ ...makeRecipe(), patch: p });
  const source = globalThis.WaveExport.render(r.patch.project, r.patch.freePair, globalThis.StudioDSP.compile(r.patch.project, { frequency: 134 }).result, 134, { rate: 24000, duration: 4, gain: .25, inverted: false, loop: true });
  assert.deepEqual(renderMushroom(r).samples, globalThis.MushroomDSP.render(source, 24000, r.settings).samples);
  assert.equal(await mushroomId({ ...r, patch: { ...r.patch, volume: .1, level: -30 } }), await mushroomId(r));
});
test('full UTC hours, offline catch-up, clock rollback and copied recipes cannot duplicate earnings', () => fixture(async f => {
  await f.command(f.alice, 'join'); f.advance(.5); await f.plant(f.alice);
  f.advance(.5); assert.equal((await f.query(f.alice)).pending, 0);
  f.advance(1); assert.equal((await f.query(f.alice)).pending, 1);
  await f.command(f.alice, 'harvest'); assert.equal((await f.query(f.alice)).balance, 1);
  await assert.rejects(f.plant(f.alice), /already/);
  await f.command(f.bob, 'join'); await assert.rejects(f.plant(f.bob), /already/);
  f.advance(9); await f.restart(); assert.equal((await f.query(f.alice)).pending, 9);
  await f.command(f.alice, 'harvest'); f.advance(-3);
  assert.equal((await f.query(f.alice)).pending, 0); assert.equal((await f.query(f.alice)).balance, 10);
}));
test('payments conserve coins; repeated and concurrent signed requests cannot charge twice', () => fixture(async f => {
  await f.command(f.alice, 'join'); await f.command(f.bob, 'join'); await f.plant(f.alice); f.advance(10);
  const req = await f.request(f.alice, 'send', { to: f.bob.fingerprint, amount: 6 });
  const answers = await Promise.all([f.ledger.dispatch(req), f.ledger.dispatch(req)]); assert.deepEqual(...answers);
  assert.equal((await f.query(f.alice)).balance, 4); assert.equal((await f.query(f.bob)).balance, 6);
  assert(await verifyGardenResponse(answers[0], f.keeper.fingerprint, await hash(req.record)));
  assert.equal((await f.query(f.bob)).history[0].record.result.to, f.bob.fingerprint);
  await f.restart(); assert.deepEqual(await f.ledger.dispatch(req), answers[0]);
  const other = await f.request(f.alice, 'send', { to: f.bob.fingerprint, amount: 3 });
  const conflict = await f.request(f.alice, 'send', { to: f.bob.fingerprint, amount: 4 });
  const settled = await Promise.allSettled([f.ledger.dispatch(other), f.ledger.dispatch(conflict)]);
  assert.equal(settled.filter(r => r.status === 'fulfilled').length, 1);
  assert.equal((await f.query(f.alice)).balance + (await f.query(f.bob)).balance, 10);
  await assert.rejects(f.ledger.dispatch(req), /changed/);
  for (const n of [-1, 0, .5, 1e15]) await assert.rejects(f.command(f.alice, 'send', { to: f.bob.fingerprint, amount: n }));
}));
test('atomic mushroom sales settle the seller, transfer future earnings and preserve credit and decorations', () => fixture(async f => {
  for (const who of [f.alice, f.bob, f.cara]) await f.command(who, 'join');
  const planted = await f.plant(f.alice), id = planted.record.result.mushroom;
  await f.plant(f.bob, 135); await f.plant(f.cara, 136); f.advance(10);
  await f.command(f.alice, 'decorate', { id, item: 'ring' });
  await assert.rejects(f.command(f.alice, 'decorate', { id, item: 'ring' }), /already/);
  await f.command(f.alice, 'list', { id, price: 3 });
  const buy = { id, price: 3, seller: f.alice.fingerprint };
  const a = await f.request(f.bob, 'buy', buy), b = await f.request(f.cara, 'buy', buy);
  const results = await Promise.allSettled([f.ledger.dispatch(a), f.ledger.dispatch(b)]);
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
  const bob = await f.query(f.bob), m = bob.mushrooms.find(m => m.id === id);
  assert.equal(m.owner, f.bob.fingerprint); assert.equal(m.creator, f.alice.fingerprint); assert.equal(m.credit, 'alice'); assert.deepEqual(m.decorations, ['ring']);
  assert.equal((await f.query(f.alice)).balance, 8); assert.equal(bob.balance, 7); assert.equal((await f.query(f.alice)).mushrooms.length, 0);
  await assert.rejects(f.command(f.alice, 'list', { id, price: 1 }), /not in your garden/);
  f.advance(2); assert.equal((await f.query(f.alice)).pending, 0); assert.equal((await f.query(f.bob)).pending, 4);
}));
test('changed price, forged owners, wrong Keeper, replayed reads and expired requests fail', () => fixture(async f => {
  await f.command(f.alice, 'join'); await f.command(f.bob, 'join'); const planted = await f.plant(f.alice); const id = planted.record.result.mushroom;
  await f.plant(f.bob, 136); f.advance(10); await f.command(f.alice, 'list', { id, price: 3 });
  const stale = await f.request(f.bob, 'buy', { id, price: 3, seller: f.alice.fingerprint }); await f.command(f.alice, 'list', { id, price: 4 });
  await assert.rejects(f.ledger.dispatch(stale), /listing changed/);
  const forged = await f.request(f.bob, 'harvest'); forged.record.owner = f.alice.fingerprint;
  await assert.rejects(f.ledger.dispatch(forged), /signature/);
  const cross = await gardenRequest(f.alice, f.bob.fingerprint, 'harvest', {}, 4, f.time); await assert.rejects(f.ledger.dispatch(cross), /signature/);
  const expired = await f.request(f.bob, 'harvest'); f.advance(1); await assert.rejects(f.ledger.dispatch(expired), /expired/);
  const read = await gardenRequest(f.alice, f.keeper.fingerprint, 'account', {}, 0, f.time), answer = await f.ledger.dispatch(read, true);
  assert.equal(await verifyGardenResponse(answer, f.keeper.fingerprint, 'different request'), false);
  assert.throws(() => parseAddress(playerAddress(f.bob.fingerprint, f.alice.fingerprint), f.keeper.fingerprint), /same garden/);
}));
test('failed writes cannot mint and tampered disk ledgers fail closed', async () => {
  await fixture(async f => {
    await assert.rejects(f.command(f.alice, 'join'), /disk full/); assert.equal((await f.query(f.alice)).joined, false);
  }, { writeSnapshot: async () => { throw Error('disk full'); } });
  await fixture(async f => {
    await f.command(f.alice, 'join'); const p = path.join(f.dir, 'garden-ledger.json'), raw = JSON.parse(await readFile(p, 'utf8'));
    raw.record.accounts[f.alice.fingerprint].balance = 999; await writeFile(p, JSON.stringify(raw));
    await assert.rejects(f.restart(), /signature failed/);
  });
});
test('one shared garden is reachable through two private bridges; other Keepers stay separate', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'doodle-garden-wire-')), net = await simulatedKeepers(dir, 2);
  const [a,b] = net.nodes, who = await newIdentity('network_player');
  const call = async (node, host, route, data) => { const r = await fetch(node.base + `/vpn-api/garden/${host}/${route}`, { method: data ? 'POST' : 'GET', headers: data ? { 'Content-Type': 'application/json' } : {}, body: data ? JSON.stringify(data) : undefined }); return { status: r.status, data: await r.json() }; };
  try {
    const info = (await call(a, b.ip, 'info')).data, issuer = info.record.issuer;
    assert(await verifyGardenResponse(info, issuer));
    const join = await gardenRequest(who, issuer, 'join', {}, 1);
    assert.equal((await call(a, b.ip, 'action', join)).status, 200);
    const balance = (await call(b, 'self', 'account', await gardenRequest(who, issuer, 'account'))).data;
    assert.equal(balance.record.joined, true);
    assert.equal((await call(a, 'self', 'action', join)).status, 403);
    assert.equal((await call(a, '100.64.0.99', 'info')).status, 403);
    assert.equal((await net.requestPeer({ ip:b.ip, source:'8.8.8.8', route:'/garden-api/info' })).status, 403);
    b.raw.Peer[a.ip].Online = false; await b.keeper.vpn.refresh(); assert.equal((await call(a, b.ip, 'info')).status, 403);
  } finally { await net.close(); await rm(dir, { recursive:true, force:true }); }
});
test('garden remains local with VPN offline and does not expose the ledger or identity files', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'doodle-garden-local-'));
  const keeper = await createKeeperServer({ port:0, dataDir:dir, vpnOptions:{ readStatus:async () => { throw Error('offline'); } } });
  try {
    const base = 'http://127.0.0.1:' + keeper.port;
    assert.equal((await fetch(base + '/vpn-api/garden/self/info')).status, 200);
    assert.equal((await fetch(base + '/vpn-api/garden/self/info', { headers:{ origin:'https://other.test' } })).status, 403);
    for (const p of ['garden-ledger.json','.doodletick/garden-ledger.json','garden-api/info']) assert.equal((await fetch(base + '/' + p)).status, 404);
    for (const p of ['mushroom-ui.mjs','mushroom.css','dot-mushroom-dsp.mjs']) assert.equal((await fetch(base + '/' + p)).status, 200);
  } finally { await keeper.close(); await rm(dir, { recursive:true, force:true }); }
});
