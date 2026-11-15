import test from 'node:test';
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { browserSecurity, networkView, safeLoginURL, createConnectionController } from '../public/ha.mjs';

const disconnected = { connected: false, state: 'NeedsLogin', hostname: 'fixture-keeper', loginURL: 'https://login.tailscale.com/a/fixture' };
const response = value => ({ ok: true, json: async () => value });

test('HTTPS readiness uses the actual secure context and crypto, independently of VPN state', () => {
  assert.equal(browserSecurity({ isSecureContext: false, crypto: webcrypto, protocol: 'http:' }).state, 'https-needed');
  const embedded = browserSecurity({ isSecureContext: false, crypto: webcrypto, protocol: 'https:' });
  assert.equal(embedded.ready, false);
  assert.match(embedded.message, /whole Home Assistant page/);
  assert.equal(browserSecurity({ isSecureContext: true, crypto: {}, protocol: 'https:' }).state, 'crypto-unavailable');
  assert.equal(browserSecurity({ isSecureContext: true, crypto: webcrypto, protocol: 'https:' }).ready, true);
  assert.equal(networkView({ ...disconnected, connected: true, state: 'Running' }).state, 'connected');
  assert.equal(browserSecurity({ isSecureContext: false, protocol: 'http:' }).ready, false);
});

test('connection guidance rejects alternate login hosts, credentials and ports', () => {
  assert.equal(safeLoginURL(disconnected.loginURL), disconnected.loginURL);
  for (const url of ['http://login.tailscale.com/a/x', 'https://login.tailscale.com.evil.invalid/a/x', 'https://user:password@login.tailscale.com/a/x', 'https://login.tailscale.com:8443/a/x', 'javascript:alert(1)', '/a/x']) assert.equal(safeLoginURL(url), null);
  assert.equal(networkView({ ...disconnected, state: 'NeedsMachineAuth' }).connect, false);
  assert.equal(networkView({ ...disconnected, state: 'Starting' }).busy, true);
  assert.throws(() => networkView({ connected: 'true', state: 'Running' }), /Invalid/);
});

test('polls coalesce, while a sign-in requested during a slow poll is performed once afterward', async () => {
  let finishPoll;
  const calls = [], views = [];
  const control = createConnectionController({ render: view => views.push(view), fetcher: async (url, options) => {
    calls.push({ url, options });
    if (calls.length === 1) return new Promise(resolve => { finishPoll = resolve; });
    return response(disconnected);
  } });
  const first = control.refresh();
  assert.equal(control.refresh(), first);
  const signIn = control.connect();
  assert.equal(control.connect(), signIn);
  await Promise.resolve();
  finishPoll(response(disconnected));
  await signIn;
  assert.deepEqual(calls.map(call => call.url), ['./addon-api/status', './addon-api/connect', './addon-api/status']);
  assert.equal(calls[1].options.method, 'POST');
  assert.equal(calls[1].options.headers['X-Keeper-Request'], '1');
  assert.equal(calls[2].options.cache, 'no-store');
  assert.equal(views.at(-1).loginURL, disconnected.loginURL);
  control.dispose();
});

test('expired ingress, invalid JSON and network failure clear stale connected and sign-in states', async () => {
  let next = response(disconnected);
  const views = [];
  const control = createConnectionController({ render: view => views.push(view), fetcher: async () => {
    if (next instanceof Error) throw next;
    return next;
  } });
  await control.refresh();
  assert(views.at(-1).loginURL);
  for (const failure of [{ ok: false }, { ok: true, json: async () => { throw Error('HTML login page'); } }, new Error('Offline')]) {
    next = failure;
    await control.refresh();
    assert.equal(views.at(-1).state, 'unavailable');
    assert.equal(views.at(-1).loginURL, null);
    assert.equal(views.at(-1).connect, false);
  }
  next = response({ ...disconnected, connected: true, state: 'Running' });
  await control.refresh();
  assert.equal(views.at(-1).state, 'connected');
  control.dispose();
});

test('pending requests are bounded and disposal prevents late UI changes', async () => {
  const views = [];
  let aborted = 0;
  const control = createConnectionController({ timeout: 15, render: view => views.push(view), fetcher: (url, { signal }) => new Promise((resolve, reject) => {
    signal.addEventListener('abort', () => { aborted++; reject(Error('aborted')); }, { once: true });
  }) });
  await control.refresh();
  assert.equal(aborted, 1);
  assert.equal(views.at(-1).state, 'unavailable');
  const pending = control.refresh();
  await Promise.resolve();
  control.dispose();
  await pending;
  assert.equal(aborted, 2);
  assert.equal(views.length, 1);
  await control.connect();
  assert.equal(views.length, 1);
});
