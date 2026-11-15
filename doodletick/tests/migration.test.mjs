import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm, rename, link } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { copyOfflineData, verifyOfflineData, importMigration } from '../migration.mjs';
import { createKeeperServer } from '../../keeper/server.mjs';
import { newIdentity, sealEntry } from '../../keeper/public/core.mjs';
import { gardenRequest, recipe, HOUR, verifyGardenResponse } from '../../keeper/public/mushroom-core.mjs';

async function fixture(run) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'doodle-migration-'));
  const source = path.join(root, 'source'), staged = path.join(root, 'staged'), target = path.join(root, 'target');
  for (const directory of [source, staged, target, path.join(source, 'keeper'), path.join(source, 'tailscale')]) await mkdir(directory, { mode: 0o700 });
  await writeFile(path.join(source, 'keeper/witness-key.json'), '{"disposableFixture":true}');
  await writeFile(path.join(source, 'keeper/garden-ledger.json'), '{"disposableFixture":true}');
  await writeFile(path.join(source, 'tailscale/tailscaled.state'), 'DISPOSABLE VPN STATE, NOT A REAL DEVICE');
  await writeFile(path.join(source, 'options.json'), '{"hostname":"fixture-old"}');
  await writeFile(path.join(target, 'options.json'), '{"hostname":"fixture-target"}');
  try { await run({ root, source, staged, target }); }
  finally {
    assert(root.startsWith(path.join(os.tmpdir(), 'doodle-migration-')));
    await rm(root, { recursive: true, force: true });
  }
}

test('offline copy covers all private files, preserves options and requires distinct unused directories', () => fixture(async f => {
  await assert.rejects(copyOfflineData({ source: f.source, destination: f.target }), /Stop both apps/);
  await assert.rejects(copyOfflineData({ source: f.source, destination: f.source, offline: true }), /separate/);
  const nested = path.join(f.source, 'child'); await mkdir(nested);
  await assert.rejects(copyOfflineData({ source: f.source, destination: nested, offline: true }), /separate/);
  await mkdir(path.join(f.source, 'tailscale/nested'));
  await writeFile(path.join(f.source, 'tailscale/nested/state'), 'fixture nested');
  const copied = await copyOfflineData({ source: f.source, destination: f.target, offline: true });
  assert.equal(copied.files, 4); assert.equal(copied.verified, true);
  assert.deepEqual(await verifyOfflineData({ source: f.source, destination: f.target, offline: true }), copied);
  assert.equal(await readFile(path.join(f.target, 'options.json'), 'utf8'), '{"hostname":"fixture-target"}');
  await assert.rejects(copyOfflineData({ source: f.source, destination: f.target, offline: true }), /already contains/);
}));

test('startup import runs once and cannot roll back later ledger or VPN changes', () => fixture(async f => {
  await copyOfflineData({ source: f.source, destination: f.staged, offline: true });
  assert.equal((await importMigration({ dataDir: f.target, migrationDir: f.staged })).status, 'imported');
  await writeFile(path.join(f.target, 'keeper/garden-ledger.json'), 'NEW LEDGER FIXTURE');
  await writeFile(path.join(f.target, 'tailscale/tailscaled.state'), 'NEW VPN FIXTURE');
  assert.equal((await importMigration({ dataDir: f.target, migrationDir: f.staged })).status, 'already-imported');
  assert.equal(await readFile(path.join(f.target, 'keeper/garden-ledger.json'), 'utf8'), 'NEW LEDGER FIXTURE');
  assert.equal(await readFile(path.join(f.target, 'tailscale/tailscaled.state'), 'utf8'), 'NEW VPN FIXTURE');
  await rename(f.staged, path.join(f.root, 'retired-stage'));
  assert.equal((await importMigration({ dataDir: f.target, migrationDir: f.staged })).status, 'already-imported');
  await writeFile(path.join(f.target, 'keeper/witness-key.json'), 'CHANGED FIXTURE IDENTITY');
  await assert.rejects(importMigration({ dataDir: f.target, migrationDir: f.staged }), /identity changed/);
}));

test('tampered staging fails before importing any target state', () => fixture(async f => {
  await copyOfflineData({ source: f.source, destination: f.staged, offline: true });
  await writeFile(path.join(f.staged, 'keeper/garden-ledger.json'), 'TAMPERED FIXTURE');
  await assert.rejects(importMigration({ dataDir: f.target, migrationDir: f.staged }), /does not match/);
  await assert.rejects(readFile(path.join(f.target, 'keeper/witness-key.json')), { code: 'ENOENT' });
  assert.equal((await importMigration({ dataDir: f.target, migrationDir: path.join(f.root, 'absent') })).status, 'not-staged');
}));

test('unexpected initial data is never accepted as a fresh target', () => fixture(async f => {
  await copyOfflineData({ source: f.source, destination: f.staged, offline: true });
  await writeFile(path.join(f.target, 'unrelated-data.json'), 'KEEP THIS FIXTURE');
  await assert.rejects(importMigration({ dataDir: f.target, migrationDir: f.staged }), /Only its Supervisor options/);
  assert.equal(await readFile(path.join(f.target, 'unrelated-data.json'), 'utf8'), 'KEEP THIS FIXTURE');
}));

test('partial target state and altered migration inventories fail closed', () => fixture(async f => {
  await copyOfflineData({ source: f.source, destination: f.staged, offline: true });
  await mkdir(path.join(f.target, 'keeper'));
  await assert.rejects(importMigration({ dataDir: f.target, migrationDir: f.staged }), /already contains/);
  const record = path.join(f.staged, '.doodletick-migration.json');
  const data = JSON.parse(await readFile(record, 'utf8'));
  data.files[0].name = 'keeper/../../outside'; await writeFile(record, JSON.stringify(data));
  await assert.rejects(importMigration({ dataDir: f.target, migrationDir: f.staged }), /Unsafe/);
}));

test('hard-linked source files are rejected without replacing the destination', () => fixture(async f => {
  await link(path.join(f.source, 'keeper/witness-key.json'), path.join(f.source, 'keeper/duplicate.json'));
  await assert.rejects(copyOfflineData({ source: f.source, destination: f.target, offline: true }), /linked or non-regular/);
  await assert.rejects(readFile(path.join(f.target, 'keeper/witness-key.json')), { code: 'ENOENT' });
}));

test('disposable app rehearsal preserves witness receipts, signed balances, ownership and opaque VPN state', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'doodle-migration-'));
  const source = path.join(root, 'source'), staged = path.join(root, 'staged'), target = path.join(root, 'target');
  for (const directory of [source, staged, target, path.join(source, 'tailscale')]) await mkdir(directory, { mode: 0o700 });
  await writeFile(path.join(source, 'tailscale/tailscaled.state'), 'DISPOSABLE VPN FIXTURE');
  const who = await newIdentity('migration_fixture');
  let now = Math.floor(Date.now() / HOUR) * HOUR + HOUR / 2;
  const options = { port: 0, vpnOptions: { readStatus: async () => { throw Error('Isolated migration fixture'); } }, gardenOptions: { now: () => now } };
  let keeper;
  try {
    keeper = await createKeeperServer({ ...options, dataDir: path.join(source, 'keeper') });
    const initialBase = `http://127.0.0.1:${keeper.port}`;
    const initial = await (await fetch(initialBase + '/api/status')).json();
    const seal = await sealEntry(who, [], { title: 'Migration fixture', body: 'Disposable test', kind: 'Idea', revisionOf: null });
    assert.equal((await fetch(initialBase + '/api/witness', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ proof: seal.proof }) })).status, 200);
    const action = async (base, name, args, sequence) => {
      const proof = await gardenRequest(who, initial.fingerprint, name, args, sequence, now);
      const response = await fetch(base + '/vpn-api/garden/self/' + (name === 'account' ? 'account' : 'action'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(proof) });
      assert.equal(response.status, 200);
      const result = await response.json(); assert(await verifyGardenResponse(result, initial.fingerprint)); return result.record;
    };
    await action(initialBase, 'join', {}, 1);
    await action(initialBase, 'plant', { recipe: recipe({ kind: 'dot-mushroom', version: 1, name: 'Migration spore', settings: { seed: 135 }, patch: null }), credit: 'Migration fixture', rightsConfirmed: true }, 2);
    now += HOUR * 3;
    await action(initialBase, 'harvest', {}, 3);
    const before = await action(initialBase, 'account', {}, 0);
    assert.equal(before.balance, 2);
    await keeper.close(); keeper = null;
    await copyOfflineData({ source, destination: staged, offline: true });
    await importMigration({ dataDir: target, migrationDir: staged });
    await verifyOfflineData({ source, destination: target, offline: true });
    keeper = await createKeeperServer({ ...options, dataDir: path.join(target, 'keeper') });
    const migratedBase = `http://127.0.0.1:${keeper.port}`, status = await (await fetch(migratedBase + '/api/status')).json();
    assert.equal(status.fingerprint, initial.fingerprint); assert.equal(status.receipts, 1);
    const after = await action(migratedBase, 'account', {}, 0);
    for (const key of ['balance', 'pending', 'sequence', 'mushrooms', 'history']) assert.deepEqual(after[key], before[key], key);
    assert.equal(after.mushrooms[0].owner, who.fingerprint);
    assert.equal(await readFile(path.join(target, 'tailscale/tailscaled.state'), 'utf8'), 'DISPOSABLE VPN FIXTURE');
    await keeper.close(); keeper = null;
    assert.equal((await importMigration({ dataDir: target, migrationDir: staged })).status, 'already-imported');
  } finally {
    await keeper?.close();
    assert(root.startsWith(path.join(os.tmpdir(), 'doodle-migration-')));
    await rm(root, { recursive: true, force: true });
  }
});
