// Shared, deterministic game rules. Renderers and transports never decide scores.
export const GAMES = {
  dash: { name: 'Stardust Dash', subtitle: 'Chase little sparks. Make a big mess.', players: '1–4 players', kind: 'Real-time', accent: '#e8ff79' },
  flood: { name: 'Color Conquest', subtitle: 'One color. One move. A little more universe.', players: '2–4 players', kind: 'Strategy', accent: '#ffb47e' },
  four: { name: 'Four to Orbit', subtitle: 'Drop a moon. Connect a constellation.', players: '2 players + spectators', kind: 'Classic', accent: '#bcafff' }
};
export const COLORS = ['#deff79', '#ff9f8f', '#99d8ff', '#c3a4ff'];
export const FLOOD_COLORS = ['#f8a58e', '#e6df77', '#a6d48c', '#85cad0', '#b4a4df', '#e5a6c7'];
export const WIDTH = 28, HEIGHT = 18, STEP = 0.05;
export function rng(seed) { let a = seed >>> 0; return () => { a += 0x6D2B79F5; let t = a; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
export const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
export const spawnPoints = [{ x: 13.5, y: 10.5 }, { x: 15.5, y: 10.5 }, { x: 13.5, y: 12.5 }, { x: 15.5, y: 12.5 }];
export function defaultPack() {
  const tiles = Array.from({ length: WIDTH * HEIGHT }, (_, i) => { const x = i % WIDTH, y = Math.floor(i / WIDTH); return x === 0 || y === 0 || x === WIDTH - 1 || y === HEIGHT - 1 ? 1 : (x > 11 && x < 17 || y > 8 && y < 12) ? 4 : 0; });
  for (let y = 12; y < 16; y++) for (let x = 3; x < 8; x++) tiles[y * WIDTH + x] = 2;
  for (const [x, y] of [[3, 3], [9, 3], [22, 3], [24, 12], [19, 14], [9, 14], [5, 7], [22, 7]]) tiles[y * WIDTH + x] = 3;
  return { format: 'doodletick-world-v1', title: 'The Little Elsewhere', description: 'A quiet clearing between galaxies. Bring a friend. Leave a little color.', theme: 'meadow', tiles, duration: 45, starCount: 12, speed: 4.5, seed: 2026 };
}
export function validatePack(pack) {
  if (!pack || pack.format !== 'doodletick-world-v1' || typeof pack.title !== 'string' || pack.title.trim().length < 1 || pack.title.length > 60 || typeof pack.description !== 'string' || pack.description.length > 240 || !['meadow', 'midnight', 'sunset'].includes(pack.theme)) throw new Error('This world has an invalid title or theme.');
  if (!Array.isArray(pack.tiles) || pack.tiles.length !== WIDTH * HEIGHT || pack.tiles.some(t => !Number.isInteger(t) || t < 0 || t > 4)) throw new Error('This world needs a 28 × 18 map with supported tiles.');
  if (![30, 45, 60, 90].includes(pack.duration) || !Number.isInteger(pack.starCount) || pack.starCount < 4 || pack.starCount > 24 || ![3.5, 4.5, 5.5].includes(pack.speed) || !Number.isInteger(pack.seed) || pack.seed < 0 || pack.seed > 4294967295) throw new Error('World game rules are outside the supported limits.');
  for (const point of spawnPoints) if (!walkable(pack, point.x, point.y)) throw new Error('Keep the four center spawn tiles open.');
  const seen = new Set(), queue = [Math.floor(spawnPoints[0].y) * WIDTH + Math.floor(spawnPoints[0].x)];
  while (queue.length) { const i = queue.pop(); if (seen.has(i) || !walkable(pack, i % WIDTH + .5, Math.floor(i / WIDTH) + .5)) continue; seen.add(i); const x = i % WIDTH, y = Math.floor(i / WIDTH); for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = x + dx, ny = y + dy; if (nx >= 0 && nx < WIDTH && ny >= 0 && ny < HEIGHT) queue.push(ny * WIDTH + nx); } }
  if (seen.size < 80 || spawnPoints.some(p => !seen.has(Math.floor(p.y) * WIDTH + Math.floor(p.x)))) throw new Error('Connect all center spawns and at least 80 walkable tiles.');
  return true;
}
export function walkable(pack, x, y) { const ix = Math.floor(x), iy = Math.floor(y); return ix >= 0 && iy >= 0 && ix < WIDTH && iy < HEIGHT && ![1, 2].includes(pack.tiles[iy * WIDTH + ix]); }
export function moveAvatar(player, input, pack, speed = pack.speed) {
  const x = clamp(Number(input?.x) || 0, -1, 1), y = clamp(Number(input?.y) || 0, -1, 1), norm = Math.max(1, Math.hypot(x, y));
  const nx = player.x + x / norm * speed * STEP, ny = player.y + y / norm * speed * STEP, r = .23;
  if (walkable(pack, nx - r, player.y - r) && walkable(pack, nx + r, player.y + r) && walkable(pack, nx + r, player.y - r) && walkable(pack, nx - r, player.y + r)) player.x = nx;
  if (walkable(pack, player.x - r, ny - r) && walkable(pack, player.x + r, ny + r) && walkable(pack, player.x + r, ny - r) && walkable(pack, player.x - r, ny + r)) player.y = ny;
}
function reachable(pack) {
  const seen = new Set(), queue = [{ x: 13, y: 10 }];
  while (queue.length) { const p = queue.pop(), id = p.y * WIDTH + p.x; if (seen.has(id) || !walkable(pack, p.x + .5, p.y + .5)) continue; seen.add(id); for (const [x, y] of [[p.x - 1, p.y], [p.x + 1, p.y], [p.x, p.y - 1], [p.x, p.y + 1]]) if (x >= 0 && x < WIDTH && y >= 0 && y < HEIGHT) queue.push({ x, y }); }
  return [...seen].sort((a, b) => a - b);
}
function starAt(state, number) { const random = rng((state.seed + number * 104729) >>> 0), choices = state.floor; const i = choices[Math.floor(random() * choices.length)]; return { x: i % WIDTH + .5, y: Math.floor(i / WIDTH) + .5, number }; }
export function createMatch(game, roster, seed, pack = defaultPack()) {
  validatePack(pack);
  if (!Object.hasOwn(GAMES, game) || !Array.isArray(roster) || roster.length < 1 || roster.length > 4 || new Set(roster.map(p => p.id)).size !== roster.length) throw new Error('Invalid match roster.');
  const active = roster.slice(0, game === 'four' ? 2 : 4);
  if (game !== 'dash' && active.length < 2) throw new Error('This game needs at least two players. Add a practice bot.');
  const state = { game, seed: seed >>> 0, players: active.map((p, i) => ({ id: p.id, username: p.username, bot: !!p.bot, color: COLORS[i], score: 0, ...spawnPoints[i], cooldown: 0 })), ended: false, tick: 0, turn: 0, turns: 0, winners: [], pack: structuredClone(pack) };
  if (game === 'dash') { state.floor = reachable(pack); state.starSerial = pack.starCount; state.stars = Array.from({ length: pack.starCount }, (_, i) => starAt(state, i)); state.remaining = pack.duration; }
  if (game === 'flood') {
    const random = rng(seed); state.board = Array.from({ length: 81 }, () => Math.floor(random() * 6)); state.owners = Array(81).fill(-1);
    const starts = [0, 80, 8, 72]; active.forEach((_, i) => { state.owners[starts[i]] = i; state.board[starts[i]] = i; }); updateFloodScores(state);
  }
  if (game === 'four') state.board = Array(42).fill(-1);
  return state;
}
function end(state) { state.ended = true; const max = Math.max(...state.players.map(p => p.score)); state.winners = state.players.filter(p => p.score === max).map(p => p.id); }
export function tickMatch(state, inputs = {}) {
  if (state.ended || state.game !== 'dash') return state;
  state.tick++;
  for (const player of state.players) {
    let input = inputs[player.id] || {};
    if (player.bot) { const target = [...state.stars].sort((a, b) => Math.hypot(a.x - player.x, a.y - player.y) - Math.hypot(b.x - player.x, b.y - player.y))[0]; input = target ? { x: Math.sign(target.x - player.x), y: Math.sign(target.y - player.y), dash: state.tick % 61 === 0 } : {}; }
    player.cooldown = Math.max(0, player.cooldown - 1);
    let speed = state.pack.speed;
    if (input.dash && player.cooldown === 0) { player.cooldown = 40; player.burst = 5; }
    if (player.burst > 0) { speed *= 2.4; player.burst--; }
    moveAvatar(player, input, state.pack, speed);
    for (let i = 0; i < state.stars.length; i++) if (Math.hypot(player.x - state.stars[i].x, player.y - state.stars[i].y) < .65) { player.score++; state.stars[i] = starAt(state, state.starSerial++); }
  }
  state.remaining = Math.max(0, state.pack.duration - state.tick * STEP);
  if (state.tick >= state.pack.duration / STEP) end(state);
  return state;
}
function updateFloodScores(state) { state.players.forEach((p, i) => { p.score = state.owners.filter(owner => owner === i).length; }); }
function flood(state, playerIndex, color) {
  const queue = [], seen = new Set();
  state.owners.forEach((owner, i) => { if (owner === playerIndex) queue.push(i); });
  while (queue.length) {
    const i = queue.pop(); if (seen.has(i)) continue; seen.add(i);
    if (state.owners[i] !== playerIndex && !(state.owners[i] === -1 && state.board[i] === color)) continue;
    state.owners[i] = playerIndex; state.board[i] = color;
    const x = i % 9, y = Math.floor(i / 9);
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = x + dx, ny = y + dy; if (nx >= 0 && nx < 9 && ny >= 0 && ny < 9) queue.push(ny * 9 + nx); }
  }
}
export function playTurn(state, playerId, choice) {
  if (state.ended || state.game === 'dash' || state.players[state.turn].id !== playerId || !Number.isInteger(choice)) throw new Error('It is not your turn, or this move is invalid.');
  if (state.game === 'flood') {
    if (choice < 0 || choice > 5) throw new Error('Choose one of the six colors.');
    flood(state, state.turn, choice); updateFloodScores(state); state.turns++;
    if (!state.owners.includes(-1) || state.turns >= state.players.length * 12) end(state);
  } else {
    if (choice < 0 || choice > 6) throw new Error('Choose a column on the board.');
    let row = 5; while (row >= 0 && state.board[row * 7 + choice] !== -1) row--; if (row < 0) throw new Error('That column is full.');
    state.board[row * 7 + choice] = state.turn; state.lastMove = row * 7 + choice; state.turns++;
    const winning = fourLine(state.board);
    if (winning) { state.winningLine = winning.cells; state.players[winning.player].score = 1; end(state); }
    else if (state.turns === 42) end(state);
  }
  if (!state.ended) state.turn = (state.turn + 1) % state.players.length;
  return state;
}
export function fourLine(board) {
  for (let y = 0; y < 6; y++) for (let x = 0; x < 7; x++) for (const [dx, dy] of [[1, 0], [0, 1], [1, 1], [1, -1]]) {
    const player = board[y * 7 + x]; if (player < 0) continue;
    const cells = [];
    for (let n = 0; n < 4; n++) { const xx = x + dx * n, yy = y + dy * n; if (xx < 0 || xx >= 7 || yy < 0 || yy >= 6 || board[yy * 7 + xx] !== player) break; cells.push(yy * 7 + xx); }
    if (cells.length === 4) return { player, cells };
  }
  return null;
}
export function botChoice(state) {
  if (state.game === 'flood') { let best = 0, score = -1; for (let color = 0; color < 6; color++) { const copy = structuredClone(state); flood(copy, state.turn, color); const n = copy.owners.filter(o => o === state.turn).length; if (n > score) { best = color; score = n; } } return best; }
  const order = [3, 2, 4, 1, 5, 0, 6].filter(x => state.board[x] === -1);
  for (const owner of [state.turn, 1 - state.turn]) for (const x of order) { const board = [...state.board]; let row = 5; while (board[row * 7 + x] !== -1) row--; board[row * 7 + x] = owner; if (fourLine(board)) return x; }
  return order[0];
}
export function summary(state) { return { winners: [...state.winners], scores: state.players.map(p => ({ id: p.id, score: p.score })), turns: state.turns, ticks: state.tick }; }
export function replayMatch(record, until = Infinity) {
  if (record?.format !== 'doodletick-match-v1' || !Object.hasOwn(GAMES, record.game) || !Array.isArray(record.events) || record.events.length > 12000 || JSON.stringify(record).length > 1500000) throw new Error('Unsupported match record.');
  const state = createMatch(record.game, record.roster, record.seed, record.pack), inputs = {};
  if (state.game === 'dash') {
    const total = Math.min(record.pack.duration / STEP, until); let at = 0;
    for (let tick = 0; tick < total; tick++) {
      while (at < record.events.length && record.events[at].tick === tick) {
        const e = record.events[at++]; if (e.type !== 'input' || !state.players.some(p => p.id === e.id && !p.bot) || ![-1, 0, 1].includes(e.x) || ![-1, 0, 1].includes(e.y) || typeof e.dash !== 'boolean') throw new Error('Invalid replay input.'); inputs[e.id] = { x: e.x, y: e.y, dash: e.dash };
      }
      tickMatch(state, inputs);
    }
    if (until === Infinity && at !== record.events.length) throw new Error('Replay inputs are out of order or beyond the match.');
  } else {
    for (const e of record.events.slice(0, until === Infinity ? undefined : until)) { if (e.type !== 'turn') throw new Error('Invalid replay action.'); playTurn(state, e.id, e.choice); }
  }
  return state;
}
export function verifyReplay(record) {
  try { const state = replayMatch(record); return state.ended && JSON.stringify(summary(state)) === JSON.stringify(record.result); } catch { return false; }
}
