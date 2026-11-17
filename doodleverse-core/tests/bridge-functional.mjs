// SPDX-License-Identifier: GPL-3.0-only
// Invoked only by functional.py against its fresh local regtest node.
import assert from 'node:assert/strict';
import { scryptSync } from 'node:crypto';
import { createCoreRpc, createScryptBridge } from '../../keeper/dvc-scrypt-node.mjs';
const [port, cookieFile, address] = process.argv.slice(2);
assert.match(port || '', /^[0-9]{1,5}$/);
assert.ok(Number(port) > 0 && Number(port) < 65536);
const rpc = createCoreRpc({ url: 'http://127.0.0.1:' + port + '/', cookieFile });
const bridge = createScryptBridge({ rpc, network: 'regtest' });
assert.equal((await bridge.status()).network, 'regtest');
const job = await bridge.job(address);
// This bounded CPU search belongs ONLY to the disposable functional test.
// The browser miner and RPC bridge never use this test helper or CPU search.
assert.equal(job.target, '7fffff' + '00'.repeat(29));
let nonce;
for (nonce = 0; nonce < 100; nonce++) {
  const header = Buffer.from(job.header, 'hex'); header.writeUInt32LE(nonce, 76);
  const digest = scryptSync(header, header, 32, { N: 1024, r: 1, p: 1, maxmem: 1024 * 1024 });
  if (BigInt('0x' + Buffer.from(digest).reverse().toString('hex')) <= BigInt('0x' + job.target)) break;
}
assert.ok(nonce < 100);
const accepted = await bridge.submit(job.id, nonce);
assert.equal(accepted.accepted, true);
assert.equal(accepted.address, address);
assert.equal(accepted.rewardAtoms, 5000000000);
await assert.rejects(bridge.submit(job.id, nonce), /expired|already/);
console.log(JSON.stringify({ check: 'Keeper bridge to real Core node', ...accepted }));
