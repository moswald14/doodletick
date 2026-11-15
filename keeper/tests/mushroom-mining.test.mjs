import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { canonical, newIdentity, EPOCH } from '../public/core.mjs';
import { recipe, gardenRequest, verifyGardenResponse, HOUR, GARDEN_FORMAT } from '../public/mushroom-core.mjs';
import { MINING_FORMAT, MINING_RULES, verifyMiningWork, validMiningChallenge, searchMiningWork } from '../public/mushroom-mining.mjs';
import { createGardenLedger } from '../garden-ledger.mjs';
import { simulatedKeepers } from './vpn-fixture.mjs';

// Independent SHA-256 solver for the fixed 15-bit protocol target. Tests do not
// weaken the production target or replace server proof verification.
function solve(envelope) {
  const prefix = MINING_FORMAT + '\n' + canonical(envelope.record) + '\n';
  for (let nonce = 0; nonce <= 0xffffffff; nonce++) {
    const bytes = createHash('sha256').update(prefix + nonce).digest();
    if (bytes[0] === 0 && bytes[1] < 2) return nonce;
  }
  throw Error('No nonce found.');
}
async function fixture(fn, { customWriter = false } = {}) {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'doodle-mining-'));
  const keeper = await newIdentity('mining_keeper'), alice = await newIdentity('alice'), bob = await newIdentity('bob');
  let time = EPOCH + 100 * HOUR + HOUR / 2, failWrite = false, ledger;
  const options = { dataDir: dir, identity: keeper, now: () => time };
  const file = path.join(dir, 'garden-ledger.json');
  if (customWriter) options.writeSnapshot = async bytes => { if (failWrite) throw Error('disk full'); await writeFile(file, bytes); };
  ledger = await createGardenLedger(options);
  const query = async who => (await ledger.dispatch(await gardenRequest(who, keeper.fingerprint, 'account', {}, 0, time), true)).record;
  const request = async (who, action, args = {}) => gardenRequest(who, keeper.fingerprint, action, args, (await query(who)).sequence + 1, time);
  const command = async (who, action, args = {}) => ledger.dispatch(await request(who, action, args));
  const plant = async (who, seed = 1) => (await command(who, 'plant', { recipe: recipe({ kind: 'dot-mushroom', version: 1, name: 'Mining spore', settings: { seed }, patch: null }), credit: who.username, rightsConfirmed: true })).record.result.mushroom;
  const challenge = async (who, id) => (await command(who, 'mining-challenge', { id })).record.result.challenge;
  try {
    await fn({ dir, file, keeper, alice, bob, query, request, command, plant, challenge,
      get ledger() { return ledger; }, get time() { return time; }, setTime: value => { time = value; }, advance: ms => { time += ms; },
      failWrites: value => { failWrite = value; }, restart: async () => { await ledger.idle(); ledger = await createGardenLedger(options); } });
  } finally { await ledger.idle(); await rm(dir, { recursive: true, force: true }); }
}

test('signed expiring challenges survive restart without resetting legacy balances or hourly counters', () => fixture(async f => {
  await f.command(f.alice, 'join'); const id = await f.plant(f.alice); f.advance(2 * HOUR);
  await f.command(f.alice, 'harvest');
  const before = await f.query(f.alice), challenge = await f.challenge(f.alice, id);
  assert.equal(before.balance, 1); // A partial first hour never mints a coin.
  assert(await verifyGardenResponse(challenge, f.keeper.fingerprint));
  assert(validMiningChallenge(challenge.record));
  assert.equal(challenge.record.owner, f.alice.fingerprint);
  assert.equal(challenge.record.mushroom, id);
  assert.equal(challenge.record.expiresAt, f.time + MINING_RULES.lifetimeMs);
  const changed = structuredClone(challenge); changed.record.reward = 100;
  assert.equal(await verifyGardenResponse(changed, f.keeper.fingerprint), false);
  assert.equal(validMiningChallenge(changed.record), false);
  await f.restart(); const after = await f.query(f.alice);
  assert.equal(after.balance, before.balance);
  assert.deepEqual(after.mushrooms, before.mushrooms);
  assert.deepEqual(after.mining.challenge, challenge);
  assert.equal(JSON.parse(await readFile(f.file, 'utf8')).record.format, GARDEN_FORMAT);
}));

test('concurrent claims and exact retries mint once; per-player bounds survive restart and clock rollback', () => fixture(async f => {
  await f.command(f.alice, 'join'); const id = await f.plant(f.alice), other = await f.plant(f.alice, 2);
  const challenge = await f.challenge(f.alice, id), nonce = solve(challenge);
  assert(await verifyMiningWork(challenge.record, nonce));
  const proof = await f.request(f.alice, 'mining-claim', { challengeId: challenge.record.challengeId, nonce });
  const receipts = await Promise.all([f.ledger.dispatch(proof), f.ledger.dispatch(proof)]);
  assert.deepEqual(receipts[0], receipts[1]); assert.equal(receipts[0].record.result.mined, 1);
  assert.equal((await f.query(f.alice)).balance, 1);
  await f.restart(); assert.deepEqual(await f.ledger.dispatch(proof), receipts[0]);
  await assert.rejects(f.challenge(f.alice, other), /already mined/);
  await assert.rejects(f.command(f.alice, 'mining-claim', { challengeId: challenge.record.challengeId, nonce }), /used, replaced/);
  f.advance(-HOUR / 4); await assert.rejects(f.challenge(f.alice, other), /already mined/);
  f.advance(HOUR); const next = await f.challenge(f.alice, other);
  assert.notEqual(next.record.challengeId, challenge.record.challengeId);
  assert.equal((await f.query(f.alice)).balance, 1);
}));

test('bad work, fabricated challenges, wrong owners and fresh replays leave balances and snapshots unchanged', () => fixture(async f => {
  await f.command(f.alice, 'join'); await f.command(f.bob, 'join');
  const id = await f.plant(f.alice), challenge = await f.challenge(f.alice, id);
  await assert.rejects(f.challenge(f.bob, id), /not in your garden/);
  await assert.rejects(f.command(f.bob, 'mining-claim', { challengeId: challenge.record.challengeId, nonce: solve(challenge) }), /used, replaced/);
  const before = await readFile(f.file, 'utf8'), balance = await f.query(f.alice);
  for (const nonce of [-1, 1.5, '0', 0x100000000]) await assert.rejects(f.command(f.alice, 'mining-claim', { challengeId: challenge.record.challengeId, nonce }), /did not meet/);
  let invalid = 0; while (await verifyMiningWork(challenge.record, invalid)) invalid++;
  await assert.rejects(f.command(f.alice, 'mining-claim', { challengeId: challenge.record.challengeId, nonce: invalid }), /did not meet/);
  await assert.rejects(f.command(f.alice, 'mining-claim', { challengeId: 'forged', nonce: 0, reward: 999, difficulty: 0 }), /used, replaced/);
  assert.equal(await readFile(f.file, 'utf8'), before);
  assert.equal((await f.query(f.alice)).balance, balance.balance);
  assert.equal((await f.query(f.alice)).sequence, balance.sequence);
}));

test('expired and replaced challenges cannot claim, even with valid work and a newly signed request', () => fixture(async f => {
  await f.command(f.alice, 'join'); const id = await f.plant(f.alice), other = await f.plant(f.alice, 2);
  const first = await f.challenge(f.alice, id), nonce = solve(first);
  f.setTime(first.record.expiresAt); await f.restart();
  await assert.rejects(f.command(f.alice, 'mining-claim', { challengeId: first.record.challengeId, nonce }), /expired/);
  assert.equal((await f.query(f.alice)).mining.challenge, null);
  const second = await f.challenge(f.alice, id);
  assert.notEqual(second.record.challengeId, first.record.challengeId);
  await f.challenge(f.alice, other);
  await assert.rejects(f.command(f.alice, 'mining-claim', { challengeId: second.record.challengeId, nonce: solve(second) }), /used, replaced/);
  assert.equal((await f.query(f.alice)).balance, 0);
}));

test('selling and buying back a mushroom invalidates its earlier ownership challenge', () => fixture(async f => {
  await f.command(f.alice, 'join'); await f.command(f.bob, 'join');
  const id = await f.plant(f.alice); await f.plant(f.bob, 2); f.advance(3 * HOUR);
  const challenge = await f.challenge(f.alice, id), nonce = solve(challenge);
  await f.command(f.alice, 'list', { id, price: 1 });
  await f.command(f.bob, 'buy', { id, price: 1, seller: f.alice.fingerprint });
  await assert.rejects(f.command(f.alice, 'mining-claim', { challengeId: challenge.record.challengeId, nonce }), /not in your garden/);
  await f.command(f.bob, 'list', { id, price: 1 });
  await f.command(f.alice, 'buy', { id, price: 1, seller: f.bob.fingerprint });
  await assert.rejects(f.command(f.alice, 'mining-claim', { challengeId: challenge.record.challengeId, nonce }), /ownership changed/);
  const replacement = await f.challenge(f.alice, id);
  assert.equal(replacement.record.ownershipRevision, 2);
  assert.notEqual(replacement.record.challengeId, challenge.record.challengeId);
}));

test('a mushroom bonus cannot be claimed again by its buyer in the same hour', () => fixture(async f => {
  await f.command(f.alice, 'join'); await f.command(f.bob, 'join');
  const id = await f.plant(f.alice); await f.plant(f.bob, 2); f.advance(3 * HOUR);
  const challenge = await f.challenge(f.alice, id);
  await f.command(f.alice, 'mining-claim', { challengeId: challenge.record.challengeId, nonce: solve(challenge) });
  await f.command(f.alice, 'list', { id, price: 1 });
  await f.command(f.bob, 'buy', { id, price: 1, seller: f.alice.fingerprint });
  await assert.rejects(f.challenge(f.bob, id), /already mined/);
  f.advance(HOUR); await f.challenge(f.bob, id);
}));

test('failed claim persistence spends no challenge and mints nothing; the same signed retry works after restart', () => fixture(async f => {
  await f.command(f.alice, 'join'); const id = await f.plant(f.alice), challenge = await f.challenge(f.alice, id);
  const proof = await f.request(f.alice, 'mining-claim', { challengeId: challenge.record.challengeId, nonce: solve(challenge) });
  const before = await readFile(f.file, 'utf8'); f.failWrites(true);
  await assert.rejects(f.ledger.dispatch(proof), /disk full/);
  assert.equal(await readFile(f.file, 'utf8'), before); assert.equal((await f.query(f.alice)).balance, 0);
  assert.deepEqual((await f.query(f.alice)).mining.challenge, challenge);
  f.failWrites(false); await f.restart(); await f.ledger.dispatch(proof);
  assert.equal((await f.query(f.alice)).balance, 1);
}, { customWriter: true }));

test('private bridges carry signed mining claims with safe retries and serve only the public worker assets', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'doodle-mining-wire-')), net = await simulatedKeepers(dir, 2);
  const [a, b] = net.nodes, player = await newIdentity('wire_miner');
  const call = async (node, host, route, proof) => {
    const response = await fetch(node.base + `/vpn-api/garden/${host}/${route}`, { method: proof ? 'POST' : 'GET',
      headers: proof ? { 'Content-Type': 'application/json' } : {}, body: proof ? JSON.stringify(proof) : undefined });
    return { status: response.status, data: await response.json() };
  };
  try {
    const info = (await call(a, b.ip, 'info')).data, issuer = info.record.issuer;
    assert.equal(info.record.mining.reward, 1);
    const action = async (name, args, sequence) => (await call(a, b.ip, 'action', await gardenRequest(player, issuer, name, args, sequence))).data;
    await action('join', {}, 1);
    const planted = await action('plant', { recipe: recipe({ kind: 'dot-mushroom', version: 1, name: 'Wire spore', settings: { seed: 523 }, patch: null }), rightsConfirmed: true, credit: 'wire_miner' }, 2);
    const challenge = (await action('mining-challenge', { id: planted.record.result.mushroom }, 3)).record.result.challenge;
    assert(await verifyGardenResponse(challenge, issuer));
    const claim = await gardenRequest(player, issuer, 'mining-claim', { challengeId: challenge.record.challengeId, nonce: solve(challenge) }, 4);
    const responses = await Promise.all([call(a, b.ip, 'action', claim), call(b, 'self', 'action', claim)]);
    assert.deepEqual(responses[0], responses[1]); assert.equal(responses[0].status, 200);
    assert.equal(responses[0].data.record.result.mined, 1);
    assert.equal((await call(a, 'self', 'action', claim)).status, 403);
    assert.equal((await net.requestPeer({ ip: b.ip, source: '8.8.8.8', route: '/garden-api/action', method: 'POST', data: claim })).status, 403);
    for (const name of ['mushroom-mining.mjs', 'mushroom-miner.mjs']) {
      const response = await fetch(a.base + '/' + name);
      assert.equal(response.status, 200); assert.match(response.headers.get('content-type'), /javascript/);
    }
    assert.equal((await fetch(a.base + '/garden-ledger.json')).status, 404);
  } finally { await net.close(); await rm(dir, { recursive: true, force: true }); }
});

const sample = () => ({ format: GARDEN_FORMAT, issuer: 'A'.repeat(43), kind: 'mining-challenge', algorithm: MINING_FORMAT,
  owner: 'B'.repeat(43), mushroom: 'C'.repeat(43), ownershipRevision: 0, challengeId: 'D'.repeat(22),
  issuedAt: EPOCH + HOUR * 100, expiresAt: EPOCH + HOUR * 100 + MINING_RULES.lifetimeMs,
  hour: 100, difficulty: MINING_RULES.difficulty, reward: 1 });

test('the search yields after a short slice, honours cancellation, and does not start another challenge', async () => {
  let clock = 0, stopped = false, calls = 0; const sleeps = [];
  const result = await searchMiningWork(sample(), { remainingMs: 1000, monotonic: () => clock, shouldStop: () => stopped,
    digest: async () => { calls++; clock += 2; return new Uint8Array(32).fill(255); },
    pause: async ms => { sleeps.push(ms); clock += ms; stopped = true; } });
  assert.equal(result.stopped, true); assert.equal(calls, 4); assert.deepEqual(sleeps, [40]);
  calls = 0;
  const solved = await searchMiningWork(sample(), { remainingMs: 1000, monotonic: () => 0,
    digest: async () => { calls++; return new Uint8Array(32); }, pause: async () => assert.fail('No work after a solution.') });
  assert.equal(solved.nonce, 0); assert.equal(calls, 1);
});

test('cancellation after an in-flight hash suppresses a result; expiry and batch bounds stop the search', async () => {
  let stopped = false;
  const result = await searchMiningWork(sample(), { remainingMs: 1000, monotonic: () => 0, shouldStop: () => stopped,
    digest: async () => { stopped = true; return new Uint8Array(32); } });
  assert.equal(result.stopped, true); assert.equal(result.nonce, undefined);
  let clock = 0, calls = 0; const sleeps = [];
  await assert.rejects(searchMiningWork(sample(), { remainingMs: 60, monotonic: () => clock,
    digest: async () => { calls++; return new Uint8Array(32).fill(255); }, pause: async ms => { sleeps.push(ms); clock += ms; } }), /expired/);
  assert.equal(calls, 256); assert.deepEqual(sleeps, [40, 40]);
  clock = 0;
  await assert.rejects(searchMiningWork(sample(), { remainingMs: 3, monotonic: () => clock,
    digest: async () => { clock = 4; return new Uint8Array(32); }, pause: async () => {} }), /expired/);
});
