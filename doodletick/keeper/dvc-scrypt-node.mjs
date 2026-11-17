// SPDX-License-Identifier: GPL-3.0-only
import { readFile, stat } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { SCRYPT_NETWORKS, createScryptWork, solveScryptCandidate } from './dvc-scrypt-protocol.mjs';

const failure = (message, status = 503) => Object.assign(new Error(message), { code: 'DVC_SCRYPT', status });
const methods = new Set(['getblockchaininfo', 'getnetworkinfo', 'getblockhash', 'getblocktemplate', 'getbestblockhash', 'getblockheader', 'submitblock', 'getblock', 'gettxout', 'getrawtransaction', 'sendrawtransaction']);
export function createCoreRpc({ url, cookieFile, fetcher = fetch }) {
  const endpoint = new URL(url);
  if (endpoint.protocol !== 'http:' || !['127.0.0.1', '[::1]'].includes(endpoint.hostname) || endpoint.username || endpoint.password || endpoint.pathname !== '/' || endpoint.search || endpoint.hash) throw failure('Core RPC must use an explicit loopback HTTP address.');
  if (typeof cookieFile !== 'string' || !cookieFile) throw failure('Configure the Core RPC cookie file locally.');
  return async (method, params = []) => {
    if (!methods.has(method)) throw failure('This node method is not exposed.');
    let response;
    try {
      if ((await stat(cookieFile)).size > 512) throw Error('Cookie exceeds limit');
      const cookie = (await readFile(cookieFile, 'utf8')).trim();
      if (!/^__cookie__:[A-Za-z0-9+/=]{16,256}$/.test(cookie)) throw Error('Invalid cookie');
      response = await fetcher(endpoint, { method: 'POST', redirect: 'error', signal: AbortSignal.timeout(10000),
        headers: { 'Content-Type': 'application/json', Authorization: 'Basic ' + Buffer.from(cookie).toString('base64') },
        body: JSON.stringify({ jsonrpc: '1.0', id: 1, method, params }) });
      // Core returns JSON-RPC errors with HTTP 500. Preserve only their numeric
      // code for retries; never relay its raw message or authentication data.
      if (![200, 400, 500].includes(response.status)) { await response.body?.cancel(); throw Error('RPC response'); }
      const reader = response.body.getReader(), parts = []; let size = 0;
      // Valid one-megabyte blocks can expand substantially in verbose JSON,
      // particularly scripts' opcode names. The index also checks wire sizes.
      const replyLimit = method === 'getblock' ? 64 * 1024 * 1024 : 4 * 1024 * 1024;
      try {
        for (;;) { const { value, done } = await reader.read(); if (done) break; size += value.length; if (size > replyLimit) throw Error('RPC reply exceeds limit'); parts.push(Buffer.from(value)); }
      } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
      const parsed = JSON.parse(Buffer.concat(parts).toString('utf8'));
      if (parsed.id !== 1 || !Object.hasOwn(parsed, 'result')) throw Error('RPC result');
      if (parsed.error) {
        if (!Number.isSafeInteger(parsed.error.code) || parsed.error.code >= 0 || parsed.error.code < -50000) throw Error('RPC error');
        throw Object.assign(failure('The Doodleverse node could not accept this request.', 400), { rpcCode: parsed.error.code });
      }
      if (!response.ok) throw Error('RPC response');
      return parsed.result;
    } catch (error) {
      if (error.code === 'DVC_SCRYPT' && Number.isSafeInteger(error.rpcCode)) throw error;
      throw failure('Doodleverse Core is unavailable. Check its local connection and cookie settings.');
    }
  };
}

export function createScryptBridge({ rpc, network = 'regtest', now = Date.now, maxJobs = 64 } = {}) {
  if (!SCRYPT_NETWORKS[network]?.enabled) throw failure('Select a network enabled by this Doodleverse release.');
  if (!Number.isInteger(maxJobs) || maxJobs < 1 || maxJobs > 128) throw failure('Invalid job capacity.');
  const jobs = new Map();
  const prune = () => { for (const [id, job] of jobs) if (job.expires <= now()) jobs.delete(id); };
  async function identity() {
    if (!rpc) throw failure('Start the matching Doodleverse Core node and configure its local connection first.');
    const [chain, genesis, info] = await Promise.all([rpc('getblockchaininfo'), rpc('getblockhash', [0]), rpc('getnetworkinfo')]);
    if (chain?.chain !== network || genesis !== SCRYPT_NETWORKS[network].genesis || !/^\/DoodleverseCore:/.test(info?.subversion || '')) throw failure('The connected node is not the pinned Doodleverse network.');
    if (!Number.isSafeInteger(chain.blocks) || chain.blocks < 0 || !Number.isSafeInteger(info.connections) || info.connections < 0) throw failure('The node returned invalid network information.');
    return { chain, info };
  }
  return {
    async status() {
      if (!rpc) return { connected: false, network, experimental: true, mainnetEnabled: false, message: 'No Core node connected. Enable the bundled node in app options or start the Windows miner.' };
      const { chain, info } = await identity();
      return { connected: true, network, experimental: true, mainnetEnabled: network === 'main', genesis: SCRYPT_NETWORKS[network].genesis, height: chain.blocks, peers: info.connections, algorithm: 'Scrypt 1024/1/1', maturity: 30 };
    },
    async job(address) {
      prune(); if (jobs.size >= maxJobs) throw failure('Mining job limit reached; wait for an old job to expire.', 429);
      await identity();
      const template = await rpc('getblocktemplate', [{ rules: ['segwit'] }]);
      const work = createScryptWork(template, address, network), id = randomBytes(24).toString('hex'), expires = now() + 120000;
      prune(); if (jobs.size >= maxJobs) throw failure('Mining job limit reached; retry shortly.', 429);
      jobs.set(id, { work, expires });
      return { id, expires, network, header: work.header.toString('hex'), target: work.target, height: work.height, address, rewardAtoms: work.reward, algorithm: 'scrypt-1024-1-1' };
    },
    async submit(id, nonce) {
      prune();
      if (typeof id !== 'string' || !/^[0-9a-f]{48}$/.test(id) || !jobs.has(id)) throw failure('This mining job expired or was already submitted. Start a fresh job.', 409);
      const { work } = jobs.get(id); jobs.delete(id);
      if (!Number.isSafeInteger(nonce) || nonce < 0 || nonce > 0xffffffff) throw failure('Invalid mining nonce.', 400);
      await identity();
      if (await rpc('getbestblockhash') !== work.previous) throw failure('Another block arrived first. Request fresh work.', 409);
      const candidate = solveScryptCandidate(work, nonce);
      const result = await rpc('submitblock', [candidate.block]);
      if (result !== null) throw failure('The node rejected this block. Request fresh work.', 409);
      const header = await rpc('getblockheader', [candidate.hash]);
      if (!Number.isSafeInteger(header?.confirmations) || header.confirmations < 1 || header?.height !== work.height || header?.hash !== candidate.hash) throw failure('This block is not on the active chain. Request fresh work.', 409);
      return { accepted: true, hash: candidate.hash, height: work.height, address: work.address, rewardAtoms: work.reward, maturity: 30, network };
    },
  };
}

export function scryptBridgeFromEnvironment(environment = process.env) {
  return createScryptBridge(coreConfigurationFromEnvironment(environment));
}

export function coreConfigurationFromEnvironment(environment = process.env) {
  const url = environment.DVC_CORE_RPC_URL, cookieFile = environment.DVC_CORE_RPC_COOKIE;
  if (!url && !cookieFile) return { network: 'regtest' };
  try {
    const network = environment.DVC_CORE_NETWORK || 'regtest';
    if (!SCRYPT_NETWORKS[network]?.enabled) throw Error('Network unavailable');
    return { network, rpc: createCoreRpc({ url, cookieFile }) };
  } catch {
    return { network: 'regtest', rpc: async () => { throw failure('The Core connection settings need correction. Other Keeper features remain available.'); } };
  }
}
