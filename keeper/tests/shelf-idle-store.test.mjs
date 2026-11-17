import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm, rename, mkdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createShelfIdleStore } from '../shelf-idle-store.mjs';

async function fixture(t) {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), 'keeper-shelf-test-'));
  let clock = 1000000, sequence = 0;
  const stores = [];
  t.after(async () => { for (const store of stores) await store.close().catch(() => {}); await rm(dataDir, { recursive: true, force: true }); });
  const open = async (options = {}) => { const store = await createShelfIdleStore({ dataDir, now: () => clock, checkpointMs: 0, ...options }); stores.push(store); return store; };
  const request = (action, fields = {}, revision = 0) => ({ requestId: `test-request-${String(++sequence).padStart(8, '0')}`, expectedRevision: revision, action, ...fields });
  return { dataDir, file: path.join(dataDir, 'shelf-idle.json'), open, request, advance(seconds) { clock += seconds * 1000; }, setTime(seconds) { clock = seconds * 1000; } };
}
const act = async (f, store, action, fields) => store.action(f.request(action, fields, (await store.status()).revision));

test('idle progress is shared, status is read-only, restart catch-up is capped and not repeated', async t => {
  const f = await fixture(t), store = await f.open();
  await act(f, store, 'tap', { count: 15 });
  await act(f, store, 'buy', { worker: 'pencil', shelf: 'reading', quantity: 1 });
  const before = await readFile(f.file, 'utf8');
  f.advance(3600);
  assert.equal((await store.status()).game.cookies, 360);
  assert.equal((await store.status()).game.cookies, 360);
  assert.equal(await readFile(f.file, 'utf8'), before, 'GET-equivalent reads must not write');
  await store.close();
  f.advance(48 * 3600);
  const resumed = await f.open(), state = await resumed.status();
  assert.equal(state.game.cookies, 9000);
  assert.equal(state.game.offline_earned, 8640);
  await resumed.close();
  const again = await f.open();
  assert.equal((await again.status()).game.cookies, 9000);
  assert.equal((await again.status()).game.offline_earned, 0);
});

test('checkpoints preserve more than 24 hours of production while Keeper stays running', async t => {
  const f = await fixture(t), store = await f.open();
  await act(f, store, 'tap', { count: 15 });
  await act(f, store, 'buy', { worker: 'pencil', shelf: 'reading', quantity: 1 });
  for (let i = 0; i < 12; i++) { f.advance(6 * 3600); await store.checkpoint(); }
  const result = await store.status();
  assert.equal(result.game.cookies, 72 * 3600 * .1);
  assert.equal(result.revision, 2, 'passive checkpoints must not conflict with user actions');
});

test('the background checkpoint runs with no dashboard reads', async t => {
  const f = await fixture(t), store = await f.open({ checkpointMs: 10 });
  await act(f, store, 'tap', { count: 15 });
  await act(f, store, 'buy', { worker: 'pencil', shelf: 'reading', quantity: 1 });
  f.advance(60);
  await new Promise(resolve => setTimeout(resolve, 40));
  await store.idle();
  assert.equal(JSON.parse(await readFile(f.file, 'utf8')).game.cookies, 6);
});

test('clock rollback does not repeat an earning interval across actions and restart', async t => {
  const f = await fixture(t), store = await f.open();
  await act(f, store, 'tap', { count: 30 });
  await act(f, store, 'buy', { worker: 'pencil', shelf: 'reading', quantity: 1 });
  f.advance(100); await store.checkpoint();
  assert.equal((await store.status()).game.cookies, 25);
  f.advance(-50); await act(f, store, 'tap', { count: 1 });
  assert.equal((await store.status()).game.cookies, 26);
  await store.close();
  const resumed = await f.open();
  assert.equal((await resumed.status()).game.cookies, 26);
  f.advance(100);
  assert.equal((await resumed.status()).game.cookies, 31);
});

test('concurrent actions serialize and request replay never grants another action', async t => {
  const f = await fixture(t), store = await f.open();
  const first = f.request('tap', { count: 10 }), other = f.request('tap', { count: 20 });
  const result = await Promise.allSettled([store.action(first), store.action(other)]);
  assert.equal(result[0].status, 'fulfilled');
  assert.equal(result[1].reason.status, 409);
  assert.equal((await store.action(first)).replayed, true);
  assert.equal((await store.status()).game.cookies, 10);
  await assert.rejects(store.action({ ...first, count: 11 }), error => error.status === 409);
  await store.close();
  const resumed = await f.open();
  assert.equal((await resumed.action(first)).replayed, true);
  assert.equal((await resumed.status()).game.cookies, 10);
});

test('an evicted request receipt remains blocked by its stale revision', async t => {
  const f = await fixture(t), store = await f.open(), first = f.request('tap', { count: 1 });
  await store.action(first);
  for (let i = 0; i < 256; i++) await store.action(f.request('claim', {}, i + 1));
  assert.equal(JSON.parse(await readFile(f.file, 'utf8')).receipts.length, 256);
  await assert.rejects(store.action(first), error => error.status === 409);
  assert.equal((await store.status()).game.cookies, 1);
});

test('invalid, forged and unaffordable requests do not change the saved game', async t => {
  const f = await fixture(t), store = await f.open(), before = await readFile(f.file, 'utf8');
  const bad = [f.request('tap', { count: 51 }), f.request('buy', { worker: '__proto__', shelf: 'reading', quantity: 1 }), f.request('tap', { count: 1, now: 99999999999 }), f.request('claim', { cookies: 90000 }), f.request('prestige', { confirm: false }), f.request('buy', { worker: 'lamp', shelf: 'reading', quantity: 1 }), { ...f.request('tap', { count: 1 }), requestId: 1234567890123456 }];
  for (const request of bad) await assert.rejects(store.action(request), error => error.status === 400);
  assert.equal(await readFile(f.file, 'utf8'), before);
  assert.equal((await store.status()).revision, 0);
});

test('a corrupt game fails closed without overwriting its bytes', async t => {
  const f = await fixture(t), raw = '{not the saved game'; await writeFile(f.file, raw);
  const store = await f.open();
  await assert.rejects(store.status(), error => error.status === 503 && error.code === 'SHELF_STORAGE');
  await assert.rejects(store.action(f.request('tap', { count: 1 })), error => error.status === 503);
  await store.close();
  assert.equal(await readFile(f.file, 'utf8'), raw);
});

test('missing or null nested game data cannot silently create a fresh shelf', async t => {
  const f = await fixture(t);
  for (const game of [undefined, null]) {
    const raw = JSON.stringify({ format: 'shelfdefense-keeper/v1', revision: 5, receipts: [], ...(game === undefined ? {} : { game }) });
    await writeFile(f.file, raw);
    const store = await f.open();
    await assert.rejects(store.status(), error => error.status === 503 && error.code === 'SHELF_STORAGE');
    await store.close();
    assert.equal(await readFile(f.file, 'utf8'), raw);
  }
});

test('a failed atomic write never acknowledges new game progress', async t => {
  const f = await fixture(t), store = await f.open(), original = await readFile(f.file, 'utf8');
  await rename(f.file, f.file + '.saved'); await mkdir(f.file);
  await assert.rejects(store.action(f.request('tap', { count: 10 })), error => error.code === 'SHELF_STORAGE');
  await assert.rejects(store.status(), error => error.status === 503);
  assert.equal(await readFile(f.file + '.saved', 'utf8'), original);
});

test('directory flush failure does not acknowledge a write and retained replay receipts prevent double credit', async t => {
  const f = await fixture(t); let failFlush = false, flushes = 0;
  const store = await f.open({ syncDirectory: async directory => { assert.equal(directory, f.dataDir); flushes++; if (failFlush) throw Error('simulated directory flush failure'); } });
  assert.equal(flushes, 1, 'initial creation flushes its directory too');
  failFlush = true;
  const request = f.request('tap', { count: 10 });
  await assert.rejects(store.action(request), error => error.code === 'SHELF_STORAGE');
  await assert.rejects(store.status(), error => error.code === 'SHELF_STORAGE');
  assert.equal(flushes, 2);
  await store.close();
  // In this injected failure, rename was visible but not acknowledged durable.
  // If those bytes survive restart, the exact retry must still be a no-op.
  const resumed = await f.open();
  assert.equal((await resumed.action(request)).replayed, true);
  assert.equal((await resumed.status()).game.cookies, 10);
});
