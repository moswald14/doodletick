import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createShelfIdleHttpHandler } from '../shelf-idle-http.mjs';

async function serve(t, options = {}) {
  let requests = 0;
  const store = { async status() { return { available: true, revision: requests }; }, async action(value) { requests++; return { available: true, revision: requests, received: value }; } };
  const handle = createShelfIdleHttpHandler({ store, ...options });
  const server = http.createServer(async (req, res) => { if (!await handle(req, res, new URL(req.url, 'http://localhost'))) { res.writeHead(404); res.end(); } });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
  return { base: `http://127.0.0.1:${server.address().port}`, requests: () => requests };
}
const headers = { 'Content-Type': 'application/json', 'X-Keeper-Request': '1' };

test('status is readable, mutations require the Keeper header and same-origin context', async t => {
  const f = await serve(t);
  assert.equal((await fetch(f.base + '/api/shelf-idle/status')).status, 200);
  for (const extra of [{}, { 'Content-Type': 'application/json' }, { ...headers, Origin: 'https://other.example' }, { ...headers, 'Sec-Fetch-Site': 'cross-site' }]) {
    const result = await fetch(f.base + '/api/shelf-idle/action', { method: 'POST', headers: extra, body: '{}' });
    assert.equal(result.status, 403); assert.equal(result.headers.get('Access-Control-Allow-Origin'), null);
  }
  assert.equal(f.requests(), 0);
  const accepted = await fetch(f.base + '/api/shelf-idle/action', { method: 'POST', headers, body: '{}' });
  assert.equal(accepted.status, 200); assert.equal(f.requests(), 1);
});

test('invalid media, oversized JSON, queries and unrelated methods cannot reach actions', async t => {
  const f = await serve(t);
  const cases = [
    ['/action', { method: 'POST', headers: { ...headers, 'Content-Type': 'text/plain' }, body: '{}' }, 415],
    ['/action', { method: 'POST', headers, body: '{broken' }, 400],
    ['/action', { method: 'POST', headers, body: JSON.stringify({ text: 'x'.repeat(3000) }) }, 413],
    ['/action?coins=100000', { method: 'POST', headers, body: '{}' }, 400],
    ['/action', { method: 'GET' }, 404],
    ['/status', { method: 'POST', headers, body: '{}' }, 404],
  ];
  for (const [route, options, expected] of cases) assert.equal((await fetch(f.base + '/api/shelf-idle' + route, options)).status, expected);
  assert.equal(f.requests(), 0);
});

test('slow request bodies are bounded without applying an action', async t => {
  const f = await serve(t, { bodyTimeoutMs: 30 });
  const status = await new Promise((resolve, reject) => {
    const req = http.request(f.base + '/api/shelf-idle/action', { method: 'POST', headers }, res => { res.resume(); res.once('end', () => resolve(res.statusCode)); });
    req.on('error', reject); req.write('{');
    t.after(() => req.destroy());
  });
  assert.equal(status, 408); assert.equal(f.requests(), 0);
});

test('storage failures stay confined to the idle API and do not disclose local paths', async t => {
  const f = await serve(t, { store: { status: async () => { throw Error('C:/private-secret'); }, action: async () => {} } });
  const response = await fetch(f.base + '/api/shelf-idle/status'), body = await response.json();
  assert.equal(response.status, 503); assert.equal(body.available, false); assert(!JSON.stringify(body).includes('private-secret'));
});
