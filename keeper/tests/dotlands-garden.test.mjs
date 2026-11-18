import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { newIdentity, EPOCH } from '../public/core.mjs';
import { gardenRequest, HOUR, recipe } from '../public/mushroom-core.mjs';
import { dotlandsRequest } from '../public/dotlands-protocol.mjs';
import { createGardenLedger } from '../garden-ledger.mjs';

async function fixture(t, options = {}) {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), 'dotlands-fee-'));
  const identity = await newIdentity('test_keeper'), player = await newIdentity('test_player');
  let time = EPOCH + 100 * HOUR, ledger;
  const open = async extra => ledger = await createGardenLedger({ dataDir, identity, now: () => time, ...extra });
  await open(options);
  t.after(async () => { await ledger.idle(); await rm(dataDir, { recursive: true, force: true }); });
  const account = async () => (await ledger.dispatch(await gardenRequest(player, identity.fingerprint, 'account', {}, 0, time), true)).record;
  const act = async (action, args = {}) => ledger.dispatch(await gardenRequest(player, identity.fingerprint, action, args, (await account()).sequence + 1, time));
  await act('join');
  await act('plant', { recipe: recipe({ kind:'dot-mushroom',version:1,name:'Fee test',settings:{seed:138},patch:null }), credit:'Test fixture',rightsConfirmed:true });
  const entry = async (room = 'ABC234', acceptPrice = 1) => ({owner:player.fingerprint, room, price:1, proof:await dotlandsRequest(player,identity.fingerprint,'join',{code:room,acceptPrice},time)});
  return { identity, player, account, act, entry, open, advance(hours) { time += hours * HOUR; }, get ledger() { return ledger; } };
}

test('room entry settles earned coins and charges once across concurrent joins, later spending and restart', async t => {
  const f = await fixture(t); f.advance(4);
  const request = await f.entry();
  const receipts = await Promise.all([f.ledger.chargeArcadeAdmission(request), f.ledger.chargeArcadeAdmission(request)]);
  assert.deepEqual(receipts[0],receipts[1]); assert.equal((await f.account()).balance,3);
  await f.ledger.chargeArcadeAdmission(await f.entry('DEF234')); assert.equal((await f.account()).balance,2);
  await f.open();
  assert.deepEqual(await f.ledger.chargeArcadeAdmission(await f.entry()),receipts[0]);
  assert.equal((await f.account()).balance,2);
  assert.equal((await f.account()).history.filter(e=>e.record.result.action==='arcade-admission').length,2);
});

test('insufficient coins and mismatched signed fee permissions never mutate the balance', async t => {
  const f = await fixture(t);
  const before = await f.account();
  await assert.rejects(f.ledger.chargeArcadeAdmission(await f.entry()),{status:402});
  assert.equal((await f.account()).sequence,before.sequence);
  f.advance(2);
  for (const mutate of [r=>r.price=2,r=>r.room='DEF234',r=>r.owner='wrong',r=>r.proof.signature='tampered']) {
    const request = await f.entry(); mutate(request);
    await assert.rejects(f.ledger.chargeArcadeAdmission(request),{status:403});
  }
  await assert.rejects(f.ledger.chargeArcadeAdmission(await f.entry('ABC234',0)),{status:403});
  assert.equal((await f.account()).pending,2); assert.equal((await f.account()).balance,0);
});

test('failed ledger writes roll back fees and a successful retry debits exactly once', async t => {
  let reject = false;
  const f = await fixture(t, { writeSnapshot: async () => { if (reject) throw Error('disk unavailable'); } });
  f.advance(1); reject = true;
  const request = await f.entry();
  await assert.rejects(f.ledger.chargeArcadeAdmission(request),/disk unavailable/);
  assert.equal((await f.account()).pending,1); assert.equal((await f.account()).balance,0);
  reject = false; await f.ledger.chargeArcadeAdmission(request);
  assert.equal((await f.account()).balance,0); assert.equal((await f.account()).pending,0);
  assert.equal((await f.account()).history.filter(e=>e.record.result.action==='arcade-admission').length,1);
});
