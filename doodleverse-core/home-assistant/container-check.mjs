// SPDX-License-Identifier: GPL-3.0-only
// Runs in an isolated --network none CI container, never on the operator's data.
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const { startCoreProcess } = await import('/opt/doodletick/core-process.mjs');
const directory = await mkdtemp(path.join(os.tmpdir(), 'dvc-container-check-'));
const settings = { dataDir: directory, network: 'regtest', startupTimeoutMs: 30000 };
let node;
try {
  node = await startCoreProcess(settings);
  assert(node.healthy());
  await assert.rejects(promisify(execFile)('/usr/local/bin/doodleverse-cli', ['-regtest', '-datadir=' + directory, 'getwalletinfo']), error => /Method not found/i.test(error.stderr));
  const marker = await readFile(path.join(directory, 'doodleverse-managed.json'), 'utf8');
  await node.close(); assert.equal(node.healthy(), false);
  node = await startCoreProcess(settings);
  assert(node.healthy()); assert.equal(await readFile(path.join(directory, 'doodleverse-managed.json'), 'utf8'), marker);
  await node.close(); node = null;
  await assert.rejects(startCoreProcess({ ...settings, network: 'test' }), /different Doodleverse network/);
  console.log(JSON.stringify({ passed: true, architecture: process.arch, network: 'disposable regtest', checks: ['native Core readiness', 'loopback RPC', 'wallet-disabled build', 'graceful shutdown', 'persistent restart', 'network data isolation'] }));
} finally {
  await node?.close();
  assert.equal(path.dirname(directory), os.tmpdir()); assert(path.basename(directory).startsWith('dvc-container-check-'));
  await rm(directory, { recursive: true, force: true });
}
