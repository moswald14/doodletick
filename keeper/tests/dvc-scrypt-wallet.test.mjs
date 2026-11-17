// SPDX-License-Identifier: GPL-3.0-only
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { createScryptWalletBackend, decodeSignedScryptTransaction, rpcCoinAtoms, SCRYPT_WALLET_POLICY } from '../dvc-scrypt-wallet.mjs';
import { createScryptWalletHttpHandler } from '../dvc-scrypt-wallet-http.mjs';
import { SCRYPT_NETWORKS, addressScript, sha256d, compactSize } from '../dvc-scrypt-protocol.mjs';

const genesis = SCRYPT_NETWORKS.regtest.genesis;
const hash = value => createHash('sha256').update(String(value)).digest('hex');
const hash160 = bytes => createHash('ripemd160').update(createHash('sha256').update(bytes).digest()).digest();
const publicKey = Buffer.from('0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798', 'hex');
function address(prefix = 112, payload = hash160(publicKey)) {
  const checked = Buffer.concat([Buffer.from([prefix]), payload]), full = Buffer.concat([checked, sha256d(checked).subarray(0, 4)]);
  let value = BigInt('0x' + full.toString('hex')), result = '';
  while (value) { result = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'[Number(value % 58n)] + result; value /= 58n; }
  return result;
}
const recipient = address(112, Buffer.alloc(20, 42)), owner = address(), script = addressScript(owner, 'regtest').toString('hex'), recipientScript = addressScript(recipient, 'regtest').toString('hex');
const uint32 = value => { const bytes = Buffer.alloc(4); bytes.writeUInt32LE(value); return bytes; };
const uint64 = value => { const bytes = Buffer.alloc(8); bytes.writeBigUInt64LE(BigInt(value)); return bytes; };
function serializedFixtureTransaction(tx) {
  const inputs = tx.vin.map(input => {
    const coinbase = Object.hasOwn(input, 'coinbase'), unlocking = coinbase ? Buffer.from(input.coinbase, 'hex') : Buffer.alloc(0);
    return Buffer.concat([coinbase ? Buffer.alloc(32) : Buffer.from(input.txid, 'hex').reverse(), uint32(coinbase ? 0xffffffff : input.vout), compactSize(unlocking.length), unlocking, uint32(0xffffffff)]);
  });
  return Buffer.concat([uint32(1), compactSize(inputs.length), ...inputs, compactSize(tx.vout.length), ...tx.vout.map(output => Buffer.concat([uint64(rpcCoinAtoms(output.value)), compactSize(output.scriptPubKey.hex.length / 2), Buffer.from(output.scriptPubKey.hex, 'hex')])), uint32(0)]);
}
function coinbaseFixture(height, label = 'coinbase-' + height, rewardScript = script, reward = '50.00000000') {
  return { vin: [{ coinbase: Buffer.from(label).toString('hex'), sequence: 0xffffffff }], vout: [{ n: 0, value: reward, scriptPubKey: { hex: rewardScript } }] };
}
const firstCoinbaseId = sha256d(serializedFixtureTransaction(coinbaseFixture(1))).reverse().toString('hex');
function signedShape({ txid = firstCoinbaseId, vout = 0, amount = 700000000n, change = 4299000000n, fee = undefined, duplicate = false, signature = '300602010102010101', version = 1, sequence = 0xffffffff, locktime = 0, destination = recipientScript } = {}) {
  if (fee !== undefined) change = 5000000000n - amount - fee;
  const sig = Buffer.from(signature, 'hex'), unlocking = Buffer.concat([Buffer.from([sig.length]), sig, Buffer.from([33]), publicKey]);
  const input = Buffer.concat([Buffer.from(txid, 'hex').reverse(), uint32(vout), Buffer.from([unlocking.length]), unlocking, uint32(sequence)]);
  const outputs = [[amount, destination], ...(change ? [[change, script]] : [])];
  const raw = Buffer.concat([uint32(version), Buffer.from([duplicate ? 2 : 1]), input, ...(duplicate ? [input] : []), Buffer.from([outputs.length]), ...outputs.map(([value, hex]) => Buffer.concat([uint64(value), Buffer.from([hex.length / 2]), Buffer.from(hex, 'hex')])), uint32(locktime)]);
  return { raw: raw.toString('hex'), txid: sha256d(raw).reverse().toString('hex') };
}
function fixture() {
  const state = { blocks: [{ hash: genesis, height: 0 }], rawTransactions: new Map(), aliases: new Map(), mempoolSpent: new Set(), known: new Map(), sent: 0, calls: [], wrongGenesis: false, wrongIdentity: false, afterGetOutput: null, badOutput: null, getRawFailure: null, extraHeaders: 0, sendFailure: null };
  function append({ label, rewardScript = script, payments = [], reward = '50.00000000', extraCoinbaseOutputs = [] } = {}) {
    const height = state.blocks.length, previous = state.blocks.at(-1);
    const transactions = [coinbaseFixture(height, label ? label + '-coinbase' : 'coinbase-' + height, rewardScript, reward), ...payments];
    transactions[0].vout.push(...extraCoinbaseOutputs.map((output, index) => ({ ...output, n: index + 1 })));
    let size = 80 + compactSize(transactions.length).length;
    for (const tx of transactions) {
      for (const input of tx.vin) {
        if (input.txid && state.aliases.has(input.txid)) input.txid = state.aliases.get(input.txid);
        input.sequence = 0xffffffff; if (!Object.hasOwn(input, 'coinbase')) input.scriptSig = { hex: '' };
      }
      const raw = serializedFixtureTransaction(tx), txid = sha256d(raw).reverse().toString('hex');
      size += raw.length;
      if (tx.txid) state.aliases.set(tx.txid, txid); tx.txid = txid; state.rawTransactions.set(txid, raw.toString('hex'));
    }
    const block = { hash: hash(label || 'block-' + height), height, previousblockhash: previous.hash, confirmations: 1, size, strippedsize: size, tx: transactions };
    state.blocks.push(block); return block;
  }
  function outputs() {
    const map = new Map();
    for (const block of state.blocks.slice(1)) for (const tx of block.tx) {
      const coinbase = Object.hasOwn(tx.vin[0], 'coinbase');
      if (!coinbase) for (const input of tx.vin) map.delete(input.txid + ':' + input.vout);
      for (const output of tx.vout) map.set(tx.txid + ':' + output.n, { value: output.value, scriptPubKey: output.scriptPubKey, coinbase, height: block.height });
    }
    return map;
  }
  const rpc = async (method, params = []) => {
    state.calls.push({ method, params });
    const tip = state.blocks.at(-1);
    if (method === 'getblockhash') return state.wrongGenesis && params[0] === 0 ? hash('wrong') : state.blocks[params[0]]?.hash;
    if (method === 'getnetworkinfo') return { subversion: state.wrongIdentity ? '/Pepecoin:1.1.0/' : '/DoodleverseCore:1.1.0/' };
    if (method === 'getblockchaininfo') return { chain: 'regtest', blocks: tip.height, headers: tip.height + state.extraHeaders, bestblockhash: tip.hash, pruned: false };
    if (method === 'getbestblockhash') return state.blocks.at(-1).hash;
    if (method === 'getblock') { const block = state.blocks.find(item => item.hash === params[0]); return { ...block, confirmations: tip.height - block.height + 1 }; }
    if (method === 'getblockheader') { const block = state.blocks.find(item => item.hash === params[0]); return block ? { hash: block.hash, confirmations: tip.height - block.height + 1 } : { hash: params[0], confirmations: -1 }; }
    if (method === 'gettxout') {
      assert.equal(params[2], true);
      const key = params[0] + ':' + params[1], output = outputs().get(key);
      if (!output || state.mempoolSpent.has(key)) return null;
      const result = { ...output, bestblock: tip.hash, confirmations: tip.height - output.height + 1, ...(state.badOutput || {}) };
      state.afterGetOutput?.(); return result;
    }
    if (method === 'getrawtransaction') {
      if (state.getRawFailure) throw state.getRawFailure;
      const known = state.known.get(params[0]); if (known) return params[1] ? known : known.hex;
      const raw = state.rawTransactions.get(params[0]);
      if (raw) {
        if (!params[1]) return raw;
        const block = state.blocks.find(item => item.tx?.some(tx => tx.txid === params[0]));
        return { txid: params[0], hex: raw, blockhash: block?.hash || hash('orphan'), confirmations: block ? tip.height - block.height + 1 : 0 };
      }
      throw Object.assign(Error('Unknown public transaction'), { rpcCode: -5 });
    }
    if (method === 'sendrawtransaction') {
      assert.equal(params[1], false); state.sent++;
      if (state.sendFailure) throw state.sendFailure;
      const bytes = Buffer.from(params[0], 'hex'), txid = sha256d(bytes).reverse().toString('hex');
      const decoded = decodeSignedScryptTransaction(params[0], txid);
      for (const input of decoded.inputs) state.mempoolSpent.add(input.txid + ':' + input.vout);
      state.known.set(txid, { txid, hex: params[0] }); return txid;
    }
    throw Error('Unexpected RPC method ' + method);
  };
  return { state, rpc, append };
}
async function backend(t, options = {}, chain = fixture()) {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'dvc-public-index-'));
  const wallet = createScryptWalletBackend({ rpc: chain.rpc, dataDir: directory, backgroundSync: false, ...options });
  t.after(async () => { await wallet.close(); await rm(directory, { recursive: true, force: true }); });
  return { ...chain, wallet, directory };
}

test('Core decimal conversion preserves one-atom and large supply values without float multiplication', () => {
  assert.equal(rpcCoinAtoms(0.29), 29000000n); assert.equal(rpcCoinAtoms(1e-8), 1n);
  assert.equal(rpcCoinAtoms(20999999.99999999), 2099999999999999n);
  assert.equal(rpcCoinAtoms('21000000.00000000'), 2100000000000000n);
  for (const value of [-1, NaN, Infinity, 1e-9, 21000001, '0.000000001', '1e-8', '01', {}, null]) assert.throws(() => rpcCoinAtoms(value));
});

test('index distinguishes immature and mature rewards and omits mempool-spent inputs', async t => {
  const { wallet, append, state } = await backend(t);
  append();
  let result = await wallet.balance(owner);
  assert.equal(result.immatureAtoms, '5000000000'); assert.equal(result.confirmedAtoms, '0'); assert.deepEqual(result.utxos, []);
  for (let i = 2; i <= 30; i++) append({ rewardScript: recipientScript });
  result = await wallet.balance(owner);
  assert.equal(result.confirmedAtoms, '5000000000'); assert.equal(result.immatureAtoms, '0'); assert.equal(result.utxos[0].confirmations, 30); assert.equal(result.utxos[0].coinbase, true);
  assert.equal(sha256d(Buffer.from(result.transactions[firstCoinbaseId], 'hex')).reverse().toString('hex'), firstCoinbaseId);
  state.mempoolSpent.add(firstCoinbaseId + ':0');
  result = await wallet.balance(owner); assert.equal(result.confirmedAtoms, '0'); assert.deepEqual(result.utxos, []);
  state.mempoolSpent.clear(); assert.equal((await wallet.balance(owner)).confirmedAtoms, '5000000000');
});

test('consensus-sized coinbases with many outputs and long unspendable scripts do not halt indexing', async t => {
  const { wallet, append } = await backend(t, { maxIndexEntries: 1 });
  const outputs = Array.from({ length: 70000 }, () => ({ value: '0', scriptPubKey: { hex: '' } }));
  outputs.push({ value: '0', scriptPubKey: { hex: '6a4e' + uint32(120000).toString('hex') + '00'.repeat(120000) } });
  const block = append({ extraCoinbaseOutputs: outputs });
  assert.ok(block.tx[0].vout.length > 65535); assert.ok(block.size < 1000000);
  const immature = await wallet.balance(owner);
  assert.equal(immature.height, 1); assert.equal(immature.immatureAtoms, '5000000000');
  for (let height = 2; height <= 30; height++) append({ reward: '0' });
  const mature = await wallet.balance(owner);
  assert.equal(mature.height, 30); assert.equal(mature.confirmedAtoms, '5000000000'); assert.equal(mature.utxos.length, 1);
  const previous = mature.transactions[block.tx[0].txid];
  assert.equal(previous.length, (block.size - 81) * 2);
  assert.equal(sha256d(Buffer.from(previous, 'hex')).reverse().toString('hex'), block.tx[0].txid);
});

test('serialized block bounds reject oversized or inconsistent data without partially advancing the index', async t => {
  const { wallet, append, state } = await backend(t);
  append();
  const bad = append({ extraCoinbaseOutputs: [{ value: '0', scriptPubKey: { hex: '6a' + '00'.repeat(999999) } }] });
  assert.ok(bad.size > 1000000);
  await assert.rejects(wallet.balance(owner), /oversized/);
  state.blocks.pop();
  const replacement = append({ label: 'replacement-with-valid-size' });
  replacement.size++;
  await assert.rejects(wallet.balance(owner), /inconsistent serialized block sizes/);
  replacement.size--;
  const result = await wallet.balance(owner);
  assert.equal(result.height, 2); assert.equal(result.immatureAtoms, '10000000000');
});

test('bounded catch-up never returns a partial balance and continues from durable progress', async t => {
  const { wallet, append, state, directory } = await backend(t, { maxBlocksPerSync: 2 });
  for (let i = 0; i < 5; i++) append();
  await assert.rejects(wallet.balance(owner), error => error.syncing && error.height === 2 && error.targetHeight === 5);
  await assert.rejects(wallet.balance(owner), error => error.syncing && error.height === 4);
  assert.equal((await wallet.balance(owner)).immatureAtoms, '25000000000');
  await wallet.close(); state.calls.length = 0;
  const same = createScryptWalletBackend({ rpc: (async (method, params) => { state.calls.push({ method, params }); if (method === 'getblockchaininfo') return { chain: 'regtest', blocks: 5, bestblockhash: state.blocks.at(-1).hash }; if (method === 'getblockhash') return state.blocks[params[0]].hash; if (method === 'getnetworkinfo') return { subversion: '/DoodleverseCore:1.1.0/' }; if (method === 'getbestblockhash') return state.blocks.at(-1).hash; if (method === 'gettxout') return null; throw Error('Unexpected scan'); }), dataDir: directory });
  assert.equal((await same.balance(owner)).confirmedAtoms, '0'); assert.ok(!state.calls.some(call => call.method === 'getblock')); await same.close();
});

test('a competing active chain discards stale outputs before bounded replay', async t => {
  const { wallet, append, state } = await backend(t, { maxBlocksPerSync: 2 });
  append(); append(); assert.equal((await wallet.balance(owner)).immatureAtoms, '10000000000');
  state.blocks = state.blocks.slice(0, 1);
  append({ label: 'fork-one', rewardScript: recipientScript }); append({ label: 'fork-two', rewardScript: recipientScript }); append({ label: 'fork-three', rewardScript: recipientScript });
  await assert.rejects(wallet.balance(owner), error => error.syncing && error.height === 2);
  assert.equal((await wallet.balance(owner)).immatureAtoms, '0');
  assert.equal((await wallet.balance(recipient)).immatureAtoms, '15000000000');
});

test('catch-up continues in bounded background batches and stops cleanly', async t => {
  const { wallet, append, state } = await backend(t, { maxBlocksPerSync: 1, backgroundSync: true });
  append(); append();
  await assert.rejects(wallet.balance(owner), error => error.syncing && error.height === 1);
  await new Promise(resolve => setTimeout(resolve, 2200));
  state.calls.length = 0;
  assert.equal((await wallet.balance(owner)).immatureAtoms, '10000000000');
  assert.ok(!state.calls.some(call => call.method === 'getblock'));
  await wallet.close();
});

test('spent chain outputs, same-block spends and changed tips never appear as spendable', async t => {
  const { wallet, append, state } = await backend(t);
  append(); for (let i = 2; i <= 30; i++) append({ rewardScript: recipientScript });
  const payment = { txid: hash('payment'), vin: [{ txid: firstCoinbaseId, vout: 0 }], vout: [{ n: 0, value: '49.00000000', scriptPubKey: { hex: recipientScript } }] };
  append({ rewardScript: recipientScript, payments: [payment] }); assert.equal((await wallet.balance(owner)).confirmedAtoms, '0');
  const spendAgain = { txid: hash('same-block-spend'), vin: [{ txid: hash('payment-two'), vout: 0 }], vout: [{ n: 0, value: '48.00000000', scriptPubKey: { hex: recipientScript } }] };
  append({ rewardScript: recipientScript, payments: [{ ...payment, txid: hash('payment-two'), vin: [{ txid: payment.txid, vout: 0 }], vout: [{ n: 0, value: '48.90000000', scriptPubKey: { hex: script } }] }, spendAgain] });
  assert.equal((await wallet.balance(owner)).confirmedAtoms, '0');
  state.afterGetOutput = () => { state.afterGetOutput = null; append({ rewardScript: recipientScript }); };
  await assert.rejects(wallet.balance(recipient), /inconsistent|synchronizing/);
});

test('node identity, malformed blocks, inconsistent prevouts and capacity limits fail closed', async t => {
  const a = await backend(t); a.append(); a.state.wrongGenesis = true; await assert.rejects(a.wallet.balance(owner), /pinned/);
  a.state.wrongGenesis = false; a.state.wrongIdentity = true; await assert.rejects(a.wallet.balance(owner), /pinned/);
  a.state.wrongIdentity = false;
  a.state.blocks[1].tx[0].vout[0].value = '0.000000001'; await assert.rejects(a.wallet.balance(owner), /amount/);
  a.state.blocks[1].tx[0].vout[0].value = '50'; a.state.badOutput = { value: '49' }; await assert.rejects(a.wallet.balance(owner), /disagrees/);
  const b = await backend(t, { maxIndexEntries: 1 }); b.append(); b.append(); await assert.rejects(b.wallet.balance(owner), /capacity/);
  const c = await backend(t, { maxWalletUtxos: 1 }); c.append(); c.append(); await assert.rejects(c.wallet.balance(owner), /too many/);
  await assert.rejects(c.wallet.balance(address(31)), /native Doodleverse/);
  await assert.rejects(c.wallet.balance(address(123)), /P2PKH/);
});

test('saved index network binding rejects tampering instead of reusing foreign balances', async t => {
  const { wallet, append, directory, rpc } = await backend(t); append(); await wallet.balance(owner); await wallet.close();
  const db = new DatabaseSync(path.join(directory, 'scrypt-wallet-index/regtest.sqlite')); db.prepare('UPDATE metadata SET genesis=?').run(hash('foreign')); db.close();
  const other = createScryptWalletBackend({ rpc, dataDir: directory });
  await assert.rejects(other.balance(owner), /another network/); await other.close();
});

test('non-regtest header catch-up never exposes an old spendable balance', async t => {
  const chain = fixture(); chain.append(); const originalRpc = chain.rpc;
  chain.rpc = async (method, params) => {
    if (method === 'getblockhash' && params[0] === 0) return SCRYPT_NETWORKS.test.genesis;
    const value = await originalRpc(method, params);
    return method === 'getblockchaininfo' ? { ...value, chain: 'test', headers: value.blocks + 5 } : value;
  };
  const { wallet } = await backend(t, { network: 'test' }, chain);
  await assert.rejects(wallet.balance(address(65)), error => error.syncing && error.targetHeight === 6 && error.status === 503);
});

test('missing or tampered previous transactions fail before signing data is returned', async t => {
  const { wallet, append, state } = await backend(t); append(); for (let i = 2; i <= 30; i++) append({ rewardScript: recipientScript });
  const previous = state.rawTransactions.get(firstCoinbaseId);
  state.rawTransactions.delete(firstCoinbaseId);
  await assert.rejects(wallet.balance(owner), /transaction index/);
  state.rawTransactions.set(firstCoinbaseId, previous.slice(0, -2) + '01');
  await assert.rejects(wallet.balance(owner), /invalid previous transaction/);
  state.rawTransactions.set(firstCoinbaseId, previous);
  assert.equal(Object.keys((await wallet.balance(owner)).transactions).length, 1);
});

test('signed transaction decoder rejects altered identifiers, duplicates, unsigned or noncanonical forms', () => {
  const valid = signedShape(), decoded = decodeSignedScryptTransaction(valid.raw, valid.txid);
  assert.equal(decoded.inputs.length, 1); assert.equal(decoded.outputs.length, 2); assert.equal(decoded.inputs[0].scriptPubKey, script);
  assert.throws(() => decodeSignedScryptTransaction(valid.raw, hash('wrong')), /identifier/);
  for (const args of [{ duplicate: true }, { version: 3 }, { sequence: 0 }, { locktime: 1 }, { amount: 999999n }, { destination: '51' }, { signature: '300602010102010102' }, { signature: '30070202000102010101' }]) {
    const bad = signedShape(args); assert.throws(() => decodeSignedScryptTransaction(bad.raw, bad.txid));
  }
  for (const raw of [valid.raw + '00', valid.raw.slice(0, -2), valid.raw.slice(0, 8) + '00' + valid.raw.slice(10)]) assert.throws(() => decodeSignedScryptTransaction(raw, sha256d(Buffer.from(raw, 'hex')).reverse().toString('hex')));
});

test('broadcast checks confirmed ownership and exact fees, submits only signed hex, and retries idempotently', async t => {
  const { wallet, append, state } = await backend(t);
  append(); for (let i = 2; i <= 30; i++) append({ rewardScript: recipientScript });
  const tx = signedShape();
  const result = await wallet.broadcast(tx.raw, tx.txid); assert.equal(result.accepted, true); assert.equal(result.txid, tx.txid); assert.equal(state.sent, 1);
  const again = await wallet.broadcast(tx.raw, tx.txid); assert.equal(again.alreadyKnown, true); assert.equal(state.sent, 1);
  assert.equal((await wallet.balance(owner)).confirmedAtoms, '0');
  assert.ok(state.calls.every(call => !/sign|wallet|priv|import|passphrase/i.test(call.method)));
});

test('broadcast refuses immature, spent, mismatched ownership and unreasonable fees', async t => {
  const { wallet, append, state } = await backend(t); append();
  const tx = signedShape(); await assert.rejects(wallet.broadcast(tx.raw, tx.txid), /immature/);
  for (let i = 2; i <= 30; i++) append({ rewardScript: recipientScript });
  for (const fee of [0n, 100000001n]) { const bad = signedShape({ fee }); await assert.rejects(wallet.broadcast(bad.raw, bad.txid), /fee/); }
  state.mempoolSpent.add(firstCoinbaseId + ':0'); await assert.rejects(wallet.broadcast(tx.raw, tx.txid), /spent/); state.mempoolSpent.clear();
  state.badOutput = { scriptPubKey: { hex: recipientScript } }; await assert.rejects(wallet.broadcast(tx.raw, tx.txid), /does not own/); state.badOutput = null;
  state.getRawFailure = Object.assign(Error('Core offline'), { code: 'DVC_SCRYPT', status: 503 }); await assert.rejects(wallet.broadcast(tx.raw, tx.txid), /offline/); assert.equal(state.sent, 0);
});

test('concurrent sends cannot double-submit and a closed backend cannot be reused', async t => {
  const { wallet, append, state } = await backend(t); append(); for (let i = 2; i <= 30; i++) append({ rewardScript: recipientScript });
  const tx = signedShape(); const [first, second] = await Promise.all([wallet.broadcast(tx.raw, tx.txid), wallet.broadcast(tx.raw, tx.txid)]);
  assert.equal(first.accepted, true); assert.equal(second.alreadyKnown, true); assert.equal(state.sent, 1);
  await wallet.close(); await assert.rejects(wallet.balance(owner), /closing/);
});

test('confirmed retry receipts need an active block and Core rejection never becomes acceptance', async t => {
  const { wallet, append, state } = await backend(t); append(); for (let i = 2; i <= 30; i++) append({ rewardScript: recipientScript });
  const tx = signedShape();
  state.known.set(tx.txid, { txid: tx.txid, hex: tx.raw, blockhash: state.blocks[5].hash, confirmations: 26 });
  assert.equal((await wallet.broadcast(tx.raw, tx.txid)).alreadyKnown, true); assert.equal(state.sent, 0);
  state.known.set(tx.txid, { txid: tx.txid, hex: tx.raw, blockhash: hash('orphan'), confirmations: 1 });
  state.sendFailure = Object.assign(Error('arbitrary private node diagnostic must not escape'), { rpcCode: -26 });
  await assert.rejects(wallet.broadcast(tx.raw, tx.txid), error => error.status === 409 && !error.message.includes('private node'));
  assert.equal(state.sent, 1);
  state.known.set(tx.txid, { txid: tx.txid, hex: tx.raw + '00' });
  await assert.rejects(wallet.broadcast(tx.raw, tx.txid), /inconsistent transaction receipt/);
});

test('HTTP wallet surface rejects missing protection, duplicate/secret fields and unsupported requests', async t => {
  let calls = 0;
  const handler = createScryptWalletHttpHandler({ wallet: { balance: async received => { calls++; assert.equal(received, owner); return { confirmedAtoms: '0' }; }, broadcast: async () => { throw Error('unexpected'); } } });
  const server = http.createServer(async (req, res) => { if (!await handler(req, res, new URL(req.url, 'http://localhost'))) { res.writeHead(404); res.end(); } });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve)); t.after(() => new Promise(resolve => server.close(resolve)));
  const base = 'http://127.0.0.1:' + server.address().port;
  const post = (body, headers = { 'X-Keeper-Request': '1' }, route = '/scrypt/wallet/balance') => fetch(base + route, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body });
  assert.equal((await post(JSON.stringify({ address: owner }), {})).status, 403);
  for (const body of ['{"address":"x","address":"y"}', JSON.stringify({ address: owner, password: 'do-not-send' }), JSON.stringify({ address: owner, method: 'dumpprivkey' }), JSON.stringify({ address: 'x'.repeat(300) })]) assert.equal((await post(body)).status, 400);
  assert.equal((await post(JSON.stringify({ address: owner }), { 'X-Keeper-Request': '1', 'Content-Encoding': 'gzip' })).status, 415);
  assert.equal((await fetch(base + '/scrypt/wallet/balance')).status, 400);
  assert.equal((await post('{}', { 'X-Keeper-Request': '1' }, '/scrypt/wallet/balance?address=x')).status, 400);
  const result = await post(JSON.stringify({ address: owner })); assert.equal(result.status, 200); assert.equal(result.headers.get('cache-control'), 'no-store'); assert.equal(calls, 1);
});

test('HTTP catch-up exposes retryable sync state instead of a misleading zero balance', async t => {
  const handler = createScryptWalletHttpHandler({ wallet: { balance: async () => { throw Object.assign(Error('Syncing'), { code: 'DVC_SCRYPT_WALLET', status: 503, syncing: true, height: 10, targetHeight: 50 }); } } });
  const server = http.createServer((req, res) => handler(req, res, new URL(req.url, 'http://localhost')));
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve)); t.after(() => new Promise(resolve => server.close(resolve)));
  const response = await fetch('http://127.0.0.1:' + server.address().port + '/scrypt/wallet/balance', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Keeper-Request': '1' }, body: JSON.stringify({ address: owner }) });
  assert.equal(response.status, 503); assert.equal(response.headers.get('retry-after'), '2');
  assert.deepEqual(await response.json(), { error: 'Syncing', syncing: true, height: 10, targetHeight: 50, retryAfter: 2 });
});
