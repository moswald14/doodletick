import test from 'node:test';
import assert from 'node:assert/strict';
import { createShelfIdleClient } from '../public/shelf-idle-client.mjs';
const state = (revision = 0, cookies = 0) => ({ available: true, revision, game: { schema: 'shelfdefense_idle.v1', cookies, last_update: 100 + revision, shelves: [] } });
const response = (value, status = 200) => ({ ok: status >= 200 && status < 300, status, async json() { return value; } });

test('a lost committed reply retries the exact envelope without double-crediting taps', async () => {
  const requests = []; let mutations = 0, latest;
  const client = createShelfIdleClient({ requestId: () => 'one-request-identifier', onState: s => { latest = s; }, fetcher: async (url, options) => {
    if (!options.body) return response(state());
    requests.push(JSON.parse(options.body)); mutations++;
    assert.equal(options.headers['X-Keeper-Request'], '1'); assert.equal(options.credentials, 'same-origin');
    if (mutations === 1) throw TypeError('Connection lost after commit');
    return response({ ...state(1, 10), replayed: true });
  } });
  await client.action('tap', { count: 10 });
  assert.equal(requests.length, 2); assert.deepEqual(requests[1], requests[0]);
  assert.equal(latest.game.cookies, 10); assert.equal(latest.revision, 1); client.close();
});

test('a shared-game conflict refreshes without silently retrying a purchase', async () => {
  let reads = 0, actions = 0, latest;
  const client = createShelfIdleClient({ requestId: () => 'conflict-request-identifier', onState: s => { latest = s; }, fetcher: async (url, options) => {
    if (!options.body) return response(++reads === 1 ? state(1, 15) : state(2, 0));
    actions++; return response({ error: 'The shared shelf changed.' }, 409);
  } });
  await assert.rejects(client.action('buy', { worker: 'pencil', shelf: 'reading', quantity: 1 }), /shared shelf changed/);
  assert.equal(actions, 1); assert.equal(reads, 2); assert.equal(latest.revision, 2); client.close();
});

test('simultaneous taps use the revision acknowledged by the preceding action', async () => {
  let revision = 0, id = 0; const inputs = [];
  const client = createShelfIdleClient({ requestId: () => `numbered-request-${++id}`, fetcher: async (url, options) => {
    if (!options.body) return response(state(revision));
    const request = JSON.parse(options.body); inputs.push(request); assert.equal(request.expectedRevision, revision);
    return response(state(++revision, revision));
  } });
  await Promise.all([client.action('tap', { count: 1 }), client.action('tap', { count: 1 })]);
  assert.deepEqual(inputs.map(value => value.expectedRevision), [0, 1]); assert.notEqual(inputs[0].requestId, inputs[1].requestId); client.close();
});

test('unreadable login responses do not replace game state or cause mutation retries', async () => {
  let actions = 0, latest;
  const client = createShelfIdleClient({ requestId: () => 'unreadable-request-identifier', onState: value => { latest = value; }, fetcher: async (url, options) => {
    if (!options.body) return response(state());
    actions++; return { ok: true, status: 200, async json() { throw Error('HTML'); } };
  } });
  await assert.rejects(client.action('tap', { count: 1 }), /reopen/i);
  assert.equal(actions, 1); assert.equal(latest.game.cookies, 0); client.close();
});

test('page close aborts in-flight work and prevents another retry', async () => {
  let actions = 0, aborted = false, started;
  const start = new Promise(resolve => { started = resolve; });
  const client = createShelfIdleClient({ requestId: () => 'closing-request-identifier', fetcher: async (url, options) => {
    if (!options.body) return response(state());
    actions++; started();
    return new Promise((resolve, reject) => options.signal.addEventListener('abort', () => { aborted = true; reject(Error('aborted')); }));
  } });
  const running = client.action('tap', { count: 1 }); await start; client.close();
  await assert.rejects(running, /aborted/); assert.equal(actions, 1); assert.equal(aborted, true);
  await assert.rejects(client.refresh(), /closed/);
});
