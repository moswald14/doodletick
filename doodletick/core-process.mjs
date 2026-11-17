// SPDX-License-Identifier: GPL-3.0-only
import { spawn } from 'node:child_process';
import { readFile, writeFile, mkdir, lstat, readdir } from 'node:fs/promises';
import { request } from 'node:http';
import { isIP } from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DEFAULT_MANIFEST = fileURLToPath(new URL('./core-source/chain-manifest.json', import.meta.url));
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const problem = message => Object.assign(new Error(message), { code: 'DVC_CORE_PROCESS' });
const networkNames = new Set(['main', 'test', 'regtest']);

export function validateCoreOptions({ network = 'regtest', peers = [], listen = false } = {}, manifest) {
  if (!networkNames.has(network) || !manifest?.networks?.[network]) throw problem('Select a supported Doodleverse network.');
  const chain = manifest.networks[network];
  if (!/^[0-9a-f]{64}$/.test(chain.hash) || !Number.isInteger(chain.rpc_port) || !Number.isInteger(chain.p2p_port)
    || chain.rpc_port < 1024 || chain.rpc_port > 65535 || chain.p2p_port < 1024 || chain.p2p_port > 65535) throw problem('The bundled Doodleverse chain definition is invalid.');
  if (network === 'main' && (manifest.mainnet_ready !== true || !/^76a914[0-9a-f]{40}88ac$/.test(chain.founder_script || '')
    || chain.founder_is_public_test_fixture !== false)) throw problem('The live network is not configured in this release.');
  if (typeof listen !== 'boolean' || !Array.isArray(peers) || peers.length > 8) throw problem('Invalid Doodleverse peer settings.');
  const checked = peers.map(peer => {
    if (typeof peer !== 'string' || peer.length > 64) throw problem('Use an IP address and port for each peer.');
    const match = peer.match(/^(?:\[([0-9a-fA-F:]+)\]|(\d{1,3}(?:\.\d{1,3}){3})):(\d{1,5})$/);
    const address = match?.[1] || match?.[2], port = Number(match?.[3]);
    if (!match || !isIP(address) || port < 1024 || port > 65535 || !Number.isInteger(port)
      || ['0.0.0.0', '::', '255.255.255.255'].includes(address)) throw problem('Use a concrete peer IP address and a port from 1024 to 65535.');
    return peer;
  });
  if (new Set(checked).size !== checked.length) throw problem('Remove duplicate Doodleverse peers.');
  return { network, peers: checked, listen, chain };
}

async function rpc(port, cookieFile, method, params = []) {
  if (!['getblockchaininfo', 'getblockhash', 'getnetworkinfo', 'stop'].includes(method)) throw problem('Unsupported internal node operation.');
  const cookieStat = await lstat(cookieFile);
  if (!cookieStat.isFile() || cookieStat.isSymbolicLink() || cookieStat.size > 512) throw problem('The node authentication file is invalid.');
  const cookie = (await readFile(cookieFile, 'utf8')).trim();
  if (!/^__cookie__:[A-Za-z0-9+/=]{16,256}$/.test(cookie)) throw problem('The node authentication file is invalid.');
  const payload = JSON.stringify({ jsonrpc: '1.0', id: 1, method, params });
  return new Promise((resolve, reject) => {
    const req = request({ hostname: '127.0.0.1', port, path: '/', method: 'POST', timeout: 5000,
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload), Authorization: 'Basic ' + Buffer.from(cookie).toString('base64') } }, res => {
      const chunks = []; let bytes = 0;
      res.on('data', chunk => { bytes += chunk.length; if (bytes > 1024 * 1024) res.destroy(problem('Node startup response is too large.')); else chunks.push(chunk); });
      res.on('error', reject);
      res.on('end', () => {
        try {
          const value = JSON.parse(Buffer.concat(chunks).toString('utf8'));
          if (res.statusCode !== 200 || value.id !== 1 || value.error || !Object.hasOwn(value, 'result')) throw problem('The node is not ready.');
          resolve(value.result);
        } catch { reject(problem('The node is not ready.')); }
      });
    });
    req.on('timeout', () => req.destroy(problem('The node response timed out.')));
    req.on('error', reject); req.end(payload);
  });
}

async function initializeData(dataDir, network, chain) {
  await mkdir(dataDir, { recursive: true, mode: 0o700 });
  const info = await lstat(dataDir);
  if (!info.isDirectory() || info.isSymbolicLink()) throw problem('The node data folder must be a real directory.');
  const marker = path.join(dataDir, 'doodleverse-managed.json');
  const expected = { schema: 1, network, genesis: chain.hash };
  try {
    const markerStat = await lstat(marker);
    if (!markerStat.isFile() || markerStat.isSymbolicLink() || markerStat.size > 1024) throw problem('The node data marker is invalid.');
    const existing = JSON.parse(await readFile(marker, 'utf8'));
    if (JSON.stringify(existing) !== JSON.stringify(expected)) throw problem('This data folder belongs to a different Doodleverse network.');
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    if ((await readdir(dataDir)).length) throw problem('Use a new data folder; unrecognized existing node data was preserved.');
    await writeFile(marker, JSON.stringify(expected), { flag: 'wx', mode: 0o600 });
  }
  // Ignore any user-written global config; only the explicit managed arguments apply.
  const configFile = path.join(dataDir, 'managed.conf');
  try { const info = await lstat(configFile); if (!info.isFile() || info.isSymbolicLink()) throw problem('The managed node configuration must be a regular file.'); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  await writeFile(configFile, '# Doodleverse managed node. Settings are supplied by the launcher.\n', { mode: 0o600 });
  return configFile;
}

export async function startCoreProcess({ binary = '/usr/local/bin/doodleverse-core', dataDir = '/data/doodleverse-core', network = 'regtest', peers = [], listen = false,
  manifestFile = DEFAULT_MANIFEST, rpcPort, p2pPort, startupTimeoutMs = 60000, onUnexpectedExit = () => {}, signal,
  spawnProcess = spawn, rpcRequest = rpc, pause = delay } = {}) {
  const aborted = () => Object.assign(new Error('Doodleverse node startup was cancelled. Its data was preserved.'), { name: 'AbortError', code: 'ABORT_ERR' });
  const checkAbort = () => { if (signal?.aborted) throw aborted(); };
  const duringStartup = pending => {
    if (!signal) return pending;
    return new Promise((resolve, reject) => {
      const cleanup = () => signal.removeEventListener('abort', stop);
      const stop = () => { cleanup(); reject(aborted()); };
      // Attach both handlers even if the signal already aborted, so a late RPC
      // rejection cannot become unhandled after startup has been cancelled.
      Promise.resolve(pending).then(value => { cleanup(); resolve(value); }, error => { cleanup(); reject(error); });
      signal.addEventListener('abort', stop, { once: true });
      if (signal.aborted) stop();
    });
  };
  checkAbort();
  const manifest = JSON.parse(await readFile(manifestFile, 'utf8'));
  const options = validateCoreOptions({ network, peers, listen }, manifest);
  const corePath = path.resolve(binary), directory = path.resolve(dataDir);
  const binaryStat = await lstat(corePath);
  if (!binaryStat.isFile() || binaryStat.isSymbolicLink()) throw problem('The bundled node executable is missing or linked.');
  const rpcNumber = rpcPort ?? options.chain.rpc_port, p2pNumber = p2pPort ?? options.chain.p2p_port;
  for (const value of [rpcNumber, p2pNumber]) if (!Number.isInteger(value) || value < 1024 || value > 65535) throw problem('Invalid local node port.');
  if (rpcNumber === p2pNumber || !Number.isFinite(startupTimeoutMs) || startupTimeoutMs < 1 || startupTimeoutMs > 180000) throw problem('Invalid node startup limits.');
  checkAbort();
  const configFile = await initializeData(directory, network, options.chain);
  const suffix = network === 'main' ? '' : network === 'test' ? 'testnet-dvc' : 'regtest';
  const cookieFile = path.join(directory, suffix, '.cookie');
  const args = [`-datadir=${directory}`, `-conf=${configFile}`, '-daemon=0', '-server=1', '-disablewallet=1', '-txindex=1', '-rest=0',
    '-rpcbind=127.0.0.1', '-rpcallowip=127.0.0.1', `-rpcport=${rpcNumber}`, `-port=${p2pNumber}`,
    `-listen=${listen ? 1 : 0}`, ...(listen ? ['-bind=0.0.0.0'] : []), '-dnsseed=0', '-discover=0', '-upnp=0', '-onion=0',
    '-maxconnections=16', '-maxmempool=64', '-dbcache=64', '-par=2', '-printtoconsole=0', '-shrinkdebugfile=1',
    ...(network === 'regtest' ? ['-regtest=1'] : network === 'test' ? ['-testnet=1'] : []),
    ...options.peers.map(peer => `-connect=${peer}`)];
  checkAbort();
  const child = spawnProcess(corePath, args, { cwd: directory, windowsHide: true, stdio: 'ignore', shell: false });
  let exited = false, ready = false, closing = false, spawnFailed = false, closePromise;
  const exit = new Promise(resolve => {
    child.once('error', () => { spawnFailed = true; exited = true; resolve(); if (ready && !closing) onUnexpectedExit(problem('The Doodleverse node stopped unexpectedly.')); });
    child.once('exit', () => { exited = true; resolve(); if (ready && !closing) onUnexpectedExit(problem('The Doodleverse node stopped unexpectedly.')); });
  });
  const close = () => closePromise ||= (async () => {
    closing = true; ready = false;
    if (exited) return;
    try { await rpcRequest(rpcNumber, cookieFile, 'stop'); } catch { /* Only this owned process can be terminated below. */ }
    let timer;
    const finished = await Promise.race([exit.then(() => true), new Promise(resolve => { timer = setTimeout(() => resolve(false), 20000); })]);
    clearTimeout(timer);
    if (!finished && !exited) {
      child.kill('SIGTERM');
      let lastTimer;
      const stopped = await Promise.race([exit.then(() => true), new Promise(resolve => { lastTimer = setTimeout(() => resolve(false), 5000); })]);
      clearTimeout(lastTimer);
      if (!stopped && !exited) throw problem('The owned Doodleverse node is still closing; its data was preserved.');
    }
  })();
  try {
    const deadline = Date.now() + startupTimeoutMs;
    while (!exited && Date.now() < deadline) {
      checkAbort();
      try {
        const [chain, genesis, info] = await duringStartup(Promise.all([
          rpcRequest(rpcNumber, cookieFile, 'getblockchaininfo'), rpcRequest(rpcNumber, cookieFile, 'getblockhash', [0]), rpcRequest(rpcNumber, cookieFile, 'getnetworkinfo')
        ]));
        checkAbort();
        if (chain?.chain !== network || genesis !== options.chain.hash || !/^\/DoodleverseCore:/.test(info?.subversion || '')) throw problem('The local node does not match the bundled Doodleverse network.');
        if (exited) throw problem('The Doodleverse node exited during startup. Its data was preserved.');
        ready = true;
        return { network, dataDir: directory, rpcUrl: `http://127.0.0.1:${rpcNumber}`, cookieFile, close, healthy: () => ready && !exited, pid: child.pid };
      } catch (error) {
        checkAbort();
        if (error.code === 'DVC_CORE_PROCESS' && error.message.includes('does not match')) throw error;
        await duringStartup(pause(150));
      }
    }
    checkAbort();
    throw problem(spawnFailed ? 'The bundled Doodleverse node could not start.' : exited ? 'The Doodleverse node exited during startup. Its data was preserved.' : 'The Doodleverse node is still starting. Its data was preserved; check its local log.');
  } catch (error) { await close().catch(() => {}); throw error; }
}
