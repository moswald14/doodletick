// SPDX-License-Identifier: GPL-3.0-only
import test from 'node:test';
import assert from 'node:assert/strict';
import { newIdentity, sign, b64 } from '../public/core.mjs';
import { createKeeperClock, verifyTimeSample, KEEPER_TIME_FORMAT } from '../public/keeper-clock.mjs';

const UTC = Date.UTC(2026, 10, 16, 12);
const owner = await newIdentity('clock_fixture');
const other = await newIdentity('other_clock');
const publicOwner = { fingerprint: owner.fingerprint, publicKey: owner.publicKey };
const nonce = b64(new Uint8Array(16).fill(4));
const response = value => ({ ok: true, async text() { return JSON.stringify(value); } });
async function envelope(n = nonce, changes = {}, identity = owner) {
  const record = { format: KEEPER_TIME_FORMAT, nonce: n, issuer: identity.fingerprint, receivedAt: UTC + 10, sentAt: UTC + 10, ...changes };
  return { record, publicKey: identity.publicKey, signature: await sign(record, identity.privateKey) };
}
function deferred() { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; }
function fixture({ wallOffset = 0, roundTrips = [100, 20, 60], fetchOverride, onChange = () => {} } = {}) {
  let mono = 1000, wall = UTC + mono + wallOffset, serverOffset = 0, count = 0, challenge = 0;
  const calls = [], timers = new Map(); let timerId = 0;
  const advance = ms => { mono += ms; wall += ms; };
  const clock = createKeeperClock({ monotonicNow: () => mono, wallNow: () => wall, onChange,
    randomNonce: () => b64(new Uint8Array(16).fill(++challenge)),
    setTimer(fn) { const id = ++timerId; timers.set(id, fn); return id; }, clearTimer(id) { timers.delete(id); },
    async fetchImpl(url, options) {
      calls.push({ url, options });
      const override = await fetchOverride?.(url, options);
      if (override) return override;
      if (url === './api/status') return response(publicOwner);
      const n = new URL(url, 'https://keeper.invalid/base/').searchParams.get('nonce');
      const rtt = roundTrips[count++ % roundTrips.length], midpoint = Math.round(UTC + mono + serverOffset + rtt / 2);
      advance(rtt);
      return response(await envelope(n, { receivedAt: midpoint, sentAt: midpoint }));
    }
  });
  return { clock, calls, timers, advance, mono: () => mono, now: () => UTC + mono + serverOffset,
    wallJump(ms) { wall += ms; }, serverJump(ms) { serverOffset += ms; }, sleep(ms) { wall += ms; },
    fireTimers() { for (const [id, fn] of [...timers]) { timers.delete(id); fn(); } } };
}

test('a badly skewed device clock syncs with fresh signed midpoint samples and chooses least jitter', async () => {
  const f = fixture({ wallOffset: 48 * 3600000 });
  assert.equal(f.clock.snapshot().state, 'unsynced'); assert.throws(() => f.clock.requestNow(), /Sync/);
  const state = await f.clock.sync();
  assert.equal(state.state, 'synced'); assert.equal(state.issuer, owner.fingerprint);
  assert.equal(state.rttMs, 20); assert.equal(state.ageMs, 60); assert.equal(state.uncertaintyMs, 13);
  assert.equal(state.keeperNow, f.now()); assert.equal(state.now, f.now());
  assert.equal(state.offsetMs, -48 * 3600000);
  const challenges = f.calls.filter(c => c.url.startsWith('./api/time'));
  assert.equal(challenges.length, 3); assert.equal(new Set(challenges.map(c => c.url)).size, 3);
  assert.ok(f.calls.every(c => c.options.cache === 'no-store' && c.options.credentials === 'same-origin' && c.options.redirect === 'error'));
  f.advance(60000); assert.equal(f.clock.requestNow(), f.now()); assert.equal(f.clock.snapshot().uncertaintyMs, 19);
  assert.equal(f.timers.size, 0); f.clock.stop();
});

test('sample verification refuses nonce replay, changed identity, tampering, malformed times and slow replies', async () => {
  const original = await envelope();
  const opts = { nonce, keeper: publicOwner, started: 0, ended: 20 };
  assert.equal((await verifyTimeSample(original, opts)).server, UTC + 20);
  await assert.rejects(verifyTimeSample(original, { ...opts, nonce: b64(new Uint8Array(16).fill(9)) }), /verify/);
  await assert.rejects(verifyTimeSample(await envelope(nonce, {}, other), opts), /verify/);
  const tampered = structuredClone(original); tampered.record.sentAt++;
  await assert.rejects(verifyTimeSample(tampered, opts), /verify/);
  for (const change of [{ receivedAt: null }, { sentAt: Infinity }, { sentAt: UTC }, { sentAt: UTC + 9999 }, { receivedAt: -1 }]) {
    await assert.rejects(verifyTimeSample(await envelope(nonce, change), opts), /verify/);
  }
  await assert.rejects(verifyTimeSample(original, { ...opts, ended: 2001 }), /slow/);
  await assert.rejects(verifyTimeSample(original, { ...opts, ended: -1 }), /slow/);
  await assert.rejects(verifyTimeSample(original, { ...opts, ended: NaN }), /slow/);
});

test('stale samples do not authorize actions; an offline display can keep moving', async () => {
  const f = fixture(); await f.clock.sync(); const before = f.clock.now();
  f.advance(120001);
  const stale = f.clock.snapshot(); assert.equal(stale.state, 'stale'); assert.equal(stale.fresh, false);
  assert.ok(stale.now > before); assert.throws(() => f.clock.requestNow(), /Sync/);
  assert.equal((await f.clock.sync()).state, 'synced'); assert.equal(f.clock.requestNow(), f.now()); f.clock.stop();
});

test('wall-clock changes and system sleep invalidate signed time without reversing the color clock', async () => {
  const f = fixture(); await f.clock.sync(); const before = f.clock.now();
  f.wallJump(-3600000); f.advance(1000);
  assert.equal(f.clock.snapshot().state, 'clock-changed'); assert.ok(f.clock.now() >= before);
  assert.throws(() => f.clock.requestNow(), /Sync/);
  await f.clock.sync(); assert.equal(f.clock.requestNow(), f.now());
  f.sleep(8 * 3600000); assert.equal(f.clock.snapshot().state, 'clock-changed');
  assert.throws(() => f.clock.requestNow(), /Sync/); f.clock.stop();
});

test('small backward corrections slew the display and use fresh raw time only for signing', async () => {
  const f = fixture(); await f.clock.sync(); const before = f.clock.now();
  f.advance(1000); f.serverJump(-500); await f.clock.sync();
  assert.equal(f.clock.snapshot().state, 'synced'); assert.equal(f.clock.requestNow(), f.now());
  let previous = before;
  for (let i = 0; i < 20; i++) { f.advance(250); const shown = f.clock.now(); assert.ok(shown >= previous); previous = shown; }
  assert.ok(Math.abs(f.clock.now() - f.now()) <= 1); f.clock.stop();
});

test('a large Keeper correction needs a second coherent burst before signing', async () => {
  const f = fixture(); await f.clock.sync(); const before = f.clock.now();
  f.serverJump(-60000);
  const changed = await f.clock.sync(); assert.equal(changed.state, 'clock-changed'); assert.equal(changed.fresh, false);
  assert.throws(() => f.clock.requestNow(), /Sync/); assert.ok(f.clock.now() >= before);
  const confirmed = await f.clock.sync();
  assert.equal(confirmed.state, 'synced'); assert.equal(f.clock.requestNow(), f.now());
  assert.equal(confirmed.now, confirmed.keeperNow); assert.ok(confirmed.now < before);
  assert.ok(confirmed.lastCorrectionMs < -59000); assert.equal(confirmed.lastCorrectionAgeMs, 0);
  assert.match(confirmed.message, /corrected backward after confirmation/); f.clock.stop();
});

test('waking after eight hours with paused elapsed time reanchors to confirmed Keeper time immediately', async () => {
  const f = fixture(); await f.clock.sync(); const before = f.clock.now();
  const sleptMs = 8 * 3600000;
  f.sleep(sleptMs); f.serverJump(sleptMs); // Only wall and server clocks advanced.
  assert.equal(f.clock.snapshot().state, 'clock-changed'); assert.throws(() => f.clock.requestNow(), /Sync/);
  const firstBurst = await f.clock.sync(); assert.equal(firstBurst.fresh, false);
  assert.equal(firstBurst.state, 'clock-changed'); assert.throws(() => f.clock.requestNow(), /Sync/);
  const confirmed = await f.clock.sync();
  assert.equal(confirmed.state, 'synced'); assert.equal(confirmed.now, f.now());
  assert.equal(confirmed.keeperNow, f.now()); assert.equal(f.clock.requestNow(), f.now());
  assert.equal(confirmed.correctionMs, 0); assert.equal(confirmed.lastCorrectionMs, sleptMs);
  assert.ok(confirmed.now >= before + sleptMs); assert.match(confirmed.message, /corrected forward after confirmation/);
  f.advance(60000); assert.equal(f.clock.now(), f.now()); f.clock.stop();
});

test('a confirmed hours-long backward correction reanchors without weakening freshness or hiding the correction', async () => {
  const f = fixture(); await f.clock.sync(); const before = f.clock.now();
  f.serverJump(-2 * 3600000);
  assert.equal((await f.clock.sync()).fresh, false); assert.throws(() => f.clock.requestNow(), /Sync/);
  const confirmed = await f.clock.sync();
  assert.equal(confirmed.now, f.now()); assert.equal(confirmed.keeperNow, f.now());
  assert.ok(confirmed.now < before - 3600000); assert.equal(confirmed.correctionMs, 0);
  assert.equal(confirmed.lastCorrectionMs, -2 * 3600000); assert.equal(confirmed.lastCorrectionAgeMs, 0);
  assert.match(confirmed.message, /corrected backward/);
  f.advance(1000); assert.equal(f.clock.now(), f.now()); assert.equal(f.clock.snapshot().lastCorrectionAgeMs, 1000);
  f.advance(120000); assert.equal(f.clock.snapshot().fresh, false); assert.throws(() => f.clock.requestNow(), /Sync/);
  f.clock.stop();
});

test('a single nonce-bound but inconsistent sample cannot update the clock', async () => {
  let seen = 0;
  const f = fixture({ fetchOverride: async url => {
    if (!url.includes('/api/time')) return;
    seen++;
    if (seen === 2) return response(await envelope(new URL(url, 'https://keeper.invalid').searchParams.get('nonce'), { receivedAt: UTC + 8000, sentAt: UTC + 8000 }));
  } });
  const state = await f.clock.sync(); assert.equal(state.fresh, false); assert.match(state.error, /disagree/);
  assert.throws(() => f.clock.requestNow(), /Sync/); f.clock.stop();
});

test('changing the Keeper identity, repeated random nonce and oversized response fail closed', async () => {
  let replace = false;
  const f = fixture({ fetchOverride: async url => replace && url === './api/status' ? response({ fingerprint: other.fingerprint, publicKey: other.publicKey }) : null });
  await f.clock.sync(); replace = true;
  assert.match((await f.clock.sync()).error, /identity changed/); assert.throws(() => f.clock.requestNow(), /Sync/); f.clock.stop();
  const repeated = createKeeperClock({ randomNonce: () => nonce, fetchImpl: async url => url === './api/status' ? response(publicOwner) : response(await envelope()) });
  assert.match((await repeated.sync()).error, /fresh clock challenge/); repeated.stop();
  const large = fixture({ fetchOverride: async () => ({ ok: true, async text() { return 'x'.repeat(8193); } }) });
  assert.match((await large.clock.sync()).error, /too large/); large.clock.stop();
});

test('stop or resume invalidation cancels pending work and late answers cannot restore authority', async () => {
  const gate = deferred(); let entered = false, signal;
  const f = fixture({ fetchOverride: async (url, options) => {
    if (url.includes('/api/time')) { entered = true; signal = options.signal; return gate.promise; }
  } });
  const sync = f.clock.sync();
  while (!entered) await new Promise(resolve => setImmediate(resolve));
  f.clock.invalidate(); assert.equal(signal.aborted, true);
  gate.resolve(response(await envelope())); await sync;
  assert.equal(f.clock.snapshot().fresh, false); assert.throws(() => f.clock.requestNow(), /Sync/);
  assert.equal(f.timers.size, 0); f.clock.stop(); assert.equal((await f.clock.sync()).state, 'unsynced');
});

test('request deadline settles even if a broken fetch ignores cancellation', async () => {
  const f = fixture({ fetchOverride: () => new Promise(() => {}) });
  const work = f.clock.sync(); await new Promise(resolve => setImmediate(resolve)); f.fireTimers();
  const state = await work; assert.equal(state.fresh, false); assert.match(state.error, /timed out/);
  assert.equal(f.timers.size, 0); f.clock.stop();
});
