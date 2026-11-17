// SPDX-License-Identifier: GPL-3.0-only
// Portable Windows entry point. It starts services, never mining or payments.
import { readFile, writeFile, mkdir, lstat, open, unlink, mkdtemp, rm, realpath } from 'node:fs/promises';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { createServer, request } from 'node:http';
import { createServer as createTcpServer } from 'node:net';
import { spawn } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import os from 'node:os';
import path from 'node:path';

const bundle = path.dirname(fileURLToPath(import.meta.url));
const checkOnly = process.argv.length === 3 && process.argv[2] === '--check';
const stopOnly = process.argv.length === 3 && process.argv[2] === '--stop';
if (process.argv.length > 2 && !checkOnly && !stopOnly) throw Error('Use Start-Doodleverse.cmd or Stop-Doodleverse.cmd.');
if (process.platform !== 'win32') throw Error('This package is for 64-bit Windows.');
const normalData = path.resolve(process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'), 'Doodleverse');

async function readJSON(file, maximum = 2 * 1024 * 1024) {
  const info = await lstat(file);
  if (!info.isFile() || info.isSymbolicLink() || info.size > maximum) throw Error('A launcher file is missing or invalid.');
  return JSON.parse(await readFile(file, 'utf8'));
}
function controlRequest(record, operation) {
  if (!record || record.schema !== 1 || !/^[0-9a-f]{64}$/.test(record.token) || !Number.isInteger(record.port) || record.port < 1024 || record.port > 65535) throw Error('The launcher is still starting or its control record is invalid.');
  return new Promise((resolve, reject) => {
    const req = request({ hostname: '127.0.0.1', port: record.port, path: operation, method: 'POST', timeout: 5000,
      headers: { Authorization: 'Bearer ' + record.token, 'Content-Length': '0' } }, res => {
      const chunks = []; let bytes = 0;
      res.on('data', chunk => { bytes += chunk.length; if (bytes > 1024) res.destroy(); else chunks.push(chunk); });
      res.on('error', reject); res.on('end', () => {
        try { if (res.statusCode !== 200) throw Error('The local launcher did not accept this command.'); resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
        catch { reject(Error('The local launcher returned an invalid command result.')); }
      });
    });
    req.on('error', reject); req.on('timeout', () => req.destroy(Error('The local launcher did not respond.'))); req.end();
  });
}
async function verifyBundle() {
  const manifest = await readJSON(path.join(bundle, 'bundle-manifest.json'));
  if (manifest.product !== 'Doodleverse Windows GPU miner' || manifest.platform !== 'win-x64' || !manifest.filesSha256 || Object.keys(manifest.filesSha256).length > 2000) throw Error('This miner package has an invalid manifest.');
  for (const required of ['runtime/node.exe', 'core/bin/pepecoind.exe', 'app/core-process.mjs', 'keeper/server.mjs', 'launcher.mjs']) if (!Object.hasOwn(manifest.filesSha256, required)) throw Error('This miner package has an incomplete manifest.');
  if (process.version !== 'v' + manifest.nodeVersion) throw Error('Use the matching runtime through Start-Doodleverse.cmd.');
  for (const [relative, expected] of Object.entries(manifest.filesSha256)) {
    if (!/^[a-zA-Z0-9_.-]+(?:\/[a-zA-Z0-9_.-]+)*$/.test(relative) || relative.split('/').some(part => part === '.' || part === '..') || !/^[0-9a-f]{64}$/.test(expected)) throw Error('The package contains an unsafe file path.');
    const file = path.join(bundle, ...relative.split('/')), info = await lstat(file);
    if (!info.isFile() || info.isSymbolicLink() || createHash('sha256').update(await readFile(file)).digest('hex') !== expected) throw Error('A miner package file changed. Extract a fresh verified package before starting.');
  }
  return manifest;
}
const unusedPort = async () => {
  const server = createTcpServer(); await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const port = server.address().port; await new Promise(resolve => server.close(resolve)); return port;
};
async function openMiner(url) {
  const candidates = [process.env.ProgramFiles, process.env['ProgramFiles(x86)'], process.env.LOCALAPPDATA].filter(Boolean).map(base => path.join(base, 'Google', 'Chrome', 'Application', 'chrome.exe'));
  for (const candidate of candidates) {
    try {
      if (!(await lstat(candidate)).isFile()) continue;
      const browser = spawn(candidate, [url], { detached: true, stdio: 'ignore', windowsHide: false, shell: false }); browser.on('error', () => {}); browser.unref(); return;
    } catch { /* Try another standard Chrome location. */ }
  }
  console.log('Open this address in Chrome or another browser with hardware WebGPU: ' + url);
}

if (stopOnly) {
  const file = path.join(normalData, 'launcher-control.json');
  try { const result = await controlRequest(await readJSON(file, 1024), '/stop'); if (!result.stopping) throw Error('Unexpected stop response.'); console.log('Doodleverse is stopping safely.'); }
  catch (error) { console.error(error.code === 'ENOENT' ? 'Doodleverse is not running.' : 'Could not contact the running launcher. Use Ctrl+C in its window.'); process.exitCode = error.code === 'ENOENT' ? 0 : 1; }
} else {
  let dataDir, runtimeLockDir, runtimeLockParent, core, keeper, control, lockHandle, lockPath, closing, startupReady, requestedStop = false, signalListeners = [];
  const startupComplete = new Promise(resolve => { startupReady = resolve; });
  const close = () => closing ||= (async () => {
    await startupComplete;
    for (const [signal, listener] of signalListeners) process.off(signal, listener);
    let keeperClosed = !keeper;
    if (keeper) {
      try { await keeper.close(); keeperClosed = true; }
      catch { process.exitCode = 1; }
    }
    if (core) await core.close().catch(() => { process.exitCode = 1; });
    if (control) { control.closeAllConnections(); await new Promise(resolve => control.close(resolve)); }
    if (runtimeLockDir && keeperClosed) {
      const resolved = await realpath(runtimeLockDir), info = await lstat(runtimeLockDir);
      if (resolved !== runtimeLockDir || path.dirname(resolved) !== runtimeLockParent || !path.basename(resolved).startsWith('dvc-launcher-runtime-') || !info.isDirectory() || info.isSymbolicLink()) throw Error('Unexpected launcher runtime cleanup path.');
      await rm(resolved, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
    }
    if (lockHandle) { await lockHandle.close(); await unlink(lockPath).catch(() => {}); }
    if (checkOnly && dataDir) {
      if (path.dirname(dataDir) !== os.tmpdir() || !path.basename(dataDir).startsWith('dvc-portable-check-')) throw Error('Unexpected test cleanup path.');
      await rm(dataDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
    }
  })();
  try {
    const packaged = await verifyBundle();
    const { startCoreProcess, validateCoreOptions } = await import(pathToFileURL(path.join(bundle, 'app', 'core-process.mjs')));
    const { createKeeperServer } = await import(pathToFileURL(path.join(bundle, 'keeper', 'server.mjs')));
    const manifestFile = path.join(bundle, 'app', 'core-source', 'chain-manifest.json');
    const manifest = await readJSON(manifestFile);
    const settings = checkOnly ? { network: 'regtest', peers: [] } : await readJSON(path.join(bundle, 'miner-settings.json'), 8192);
    if (!settings || Object.keys(settings).sort().join(',') !== 'network,peers') throw Error('miner-settings.json accepts only network and peers.');
    validateCoreOptions(settings, manifest);
    dataDir = checkOnly ? await mkdtemp(path.join(os.tmpdir(), 'dvc-portable-check-')) : normalData;
    await mkdir(dataDir, { recursive: true, mode: 0o700 });
    if ((await lstat(dataDir)).isSymbolicLink()) throw Error('The Doodleverse data folder must not be linked.');
    lockPath = path.join(dataDir, 'launcher-control.json');
    try { lockHandle = await open(lockPath, 'wx', 0o600); }
    catch (error) {
      if (error.code !== 'EEXIST') throw error;
      const old = await readJSON(lockPath, 1024);
      if (!Number.isInteger(old.pid) || old.pid < 1) throw Error('An existing launcher record needs inspection. Your data was preserved.');
      let dead = false;
      try { process.kill(old.pid, 0); } catch (probe) { if (probe.code === 'ESRCH') dead = true; }
      if (!dead) throw Error('Doodleverse is already running or starting. Use its existing window or Stop-Doodleverse.cmd.');
      if (JSON.stringify(await readJSON(lockPath, 1024)) !== JSON.stringify(old)) throw Error('Another launcher started.');
      await unlink(lockPath); lockHandle = await open(lockPath, 'wx', 0o600);
    }
    const token = randomBytes(32).toString('hex');
    const expectedAuthorization = Buffer.from('Bearer ' + token, 'ascii');
    control = createServer((req, res) => {
      const supplied = req.headers.authorization;
      const suppliedBytes = typeof supplied === 'string' && /^Bearer [0-9a-f]{64}$/.test(supplied) ? Buffer.from(supplied, 'ascii') : null;
      if (req.socket.remoteAddress !== '127.0.0.1' || req.method !== 'POST' || req.url !== '/stop' || req.headers.origin || req.headers['transfer-encoding'] || req.headers['content-length'] !== '0'
        || !suppliedBytes || suppliedBytes.length !== expectedAuthorization.length || !timingSafeEqual(suppliedBytes, expectedAuthorization)) { res.writeHead(403); res.end(); return; }
      res.once('finish', () => { requestedStop = true; void close(); });
      res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end('{"stopping":true}');
    });
    await new Promise((resolve, reject) => { control.once('error', reject); control.listen(0, '127.0.0.1', resolve); });
    await lockHandle.writeFile(JSON.stringify({ schema: 1, pid: process.pid, port: control.address().port, token }));
    for (const signal of ['SIGINT', 'SIGTERM']) { const listener = () => { requestedStop = true; void close(); }; signalListeners.push([signal, listener]); process.on(signal, listener); }
    core = await startCoreProcess({ ...settings, binary: path.join(bundle, 'core', 'bin', 'pepecoind.exe'),
      dataDir: path.join(dataDir, settings.network, 'core'), manifestFile,
      ...(checkOnly ? { rpcPort: await unusedPort(), p2pPort: await unusedPort() } : {}),
      onUnexpectedExit: () => { console.error('The node stopped. Your data is preserved; restart the launcher.'); process.exitCode = 1; void close(); } });
    if (requestedStop || !core.healthy()) throw Error('Stopped during startup.');
    process.env.DVC_CORE_NETWORK = core.network; process.env.DVC_CORE_RPC_URL = core.rpcUrl; process.env.DVC_CORE_RPC_COOKIE = core.cookieFile;
    // The launcher control record and Core's own data lock serialize persistent
    // state. A fresh private runtime lock avoids adopting or deleting a stale
    // Keeper lock left in that state by a previous interrupted launcher.
    runtimeLockParent = await realpath(os.tmpdir());
    runtimeLockDir = await mkdtemp(path.join(runtimeLockParent, 'dvc-launcher-runtime-'));
    const keeperData = path.join(dataDir, settings.network, 'keeper');
    const staleLockFixture = 'Disposable interrupted-session lock. Do not overwrite.\n';
    if (checkOnly) {
      await mkdir(keeperData, { recursive: true, mode: 0o700 });
      await writeFile(path.join(keeperData, 'server.lock'), staleLockFixture, { flag: 'wx', mode: 0o600 });
    }
    keeper = await createKeeperServer({ dataDir: keeperData, lockDir: runtimeLockDir, port: checkOnly ? 0 : 4329 });
    if (requestedStop || !core.healthy()) throw Error('Stopped during startup.');
    startupReady();
    const url = `http://127.0.0.1:${keeper.port}/scrypt.html`;
    if (checkOnly) {
      const response = await fetch(`http://127.0.0.1:${keeper.port}/scrypt/status`, { signal: AbortSignal.timeout(10000) });
      const status = await response.json();
      if (!response.ok || !status.connected || status.network !== 'regtest' || !core.healthy()) throw Error('The packaged miner cannot reach its verified test node.');
      if (await readFile(path.join(keeperData, 'server.lock'), 'utf8') !== staleLockFixture) throw Error('An existing Keeper lock was unexpectedly changed.');
      await close();
      console.log(JSON.stringify({ passed: true, package: packaged.release, node: process.version, checks: ['package file hashes', 'bundled Core readiness', 'Keeper connection', 'persistent folders isolated', 'stale persistent Keeper lock preserved', 'private runtime lock cleanup', 'clean shutdown'], browserGpuTest: 'not performed by this launcher check', temporaryDataRemoved: true }));
    } else {
      console.log(`Doodleverse ${packaged.release} is ready.\n${url}\nMining is stopped. Choose a receiving address and press MINE NOW in the browser.\nUse Stop-Doodleverse.cmd or Ctrl+C here to stop the local services safely.\nYour saved node and Keeper data are in: ${dataDir}`);
      await openMiner(url);
    }
  } catch (error) {
    startupReady();
    if (requestedStop) console.log('Doodleverse stopped.');
    else { console.error('Doodleverse could not start: ' + error.message); process.exitCode = 1; }
    await close();
  }
}
