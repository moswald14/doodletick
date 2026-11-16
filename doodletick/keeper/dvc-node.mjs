// SPDX-License-Identifier: GPL-3.0-only
// Independently replayed native-DVC state. The embedding Keeper owns the
// exclusive process/data-directory lock. No keys or unrelated Keeper files are read.
import * as filesystem from 'node:fs/promises';
import path from 'node:path';
import {
  genesis as defaultGenesis, validateGenesis, validateChain, validateBlock,
  verifyTransfer, validatePendingTransfers, accountView, createMiningJob,
  finalizeBlock, blockSubsidy, chainWork, hashCanonical, canonical, parseStrictJSON,
  MAX_BLOCK_BYTES,
} from './public/dvc-core.mjs';

const FORMAT = 'doodleverse-node-journal-v1', HASH = /^[0-9a-f]{64}$/;
const DECIMAL = /^(0|[1-9][0-9]{0,15})$/, MAX_SEGMENT = 8;
const MAX_LINE = MAX_SEGMENT * MAX_BLOCK_BYTES + 4096, MAX_SEGMENT_BODY = 512 * 1024 - 4096;
const activeDirectories = new Set();
const fail = (code, message) => Object.assign(new Error(message), { code });
function uint(value, max = Number.MAX_SAFE_INTEGER) {
  if (typeof value !== 'string' || !DECIMAL.test(value) || BigInt(value) > BigInt(max)) throw fail('DVC_INVALID', 'Invalid canonical integer.');
  return Number(value);
}
function exact(value, names) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).sort().join(',') !== [...names].sort().join(',')) throw fail('DVC_INVALID', 'Unexpected protocol fields.');
  return value;
}
function copy(value, maxBytes = MAX_LINE) {
  try {
    const text = canonical(value);
    if (Buffer.byteLength(text) > maxBytes) throw Error('size');
    return parseStrictJSON(text, { maxBytes });
  } catch { throw fail('DVC_INVALID', 'Invalid or oversized public protocol data.'); }
}
function digest(value) { if (typeof value !== 'string' || !HASH.test(value)) throw fail('DVC_INVALID', 'Invalid block hash.'); return value; }
function bound(value, fallback, max) { const result = value ?? fallback; if (!Number.isSafeInteger(result) || result < 1 || result > max) throw Error('Invalid DVC node capacity.'); return result; }

export async function createDvcNode({
  dataDir, genesis: suppliedGenesis = defaultGenesis(), now = Date.now, io = filesystem,
  maxMempool = 64, maxBranches = 8, maxSideBlocks = 256,
  maxBlocks = 1000000, maxJournalBytes = 512 * 1024 * 1024,
  maxQueuedMutations = 64, historyScanBlocks = 4096,
} = {}) {
  if (typeof dataDir !== 'string' || !dataDir) throw Error('A DVC data directory is required.');
  const g = validateGenesis(suppliedGenesis), directory = path.resolve(dataDir);
  const directoryKey = process.platform === 'win32' ? directory.toLowerCase() : directory;
  const limits = Object.freeze({
    maxMempool: bound(maxMempool, 64, g.rules.maxTransactions), maxBranches: bound(maxBranches, 8, 64),
    maxSideBlocks: bound(maxSideBlocks, 256, 16384), maxBlocks: bound(maxBlocks, 1000000, 1000000),
    maxJournalBytes: bound(maxJournalBytes, 512 * 1024 * 1024, 2 ** 40),
    maxQueuedMutations: bound(maxQueuedMutations, 64, 1024), historyScanBlocks: bound(historyScanBlocks, 4096, 100000),
    maxSegmentBlocks: MAX_SEGMENT, maxSegmentBodyBytes: MAX_SEGMENT_BODY, maxBlockBytes: MAX_BLOCK_BYTES,
  });
  if (activeDirectories.has(directoryKey)) throw fail('DVC_CONFLICT', 'This DVC directory is already open in this process.');
  activeDirectories.add(directoryKey);
  const file = path.join(directory, 'dvc-chain.jsonl');
  let handle, state, blocks = [], mempool = [], projection, confirmed = new Map(), branches = new Map();
  let canonicalHeights = new Map([[g.hash, 0]]);
  let sequence = 0, journalBytes = 0, journalRecords = 0, queue = Promise.resolve(), queued = 0;
  let closing = false, closed = false, closePromise, storageFault = false;
  const recovery = { partialBytes: 0, incompleteTransactions: 0 };
  const metrics = { acceptedBlocks: 0, acceptedTransfers: 0, reorganizations: 0, rejectedBlocks: 0, rejectedTransfers: 0, rejectedSegments: 0, replayedMutations: 0, blockValidationCalls: 0, prefixReplayBlocks: 0, indexedTransfers: 0 };
  function time() { const value = now(); if (!Number.isSafeInteger(value) || value < 0) throw fail('DVC_CLOSED', 'The node clock is unavailable.'); return value; }
  const tip = value => ({ height: value.height, hash: value.tipHash, chainWork: value.chainWork, timestamp: value.timestamp, baseTarget: value.history.at(-1).baseTarget });
  function prepared(base, values) {
    let checked;
    try { checked = validatePendingTransfers(values, base); } catch { throw fail('DVC_TRANSFER_INVALID', 'Pending transfers failed validation.'); }
    // Maturity in the next block can be valid consensus, but admission reserves
    // only funds that are already spendable at the current visible tip.
    for (const [sender, amount] of Object.entries(checked.reservedAtoms)) {
      if (BigInt(amount) > BigInt(accountView(base, sender).spendableAtoms)) throw fail('DVC_BALANCE', 'Pending transfers exceed currently spendable funds.');
    }
    return checked;
  }
  function reconcile(base, candidates) {
    const accepted = [], seen = new Set();
    // A reorganization can put nonce 0 back before an already-pending nonce 1.
    // Stable nonce ordering retains the existing pool's priority for conflicts.
    const ordered = [...candidates].sort((a, b) => BigInt(a.nonce) < BigInt(b.nonce) ? -1 : BigInt(a.nonce) > BigInt(b.nonce) ? 1 : 0);
    for (const transfer of ordered) {
      if (accepted.length >= limits.maxMempool) break;
      try {
        const result = verifyTransfer(transfer, { genesis: g, height: (BigInt(base.height) + 1n).toString() });
        if (seen.has(result.id)) continue;
        prepared(base, [...accepted, transfer]); accepted.push(transfer); seen.add(result.id);
      } catch { /* Orphaned, expired, overspent and nonce-gapped transfers are not reserved. */ }
    }
    return { mempool: accepted, projection: prepared(base, accepted) };
  }
  function confirmationPlan(list, ancestorHeight, suffixOnly = false) {
    const extending = ancestorHeight === blocks.length, previous = extending ? confirmed : null, added = new Map();
    for (let i = extending && !suffixOnly ? blocks.length : 0; i < list.length; i++) for (const transfer of list[i].transactions) {
      const id = hashCanonical(transfer); metrics.indexedTransfers++;
      added.set(id, { height: list[i].height, blockHash: list[i].digest });
    }
    return {
      has: id => added.has(id) || previous?.has(id),
      commit() {
        if (!previous) return added;
        // No old-chain copying or rehashing for an extension. These insertions
        // happen only after fsync (or a fully validated replay commit).
        for (const [id, entry] of added) previous.set(id, entry);
        return previous;
      },
    };
  }
  function canonicalAncestor(hash) {
    return canonicalHeights.get(hash) ?? -1;
  }
  function validated(block, base) { metrics.blockValidationCalls++; return validateBlock(block, base, { now: time() }); }
  function prefixState(list) {
    let next = validateChain([], { genesis: g, now: time() }); metrics.prefixReplayBlocks += list.length;
    for (const block of list) next = validated(block, next);
    return next;
  }
  function commonLength(a, b) {
    // Both paths are validated hash-linked chains: equal headers imply equal
    // ancestry. Locate their fork without rescanning the whole shared history.
    let low = 0, high = Math.min(a.length, b.length);
    while (low < high) { const middle = Math.ceil((low + high) / 2); if (a[middle - 1].digest === b[middle - 1].digest) low = middle; else high = middle - 1; }
    return low;
  }
  function candidateInfo() {
    let best = null;
    for (const candidate of branches.values()) if (!best || chainWork(candidate.state) > chainWork(best.state)) best = candidate;
    return best ? { ...tip(best.state), divergentBlocks: best.blocks.length - commonLength(blocks, best.blocks) } : null;
  }
  function cacheCandidate(nextBlocks, nextState) {
    if (nextState.tipHash === state.tipHash || canonicalAncestor(nextState.tipHash) >= 0) return;
    const next = new Map(branches);
    // A longer validated branch supersedes its own cached prefix.
    for (const [hash, candidate] of next) if (nextBlocks.some(block => block.digest === hash) && commonLength(candidate.blocks, nextBlocks) === candidate.blocks.length) next.delete(hash);
    next.set(nextState.tipHash, { blocks: nextBlocks, state: nextState });
    let divergent = 0;
    for (const candidate of next.values()) divergent += candidate.blocks.length - commonLength(blocks, candidate.blocks);
    if (next.size > limits.maxBranches || divergent > limits.maxSideBlocks) throw fail('DVC_CAPACITY', 'Validated side-branch cache is full.');
    branches = next;
  }
  function trimBranches() {
    for (const [hash] of branches) if (canonicalAncestor(hash) >= 0) branches.delete(hash);
    const ordered = [...branches.entries()].sort((a, b) => chainWork(a[1].state) > chainWork(b[1].state) ? -1 : 1);
    const kept = new Map(); let count = 0;
    for (const [hash, candidate] of ordered) {
      const size = candidate.blocks.length - commonLength(blocks, candidate.blocks);
      if (kept.size < limits.maxBranches && count + size <= limits.maxSideBlocks) { kept.set(hash, candidate); count += size; }
    }
    branches = kept;
  }
  function publishChain(nextBlocks, nextState, suffixOnly) {
    if (suffixOnly) {
      for (const block of nextBlocks) { blocks.push(block); canonicalHeights.set(block.digest, blocks.length); }
    } else {
      blocks = nextBlocks;
      canonicalHeights = new Map([[g.hash, 0], ...blocks.map((block, index) => [block.digest, index + 1])]);
    }
    state = nextState;
  }
  function applyAdoption(nextBlocks, nextState, ancestorHeight, suffixOnly = false) {
    const orphaned = blocks.slice(ancestorHeight).flatMap(block => block.transactions);
    const nextConfirmed = confirmationPlan(nextBlocks, ancestorHeight, suffixOnly);
    const candidates = [...mempool, ...orphaned].filter(transfer => !nextConfirmed.has(hashCanonical(transfer)));
    const reconciled = reconcile(nextState, candidates);
    const reorg = ancestorHeight < blocks.length;
    confirmed = nextConfirmed.commit(); publishChain(nextBlocks, nextState, suffixOnly);
    mempool = reconciled.mempool; projection = reconciled.projection;
    trimBranches(); return reorg;
  }
  function record(kind, fields = {}) { return { format: FORMAT, kind, ...fields }; }
  async function append(records) {
    if (storageFault) throw fail('DVC_STORAGE', 'DVC storage needs recovery before another mutation.');
    const chunks = records.map(item => {
      const text = canonical(item);
      if (Buffer.byteLength(text) > MAX_LINE) throw fail('DVC_CAPACITY', 'Journal record exceeds its bound.');
      return Buffer.from(text + '\n');
    });
    const size = chunks.reduce((sum, chunk) => sum + chunk.length, 0), previous = journalBytes;
    if (previous + size > limits.maxJournalBytes) throw fail('DVC_CAPACITY', 'DVC journal capacity reached.');
    try {
      let cursor = previous;
      for (const chunk of chunks) {
        let offset = 0;
        while (offset < chunk.length) {
          const result = await handle.write(chunk, offset, chunk.length - offset, cursor + offset);
          if (!Number.isSafeInteger(result.bytesWritten) || result.bytesWritten < 1) throw Error('Short journal write.');
          offset += result.bytesWritten;
        }
        cursor += chunk.length;
      }
      await handle.sync();
    } catch {
      storageFault = true;
      try { await handle.truncate(previous); await handle.sync(); } catch { /* Fail closed until restart; never publish uncertain state. */ }
      throw fail('DVC_STORAGE', 'DVC journal write failed; current in-memory state was retained.');
    }
    journalBytes += size; journalRecords += records.length;
  }
  async function replay() {
    state = prefixState([]); projection = prepared(state, []);
    const stat = await handle.stat();
    if (!stat.isFile() || stat.size > limits.maxJournalBytes) throw fail('DVC_STORAGE', 'DVC journal is not a supported regular file.');
    let position = 0, pending = Buffer.alloc(0), consumed = 0, stage = null, sawGenesis = false;
    let committedEnd = 0, committedRecords = 0;
    const consume = (bytes, end) => {
      let entry;
      try { entry = parseStrictJSON(new TextDecoder('utf-8', { fatal: true }).decode(bytes), { maxBytes: MAX_LINE }); }
      catch { throw fail('DVC_STORAGE', 'A complete DVC journal line is malformed.'); }
      if (!entry || entry.format !== FORMAT) throw fail('DVC_STORAGE', 'DVC journal format does not match.');
      if (!sawGenesis) {
        exact(entry, ['format', 'kind', 'genesis']);
        if (entry.kind !== 'genesis' || canonical(validateGenesis(entry.genesis)) !== canonical(g)) throw fail('DVC_STORAGE', 'DVC journal genesis does not match.');
        sawGenesis = true; committedEnd = end; committedRecords = 1; return;
      }
      if (entry.kind === 'begin') {
        exact(entry, ['format', 'kind', 'sequence', 'ancestorHash', 'blockCount', 'tipHash']);
        if (stage || uint(entry.sequence) !== sequence + 1) throw fail('DVC_STORAGE', 'DVC journal transaction sequence is invalid.');
        const ancestorHeight = canonicalAncestor(digest(entry.ancestorHash)), count = uint(entry.blockCount, limits.maxBlocks);
        if (ancestorHeight < 0 || !count || ancestorHeight + count > limits.maxBlocks) throw fail('DVC_STORAGE', 'DVC journal ancestor or size is invalid.');
        const extending = ancestorHeight === blocks.length, base = extending ? null : blocks.slice(0, ancestorHeight);
        stage = { sequence: entry.sequence, ancestorHeight, count, tipHash: digest(entry.tipHash), prefix: base, additions: [], state: extending ? state : prefixState(base), records: 1 };
      } else if (entry.kind === 'blocks') {
        exact(entry, ['format', 'kind', 'sequence', 'blocks']);
        if (!stage || entry.sequence !== stage.sequence || !Array.isArray(entry.blocks) || !entry.blocks.length || entry.blocks.length > MAX_SEGMENT) throw fail('DVC_STORAGE', 'DVC journal block batch is invalid.');
        for (const block of entry.blocks) {
          if (stage.additions.length >= stage.count) throw fail('DVC_STORAGE', 'DVC journal block count is invalid.');
          stage.state = validated(block, stage.state); stage.additions.push(copy(block, MAX_BLOCK_BYTES));
        }
        stage.records++;
      } else if (entry.kind === 'commit') {
        exact(entry, ['format', 'kind', 'sequence']);
        if (!stage || entry.sequence !== stage.sequence || stage.additions.length !== stage.count || stage.state.tipHash !== stage.tipHash || chainWork(stage.state) <= chainWork(state)) throw fail('DVC_STORAGE', 'DVC journal commit is invalid.');
        applyAdoption(stage.prefix ? [...stage.prefix, ...stage.additions] : stage.additions, stage.state, stage.ancestorHeight, stage.prefix === null); sequence++; metrics.replayedMutations++;
        committedRecords += stage.records + 1; committedEnd = end; stage = null;
      } else if (entry.kind === 'transfer') {
        exact(entry, ['format', 'kind', 'sequence', 'transfer']);
        if (stage || uint(entry.sequence) !== sequence + 1 || mempool.length >= limits.maxMempool) throw fail('DVC_STORAGE', 'DVC journal transfer sequence is invalid.');
        const transfer = copy(entry.transfer, 2048), next = prepared(state, [...mempool, transfer]);
        mempool.push(transfer); projection = next; sequence++; metrics.replayedMutations++;
        committedRecords++; committedEnd = end;
      } else throw fail('DVC_STORAGE', 'Unknown DVC journal record.');
    };
    while (position < stat.size) {
      const buffer = Buffer.alloc(Math.min(65536, stat.size - position));
      const { bytesRead } = await handle.read(buffer, 0, buffer.length, position);
      if (!bytesRead) throw fail('DVC_STORAGE', 'DVC journal changed during replay.');
      position += bytesRead; pending = Buffer.concat([pending, buffer.subarray(0, bytesRead)]);
      let newline;
      while ((newline = pending.indexOf(10)) >= 0) {
        if (newline > MAX_LINE) throw fail('DVC_STORAGE', 'DVC journal line exceeds its bound.');
        const line = pending.subarray(0, newline); consumed += newline + 1;
        try { consume(line, consumed); } catch { throw fail('DVC_STORAGE', 'DVC journal failed strict replay validation.'); }
        pending = pending.subarray(newline + 1);
      }
      if (pending.length > MAX_LINE) throw fail('DVC_STORAGE', 'DVC journal line exceeds its bound.');
    }
    if (pending.length || stage) {
      recovery.partialBytes = stat.size - committedEnd; recovery.incompleteTransactions = stage ? 1 : 0;
      await handle.truncate(committedEnd); await handle.sync();
    }
    journalBytes = committedEnd; journalRecords = committedRecords;
    if (!sawGenesis) await append([record('genesis', { genesis: g })]);
  }
  try {
    await io.mkdir(directory, { recursive: true });
    try { const stat = await io.lstat(file); if (stat.isSymbolicLink() || !stat.isFile()) throw fail('DVC_STORAGE', 'DVC journal must be a regular file.'); }
    catch (error) { if (error?.code !== 'ENOENT') throw error; }
    // Explicit append offsets plus the caller's exclusive process lock allow
    // rollback/truncation on Windows, where append-only handles cannot truncate.
    try { handle = await io.open(file, 'r+'); }
    catch (error) { if (error?.code !== 'ENOENT') throw error; handle = await io.open(file, 'wx+', 0o600); }
    await replay();
  } catch (error) {
    await handle?.close().catch(() => {}); activeDirectories.delete(directoryKey);
    if (error?.code?.startsWith('DVC_')) throw error;
    throw fail('DVC_STORAGE', 'DVC storage could not be opened or replayed.');
  }
  function mutate(fn) {
    if (closing || closed) return Promise.reject(fail('DVC_CLOSED', 'The DVC node is closing.'));
    if (storageFault) return Promise.reject(fail('DVC_STORAGE', 'DVC storage needs recovery.'));
    if (queued >= limits.maxQueuedMutations) return Promise.reject(fail('DVC_CAPACITY', 'DVC mutation queue is full.'));
    queued++;
    const result = queue.then(() => { if (storageFault) throw fail('DVC_STORAGE', 'DVC storage needs recovery.'); return fn(); }).finally(() => { queued--; });
    queue = result.catch(() => {}); return result;
  }
  function status() {
    return copy({ networkId: g.networkId, genesis: g, tip: tip(state),
      supply: { issuedAtoms: state.issuedAtoms, mineableRemainingAtoms: (BigInt(g.miningReserveAtoms) - BigInt(state.minedAtoms)).toString(), maxSupplyAtoms: g.maxSupplyAtoms },
      mempoolSize: mempool.length, peers: { configured: 0, connected: 0 }, bestCandidate: candidateInfo(),
      healthy: !storageFault && !closing && !closed, error: storageFault ? 'DVC_STORAGE' : closing || closed ? 'DVC_CLOSED' : null,
      storage: { journalBytes, journalRecords, recoveredPartialBytes: recovery.partialBytes, recoveredIncompleteTransactions: recovery.incompleteTransactions },
      metrics: { ...metrics, queuedMutations: queued, sideBranches: branches.size }, limits,
    });
  }
  function cumulativeMinedBefore(height) {
    let remaining = BigInt(height) - 1n, reward = BigInt(g.rules.initialRewardAtoms), total = 0n;
    const interval = BigInt(g.rules.halvingInterval), reserve = BigInt(g.miningReserveAtoms);
    while (remaining > 0n && reward > 0n && total < reserve) {
      const count = remaining < interval ? remaining : interval; total += count * reward; remaining -= count; reward >>= 1n;
    }
    return (total > reserve ? reserve : total).toString();
  }
  function recent(address) {
    const summary = transfer => ({ valid: true, id: hashCanonical(transfer), sender: transfer.sender, recipient: transfer.recipient, amountAtoms: transfer.amountAtoms, feeAtoms: transfer.feeAtoms, nonce: transfer.nonce, validUntilHeight: transfer.validUntilHeight });
    const result = [], add = value => { if (result.length < 100) result.push(value); };
    for (const transfer of [...mempool].reverse()) if (transfer.sender === address || transfer.recipient === address) {
      const checked = summary(transfer);
      add({ ...checked, type: 'transfer', status: 'pending', height: null, blockHash: null, confirmations: 0 });
    }
    const oldest = Math.max(0, blocks.length - limits.historyScanBlocks);
    for (let i = blocks.length - 1; i >= oldest && result.length < 100; i--) {
      const block = blocks[i], confirmations = blocks.length - i;
      for (const transfer of [...block.transactions].reverse()) if (transfer.sender === address || transfer.recipient === address) add({ ...summary(transfer), type: 'transfer', status: 'confirmed', height: block.height, blockHash: block.digest, confirmations });
      if (block.miner === address) {
        const fee = block.transactions.reduce((sum, transfer) => sum + BigInt(transfer.feeAtoms), 0n);
        const amount = BigInt(blockSubsidy(block.height, cumulativeMinedBefore(block.height), g)) + fee;
        if (amount) add({ id: block.digest, type: 'coinbase', status: confirmations > g.rules.coinbaseMaturity ? 'confirmed' : 'immature', miner: address, amountAtoms: amount.toString(), height: block.height, blockHash: block.digest, confirmations });
      }
    }
    if (!oldest && address === g.founderAddress) add({ id: g.hash, type: 'founder', status: 'confirmed', recipient: address, amountAtoms: g.founderAtoms, height: '0', blockHash: g.hash, confirmations: blocks.length + 1 });
    return result;
  }
  function account(address) {
    let view; try { view = accountView(state, address); } catch { throw fail('DVC_INVALID', 'Invalid native account address.'); }
    return { networkId: g.networkId, tipHash: state.tipHash, height: state.height, ...view,
      availableAtoms: view.spendableAtoms, pendingOutAtoms: projection.reservedAtoms[view.address] ?? '0',
      nextNonce: projection.accounts[view.address]?.nonce ?? view.nextNonce,
      recentTransactions: recent(view.address), historyLimited: blocks.length > limits.historyScanBlocks,
    };
  }
  function createJob({ miner, algorithm = 'sha256' } = {}) {
    if (closing || closed || storageFault) throw fail(storageFault ? 'DVC_STORAGE' : 'DVC_CLOSED', 'This node cannot accept mining results.');
    try {
      const selected = []; let bytes = 0;
      for (const transfer of mempool) { const size = Buffer.byteLength(canonical(transfer)); if (bytes + size > 50000) break; selected.push(transfer); bytes += size; }
      const job = createMiningJob(state, { miner, algorithm, transactions: selected, now: time() });
      return { networkId: g.networkId, prefixHex: job.prefixHex, targetHex: job.targetHex, algorithm, block: copy(finalizeBlock(job, '0'), MAX_BLOCK_BYTES) };
    } catch (error) { if (error?.code?.startsWith('DVC_')) throw error; throw fail('DVC_INVALID', 'A valid miner, algorithm and current chain clock are required.'); }
  }
  function submitTransfer(value) {
    let transfer; try { transfer = copy(value, 2048); } catch (error) { return Promise.reject(error); }
    return mutate(async () => {
      let checked;
      try { checked = verifyTransfer(transfer, { genesis: g, height: (BigInt(state.height) + 1n).toString() }); }
      catch { metrics.rejectedTransfers++; throw fail('DVC_TRANSFER_INVALID', 'The native transfer signature or fields are invalid.'); }
      if (confirmed.has(checked.id)) return { accepted: false, duplicate: true, status: 'confirmed', id: checked.id, ...confirmed.get(checked.id) };
      if (projection.transfers.some(item => item.id === checked.id)) return { accepted: false, duplicate: true, status: 'pending', id: checked.id };
      if (mempool.length >= limits.maxMempool) throw fail('DVC_CAPACITY', 'The DVC mempool is full.');
      const view = accountView(state, checked.sender), pending = BigInt(projection.reservedAtoms[checked.sender] ?? '0');
      const nonce = projection.accounts[checked.sender]?.nonce ?? view.nextNonce;
      if (checked.nonce !== nonce) { metrics.rejectedTransfers++; throw fail('DVC_NONCE', 'The transfer nonce is stale or has a gap.'); }
      if (pending + BigInt(checked.amountAtoms) + BigInt(checked.feeAtoms) > BigInt(view.spendableAtoms)) { metrics.rejectedTransfers++; throw fail('DVC_BALANCE', 'Pending outgoing transfers exceed confirmed spendable funds.'); }
      const next = prepared(state, [...mempool, transfer]);
      await append([record('transfer', { sequence: String(sequence + 1), transfer })]);
      sequence++; mempool = [...mempool, transfer]; projection = next; metrics.acceptedTransfers++;
      return { accepted: true, duplicate: false, status: 'pending', id: checked.id, nextNonce: next.accounts[checked.sender].nonce };
    });
  }
  async function acceptSegment(ancestorHash, additions) {
    let sourceBlocks, sourceState, ancestorHeight = canonicalAncestor(ancestorHash);
    const extending = ancestorHeight === blocks.length;
    if (extending) { sourceBlocks = null; sourceState = state; }
    else if (ancestorHeight >= 0) { sourceBlocks = blocks.slice(0, ancestorHeight); sourceState = prefixState(sourceBlocks); }
    else {
      for (const candidate of branches.values()) {
        const index = candidate.blocks.findIndex(block => block.digest === ancestorHash);
        if (index >= 0) { sourceBlocks = candidate.blocks.slice(0, index + 1); sourceState = index + 1 === candidate.blocks.length ? candidate.state : prefixState(sourceBlocks); break; }
      }
      if (!sourceState) throw fail('DVC_ANCESTOR', 'The candidate ancestor is not retained.');
    }
    if ((extending ? blocks.length : sourceBlocks.length) + additions.length > limits.maxBlocks) throw fail('DVC_CAPACITY', 'DVC canonical block capacity reached.');
    let nextState = sourceState;
    try { for (const block of additions) nextState = validated(block, nextState); }
    catch { throw fail('DVC_BLOCK_INVALID', 'The candidate segment failed independent validation.'); }
    const nextBlocks = extending ? additions : [...sourceBlocks, ...additions];
    if (chainWork(nextState) <= chainWork(state)) {
      if (additions.length) cacheCandidate(nextBlocks, nextState);
      return { adopted: false, reason: nextState.tipHash === state.tipHash ? 'already-current' : 'not-more-work', candidate: tip(nextState), tip: tip(state) };
    }
    const common = extending ? blocks.length : commonLength(blocks, nextBlocks), suffix = extending ? additions : nextBlocks.slice(common), nextSequence = String(sequence + 1);
    const records = [record('begin', { sequence: nextSequence, ancestorHash: common ? blocks[common - 1].digest : g.hash, blockCount: String(suffix.length), tipHash: nextState.tipHash })];
    for (let i = 0; i < suffix.length; i += MAX_SEGMENT) records.push(record('blocks', { sequence: nextSequence, blocks: suffix.slice(i, i + MAX_SEGMENT) }));
    records.push(record('commit', { sequence: nextSequence }));
    // Precompute all derived state before the durable commit point.
    const oldBlocks = blocks, oldState = state, oldHeight = blocks.length;
    const nextConfirmed = confirmationPlan(nextBlocks, common, extending);
    const orphaned = oldBlocks.slice(common).flatMap(block => block.transactions);
    const candidates = [...mempool, ...orphaned].filter(transfer => !nextConfirmed.has(hashCanonical(transfer)));
    const reconciled = reconcile(nextState, candidates);
    await append(records);
    sequence++; confirmed = nextConfirmed.commit(); publishChain(nextBlocks, nextState, extending); mempool = reconciled.mempool; projection = reconciled.projection;
    const reorg = common < oldHeight;
    metrics.acceptedBlocks += suffix.length; if (reorg) metrics.reorganizations++;
    trimBranches();
    if (reorg) { try { cacheCandidate(oldBlocks, oldState); } catch { /* Canonical adoption is complete; old side history is optional. */ } }
    return { adopted: true, reason: reorg ? 'more-work-reorganization' : 'extended', reorganized: reorg, orphanedBlocks: oldHeight - common, tip: tip(state), mempoolSize: mempool.length };
  }
  function ingestSegment(value) {
    let segment;
    try {
      segment = copy(value); exact(segment, ['ancestorHash', 'blocks']); digest(segment.ancestorHash);
      if (!Array.isArray(segment.blocks) || segment.blocks.length > MAX_SEGMENT) throw fail('DVC_INVALID', 'A segment contains at most eight blocks.');
      segment.blocks = segment.blocks.map(block => copy(block, MAX_BLOCK_BYTES));
    } catch (error) { return Promise.reject(error); }
    return mutate(async () => { try { return await acceptSegment(segment.ancestorHash, segment.blocks); } catch (error) { metrics.rejectedSegments++; throw error; } });
  }
  function submitBlock(value) {
    let block; try { block = copy(value, MAX_BLOCK_BYTES); } catch (error) { return Promise.reject(error); }
    return mutate(async () => {
      try {
        if (typeof block.digest === 'string') {
          const knownHeight = canonicalAncestor(block.digest), old = knownHeight > 0 ? blocks[knownHeight - 1] : null;
          if (old) { if (canonical(old) !== canonical(block)) throw fail('DVC_BLOCK_INVALID', 'A duplicate block was altered.'); return { adopted: false, accepted: true, canonical: true, hash: block.digest, height: block.height, reason: 'already-known', tip: tip(state) }; }
        }
        if (block.parent !== state.tipHash) throw fail('DVC_CONFLICT', 'Mining result no longer extends the current tip.');
        return { ...await acceptSegment(state.tipHash, [block]), accepted: true, canonical: true, hash: block.digest, height: block.height };
      } catch (error) { metrics.rejectedBlocks++; throw error; }
    });
  }
  function getSegment({ from = '1', limit = MAX_SEGMENT } = {}) {
    const start = uint(from, limits.maxBlocks + 1);
    if (start < 1 || !Number.isSafeInteger(limit) || limit < 1 || limit > MAX_SEGMENT || start > blocks.length + 1) throw fail('DVC_INVALID', 'Invalid chain range.');
    const ancestorHash = start === 1 ? g.hash : blocks[start - 2].digest, page = [];
    let bytes = Buffer.byteLength(canonical({ ancestorHash, blocks: [] }));
    for (const block of blocks.slice(start - 1, start - 1 + limit)) {
      const size = Buffer.byteLength(canonical(block)) + 1;
      if (bytes + size > MAX_SEGMENT_BODY) break;
      page.push(block); bytes += size;
    }
    return { networkId: g.networkId, ancestorHash, from, blocks: copy(page), tip: tip(state) };
  }
  function locate({ locators } = {}) {
    if (!Array.isArray(locators) || !locators.length || locators.length > 64) throw fail('DVC_INVALID', 'Provide at most 64 block locators.');
    let height = -1;
    for (const value of locators) height = Math.max(height, canonicalAncestor(digest(value)));
    return height < 0 ? { height: null, hash: null } : { height: String(height), hash: height ? blocks[height - 1].digest : g.hash };
  }
  function locators() {
    const result = [], add = hash => { if (!result.includes(hash) && result.length < 63) result.push(hash); };
    const ordered = [...branches.values()].sort((a, b) => chainWork(a.state) > chainWork(b.state) ? -1 : 1);
    for (const candidate of ordered) add(candidate.state.tipHash);
    let index = blocks.length - 1, step = 1, count = 0;
    while (index >= 0 && result.length < 63) { add(blocks[index].digest); index -= step; if (++count > 8) step *= 2; }
    result.push(g.hash); return { networkId: g.networkId, locators: result };
  }
  function getMempool({ limit = 64 } = {}) {
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 256) throw fail('DVC_INVALID', 'Invalid mempool limit.');
    return { networkId: g.networkId, transactions: copy(mempool.slice(0, limit)), total: mempool.length };
  }
  function close() {
    if (closePromise) return closePromise;
    closing = true;
    closePromise = (async () => { await queue; try { await handle.close(); } finally { closed = true; activeDirectories.delete(directoryKey); } })();
    return closePromise;
  }
  return Object.freeze({ status, account, createJob, submitBlock, submitTransfer, getSegment, locate, locators, ingestSegment, getMempool, idle: () => queue, close });
}
