import { mkdir, mkdtemp } from 'node:fs/promises';
import { createKeeperServer } from './keeper/server.mjs';
import { createIngressServer } from './gateway.mjs';
import { importMigration } from './migration.mjs';
process.umask(0o077);
let keeper, gateway, stopping = false;
async function shutdown(code = 0) {
  if (stopping) return; stopping = true;
  const timer = setTimeout(() => process.exit(1), 15000); timer.unref();
  if (gateway) { gateway.closeAllConnections(); await new Promise(r => gateway.close(r)); }
  try { await keeper?.close(); } catch { code = 1; }
  clearTimeout(timer); process.exit(code);
}
for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => void shutdown());
try {
  const migration = await importMigration({ dataDir: '/data', migrationDir: '/config/doodletick-migration' });
  if (migration.status === 'imported') console.log('Verified Keeper migration completed before startup.');
  // Any earlier /data/tailscale state remains untouched for rollback. No VPN
  // process, network capability, tunnel device or remote peer listener is used.
  await mkdir('/data/keeper', { recursive: true, mode: 0o700 });
  const lockDir = await mkdtemp('/run/doodletick-');
  keeper = await createKeeperServer({ dataDir: '/data/keeper', lockDir });
  gateway = createIngressServer({ keeperPort: keeper.port, control: { status: () => keeper.vpn.status() } });
  await new Promise((resolve, reject) => { gateway.once('error', reject); gateway.listen(8099, '0.0.0.0', resolve); });
  console.log('Doodle Tick is ready through authenticated Home Assistant ingress. Open Web UI to pair browsers directly.');
} catch (e) { console.error('Add-on startup failed: ' + e.message); await shutdown(1); }
