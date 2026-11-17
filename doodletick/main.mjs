import { mkdir, mkdtemp, readFile } from 'node:fs/promises';
import { createKeeperServer } from './keeper/server.mjs';
import { createIngressServer } from './gateway.mjs';
import { importMigration } from './migration.mjs';
import { readMozCorpProviderOptions } from './mozcorp-options.mjs';
import { readCoreOptions } from './core-options.mjs';
import { startCoreProcess } from './core-process.mjs';
import { createCoreRpc } from './keeper/dvc-scrypt-node.mjs';
import { jazzConfigFromAddonOptions } from './jazz-options.mjs';
process.umask(0o077);
let keeper, gateway, core, stopping = false;
const startupAbort = new AbortController();
let startupFinished;
const startupComplete = new Promise(resolve => { startupFinished = resolve; });
async function shutdown(code = 0) {
  if (stopping) return; stopping = true;
  startupAbort.abort();
  const timer = setTimeout(() => process.exit(1), 45000); timer.unref();
  await startupComplete;
  if (gateway) { gateway.closeAllConnections(); await new Promise(r => gateway.close(r)); }
  try { await keeper?.close(); } catch { code = 1; }
  try { await core?.close(); } catch { code = 1; }
  clearTimeout(timer); process.exit(code);
}
for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => void shutdown());
try {
  const migration = await importMigration({ dataDir: '/data', migrationDir: '/config/doodletick-migration' });
  if (migration.status === 'imported') console.log('Verified Keeper migration completed before startup.');
  // Any earlier /data/tailscale state remains untouched for rollback. No VPN
  // process, network capability or tunnel device is used. The native coin node
  // has its own optional peer port; its RPC is always loopback-only.
  await mkdir('/data/keeper', { recursive: true, mode: 0o700 });
  const lockDir = await mkdtemp('/run/doodletick-');
  // AI is optional. Invalid provider configuration must not take the Keeper offline.
  let provider = { apiKey: '', model: 'gpt-5-mini' };
  try { provider = await readMozCorpProviderOptions(); } catch (error) { console.error(error.message); }
  let scryptOptions;
  try {
    const options = await readCoreOptions();
    if (options.enabled) {
      core = await startCoreProcess({ ...options, dataDir: '/data/doodleverse-core/' + options.network,
        signal: startupAbort.signal, startupTimeoutMs: 30000,
        onUnexpectedExit: () => console.error('The native Doodleverse node stopped. The app watchdog can restart it; saved Keeper data is preserved.') });
      scryptOptions = { network: core.network, rpc: createCoreRpc({ url: core.rpcUrl, cookieFile: core.cookieFile }) };
    }
  } catch {
    console.error('The native Doodleverse node could not start. Review its app options and local log. Existing Keeper data was preserved.');
  }
  if (stopping) throw Error('App stopped during startup.');
  const addonOptions = JSON.parse(await readFile('/data/options.json', 'utf8'));
  keeper = await createKeeperServer({ dataDir: '/data/keeper', lockDir, mozcorpOptions: { provider }, scryptOptions, jazzOptions: { config: jazzConfigFromAddonOptions(addonOptions) } });
  if (stopping) throw Error('App stopped during startup.');
  gateway = createIngressServer({ keeperPort: keeper.port, control: { status: () => keeper.vpn.status() }, healthy: () => !core || core.healthy() });
  await new Promise((resolve, reject) => { gateway.once('error', reject); gateway.listen(8099, '0.0.0.0', resolve); });
  console.log('Doodle Tick is ready through authenticated Home Assistant ingress. Open Web UI to pair browsers directly.');
} catch (e) {
  if (!stopping) console.error('Add-on startup failed: ' + e.message);
  startupFinished(); await shutdown(1);
} finally { startupFinished(); }
