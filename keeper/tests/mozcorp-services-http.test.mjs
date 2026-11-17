import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
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
  return { base: 'http://127.0.0.1:' + server.address().port, writes: () => writes };
}
const headers = { 'Content-Type': 'application/json', 'X-Keeper-Request': '1' };
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
