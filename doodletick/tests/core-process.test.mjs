// SPDX-License-Identifier: GPL-3.0-only
import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { mkdtemp, readFile, writeFile, readdir, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startCoreProcess, validateCoreOptions } from '../core-process.mjs';

const manifestFile = fileURLToPath(new URL('../../doodleverse-core/chain-manifest.json', import.meta.url));
const manifest = JSON.parse(await readFile(manifestFile, 'utf8'));

async function fixture(run) {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), 'dvc-process-test-'));
  try { await run(dataDir); }
  finally {
    assert.equal(path.dirname(dataDir), os.tmpdir()); assert(path.basename(dataDir).startsWith('dvc-process-test-'));
    await rm(dataDir, { recursive: true, force: true });
  }
}
function mock(dataDir, extra = {}) {
  let child, stopCount = 0, spawnCount = 0, argumentsUsed;
  return {
    options: { binary: process.execPath, manifestFile, dataDir, network: 'regtest', startupTimeoutMs: 30,
      spawnProcess(binary, args, options) {
        spawnCount++; argumentsUsed = { binary, args, options }; child = new EventEmitter(); child.pid = 12345;
        child.kill = () => { child.emit('exit', 0); return true; }; return child;
      },
      async rpcRequest(port, cookie, method) {
        if (method === 'stop') { stopCount++; queueMicrotask(() => child.emit('exit', 0)); return 'Stopping'; }
        if (method === 'getblockchaininfo') return { chain: 'regtest' };
        if (method === 'getblockhash') return manifest.networks.regtest.hash;
        if (method === 'getnetworkinfo') return { subversion: '/DoodleverseCore:1.1.0/' };
        throw Error('Unexpected test RPC');
      }, ...extra },
    get child() { return child; }, get stopCount() { return stopCount; }, get spawnCount() { return spawnCount; }, get argumentsUsed() { return argumentsUsed; }
  };
}

test('managed Core only accepts bounded concrete peer endpoints and a configured main network', () => {
  assert.deepEqual(validateCoreOptions({ peers: ['10.0.0.199:38474', '[::1]:18474'] }, manifest).peers, ['10.0.0.199:38474', '[::1]:18474']);
  for (const peer of ['example.com:38474', '10.0.0.1:0', '0.0.0.0:38474', '255.255.255.255:38474', '10.0.0.1:38474 -rpcbind=0.0.0.0', '999.1.1.1:38474', 'http://127.0.0.1:38474']) {
    assert.throws(() => validateCoreOptions({ peers: [peer] }, manifest));
  }
  assert.throws(() => validateCoreOptions({ peers: Array(9).fill('10.0.0.1:38474') }, manifest));
  assert.throws(() => validateCoreOptions({ peers: ['10.0.0.1:38474', '10.0.0.1:38474'] }, manifest));
  if (!manifest.mainnet_ready) assert.throws(() => validateCoreOptions({ network: 'main' }, manifest), /not configured/);
  const configured = structuredClone(manifest); configured.mainnet_ready = true;
  configured.networks.main.founder_script = '76a914' + '12'.repeat(20) + '88ac'; configured.networks.main.founder_is_public_test_fixture = false;
  assert.equal(validateCoreOptions({ network: 'main' }, configured).network, 'main');
  configured.networks.main.founder_is_public_test_fixture = true;
  assert.throws(() => validateCoreOptions({ network: 'main' }, configured));
});

test('managed Core starts without wallet keys or remote RPC and closes exactly once', () => fixture(async dataDir => {
  const control = mock(dataDir, { peers: ['10.0.0.199:18474'] });
  const core = await startCoreProcess(control.options);
  assert(core.healthy()); assert.equal(core.rpcUrl, 'http://127.0.0.1:18473');
  assert.equal(core.cookieFile, path.join(dataDir, 'regtest', '.cookie'));
  for (const argument of ['-disablewallet=1', '-txindex=1', '-rpcbind=127.0.0.1', '-rpcallowip=127.0.0.1', '-listen=0', '-connect=10.0.0.199:18474']) assert(control.argumentsUsed.args.includes(argument));
  assert.equal(control.argumentsUsed.options.shell, false); assert.equal(control.argumentsUsed.options.windowsHide, true);
  await Promise.all([core.close(), core.close()]); assert.equal(control.stopCount, 1); assert.equal(core.healthy(), false);
  assert.equal(JSON.parse(await readFile(path.join(dataDir, 'doodleverse-managed.json'), 'utf8')).genesis, manifest.networks.regtest.hash);
}));

test('a matching restart preserves data and switching networks refuses before launching', () => fixture(async dataDir => {
  const first = mock(dataDir); const core = await startCoreProcess(first.options); await core.close();
  await writeFile(path.join(dataDir, 'kept-fixture.txt'), 'test history');
  const second = mock(dataDir); const restarted = await startCoreProcess(second.options); await restarted.close();
  assert.equal(await readFile(path.join(dataDir, 'kept-fixture.txt'), 'utf8'), 'test history');
  const changed = mock(dataDir, { network: 'test' });
  await assert.rejects(startCoreProcess(changed.options), /different Doodleverse network/); assert.equal(changed.spawnCount, 0);
}));

test('unknown existing node data is preserved and never adopted implicitly', () => fixture(async dataDir => {
  await writeFile(path.join(dataDir, 'wallet-fixture.dat'), 'disposable marker only');
  const control = mock(dataDir);
  await assert.rejects(startCoreProcess(control.options), /unrecognized existing node data/); assert.equal(control.spawnCount, 0);
  assert.equal(await readFile(path.join(dataDir, 'wallet-fixture.dat'), 'utf8'), 'disposable marker only');
}));

test('a different genesis is rejected and the owned child is stopped', () => fixture(async dataDir => {
  const control = mock(dataDir); const normal = control.options.rpcRequest;
  control.options.rpcRequest = (port, cookie, method, params) => method === 'getblockhash' ? '00'.repeat(32) : normal(port, cookie, method, params);
  await assert.rejects(startCoreProcess(control.options), /does not match/); assert.equal(control.stopCount, 1);
}));

test('an unexpected child exit marks the service unhealthy and notifies its supervisor', () => fixture(async dataDir => {
  let notification;
  const control = mock(dataDir, { onUnexpectedExit: error => { notification = error; } });
  const core = await startCoreProcess(control.options);
  control.child.emit('exit', 1); assert.equal(core.healthy(), false); assert.match(notification.message, /stopped unexpectedly/);
  await core.close(); assert.equal(control.stopCount, 0);
}));

test('spawn failure is bounded and does not attempt to stop another service', () => fixture(async dataDir => {
  const control = mock(dataDir);
  const original = control.options.spawnProcess;
  control.options.spawnProcess = (...args) => { const child = original(...args); queueMicrotask(() => child.emit('error', Error('test executable unavailable'))); return child; };
  control.options.rpcRequest = async () => { throw Error('Not ready'); };
  await assert.rejects(startCoreProcess(control.options), /could not start/); assert.equal(control.stopCount, 0);
}));

test('an already aborted startup never spawns or changes node data', () => fixture(async dataDir => {
  const controller = new AbortController(); controller.abort();
  const control = mock(dataDir, { signal: controller.signal });
  await assert.rejects(startCoreProcess(control.options), { name: 'AbortError', code: 'ABORT_ERR' });
  assert.equal(control.spawnCount, 0); assert.equal(control.stopCount, 0);
  assert.deepEqual(await readdir(dataDir), []);
}));

test('aborting a pending readiness RPC promptly closes only the owned node', { timeout: 5000 }, () => fixture(async dataDir => {
  const controller = new AbortController();
  let observed, rejectPending;
  const pending = new Promise((resolve, reject) => { rejectPending = reject; });
  const attempted = new Promise(resolve => { observed = resolve; });
  const control = mock(dataDir, { signal: controller.signal, startupTimeoutMs: 60000 });
  const normal = control.options.rpcRequest;
  control.options.rpcRequest = (port, cookie, method, params) => {
    if (method === 'getblockchaininfo') { observed(); return pending; }
    return normal(port, cookie, method, params);
  };
  const startup = startCoreProcess(control.options);
  const rejected = assert.rejects(startup, { name: 'AbortError', code: 'ABORT_ERR' });
  await attempted;
  await writeFile(path.join(dataDir, 'kept-fixture.txt'), 'test history');
  controller.abort();
  await rejected;
  rejectPending(Error('late readiness failure'));
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(control.spawnCount, 1); assert.equal(control.stopCount, 1);
  assert.equal(await readFile(path.join(dataDir, 'kept-fixture.txt'), 'utf8'), 'test history');
}));

test('aborting during a startup retry does not wait for its pause', { timeout: 5000 }, () => fixture(async dataDir => {
  const controller = new AbortController();
  let observed;
  const retry = new Promise(resolve => { observed = resolve; });
  const control = mock(dataDir, { signal: controller.signal, startupTimeoutMs: 60000,
    pause: () => { observed(); return new Promise(() => {}); } });
  const normal = control.options.rpcRequest;
  control.options.rpcRequest = (port, cookie, method, params) => {
    if (method !== 'stop') throw Error('Not ready');
    return normal(port, cookie, method, params);
  };
  const rejected = assert.rejects(startCoreProcess(control.options), { name: 'AbortError', code: 'ABORT_ERR' });
  await retry;
  controller.abort();
  await rejected;
  assert.equal(control.spawnCount, 1); assert.equal(control.stopCount, 1);
}));
