// A Keeper owns the saved table; closing every browser does not delete it.
import { readFile, open, rename, unlink, mkdir, lstat } from 'node:fs/promises';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { hash, sign, checkSignature } from './public/core.mjs';
import { DOTLANDS_FORMAT, DOTLANDS_PRICE, verifyDotlandsRequest } from './public/dotlands-protocol.mjs';
import './public/dotlands-engine.js';
import authorityModule from './dotlands-authority.cjs';

const engine = globalThis.DotlandsEngine, { HostRoom, validateSnapshot } = authorityModule;
const fail = (message, status = 400) => Object.assign(new Error(message), { status });
const plain = v => v && typeof v === 'object' && !Array.isArray(v);
const ownerId = v => typeof v === 'string' && /^[A-Za-z0-9_-]{43}$/.test(v);
const validCode = v => typeof v === 'string' && /^[A-Z2-9]{6}$/.test(v);
const clone = v => structuredClone(v);
const MAX_BYTES = 12000000, MAX_ROOMS = 200;
const roomDump = authority => Object.fromEntries(['code', 'maxPlayers', 'radius', 'seed', 'revision', 'state', 'members'].map(k => [k, clone(authority[k])]));
function restore(row) {
  const authority = Object.assign(Object.create(HostRoom.prototype), clone(row), { engine });
  if (!validCode(row.code) || !Array.isArray(row.members) || !row.members.length || row.members.some(m => !ownerId(m.peerId) || !/^[a-f0-9]{48}$/.test(m.token)) || new Set(row.members.map(m => m.peerId)).size !== row.members.length || ![3, 4].includes(row.radius) || typeof row.seed !== 'string' || row.seed.length > 64) throw Error('Invalid saved Dotlands authority.');
  validateSnapshot(authority.snapshot(row.members[0]), engine);
  return authority;
}

/** chargeAdmission MUST be durably idempotent by (owner, room). A paid receipt
 * must survive a lost response or a failed room write. Definite non-payment
 * (insufficient funds) uses status 402; unknown failures remain recoverable. */
export async function createDotlandsStore({ dataDir, identity, now = Date.now, chargeAdmission,
  currency = 'Doodle Coins', writeSnapshot, maxRooms = MAX_ROOMS } = {}) {
  if (!ownerId(identity?.fingerprint)) throw Error('A Keeper identity is required for saved rooms.');
  const file = path.join(dataDir, 'dotlands-rooms.json');
  let state = { format: DOTLANDS_FORMAT, issuer: identity.fingerprint, revision: 0, rooms: {} }, unavailable = null;
  let queue = Promise.resolve();
  const signed = async record => ({ record, publicKey: identity.publicKey, signature: await sign(record, identity.privateKey) });
  async function noLink(target) {
    try { if ((await lstat(target)).isSymbolicLink()) throw Error('Saved room storage cannot use a linked path.'); }
    catch (e) { if (e.code !== 'ENOENT') throw e; }
  }
  function checkState(candidate) {
    if (!plain(candidate) || candidate.format !== DOTLANDS_FORMAT || candidate.issuer !== identity.fingerprint || !Number.isSafeInteger(candidate.revision) || candidate.revision < 0 || !plain(candidate.rooms) || Object.keys(candidate.rooms).length > MAX_ROOMS) throw Error('Invalid saved room directory.');
    for (const [code, row] of Object.entries(candidate.rooms)) {
      if (row?.authority?.code !== code || !ownerId(row.createRequest) || !Number.isSafeInteger(row.createdAt) || !Number.isSafeInteger(row.updatedAt) || !Array.isArray(row.admitted) || row.admitted.some(id => !ownerId(id)) || new Set(row.admitted).size !== row.admitted.length) throw Error('Invalid saved room record.');
      const a = restore(row.authority);
      if (row.admitted.some(id => !a.members.some(m => m.peerId === id)) || row.admitted.length > a.members.length) throw Error('Saved room admissions disagree.');
      const reservation = row.reservation;
      if (reservation && (!ownerId(reservation.owner) || typeof reservation.name !== 'string' || reservation.name.length > 22 || !ownerId(reservation.requestId) || !Number.isInteger(reservation.seat) || reservation.seat < 0 || reservation.seat >= a.maxPlayers || row.admitted.includes(reservation.owner))) throw Error('Invalid pending admission.');
      if (a.members.some(m => !row.admitted.includes(m.peerId) && !(m.seat === 0 && reservation?.owner === m.peerId))) throw Error('A saved seat has no admission.');
      if (row.admissionRequests && (!plain(row.admissionRequests) || Object.entries(row.admissionRequests).some(([owner, requestId]) => !row.admitted.includes(owner) || !ownerId(requestId)))) throw Error('Invalid saved admission request.');
      if (row.lastActions && (!plain(row.lastActions) || Object.entries(row.lastActions).some(([owner, action]) => !row.admitted.includes(owner) || !ownerId(action?.requestId) || !Number.isSafeInteger(action.revision) || action.revision < 0 || action.revision > a.revision))) throw Error('Invalid saved action request.');
    }
  }
  try {
    await noLink(dataDir); await noLink(file);
    const stat = await lstat(file); if (stat.size > MAX_BYTES) throw Error('Saved room directory is too large.');
    const envelope = JSON.parse(await readFile(file, 'utf8'));
    if (!await checkSignature(envelope.record, envelope.signature, identity.publicKey)) throw Error('Saved room signature failed.');
    checkState(envelope.record); state = envelope.record;
  } catch (e) { if (e.code !== 'ENOENT') unavailable = 'Saved Dotlands rooms could not be verified. Restore the matching Keeper backup; no saved room has been replaced.'; }
  const ready = () => { if (unavailable) throw fail(unavailable, 503); };
  async function save(next) {
    checkState(next);
    const bytes = JSON.stringify(await signed(next));
    if (Buffer.byteLength(bytes) > MAX_BYTES) throw fail('Saved room storage is full. Back up this Keeper.', 507);
    if (writeSnapshot) await writeSnapshot(bytes);
    else {
      await noLink(dataDir); await mkdir(dataDir, { recursive: true }); await noLink(file); await noLink(file + '.next');
      const handle = await open(file + '.next', 'w', 0o600);
      try { await handle.writeFile(bytes); await handle.sync(); } finally { await handle.close(); }
      try { await rename(file + '.next', file); } catch (e) { await unlink(file + '.next').catch(() => {}); throw e; }
    }
    state = next; // Failed writes never advance the visible board.
  }
  async function commit(next) { next.revision++; await save(next); }
  const reply = (owner, requestId, data) => signed({ format: DOTLANDS_FORMAT, kind: 'response', issuer: identity.fingerprint, owner, requestId, time: now(), data });
  const snapshot = (row, owner, knownRevision) => {
    const a = restore(row.authority), member = a.members.find(m => m.peerId === owner);
    if (!member || !row.admitted.includes(owner)) throw fail('Pay the one-time entry fee to claim this saved seat.', 402);
    if (a.revision === knownRevision) return { unchanged: true, code: a.code, revision: a.revision, seat: member.seat };
    return { ...a.snapshot(member), saved: true, updatedAt: row.updatedAt, price: DOTLANDS_PRICE, currency };
  };
  function summary(row, owner) {
    const a = restore(row.authority), member = a.members.find(m => m.peerId === owner);
    return { code: a.code, phase: a.state ? 'playing' : 'lobby', revision: a.revision, maxPlayers: a.maxPlayers,
      players: a.members.map(({ name, seat }) => ({ name, seat })), hostSeat: 0, seat: member?.seat ?? row.reservation?.seat,
      currentPlayer: a.state?.currentPlayer ?? null, round: a.state?.round ?? null, winner: a.state?.winner ?? null,
      updatedAt: row.updatedAt, createdAt: row.createdAt, paymentPending: !row.admitted.includes(owner) };
  }
  function newCode() {
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    for (let attempt = 0; attempt < 100; attempt++) {
      const code = Array.from(randomBytes(6), v => alphabet[v % alphabet.length]).join('');
      if (!Object.hasOwn(state.rooms, code)) return code;
    }
    throw fail('Could not reserve a room code. Try again.', 503);
  }
  async function finishAdmission(code, proof) {
    const row = state.rooms[code], r = proof.record, reservation = row.reservation;
    if (!reservation || reservation.owner !== r.owner) throw fail('That seat is reserved for another player.', 409);
    if (r.args.acceptPrice !== DOTLANDS_PRICE) throw fail('Confirm the one-token entry price before joining.', 402);
    if (typeof chargeAdmission !== 'function') throw fail('Arcade payments are not available on this Keeper yet.', 503);
    try { await chargeAdmission({ owner: r.owner, room: code, price: DOTLANDS_PRICE, proof }); }
    catch (e) {
      // Only an explicit not-paid result may release a reservation. Unknown
      // failures may have committed the debit and must remain recoverable.
      if (e.status === 402) {
        const next = clone(state);
        if (!next.rooms[code].admitted.length) delete next.rooms[code];
        else next.rooms[code].reservation = null;
        await commit(next);
      }
      throw e;
    }
    const next = clone(state), saved = next.rooms[code], a = restore(saved.authority);
    if (!a.members.some(m => m.peerId === r.owner)) a.invoke(r.owner, 'join', { name: reservation.name });
    saved.authority = roomDump(a); saved.admitted.push(r.owner);
    saved.admissionRequests = { ...saved.admissionRequests, [r.owner]: await hash(r) };
    saved.reservation = null; saved.updatedAt = now();
    await commit(next);
    return snapshot(saved, r.owner);
  }
  async function process(proof) {
    ready();
    if (!await verifyDotlandsRequest(proof, identity.fingerprint)) throw fail('The player signature or Keeper identity does not match.', 403);
    const r = proof.record, requestId = await hash(r), owner = r.owner, args = r.args;
    // An exact durable intent remains retryable after a phone has been closed
    // for days. Age limits apply to new intents, not recovery of paid entries.
    const previousCreate = r.operation === 'create' ? Object.values(state.rooms).find(row => row.createRequest === requestId && row.authority.members[0].peerId === owner) : null;
    const existingRoom = validCode(args.code) ? state.rooms[args.code] : null;
    const exactAdmission = r.operation === 'join' && existingRoom &&
      (existingRoom.reservation?.owner === owner && existingRoom.reservation.requestId === requestId || existingRoom.admissionRequests?.[owner] === requestId);
    const exactAction = ['start', 'action'].includes(r.operation) && existingRoom?.lastActions?.[owner]?.requestId === requestId;
    if (!previousCreate && !exactAdmission && !exactAction && Math.abs(now() - r.createdAt) > 300000) throw fail('Request expired. Refresh this Keeper and try again.', 409);
    if (r.operation === 'list') return reply(owner, requestId, { price: DOTLANDS_PRICE, currency,
      rooms: Object.values(state.rooms).filter(row => row.admitted.includes(owner) || row.reservation?.owner === owner).map(row => summary(row, owner)).sort((a, b) => b.updatedAt - a.updatedAt) });
    if (r.operation === 'create') {
      const previous = previousCreate;
      if (previous) return reply(owner, requestId, previous.admitted.includes(owner) ? snapshot(previous, owner) : await finishAdmission(previous.authority.code, proof));
      if (args.acceptPrice !== DOTLANDS_PRICE) throw fail('Confirm the one-token entry price before creating a room.', 402);
      if (typeof chargeAdmission !== 'function') throw fail('Arcade payments are not available on this Keeper yet.', 503);
      if (Object.keys(state.rooms).length >= Math.min(MAX_ROOMS, maxRooms) || Object.values(state.rooms).filter(row => row.authority.members[0].peerId === owner).length >= 40) throw fail('This Keeper has reached its saved-room limit. Existing rooms remain available.', 503);
      const code = newCode(), a = new HostRoom({ engine, code, peerId: owner, name: args.name, maxPlayers: args.maxPlayers ?? 4, radius: args.radius ?? 3, seed: args.seed });
      const next = clone(state);
      next.rooms[code] = { authority: roomDump(a), admitted: [], createRequest: requestId, createdAt: now(), updatedAt: now(), reservation: { owner, name: a.members[0].name, seat: 0, requestId } };
      await commit(next);
      return reply(owner, requestId, await finishAdmission(code, proof));
    }
    if (!validCode(args.code)) throw fail('Enter a six-character room code.');
    const row = state.rooms[args.code]; if (!row) throw fail('This saved room was not found on this Keeper.', 404);
    if (r.operation === 'join') {
      if (row.admitted.includes(owner)) return reply(owner, requestId, snapshot(row, owner));
      if (args.acceptPrice !== DOTLANDS_PRICE) throw fail('Confirm the one-token entry price before joining.', 402);
      if (row.reservation && row.reservation.owner !== owner) throw fail('Another player is finishing their entry. Try again shortly.', 409);
      if (!row.reservation) {
        const a = restore(row.authority);
        if (a.state) throw fail('This game has already started. Only its saved players can return.', 409);
        // Validate name and capacity on a throwaway authority before reserving.
        const proposed = a.invoke(owner, 'join', { name: args.name });
        const next = clone(state);
        next.rooms[args.code].reservation = { owner, name: proposed.players.at(-1).name, seat: proposed.seat, requestId };
        await commit(next);
      }
      return reply(owner, requestId, await finishAdmission(args.code, proof));
    }
    if (!row.admitted.includes(owner)) throw fail('Only this room’s saved players can read or change it.', 403);
    if (r.operation === 'snapshot') {
      // With all humans eliminated, continue remaining AI in bounded batches
      // when someone watches the saved match. Each batch is saved first.
      const a = restore(row.authority);
      if (a.advanceBots()) {
        const next = clone(state); next.rooms[args.code].authority = roomDump(a); next.rooms[args.code].updatedAt = now(); await commit(next);
        return reply(owner, requestId, snapshot(next.rooms[args.code], owner, args.knownRevision));
      }
      return reply(owner, requestId, snapshot(row, owner, args.knownRevision));
    }
    if (row.reservation) throw fail('A player is finishing their entry. Wait before starting the game.', 409);
    const next = clone(state), saved = next.rooms[args.code], a = restore(saved.authority), member = a.members.find(m => m.peerId === owner);
    // Revision checks reject replayed mutations after a restart, even when the
    // transport retries a request that was already saved before its response.
    if (saved.lastActions?.[owner]?.requestId === requestId) return reply(owner, requestId, snapshot(saved, owner));
    a.invoke(owner, r.operation, args, member.token);
    saved.authority = roomDump(a); saved.updatedAt = now();
    saved.lastActions = { ...saved.lastActions, [owner]: { requestId, revision: a.revision } };
    await commit(next);
    return reply(owner, requestId, snapshot(saved, owner));
  }
  return {
    get unavailable() { return unavailable; },
    info: () => signed({ format: DOTLANDS_FORMAT, kind: 'info', issuer: identity.fingerprint, time: now(), price: DOTLANDS_PRICE, currency, available: !unavailable, paymentsAvailable: typeof chargeAdmission === 'function', error: unavailable, savedRooms: true, maxPlayers: 4 }),
    dispatch(proof) { const job = queue.then(() => process(proof)); queue = job.catch(() => {}); return job; },
    async errorResponse(proof, e) {
      if (!await verifyDotlandsRequest(proof, identity.fingerprint)) return null;
      return signed({ format: DOTLANDS_FORMAT, kind: 'response', issuer: identity.fingerprint, time: now(), owner: proof.record.owner, requestId: await hash(proof.record), status: Number.isInteger(e.status) ? e.status : 503, error: e.status ? e.message : 'This change could not be saved. Reopen the room to check its saved state before trying again.' });
    },
    idle: () => queue,
  };
}
