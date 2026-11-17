// SPDX-License-Identifier: GPL-3.0-only
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createKeeperServer } from '../server.mjs';
import { createKeeperServer as createHaKeeper } from '../../doodletick/keeper/server.mjs';
import { createIngressServer } from '../../doodletick/gateway.mjs';

const names = ['jazz.html', 'jazz.css', 'jazz-core.mjs', 'jazz-player.mjs', 'jazz-worklet.mjs', 'jazz-settings.mjs', 'jazz-cast.mjs', 'vdoninja-sdk.js', 'vdoninja-sdk-license.txt'];
async function checkAssets(base) {
  const before = await (await fetch(base + '/api/status')).json();
  for (const name of names) {
    const response = await fetch(base + '/' + name);
    assert.equal(response.status, 200, name);
    assert.match(response.headers.get('content-type'), name.endsWith('.html') ? /text\/html/ : name.endsWith('.css') ? /text\/css/ : name.endsWith('.txt') ? /text\/plain/ : /javascript/);
    const csp = response.headers.get('content-security-policy');
    assert.match(csp, /script-src 'self';/);
    assert.match(csp, /worker-src 'self';/);
    assert.doesNotMatch(csp, /script-src[^;]*(?:unsafe-inline|blob:|data:)/);
    const body = await response.text();
    if (name === 'jazz.html') {
      assert.match(body, /href="\.\/#arcade"/);
      assert.match(body, /type="module" src="\.\/jazz-player\.mjs"/);
      for (const [, attributes, inline] of body.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)) {
        assert.match(attributes, /src="\.\//);
        assert.equal(inline.trim(), '');
      }
      assert.doesNotMatch(body, /http-equiv="Content-Security-Policy"/);
      assert.match(csp, /connect-src[^;]*wss:\/\/apibackup\.vdo\.ninja/);
      assert.match(csp, /connect-src[^;]*https:\/\/turnservers\.vdo\.ninja/);
      assert.match(body, /id="shuffle-settings"/); assert.match(body, /id="cast-jazz"/);
    } else {
      assert.doesNotMatch(csp, /apibackup\.vdo\.ninja|turnservers\.vdo\.ninja/);
    }
    if (name === 'jazz-player.mjs') {
      assert.match(body, /new URL\('\.\/jazz-worklet\.mjs', import\.meta\.url\)/);
      assert.doesNotMatch(body, /createObjectURL|data:text\/javascript|jazz-engine/);
    }
  }
  const html = await (await fetch(base + '/')).text();
  assert.match(html, /href="\.\/jazz\.html"/);
  const after = await (await fetch(base + '/api/status')).json();
  assert.equal(after.publicKey, before.publicKey); assert.equal(after.receipts, before.receipts);
  assert.equal((await fetch(base + '/witness-key.json')).status, 404);
  const api = await fetch(base + '/api/status'); assert.doesNotMatch(api.headers.get('content-security-policy'), /apibackup\.vdo\.ninja|turnservers\.vdo\.ninja/);
}

test('desktop serves the complete jazz page under the existing strict script policy', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'doodle-jazz-desktop-'));
  const keeper = await createKeeperServer({ dataDir: dir, port: 0 });
  try { await checkAssets(`http://127.0.0.1:${keeper.port}`); }
  finally { await keeper.close(); await rm(dir, { recursive: true, force: true }); }
});

test('authenticated ingress serves all jazz modules and still rejects direct clients', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'doodle-jazz-ha-'));
  const keeper = await createHaKeeper({ dataDir: dir, port: 0 });
  const control = { status: async () => ({ mode: 'local-direct', ready: true, directory: 'this-keeper', peers: [] }) };
  const gateway = createIngressServer({ keeperPort: keeper.port, control, ingressIP: '127.0.0.1' });
  const rejected = createIngressServer({ keeperPort: keeper.port, control });
  await Promise.all([gateway, rejected].map(server => new Promise(resolve => server.listen(0, '127.0.0.1', resolve))));
  try {
    await checkAssets(`http://127.0.0.1:${gateway.address().port}`);
    for (const name of names) assert.equal((await fetch(`http://127.0.0.1:${rejected.address().port}/${name}`, {
      headers: { 'x-forwarded-for': '172.30.32.2' }
    })).status, 403);
    assert.equal((await fetch(`http://127.0.0.1:${gateway.address().port}/sw.mjs`)).status, 404);
  } finally {
    await Promise.all([gateway, rejected].map(server => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); })));
    await keeper.close(); await rm(dir, { recursive: true, force: true });
  }
});
