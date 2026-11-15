import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, access } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { createKeeperServer } from '../server.mjs';

const offlineVpn = { readStatus: async () => ({ BackendState: 'Stopped' }) };
test('managed lock directory is separate from durable identity and still excludes a second writer', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'doodle-pi-test-'));
  const dataDir = path.join(root, 'data'), lockDir = path.join(root, 'run');
  let keeper;
  try {
    keeper = await createKeeperServer({ dataDir, lockDir, port: 0, vpnOptions: offlineVpn });
    await access(path.join(lockDir, 'server.lock'));
    await assert.rejects(access(path.join(dataDir, 'server.lock')), { code: 'ENOENT' });
    await assert.rejects(createKeeperServer({ dataDir, lockDir, port: 0, vpnOptions: offlineVpn }), /already running/);
    const identity = await readFile(path.join(dataDir, 'witness-key.json'), 'utf8');
    await keeper.close(); keeper = null;
    await assert.rejects(access(path.join(lockDir, 'server.lock')), { code: 'ENOENT' });
    keeper = await createKeeperServer({ dataDir, lockDir, port: 0, vpnOptions: offlineVpn });
    assert.equal(await readFile(path.join(dataDir, 'witness-key.json'), 'utf8'), identity);
  } finally {
    await keeper?.close();
    assert.equal(path.dirname(root), os.tmpdir());
    assert(path.basename(root).startsWith('doodle-pi-test-'));
    await rm(root, { recursive: true, force: true });
  }
});

test('CLI restarts after simulated service-manager runtime cleanup while preserving its identity', { timeout: 30000 }, async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'doodle-pi-crash-'));
  const dataDir = path.join(root, 'data'), lockDir = path.join(root, 'run');
  const entry = fileURLToPath(new URL('../server.mjs', import.meta.url));
  let child;
  async function start() {
    child = spawn(process.execPath, [entry], { env: { ...process.env, DOODLETICK_DATA: dataDir, DOODLETICK_LOCK_DIR: lockDir, DOODLETICK_PORT: '0' }, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '';
    const address = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Keeper did not start.')), 12000);
      child.stdout.on('data', chunk => { output += chunk; const match = output.match(/http:\/\/127\.0\.0\.1:\d+/); if (match) { clearTimeout(timer); resolve(match[0]); } });
      child.stderr.on('data', chunk => { output += chunk; });
      child.once('error', error => { clearTimeout(timer); reject(error); });
      child.once('exit', code => { clearTimeout(timer); reject(new Error(`Keeper exited ${code}: ${output}`)); });
    });
    return (await fetch(address + '/api/status')).json();
  }
  async function kill() {
    if (child && child.exitCode === null && child.signalCode === null) { const exited = once(child, 'exit'); child.kill('SIGKILL'); await exited; }
    child = null;
  }
  try {
    const before = await start();
    const identity = await readFile(path.join(dataDir, 'witness-key.json'), 'utf8');
    await kill();
    await access(path.join(lockDir, 'server.lock'));
    // Models systemd's RuntimeDirectoryPreserve=no; this is not a Linux boot test.
    assert.equal(path.dirname(lockDir), root);
    await rm(lockDir, { recursive: true });
    const after = await start();
    assert.equal(after.fingerprint, before.fingerprint);
    assert.equal(await readFile(path.join(dataDir, 'witness-key.json'), 'utf8'), identity);
  } finally {
    await kill();
    assert.equal(path.dirname(root), os.tmpdir());
    assert(path.basename(root).startsWith('doodle-pi-crash-'));
    await rm(root, { recursive: true, force: true });
  }
});
