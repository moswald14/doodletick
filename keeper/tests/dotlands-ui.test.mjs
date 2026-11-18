// SPDX-License-Identifier: GPL-3.0-only
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { newIdentity, sign, hash } from '../public/core.mjs';
import { DOTLANDS_FORMAT, verifyDotlandsRequest } from '../public/dotlands-protocol.mjs';
import { createDotlandsClient, dotlandsInvitation } from '../public/dotlands-ui.mjs';

async function fixture() {
  const keeper = await newIdentity('test-keeper'), alice = await newIdentity('test-alice'), bob = await newIdentity('test-bob');
  const values = new Map(), calls = [];
  const storage = { getItem: key => values.get(key) || null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) };
  const clock = { requestNow: () => Date.now(), snapshot: () => ({ issuer: keeper.fingerprint }), sync: async () => {} };
  const envelope = async record => ({ record, publicKey: keeper.publicKey, signature: await sign(record, keeper.privateKey) });
  const response = (data, status = 200) => ({ ok: status >= 200 && status < 300, status, text: async () => JSON.stringify(data) });
  const reply = async (proof, { data = { code: 'ABC234', revision: 1 }, error, status = 200, owner = proof.record.owner, requestId } = {}) => response(await envelope({ format: DOTLANDS_FORMAT, kind: 'response', issuer: keeper.fingerprint,
    owner, requestId: requestId || await hash(proof.record), time: Date.now(), ...(error ? { error, status } : { data }) }), status);
  let handler = async proof => reply(proof);
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    assert.equal(options.headers['X-Keeper-Request'], '1');
    assert.equal(options.credentials, 'same-origin');
    if (url === './api/dotlands/info') return response(await envelope({ format: DOTLANDS_FORMAT, kind: 'info', issuer: keeper.fingerprint, time: Date.now(), price: 1, currency: 'Doodle Coin' }));
    assert.equal(url, './api/dotlands/request');
    const proof = JSON.parse(options.body);
    assert.equal(await verifyDotlandsRequest(proof, keeper.fingerprint), true);
    return handler(proof, options);
  };
  const make = (who = alice) => { const client = createDotlandsClient({ clock, storage, fetchImpl }); client.unlock(who); return client; };
  return { keeper, alice, bob, values, calls, clock, storage, reply, make, setHandler: fn => { handler = fn; } };
}

test('lost paid admission keeps the exact signed request across reload and blocks a second admission', async () => {
  const f = await fixture(), first = f.make();
  let submitted;
  f.setHandler(async proof => { submitted = proof; assert.equal(f.values.size, 1); throw Error('Connection lost after commit'); });
  await assert.rejects(first.request('create', { name: f.alice.username, acceptPrice: 1 }), /Connection lost/);
  assert.equal(first.pending.operation, 'create');
  await assert.rejects(first.request('create', { acceptPrice: 1 }), /Retry your pending request/);
  const saved = [...f.values.values()][0];
  assert.equal(saved.includes('privateKey'), false);
  assert.equal(saved.includes(f.alice.privateKey.d), false);
  first.lock();
  const reloaded = f.make(); await reloaded.info();
  assert.equal(reloaded.pending.operation, 'create');
  f.setHandler(async proof => { assert.deepEqual(proof, submitted); return f.reply(proof); });
  assert.equal((await reloaded.retry()).code, 'ABC234');
  assert.equal(reloaded.pending, null); assert.equal(f.values.size, 0);
});

test('verified server failure preserves pending debit but a definitive insufficient-balance reply clears it', async () => {
  const f = await fixture(), client = f.make();
  f.setHandler(proof => f.reply(proof, { status: 503, error: 'Room storage is unavailable' }));
  await assert.rejects(client.request('join', { code: 'ABC234', acceptPrice: 1 }), error => error.status === 503);
  assert.equal(client.pending.operation, 'join'); assert.equal(f.values.size, 1);
  f.setHandler(proof => f.reply(proof, { status: 402, error: 'Not enough Doodle Coins' }));
  await assert.rejects(client.retry(), error => error.status === 402);
  assert.equal(client.pending, null); assert.equal(f.values.size, 0);
});

test('signed wrong request or identity replies cannot clear pending admissions', async () => {
  const f = await fixture(), client = f.make();
  f.setHandler(proof => f.reply(proof, { requestId: 'unrelated-request' }));
  await assert.rejects(client.request('create', { acceptPrice: 1 }), /did not verify/);
  f.setHandler(proof => f.reply(proof, { owner: f.bob.fingerprint }));
  await assert.rejects(client.retry(), /did not verify/);
  assert.equal(f.values.size, 1);
  const bob = f.make(f.bob); await bob.info(); assert.equal(bob.pending, null);
});

test('locking invalidates a response already in flight and preserves the recoverable request', async () => {
  const f = await fixture(), client = f.make();
  let release, entered;
  const started = new Promise(resolve => { entered = resolve; });
  f.setHandler((proof, options) => new Promise(resolve => { release = async () => resolve(await f.reply(proof)); entered(options.signal); }));
  const job = client.request('create', { acceptPrice: 1 });
  const signal = await started; client.lock(); assert.equal(signal.aborted, true);
  await release(); await assert.rejects(job, /Unlock your Keeper/);
  assert.equal(f.values.size, 1);
});

test('free snapshots do not persist payment intent and use the pinned Keeper issuer', async () => {
  const f = await fixture(), client = f.make();
  f.setHandler(proof => { assert.equal(proof.record.operation, 'snapshot'); assert.equal(proof.record.args.acceptPrice, undefined); return f.reply(proof); });
  await client.request('snapshot', { code: 'ABC234', knownRevision: 1 });
  assert.equal(f.values.size, 0);
  const wrong = await newIdentity('other-keeper'); f.clock.snapshot = () => ({ issuer: wrong.fingerprint });
  const other = f.make(); await assert.rejects(other.info(), /signature could not be verified/);
});

test('an unverifiable stored request blocks a new paid request, including after a failed refresh', async () => {
  const f = await fixture(), client = f.make();
  f.values.set('doodletick.dotlands.pending.v1:' + f.keeper.fingerprint + ':' + f.alice.fingerprint, '{broken');
  await assert.rejects(client.info(), /pending room request could not be verified/);
  await assert.rejects(client.request('create', { acceptPrice: 1 }), /pending room request could not be verified/);
  assert.equal(f.calls.some(call => call.url.endsWith('/request')), false);
});

test('invitations never expose ingress session paths or loopback addresses', () => {
  for (const href of ['http://localhost:8787/', 'http://127.0.0.1:8787/', 'http://[::1]:8787/', 'https://home.test/api/hassio_ingress/secret-session/', 'https://home.test/hassio/ingress/doodletick']) assert.equal(dotlandsInvitation(href, 'ABC234'), null);
  assert.equal(dotlandsInvitation('https://games.test/keeper/?old=value#garden', 'ABC234'), 'https://games.test/keeper/?dotlands=ABC234#dotlands');
});

async function bridge() {
  const script = await readFile(new URL('../public/dotlands-bridge.js', import.meta.url), 'utf8');
  const listeners = new Map(), sent = [], events = [];
  const parent = { postMessage: (value, origin) => sent.push({ value, origin }) };
  const sandbox = { parent, location: { origin: 'https://keeper.test' }, crypto, structuredClone, URL,
    setTimeout, clearTimeout, CustomEvent: class { constructor(type) { this.type = type; } },
    addEventListener: (name, callback) => listeners.set(name, callback), dispatchEvent: event => events.push(event.type) };
  sandbox.window = sandbox;
  vm.createContext(sandbox); vm.runInContext(script, sandbox);
  const deliver = (value, { source = parent, origin = 'https://keeper.test' } = {}) => listeners.get('message')({ source, origin, data: value });
  const answer = (request, data, options) => deliver({ channel: 'doodleverse-dotlands-frame-v1', type: 'reply', id: request.value.id, ok: true, data }, options);
  return { sandbox, sent, events, parent, deliver, answer, input: (type, event) => listeners.get(type)(event), stop: () => listeners.get('pagehide')() };
}

test('frame accepts only its same-origin parent, sends conditional reads, strips client battle amount, and idles', async () => {
  const b = await bridge();
  const snap = { code: 'ABC234', revision: 1, seat: 0, hostSeat: 0, phase: 'lobby', maxPlayers: 4, players: [{ name: 'Alice', seat: 0 }], state: null };
  const context = { snapshot: snap, name: 'Alice', invite: 'https://keeper.test/ingress/?dotlands=ABC234#dotlands' };
  const initial = b.sent[0];
  let ready = false; b.sandbox.DotlandsKeeper.ready.then(() => { ready = true; });
  b.answer(initial, context, { source: {} }); b.answer(initial, context, { origin: 'https://evil.test' });
  await Promise.resolve(); assert.equal(ready, false);
  b.answer(initial, context); await b.sandbox.DotlandsKeeper.ready;
  const session = await b.sandbox.DotlandsRoom.reconnect({ code: 'ABC234' });
  assert.equal(session.eventDriven, false); assert.equal(session.credentials.invite, context.invite);
  const polling = session.request('/rooms/ABC234');
  const read = b.sent.at(-1);
  assert.equal(read.value.operation, 'snapshot'); assert.equal(read.value.args.knownRevision, 1);
  b.answer(read, { unchanged: true, code: 'ABC234', seat: 0, revision: 1 });
  assert.deepEqual(await polling, snap);
  const acting = session.request('/rooms/ABC234/action', { expectedRevision: 1, type: 'move', from: '0,0', to: '0,1', amount: 999, name: 'Spoof' });
  const action = b.sent.at(-1); assert.equal(action.value.args.amount, undefined); assert.equal(action.value.args.name, undefined);
  b.answer(action, { ...snap, revision: 2 }); await acting;
  b.deliver({ channel: 'doodleverse-dotlands-frame-v1', type: 'visibility', visible: false });
  assert.equal(b.sandbox.DotlandsKeeper.paused, true); assert.ok(b.events.includes('dotlands-visibility'));
  const count = b.sent.length; await assert.rejects(session.snapshot(), /Return to Dotlands/); assert.equal(b.sent.length, count);
  b.deliver({ channel: 'doodleverse-dotlands-frame-v1', type: 'visibility', visible: true });
  session.close(); await assert.rejects(session.snapshot(), /Return to your saved room/);
  assert.equal(b.sent.length, count); b.stop();
});

test('frame cannot create a paid room or choose another saved seat', async () => {
  const b = await bridge();
  b.answer(b.sent[0], { snapshot: { code: 'ABC234', revision: 1, seat: 1 }, name: 'Alice', invite: 'https://keeper.test/?dotlands=ABC234' });
  await b.sandbox.DotlandsKeeper.ready;
  await assert.rejects(b.sandbox.DotlandsRoom.create({ name: 'Imposter' }), /above the game/);
  await assert.rejects(b.sandbox.DotlandsRoom.reconnect({ code: 'ZZZ234' }), /saved room list/);
  assert.equal(b.sent.length, 1); b.stop();
});

test('trusted user input keeps the vault active, while polling and synthetic input do not', async () => {
  const b = await bridge();
  b.answer(b.sent[0], { snapshot: null, name: 'Alice', invite: null }); await b.sandbox.DotlandsKeeper.ready;
  b.input('pointerdown', { isTrusted: false }); assert.equal(b.sent.length, 1);
  b.input('pointerdown', { isTrusted: true }); assert.equal(b.sent.at(-1).value.type, 'activity');
  b.input('keydown', { isTrusted: true }); assert.equal(b.sent.length, 2);
  b.deliver({ channel: 'doodleverse-dotlands-frame-v1', type: 'visibility', visible: false });
  b.input('pointerdown', { isTrusted: true }); assert.equal(b.sent.length, 2); b.stop();
});

test('saved game polls every five seconds and stops while hidden, outside its view, or offline', async () => {
  await import('../public/dotlands-engine.js');
  const elements = new Map(), timers = new Map(), events = new Map(); let nextTimer = 0;
  function element(id) {
    if (!elements.has(id)) elements.set(id, { hidden: ['welcome', 'game'].includes(id), value: id === 'country-count' ? '4' : '2', open: false, dataset: {}, style: { setProperty() {} },
      addEventListener() {}, setAttribute() {}, innerHTML: '', textContent: '' });
    return elements.get(id);
  }
  const context = { DotlandsEngine: globalThis.DotlandsEngine, DotlandsKeeper: { ready: Promise.resolve({ snapshot: null }), paused: false },
    document: { getElementById: element, querySelectorAll: () => [], addEventListener: (name, fn) => events.set(name, fn), hidden: false },
    navigator: { onLine: true }, localStorage: { getItem: () => null, setItem() {} },
    addEventListener: (name, fn) => events.set(name, fn),
    setTimeout: (fn, ms) => { timers.set(++nextTimer, { fn, ms }); return nextTimer; }, clearTimeout: id => timers.delete(id) };
  context.window = context;
  const source = (await readFile(new URL('../public/dotlands-app.js', import.meta.url), 'utf8')).replace(/\}\)\(\);\s*$/, "globalThis.pollTest={schedulePoll,connect(){online={code:'ABC234'};peerSession={eventDriven:false};}};})();");
  vm.createContext(context); vm.runInContext(source, context); await Promise.resolve();
  context.pollTest.connect(); context.pollTest.schedulePoll(); assert.equal([...timers.values()][0].ms, 5000);
  context.navigator.onLine = false; events.get('offline')(); assert.equal(timers.size, 0);
  context.pollTest.schedulePoll(); assert.equal(timers.size, 0);
  context.navigator.onLine = true; events.get('online')(); assert.equal([...timers.values()][0].ms, 50);
  context.document.hidden = true; events.get('visibilitychange')(); assert.equal(timers.size, 0);
  context.document.hidden = false; events.get('visibilitychange')(); assert.equal([...timers.values()][0].ms, 50);
  context.DotlandsKeeper.paused = true; events.get('dotlands-visibility')(); assert.equal(timers.size, 0);
  context.pollTest.schedulePoll(); assert.equal(timers.size, 0);
});
