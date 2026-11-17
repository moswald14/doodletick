// SPDX-License-Identifier: GPL-3.0-only
import { readFile } from 'node:fs/promises';

export function parseCoreOptions(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error('Review the Doodleverse node options.');
  const enabled = value.dvc_node_enabled ?? true;
  const network = value.dvc_network ?? 'main';
  const peers = value.dvc_peers ?? [];
  const listen = value.dvc_listen ?? true;
  if (typeof enabled !== 'boolean' || typeof listen !== 'boolean' || !['main', 'test', 'regtest'].includes(network)
    || !Array.isArray(peers) || peers.length > 8 || peers.some(peer => typeof peer !== 'string' || peer.length > 64)) throw Error('Review the Doodleverse node options.');
  // Unrelated app options (including provider credentials) are never returned.
  return { enabled, network, peers, listen };
}

export async function readCoreOptions(file = '/data/options.json') {
  let value;
  try {
    const raw = await readFile(file, 'utf8');
    if (Buffer.byteLength(raw) > 32000) throw Error('Options exceed limit');
    value = JSON.parse(raw);
  } catch (error) {
    if (error.code === 'ENOENT') return parseCoreOptions({});
    throw Error('Doodleverse node options could not be read. Other Keeper features remain available.');
  }
  return parseCoreOptions(value);
}
