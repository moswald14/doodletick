/* Reusable Dotlands game rules; Keeper owns the authority for saved rooms. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.DotlandsRoom = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const COLORS = ['#78aa8b', '#dc917d', '#d5b45d', '#afa1c7'];
  const NAMES = ['Moss', 'Ember', 'Honey', 'Iris'];
  const MAX_PACKET = 64000;
  const clone = value => JSON.parse(JSON.stringify(value));
  const object = value => value && typeof value === 'object' && !Array.isArray(value);
  function fail(status, message) { const e = new Error(message); e.status = status; throw e; }
  function randomToken(bytes = 24) {
    if (!globalThis.crypto?.getRandomValues) fail(503, 'This browser needs a secure connection for online play.');
    return Array.from(crypto.getRandomValues(new Uint8Array(bytes)), n => n.toString(16).padStart(2, '0')).join('');
  }
  function nameOf(value) {
    if (typeof value !== 'string') fail(400, 'Enter your player name.');
    const name = value.trim().replace(/\s+/g, ' ');
    if (!name || name.length > 22 || /[\u0000-\u001f\u007f]/.test(name)) fail(400, 'Use a name between 1 and 22 characters.');
    return name;
  }
  function boundedPacket(value) {
    try { return object(value) && JSON.stringify(value).length <= MAX_PACKET; } catch { return false; }
  }
  function validateSnapshot(data, engine, expected = {}) {
    if (!boundedPacket(data) || typeof data.code !== 'string' || !data.code || data.code.length > 200 ||
        !Number.isSafeInteger(data.revision) || data.revision < 1 || data.hostSeat !== 0 ||
        !Number.isInteger(data.maxPlayers) || data.maxPlayers < 2 || data.maxPlayers > 4 ||
        !Array.isArray(data.players) || data.players.length < 1 || data.players.length > data.maxPlayers ||
        !Number.isInteger(data.seat) || !['lobby', 'playing'].includes(data.phase)) fail(400, 'The host sent an invalid room.');
    if (expected.code && data.code !== expected.code) fail(400, 'That update belongs to another room.');
    if (expected.seat !== undefined && data.seat !== expected.seat) fail(400, 'The host changed your seat unexpectedly.');
    const seats = new Set();
    for (const p of data.players) {
      if (!object(p) || !Number.isInteger(p.seat) || p.seat < 0 || p.seat >= data.maxPlayers || seats.has(p.seat) ||
          typeof p.name !== 'string' || nameOf(p.name) !== p.name || (p.connected !== undefined && typeof p.connected !== 'boolean') ||
          p.token !== undefined || p.peerId !== undefined) fail(400, 'The host sent invalid player details.');
      seats.add(p.seat);
    }
    if (!seats.has(0) || !seats.has(data.seat) || data.players.some((p, i) => p.seat !== i)) fail(400, 'The host sent invalid seats.');
    if (data.phase === 'lobby') {
      if (data.state !== null) fail(400, 'The waiting room contains an unexpected game.');
    } else {
      if (!object(data.state) || data.state.version !== engine.VERSION || !engine.validateState(data.state).ok ||
          data.state.players.length < data.players.length || data.state.players.length > data.maxPlayers) fail(400, 'The host sent an invalid game.');
      data.state.players.forEach((p, i) => {
        const member = data.players[i];
        if (p.color !== COLORS[i] || (member ? p.name !== member.name || p.controller !== 'human' : p.controller !== 'ai')) fail(400, 'The game countries do not match the room.');
      });
    }
    return data;
  }

  class HostRoom {
    constructor({ engine, code, peerId, name, maxPlayers = 4, radius = 3, seed }) {
      if (!engine || typeof code !== 'string' || !code || code.length > 200 || typeof peerId !== 'string' || !peerId) fail(400, 'Invalid room settings.');
      if (!Number.isInteger(maxPlayers) || maxPlayers < 2 || maxPlayers > 4 || ![3, 4].includes(radius)) fail(400, 'A room needs two to four seats.');
      if (seed !== undefined && (typeof seed !== 'string' || seed.length > 64)) fail(400, 'Invalid continent seed.');
      this.engine = engine; this.code = code; this.maxPlayers = maxPlayers; this.radius = radius;
      this.seed = seed || randomToken(8); this.revision = 1; this.state = null;
      this.members = [{ name: nameOf(name), peerId, seat: 0, token: randomToken(), connected: true }];
    }
    snapshot(member, includeToken = false) {
      const data = { code: this.code, phase: this.state ? 'playing' : 'lobby', revision: this.revision,
        players: this.members.map(({ name, seat, connected }) => ({ name, seat, connected })),
        hostSeat: 0, maxPlayers: this.maxPlayers, state: this.state, seat: member.seat };
      if (includeToken) data.token = member.token;
      return clone(data);
    }
    authenticate(peerId, token) {
      const member = this.members.find(m => m.peerId === peerId && m.token === token);
      if (!member) fail(401, 'Your room key is missing or no longer valid.');
      return member;
    }
    checkRevision(body) {
      if (!Number.isSafeInteger(body.expectedRevision)) fail(400, 'Refresh the room before playing.');
      if (body.expectedRevision !== this.revision) fail(409, 'The table changed. Your map has been refreshed.');
    }
    bots(state) {
      for (let turn = 0; turn < 4 && state.winner === null; turn++) {
        if (state.players[state.currentPlayer].controller !== 'ai') break;
        for (let move = 0; move < 64 && state.winner === null; move++) {
          const choice = this.engine.chooseAIMove(state);
          if (!choice) break;
          const result = this.engine.applyMove(state, choice.from, choice.to, this.engine.maxSend(state, choice.from, choice.to));
          if (!result?.ok) break;
        }
        if (state.winner === null) this.engine.endTurn(state);
      }
    }
    commit(state) {
      if (!this.engine.validateState(state).ok) fail(500, 'The move did not produce a valid game.');
      this.state = state; this.revision++;
    }
    advanceBots() {
      if (!this.state || this.state.winner !== null || this.state.players[this.state.currentPlayer].controller !== 'ai') return false;
      const state = clone(this.state); this.bots(state); this.commit(state); return true;
    }
    connected(peerId, connected) {
      const member = this.members.find(m => m.peerId === peerId);
      if (member && member.connected !== connected) { member.connected = connected; this.revision++; return true; }
      return false;
    }
    invoke(peerId, operation, body = {}, token) {
      if (!object(body) || JSON.stringify(body).length > 8192) fail(400, 'Invalid room request.');
      if (operation === 'join') {
        if (token !== undefined) {
          const member = this.members.find(m => m.token === token && m.seat !== 0);
          if (!member) fail(401, 'Your saved seat no longer belongs to this room.');
          if (this.members.some(m => m.peerId === peerId && m !== member)) fail(403, 'This connection already belongs to another player.');
          if (member.peerId !== peerId || !member.connected) { member.peerId = peerId; member.connected = true; this.revision++; }
          return this.snapshot(member, true);
        }
        if (this.members.some(m => m.peerId === peerId)) fail(401, 'Use your saved room key to reconnect.');
        if (this.state) fail(409, 'This game has started. Ask the host for a new room.');
        if (this.members.length >= this.maxPlayers) fail(409, 'This room is full.');
        const member = { name: nameOf(body.name), peerId, seat: this.members.length, token: randomToken(), connected: true };
        this.members.push(member); this.revision++;
        return this.snapshot(member, true);
      }
      const member = this.authenticate(peerId, token);
      if (operation === 'snapshot') return body.knownRevision === this.revision
        ? { unchanged: true, code: this.code, seat: member.seat, revision: this.revision }
        : this.snapshot(member);
      if (operation === 'start') {
        if (member.seat !== 0) fail(403, 'Only the host can start the game.');
        if (this.state) fail(409, 'This game has already started.');
        this.checkRevision(body);
        if (body.fillBots !== undefined && typeof body.fillBots !== 'boolean') fail(400, 'Invalid computer-player option.');
        if (this.members.length < 2 && !body.fillBots) fail(409, 'Invite another player or fill the empty seats with computers.');
        const players = this.members.map(m => ({ name: m.name, color: COLORS[m.seat], controller: 'human' }));
        if (body.fillBots) while (players.length < this.maxPlayers) players.push({ name: NAMES[players.length] + ' Bot', color: COLORS[players.length], controller: 'ai' });
        const state = this.engine.createGame({ seed: this.seed, radius: this.radius, players });
        this.bots(state); this.commit(state);
        return this.snapshot(member);
      }
      if (operation !== 'action') fail(400, 'Unknown room request.');
      if (!this.state) fail(409, 'Wait for the host to start the game.');
      if (this.state.winner !== null) fail(409, 'This game is finished. Create a room for a rematch.');
      if (this.state.currentPlayer !== member.seat) fail(403, 'It is another player’s turn.');
      this.checkRevision(body);
      const state = clone(this.state);
      if (body.type === 'move') {
        if (typeof body.from !== 'string' || typeof body.to !== 'string' || body.from.length > 16 || body.to.length > 16) fail(400, 'Choose your hex and a neighbor.');
        const result = this.engine.applyMove(state, body.from, body.to, this.engine.maxSend(state, body.from, body.to));
        if (!result?.ok) fail(400, result?.error || 'That move is not allowed.');
      } else if (body.type === 'endTurn') { this.engine.endTurn(state); this.bots(state); }
      else fail(400, 'Unknown game action.');
      this.commit(state);
      return this.snapshot(member);
    }
  }

  return Object.freeze({ HostRoom, validateSnapshot });
});
