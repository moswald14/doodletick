// SPDX-License-Identifier: GPL-3.0-only
// Tests an explicitly selected extracted package with disposable data only.
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtemp, readdir, readFile, rm, mkdir } from 'node:fs/promises';
import { request } from 'node:http';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';

assert(process.platform === 'win32', 'Run this native package check on Windows.');
assert(process.argv.length === 4 && process.argv[2] === '--bundle', 'Usage: node check-package.mjs --bundle EXTRACTED_PACKAGE');
const bundle = path.resolve(process.argv[3]);
const manifest = JSON.parse(await readFile(path.join(bundle, 'bundle-manifest.json'), 'utf8'));
assert.equal(manifest.product, 'Doodleverse Windows GPU miner');
const binary = path.join(bundle, 'runtime', 'node.exe');
assert.equal(createHash('sha256').update(await readFile(binary)).digest('hex'), manifest.filesSha256['runtime/node.exe']);
const temporary = await mkdtemp(path.join(os.tmpdir(), 'dvc-package-check-'));

function run(suffix) {
  const directory = path.join(temporary, suffix);
  let child, output = '';
  const begin = async () => {
    await mkdir(directory);
    child = spawn(binary, [path.join(bundle, 'launcher.mjs'), '--check'], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, TEMP: directory, TMP: directory } });
    for (const stream of [child.stdout, child.stderr]) stream.on('data', chunk => { output = (output + chunk).slice(-8192); });
    return new Promise((resolve, reject) => { child.once('exit', code => resolve(code)); child.once('error', reject); });
  };
  const completed = begin();
  return { directory, completed, get child() { return child; }, get output() { return output; } };
}
const send = (record, token, origin) => new Promise((resolve, reject) => {
  const req = request({ hostname: '127.0.0.1', port: record.port, path: '/stop', method: 'POST', timeout: 5000,
    headers: { Authorization: 'Bearer ' + token, 'Content-Length': 0, ...(origin ? { Origin: origin } : {}) } }, res => { res.resume(); res.on('end', () => resolve(res.statusCode)); });
  req.on('error', reject); req.on('timeout', () => req.destroy(Error('Stop endpoint timed out.'))); req.end();
});
let stopped, record;
try {
  const normal = run('normal');
  assert.equal(await normal.completed, 0, normal.output);
  const normalResult = JSON.parse(normal.output.trim().split('\n').at(-1));
  assert.equal(normalResult.passed, true); assert.equal(normalResult.temporaryDataRemoved, true);
  assert.equal(normalResult.node, 'v' + manifest.nodeVersion);
  assert(normalResult.checks.includes('stale persistent Keeper lock preserved'));
  assert(normalResult.checks.includes('private runtime lock cleanup'));
  assert.deepEqual(await readdir(normal.directory), []);

  stopped = run('early-stop');
  const deadline = Date.now() + 30000;
  while (!record && (!stopped.child || stopped.child.exitCode === null) && Date.now() < deadline) {
    let entries = [];
    try { entries = await readdir(stopped.directory, { withFileTypes: true }); } catch (error) { if (error.code !== 'ENOENT') throw error; }
    for (const entry of entries) {
      if (!entry.isDirectory() || !entry.name.startsWith('dvc-portable-check-')) continue;
      try {
        const candidate = JSON.parse(await readFile(path.join(stopped.directory, entry.name, 'launcher-control.json'), 'utf8'));
        if (candidate.pid === stopped.child?.pid && candidate.schema === 1 && /^[0-9a-f]{64}$/.test(candidate.token)) record = candidate;
      } catch { /* The owned child may still be writing its control record. */ }
    }
    if (!record) await new Promise(resolve => setTimeout(resolve, 30));
  }
  assert(record, 'The task-owned control endpoint did not appear.');
  assert.equal(await send(record, '00'.repeat(32)), 403);
  // HTTP permits Latin-1 header bytes. Equal JS string lengths must never reach
  // timingSafeEqual with unequal Buffer lengths and crash the owned launcher.
  assert.equal(await send(record, '\u00e9'.repeat(64)), 403);
  assert.equal(await send(record, record.token, 'https://untrusted.example'), 403);
  assert.equal(await send(record, record.token), 200);
  assert.equal(await stopped.completed, 0, stopped.output);
  assert.deepEqual(await readdir(stopped.directory), []);
  console.log(JSON.stringify({ passed: true, release: manifest.release, node: normalResult.node,
    checks: [...normalResult.checks, 'wrong stop token rejected', 'non-ASCII stop token rejected', 'browser-origin stop rejected', 'safe stop during startup'],
    browserGpuTest: 'not performed by this native service test', temporaryDataRemoved: true }));
} finally {
  if (stopped?.child?.exitCode === null && record) await send(record, record.token).catch(() => {});
  if (stopped) await stopped.completed;
  assert.equal(path.dirname(temporary), os.tmpdir()); assert(path.basename(temporary).startsWith('dvc-package-check-'));
  await rm(temporary, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
}
