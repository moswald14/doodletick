import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, mkdir, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { importMigration } from '../migration.mjs';

const execute = promisify(execFile);
const python = process.env.PYTHON || (process.platform === 'win32' ? 'python' : 'python3');
const moduleFile = fileURLToPath(new URL('../../scripts/migrate-stage.py', import.meta.url));
const fixtureFile = fileURLToPath(new URL('./migration-fixture.py', import.meta.url));

async function fixture(kind, run) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'doodle-migration-'));
  try {
    const { stdout } = await execute(python, ['-B', fixtureFile, moduleFile, root, kind], { timeout: 15000 });
    await run({ result: JSON.parse(stdout), root, staged: path.join(root, 'app-config', 'doodletick-migration') });
  } finally {
    assert(root.startsWith(path.join(os.tmpdir(), 'doodle-migration-')));
    await rm(root, { recursive: true, force: true });
  }
}

test('Python backup staging produces a verified one-time Node import without backup metadata or options', () => fixture('valid', async f => {
  assert.equal(f.result.ok, true); assert.equal(f.result.files, 4);
  const target = path.join(f.root, 'target'); await mkdir(target);
  assert.equal((await importMigration({ dataDir: target, migrationDir: f.staged })).status, 'imported');
  assert.equal(await readFile(path.join(target, 'keeper/witness-key.json'), 'utf8'), 'DISPOSABLE WITNESS FIXTURE');
  assert.equal(await readFile(path.join(target, 'tailscale/tailscaled.state'), 'utf8'), 'DISPOSABLE VPN FIXTURE');
  await assert.rejects(readFile(path.join(target, 'options.json')), { code: 'ENOENT' });
  await assert.rejects(readFile(path.join(target, 'addon.json')), { code: 'ENOENT' });
}));

for (const kind of ['traversal', 'duplicate', 'missing-vpn', 'link', 'existing', 'not-offline']) {
  test(`backup staging rejects ${kind} without a completion marker`, () => fixture(kind, async f => {
    assert.equal(f.result.ok, false); assert.equal(f.result.completedStage, false);
    if (kind === 'existing') assert.equal(await readFile(path.join(f.staged, 'keep.txt'), 'utf8'), 'KEEP FIXTURE');
  }));
}
