import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, appendFile, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createKeeperServer } from '../server.mjs';
import { createKeeperServer as createHaKeeper } from '../../doodletick/keeper/server.mjs';
import { MAIN_GENESIS } from '../public/dvc-core.mjs';

for (const [label, create] of [['desktop', createKeeperServer], ['Home Assistant runtime', createHaKeeper]]) {
  test(`${label} exposes native routes/assets, preserves witness and chain across restart, refuses origin spoofing`, async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'dvc-integration-'));
    let keeper;
    try {
      keeper = await create({ dataDir: directory, port: 0 });
      let base = `http://127.0.0.1:${keeper.port}`;
      const witness = await (await fetch(base + '/api/status')).json();
      const status = await (await fetch(base + '/dvc/status')).json();
      assert.equal(status.networkId, MAIN_GENESIS.networkId);
      assert.equal(status.genesis.hash, MAIN_GENESIS.hash);
      assert.equal(status.tip.height, '0'); assert.equal(status.supply.issuedAtoms, MAIN_GENESIS.founderAtoms);
      const account = await (await fetch(base + '/dvc/account/' + MAIN_GENESIS.founderAddress)).json();
      assert.equal(account.availableAtoms, MAIN_GENESIS.founderAtoms);
      assert.equal(account.pendingOutAtoms, '0'); assert.equal(account.nextNonce, '0');
      for (const asset of ['dvc-core.mjs', 'dvc-ui.mjs', 'dvc-wallet.mjs', 'dvc-miner.mjs', 'dvc-sync.mjs', 'dvc-peer-ui.mjs', 'dvc.css', 'dvc-console.mjs', 'dvc-console.css']) {
        const response = await fetch(base + '/' + asset); assert.equal(response.status, 200, asset);
        assert.match(response.headers.get('content-type'), asset.endsWith('.css') ? /text\/css/ : /javascript/);
      }
      assert.match(await (await fetch(base + '/')).text(), /dvc\.css/);
      assert.equal((await fetch(base + '/dvc/status', { headers: { Origin: 'https://foreign.example' } })).status, 403);
      assert.equal((await fetch(base + '/dvc/segment', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"ancestorHash":"a","ancestorHash":"b","blocks":[]}' })).status, 400);
      assert.equal((await fetch(base + '/dvc/transfer', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })).status, 400);
      assert.equal((await fetch(base + '/dvc/dvc-chain.jsonl')).status, 404);
      assert.equal((await fetch(base + '/dvc/peers', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"url":"http://127.0.0.1/admin"}' })).status, 405);
      const journalBefore = await readFile(path.join(directory, 'dvc/dvc-chain.jsonl'), 'utf8');
      assert.equal(journalBefore.trim().split('\n').length, 1);
      await keeper.close(); keeper = null;
      keeper = await create({ dataDir: directory, port: 0 }); base = `http://127.0.0.1:${keeper.port}`;
      const after = await (await fetch(base + '/api/status')).json();
      assert.equal(after.fingerprint, witness.fingerprint); assert.equal(after.receipts, witness.receipts);
      assert.equal((await (await fetch(base + '/dvc/status')).json()).tip.hash, status.tip.hash);
      assert.equal(await readFile(path.join(directory, 'dvc/dvc-chain.jsonl'), 'utf8'), journalBefore);
      // A complete invalid journal record never resets the chain or prevents
      // unrelated existing Keeper features from loading after restart.
      await keeper.close(); keeper = null;
      await appendFile(path.join(directory, 'dvc/dvc-chain.jsonl'), '{"kind":"forged"}\n');
      keeper = await create({ dataDir: directory, port: 0 }); base = `http://127.0.0.1:${keeper.port}`;
      const recoveredUi = await (await fetch(base + '/api/status')).json();
      assert.equal(recoveredUi.fingerprint, witness.fingerprint);
      assert.equal(recoveredUi.nativeCoin.available, false);
      assert.equal((await fetch(base + '/')).status, 200);
      assert.equal((await fetch(base + '/dvc/status')).status, 503);
      assert.equal((await fetch(base + '/dvc/job', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ miner: MAIN_GENESIS.founderAddress, algorithm: 'sha256' }) })).status, 503);
      assert.equal(await readFile(path.join(directory, 'dvc/dvc-chain.jsonl'), 'utf8'), journalBefore + '{"kind":"forged"}\n');
    } finally {
      await keeper?.close();
      assert.equal(path.dirname(path.resolve(directory)), path.resolve(os.tmpdir()));
      assert.ok(path.basename(directory).startsWith('dvc-integration-'));
      await rm(directory, { recursive: true, force: true });
    }
  });
}
