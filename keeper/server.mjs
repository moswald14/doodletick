import http from 'node:http';
import { createGardenLedger } from './garden-ledger.mjs';
import { readFile, writeFile, mkdir, appendFile, open } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { newIdentity, sign, hash, verifyProof, tickAt } from './public/core.mjs';
import { createVpnNetwork } from './vpn-network.mjs';

const root = path.dirname(fileURLToPath(import.meta.url));
export async function createKeeperServer({ dataDir = path.join(root, '.doodletick'), lockDir = dataDir, port = 4317, vpnOptions, gardenOptions } = {}) {
  await mkdir(dataDir, { recursive: true });
  // A managed Linux service keeps its lock in systemd's temporary runtime
  // directory. Its private identity and receipt ledger remain in dataDir.
  await mkdir(lockDir, { recursive: true });
  const lockPath = path.join(lockDir, 'server.lock');
  const lock = await open(lockPath, 'wx').catch(() => { throw new Error('A Keeper is already running, or server.lock remains after an interrupted shutdown. Close the other Keeper before removing that lock file.'); });
  const { unlink } = await import('node:fs/promises');
  let identity;
  try {
    try { identity = JSON.parse(await readFile(path.join(dataDir, 'witness-key.json'), 'utf8')); }
    catch (e) { if (e.code !== 'ENOENT') throw e; identity = await newIdentity('local-witness'); await writeFile(path.join(dataDir, 'witness-key.json'), JSON.stringify(identity), { flag: 'wx', mode: 0o600 }); }
  } catch (e) { await lock.close(); await unlink(lockPath); throw e; }
  let previous = null, count = 0;
  try { const lines = (await readFile(path.join(dataDir, 'receipts.jsonl'), 'utf8')).trim().split('\n').filter(Boolean); count = lines.length; if (count) previous = await hash(JSON.parse(lines.at(-1))); } catch (e) { if (e.code !== 'ENOENT') { await lock.close(); await unlink(lockPath); throw e; } }
  let queue = Promise.resolve();
  let garden, vpn;
  try {
    garden = await createGardenLedger({ ...gardenOptions, dataDir, identity });
    vpn = await createVpnNetwork({ ...vpnOptions, garden });
  } catch (e) { await lock.close(); await unlink(lockPath); throw e; }
  const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json' };
  const allowedFiles = new Set(['clock-wheel.mjs', 'index.html', 'app.mjs', 'core.mjs', 'style.css', 'logo.svg', 'files.css', 'files-ui.mjs', 'licenses.mjs', 'archive.mjs', 'file-store.mjs', 'peers.mjs', 'manifest.webmanifest', 'sw.mjs', 'theme.mjs', 'theme.css']);
  for (const file of ['spirograph.mjs', 'spirograph-auth.mjs', 'vpn-description.mjs', 'vpn-transport.mjs', 'vpn-ui.mjs', 'arcade.css', 'arcade-ui.mjs', 'arcade-canvas.mjs', 'arcade-room.mjs', 'arcade-store.mjs', 'arcade-link.mjs', 'game-engine.mjs', 'workshop.mjs']) allowedFiles.add(file);
  for (const file of ['mushroom-core.mjs', 'mushroom-ui.mjs', 'mushroom-art.mjs', 'mushroom.css', 'dot-effects-dsp.mjs', 'dot-amp-tone.mjs', 'dot-studio-dsp.mjs', 'dot-collision-audio.mjs', 'dot-wave-export.mjs', 'dot-mushroom-dsp.mjs', 'dot-mushroom-motion.mjs']) allowedFiles.add(file);
  const server = http.createServer(async (req, res) => {
    const address = server.address();
    const hostnames = [`127.0.0.1:${address.port}`, `localhost:${address.port}`];
    const send = (status, value, type = 'application/json; charset=utf-8') => { res.writeHead(status, { 'Content-Type': type }); res.end(typeof value === 'string' ? value : JSON.stringify(value)); };
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'");
    if (!hostnames.includes(req.headers.host)) return send(403, { error: 'Local access only.' });
    if (req.headers.origin && !hostnames.some(h => req.headers.origin === 'http://' + h)) return send(403, { error: 'Origin not allowed.' });
    try {
      const url = new URL(req.url, 'http://' + req.headers.host);
      if (await vpn.handleLocal(req, res, url)) return;
      if (req.method === 'GET' && url.pathname === '/api/status') return send(200, { version: '0.1b', mode: 'local-witness', publicKey: identity.publicKey, fingerprint: identity.fingerprint, receipts: count, tick: tickAt() });
      if (req.method === 'POST' && url.pathname === '/api/witness') {
        if (!req.headers['content-type']?.startsWith('application/json')) return send(415, { error: 'JSON required.' });
        let raw = '', size = 0;
        for await (const chunk of req) { size += chunk.length; if (size > 12000) { send(413, { error: 'Receipt too large.' }); return; } raw += chunk; }
        const { proof } = JSON.parse(raw);
        if (!await verifyProof(proof)) return send(400, { error: 'Invalid creator signature.' });
        const issue = async () => {
          const record = { version: 1, proofId: proof.id, issuedAt: new Date().toISOString(), witness: identity.fingerprint, sequence: count + 1, previous, tick: tickAt() };
          const receipt = { record, publicKey: identity.publicKey, signature: await sign(record, identity.privateKey) };
          await appendFile(path.join(dataDir, 'receipts.jsonl'), JSON.stringify(receipt) + '\n', { mode: 0o600 });
          previous = await hash(receipt); count++; return receipt;
        };
        const job = queue.then(issue); queue = job.catch(() => {});
        return send(200, await job);
      }
      if (req.method !== 'GET') return send(405, { error: 'Method not supported.' });
      const file = url.pathname === '/' ? 'index.html' : url.pathname.slice(1);
      if (!allowedFiles.has(file)) return send(404, { error: 'Not found.' });
      return send(200, await readFile(path.join(root, 'public', file), 'utf8'), types[path.extname(file)]);
    } catch (e) { return send(e instanceof SyntaxError ? 400 : 500, { error: e instanceof SyntaxError ? 'Invalid JSON.' : 'The local witness could not complete this request.' }); }
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', resolve); }).catch(async e => { await vpn.close(); await lock.close(); await unlink(lockPath); throw e; });
  const close = async () => { await vpn.close(); await new Promise(resolve => server.close(resolve)); await queue; await garden.idle(); await lock.close(); await unlink(lockPath); };
  return { server, close, vpn, port: server.address().port };
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const keeper = await createKeeperServer({ port: Number(process.env.DOODLETICK_PORT || 4317), ...(process.env.DOODLETICK_DATA ? { dataDir: path.resolve(process.env.DOODLETICK_DATA) } : {}), ...(process.env.DOODLETICK_LOCK_DIR ? { lockDir: path.resolve(process.env.DOODLETICK_LOCK_DIR) } : {}) });
    console.log(`Doodle Tick Keeper is running at http://127.0.0.1:${keeper.port}\nKeep this window open. Press Ctrl+C to stop.`);
    let closing = false;
    for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, async () => { if (closing) return; closing = true; await keeper.close(); process.exit(0); });
  } catch (e) { console.error(e.message); process.exitCode = 1; }
}
