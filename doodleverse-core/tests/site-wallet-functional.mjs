#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-only
// Real Core acceptance for the browser's transaction signer. Disposable regtest only.
import assert from 'node:assert/strict';
import { spawn, execFile } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, mkdir, readFile, open, rm, realpath, stat } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { promisify } from 'node:util';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { createKeeperServer } from '../../keeper/server.mjs';
import { createCoreRpc } from '../../keeper/dvc-scrypt-node.mjs';
import { createScryptWork, solveScryptCandidate, SCRYPT_NETWORKS, compactSize, sha256d } from '../../keeper/dvc-scrypt-protocol.mjs';
import { generatePrivateKey, privateKeyIdentity, privateKeyFromWif, privateKeyToWif, encryptWallet, decryptWallet, createTransactionPlan, signTransactionPlan, verifyPlanStillSpendable } from '../../keeper/public/scrypt-wallet-core.mjs';

const args = process.argv.slice(2);
assert.equal(args.length, 4, 'Usage: node site-wallet-functional.mjs --daemon PATH --cli PATH');
assert.equal(args[0], '--daemon'); assert.equal(args[2], '--cli');
const daemon = path.resolve(args[1]), cli = path.resolve(args[3]);
assert.ok((await stat(daemon)).isFile()); assert.ok((await stat(cli)).isFile());
const temporaryParent = await realpath(os.tmpdir()), root = await mkdtemp(path.join(temporaryParent, 'dvc-site-wallet-'));
assert.equal(path.dirname(await realpath(root)), temporaryParent); assert.ok(path.basename(root).startsWith('dvc-site-wallet-'));
const nodeData = path.join(root, 'node'), keeperData = path.join(root, 'keeper');
await mkdir(nodeData);
let child, childExit, nodeLog, keeper, ownerKey, restoredKey, recipientKey, recipientRestoredKey;
const deadline = new AbortController(), timeout = setTimeout(() => deadline.abort(Error('Disposable wallet test exceeded 240 seconds.')), 240000); timeout.unref();
const delay = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
async function bounded(promise, milliseconds) {
  let timer;
  try { return await Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(Error('Owned test process stop timed out.')), milliseconds); })]); }
  finally { clearTimeout(timer); }
}
const freePort = async () => { const server = net.createServer(); server.listen(0, '127.0.0.1'); await once(server, 'listening'); const port = server.address().port; await new Promise(resolve => server.close(resolve)); return port; };
const rpcPort = await freePort(); let peerPort = await freePort(); while (peerPort === rpcPort) peerPort = await freePort();
const cookiePath = path.join(nodeData, 'regtest/.cookie');
async function rawRpc(method, params = [], cleanup = false) {
  const cookie = (await readFile(cookiePath, 'utf8')).trim();
  const response = await fetch('http://127.0.0.1:' + rpcPort + '/', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Basic ' + Buffer.from(cookie).toString('base64') },
    body: JSON.stringify({ jsonrpc: '1.0', id: 1, method, params }), signal: cleanup ? AbortSignal.timeout(10000) : AbortSignal.any([deadline.signal, AbortSignal.timeout(10000)]), redirect: 'error',
  });
  const result = await response.json();
  if (result.error) throw Object.assign(Error('Test node RPC rejected ' + method), { rpcCode: result.error.code });
  assert.equal(result.id, 1); return result.result;
}
async function waitFor(check, seconds = 30) {
  const until = Date.now() + seconds * 1000; let last;
  while (Date.now() < until) {
    deadline.signal.throwIfAborted();
    try { const value = await check(); if (value) return value; } catch (error) { last = error; }
    await delay(100);
  }
  throw Error('The disposable node did not reach the expected state' + (last?.rpcCode ? ' (RPC ' + last.rpcCode + ')' : '.'));
}
async function startKeeper() {
  keeper = await createKeeperServer({ dataDir: keeperData, port: 0, scryptOptions: { rpc: createCoreRpc({ url: 'http://127.0.0.1:' + rpcPort, cookieFile: cookiePath }), network: 'regtest' } });
}
async function post(operation, value, expectedStatus = 200) {
  const response = await fetch('http://127.0.0.1:' + keeper.port + '/scrypt/wallet/' + operation, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Keeper-Request': '1' }, body: JSON.stringify(value),
    signal: AbortSignal.any([deadline.signal, AbortSignal.timeout(20000)]), redirect: 'error',
  });
  const body = await response.json();
  assert.equal(response.status, expectedStatus, typeof body.error === 'string' ? body.error : 'Unexpected site response'); return body;
}
async function stopNode() {
  if (child && child.exitCode === null) {
    try { await rawRpc('stop', [], true); await bounded(childExit, 20000); }
    catch { child.kill(); await bounded(childExit, 10000); }
  }
  await nodeLog?.close();
}

function largeCoinbaseRegression(work) {
  // Keep the validated miner and founder outputs, but add consensus-valid zero
  // outputs. Script creation has no MAX_SCRIPT_SIZE execution limit. This is
  // deliberately larger than the former index caps (10k outputs / 10k bytes)
  // and the former browser previous-transaction script cap (100k bytes).
  assert.equal(work.height, 1); assert.equal(work.body[0], 1);
  const original = work.body.subarray(1);
  assert.equal(original.readUInt32LE(), 1); assert.equal(original[4], 1);
  const scriptLength = original[41]; assert.ok(scriptLength < 253);
  const outputOffset = 42 + scriptLength + 4; assert.equal(original[outputOffset], 2);
  const zeroOutput = Buffer.from('0000000000000000016a', 'hex');
  const extraOutputs = Array.from({ length: 10001 }, () => zeroOutput);
  const payloadBytes = 120000, pushSize = Buffer.alloc(4); pushSize.writeUInt32LE(payloadBytes);
  const longScript = Buffer.concat([Buffer.from('6a4e', 'hex'), pushSize, Buffer.alloc(payloadBytes)]);
  extraOutputs.push(Buffer.concat([Buffer.alloc(8), compactSize(longScript.length), longScript]));
  const coinbase = Buffer.concat([original.subarray(0, outputOffset), compactSize(2 + extraOutputs.length), original.subarray(outputOffset + 1, -4), ...extraOutputs, original.subarray(-4)]);
  const header = Buffer.from(work.header); sha256d(coinbase).copy(header, 36);
  const body = Buffer.concat([compactSize(1), coinbase]);
  assert.ok(header.length + body.length < 1000000);
  return { work: { ...work, header, body }, outputs: 2 + extraOutputs.length, scriptBytes: longScript.length, blockBytes: header.length + body.length };
}

let report;
try {
  nodeLog = await open(path.join(nodeData, 'test-output.txt'), 'a');
  child = spawn(daemon, ['-regtest', '-server=1', '-listen=1', '-bind=127.0.0.1', '-rpcbind=127.0.0.1', '-rpcallowip=127.0.0.1', '-dnsseed=0', '-discover=0', '-upnp=0', '-txindex=1', '-datadir=' + nodeData, '-rpcport=' + rpcPort, '-port=' + peerPort], { windowsHide: true, stdio: ['ignore', nodeLog.fd, nodeLog.fd] });
  childExit = once(child, 'exit');
  await waitFor(() => rawRpc('getblockchaininfo'));
  assert.equal(await rawRpc('getblockhash', [0]), SCRYPT_NETWORKS.regtest.genesis);
  assert.equal((await rawRpc('getblockchaininfo')).chain, 'regtest');
  assert.match((await rawRpc('getnetworkinfo')).subversion, /^\/DoodleverseCore:/);
  const paperKey = generatePrivateKey();
  try { ownerKey = privateKeyFromWif(privateKeyToWif(paperKey, 'regtest'), 'regtest'); }
  finally { paperKey.fill(0); }
  recipientKey = generatePrivateKey();
  const owner = privateKeyIdentity(ownerKey, 'regtest'), recipient = privateKeyIdentity(recipientKey, 'regtest');
  const password = randomBytes(32).toString('hex'), receiverPassword = randomBytes(32).toString('hex');
  const backup = JSON.parse(JSON.stringify(await encryptWallet(ownerKey, 'regtest', password)));
  const recipientBackup = JSON.parse(JSON.stringify(await encryptWallet(recipientKey, 'regtest', receiverPassword)));
  await assert.rejects(decryptWallet(backup, 'deliberately-wrong-test-password', 'regtest'));
  restoredKey = await decryptWallet(backup, password, 'regtest'); ownerKey.fill(0); ownerKey = undefined;
  recipientRestoredKey = await decryptWallet(recipientBackup, receiverPassword, 'regtest'); recipientKey.fill(0); recipientKey = undefined;
  assert.equal(privateKeyIdentity(restoredKey, 'regtest').address, owner.address);
  await startKeeper();
  for (const headers of [{ 'Content-Type': 'application/json' }, { 'Content-Type': 'application/json', 'X-Keeper-Request': '1', Origin: 'https://unrelated.invalid' }]) {
    const forbidden = await fetch('http://127.0.0.1:' + keeper.port + '/scrypt/wallet/balance', { method: 'POST', headers, body: JSON.stringify({ address: owner.address }), signal: AbortSignal.any([deadline.signal, AbortSignal.timeout(10000)]) });
    assert.equal(forbidden.status, 403); await forbidden.body.cancel();
  }
  assert.equal((await post('balance', { address: owner.address })).confirmedAtoms, '0');
  // Bounded CPU proof is part of this disposable fixture, never a browser-miner fallback.
  const template = await rawRpc('getblocktemplate', [{ rules: ['segwit'] }]);
  assert.equal(template.transactions.length, 0);
  const regression = largeCoinbaseRegression(createScryptWork(template, owner.address, 'regtest')), work = regression.work;
  let candidate;
  for (let nonce = 0; nonce < 10000; nonce++) {
    try { candidate = solveScryptCandidate(work, nonce); break; }
    catch (error) { if (error.code !== 'DVC_SCRYPT_INVALID' || !error.message.includes('does not meet')) throw error; }
  }
  assert.ok(candidate, 'Bounded regtest proof must succeed'); assert.equal(await rawRpc('submitblock', [candidate.block]), null);
  const largeBlock = await rawRpc('getblock', [candidate.hash, 2]);
  assert.equal(largeBlock.tx[0].vout.length, regression.outputs); assert.equal(largeBlock.size, regression.blockBytes);
  assert.equal(largeBlock.tx[0].vout.at(-1).scriptPubKey.hex.length / 2, regression.scriptBytes);
  const immature = await post('balance', { address: owner.address });
  assert.equal(immature.confirmedAtoms, '0'); assert.equal(immature.immatureAtoms, '5000000000'); assert.deepEqual(immature.utxos, []);
  const sink = await rawRpc('getnewaddress', ['disposable-site-test']);
  await rawRpc('generatetoaddress', [29, sink]);
  const funded = await post('balance', { address: owner.address });
  assert.equal(funded.confirmedAtoms, '5000000000'); assert.equal(funded.utxos.length, 1); assert.equal(funded.utxos[0].confirmations, 30);
  const plan = createTransactionPlan({ network: 'regtest', address: owner.address, recipient: recipient.address, amount: '7', balance: funded });
  assert.equal(verifyPlanStillSpendable(plan, await post('balance', { address: owner.address })), true);
  const signed = signTransactionPlan(plan, restoredKey);
  await post('broadcast', { rawTransaction: signed.rawTransaction, expectedTxid: '00'.repeat(32) }, 400);
  // A competing, valid signature uses the same input but pays a different amount.
  const competingPlan = createTransactionPlan({ network: 'regtest', address: owner.address, recipient: recipient.address, amount: '8', balance: funded });
  const competing = signTransactionPlan(competingPlan, restoredKey);
  const accepted = await post('broadcast', { rawTransaction: signed.rawTransaction, expectedTxid: signed.expectedTxid });
  assert.equal(accepted.txid, signed.expectedTxid); assert.equal(accepted.accepted, true);
  assert.equal((await post('balance', { address: owner.address })).confirmedAtoms, '0', 'Mempool-spent input must disappear before confirmation');
  const duplicate = await post('broadcast', { rawTransaction: signed.rawTransaction, expectedTxid: signed.expectedTxid });
  assert.equal(duplicate.alreadyKnown, true);
  await post('broadcast', { rawTransaction: competing.rawTransaction, expectedTxid: competing.expectedTxid }, 409);
  const confirmingBlock = (await rawRpc('generatetoaddress', [1, sink]))[0];
  await waitFor(async () => (await rawRpc('getrawtransaction', [signed.expectedTxid, true])).confirmations >= 1);
  const paid = await post('balance', { address: recipient.address }), change = await post('balance', { address: owner.address });
  assert.equal(paid.confirmedAtoms, '700000000');
  assert.equal(change.confirmedAtoms, (5000000000n - 700000000n - BigInt(signed.feeAtoms)).toString());
  const confirmedRetry = await post('broadcast', { rawTransaction: signed.rawTransaction, expectedTxid: signed.expectedTxid }); assert.equal(confirmedRetry.alreadyKnown, true);
  const decoded = await rawRpc('decoderawtransaction', [signed.rawTransaction]);
  assert.equal(decoded.txid, signed.expectedTxid); assert.equal(decoded.vout.length, 2);
  // Restore receiver's separate encrypted backup and spend its now-confirmed receipt.
  const returnPlan = createTransactionPlan({ network: 'regtest', address: recipient.address, recipient: owner.address, amount: '1', balance: paid });
  const returned = signTransactionPlan(returnPlan, recipientRestoredKey);
  await post('broadcast', { rawTransaction: returned.rawTransaction, expectedTxid: returned.expectedTxid });
  const returnedBlock = (await rawRpc('generatetoaddress', [1, sink]))[0];
  assert.equal((await post('balance', { address: recipient.address })).confirmedAtoms, (600000000n - BigInt(returned.feeAtoms)).toString());
  assert.equal((await post('balance', { address: owner.address })).confirmedAtoms, (4400000000n - BigInt(signed.feeAtoms)).toString());
  // Invalidate the payment's descendants and then restore the validated branch.
  await rawRpc('invalidateblock', [confirmingBlock]);
  const rewound = await post('balance', { address: recipient.address }); assert.equal(rewound.confirmedAtoms, '0');
  await rawRpc('reconsiderblock', [confirmingBlock]);
  await waitFor(async () => (await rawRpc('getbestblockhash')) === returnedBlock);
  assert.equal((await post('balance', { address: recipient.address })).confirmedAtoms, (600000000n - BigInt(returned.feeAtoms)).toString());
  await keeper.close(); keeper = undefined; await startKeeper();
  const restoredBalance = await post('balance', { address: owner.address });
  assert.equal(restoredBalance.confirmedAtoms, (4400000000n - BigInt(signed.feeAtoms)).toString());
  const cliResult = await promisify(execFile)(cli, ['-regtest', '-datadir=' + nodeData, '-rpcport=' + rpcPort, 'getblockcount'], { windowsHide: true, timeout: 10000 });
  assert.equal(Number(cliResult.stdout.trim()), 32);
  report = { passed: true, network: 'disposable regtest', height: 32, largeCoinbase: { outputs: regression.outputs, scriptBytes: regression.scriptBytes, blockBytes: regression.blockBytes }, firstPayment: signed.expectedTxid, returnPayment: returned.expectedTxid, firstFeeAtoms: signed.feeAtoms, returnFeeAtoms: returned.feeAtoms, finalOwnerAtoms: restoredBalance.confirmedAtoms, finalRecipientAtoms: (600000000n - BigInt(returned.feeAtoms)).toString(), checks: ['full Keeper HTTP protection', 'paper key round trip', 'client-generated encrypted backups', 'wrong-password rejection', 'restored browser keys', 'Core-validated large coinbase', 'large previous transaction authentication and signing', 'maturity exclusion', 'client-reviewed native signing', 'Core signature acceptance', 'exact payment and change', 'mempool spent-output exclusion', 'idempotent pending and confirmed retries', 'identifier tamper rejection', 'double-spend rejection', 'received coins spent from second browser wallet', 'active-chain rollback and restore', 'persistent index restart', 'native CLI'] };
} finally {
  clearTimeout(timeout);
  ownerKey?.fill(0); restoredKey?.fill(0); recipientKey?.fill(0); recipientRestoredKey?.fill(0);
  try { await keeper?.close(); } finally { await stopNode(); }
  const resolved = await realpath(root);
  assert.equal(path.dirname(resolved), temporaryParent); assert.ok(path.basename(resolved).startsWith('dvc-site-wallet-'));
  await rm(resolved, { recursive: true, force: true });
}
console.log(JSON.stringify({ ...report, temporaryDataRemoved: true }));
