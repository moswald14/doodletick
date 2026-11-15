// Disposable, isolated local Keepers; there is no simulated remote VPN bridge.
import path from 'node:path';
import { createKeeperServer } from '../server.mjs';
export async function simulatedKeepers(dir, count = 2) {
  const nodes = [];
  try {
    for (let i = 1; i <= count; i++) {
      const keeper = await createKeeperServer({ port: 0, dataDir: path.join(dir, 'keeper-' + i) });
      nodes.push({ keeper, base: 'http://127.0.0.1:' + keeper.port });
    }
    return { nodes, close: () => Promise.all(nodes.map(node => node.keeper.close())) };
  } catch (error) { await Promise.all(nodes.map(node => node.keeper.close())); throw error; }
}
