import { mkdir, mkdtemp, readFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { createKeeperServer } from './keeper/server.mjs';
import { createIngressServer } from './gateway.mjs';
import { createTailscaleControl } from './tailscale.mjs';
import { importMigration } from './migration.mjs';
process.umask(0o077);
let keeper, gateway, daemon, stopping = false;
async function shutdown(code = 0) {
  if (stopping) return; stopping = true;
  const timer = setTimeout(() => { daemon?.kill('SIGKILL'); process.exit(1); }, 15000);
  timer.unref();
  if (gateway) { gateway.closeAllConnections(); await new Promise(r => gateway.close(r)); }
  try { await keeper?.close(); } catch { code = 1; }
  if (daemon && daemon.exitCode === null) {
    const ended = new Promise(r => daemon.once('exit', r)); daemon.kill('SIGTERM'); await ended;
  }
  clearTimeout(timer); process.exit(code);
}
for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => void shutdown());
try {
  const options = JSON.parse(await readFile('/data/options.json', 'utf8'));
  const migration = await importMigration({ dataDir: '/data', migrationDir: '/config/doodletick-migration' });
  if (migration.status === 'imported') console.log('Verified Keeper migration completed before startup.');
  const control = createTailscaleControl(options.hostname || 'doodletick-ha');
  for (const dir of ['/data/keeper', '/data/tailscale', '/run/tailscale']) await mkdir(dir, { recursive: true, mode: 0o700 });
  daemon = spawn('tailscaled', ['--state=/data/tailscale/tailscaled.state', '--socket=/var/run/tailscale/tailscaled.sock', '--tun=tailscale0', '--port=41641'], { stdio: ['ignore', 'inherit', 'inherit'] });
  daemon.once('error', () => { console.error('Tailscale could not start.'); void shutdown(1); });
  daemon.once('exit', () => { if (!stopping) { console.error('Tailscale stopped; restarting the add-on is required.'); void shutdown(1); } });
  const lockDir = await mkdtemp('/run/doodletick-');
  keeper = await createKeeperServer({ dataDir: '/data/keeper', lockDir });
  gateway = createIngressServer({ keeperPort: keeper.port, control, healthy: () => daemon.exitCode === null });
  await new Promise((resolve, reject) => { gateway.once('error', reject); gateway.listen(8099, '0.0.0.0', resolve); });
  console.log('Doodle Tick is ready. Open Web UI to connect it to your private network.');
  // Reapply the saved private-network connection after each container start.
  for (let attempt = 0; attempt < 20; attempt++) {
    if ((await control.status()).state !== 'Starting') { void control.connect(); break; }
    await new Promise(r => setTimeout(r, 500));
  }
} catch (e) { console.error('Add-on startup failed: ' + e.message); await shutdown(1); }
