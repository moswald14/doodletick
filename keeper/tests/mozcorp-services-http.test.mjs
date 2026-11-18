import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import net from 'node:net';
import { createMozCorpWorldHttpHandler } from '../mozcorp-world-http.mjs';
import { privateServiceConfig } from '../private-rooms.mjs';
import { parseCloudImport } from '../public/mozcorp-cloud.mjs';

async function serve(t, options = {}) {
  let writes = 0;
  const read = async () => ({ scope: 'fixture', revision: writes, slots: [] });
  const write = async value => { writes++; return { received: value }; };
  const store = { cloudRead: read, cloudWrite: write, hopeRead: read, hopeWrite: write, upgradeRead: read, upgradeWrite: write };
  const handler = createMozCorpWorldHttpHandler({ store, ...options });
  const server = http.createServer(async (req, res) => { if (!await handler(req, res, new URL(req.url, 'http://localhost'))) { res.writeHead(404); res.end(); } });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
  return { base: 'http://127.0.0.1:' + server.address().port, writes: () => writes, server };
}
const headers = { 'Content-Type': 'application/json', 'X-Keeper-Request': '1' };
const oversized = JSON.stringify({ text: 'x'.repeat(20000) });
const tooLarge = { error: 'This MozCorp request is too large.', code: 'MOZCORP_INVALID' };
async function rawResponse(t, url, requestHeaders, write) {
  return new Promise((resolve, reject) => {
    const req = http.request(url, { method: 'POST', headers: requestHeaders, agent: false }, res => {
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk)); res.once('error', reject);
      res.once('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) }));
    });
    req.setTimeout(2000, () => req.destroy(Error('Fixture response timed out.')));
    req.once('error', reject); t.after(() => req.destroy()); write(req);
  });
}
function assertTooLarge(result, framed = true) {
  assert.equal(result.status, 413);
  assert.deepEqual(JSON.parse(result.body.toString('utf8')), tooLarge);
  if (framed || result.headers['content-length'] !== undefined) assert.equal(Number(result.headers['content-length']), result.body.length);
  assert.equal(result.headers.connection, 'close');
}
function openWire(t, base, length) {
  const socket = net.createConnection({ host: '127.0.0.1', port: new URL(base).port, allowHalfOpen: true });
  let bytes = Buffer.alloc(0), delivered = false, ended = false, responseResolve, responseReject, endResolve, endReject;
  const response = new Promise((resolve, reject) => { responseResolve = resolve; responseReject = reject; });
  const end = new Promise((resolve, reject) => { endResolve = resolve; endReject = reject; });
  // Attach rejection handlers while a caller examines the earlier response.
  response.catch(() => {}); end.catch(() => {});
  const fail = error => { responseReject(error); endReject(error); socket.destroy(); };
  socket.setTimeout(2000, () => fail(Error('Fixture connection did not close within its bound.')));
  socket.once('error', fail);
  socket.on('data', chunk => {
    bytes = Buffer.concat([bytes, chunk]);
    if (bytes.length > 4096) return fail(Error('Fixture error response exceeded its bound.'));
    if (delivered) return;
    const boundary = bytes.indexOf('\r\n\r\n'); if (boundary < 0) return;
    const lines = bytes.subarray(0, boundary).toString('latin1').split('\r\n');
    const status = Number(/^HTTP\/1\.1 (\d{3})/.exec(lines.shift())?.[1]);
    const fields = Object.fromEntries(lines.map(line => { const colon = line.indexOf(':'); return [line.slice(0, colon).toLowerCase(), line.slice(colon + 1).trim()]; }));
    const size = Number(fields['content-length']);
    if (!Number.isSafeInteger(size) || size < 0) return fail(Error('Fixture error response needs an explicit byte length.'));
    if (bytes.length < boundary + 4 + size) return;
    delivered = true; responseResolve({ status, headers: fields, body: bytes.subarray(boundary + 4, boundary + 4 + size) });
  });
  socket.once('end', () => { ended = true; if (!delivered) fail(Error('Fixture closed before a complete error response.')); else endResolve(); });
  socket.once('close', () => { if (!ended) fail(Error('Fixture reset before a graceful close.')); });
  socket.once('connect', () => socket.write('POST /api/mozcorp/hope HTTP/1.1\r\nHost: ' + new URL(base).host + '\r\nContent-Type: application/json\r\nX-Keeper-Request: 1\r\nContent-Length: ' + length + '\r\n\r\n'));
  t.after(() => socket.destroy());
  return { socket, response, end };
}
async function statusOf(...args) {
  let response;
  try { response = await fetch(...args); }
  catch (cause) { throw new Error('Fixture request failed: ' + (args[1]?.method || 'GET') + ' / bytes ' + (args[1]?.body?.length || 0) + ' / ' + args[0], { cause }); }
  // Finish each fixture response before reusing or closing its connection.
  await response.arrayBuffer();
  return response.status;
}

test('shared services require protected same-origin mutations and return no cache or CORS permission', async t => {
  const f = await serve(t);
  for (const area of ['cloud', 'hope', 'upgrades']) {
    const route = f.base + '/api/mozcorp/' + area;
    const read = await fetch(route); assert.equal(read.status, 200); assert.equal(read.headers.get('cache-control'), 'no-store'); assert.equal(read.headers.get('access-control-allow-origin'), null);
    await read.arrayBuffer();
    for (const extra of [{}, { ...headers, Origin: 'null' }, { ...headers, Origin: 'https://other.example' }, { ...headers, 'Sec-Fetch-Site': 'cross-site' }]) assert.equal(await statusOf(route, { method: 'POST', headers: extra, body: '{}' }), 403);
    assert.equal(await statusOf(route, { method: 'POST', headers, body: '{"action":"read"}' }), 200);
  }
  assert.equal(f.writes(), 3);
});
test('shared services reject malformed, unsafe, oversized and slow bodies before writing', async t => {
  const f = await serve(t), url = f.base + '/api/mozcorp/hope';
  for (const body of ['[]', 'null', '{', '{"__proto__":{"x":1}}']) assert.equal(await statusOf(url, { method: 'POST', headers, body }), 400);
  assert.equal(await statusOf(url, { method: 'POST', headers, body: JSON.stringify({ text: 'x'.repeat(20000) }) }), 413);
  assert.equal(await statusOf(url + '?secret=not-supported'), 400);
  assert.equal(await statusOf(url, { method: 'POST', headers: { ...headers, 'Content-Encoding': 'gzip' }, body: '{}' }), 415);
  const slowServer = await serve(t, { bodyTimeoutMs: 200 });
  const slow = await new Promise((resolve, reject) => {
    const req = http.request(slowServer.base + '/api/mozcorp/hope', { method: 'POST', headers }, res => { res.resume(); res.once('end', () => resolve(res.statusCode)); });
    req.on('error', reject); req.write('{'); t.after(() => req.destroy());
  });
  assert.equal(slow, 408); assert.equal(f.writes(), 0);
});

test('early oversized uploads return complete 413 JSON on fresh raw and fetch connections before closing', async t => {
  const f = await serve(t), url = f.base + '/api/mozcorp/hope', finishes = [];
  let requests = 0;
  f.server.on('request', (req, res) => { requests++; finishes.push(new Promise(resolve => res.once('finish', () => resolve(req.complete)))); });
  for (let i = 0; i < 12; i++) {
    assertTooLarge(await rawResponse(t, url, { ...headers, 'Content-Length': Buffer.byteLength(oversized) }, req => req.end(oversized)), false);
    const response = await fetch(url, { method: 'POST', headers: { ...headers, Connection: 'close' }, body: oversized });
    assertTooLarge({ status: response.status, headers: Object.fromEntries(response.headers), body: Buffer.from(await response.arrayBuffer()) }, false);
  }
  assert.deepEqual(await Promise.all(finishes), Array(24).fill(true), 'A normal rejected upload drains before the server finishes closing.');
  assert.equal(requests, 24, 'Every assertion uses exactly one request, without transport retries.');
  assert.equal(f.writes(), 0);
});

test('chunked oversize and stalled uploads preserve their error status and never reach storage', async t => {
  const f = await serve(t, { bodyTimeoutMs: 30 }), url = f.base + '/api/mozcorp/hope';
  assertTooLarge(await rawResponse(t, url, headers, req => req.write(oversized)));
  const slow = await rawResponse(t, url, headers, req => req.write('{'));
  assert.equal(slow.status, 408);
  assert.deepEqual(JSON.parse(slow.body.toString('utf8')), { error: 'This MozCorp request timed out.', code: 'MOZCORP_INVALID' });
  assert.equal(Number(slow.headers['content-length']), slow.body.length);
  assert.equal(f.writes(), 0);
});

test('a rejected partial upload receives its framed error immediately and closes after a bounded idle discard', async t => {
  const f = await serve(t), wire = openWire(t, f.base, 1000000);
  let finished;
  f.server.once('request', (req, res) => { finished = new Promise(resolve => res.once('finish', () => resolve({ complete: req.complete, readableListeners: req.listenerCount('readable') }))); });
  const started = performance.now();
  assertTooLarge(await wire.response);
  assert.equal(f.writes(), 0);
  await wire.end;
  assert(performance.now() - started >= 200, 'An idle rejected upload gets its bounded grace period rather than an immediate socket close.');
  assert.deepEqual(await finished, { complete: false, readableListeners: 0 });
});

test('rejected uploads discard at most 64 KiB and release request listeners on the byte cap', async t => {
  const f = await serve(t);
  let finished;
  f.server.once('request', (req, res) => {
    let discarded = 0; const read = req.read;
    req.read = function(size) { const chunk = read.call(this, size); if (chunk) discarded += chunk.length; return chunk; };
    finished = new Promise(resolve => res.once('finish', () => resolve({ discarded, complete: req.complete, readableListeners: req.listenerCount('readable') })));
  });
  const wire = openWire(t, f.base, 1000000);
  assertTooLarge(await wire.response);
  wire.socket.write(Buffer.alloc(64 * 1024, 120));
  await wire.end;
  assert.deepEqual(await finished, { discarded: 64 * 1024, complete: false, readableListeners: 0 });
  assert.equal(f.writes(), 0);
});

test('an aborted rejected upload releases its discard listeners without affecting the next request', async t => {
  const f = await serve(t);
  let closed;
  f.server.once('request', (req, res) => { closed = new Promise(resolve => res.once('close', () => resolve({ readable: req.listenerCount('readable'), errors: req.listenerCount('error'), aborted: req.listenerCount('aborted') }))); });
  const wire = openWire(t, f.base, 1000000);
  assertTooLarge(await wire.response);
  wire.socket.destroy();
  assert.deepEqual(await closed, { readable: 0, errors: 0, aborted: 0 });
  assert.equal(await statusOf(f.base + '/api/mozcorp/hope'), 200);
  assert.equal(f.writes(), 0);
});
test('storage failures remain confined and backend conflict status survives HTTP', async t => {
  const f = await serve(t, { store: { cloudRead: async () => { throw Error('fixture-private-error'); }, cloudWrite: async () => { throw Object.assign(Error('Refresh this workspace.'), { status: 409, code: 'STALE_REVISION' }); } } });
  const response = await fetch(f.base + '/api/mozcorp/cloud'), result = await response.json(); assert.equal(response.status, 503); assert(!JSON.stringify(result).includes('fixture-private-error'));
  const conflict = await fetch(f.base + '/api/mozcorp/cloud', { method: 'POST', headers, body: '{}' }); assert.equal(conflict.status, 409); assert.equal((await conflict.json()).code, 'STALE_REVISION');
});
test('private solved-case configuration is declarative and export import preserves payloads', () => {
  const rules = { hope: { caseRules: { 'fixture-case': { answer: 'h2', essential: ['clue-1', 'clue-2'] } } } };
  assert.deepEqual(privateServiceConfig(rules), rules);
  assert.throws(() => privateServiceConfig({ ...rules, execute: 'not allowed' }), /configuration/);
  assert.throws(() => privateServiceConfig({ hope: { caseRules: { 'fixture-case': { answer: 'h2', essential: ['clue-1', 'clue-1'] } } } }), /case rule/);
  const payload = '{"format":"fixture-state","seed":"  exact words  ","finalStory":""}';
  const slot = { slotName: 'Site export', kind: 'machine', payload };
  assert.deepEqual(parseCloudImport(JSON.stringify({ slots: [{ id: 'old-id', ...slot }] })), [slot]);
  assert.deepEqual(parseCloudImport(JSON.stringify({ format: 'mozcorp-cloud-export', version: 1, slots: [slot] })), [slot]);
  assert.throws(() => parseCloudImport('{"slots":[{"slotName":"bad","kind":"machine","payload":"not-json"}]}'), /unreadable/);
  assert.throws(() => parseCloudImport(JSON.stringify({ slots: Array(25).fill(slot) })), /24 slots/);
  const quoted = { slotName: 'Quoted state', kind: 'machine', payload: JSON.stringify({ seed: '"'.repeat(50000) }) };
  const full = JSON.stringify({ format: 'mozcorp-cloud-export', version: 1, slots: Array(24).fill(quoted) });
  assert(Buffer.byteLength(full) > 3100000);
  assert.equal(parseCloudImport(full).length, 24, 'A legitimate full shelf must be able to import its own escaped export.');
});
