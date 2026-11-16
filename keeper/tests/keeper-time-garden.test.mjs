// SPDX-License-Identifier: GPL-3.0-only
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { newIdentity, EPOCH, b64, sign, hash } from '../public/core.mjs';
import { gardenRequest, verifyGardenResponse, HOUR } from '../public/mushroom-core.mjs';
import { createKeeperClock, KEEPER_TIME_FORMAT } from '../public/keeper-clock.mjs';
import { createGardenLedger } from '../garden-ledger.mjs';

test('verified Keeper time repairs 48-hour client skew without bypassing expiry, issuer checks or duplicate mint protection', async () => {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), 'doodle-time-garden-'));
  const keeper = await newIdentity('time_keeper'), player = await newIdentity('sleep_gardener'), wrongKeeper = await newIdentity('other_keeper');
  let elapsed = 0, serverTime = EPOCH + 100 * HOUR, nonceId = 0, requestCount = 0;
  const deviceTime = () => serverTime + 48 * HOUR;
  const advance = ms => { elapsed += ms; serverTime += ms; };
  const ledger = await createGardenLedger({ dataDir, identity: keeper, now: () => serverTime });
  const json = value => ({ ok: true, text: async () => JSON.stringify(value) });
  const clock = createKeeperClock({ monotonicNow: () => elapsed, wallNow: deviceTime,
    randomNonce: () => b64(new Uint8Array(16).fill(++nonceId)),
    fetchImpl: async url => {
      if (url === './api/status') return json({ fingerprint: keeper.fingerprint, publicKey: keeper.publicKey });
      const nonce = new URL(url, 'https://fixture.invalid/keeper/').searchParams.get('nonce');
      advance(10);
      const record = { format: KEEPER_TIME_FORMAT, issuer: keeper.fingerprint, nonce, receivedAt: serverTime, sentAt: serverTime };
      advance(10);
      return json({ record, publicKey: keeper.publicKey, signature: await sign(record, keeper.privateKey) });
    }
  });
  // This is the same order as the application: check time and matching Keeper
  // before constructing a signed action. It never substitutes device time.
  const freshRequest = async (action, args, sequence, issuer = keeper.fingerprint) => {
    const timestamp = clock.requestNow();
    if (clock.snapshot().issuer !== issuer) throw Error('Time and garden Keeper do not match.');
    requestCount++;
    return gardenRequest(player, issuer, action, args, sequence, timestamp);
  };
  const account = async () => (await ledger.dispatch(await freshRequest('account', {}, 0), true)).record;
  try {
    const skewed = await gardenRequest(player, keeper.fingerprint, 'join', {}, 1, deviceTime());
    await assert.rejects(ledger.dispatch(skewed), error => error.status === 409 && /expired/i.test(error.message));
    assert.equal((await clock.sync()).state, 'synced');
    assert.equal(clock.requestNow(), serverTime);
    assert.equal(clock.snapshot().offsetMs, -48 * HOUR);
    const joinedProof = await freshRequest('join', {}, 1), joined = await ledger.dispatch(joinedProof);
    assert.equal(await verifyGardenResponse(joined, keeper.fingerprint, await hash(joinedProof.record)), true);
    assert.equal((await account()).joined, true);

    await ledger.dispatch(await freshRequest('plant', {
      recipe: { kind: 'dot-mushroom', version: 1, name: 'Quiet test mushroom', settings: { seed: 773, static: .1 }, patch: null },
      credit: 'Disposable test creator', rightsConfirmed: true
    }, 2));
    advance(2 * HOUR);
    const requestsBeforeStale = requestCount;
    await assert.rejects(freshRequest('harvest', {}, 3), /Sync the Keeper clock/);
    assert.equal(requestCount, requestsBeforeStale, 'No new signed request is constructed from stale time.');
    await clock.sync();
    assert.equal((await account()).pending, 1, 'Only the completed owned UTC hour is eligible.');

    const harvestProof = await freshRequest('harvest', {}, 3);
    const [first, duplicate] = await Promise.all([ledger.dispatch(harvestProof), ledger.dispatch(harvestProof)]);
    assert.deepEqual(first, duplicate);
    assert.equal(first.record.result.earned, 1);
    assert.equal(await verifyGardenResponse(first, keeper.fingerprint, await hash(harvestProof.record)), true);
    assert.equal((await account()).balance, 1);
    assert.equal((await account()).pending, 0);

    // Fresh time cannot make a signature valid for a different garden.
    await assert.rejects(freshRequest('harvest', {}, 4, wrongKeeper.fingerprint), /do not match/);
    const wrongIssuerProof = await gardenRequest(player, wrongKeeper.fingerprint, 'harvest', {}, 4, clock.requestNow());
    await assert.rejects(ledger.dispatch(wrongIssuerProof), error => error.status === 403 && /identity|signature/i.test(error.message));
    assert.equal((await account()).balance, 1);
    const future = await gardenRequest(player, keeper.fingerprint, 'harvest', {}, 4, clock.requestNow() + 300001);
    await assert.rejects(ledger.dispatch(future), error => error.status === 409 && /expired/i.test(error.message));

    // Exact retries stay idempotent after expiry, while new requests remain
    // blocked until time is refreshed; this preserves uncertain-outcome recovery.
    advance(300001);
    assert.deepEqual(await ledger.dispatch(harvestProof), first);
    await assert.rejects(freshRequest('harvest', {}, 4), /Sync the Keeper clock/);
    await clock.sync(); assert.equal((await account()).balance, 1);
  } finally {
    clock.stop(); await ledger.idle();
    assert.equal(path.dirname(path.resolve(dataDir)), path.resolve(os.tmpdir()));
    assert.ok(path.basename(dataDir).startsWith('doodle-time-garden-'));
    await rm(dataDir, { recursive: true, force: true });
  }
});
