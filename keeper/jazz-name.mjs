// SPDX-License-Identifier: GPL-3.0-only
import { randomBytes, createHash, timingSafeEqual } from 'node:crypto';
import { mkdir, readFile, lstat, open, rename, unlink } from 'node:fs/promises';
import path from 'node:path';
import { PEPE_CHAIN_ID, PEPE_CONTRACT, JAZZ_NAME_USD, isAddress, isTransactionHash, validateJazzContext, validateJazzResult } from './public/jazz-name-contract.mjs';
import { createJazzNetwork, quotePepeUnits, verifyPepePayment, JAZZ_MODEL } from './jazz-name-network.mjs';

const MAX_ATTEMPTS = 3, MAX_QUOTES = 5000, QUOTE_MS = 5 * 60 * 1000;
const digest = text => createHash('sha256').update(text).digest('hex');
const error = (message, status = 400) => Object.assign(new Error(message), { status });
export function jazzConfigFromEnvironment(env = process.env) {
  return { enabled: env.DOODLETICK_JAZZ_ENABLED === 'true', apiKey: env.OPENAI_API_KEY || '',
    recipient: env.DOODLETICK_JAZZ_RECIPIENT || '', network: env.DOODLETICK_JAZZ_NETWORK || '',
    rpcUrl: env.DOODLETICK_JAZZ_RPC_URL || 'https://ethereum-rpc.publicnode.com', dailyLimit: Number(env.DOODLETICK_JAZZ_DAILY_LIMIT || 30) };
}
function configurationReady(config) {
  try {
    const rpc = new URL(config.rpcUrl);
    return config.enabled === true && config.network === 'ethereum' && isAddress(config.recipient)
      && typeof config.apiKey === 'string' && config.apiKey.trim().length >= 20 && !/[\r\n]/.test(config.apiKey)
      && rpc.protocol === 'https:' && !rpc.username && !rpc.password && !rpc.hash
      && Number.isInteger(config.dailyLimit) && config.dailyLimit >= 3 && config.dailyLimit <= 1000;
  } catch { return false; }
}

export async function createJazzNamingService({ dataDir, config = jazzConfigFromEnvironment(), network, now = Date.now } = {}) {
  const configured = configurationReady(config);
  const remote = network || (configured ? createJazzNetwork(config) : null);
  const filename = path.join(dataDir, 'jazz-naming.json');
  let state = { version: 1, quotes: [], calls: {} }, fault = false, closing = false, chain = Promise.resolve();
  const tasks = new Set();
  try {
    await mkdir(dataDir, { recursive: true, mode: 0o700 });
    const info = await lstat(filename).catch(e => { if (e.code !== 'ENOENT') throw e; return null; });
    if (info) {
      if (!info.isFile() || info.isSymbolicLink() || info.size > 32_000_000) throw new Error('Invalid store.');
      state = JSON.parse(await readFile(filename, 'utf8'));
      if (state.version !== 1 || !Array.isArray(state.quotes) || state.quotes.length > MAX_QUOTES || !state.calls || Array.isArray(state.calls) || typeof state.calls !== 'object') throw new Error('Invalid store.');
      const ids = new Set(), amounts = new Set(), hashes = new Set();
      for (const q of state.quotes) {
        if (!/^[a-f0-9]{32}$/.test(q.id) || !/^[a-f0-9]{64}$/.test(q.capabilityHash) || ids.has(q.id) || amounts.has(q.amount)
          || !/^[1-9][0-9]{0,76}$/.test(q.amount) || !/^[0-9]{1,24}$/.test(q.minimumBlock) || !isAddress(q.payer) || !isAddress(q.recipient)
          || !Number.isSafeInteger(q.createdAt) || !Number.isSafeInteger(q.expiresAt) || q.expiresAt - q.createdAt !== QUOTE_MS
          || !Number.isInteger(q.attempts) || q.attempts < 0 || q.attempts > MAX_ATTEMPTS
          || !['quoted', 'pending', 'generating', 'retry', 'complete', 'exhausted'].includes(q.status)) throw new Error('Invalid store.');
        validateJazzContext(q.context); if (q.result) validateJazzResult(q.result);
        if (q.status === 'complete' && !q.result) throw new Error('Invalid store.');
        if (q.paid) { if (!isTransactionHash(q.hash) || hashes.has(q.hash)) throw new Error('Invalid store.'); hashes.add(q.hash); }
        if (q.status === 'generating') { q.status = q.attempts < MAX_ATTEMPTS ? 'retry' : 'exhausted'; q.message = 'Generation was interrupted. Your payment is saved; retry without paying again.'; }
        ids.add(q.id); amounts.add(q.amount);
      }
      if (Object.entries(state.calls).some(([day, count]) => !/^\d{4}-\d{2}-\d{2}$/.test(day) || !Number.isSafeInteger(count) || count < 0 || count > 1000)) throw new Error('Invalid store.');
    }
  } catch { fault = true; }
  const ready = () => configured && !fault && !closing;
  const requireReady = () => { if (!ready()) throw error('Song naming is not connected yet. The Keeper owner must finish setup before any payment.', 503); };
  function serialized(fn) { const job = chain.then(fn); chain = job.catch(() => {}); return job; }
  async function persist() {
    const temporary = filename + '.new';
    let file;
    try {
      // Never follow a pre-existing temporary file or link after a crash.
      const stale = await lstat(temporary).catch(e => { if (e.code !== 'ENOENT') throw e; return null; });
      if (stale) { if (!stale.isFile() || stale.isSymbolicLink()) throw new Error('Invalid store.'); await unlink(temporary); }
      file = await open(temporary, 'wx', 0o600);
      await file.writeFile(JSON.stringify(state)); await file.sync(); await file.close(); file = null;
      await rename(temporary, filename);
      if (process.platform !== 'win32') { const directory = await open(dataDir, 'r'); try { await directory.sync(); } finally { await directory.close(); } }
    } catch { await file?.close().catch(() => {}); fault = true; throw error('Payment records need the Keeper owner’s attention. No new payments can be accepted.', 503); }
  }
  const day = () => new Date(now()).toISOString().slice(0, 10);
  const reserved = except => state.quotes.reduce((n, q) => n + (q.id !== except && !q.result && q.attempts < MAX_ATTEMPTS
    && (q.paid || q.expiresAt > now()) ? MAX_ATTEMPTS - q.attempts : 0), 0);
  function find(id, capability) {
    if (typeof id !== 'string' || !/^[a-f0-9]{32}$/.test(id) || typeof capability !== 'string' || !/^[a-f0-9]{64}$/.test(capability)) throw error('This naming receipt is not available.', 404);
    const q = state.quotes.find(q => q.id === id);
    if (!q || !timingSafeEqual(Buffer.from(q.capabilityHash, 'hex'), Buffer.from(digest(capability), 'hex'))) throw error('This naming receipt is not available.', 404);
    return q;
  }
  function publicJob(q) {
    return { id: q.id, status: q.status, paid: !!q.paid, hash: q.hash || null, expiresAt: q.expiresAt,
      message: q.message || (q.status === 'complete' ? 'Your title and beat are ready.' : 'Your payment has not been confirmed.'),
      canRetry: q.status === 'retry' && q.attempts < MAX_ATTEMPTS, result: q.result || null, context: q.context };
  }
  async function startGeneration(q) {
    if ((state.calls[day()] || 0) + reserved(q.id) >= config.dailyLimit) throw error('The daily generation limit is reached. Your paid receipt is saved; try again tomorrow.', 429);
    q.status = 'generating'; q.message = 'Payment confirmed. OpenAI is writing a title and a new beat.'; q.attempts++;
    state.calls[day()] = (state.calls[day()] || 0) + 1;
    await persist();
    const task = (async () => {
      let result;
      try { result = validateJazzResult(await remote.generate(q.context)); }
      catch { /* Do not expose upstream errors, request headers or credentials. */ }
      await serialized(async () => {
        if (result) { q.result = result; q.status = 'complete'; q.message = 'Your title and beat are ready.'; }
        else { q.status = q.attempts < MAX_ATTEMPTS ? 'retry' : 'exhausted'; q.message = q.status === 'retry'
          ? 'Generation did not finish. Your payment is saved. Retry without paying again.'
          : 'Generation needs the Keeper owner’s help. Keep this paid receipt; do not pay again.'; }
        await persist();
      });
    })();
    tasks.add(task); task.catch(() => {}).finally(() => tasks.delete(task));
  }
  return {
    configuration() {
      return { ready: ready(), chainId: PEPE_CHAIN_ID, contract: PEPE_CONTRACT, usd: JAZZ_NAME_USD,
        recipient: isAddress(config.recipient) ? config.recipient : null, model: JAZZ_MODEL,
        message: ready() ? 'A title and new beat cost about $0.02 in PEPE, plus the Ethereum fee in ETH.' : 'Song naming is not connected yet. No payment will be requested.' };
    },
    quote(input) { return serialized(async () => {
      requireReady();
      if (!isAddress(input.payer)) throw error('Connect an Ethereum wallet first.');
      const context = validateJazzContext(input.context), payer = input.payer.toLowerCase();
      if (state.quotes.some(q => q.payer === payer && !q.result && (q.paid || q.expiresAt > now()))) throw error('This wallet has an unfinished naming receipt. Resume it before paying again.', 409);
      if (state.quotes.length >= MAX_QUOTES || (state.calls[day()] || 0) + reserved() + MAX_ATTEMPTS > config.dailyLimit) throw error('Song naming is full for now. No payment has been requested.', 429);
      let price, block;
      try {
        [price, block] = await Promise.all([remote.price(), remote.rpc('eth_blockNumber'), remote.preflight()]);
        if (typeof block !== 'string' || !/^0x(?:0|[1-9a-f][0-9a-f]*)$/i.test(block) || block.length > 22) throw new Error('Invalid chain block.');
      } catch { throw error('Payment or OpenAI service is unavailable. No payment has been requested.', 503); }
      const base = quotePepeUnits(price), amounts = new Set(state.quotes.map(q => q.amount));
      let amount;
      do { amount = (base + BigInt('0x' + randomBytes(6).toString('hex'))).toString(); } while (amounts.has(amount));
      const capability = randomBytes(32).toString('hex'), createdAt = now();
      const q = { id: randomBytes(16).toString('hex'), capabilityHash: digest(capability), payer, recipient: config.recipient.toLowerCase(),
        amount, price, minimumBlock: BigInt(block).toString(), createdAt, expiresAt: createdAt + QUOTE_MS, context,
        attempts: 0, status: 'quoted', paid: false };
      state.quotes.push(q); await persist();
      return { id: q.id, capability, payer, recipient: q.recipient, amount, price, chainId: PEPE_CHAIN_ID, contract: PEPE_CONTRACT,
        usd: JAZZ_NAME_USD, expiresAt: q.expiresAt, context };
    }); },
    claim(input) { return serialized(async () => {
      requireReady(); const q = find(input.id, input.capability);
      if (!isTransactionHash(input.hash)) throw error('A valid Ethereum transaction hash is required.');
      const hash = input.hash.toLowerCase();
      if (q.paid) { if (q.hash !== hash) throw error('This receipt already has a different payment.'); return publicJob(q); }
      if (state.quotes.some(other => other.paid && other.hash === hash)) throw error('This payment has already been used.', 409);
      let verified;
      try { verified = await verify(q, hash); }
      catch { throw error('This transaction could not be verified as the quoted payment. Check the receipt and try again; do not send another payment.'); }
      q.hash = hash;
      if (!verified.paid) { q.status = 'pending'; q.message = verified.message; await persist(); return publicJob(q); }
      q.paid = true; q.block = verified.block;
      // Save the spent transaction before invoking any paid API operation.
      q.status = 'retry'; await persist(); await startGeneration(q);
      return publicJob(q);
    }); },
    job(input) { return serialized(async () => { if (fault) throw error('Naming records need recovery.', 503); return publicJob(find(input.id, input.capability)); }); },
    retry(input) { return serialized(async () => {
      requireReady(); const q = find(input.id, input.capability);
      if (q.status === 'generating' || q.result) return publicJob(q);
      if (!q.paid || q.status !== 'retry' || q.attempts >= MAX_ATTEMPTS) throw error('Keep this receipt and ask the Keeper owner for help. Do not pay again.');
      let verified;
      try { verified = await verify(q, q.hash); } catch { throw error('The saved payment could not be rechecked. Do not pay again.', 503); }
      if (!verified.paid) return publicJob(q);
      await startGeneration(q); return publicJob(q);
    }); },
    async close() { closing = true; await chain; await Promise.allSettled([...tasks]); await chain; }
  };
  async function verify(q, hash) { return verifyPepePayment(remote.rpc, q, hash); }
}

export function createJazzNamingHttpHandler(service) {
  let windowStart = 0, requests = 0;
  return async (req, res, url) => {
    if (!url.pathname.startsWith('/api/jazz-name/')) return false;
    const send = (status, value) => { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(value)); return true; };
    if (req.method === 'GET' && url.pathname === '/api/jazz-name/config') return send(200, service.configuration());
    const operation = url.pathname.slice('/api/jazz-name/'.length);
    if (req.method !== 'POST' || !['quote', 'claim', 'job', 'retry'].includes(operation)) return send(404, { error: 'Naming action not found.' });
    if (req.headers['x-keeper-request'] !== '1') return send(403, { error: 'Missing request protection.' });
    if (!/^application\/json(?:;|$)/i.test(req.headers['content-type'] || '')) return send(415, { error: 'JSON required.' });
    if (Date.now() - windowStart > 60000) { windowStart = Date.now(); requests = 0; }
    if (++requests > 90) return send(429, { error: 'Please wait a minute before trying again.' });
    try {
      let bytes = 0; const chunks = [];
      for await (const chunk of req) { bytes += chunk.length; if (bytes > 6000) return send(413, { error: 'Naming request too large.' }); chunks.push(chunk); }
      const input = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      if (!input || typeof input !== 'object' || Array.isArray(input)) throw error('Invalid naming request.');
      return send(200, await service[operation](input));
    } catch (e) { return send(e.status || (e instanceof SyntaxError ? 400 : 500), { error: e.status ? e.message : 'Song naming could not finish. Your saved payment can be retried without paying again.' }); }
  };
}
