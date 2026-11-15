import test from 'node:test';
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { browserSecurity, networkView, createConnectionController } from '../public/ha.mjs';
const ready = { mode: 'local-direct', ready: true, directory: 'this-keeper' };
const response = value => ({ ok: true, json: async () => value });

test('HTTPS readiness checks the browser secure context and crypto independently of peer transport', () => {
  assert.equal(browserSecurity({ isSecureContext: false, crypto: webcrypto, protocol: 'http:' }).state, 'https-needed');
  const embedded = browserSecurity({ isSecureContext: false, crypto: webcrypto, protocol: 'https:' });
  assert.equal(embedded.ready, false); assert.match(embedded.message, /whole Home Assistant page/);
  assert.equal(browserSecurity({ isSecureContext: true, crypto: {}, protocol: 'https:' }).state, 'crypto-unavailable');
  assert.equal(browserSecurity({ isSecureContext: true, crypto: webcrypto, protocol: 'https:' }).ready, true);
  assert.equal(networkView(ready).state, 'ready');
});
test('status requires local-direct mode and does not claim a connected peer or Internet relay', () => {
  assert.match(networkView(ready).message, /no Internet relay/);
  assert.match(networkView(ready).message, /signed invitation and answer/);
  assert.equal(networkView({ ...ready, ready: false }).state, 'unavailable');
  for (const value of [{}, { ...ready, ready: 'true' }, { ...ready, mode: 'private-vpn' }, { ...ready, directory: 'global' }]) assert.throws(() => networkView(value), /Invalid/);
});
test('polls coalesce and never perform network enrollment mutations', async () => {
  let finishPoll; const calls = [], views = [];
  const control = createConnectionController({ render: view => views.push(view), fetcher: async (url, options) => {
    calls.push({ url, options }); return new Promise(resolve => { finishPoll = resolve; });
  } });
  const first = control.refresh(); assert.equal(control.refresh(), first); await Promise.resolve();
  finishPoll(response(ready)); await first;
  assert.equal(calls.length, 1); assert.equal(calls[0].url, './addon-api/status'); assert.equal(calls[0].options.cache, 'no-store');
  assert.equal(calls[0].options.method, undefined); assert.equal(views.at(-1).state, 'ready'); control.dispose();
});
test('expired ingress, invalid JSON and network failure clear stale readiness', async () => {
  let next = response(ready); const views = [];
  const control = createConnectionController({ render: view => views.push(view), fetcher: async () => { if (next instanceof Error) throw next; return next; } });
  await control.refresh(); assert.equal(views.at(-1).state, 'ready');
  for (const failure of [{ ok: false }, { ok: true, json: async () => { throw Error('HTML login page'); } }, new Error('Offline')]) {
    next = failure; await control.refresh(); assert.equal(views.at(-1).state, 'unavailable');
  }
  next = response(ready); await control.refresh(); assert.equal(views.at(-1).state, 'ready'); control.dispose();
});
test('pending requests are bounded and disposal prevents late UI changes', async () => {
  const views = []; let aborted = 0;
  const control = createConnectionController({ timeout: 15, render: view => views.push(view), fetcher: (url, { signal }) => new Promise((resolve, reject) => {
    signal.addEventListener('abort', () => { aborted++; reject(Error('aborted')); }, { once: true });
  }) });
  await control.refresh(); assert.equal(aborted, 1); assert.equal(views.at(-1).state, 'unavailable');
  const pending = control.refresh(); await Promise.resolve(); control.dispose(); await pending;
  assert.equal(aborted, 2); assert.equal(views.length, 1); await control.refresh(); assert.equal(views.length, 1);
});
