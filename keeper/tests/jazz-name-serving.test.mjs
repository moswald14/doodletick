// SPDX-License-Identifier: GPL-3.0-only
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createKeeperServer } from '../server.mjs';
import { createIngressServer } from '../../doodletick/gateway.mjs';
import { jazzConfigFromAddonOptions } from '../../doodletick/jazz-options.mjs';
import { config, context, payer, testTime, fakeNetwork } from './jazz-name-fixture.mjs';
const assets = ['jazz-name-contract.mjs', 'jazz-name-client.mjs', 'jazz-name-ui.mjs'];

async function fixture(t, configured = false) {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'jazz-name-http-')), network = fakeNetwork();
  const keeper = await createKeeperServer({ dataDir: dir, port: 0, jazzOptions: { config: configured ? config : {}, network, now: () => testTime } });
  t.after(async () => { keeper.server.closeAllConnections(); await keeper.close(); await rm(dir, { recursive: true, force: true }); });
  return { keeper, network, url: 'http://127.0.0.1:' + keeper.port };
}
const post = (url, data, headers = {}) => fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Keeper-Request': '1', ...headers }, body: JSON.stringify(data) });

test('unconfigured naming serves safely and cannot issue a payment quote', async t => {
  const f = await fixture(t), before = await (await fetch(f.url + '/api/status')).json();
  const publicConfig = await (await fetch(f.url + '/api/jazz-name/config')).json();
  assert.equal(publicConfig.ready, false); assert.equal(publicConfig.apiKey, undefined);
  assert.equal((await post(f.url + '/api/jazz-name/quote', { payer, context })).status, 503);
  for (const asset of assets) {
    const response = await fetch(f.url + '/' + asset); assert.equal(response.status, 200);
    assert.match(response.headers.get('content-security-policy'), /script-src 'self';/);
    assert(!(await response.text()).includes(config.apiKey));
  }
  for (const file of ['/jazz-name.mjs', '/jazz-naming/jazz-naming.json', '/jazz-naming.json', '/.env', '/options.json']) assert.equal((await fetch(f.url + file)).status, 404);
  const after = await (await fetch(f.url + '/api/status')).json(); assert.equal(before.fingerprint, after.fingerprint); assert.equal(before.receipts, after.receipts);
});

test('naming POSTs require request protection, JSON, bounded bodies and same origin', async t => {
  const f = await fixture(t, true), route = f.url + '/api/jazz-name/quote';
  assert.equal((await post(route, { payer, context }, { 'X-Keeper-Request': '' })).status, 403);
  assert.equal((await post(route, { payer, context }, { Origin: 'https://example.invalid' })).status, 403);
  assert.equal((await post(route, { payer, context }, { 'Content-Type': 'text/plain' })).status, 415);
  assert.equal((await post(route, { large: 'x'.repeat(7000) })).status, 413);
  const response = await post(route, { payer, context }); assert.equal(response.status, 200);
  const quote = await response.json(); assert(quote.capability); assert.equal(f.network.generates, 0);
  assert.equal((await fetch(f.url + '/api/jazz-name/job?id=' + quote.id)).status, 404);
});

test('authenticated ingress forwards validated naming requests and rejects direct clients', async t => {
  const f = await fixture(t, true), control = { status: async () => ({ ready: true }) };
  const allowed = createIngressServer({ keeperPort: f.keeper.port, control, ingressIP: '127.0.0.1' });
  const denied = createIngressServer({ keeperPort: f.keeper.port, control });
  for (const server of [allowed, denied]) await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => { for (const server of [allowed, denied]) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); } });
  const base = server => 'http://127.0.0.1:' + server.address().port;
  const response = await post(base(allowed) + '/api/jazz-name/quote', { payer, context });
  assert.equal(response.status, 200, await response.clone().text());
  assert.equal((await post(base(denied) + '/api/jazz-name/quote', { payer, context }, { 'x-forwarded-for': '172.30.32.2' })).status, 403);
  assert.equal((await post(base(allowed) + '/api/jazz-name/job', {}, { 'X-Keeper-Request': '' })).status, 403);
  for (const asset of assets) assert.equal((await fetch(base(allowed) + '/' + asset)).status, 200);
  assert.equal((await fetch(base(allowed) + '/sw.mjs')).status, 404); assert.equal(f.network.generates, 0);
});

test('add-on configuration opts out by default and keeps the API key in the server configuration', () => {
  assert.equal(jazzConfigFromAddonOptions({}).enabled, false);
  assert.deepEqual(jazzConfigFromAddonOptions({ jazz_enabled: true, jazz_recipient: config.recipient, jazz_openai_api_key: config.apiKey, jazz_daily_limit: 12 }), {
    enabled: true, network: 'ethereum', recipient: config.recipient, apiKey: config.apiKey, dailyLimit: 12, rpcUrl: 'https://ethereum-rpc.publicnode.com'
  });
});
