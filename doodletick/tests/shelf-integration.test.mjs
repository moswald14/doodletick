import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createKeeperServer } from '../keeper/server.mjs';
import { createIngressServer } from '../gateway.mjs';

const control = { status: async () => ({ ready: true }) };
const listen = server => new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve(`http://127.0.0.1:${server.address().port}`)));
const close = server => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); });
async function cleanup(dir) {
  assert.equal(path.dirname(path.resolve(dir)), path.resolve(os.tmpdir()));
  assert.ok(path.basename(dir).startsWith('shelf-ha-test-'));
  await rm(dir, { recursive: true, force: true });
}

test('Shelf Defense pages and protected cookie actions work through authenticated ingress', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'shelf-ha-test-'));
  let keeper, gateway;
  try {
    keeper = await createKeeperServer({ dataDir: dir, port: 0 });
    gateway = createIngressServer({ keeperPort: keeper.port, control, ingressIP: '127.0.0.1' });
    const base = await listen(gateway);
    for (const page of ['shelfdefense.html', 'shelf-idle.html']) {
      const response = await fetch(`${base}/${page}`);
      assert.equal(response.status, 200, page);
      assert.match(response.headers.get('content-security-policy'), /script-src 'self';/);
      const html = await response.text();
      assert.doesNotMatch(html, /<script(?![^>]*\bsrc=)[^>]*>\s*\S/i);
      assert.doesNotMatch(html, /(?:src|href)=["']\//);
      for (const [, resource] of html.matchAll(/(?:src|href)="\.\/([^"#]+)"/g)) {
        assert.equal((await fetch(`${base}/${resource}`)).status, 200, resource);
      }
    }
    const first = await (await fetch(`${base}/api/status`)).json();
    const idle = await (await fetch(`${base}/api/shelf-idle/status`)).json();
    assert.equal(idle.available, true);
    const request = { requestId: 'ha-shelf-test-action-0001', expectedRevision: idle.revision, action: 'tap', count: 1 };
    const options = { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(request) };
    assert.equal((await fetch(`${base}/api/shelf-idle/action`, options)).status, 403);
    options.headers['X-Keeper-Request'] = '1';
    const accepted = await fetch(`${base}/api/shelf-idle/action`, options);
    assert.equal(accepted.status, 200);
    const saved = await accepted.json();
    assert.equal(saved.game.cookies, 1);
    const replay = await (await fetch(`${base}/api/shelf-idle/action`, options)).json();
    assert.equal(replay.replayed, true);
    assert.equal(replay.game.cookies, 1);
    assert.equal((await fetch(`${base}/shelf-idle.json`)).status, 404);
    await close(gateway); gateway = null;
    await keeper.close(); keeper = null;
    keeper = await createKeeperServer({ dataDir: dir, port: 0 });
    const restartedBase = `http://127.0.0.1:${keeper.port}`;
    const restarted = await (await fetch(`${restartedBase}/api/status`)).json();
    assert.equal(restarted.fingerprint, first.fingerprint);
    assert.equal((await (await fetch(`${restartedBase}/api/shelf-idle/status`)).json()).game.cookies, 1);
  } finally { if (gateway) await close(gateway); if (keeper) await keeper.close(); await cleanup(dir); }
});

test('unread idle save fails closed without taking the Keeper or identity offline', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'shelf-ha-test-'));
  let keeper;
  try {
    await writeFile(path.join(dir, 'shelf-idle.json'), '{unread fixture', 'utf8');
    keeper = await createKeeperServer({ dataDir: dir, port: 0 });
    const base = `http://127.0.0.1:${keeper.port}`;
    assert.equal((await fetch(`${base}/api/status`)).status, 200);
    assert.equal((await fetch(`${base}/api/shelf-idle/status`)).status, 503);
    assert.equal((await fetch(`${base}/shelfdefense.html`)).status, 200);
    await keeper.close(); keeper = null;
    assert.equal(await readFile(path.join(dir, 'shelf-idle.json'), 'utf8'), '{unread fixture');
  } finally { if (keeper) await keeper.close(); await cleanup(dir); }
});
