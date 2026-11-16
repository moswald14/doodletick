// SPDX-License-Identifier: GPL-3.0-only
// Only disposable regtest identities and temporary directories are used here.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { SigningKey, computeAddress, TypedDataEncoder } from '../public/recipient-crypto.mjs';
import { genesis, validateChain, validateBlock, createMiningJob, finalizeBlock, workDigest, createTransferDraft, transferTypedData, attachTransferSignature } from '../public/dvc-core.mjs';
import { createDvcNode } from '../dvc-node.mjs';

const aliceKey = new SigningKey('0x' + '4'.repeat(64)), bobKey = new SigningKey('0x' + '5'.repeat(64)), minerKey = new SigningKey('0x' + '6'.repeat(64));
const alice = computeAddress(aliceKey.publicKey).toLowerCase(), bob = computeAddress(bobKey.publicKey).toLowerCase(), miner = computeAddress(minerKey.publicKey).toLowerCase();
const START = 1794816000, NOW = (START + 1000000) * 1000;
const TARGET = ((1n << 252n) - 1n).toString(16).padStart(64, '0'), MAX_TARGET = ((1n << 254n) - 1n).toString(16).padStart(64, '0');
const clone = value => JSON.parse(JSON.stringify(value));
function network(name, options = {}) { return genesis('doodleverse-regtest-node-' + name, { founderAddress: alice, initialBaseTarget: TARGET, maxBaseTarget: MAX_TARGET, ...options }); }
function transfer(g, fields = {}, key = aliceKey) {
  const draft = createTransferDraft({ sender: alice, recipient: bob, amountAtoms: '2000', nonce: '0', validUntilHeight: '100', ...fields }, { genesis: g });
  const typed = transferTypedData(draft, { genesis: g });
  const signature = key.sign(TypedDataEncoder.hash(typed.domain, { DoodleverseTransfer: typed.types.DoodleverseTransfer }, typed.message)).serialized;
  return attachTransferSignature(draft, signature, { genesis: g });
}
function solve(job) {
  const algorithm = job.algorithm || job.header.algorithm;
  for (let nonce = 0n; nonce < 1000000n; nonce++) {
    const text = nonce.toString(), digest = workDigest(job.prefixHex, text, algorithm);
    if (BigInt('0x' + digest) <= BigInt('0x' + job.targetHex)) return job.block ? { ...job.block, nonce: text, digest } : finalizeBlock(job, text);
  }
  throw Error('Disposable work fixture exhausted its bound.');
}
function chain(g, length, { seconds = 60, who = miner, transactions = [] } = {}) {
  let state = validateChain([], { genesis: g, now: NOW }); const blocks = [];
  for (let i = 0; i < length; i++) {
    const block = solve(createMiningJob(state, { miner: who, timestamp: START + (i + 1) * seconds, transactions: transactions[i] || [], now: NOW }));
    state = validateBlock(block, state, { now: NOW }); blocks.push(block);
  }
  return { state, blocks };
}
async function fixture(t, name, options = {}, overrides = {}) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'dvc-node-')), g = network(name, overrides), nodes = new Set();
  const open = async more => { const node = await createDvcNode({ dataDir: dir, genesis: g, now: () => NOW, ...options, ...more }); nodes.add(node); return node; };
  t.after(async () => { for (const node of nodes) await node.close(); await fs.rm(dir, { recursive: true, force: true }); });
  return { dir, g, file: path.join(dir, 'dvc-chain.jsonl'), open, node: await open() };
}

test('genesis state is independent, same-process directory reuse is rejected, public results cannot mutate balances', async t => {
  const f = await fixture(t, 'genesis');
  assert.equal(f.node.status().tip.height, '0');
  assert.equal(f.node.status().supply.issuedAtoms, f.g.founderAtoms);
  assert.equal(f.node.account(alice).availableAtoms, f.g.founderAtoms);
  const result = f.node.status(); result.genesis.founderAtoms = '0';
  assert.equal(f.node.status().genesis.founderAtoms, f.g.founderAtoms);
  await assert.rejects(f.open(), { code: 'DVC_CONFLICT' });
  assert.deepEqual((await fs.readdir(f.dir)).sort(), ['dvc-chain.jsonl']);
  await f.node.close(); await assert.rejects(f.open({ genesis: network('different') }), { code: 'DVC_STORAGE' });
  const restored = await f.open(); assert.equal(restored.status().tip.hash, f.g.hash);
});

test('concurrent signed spends reserve one nonce, reject overspend and unconfirmed incoming funds, and persist', async t => {
  const f = await fixture(t, 'pending'), first = transfer(f.g), conflict = transfer(f.g, { amountAtoms: '3000' });
  const attempts = await Promise.allSettled([f.node.submitTransfer(first), f.node.submitTransfer(conflict)]);
  assert.equal(attempts.filter(value => value.status === 'fulfilled').length, 1);
  assert.equal(attempts.find(value => value.status === 'rejected').reason.code, 'DVC_NONCE');
  assert.equal(f.node.account(alice).nextNonce, '1'); assert.equal(f.node.account(alice).pendingOutAtoms, '3000');
  assert.equal(f.node.account(alice).availableAtoms, f.g.founderAtoms);
  assert.equal((await f.node.submitTransfer(first)).duplicate, true);
  await assert.rejects(f.node.submitTransfer(transfer(f.g, { nonce: '1', amountAtoms: f.g.founderAtoms })), { code: 'DVC_BALANCE' });
  await assert.rejects(f.node.submitTransfer(transfer(f.g, { sender: bob, recipient: miner, amountAtoms: '1' }, bobKey)), { code: 'DVC_BALANCE' });
  await f.node.close(); const restored = await f.open();
  assert.equal(restored.account(alice).nextNonce, '1'); assert.equal(restored.getMempool().transactions.length, 1);
  const block = solve(restored.createJob({ miner, algorithm: 'sha256d' })); await restored.submitBlock(block);
  assert.equal(restored.account(bob).totalAtoms, '2000'); assert.equal(restored.account(alice).pendingOutAtoms, '0');
  assert.equal(restored.account(alice).nextNonce, '1'); assert.equal(restored.getMempool().total, 0);
  assert.equal((await restored.submitTransfer(first)).status, 'confirmed');
});

test('competing concurrent mining submissions commit exactly one current-tip block', async t => {
  const f = await fixture(t, 'concurrent');
  const a = solve(f.node.createJob({ miner, algorithm: 'sha256' })), b = solve(f.node.createJob({ miner: bob, algorithm: 'sha256' }));
  const answers = await Promise.allSettled([f.node.submitBlock(a), f.node.submitBlock(b)]);
  assert.equal(answers.filter(value => value.status === 'fulfilled').length, 1);
  assert.equal(answers.find(value => value.status === 'rejected').reason.code, 'DVC_CONFLICT');
  assert.equal(f.node.status().tip.height, '1');
  assert.equal((await f.node.submitBlock(a)).reason, 'already-known');
  const before = f.node.status().tip, bytes = await fs.readFile(f.file);
  await assert.rejects(f.node.submitBlock({ ...a, transactions: [{ fake: true }] }), { code: 'DVC_BLOCK_INVALID' });
  assert.deepEqual(f.node.status().tip, before); assert.deepEqual(await fs.readFile(f.file), bytes);
});

test('coinbase funds remain unavailable until six further blocks and are never reserved early', async t => {
  const f = await fixture(t, 'maturity');
  for (let i = 0; i < 6; i++) await f.node.submitBlock(solve(f.node.createJob({ miner, algorithm: 'sha256' })));
  assert.equal(f.node.account(miner).availableAtoms, '0'); assert.equal(f.node.account(miner).immatureAtoms, '30000000000');
  await assert.rejects(f.node.submitTransfer(transfer(f.g, { sender: miner, recipient: bob }, minerKey)), { code: 'DVC_BALANCE' });
  await f.node.submitBlock(solve(f.node.createJob({ miner, algorithm: 'sha256' })));
  assert.equal(f.node.account(miner).availableAtoms, '5000000000');
  await f.node.submitTransfer(transfer(f.g, { sender: miner, recipient: bob }, minerKey));
  assert.equal(f.node.account(miner).pendingOutAtoms, '3000');
  assert.equal(f.node.account(miner).totalAtoms, '35000000000');
  const history = f.node.account(miner).recentTransactions;
  assert(history.length <= 100); assert(history.some(value => value.type === 'coinbase' && value.confirmations === 7 && value.status === 'confirmed'));
});

test('higher-work reorganization restores valid orphaned transfers before pending later nonces', async t => {
  const f = await fixture(t, 'reorg'), first = transfer(f.g), second = transfer(f.g, { nonce: '1', amountAtoms: '3000' });
  await f.node.submitTransfer(first);
  for (let i = 0; i < 2; i++) await f.node.submitBlock(solve(f.node.createJob({ miner, algorithm: 'sha256' })));
  await f.node.submitTransfer(second); assert.equal(f.node.account(bob).availableAtoms, '2000');
  const alternate = chain(f.g, 3, { who: bob }), old = f.node.status().tip;
  const tie = await f.node.ingestSegment({ ancestorHash: f.g.hash, blocks: alternate.blocks.slice(0, 2) });
  assert.equal(tie.adopted, false); assert.deepEqual(f.node.status().tip, old);
  assert(f.node.locators().locators.includes(alternate.blocks[1].digest));
  const adopted = await f.node.ingestSegment({ ancestorHash: alternate.blocks[1].digest, blocks: alternate.blocks.slice(2) });
  assert.equal(adopted.reorganized, true); assert.equal(f.node.account(bob).availableAtoms, '0');
  assert.deepEqual(f.node.getMempool().transactions.map(tx => tx.nonce), ['0', '1']);
  assert.equal(f.node.account(alice).pendingOutAtoms, '7000'); assert.equal(f.node.account(alice).nextNonce, '2');
  await f.node.close(); const restored = await f.open();
  assert.equal(restored.status().tip.hash, alternate.state.tipHash);
  assert.deepEqual(restored.getMempool().transactions.map(tx => tx.nonce), ['0', '1']);
});

test('shorter chain with strictly more validated work wins and equal-work branches keep current', async t => {
  const f = await fixture(t, 'work', {}, { retargetInterval: 2 });
  const slow = chain(f.g, 5, { seconds: 240, who: miner }), fast = chain(f.g, 4, { seconds: 1, who: bob });
  assert(BigInt(fast.state.chainWork) > BigInt(slow.state.chainWork));
  await f.node.ingestSegment({ ancestorHash: f.g.hash, blocks: slow.blocks });
  const result = await f.node.ingestSegment({ ancestorHash: f.g.hash, blocks: fast.blocks });
  assert.equal(result.adopted, true); assert.equal(f.node.status().tip.height, '4');
  assert.equal(f.node.status().tip.chainWork, fast.state.chainWork);
});

test('candidate branches survive paginated sync and a long reorganization replays atomically', async t => {
  const f = await fixture(t, 'pages'), a = chain(f.g, 12, { who: miner }), b = chain(f.g, 13, { who: bob });
  await f.node.ingestSegment({ ancestorHash: f.g.hash, blocks: a.blocks.slice(0, 8) });
  await f.node.ingestSegment({ ancestorHash: a.blocks[7].digest, blocks: a.blocks.slice(8) });
  const first = await f.node.ingestSegment({ ancestorHash: f.g.hash, blocks: b.blocks.slice(0, 8) });
  assert.equal(first.adopted, false); assert.equal(f.node.status().bestCandidate.hash, b.blocks[7].digest);
  assert.equal(f.node.locate({ locators: [b.blocks[7].digest, f.g.hash] }).height, '0');
  await f.node.ingestSegment({ ancestorHash: b.blocks[7].digest, blocks: b.blocks.slice(8) });
  assert.equal(f.node.status().tip.hash, b.state.tipHash);
  await f.node.close(); const restored = await f.open(); assert.equal(restored.status().tip.hash, b.state.tipHash);
  assert.equal(restored.getSegment({ from: '9' }).blocks.length, 5);
});

test('invalid batch leaves canonical state, mempool and journal unchanged', async t => {
  const f = await fixture(t, 'invalid'), remote = chain(f.g, 2), before = f.node.status().tip, bytes = await fs.readFile(f.file);
  const corrupted = clone(remote.blocks[1]); corrupted.digest = 'f'.repeat(64);
  await assert.rejects(f.node.ingestSegment({ ancestorHash: f.g.hash, blocks: [remote.blocks[0], corrupted] }), { code: 'DVC_BLOCK_INVALID' });
  assert.deepEqual(f.node.status().tip, before); assert.equal(f.node.getMempool().total, 0);
  assert.deepEqual(await fs.readFile(f.file), bytes); assert.equal(f.node.status().bestCandidate, null);
});

test('restart truncates an incomplete final line and reports recovered bytes', async t => {
  const f = await fixture(t, 'partial'); await f.node.submitBlock(solve(f.node.createJob({ miner })));
  const expected = f.node.status().tip; await f.node.close(); const intact = await fs.readFile(f.file);
  await fs.appendFile(f.file, Buffer.from('{"format":"torn'));
  const restored = await f.open(); assert.deepEqual(restored.status().tip, expected);
  assert.equal(restored.status().storage.recoveredPartialBytes, 15);
  assert.deepEqual(await fs.readFile(f.file), intact);
});

test('restart drops complete staged blocks without a commit but rejects every malformed complete line', async t => {
  const f = await fixture(t, 'staged'); await f.node.submitBlock(solve(f.node.createJob({ miner })));
  const expected = f.node.status().tip;
  await f.node.submitBlock(solve(f.node.createJob({ miner }))); await f.node.close();
  const full = await fs.readFile(f.file, 'utf8'), lines = full.trimEnd().split('\n');
  assert.equal(JSON.parse(lines.at(-1)).kind, 'commit');
  await fs.writeFile(f.file, lines.slice(0, -1).join('\n') + '\n');
  const restored = await f.open(); assert.deepEqual(restored.status().tip, expected);
  assert.equal(restored.status().storage.recoveredIncompleteTransactions, 1); await restored.close();
  await fs.appendFile(f.file, '{"duplicate":1,"duplicate":2}\n'); const corrupt = await fs.readFile(f.file);
  await assert.rejects(f.open(), { code: 'DVC_STORAGE' }); assert.deepEqual(await fs.readFile(f.file), corrupt);
});

test('journal replay rejects a forged complete valid-JSON block instead of trusting stored state', async t => {
  const f = await fixture(t, 'corrupt'); await f.node.submitBlock(solve(f.node.createJob({ miner }))); await f.node.close();
  const records = (await fs.readFile(f.file, 'utf8')).trimEnd().split('\n').map(JSON.parse);
  records.find(row => row.kind === 'blocks').blocks[0].miner = bob;
  await fs.writeFile(f.file, records.map(JSON.stringify).join('\n') + '\n');
  await assert.rejects(f.open(), { code: 'DVC_STORAGE' });
});

test('partial write and fsync failures never publish new balances and force read-only recovery', async t => {
  for (const mode of ['partial', 'sync']) {
    let armed = false, partialWritten = false;
    const io = { ...fs, open: async (...args) => {
      const handle = await fs.open(...args);
      return new Proxy(handle, { get(target, key) {
        if (key === 'write') return async (buffer, offset, length, position) => {
          if (armed && mode === 'partial') {
            if (!partialWritten) { partialWritten = true; return target.write(buffer, offset, Math.min(7, length), position); }
            throw Error('injected disk failure');
          }
          return target.write(buffer, offset, length, position);
        };
        if (key === 'sync') return async () => { if (armed && mode === 'sync') { armed = false; throw Error('injected sync failure'); } return target.sync(); };
        const value = target[key]; return typeof value === 'function' ? value.bind(target) : value;
      } });
    } };
    const f = await fixture(t, 'write-' + mode, { io }), before = await fs.readFile(f.file); armed = true;
    await assert.rejects(f.node.submitTransfer(transfer(f.g)), { code: 'DVC_STORAGE' });
    assert.equal(f.node.status().healthy, false); assert.equal(f.node.account(alice).pendingOutAtoms, '0');
    assert.equal(f.node.getMempool().total, 0); assert.deepEqual(await fs.readFile(f.file), before);
    await assert.rejects(f.node.submitTransfer(transfer(f.g)), { code: 'DVC_STORAGE' });
    await f.node.close(); armed = false;
    const restored = await f.open({ io: fs }); assert.equal(restored.status().healthy, true); assert.equal(restored.getMempool().total, 0);
  }
});

test('mempool, side branches, protocol pages and queue limits fail explicitly', async t => {
  const f = await fixture(t, 'limits', { maxMempool: 2, maxBranches: 1, maxSideBlocks: 3, maxQueuedMutations: 1 });
  const pending = f.node.submitTransfer(transfer(f.g));
  await assert.rejects(f.node.submitTransfer(transfer(f.g, { nonce: '1' })), { code: 'DVC_CAPACITY' }); await pending; await f.node.idle();
  await f.node.submitTransfer(transfer(f.g, { nonce: '1' }));
  await assert.rejects(f.node.submitTransfer(transfer(f.g, { nonce: '2' })), { code: 'DVC_CAPACITY' });
  assert.throws(() => f.node.getSegment({ from: '0' }), { code: 'DVC_INVALID' });
  assert.throws(() => f.node.getSegment({ limit: 9 }), { code: 'DVC_INVALID' });
  assert.throws(() => f.node.locate({ locators: Array(65).fill(f.g.hash) }), { code: 'DVC_INVALID' });
  assert.throws(() => f.node.getMempool({ limit: 257 }), { code: 'DVC_INVALID' });
  const current = chain(f.g, 3, { who: miner }); await f.node.ingestSegment({ ancestorHash: f.g.hash, blocks: current.blocks });
  const side = chain(f.g, 2, { who: bob }); await f.node.ingestSegment({ ancestorHash: f.g.hash, blocks: side.blocks });
  const other = chain(f.g, 2, { who: alice });
  await assert.rejects(f.node.ingestSegment({ ancestorHash: f.g.hash, blocks: other.blocks }), { code: 'DVC_CAPACITY' });
  assert.equal(f.node.status().tip.hash, current.state.tipHash);
});

test('ordinary growth and restart validate and index only linear new work', async t => {
  const f = await fixture(t, 'linear'), count = 24;
  for (let i = 0; i < count; i++) {
    await f.node.submitTransfer(transfer(f.g, { nonce: String(i) }));
    await f.node.submitBlock(solve(f.node.createJob({ miner })));
  }
  const live = f.node.status().metrics;
  assert(live.blockValidationCalls <= count * 2, 'growth revalidated old blocks');
  assert(live.indexedTransfers <= count * 2, 'growth reindexed old transfers');
  assert.equal(live.prefixReplayBlocks, 0);
  await f.node.close(); const restored = await f.open(), replayed = restored.status().metrics;
  assert.equal(restored.account(bob).availableAtoms, String(count * 2000));
  assert(replayed.blockValidationCalls <= count * 2, 'restart performed quadratic prefix replay');
  assert(replayed.indexedTransfers <= count * 2, 'restart performed quadratic transfer indexing');
  assert.equal(replayed.prefixReplayBlocks, 0);
});
