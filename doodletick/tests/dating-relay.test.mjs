import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createIngressServer } from '../gateway.mjs';
import { createDatingRelay } from '../dating-relay.mjs';

const ORIGIN = 'https://mozcorp-telephone-dating.pages.dev';
const PREFIX = '/api/hassio_ingress/fixture_ingress_token';
const TOKEN = 'a'.repeat(43), OTHER_TOKEN = 'b'.repeat(43);
const PEER = '12345678-1234-1234-1234-123456789abc';
const HA_SECRET = 'fixture-ha-auth-never-forward';
const META = {
  'X-Hass-Source': 'core.ingress', 'X-Ingress-Path': PREFIX, 'X-Remote-User-Id': 'fixture-ha-user-a',
  'X-Forwarded-Host': 'ha.fixture.example', 'X-Forwarded-Proto': 'https',
  'Sec-Fetch-Site': 'same-origin', 'X-Keeper-Request': '1'
};
const sessionCookie = (token = TOKEN, age = 1209600) => `__Host-btw_session=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${age}; Secure`;
const json = (value, status = 200, headers = {}) => Response.json(value, { status, headers });
async function listen(t, server) {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); }));
  return 'http://127.0.0.1:' + server.address().port;
}
async function fixture(t, fetchImpl, options = {}) {
  const keeperRequests = [];
  const keeper = http.createServer((req, res) => { keeperRequests.push({ method: req.method, url: req.url, headers: req.headers }); req.resume(); res.writeHead(200, { 'Content-Type': 'application/json' }); res.end('{"keeper":true}'); });
  await listen(t, keeper);
  const gateway = options.relay ? http.createServer(createDatingRelay({ fetchImpl, ...options.relay })) : createIngressServer({ keeperPort: keeper.address().port, control: { status: async () => ({ ready: true }) }, datingFetch: fetchImpl, ingressIP: options.ingressIP || '127.0.0.1' });
  return { base: await listen(t, gateway), keeperRequests };
}
async function request(f, route, { method = 'GET', data, headers = {}, rawBody } = {}) {
  const values = { ...META, ...(method === 'GET' ? {} : { Origin: 'https://ha.fixture.example' }), ...(data === undefined ? {} : { 'Content-Type': 'application/json' }), ...headers };
  for (const [key, value] of Object.entries(values)) if (value === undefined) delete values[key];
  const response = await fetch(f.base + route, { method, headers: values, body: rawBody ?? (data === undefined ? undefined : JSON.stringify(data)) });
  const text = await response.text();
  return { response, status: response.status, data: JSON.parse(text), text };
}
function assertCookie(value, token = TOKEN) {
  assert.match(value, /^__Secure-keeper_dating_[a-f0-9]{64}=/);
  assert(value.startsWith(value.split('=')[0] + '=' + token + ';'));
  assert(value.includes('; Path=' + PREFIX + '/dating-api/;'));
  for (const flag of ['HttpOnly', 'Secure', 'SameSite=Strict']) assert(value.includes('; ' + flag));
  assert(!value.includes('fixture-ha-user-a')); assert(!value.includes('Domain='));
}
function rawRequest(t, base, path, headers, write) {
  return new Promise((resolve, reject) => {
    const req = http.request(base, { path, method: 'POST', headers, agent: false }, res => {
      const chunks = []; res.on('data', part => chunks.push(part)); res.once('error', reject);
      res.once('end', () => resolve({ status: res.statusCode, data: JSON.parse(Buffer.concat(chunks).toString('utf8')) }));
    });
    req.once('error', reject); req.setTimeout(2000, () => req.destroy(Error('Fixture timeout'))); t.after(() => req.destroy()); write(req);
  });
}

test('authenticated dating flows keep the original API contract and forward only dating headers', async t => {
  const calls = []; let profile = null, messages = [];
  const f = await fixture(t, async (url, options) => {
    calls.push({ url, options });
    assert.equal(options.redirect, 'error'); assert.equal(options.credentials, 'omit'); assert.equal(options.referrerPolicy, 'no-referrer');
    for (const key of Object.keys(options.headers)) assert(['Accept', 'Content-Type', 'Origin', 'Cookie'].includes(key), key);
    const serialized = JSON.stringify({ url, headers: options.headers });
    for (const privateValue of [HA_SECRET, PREFIX, 'fixture-ha-user-a', 'fixture-display-name', '192.0.2.55']) assert(!serialized.includes(privateValue));
    const route = new URL(url).pathname.slice('/dating-api/'.length), body = options.body ? JSON.parse(Buffer.from(options.body).toString()) : undefined;
    if (options.method !== 'GET') assert.equal(options.headers.Origin, ORIGIN);
    if (route === 'register') return json({ signInKey: 'btw_' + OTHER_TOKEN }, 201, { 'Set-Cookie': sessionCookie() });
    if (route === 'sign-in') return json({ signedIn: true }, 200, { 'Set-Cookie': sessionCookie() });
    if (route === 'status') return json({ ready: true, service: 'telephone-dating', signups: true });
    if (route === 'session') return json({ member: options.headers.Cookie ? PEER : null, profile });
    assert.equal(options.headers.Cookie, '__Host-btw_session=' + TOKEN);
    if (route === 'profile') { assert.equal(options.method, 'PUT'); profile = body; return json({ saved: true }); }
    if (route.startsWith('discover')) return json({ profiles: [{ id: PEER, alias: 'Fixture peer' }] });
    if (route === 'choose') return json({ matched: true });
    if (route === 'matches') return json({ profiles: [{ id: PEER, alias: 'Fixture peer' }] });
    if (route.startsWith('conversation/')) { if (body) { messages.push({ body: body.message, mine: true }); return json({ sent: true }, 201); } return json({ messages }); }
    if (['block', 'report'].includes(route)) return json({ blocked: true });
    if (['sign-out', 'account'].includes(route)) { assert.equal(options.body, undefined); return json({}, 200, { 'Set-Cookie': sessionCookie('', 0) }); }
    throw Error('Unexpected fixture route');
  });
  const privateHeaders = { Authorization: 'Bearer ' + HA_SECRET, Cookie: 'hassio_ingress_session=' + HA_SECRET + '; __Host-btw_session=' + OTHER_TOKEN, 'X-Remote-User-Name': 'fixture-display-name', 'X-Supervisor-Token': HA_SECRET, 'X-Forwarded-For': '192.0.2.55' };
  assert.equal((await request(f, '/dating-api/status', { headers: privateHeaders })).data.ready, true);
  const registered = await request(f, '/dating-api/register', { method: 'POST', data: { adult: true }, headers: privateHeaders });
  assert.equal(registered.status, 201); assert.equal(registered.data.signInKey, 'btw_' + OTHER_TOKEN);
  const set = registered.response.headers.get('set-cookie'); assertCookie(set);
  const headers = { ...privateHeaders, Cookie: privateHeaders.Cookie + '; ' + set.split(';')[0] };
  assert.equal((await request(f, '/dating-api/session', { headers })).data.member, PEER);
  const profileValue = { alias: 'Fixture Ω', age: 29, region: 'Fictional test region', intent: 'open', intro: 'Disposable fixture', icebreaker: 'A tiny umbrella', listed: true };
  assert.equal((await request(f, '/dating-api/profile', { method: 'PUT', data: profileValue, headers })).data.saved, true);
  assert.deepEqual((await request(f, '/dating-api/session', { headers })).data.profile, profileValue);
  assert.equal((await request(f, '/dating-api/discover?intent=open', { headers })).data.profiles.length, 1);
  assert.equal((await request(f, '/dating-api/choose', { method: 'POST', data: { profileId: PEER, choice: 'interested' }, headers })).data.matched, true);
  assert.equal((await request(f, '/dating-api/matches', { headers })).data.profiles.length, 1);
  assert.equal((await request(f, '/dating-api/conversation/' + PEER, { method: 'POST', data: { message: 'Fixture hello', clientId: PEER }, headers })).status, 201);
  assert.deepEqual((await request(f, '/dating-api/conversation/' + PEER, { headers })).data.messages, [{ body: 'Fixture hello', mine: true }]);
  for (const route of ['block', 'report']) assert.equal((await request(f, '/dating-api/' + route, { method: 'POST', data: { profileId: PEER, ...(route === 'report' ? { reason: 'other' } : {}) }, headers })).data.blocked, true);
  for (const [route, method] of [['sign-out', 'POST'], ['account', 'DELETE']]) {
    const cleared = await request(f, '/dating-api/' + route, { method, headers }); assert.equal(cleared.status, 200);
    assertCookie(cleared.response.headers.get('set-cookie'), ''); assert.match(cleared.response.headers.get('set-cookie'), /Max-Age=0$/);
  }
  assert.equal((await request(f, '/dating-api/sign-in', { method: 'POST', data: { key: 'btw_' + OTHER_TOKEN } })).data.signedIn, true);
  assert.equal(calls.length, 15); assert.deepEqual(f.keeperRequests, []);
});

test('dating cookies are isolated by verified HA user and ingress path and never forwarded wholesale', async t => {
  const sent = [];
  const f = await fixture(t, async (url, options) => { sent.push(options.headers.Cookie); return new URL(url).pathname.endsWith('register') ? json({ signInKey: 'btw_' + OTHER_TOKEN }, 201, { 'Set-Cookie': sessionCookie() }) : json({ member: options.headers.Cookie ? PEER : null }); });
  const a = await request(f, '/dating-api/register', { method: 'POST', data: { adult: true } }), pair = a.response.headers.get('set-cookie').split(';')[0];
  assert.equal((await request(f, '/dating-api/session', { headers: { Cookie: pair } })).data.member, PEER);
  assert.equal((await request(f, '/dating-api/session', { headers: { Cookie: pair, 'X-Remote-User-Id': 'fixture-ha-user-b' } })).data.member, null);
  assert.equal((await request(f, '/dating-api/session', { headers: { Cookie: pair, 'X-Ingress-Path': PREFIX + '_other' } })).data.member, null);
  const count = sent.length;
  const duplicate = await request(f, '/dating-api/session', { headers: { Cookie: pair + '; ' + pair } });
  assert.equal(duplicate.status, 401); assert.equal(sent.length, count); assert.match(duplicate.response.headers.get('set-cookie'), /Max-Age=0$/);
  const malformed = await request(f, '/dating-api/session', { headers: { Cookie: pair.split('=')[0] + '=invalid' } });
  assert.equal(malformed.status, 401); assert.equal(sent.length, count);
});

test('ingress IP, secure same-origin checks and request protection fail closed before external calls', async t => {
  let calls = 0; const upstream = async () => { calls++; return json({ ready: true }); };
  const f = await fixture(t, upstream), denied = await fixture(t, upstream, { ingressIP: '172.30.32.2' });
  assert.equal((await request(denied, '/dating-api/status')).status, 403);
  for (const headers of [
    { 'X-Keeper-Request': undefined }, { 'X-Hass-Source': undefined }, { 'X-Remote-User-Id': undefined },
    { 'X-Ingress-Path': '/api/hassio_ingress/fixture; Path=/' }, { 'X-Forwarded-Host': 'ha.fixture.example,evil.example' },
    { 'Sec-Fetch-Site': 'cross-site' }, { 'Sec-Fetch-Site': 'same-site' }, { 'Sec-Fetch-Site': undefined },
    { 'X-Forwarded-Proto': 'http' }, { Origin: 'http://ha.fixture.example' }, { Origin: 'https://evil.example' }, { Origin: 'null' }
  ]) assert.equal((await request(f, '/dating-api/status', { headers })).status, 403, JSON.stringify(headers));
  assert.equal((await request(f, '/dating-api/register', { method: 'POST', data: { adult: true }, headers: { Origin: undefined } })).status, 403);
  assert.equal(calls, 0);
  assert.equal((await request(f, '/dating-api/status')).status, 200, 'A secure same-origin GET needs no Origin.');
  assert.equal((await request(f, '/dating-api/status', { headers: { Origin: 'https://ha.fixture.example', 'Sec-Fetch-Site': undefined } })).status, 200);
});

test('route method and query allowlists cannot select another upstream or broaden generic gateway PUT', async t => {
  const calls = []; const f = await fixture(t, async url => { calls.push(url); return json({ profiles: [] }); });
  for (const [route, method, status] of [
    ['/dating-api', 'GET', 404], ['/dating-api/unknown', 'GET', 404], ['/dating-api/session', 'PUT', 405],
    ['/dating-api/profile', 'PATCH', 405], ['/dating-api/profile', 'OPTIONS', 405], ['/dating-api/status', 'POST', 405],
    ['/dating-api/session?token=not-allowed', 'GET', 400], ['/dating-api/discover?intent=open&intent=open', 'GET', 400],
    ['/dating-api/discover?intent=unknown', 'GET', 400], ['/dating-api/conversation/' + PEER + '/extra', 'GET', 404],
    ['/api/profile', 'PUT', 405]
  ]) assert.equal((await request(f, route, { method })).status, status, route + ' ' + method);
  assert.equal(calls.length, 0); assert.equal(f.keeperRequests.length, 0);
  assert.equal((await rawRequest(t, f.base, '/dating-api/%2e%2e/api/status', META, req => req.end())).status, 404);
  assert.equal((await request(f, '/dating-api/discover?intent=%6fpen')).status, 200);
  assert.deepEqual(calls, [ORIGIN + '/dating-api/discover?intent=open']);
});

test('malformed unsafe compressed oversized and stalled JSON cannot reach the upstream', async t => {
  let calls = 0; const f = await fixture(t, async () => { calls++; return json({}); }, { relay: { bodyTimeoutMs: 25 } });
  for (const rawBody of ['[]', 'null', '{', '{"__proto__":{}}', '{"adult":true,"haIdentity":"private"}']) assert.equal((await request(f, '/dating-api/register', { method: 'POST', rawBody, headers: { 'Content-Type': 'application/json' } })).status, 400);
  assert.equal((await request(f, '/dating-api/register', { method: 'POST', rawBody: '{}', headers: { 'Content-Type': 'text/plain' } })).status, 415);
  assert.equal((await request(f, '/dating-api/register', { method: 'POST', rawBody: '{}', headers: { 'Content-Type': 'application/json', 'Content-Encoding': 'gzip' } })).status, 415);
  assert.equal((await request(f, '/dating-api/register', { method: 'POST', data: { adult: true, padding: 'Ω'.repeat(5000) } })).status, 413);
  const rawHeaders = { ...META, Origin: 'https://ha.fixture.example', 'Content-Type': 'application/json' };
  assert.equal((await rawRequest(t, f.base, '/dating-api/register', rawHeaders, req => req.write('x'.repeat(8193)))).status, 413);
  assert.equal((await rawRequest(t, f.base, '/dating-api/register', rawHeaders, req => req.write('{'))).status, 408);
  assert.equal(calls, 0);
});

test('only the expected secure session cookie is rewritten and upstream headers cannot alter HA auth or policy', async t => {
  let response;
  const f = await fixture(t, async () => response);
  response = json({ signInKey: 'btw_' + OTHER_TOKEN }, 201, { 'Set-Cookie': sessionCookie(), 'Access-Control-Allow-Origin': '*', 'Location': 'https://evil.example', 'Authorization': HA_SECRET, 'Content-Security-Policy': "default-src *" });
  response.headers.append('Set-Cookie', 'hassio_ingress_session=upstream-must-not-set; Path=/');
  const result = await request(f, '/dating-api/register', { method: 'POST', data: { adult: true } });
  assert.equal(result.status, 201); assertCookie(result.response.headers.get('set-cookie'));
  for (const name of ['access-control-allow-origin', 'location', 'authorization']) assert.equal(result.response.headers.get(name), null);
  assert(!result.response.headers.get('set-cookie').includes('hassio_ingress_session'));
  assert.match(result.response.headers.get('content-security-policy'), /default-src 'self'/);
  assert.equal(result.response.headers.get('cache-control'), 'private, no-store');
  for (const bad of [sessionCookie().replace('; Secure', ''), sessionCookie().replace('Path=/', 'Path=/wrong'), sessionCookie() + '; Domain=evil.example', sessionCookie().replace('Max-Age=1209600', 'Max-Age=99999999'), '__Host-btw_session=invalid; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=30']) {
    response = json({ signedIn: true }, 200, { 'Set-Cookie': bad });
    const rejected = await request(f, '/dating-api/sign-in', { method: 'POST', data: { key: 'btw_' + OTHER_TOKEN } });
    assert.equal(rejected.status, 502); assert.equal(rejected.response.headers.get('set-cookie'), null);
  }
});

test('redirects malformed responses and network errors return fixed failures without another attempt', async t => {
  let mode, calls = 0;
  const f = await fixture(t, async (_url, options) => { calls++; assert.equal(options.redirect, 'error'); if (mode instanceof Error) throw mode; return mode; });
  for (const response of [new Response('', { status: 302, headers: { Location: 'https://evil.example' } }), new Response('not JSON ' + HA_SECRET, { headers: { 'Content-Type': 'application/json' } }), new Response('<html>' + HA_SECRET, { headers: { 'Content-Type': 'text/html' } }), json({ constructor: 'unsafe' }), Error(HA_SECRET)]) {
    mode = response; const before = calls, result = await request(f, '/dating-api/status');
    assert.equal(result.status, 502); assert.equal(result.data.code, 'DATING_UPSTREAM'); assert(!result.text.includes(HA_SECRET)); assert.equal(calls, before + 1);
  }
});

test('upstream response reads are bounded by actual and declared bytes', async t => {
  let make, cancelled = false;
  const f = await fixture(t, async () => make());
  make = () => new Response(new ReadableStream({ cancel() { cancelled = true; } }), { headers: { 'Content-Type': 'application/json', 'Content-Length': String(1024 * 1024 + 1) } });
  assert.equal((await request(f, '/dating-api/status')).status, 502); assert.equal(cancelled, true);
  cancelled = false;
  make = () => new Response(new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(1024 * 1024)); controller.enqueue(new Uint8Array(1)); }, cancel() { cancelled = true; } }), { headers: { 'Content-Type': 'application/json' } });
  assert.equal((await request(f, '/dating-api/status')).status, 502); assert.equal(cancelled, true);
});

test('upstream fetch and body deadlines cancel without retry or late session cookies', async t => {
  let calls = 0, signal, cancelled = false, slowBody = false;
  const f = await fixture(t, async (_url, options) => { calls++; signal = options.signal; if (!slowBody) return new Promise(() => {}); return new Response(new ReadableStream({ cancel() { cancelled = true; } }), { headers: { 'Content-Type': 'application/json' } }); }, { relay: { upstreamTimeoutMs: 25 } });
  for (const body of [false, true]) {
    slowBody = body; const before = calls, result = await request(f, '/dating-api/status');
    assert.equal(result.status, 504); assert.equal(result.data.code, 'DATING_TIMEOUT'); assert.equal(signal.aborted, true); assert.equal(calls, before + 1); assert.equal(result.response.headers.get('set-cookie'), null);
  }
  assert.equal(cancelled, true);
});
