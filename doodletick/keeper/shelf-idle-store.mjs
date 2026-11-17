// SPDX-License-Identifier: GPL-3.0-only
import { readFile, mkdir, open, rename, unlink, lstat } from 'node:fs/promises';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { ShelfIdleGame } from './shelf-idle-engine.mjs';

const FORMAT = 'shelfdefense-keeper/v1';
const MAX_RECEIPTS = 256, MAX_FILE_BYTES = 150000;
const requestIdPattern = /^[a-zA-Z0-9_-]{16,80}$/;
const fields = { tap: ['count'], buy: ['worker', 'shelf', 'quantity'], upgrade: ['upgrade'], unlock: ['shelf'], prestige: ['confirm'], claim: [] };
const failure = (message, status = 400, code = 'SHELF_INVALID') => Object.assign(new Error(message), { status, code });
const unavailable = () => failure('Shelf Defense Idle storage is unavailable. Its saved file has been preserved; restore the game from a Keeper backup before trying again.', 503, 'SHELF_STORAGE');
const plain = value => value && typeof value === 'object' && !Array.isArray(value);
const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const copy = value => JSON.parse(JSON.stringify(value));

function checkedRequest(value) {
  if (!plain(value) || typeof value.action !== 'string' || !Object.hasOwn(fields, value.action) || typeof value.requestId !== 'string' || !requestIdPattern.test(value.requestId) || !Number.isSafeInteger(value.expectedRevision) || value.expectedRevision < 0) throw failure('Use a valid Shelf Defense action and request identifier.');
  const names = ['requestId', 'expectedRevision', 'action', ...fields[value.action]];
  if (Object.keys(value).sort().join('|') !== names.sort().join('|')) throw failure('The action contains missing or unexpected fields.');
  const normalized = { requestId: value.requestId, expectedRevision: value.expectedRevision, action: value.action };
  for (const field of fields[value.action]) normalized[field] = value[field];
  if (value.action === 'prestige' && value.confirm !== true) throw failure('Confirm the new chapter before resetting this run.');
  return normalized;
}

async function checkFile(file, optional = true) {
  try {
    const entry = await lstat(file);
    if (!entry.isFile() || entry.isSymbolicLink() || entry.size > MAX_FILE_BYTES) throw unavailable();
  } catch (error) { if (!optional || error.code !== 'ENOENT') throw error; }
}

async function flushDataDirectory(directory) {
  // Home Assistant deploys on Linux. Windows does not support opening a
  // directory this way, but still flushes the file contents before rename.
  if (process.platform === 'win32') return;
  const handle = await open(directory, 'r');
  try { await handle.sync(); } finally { await handle.close(); }
}

async function atomicWrite(file, value, syncDirectory) {
  await checkFile(file);
  const temp = path.join(path.dirname(file), `shelf-idle.${randomUUID()}.tmp`);
  let handle;
  try {
    handle = await open(temp, 'wx', 0o600);
    await handle.writeFile(JSON.stringify(value) + '\n', 'utf8');
    await handle.sync();
    await handle.close(); handle = null;
    await checkFile(file);
    await rename(temp, file);
    // Acknowledgment includes the replacement name and its replay receipts,
    // not just the temporary file's bytes, surviving a sudden Linux shutdown.
    await syncDirectory(path.dirname(file));
  } finally {
    await handle?.close().catch(() => {});
    await unlink(temp).catch(error => { if (error.code !== 'ENOENT') throw error; });
  }
}

function validateEnvelope(value, now) {
  if (!plain(value) || value.format !== FORMAT || !plain(value.game) || !Number.isSafeInteger(value.revision) || value.revision < 0 || !Array.isArray(value.receipts) || value.receipts.length > MAX_RECEIPTS) throw unavailable();
  const game = new ShelfIdleGame(value.game, now);
  const ids = new Set();
  for (const receipt of value.receipts) {
    if (!plain(receipt) || typeof receipt.id !== 'string' || !requestIdPattern.test(receipt.id) || ids.has(receipt.id) || !/^[a-f0-9]{64}$/.test(receipt.hash || '') || !Number.isSafeInteger(receipt.revision) || receipt.revision < 1 || receipt.revision > value.revision) throw unavailable();
    ids.add(receipt.id);
  }
  return { state: { format: FORMAT, revision: value.revision, game: game.to_dict(now), receipts: copy(value.receipts) }, offlineEarned: game.offline_earned };
}

/** One fictional household game. The enclosing Keeper owns access control. */
export async function createShelfIdleStore({ dataDir, now = Date.now, checkpointMs = 300000, syncDirectory = flushDataDirectory } = {}) {
  if (typeof dataDir !== 'string' || typeof now !== 'function' || typeof syncDirectory !== 'function' || !Number.isSafeInteger(checkpointMs) || checkpointMs < 0 || checkpointMs > 3600000) throw Error('Invalid Shelf Defense store options.');
  const file = path.join(dataDir, 'shelf-idle.json');
  let state, error = null, queue = Promise.resolve(), closed = false, timer = null, offlineEarned = 0;
  const seconds = () => { const time = now(); if (!Number.isFinite(time) || time < 0 || time > 1e18) throw failure('The Keeper clock is unavailable.', 503, 'SHELF_CLOCK'); return time / 1000; };
  const serialize = fn => { const job = queue.then(fn); queue = job.catch(() => {}); return job; };
  const assertAvailable = () => { if (error) throw unavailable(); if (closed) throw failure('Shelf Defense Idle is closing. Try again shortly.', 503, 'SHELF_CLOSED'); };
  function snapshot(time = seconds()) {
    assertAvailable();
    const game = new ShelfIdleGame(state.game, time);
    game.offline_earned = offlineEarned;
    return { available: true, revision: state.revision, game: game.snapshot(time) };
  }
  async function commit(candidate) {
    try { await atomicWrite(file, candidate, syncDirectory); }
    catch { error = unavailable(); throw error; }
    state = candidate;
  }
  async function checkpoint() {
    assertAvailable();
    const time = seconds();
    const game = new ShelfIdleGame(state.game, time);
    // Keep advancing the saved high-water clock even when production is zero.
    if (game.last_update !== state.game.last_update) await commit({ ...state, game: game.to_dict(time) });
  }
  try {
    await mkdir(dataDir, { recursive: true });
    const directory = await lstat(dataDir);
    if (!directory.isDirectory() || directory.isSymbolicLink()) throw unavailable();
    await checkFile(file);
    const time = seconds();
    let raw;
    try { raw = await readFile(file, 'utf8'); } catch (caught) { if (caught.code !== 'ENOENT') throw caught; }
    if (raw !== undefined) {
      const loaded = validateEnvelope(JSON.parse(raw), time); state = loaded.state; offlineEarned = loaded.offlineEarned;
    } else state = { format: FORMAT, revision: 0, game: new ShelfIdleGame(null, time).to_dict(time), receipts: [] };
    // Persist capped stopped-time catch-up once before exposing the game.
    await atomicWrite(file, state, syncDirectory);
  } catch { error = unavailable(); }
  if (!error && checkpointMs) {
    timer = setInterval(() => { void serialize(checkpoint).catch(() => {}); }, checkpointMs);
    timer.unref?.();
  }
  return {
    status() { return serialize(() => snapshot()); },
    action(request) {
      return serialize(async () => {
        assertAvailable();
        const checked = checkedRequest(request), hash = digest(checked);
        const old = state.receipts.find(receipt => receipt.id === checked.requestId);
        if (old) {
          if (old.hash !== hash) throw failure('This request identifier was already used for a different action.', 409, 'SHELF_CONFLICT');
          return { ...snapshot(), replayed: true, committedRevision: old.revision };
        }
        if (checked.expectedRevision !== state.revision) throw failure('The shared shelf changed on another page. Refresh it before trying again.', 409, 'SHELF_CONFLICT');
        if (state.revision === Number.MAX_SAFE_INTEGER) throw failure('The game revision limit has been reached.', 503, 'SHELF_CAPACITY');
        const time = seconds(), game = new ShelfIdleGame(state.game, time);
        try {
          if (checked.action === 'tap') game.tap(checked.count, time);
          else if (checked.action === 'buy') game.buy(checked.worker, checked.shelf, checked.quantity, time);
          else if (checked.action === 'upgrade') game.upgrade(checked.upgrade, time);
          else if (checked.action === 'unlock') game.unlock(checked.shelf, time);
          else if (checked.action === 'prestige') game.prestige(time);
          else game.advance(time);
        } catch (caught) { throw failure(caught.message || 'That action is unavailable.'); }
        const revision = state.revision + 1;
        const receipts = [...state.receipts, { id: checked.requestId, hash, revision }].slice(-MAX_RECEIPTS);
        await commit({ format: FORMAT, revision, game: game.to_dict(time), receipts });
        return { ...snapshot(time), replayed: false, committedRevision: revision };
      });
    },
    checkpoint() { return serialize(checkpoint); },
    async idle() { await queue; },
    async close() {
      clearInterval(timer); timer = null;
      await serialize(async () => { if (closed) return; try { if (!error) await checkpoint(); } finally { closed = true; } });
    },
  };
}
