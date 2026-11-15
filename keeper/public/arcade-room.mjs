import { ArcadeLink, readSignal } from './arcade-link.mjs';
import { b64, random, hash, sign, canonical, checkSignature } from './core.mjs';
import { GAMES, COLORS, createMatch, tickMatch, playTurn, botChoice, moveAvatar, defaultPack, validatePack, summary, verifyReplay, spawnPoints } from './game-engine.mjs';
import { verifyMatchReceipt } from './arcade-store.mjs';
import { verifyFile } from './licenses.mjs';
const worldBytes = pack => new TextEncoder().encode(JSON.stringify(pack, null, 2));
function validChat(m) { return m && typeof m.id === 'string' && m.id.length <= 40 && typeof m.player === 'string' && m.player.length <= 43 && typeof m.name === 'string' && m.name.length <= 24 && typeof m.text === 'string' && m.text.length <= 240 && Number.isFinite(m.at); }
export function brokerBase(value = '') {
  if (value !== '' && value !== 'self') throw new Error('Room codes only work on this same Keeper. Between separate Keepers, exchange signed invitation and answer codes.');
  return 'self';
}
export async function lobbyRequest(base, route, { method = 'GET', body, token } = {}) {
  const res = await fetch('/vpn-api/lobby/' + brokerBase(base) + '/' + route, { method, headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: 'Bearer ' + token } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(12000) });
  const data = await res.json().catch(() => ({ error: 'This address is not a Doodleverse lobby.' })); if (!res.ok) throw new Error(data.error || 'Lobby service unavailable.'); return data;
}
const cleanProfile = (profile, fallback) => ({ name: typeof profile?.name === 'string' && profile.name.trim() ? profile.name.trim().slice(0, 24) : fallback, color: /^#[0-9A-Fa-f]{6}$/.test(profile?.color) ? profile.color : COLORS[0], icon: ['spark', 'moon', 'leaf', 'comet'].includes(profile?.icon) ? profile.icon : 'spark', bio: typeof profile?.bio === 'string' ? profile.bio.slice(0, 120) : '' });
export class ArcadeRoom {
  constructor({ identity, profile, pack = defaultPack(), worldCredit = null, onChange = () => {}, onEvent = () => {}, onReceipt = async () => {}, onError = () => {}, onActivity = () => {} }) {
    validatePack(pack); Object.assign(this, { identity, profile: cleanProfile(profile, identity.username), onChange, onEvent, onReceipt, onError, onActivity });
    this.id = b64(random(12)); this.role = 'host'; this.closed = false; this.links = new Map(); this.inputs = {}; this.lastInputs = {}; this.transcript = []; this.seq = 0; this.chat = []; this.processed = new Set(); this.paused = false;
    this.state = { id: this.id, title: pack.title, pack: structuredClone(pack), worldCredit, kind: 'world', selected: 'dash', members: [this.member(identity, this.profile, 0)], game: null, paused: false };
    this.sim = setInterval(() => this.step(), 50); this.network = setInterval(() => { this.broadcastState(); if (this.role === 'host') this.onChange(); }, 100);
  }
  member(identity, profile, index, bot = false) { return { id: identity.fingerprint, username: identity.username, publicKey: identity.publicKey || '', profile: cleanProfile(profile, identity.username), ...spawnPoints[index % 4], ready: index === 0 || bot, bot }; }
  event(text) { this.onEvent(text); }
  async publish({ base = 'self', title, discoverable = false }) {
    await this.checkWorld(this.state.pack, this.state.worldCredit);
    this.base = brokerBase(base); const room = await lobbyRequest(this.base, 'rooms', { method: 'POST', body: { title: title || this.state.title, game: this.state.selected, host: this.identity.username, discoverable } });
    if (this.closed) { lobbyRequest(this.base, 'rooms/' + room.id, { method: 'DELETE', token: room.token }).catch(() => {}); return; }
    this.id = room.id; this.state.id = room.id; this.state.title = title || this.state.title; this.hostToken = room.token;
    this.poll = setInterval(() => this.pollHost().catch(e => this.onError(e.message)), 1500); this.heartbeat = setInterval(() => lobbyRequest(this.base, 'rooms/' + this.id, { method: 'PATCH', token: this.hostToken, body: { players: this.state.members.filter(p => !p.bot).length, game: this.state.selected } }).catch(() => {}), 10000);
    this.event('Room is open in this Keeper. Friends using another Keeper need a signed invitation.'); this.onChange();
  }
  link(role) {
    const link = new ArcadeLink({ identity: this.identity, role, room: this.id,
      onOpen: peer => this.connected(peer), onPacket: (packet, peer) => this.message(packet, peer), onClose: (reason, peer) => this.disconnected(reason, peer), onError: error => this.onError(error) });
    this.links.set(link.id, link); return link;
  }
  async pollHost() {
    if (this.closed || this.polling) return; this.polling = true;
    try {
      const inbox = await lobbyRequest(this.base, `rooms/${this.id}/inbox`, { token: this.hostToken });
      for (const offer of inbox.offers) {
        if (this.closed || this.processed.has(offer.id)) continue;
        if ([...this.links.values()].filter(p => !p.closed).length >= 3) break;
        this.processed.add(offer.id); if (this.processed.size > 100) this.processed.delete(this.processed.values().next().value); const peer = this.link('host');
        try { const answer = await peer.accept(offer.offer); await lobbyRequest(this.base, `rooms/${this.id}/join/${offer.id}`, { method: 'POST', token: this.hostToken, body: { answer } }); } catch (e) { peer.close(); this.onError(e.message); }
      }
    } finally { this.polling = false; }
  }
  async join(code, base = 'self') {
    const parts = code.trim().split('@'); if (parts.length > 2) throw new Error('Invalid private room code.');
    this.role = 'guest'; this.base = brokerBase(parts.length === 2 ? parts[0] : base); this.id = parts.at(-1).toUpperCase().replaceAll('-', '');
    if (!/^[A-F0-9]{16}$/.test(this.id)) throw new Error('Paste the 16-character room code.');
    const info = await lobbyRequest(this.base, 'rooms/' + this.id); this.state.id = this.id; this.state.title = info.title; this.state.members = []; this.onChange();
    const peer = this.link('guest'), offer = await peer.offer();
    if (this.closed) return;
    const request = await lobbyRequest(this.base, `rooms/${this.id}/join`, { method: 'POST', body: { offer } });
    let attempts = 0;
    this.poll = setInterval(async () => {
      if (this.polling || this.closed) return; this.polling = true;
      try { const data = await lobbyRequest(this.base, `rooms/${this.id}/join/${request.id}`, { token: request.token }); if (data.answer) { clearInterval(this.poll); await peer.finish(data.answer); } else if (++attempts > 70) { clearInterval(this.poll); peer.close('Host did not answer.'); } } catch (e) { clearInterval(this.poll); peer.close(e.message); } finally { this.polling = false; }
    }, 1000);
  }
  async invite() { if (this.role !== 'host' || this.state.members.length >= 4 || [...this.links.values()].filter(p => !p.closed).length >= 3) throw new Error('This room has no open invite slots.'); await this.checkWorld(this.state.pack, this.state.worldCredit); const peer = this.link('host'); this.manualOffer = peer; return peer.offer(); }
  async answer(code) { const packet = await readSignal(code, 'offer'); if (packet.record.role !== 'host') throw new Error('Ask the host for an invitation.'); this.role = 'guest'; this.id = packet.record.room; this.state.id = this.id; this.state.members = []; const peer = this.link('guest'); return peer.accept(code); }
  async finish(code) { if (!this.manualOffer) throw new Error('Create a manual invitation first.'); return this.manualOffer.finish(code); }
  connected(peer) {
    if (this.closed) { peer.close(); return; }
    if (this.role === 'host') {
      if (this.state.members.length >= 4 || this.state.members.some(p => p.id === peer.remote.id)) { peer.send({ type: 'notice', text: 'Room full, or this identity is already here.' }).then(() => peer.close()); return; }
      peer.admitted = true; this.state.members.push(this.member({ fingerprint: peer.remote.id, ...peer.remote }, { name: peer.remote.username, color: COLORS[this.state.members.length] }, this.state.members.length));
      peer.send({ type: 'welcome', state: this.state, chat: this.chat });
      if (this.matchInit && this.state.kind !== 'world') peer.send({ type: 'start', init: this.matchInit });
      if (this.result && this.state.kind === 'results') peer.send({ type: 'receipt', receipt: this.result });
      this.event('@' + peer.remote.username + ' joined the clearing.');
    } else peer.send({ type: 'hello', profile: this.profile });
    this.onChange(); this.broadcastState();
  }
  disconnected(reason, peer) {
    this.links.delete(peer.id); if (this.closed) return;
    if (this.role === 'host' && peer.remote && peer.admitted) {
      this.state.members = this.state.members.filter(p => p.id !== peer.remote.id); delete this.inputs[peer.remote.id];
      if (this.state.kind === 'match' && this.state.game?.players.some(p => p.id === peer.remote.id)) this.returnToWorld('Round interrupted when a player left. No result was issued.');
      this.event('@' + peer.remote.username + ' left.');
    } else if (this.role === 'guest') { this.state.kind = 'disconnected'; this.state.game = null; this.event(reason + ' The host keeps the saved world; join a new room to continue.'); }
    this.onChange();
  }
  sendAll(packet, droppable = false) { for (const peer of this.links.values()) peer.send(packet, droppable); }
  broadcastState() {
    if (this.closed || this.role !== 'host') return;
    const game = this.state.game ? { ...this.state.game, pack: undefined, floor: undefined } : null;
    this.sendAll({ type: 'snapshot', seq: ++this.seq, state: { ...this.state, pack: undefined, worldCredit: undefined, game } }, true);
  }
  async message(packet, peer) {
    if (this.closed) return;
    if (this.role === 'host') {
      const member = this.state.members.find(p => p.id === peer.remote.id); if (!member) return;
      const now = Date.now(); if (!peer.rate || now - peer.rate.start > 1000) peer.rate = { start: now, count: 0 }; if (++peer.rate.count > 65) throw new Error('Too many game actions.');
      if (packet.type === 'hello') { member.profile = cleanProfile(packet.profile, member.username); this.sendAll({ type: 'setup', pack: this.state.pack, worldCredit: this.state.worldCredit }); this.onChange(); }
      else if (packet.type === 'input') this.input(member.id, packet.input);
      else if (packet.type === 'ready') { if (this.state.kind === 'world') member.ready = packet.ready === true; }
      else if (packet.type === 'turn') this.turn(member.id, packet.choice);
      else if (packet.type === 'chat') this.addChat(member, packet.text);
      else if (packet.type === 'emote') this.emote(member.id, packet.emote);
      else if (packet.type === 'ack') await this.ack(member.id, packet);
      else throw new Error('Unexpected guest action.');
    } else {
      if (peer.remote.role !== 'host') throw new Error('Only the host can send room state.');
      if (packet.type === 'welcome') { this.validateState(packet.state, true); if (!Array.isArray(packet.chat) || packet.chat.length > 80 || !packet.chat.every(validChat)) throw new Error('Invalid room chat history.'); await this.checkWorld(packet.state.pack, packet.state.worldCredit); this.state = packet.state; this.chat = packet.chat; this.event('Connected directly. Welcome to ' + this.state.title + '.'); }
      else if (packet.type === 'setup') { validatePack(packet.pack); await this.checkWorld(packet.pack, packet.worldCredit); this.state.pack = packet.pack; this.state.worldCredit = packet.worldCredit; }
      else if (packet.type === 'snapshot') { if (!Number.isSafeInteger(packet.seq) || packet.seq <= (this.remoteSeq || 0)) return; this.validateState(packet.state); this.remoteSeq = packet.seq; this.state = { ...packet.state, pack: this.state.pack, worldCredit: this.state.worldCredit }; if (this.state.game) this.state.game.pack = this.state.pack; }
      else if (packet.type === 'chat') { if (!validChat(packet.message)) throw new Error('Invalid chat.'); this.chat.push(packet.message); this.chat = this.chat.slice(-80); }
      else if (packet.type === 'start') { createMatch(packet.init.game, packet.init.roster, packet.init.seed, packet.init.pack); this.matchInit = packet.init; }
      else if (packet.type === 'receipt') await this.receiveReceipt(packet.receipt, peer);
      else if (packet.type === 'notice') { if (typeof packet.text === 'string') this.event(packet.text.slice(0, 240)); }
      else throw new Error('Unexpected room message.');
    }
    this.onChange();
  }
  validateState(state, full = false) {
    if (!state || !['world', 'match', 'results'].includes(state.kind) || typeof state.title !== 'string' || state.title.length > 60 || !Object.hasOwn(GAMES, state.selected) || !Array.isArray(state.members) || state.members.length > 4) throw new Error('Invalid room state.');
    if (full) validatePack(state.pack);
    if (typeof state.paused !== 'boolean') throw new Error('Invalid pause state.');
    for (const m of state.members) if (typeof m.ready !== 'boolean' || typeof m.bot !== 'boolean' || !['spark', 'moon', 'leaf', 'comet'].includes(m.profile?.icon) || typeof m.profile?.bio !== 'string' || m.profile.bio.length > 120) throw new Error('Invalid player profile.');
    if (state.game) {
      const g = state.game;
      if (typeof g.ended !== 'boolean' || !Number.isInteger(g.turns) || g.turns < 0 || g.turns > 48 || !Array.isArray(g.winners) || g.winners.length > 4 || g.winners.some(id => typeof id !== 'string') || !Array.isArray(g.players) || g.players.some(p => !p || typeof p.id !== 'string' || typeof p.username !== 'string' || p.username.length > 24 || typeof p.bot !== 'boolean')) throw new Error('Invalid game players.');
      if (g.game === 'dash' && (!Number.isFinite(g.remaining) || g.remaining < 0 || g.remaining > 90)) throw new Error('Invalid game clock.');
    }
    for (const m of state.members) if (typeof m.id !== 'string' || typeof m.username !== 'string' || m.username.length > 24 || !Number.isFinite(m.x) || !Number.isFinite(m.y) || m.x < 0 || m.x > 28 || m.y < 0 || m.y > 18 || !m.profile || typeof m.profile.name !== 'string' || m.profile.name.length > 24 || !/^#[A-Fa-f0-9]{6}$/.test(m.profile.color)) throw new Error('Invalid player state.');
    if (state.game) { const g = state.game; if (!Object.hasOwn(GAMES, g.game) || !Array.isArray(g.players) || g.players.length > 4 || !Number.isFinite(g.tick) || g.tick < 0 || g.tick > 1800 || !Number.isInteger(g.turn) || g.turn < 0 || g.turn >= g.players.length) throw new Error('Invalid game state.'); for (const p of g.players) if (!Number.isFinite(p.x) || !Number.isFinite(p.y) || !Number.isFinite(p.score) || p.score < 0 || p.score > 100000) throw new Error('Invalid game score.'); if (g.game === 'dash' && (!Array.isArray(g.stars) || g.stars.length > 24 || g.stars.some(s => !Number.isFinite(s.x) || !Number.isFinite(s.y)))) throw new Error('Invalid star field.'); if (g.game === 'four' && (!Array.isArray(g.board) || g.board.length !== 42 || g.board.some(n => ![-1, 0, 1].includes(n)))) throw new Error('Invalid orbit board.'); if (g.game === 'flood' && (!Array.isArray(g.board) || g.board.length !== 81 || g.board.some(n => !Number.isInteger(n) || n < 0 || n > 5) || !Array.isArray(g.owners) || g.owners.length !== 81 || g.owners.some(n => !Number.isInteger(n) || n < -1 || n > 3))) throw new Error('Invalid color board.'); }
  }
  input(id, input) {
    if (!input || ![-1, 0, 1].includes(input.x) || ![-1, 0, 1].includes(input.y) || typeof input.dash !== 'boolean') throw new Error('Invalid movement.');
    this.inputs[id] = { x: input.x, y: input.y, dash: input.dash };
    if (this.state.kind === 'match' && this.state.game?.game === 'dash' && !this.state.game.ended && this.state.game.players.some(p => p.id === id && !p.bot) && JSON.stringify(this.lastInputs[id]) !== JSON.stringify(input)) { this.transcript.push({ type: 'input', tick: this.state.game.tick, id, ...this.inputs[id] }); this.lastInputs[id] = { ...input }; }
  }
  setInput(input) { if (this.closed) return; if (this.role === 'host') this.input(this.identity.fingerprint, input); else this.hostLink()?.send({ type: 'input', input }, true); }
  hostLink() { return [...this.links.values()].find(p => !p.closed && p.remote?.role === 'host'); }
  ready(value) { if (this.role === 'guest') this.hostLink()?.send({ type: 'ready', ready: !!value }); else this.state.members[0].ready = !!value; }
  select(game) { if (this.role !== 'host' || this.state.kind === 'match' || !Object.hasOwn(GAMES, game)) return; this.state.selected = game; this.state.members.forEach((m, i) => { m.ready = i === 0 || m.bot; }); this.onChange(); this.broadcastState(); }
  addBot() { if (this.role !== 'host' || this.state.kind !== 'world' || this.state.members.length >= 4) throw new Error('Bots can join an open room with an empty seat.'); let n = 1; while (this.state.members.some(p => p.id === 'bot-' + n)) n++; this.state.members.push(this.member({ fingerprint: 'bot-' + n, username: ['Mossbot', 'Orbitbot', 'Pebblebot'][n - 1] || 'Doodlebot' }, { name: ['Moss', 'Orbit', 'Pebble'][n - 1], color: COLORS[this.state.members.length], icon: 'leaf' }, this.state.members.length, true)); this.onChange(); }
  kick(id) { if (this.role !== 'host' || id === this.identity.fingerprint) return; if (this.state.kind === 'match') this.returnToWorld('Round interrupted by a roster change.'); const peer = [...this.links.values()].find(p => p.remote?.id === id); if (peer) peer.send({ type: 'notice', text: 'The host removed you from this room.' }).then(() => peer.close()); this.state.members = this.state.members.filter(p => p.id !== id); this.onChange(); }
  start() {
    if (this.role !== 'host' || this.state.kind === 'match') throw new Error('Only the host can start a new round.');
    const roster = this.state.members.slice(0, this.state.selected === 'four' ? 2 : 4);
    if (roster.some(p => !p.ready)) throw new Error('Wait for your players to ready up.');
    this.state.game = createMatch(this.state.selected, roster, crypto.getRandomValues(new Uint32Array(1))[0], this.state.pack);
    this.matchInit = { game: this.state.selected, roster: roster.map(({ id, username, publicKey, bot }) => ({ id, username, publicKey, bot })), seed: this.state.game.seed, pack: structuredClone(this.state.pack), matchId: b64(random(16)) };
    this.state.kind = 'match'; this.state.paused = false; this.transcript = []; this.lastInputs = {}; this.inputs = {}; this.result = null; this.finalizing = false; this.startedAt = new Date().toISOString(); this.botNext = Date.now() + 650; this.sendAll({ type: 'start', init: this.matchInit }); this.event(GAMES[this.state.selected].name + ' started.'); this.onActivity(); this.onChange(); this.broadcastState();
  }
  turn(id, choice) { if (this.state.kind !== 'match' || this.state.paused) return; try { playTurn(this.state.game, id, choice); this.transcript.push({ type: 'turn', id, choice }); this.onActivity(); this.onChange(); this.broadcastState(); if (this.state.game.ended) this.finishMatch(); } catch (error) { if (id === this.identity.fingerprint) this.onError(error.message); } }
  choose(choice) { if (this.role === 'host') this.turn(this.identity.fingerprint, choice); else this.hostLink()?.send({ type: 'turn', choice }); }
  step() {
    if (this.closed || this.role !== 'host' || this.state.paused) return;
    if (this.state.kind === 'world') {
      for (const member of this.state.members) { if (member.bot) { const phase = Date.now() / 2000 + this.state.members.indexOf(member); moveAvatar(member, { x: Math.sin(phase) > .8 ? 1 : 0, y: Math.cos(phase) > .8 ? 1 : 0 }, this.state.pack, 1.5); } else moveAvatar(member, this.inputs[member.id], this.state.pack); }
    } else if (this.state.kind === 'match' && !this.finalizing) {
      if (this.state.game.game === 'dash') { tickMatch(this.state.game, this.inputs); if (this.state.game.ended) this.finishMatch(); }
      else if (this.state.game.players[this.state.game.turn]?.bot && Date.now() > this.botNext) { this.botNext = Date.now() + 650; const p = this.state.game.players[this.state.game.turn]; this.turn(p.id, botChoice(this.state.game)); }
      this.onActivity();
    }
  }
  async finishMatch() {
    if (this.finalizing || this.closed) return; this.finalizing = true;
    try {
      const record = { format: 'doodletick-match-v1', ...this.matchInit, roomId: this.id, host: this.identity.fingerprint, startedAt: this.startedAt, endedAt: new Date().toISOString(), events: this.transcript, result: summary(this.state.game) };
      if (!verifyReplay(record)) throw new Error('The round did not replay consistently. No signed result was saved.');
      const signature = await sign(record, this.identity.privateKey); if (this.closed) return;
      this.result = { id: await hash(record), record, proofs: [{ player: this.identity.fingerprint, signature }] }; this.state.kind = 'results'; this.state.game.ended = true;
      this.sendAll({ type: 'receipt', receipt: this.result }); await this.onReceipt(this.result).catch(e => this.onError(e.message)); this.onChange(); this.broadcastState();
    } catch (error) { this.onError(error.message); this.returnToWorld('Round ended without a valid record.'); }
  }
  async receiveReceipt(receipt, peer) {
    if (!await verifyMatchReceipt(receipt) || receipt.record.host !== peer.remote.id) throw new Error('Match result failed signature or replay verification.');
    if (!this.matchInit || canonical(Object.fromEntries(Object.keys(this.matchInit).map(k => [k, receipt.record[k]]))) !== canonical(this.matchInit)) throw new Error('Match result changed the agreed starting rules.');
    this.result = receipt;
    if (receipt.record.roster.some(p => !p.bot && p.id === this.identity.fingerprint) && !receipt.proofs.some(p => p.player === this.identity.fingerprint)) { const signature = await sign(receipt.record, this.identity.privateKey); if (!this.closed) peer.send({ type: 'ack', id: receipt.id, signature }); }
    await this.onReceipt(receipt).catch(e => this.onError(e.message)); this.onChange();
  }
  async ack(playerId, packet) {
    if (!this.result || packet.id !== this.result.id || this.result.proofs.some(p => p.player === playerId)) return;
    const player = this.result.record.roster.find(p => p.id === playerId && !p.bot);
    if (!player || !await checkSignature(this.result.record, packet.signature, player.publicKey)) throw new Error('Invalid match attestation.');
    this.result.proofs.push({ player: playerId, signature: packet.signature }); this.sendAll({ type: 'receipt', receipt: this.result }); await this.onReceipt(this.result).catch(e => this.onError(e.message)); this.onChange();
  }
  returnToWorld(reason = 'Back to the clearing.') { if (this.role !== 'host') return; this.state.kind = 'world'; this.state.game = null; this.inputs = {}; this.finalizing = false; this.state.members.forEach((p, i) => Object.assign(p, spawnPoints[i])); this.event(reason); this.onChange(); this.broadcastState(); }
  pause(value) { if (this.role !== 'host') return; this.state.paused = !!value; this.onChange(); this.broadcastState(); }
  async checkWorld(pack, credit) { if (canonical(pack) === canonical(defaultPack()) && !credit) return; if (!credit || !await verifyFile(credit, worldBytes(pack))) throw new Error('License this world in the workshop before sharing it: choose credits, confirm your rights, then Play this world.'); }
  async setPack(pack, worldCredit = null) { if (this.role !== 'host' || this.state.kind === 'match') throw new Error('Return to the clearing before changing worlds.'); validatePack(pack); await this.checkWorld(pack, worldCredit); this.state.pack = structuredClone(pack); this.state.worldCredit = worldCredit; this.state.title = pack.title; this.state.members.forEach((p, i) => Object.assign(p, spawnPoints[i])); this.sendAll({ type: 'setup', pack, worldCredit }); this.onChange(); this.broadcastState(); }
  addChat(member, text) {
    if (typeof text !== 'string' || !text.trim() || text.length > 240) return;
    const now = Date.now(); member.chats = (member.chats || []).filter(t => now - t < 10000); if (member.chats.length >= 5) return; member.chats.push(now);
    const message = { id: b64(random(8)), player: member.id, name: member.profile.name, text: text.trim(), at: now }; this.chat.push(message); this.chat = this.chat.slice(-80); this.sendAll({ type: 'chat', message }); this.onChange();
  }
  say(text) { if (this.role === 'host') this.addChat(this.state.members[0], text); else this.hostLink()?.send({ type: 'chat', text }); }
  emote(id, emote) { if (!['hello', 'heart', 'gg', 'spark'].includes(emote)) return; const member = this.state.members.find(m => m.id === id); if (member) { if (Date.now() - (member.emoteAt || 0) < 1000) return; member.emote = emote; member.emoteAt = Date.now(); } }
  sendEmote(emote) { if (this.role === 'host') this.emote(this.identity.fingerprint, emote); else this.hostLink()?.send({ type: 'emote', emote }); }
  close() { if (this.closed) return; this.closed = true; clearInterval(this.sim); clearInterval(this.network); clearInterval(this.poll); clearInterval(this.heartbeat); for (const peer of this.links.values()) peer.close(); this.links.clear(); if (this.hostToken) lobbyRequest(this.base, 'rooms/' + this.id, { method: 'DELETE', token: this.hostToken }).catch(() => {}); this.identity = null; }
}
