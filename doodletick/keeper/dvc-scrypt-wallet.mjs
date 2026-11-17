// SPDX-License-Identifier: GPL-3.0-only
// Public chain data only. Signing keys and wallet passwords never reach this module.
import { createHash } from 'node:crypto';
import { mkdir, lstat, chmod } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import { SCRYPT_NETWORKS, addressScript, sha256d } from './dvc-scrypt-protocol.mjs';

const MAX_MONEY = 21000000n * 100000000n;
const CURVE_ORDER = 0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n;
const HASH = /^[0-9a-f]{64}$/;
const P2PKH = /^76a914[0-9a-f]{40}88ac$/;
// Pinned Core consensus/consensus.h: MAX_BLOCK_BASE_SIZE. These chains disable
// witness and AuxPoW; script creation has no separate 10-kB consensus limit.
const MAX_BLOCK_BASE_BYTES = 1000000;
const failure = (message, status = 503, details = {}) => Object.assign(new Error(message), { code: 'DVC_SCRYPT_WALLET', status, ...details });
const invalid = message => { throw failure(message, 400); };
const int = (value, max = 0x7fffffff) => Number.isSafeInteger(value) && value >= 0 && value <= max;
const hash160 = bytes => createHash('ripemd160').update(createHash('sha256').update(bytes).digest()).digest('hex');

export const SCRYPT_WALLET_POLICY = Object.freeze({ maturity: 30, minOutputAtoms: '1000000', feeAtomsPerByte: '1000', maxFeeAtoms: '100000000', maxInputs: 100, maxOutputs: 2, maxTransactionBytes: 32768 });

// Core emits at most eight decimal places. Reconstruct the decimal rather than
// multiplying a binary float and silently rounding a one-atom discrepancy.
export function rpcCoinAtoms(value) {
  let decimal;
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || value < 0 || value > 21000000) throw failure('The node returned an invalid coin amount.');
    decimal = value.toFixed(8);
    if (Number(decimal) !== value) throw failure('The node returned a fractional atom.');
  } else if (typeof value === 'string') decimal = value;
  else throw failure('The node returned an invalid coin amount.');
  if (!/^(?:0|[1-9][0-9]{0,7})(?:\.[0-9]{1,8})?$/.test(decimal)) throw failure('The node returned an invalid coin amount.');
  const [whole, fraction = ''] = decimal.split('.');
  const atoms = BigInt(whole) * 100000000n + BigInt(fraction.padEnd(8, '0'));
  if (atoms > MAX_MONEY) throw failure('The node returned an out-of-range coin amount.');
  return atoms;
}

function signedP2pkhScript(script) {
  const signatureLength = script[0];
  if (signatureLength < 9 || signatureLength > 73 || script.length !== signatureLength + 35 || script[signatureLength + 1] !== 33) invalid('Only canonical signed P2PKH inputs are supported.');
  const signature = script.subarray(1, signatureLength + 1), der = signature.subarray(0, -1);
  if (signature.at(-1) !== 1 || der[0] !== 0x30 || der[1] !== der.length - 2 || der[2] !== 2) invalid('Use strict DER signatures with SIGHASH_ALL.');
  const rLength = der[3], sTag = 4 + rLength;
  if (!rLength || rLength > 33 || sTag + 2 > der.length || der[sTag] !== 2) invalid('Invalid transaction signature.');
  const sLength = der[sTag + 1];
  if (!sLength || sLength > 33 || sTag + 2 + sLength !== der.length) invalid('Invalid transaction signature.');
  const r = der.subarray(4, sTag), s = der.subarray(sTag + 2);
  for (const scalar of [r, s]) if ((scalar[0] & 0x80) || (scalar.length > 1 && scalar[0] === 0 && !(scalar[1] & 0x80))) invalid('Noncanonical transaction signature.');
  const rValue = BigInt('0x' + r.toString('hex')), sValue = BigInt('0x' + s.toString('hex'));
  if (!rValue || rValue >= CURVE_ORDER || !sValue || sValue > CURVE_ORDER / 2n) invalid('Use a valid low-S transaction signature.');
  const publicKey = script.subarray(signatureLength + 2);
  if (publicKey.length !== 33 || ![2, 3].includes(publicKey[0])) invalid('Use a compressed public key.');
  return '76a914' + hash160(publicKey) + '88ac';
}

const compactBytes = count => count < 253 ? 1 : count <= 65535 ? 3 : 5;
function scriptBytes(script) {
  if (typeof script !== 'string' || script.length % 2 || script.length > MAX_BLOCK_BASE_BYTES * 2 || !/^[0-9a-f]*$/.test(script)) throw failure('The node returned an invalid serialized script.');
  return script.length / 2;
}
function validateBlockWireBounds(block) {
  // Every nonempty legacy transaction needs at least 60 bytes: fixed fields,
  // one minimum input (41 bytes), and one minimum output (9 bytes).
  if (!Array.isArray(block.tx) || !block.tx.length || block.tx.length > Math.floor((MAX_BLOCK_BASE_BYTES - 80) / 60)) throw failure('The node returned invalid block transaction data.');
  let blockBytes = 80 + compactBytes(block.tx.length);
  for (const tx of block.tx) {
    if (!HASH.test(tx?.txid || '') || !Array.isArray(tx.vin) || !tx.vin.length || tx.vin.length > Math.floor(MAX_BLOCK_BASE_BYTES / 41) || !Array.isArray(tx.vout) || !tx.vout.length || tx.vout.length > Math.floor(MAX_BLOCK_BASE_BYTES / 9)) throw failure('The node returned invalid transaction data.');
    let transactionBytes = 8 + compactBytes(tx.vin.length) + compactBytes(tx.vout.length);
    for (const input of tx.vin) {
      const size = scriptBytes(Object.hasOwn(input, 'coinbase') ? input.coinbase : input.scriptSig?.hex);
      if (!int(input.sequence, 0xffffffff) || Array.isArray(input.txinwitness) && input.txinwitness.length) throw failure('The node returned an unsupported input encoding.');
      transactionBytes += 40 + compactBytes(size) + size;
      if (transactionBytes > MAX_BLOCK_BASE_BYTES) throw failure('The node returned an oversized transaction.');
    }
    for (const output of tx.vout) {
      const size = scriptBytes(output.scriptPubKey?.hex);
      transactionBytes += 8 + compactBytes(size) + size;
      if (transactionBytes > MAX_BLOCK_BASE_BYTES) throw failure('The node returned an oversized transaction.');
    }
    blockBytes += transactionBytes;
    if (blockBytes > MAX_BLOCK_BASE_BYTES) throw failure('The node returned an oversized block.');
  }
  if (block.strippedsize !== blockBytes || block.size !== blockBytes) throw failure('The node returned inconsistent serialized block sizes.');
}

// Decode locally before invoking Core: no server-generated transaction or hidden
// wallet method can alter a recipient, change output, fee or signature.
export function decodeSignedScryptTransaction(rawTransaction, expectedTxid) {
  if (typeof rawTransaction !== 'string' || rawTransaction.length < 120 || rawTransaction.length > SCRYPT_WALLET_POLICY.maxTransactionBytes * 2 || !/^(?:[0-9a-f]{2})+$/.test(rawTransaction)) invalid('Invalid or oversized signed transaction.');
  if (typeof expectedTxid !== 'string' || !HASH.test(expectedTxid)) invalid('A transaction identifier is required.');
  const bytes = Buffer.from(rawTransaction, 'hex'), txid = sha256d(bytes).reverse().toString('hex');
  if (txid !== expectedTxid) invalid('The signed transaction identifier does not match.');
  let offset = 0;
  function take(size) { if (!int(size) || offset + size > bytes.length) invalid('Truncated signed transaction.'); const value = bytes.subarray(offset, offset += size); return value; }
  const uint32 = () => take(4).readUInt32LE();
  function compact(max) {
    const first = take(1)[0];
    if (first >= 253 || first > max) invalid('Noncanonical or unsupported transaction length.');
    return first;
  }
  const version = uint32();
  if (version !== 1 && version !== 2) invalid('Unsupported transaction version.');
  const count = compact(SCRYPT_WALLET_POLICY.maxInputs);
  if (!count) invalid('A signed transaction needs confirmed inputs.');
  const inputs = [], outpoints = new Set();
  for (let i = 0; i < count; i++) {
    const previous = Buffer.from(take(32)).reverse().toString('hex'), vout = uint32();
    if (previous === '00'.repeat(32) || vout === 0xffffffff) invalid('Coinbase creation is not a wallet payment.');
    const key = previous + ':' + vout;
    if (outpoints.has(key)) invalid('The transaction repeats an input.');
    outpoints.add(key);
    const script = signedP2pkhScript(take(compact(108)));
    if (uint32() !== 0xffffffff) invalid('Only final-sequence payments are supported.');
    inputs.push({ txid: previous, vout, scriptPubKey: script });
  }
  const outputCount = compact(SCRYPT_WALLET_POLICY.maxOutputs);
  if (!outputCount) invalid('A payment needs a recipient.');
  const outputs = []; let outputAtoms = 0n;
  for (let i = 0; i < outputCount; i++) {
    const value = take(8).readBigUInt64LE(), script = take(compact(25)).toString('hex');
    if (!P2PKH.test(script) || value < BigInt(SCRYPT_WALLET_POLICY.minOutputAtoms) || value > MAX_MONEY) invalid('Use native P2PKH outputs of at least 0.01 DVC.');
    outputAtoms += value;
    if (outputAtoms > MAX_MONEY) invalid('Payment exceeds the chain supply.');
    outputs.push({ valueAtoms: value.toString(), scriptPubKey: script });
  }
  if (uint32() !== 0 || offset !== bytes.length) invalid('Unsupported locktime or trailing transaction data.');
  return { txid, version, bytes: bytes.length, inputs, outputs, outputAtoms };
}

export function createScryptWalletBackend({ rpc, network = 'regtest', dataDir, maxBlocksPerSync = 128, maxSyncMilliseconds = 5000, maxWalletUtxos = 1000, maxIndexEntries = 2000000, maxDatabasePages = 262144, backgroundSync = true, now = Date.now } = {}) {
  let database, opening, closed = false, syncTimer, queue = Promise.resolve();
  if (!SCRYPT_NETWORKS[network]?.enabled) throw failure('This Doodleverse network is not enabled.');
  for (const [value, max] of [[maxBlocksPerSync, 2048], [maxSyncMilliseconds, 20000], [maxWalletUtxos, 2000], [maxIndexEntries, 5000000], [maxDatabasePages, 1048576]]) if (!int(value, max) || !value) throw failure('Invalid wallet index limits.');
  const genesis = SCRYPT_NETWORKS[network].genesis;
  function scheduleSync() {
    if (!backgroundSync || closed || syncTimer) return;
    syncTimer = setTimeout(() => {
      syncTimer = undefined;
      serial(synchronize).catch(error => { if (error.syncing === true) scheduleSync(); });
    }, 2000);
    syncTimer.unref?.();
  }
  const serial = operation => {
    const result = queue.then(() => { if (closed) throw failure('The wallet connection is closing.'); return operation(); });
    queue = result.catch(error => { if (error.syncing === true) scheduleSync(); }); return result;
  };
  async function open() {
    if (database) return database;
    if (opening) return opening;
    opening = (async () => {
      if (typeof dataDir !== 'string' || !dataDir) throw failure('Configure the wallet index data folder locally.');
      const directory = path.resolve(dataDir, 'scrypt-wallet-index');
      await mkdir(directory, { recursive: true, mode: 0o700 });
      if (!(await lstat(directory)).isDirectory() || (await lstat(directory)).isSymbolicLink()) throw failure('The wallet index directory is invalid.');
      const file = path.join(directory, network + '.sqlite');
      try { const info = await lstat(file); if (!info.isFile() || info.isSymbolicLink()) throw failure('The wallet index file is invalid.'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
      let db;
      try {
        db = new DatabaseSync(file);
        db.exec('PRAGMA trusted_schema=OFF; PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA busy_timeout=3000; PRAGMA max_page_count=' + maxDatabasePages + ';');
        db.exec('CREATE TABLE IF NOT EXISTS metadata (id INTEGER PRIMARY KEY CHECK(id=1), schema_version INTEGER NOT NULL, network TEXT NOT NULL, genesis TEXT NOT NULL, height INTEGER NOT NULL, tip TEXT NOT NULL, entries INTEGER NOT NULL); CREATE TABLE IF NOT EXISTS utxos (txid TEXT NOT NULL, vout INTEGER NOT NULL, script TEXT NOT NULL, atoms TEXT NOT NULL, height INTEGER NOT NULL, coinbase INTEGER NOT NULL, PRIMARY KEY(txid,vout)) WITHOUT ROWID; CREATE INDEX IF NOT EXISTS utxos_script ON utxos(script);');
        let meta = db.prepare('SELECT * FROM metadata WHERE id=1').get();
        if (!meta) { db.prepare('INSERT INTO metadata VALUES(1,1,?,?,0,?,0)').run(network, genesis, genesis); meta = db.prepare('SELECT * FROM metadata WHERE id=1').get(); }
        if (meta.schema_version !== 1 || meta.network !== network || meta.genesis !== genesis || !int(meta.height) || !HASH.test(meta.tip) || !int(meta.entries, maxIndexEntries)) throw failure('The saved wallet index belongs to another network or needs repair.');
        if (db.prepare('SELECT count(*) AS count FROM utxos').get().count !== meta.entries) throw failure('The wallet index needs repair before balances can be shown.');
        await chmod(file, 0o600);
        database = db; return db;
      } catch (error) { try { db?.close(); } catch {} throw error; }
    })().catch(error => { opening = undefined; if (error.code === 'DVC_SCRYPT_WALLET') throw error; throw failure('The public wallet index is unavailable. Other Keeper features remain available.'); });
    return opening;
  }
  async function identity() {
    if (typeof rpc !== 'function') throw failure('Start this Keeper’s native Doodleverse node to use its wallet.');
    const [chain, first, info] = await Promise.all([rpc('getblockchaininfo'), rpc('getblockhash', [0]), rpc('getnetworkinfo')]);
    if (chain?.chain !== network || first !== genesis || !/^\/DoodleverseCore:/.test(info?.subversion || '') || !int(chain.blocks) || !HASH.test(chain.bestblockhash || '')) throw failure('The node does not match this wallet’s pinned Doodleverse network.');
    if (chain.pruned === true) throw failure('Wallet indexing needs an unpruned Doodleverse node.');
    // Regtest deliberately permits controlled invalidate/reconsider operations;
    // its best-header counter can remain ahead of a manually rewound active tip.
    if (network !== 'regtest' && (int(chain.headers) && chain.headers > chain.blocks || chain.blocks > 0 && chain.initialblockdownload === true)) throw failure('The node is still downloading its chain. Wallet balances are not ready.', 503, { syncing: true, height: chain.blocks, targetHeight: int(chain.headers) ? chain.headers : chain.blocks });
    return chain;
  }
  const syncing = (height, target) => failure('Wallet history is synchronizing. Retry shortly; no spendable balance has been reported.', 503, { syncing: true, height, targetHeight: target, retryAfter: 2 });
  function transaction(db, work) {
    db.exec('BEGIN IMMEDIATE');
    try { const result = work(); db.exec('COMMIT'); return result; }
    catch (error) { try { db.exec('ROLLBACK'); } catch {} throw error; }
  }
  function reset(db) { transaction(db, () => { db.exec('DELETE FROM utxos'); db.prepare('UPDATE metadata SET height=0,tip=?,entries=0 WHERE id=1').run(genesis); }); }
  function indexBlock(db, block, expectedHash, previous) {
    if (!block || block.hash !== expectedHash || block.height !== previous.height + 1 || block.previousblockhash !== previous.tip || !int(block.confirmations) || block.confirmations < 1) throw syncing(previous.height, block?.height);
    validateBlockWireBounds(block);
    let count = previous.entries;
    const remove = db.prepare('DELETE FROM utxos WHERE txid=? AND vout=?');
    const insert = db.prepare('INSERT INTO utxos(txid,vout,script,atoms,height,coinbase) VALUES(?,?,?,?,?,?)');
    transaction(db, () => {
      for (let transactionIndex = 0; transactionIndex < block.tx.length; transactionIndex++) {
        const tx = block.tx[transactionIndex];
        const coinbase = tx.vin.length === 1 && typeof tx.vin[0].coinbase === 'string';
        if (coinbase !== (transactionIndex === 0)) throw failure('The node returned an invalid coinbase position.');
        if (!coinbase) for (const input of tx.vin) {
          if (!HASH.test(input.txid || '') || !int(input.vout, 0xfffffffe)) throw failure('The node returned an invalid previous output.');
          count -= Number(remove.run(input.txid, input.vout).changes);
        }
        let transactionAtoms = 0n;
        for (let outputIndex = 0; outputIndex < tx.vout.length; outputIndex++) {
          const output = tx.vout[outputIndex], atoms = rpcCoinAtoms(output.value), script = output.scriptPubKey?.hex;
          if (output.n !== outputIndex) throw failure('The node returned an invalid output index.');
          transactionAtoms += atoms;
          if (transactionAtoms > MAX_MONEY) throw failure('The node returned an out-of-range transaction total.');
          if (atoms && P2PKH.test(script)) {
            if (++count > maxIndexEntries) throw failure('The wallet index reached its configured capacity. Balances are unavailable until the operator expands it.');
            insert.run(tx.txid, outputIndex, script, atoms.toString(), block.height, coinbase ? 1 : 0);
          }
        }
      }
      db.prepare('UPDATE metadata SET height=?,tip=?,entries=? WHERE id=1').run(block.height, block.hash, count);
    });
  }
  async function synchronize() {
    const chain = await identity(), db = await open();
    let meta = db.prepare('SELECT * FROM metadata WHERE id=1').get();
    if (meta.height > chain.blocks || await rpc('getblockhash', [meta.height]) !== meta.tip) { reset(db); meta = db.prepare('SELECT * FROM metadata WHERE id=1').get(); }
    const started = now(); let read = 0;
    while (meta.height < chain.blocks && read < maxBlocksPerSync && now() - started < maxSyncMilliseconds) {
      const blockHash = await rpc('getblockhash', [meta.height + 1]);
      if (!HASH.test(blockHash || '')) throw failure('The node returned an invalid block identifier.');
      const block = await rpc('getblock', [blockHash, 2]);
      indexBlock(db, block, blockHash, meta); read++;
      meta = db.prepare('SELECT * FROM metadata WHERE id=1').get();
    }
    if (meta.height !== chain.blocks || await rpc('getbestblockhash') !== meta.tip) throw syncing(meta.height, chain.blocks);
    return { db, height: meta.height, tip: meta.tip };
  }
  function validateOutput(output, tip, expected) {
    if (!output) return null; // Core excludes outputs spent by its mempool.
    if (output.bestblock !== tip || !int(output.confirmations) || typeof output.coinbase !== 'boolean' || !P2PKH.test(output.scriptPubKey?.hex || '')) throw failure('The node returned inconsistent spendable-output data.');
    const atoms = rpcCoinAtoms(output.value);
    if (!atoms || expected && (expected.script !== output.scriptPubKey.hex || expected.atoms !== atoms.toString() || !!expected.coinbase !== output.coinbase || expected.confirmations !== output.confirmations)) throw failure('The wallet index disagrees with the node. Refresh before spending.');
    return { atoms, confirmations: output.confirmations, coinbase: output.coinbase, script: output.scriptPubKey.hex };
  }
  async function knownTransaction(rawTransaction, txid) {
    let known;
    try { known = await rpc('getrawtransaction', [txid, true]); }
    catch (error) { if (error.rpcCode === -5) return false; throw error; }
    if (!known || known.txid !== txid || known.hex !== rawTransaction) throw failure('The node returned an inconsistent transaction receipt.');
    if (known.blockhash) {
      if (!HASH.test(known.blockhash) || !int(known.confirmations) || known.confirmations < 1) return false;
      const header = await rpc('getblockheader', [known.blockhash]);
      if (header?.hash !== known.blockhash || !int(header.confirmations) || header.confirmations < 1) return false;
    }
    return true;
  }
  return {
    balance(address) {
      return serial(async () => {
        let script;
        try { script = addressScript(address, network).toString('hex'); } catch { invalid('Enter a native Doodleverse address for this network.'); }
        if (!P2PKH.test(script)) invalid('This wallet supports native P2PKH addresses.');
        const { db, height, tip } = await synchronize();
        const rows = db.prepare('SELECT * FROM utxos WHERE script=? ORDER BY height,txid,vout LIMIT ?').all(script, maxWalletUtxos + 1);
        if (rows.length > maxWalletUtxos) throw failure('This address has too many unspent outputs for the site wallet. Use a compatible wallet to consolidate them.', 409);
        let confirmed = 0n, immature = 0n; const utxos = [];
        for (let start = 0; start < rows.length; start += 8) {
          const results = await Promise.all(rows.slice(start, start + 8).map(async row => {
            if (!HASH.test(row.txid) || !int(row.vout, 0xfffffffe) || !int(row.height) || row.height < 1 || row.height > height || !['0', '1'].includes(String(row.coinbase)) || !/^[1-9][0-9]{0,15}$/.test(row.atoms)) throw failure('The saved wallet index needs repair.');
            const confirmations = height - row.height + 1;
            const output = validateOutput(await rpc('gettxout', [row.txid, row.vout, true]), tip, { ...row, confirmations });
            return output && { row, output };
          }));
          for (const item of results) if (item) {
            const { row, output } = item;
            if (output.coinbase && output.confirmations < SCRYPT_WALLET_POLICY.maturity) immature += output.atoms;
            else { confirmed += output.atoms; utxos.push({ txid: row.txid, vout: row.vout, valueAtoms: output.atoms.toString(), scriptPubKey: script, confirmations: output.confirmations, coinbase: output.coinbase }); }
          }
        }
        // Give the browser the complete previous transaction, so it can bind
        // each input's value and script to its txid before showing any fee.
        const transactions = Object.create(null); let rawBytes = 0;
        for (const txid of new Set(utxos.map(output => output.txid))) {
          let raw;
          try { raw = await rpc('getrawtransaction', [txid, false]); }
          catch (error) { if (error.rpcCode === -5) throw failure('The node cannot provide this payment’s previous transaction. Enable its transaction index before spending.'); throw error; }
          if (typeof raw !== 'string' || raw.length < 120 || raw.length > 2 * 1024 * 1024 || !/^(?:[0-9a-f]{2})+$/.test(raw) || sha256d(Buffer.from(raw, 'hex')).reverse().toString('hex') !== txid) throw failure('The node returned an invalid previous transaction.');
          rawBytes += raw.length;
          if (rawBytes > 4 * 1024 * 1024) throw failure('The previous transactions exceed this site wallet’s response limit. Use a compatible wallet to consolidate them.', 409);
          transactions[txid] = raw;
        }
        if (await rpc('getbestblockhash') !== tip) throw syncing(height, height);
        if (confirmed + immature > MAX_MONEY) throw failure('The node returned an out-of-range wallet balance.');
        return { network, genesis, height, tip, address, confirmedAtoms: confirmed.toString(), immatureAtoms: immature.toString(), utxos, transactions, syncing: false, policy: SCRYPT_WALLET_POLICY };
      });
    },
    broadcast(rawTransaction, expectedTxid) {
      return serial(async () => {
        const transaction = decodeSignedScryptTransaction(rawTransaction, expectedTxid), chain = await identity();
        if (await knownTransaction(rawTransaction, transaction.txid)) return { txid: transaction.txid, accepted: true, network, alreadyKnown: true };
        let inputAtoms = 0n;
        for (const input of transaction.inputs) {
          const output = validateOutput(await rpc('gettxout', [input.txid, input.vout, true]), chain.bestblockhash);
          if (!output || output.confirmations < 1 || output.coinbase && output.confirmations < SCRYPT_WALLET_POLICY.maturity) throw failure('A payment input is spent, unconfirmed or immature. Refresh the wallet and review a new payment.', 409);
          if (input.scriptPubKey !== output.script) invalid('A signature public key does not own its previous output.');
          inputAtoms += output.atoms;
          if (inputAtoms > MAX_MONEY) invalid('Payment inputs exceed the chain supply.');
        }
        const fee = inputAtoms - transaction.outputAtoms;
        if (fee < BigInt(transaction.bytes) * BigInt(SCRYPT_WALLET_POLICY.feeAtomsPerByte) || fee > BigInt(SCRYPT_WALLET_POLICY.maxFeeAtoms)) invalid('The signed fee is outside the site wallet’s reviewed limits.');
        if (await rpc('getbestblockhash') !== chain.bestblockhash) throw failure('The chain changed while reviewing inputs. Refresh the wallet before sending.', 409);
        try {
          const accepted = await rpc('sendrawtransaction', [rawTransaction, false]);
          if (accepted !== transaction.txid) throw failure('The node returned an unexpected transaction identifier.');
        } catch (error) {
          if ([-25, -26, -27].includes(error.rpcCode)) {
            if (await knownTransaction(rawTransaction, transaction.txid)) return { txid: transaction.txid, accepted: true, network, alreadyKnown: true };
            throw failure('The node rejected this signed payment. Refresh the wallet and review a new payment.', 409);
          }
          throw error;
        }
        return { txid: transaction.txid, accepted: true, network };
      });
    },
    async close() { closed = true; clearTimeout(syncTimer); await queue; if (database) { database.close(); database = undefined; } },
  };
}
