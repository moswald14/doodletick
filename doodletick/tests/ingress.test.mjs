import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createKeeperServer } from '../keeper/server.mjs';
import { newIdentity, sealEntry, verifyWitness } from '../keeper/public/core.mjs';
import { createIngressServer } from '../gateway.mjs';
import { createTailscaleControl, safeLoginURL } from '../tailscale.mjs';
import { gardenRequest, verifyGardenResponse } from '../keeper/public/mushroom-core.mjs';
const listen = s => new Promise(r => s.listen(0, '127.0.0.1', () => r(`http://127.0.0.1:${s.address().port}`)));
const close = s => new Promise(r => { s.closeAllConnections(); s.close(r); });
const vpnOptions = { readStatus: async () => { throw new Error('Isolated test: VPN not connected'); } };
const control = { status: async () => ({ state: 'NeedsLogin', connected: false, hostname: 'doodletick-test', loginURL: 'https://login.tailscale.com/a/test' }), connect: async () => {} };

test('garden signatures and CSRF protection work through Home Assistant ingress', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'doodle-ha-garden-'));
  const keeper = await createKeeperServer({ dataDir: dir, port: 0, vpnOptions });
  const gateway = createIngressServer({ keeperPort: keeper.port, control, ingressIP: '127.0.0.1' });
  const base = await listen(gateway);
  try {
    const info = await (await fetch(base + '/vpn-api/garden/self/info')).json();
    const who = await newIdentity('ha_gardener');
    const proof = await gardenRequest(who, info.record.issuer, 'join', {}, 1);
    const options = { method: 'POST', headers: { 'Content-Type':'application/json' }, body: JSON.stringify(proof) };
    assert.equal((await fetch(base + '/vpn-api/garden/self/action', options)).status, 403);
    options.headers['X-Keeper-Request'] = '1';
    const result = await fetch(base + '/vpn-api/garden/self/action', options);
    assert.equal(result.status, 200); assert(await verifyGardenResponse(await result.json(), info.record.issuer));
    for (const name of ['mushroom-ui.mjs','mushroom-core.mjs','mushroom-art.mjs','dot-mushroom-dsp.mjs','mushroom.css']) assert.equal((await fetch(base + '/' + name)).status, 200);
    assert.equal((await fetch(base + '/garden-ledger.json')).status, 404);
  } finally { await close(gateway); await keeper.close(); await rm(dir, { recursive: true, force: true }); }
});

test('ingress blocks direct access and spoofed forwarding headers; local health stays available', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'doodle-ha-'));
  const keeper = await createKeeperServer({ dataDir: dir, port: 0, vpnOptions });
  const gateway = createIngressServer({ keeperPort: keeper.port, control });
  const base = await listen(gateway);
  try {
    assert.equal((await fetch(base + '/')).status, 403);
    assert.equal((await fetch(base + '/api/status', { headers: { 'x-forwarded-for': '172.30.32.2', 'x-remote-user-id': 'admin' } })).status, 403);
    assert.equal((await fetch(base + '/health')).status, 200);
  } finally { await close(gateway); await keeper.close(); await rm(dir, { recursive: true, force: true }); }
});

test('authenticated ingress serves relative UI, protects mutations, signs proofs and keeps identity on restart', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'doodle-ha-'));
  let keeper = await createKeeperServer({ dataDir: dir, port: 0, vpnOptions });
  const gateway = createIngressServer({ keeperPort: keeper.port, control, ingressIP: '127.0.0.1' });
  const base = await listen(gateway);
  try {
    const page = await fetch(base + '/'); const html = await page.text();
    assert.equal(page.status, 200); assert.match(page.headers.get('content-security-policy'), /frame-ancestors 'self'/);
    assert(!/(?:href|src)="\//.test(html)); assert.match(html, /Your always-on Keeper/);
    for (const [, resource] of html.matchAll(/(?:src|href)="\.\/([^"#]+)"/g)) {
      assert.equal((await fetch(base + '/' + resource)).status, 200, resource);
    }
    assert.equal((await fetch(base + '/sw.mjs')).status, 404);
    assert.equal((await fetch(base + '/clock-wheel.mjs')).status, 200);
    const vpnUI = await (await fetch(base + '/vpn-ui.mjs')).text();
    assert.match(vpnUI, /This Home Assistant add-on already includes Tailscale/);
    assert.match(vpnUI, /Use Connect private network in the Your always-on Keeper panel/);
    assert.match(vpnUI, /Friends using Windows still need Tailscale and Keeper/);
    assert(!vpnUI.includes('tailscale.com/download/windows'));
    assert(!vpnUI.includes('Start the Keeper on this computer'));
    assert.equal((await fetch(base + '/.doodletick/witness-key.json')).status, 404);
    assert.equal((await fetch(base + '/addon-api/connect', { method: 'POST' })).status, 403);
    assert.equal((await fetch(base + '/addon-api/connect', { method: 'OPTIONS' })).status, 405);
    assert.equal((await fetch(base + '/addon-api/connect', { method: 'POST', headers: { 'X-Keeper-Request': '1' } })).status, 202);
    assert.equal((await (await fetch(base + '/addon-api/status')).json()).state, 'NeedsLogin');
    const first = await (await fetch(base + '/api/status')).json();
    const identity = await newIdentity('ha_test');
    const entry = await sealEntry(identity, [], { title: 'HA test', body: 'Still encrypted in the browser', kind: 'Idea', revisionOf: null });
    const signed = await fetch(base + '/api/witness', { method: 'POST', headers: { 'X-Keeper-Request': '1', 'Content-Type': 'application/json', Origin: 'https://homeassistant.example' }, body: JSON.stringify({ proof: entry.proof }) });
    assert.equal(signed.status, 200); assert(await verifyWitness(await signed.json(), entry.proof.id));
    assert(!(await readFile(path.join(dir, 'receipts.jsonl'), 'utf8')).includes(entry.payload.body));
    await keeper.close(); keeper = await createKeeperServer({ dataDir: dir, port: 0, vpnOptions });
    const restarted = await (await fetch(`http://127.0.0.1:${keeper.port}/api/status`)).json();
    assert.equal(restarted.fingerprint, first.fingerprint); assert.equal(restarted.receipts, 1);
  } finally { await close(gateway); await keeper.close(); await rm(dir, { recursive: true, force: true }); }
});

test('Tailscale control validates hostname, does not return secrets, and deduplicates sign-in attempts', async () => {
  assert.throws(() => createTailscaleControl('bad name; command'), /Invalid/);
  assert.equal(safeLoginURL('https://login.tailscale.com.evil.invalid/a/x'), null);
  assert.equal(safeLoginURL('javascript:alert(1)'), null);
  assert.equal(safeLoginURL('https://user:pass@login.tailscale.com/a/x'), null);
  let calls = 0, finish;
  const c = createTailscaleControl('doodletick-ha', async (command, args) => {
    assert.equal(command, 'tailscale');
    if (args[0] === 'status') return { stdout: JSON.stringify({ BackendState: 'NeedsLogin', AuthURL: 'https://login.tailscale.com/a/test', Secret: 'do-not-return' }) };
    calls++; assert(args.includes('--accept-routes=false')); assert(args.includes('--accept-dns=false')); assert(args.includes('--ssh=false'));
    return new Promise(r => { finish = r; });
  });
  const pending = c.connect(); c.connect(); assert.equal(calls, 1);
  const state = await c.status(); assert.equal(state.connecting, true); assert.equal(state.loginURL, 'https://login.tailscale.com/a/test');
  assert(!JSON.stringify(state).includes('do-not-return')); finish({ stdout: '' }); await pending;
  assert.equal((await c.status()).connecting, false);
});

test('all adapted API calls stay beneath the ingress path and send mutation protection', async () => {
  for (const name of ['app.mjs', 'vpn-transport.mjs', 'arcade-room.mjs']) {
    const text = await readFile(new URL('../keeper/public/' + name, import.meta.url), 'utf8');
    assert(!/(?:fetch|fetcher)\(['"]\//.test(text), name);
    assert(text.includes("'X-Keeper-Request': '1'"), name);
  }
  assert(!(await readFile(new URL('../keeper/public/app.mjs', import.meta.url), 'utf8')).includes('serviceWorker.register'));
});
