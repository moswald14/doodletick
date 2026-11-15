import { COLORS, FLOOD_COLORS, defaultPack } from './game-engine.mjs';
export const THEMES = {
  meadow: { sky: '#e8edce', floor: '#cadbb4', grass: '#bfd3a2', wall: '#6f8964', water: '#82b9b1', path: '#e4d7ad', ink: '#304d3d' },
  midnight: { sky: '#252c3e', floor: '#39445b', grass: '#414d67', wall: '#222c40', water: '#587c99', path: '#535878', ink: '#e7e8d6' },
  sunset: { sky: '#efd4ba', floor: '#dfb79e', grass: '#d4a18f', wall: '#9d7570', water: '#95b8b3', path: '#f2d7ac', ink: '#634d51' }
};
export const PORTALS = [{ x: 5.5, y: 5.5, game: 'dash', label: 'STARDUST' }, { x: 14.5, y: 4.5, game: 'flood', label: 'COLOR CONQUEST' }, { x: 23.5, y: 5.5, game: 'four', label: 'FOUR TO ORBIT' }];
function round(c, x, y, w, h, r, fill, stroke) { c.beginPath(); c.roundRect(x, y, w, h, r); if (fill) { c.fillStyle = fill; c.fill(); } if (stroke) { c.strokeStyle = stroke; c.stroke(); } }
function text(c, value, x, y, size = 14, color = '#304d3d', font = 'Arial') { c.font = `${size}px ${font}`; c.fillStyle = color; c.textAlign = 'center'; c.fillText(value, x, y); }
function star(c, x, y, r, color, time = 0) { c.save(); c.translate(x, y); c.rotate(time); c.beginPath(); for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4, s = i % 2 ? r * .3 : r; i ? c.lineTo(Math.cos(a) * s, Math.sin(a) * s) : c.moveTo(s, 0); } c.closePath(); c.fillStyle = color; c.fill(); c.restore(); }
export function drawMap(canvas, pack = defaultPack(), { grid = false, time = 0, portals = false } = {}) {
  const c = canvas.getContext('2d'), t = canvas.width / 28, theme = THEMES[pack.theme]; c.clearRect(0, 0, canvas.width, canvas.height); c.fillStyle = theme.sky; c.fillRect(0, 0, canvas.width, canvas.height);
  pack.tiles.forEach((tile, i) => {
    const x = i % 28 * t, y = Math.floor(i / 28) * t;
    c.fillStyle = tile === 2 ? theme.water : tile === 4 ? theme.path : (i * 31 % 7 < 3 ? theme.grass : theme.floor); c.fillRect(x, y, t + .3, t + .3);
    if (tile === 1) { round(c, x + 1, y + t * .21, t - 2, t * .8, t * .23, '#00000015'); round(c, x + 1, y + 1, t - 2, t * .8, t * .23, theme.wall); c.fillStyle = '#ffffff10'; c.fillRect(x + 7, y + 6, t * .4, 2); }
    if (tile === 2) { c.strokeStyle = '#ffffff40'; c.lineWidth = 1.5; c.beginPath(); c.moveTo(x + t * .2, y + t * (.48 + Math.sin(time + i) * .06)); c.lineTo(x + t * .6, y + t * .5); c.stroke(); }
    if (tile === 3) { c.fillStyle = theme.wall; c.beginPath(); c.ellipse(x + t * .5, y + t * .52, t * .24, t * .3, -.2, 0, Math.PI * 2); c.fill(); star(c, x + t * .55, y + t * .28, t * .12, i % 2 ? '#ffb88a' : '#f7edac'); }
    if (tile === 0 && i * 17 % 13 === 0) { c.strokeStyle = '#42674725'; c.beginPath(); c.moveTo(x + t * .5, y + t * .65); c.lineTo(x + t * .44, y + t * .52); c.moveTo(x + t * .5, y + t * .65); c.lineTo(x + t * .56, y + t * .48); c.stroke(); }
    if (grid) { c.strokeStyle = '#ffffff28'; c.lineWidth = .6; c.strokeRect(x, y, t, t); }
  });
  if (grid) for (const p of [{ x: 13, y: 10 }, { x: 15, y: 10 }, { x: 13, y: 12 }, { x: 15, y: 12 }]) { c.strokeStyle = '#fff'; c.lineWidth = 2; c.strokeRect(p.x * t + 3, p.y * t + 3, t - 6, t - 6); text(c, '+', (p.x + .5) * t, (p.y + .7) * t, t * .6, theme.ink); }
  if (portals) PORTALS.forEach((p, i) => {
    const x = p.x * t, y = p.y * t, color = ['#e8ff79', '#ffb47e', '#bcafff'][i];
    c.fillStyle = '#00000018'; c.beginPath(); c.ellipse(x, y + t * .7, t * 1.3, t * .35, 0, 0, Math.PI * 2); c.fill();
    c.lineWidth = 5; c.strokeStyle = theme.ink; c.beginPath(); c.ellipse(x, y, t * .65, t, 0, 0, Math.PI * 2); c.stroke(); c.fillStyle = color; c.fill();
    star(c, x, y, t * .33, theme.ink, time * .2 + i); round(c, x - 68, y + t + 10, 136, 23, 6, theme.ink); text(c, p.label, x, y + t + 26, 10, '#f5f6e7', 'monospace');
  });
  return c;
}
function avatar(c, player, profile, t, own, time, ink) {
  const x = player.x * t, y = player.y * t, color = profile?.color || player.color || COLORS[0], bob = Math.sin(time * 3 + player.x) * 1.3;
  c.fillStyle = '#00000025'; c.beginPath(); c.ellipse(x, y + 12, 15, 6, 0, 0, Math.PI * 2); c.fill();
  if (own) { c.strokeStyle = '#ffffffb0'; c.lineWidth = 2; c.beginPath(); c.ellipse(x, y + 12, 20, 9, 0, 0, Math.PI * 2); c.stroke(); }
  round(c, x - 13, y - 17 + bob, 26, 28, 10, color, '#304d3d'); c.fillStyle = '#304d3d'; c.fillRect(x - 6, y - 6 + bob, 3, 4); c.fillRect(x + 4, y - 6 + bob, 3, 4);
  c.strokeStyle = '#304d3d'; c.beginPath(); c.arc(x, y + 1 + bob, 4, .2, Math.PI - .2); c.stroke();
  if (profile?.icon === 'leaf') { c.fillStyle = '#527b50'; c.beginPath(); c.ellipse(x + 4, y - 20 + bob, 9, 4, -.6, 0, Math.PI * 2); c.fill(); }
  else text(c, profile?.icon === 'moon' ? '☾' : profile?.icon === 'comet' ? '↗' : '✦', x, y - 20 + bob, 15, color);
  text(c, (profile?.name || player.username || 'Doodler').slice(0, 24) + (own ? ' · you' : ''), x, y + 32, 12, ink);
  if (player.emote && Date.now() - player.emoteAt < 3500) { round(c, x - 20, y - 65, 40, 28, 10, '#fff9e7'); text(c, { hello: 'hey!', heart: '♥', gg: 'GG', spark: '✧' }[player.emote] || '', x, y - 46, 16, '#384e3b'); }
}
export function renderScene(canvas, state, own = '', time = 0) {
  const pack = state.pack || defaultPack(), game = state.game, c = canvas.getContext('2d'), w = canvas.width, h = canvas.height;
  if (!game || game.game === 'dash') {
    drawMap(canvas, pack, { time, portals: !game }); const theme = THEMES[pack.theme], t = w / 28;
    if (game) for (const s of game.stars) { c.fillStyle = '#fff5aa33'; c.beginPath(); c.arc(s.x * t, s.y * t, 18, 0, Math.PI * 2); c.fill(); star(c, s.x * t, s.y * t + Math.sin(time * 3 + s.number) * 2, 10, '#fffcd2', time * .3); }
    const players = game?.players || state.members; [...players].sort((a, b) => a.y - b.y).forEach(p => avatar(c, p, state.members.find(m => m.id === p.id)?.profile, t, p.id === own, time, theme.ink));
  } else {
    c.fillStyle = '#263f39'; c.fillRect(0, 0, w, h); for (let i = 0; i < 50; i++) star(c, (i * 139) % w, (i * 97) % h, i % 3 + 1, '#9cbb9444');
    if (game.game === 'four') {
      const s = 66, ox = (w - s * 7) / 2, oy = 140; round(c, ox - 16, oy - 16, s * 7 + 32, s * 6 + 32, 20, '#53665e');
      game.board.forEach((v, i) => { const x = ox + i % 7 * s + s / 2, y = oy + Math.floor(i / 7) * s + s / 2; c.fillStyle = v < 0 ? '#263f39' : COLORS[v]; c.beginPath(); c.arc(x, y, 25, 0, Math.PI * 2); c.fill(); if (v >= 0) star(c, x, y, 10, '#304d3d44', .2); });
      for (let i = 0; i < 7; i++) text(c, '↓ ' + (i + 1), ox + (i + .5) * s, oy - 35, 18, '#e5e9ce');
    } else {
      const s = 47, ox = (w - s * 9) / 2, oy = 105;
      game.board.forEach((v, i) => { const x = ox + i % 9 * s, y = oy + Math.floor(i / 9) * s, owner = game.owners[i]; round(c, x + 2, y + 2, s - 4, s - 4, 7, FLOOD_COLORS[v]); if (owner >= 0) { c.fillStyle = '#253b35'; c.beginPath(); c.arc(x + s / 2, y + s / 2, 11, 0, Math.PI * 2); c.fill(); text(c, String(owner + 1), x + s / 2, y + s / 2 + 4, 12, COLORS[owner]); } });
      text(c, 'Your numbered tiles grow into neighboring colors.', w / 2, 570, 15, '#c6d4bc');
    }
    const turn = game.players[game.turn]; text(c, game.ended ? 'A little piece of history.' : `${turn.username}'s turn`, w / 2, 57, 25, '#f0f1d9', 'Georgia');
  }
  if (state.paused) { c.fillStyle = '#152a2bbb'; c.fillRect(0, 0, w, h); text(c, 'Taking a little breath.', w / 2, h / 2, 32, '#f2f4d9', 'Georgia'); text(c, 'The host has paused this room.', w / 2, h / 2 + 35, 16, '#c9d6b5'); }
}
export function canvasPoint(canvas, event) { const r = canvas.getBoundingClientRect(); return { x: (event.clientX - r.left) * canvas.width / r.width, y: (event.clientY - r.top) * canvas.height / r.height }; }
export function columnAt(canvas, event) { const p = canvasPoint(canvas, event), ox = (canvas.width - 462) / 2; return p.y >= 80 && p.y <= 552 && p.x >= ox && p.x < ox + 462 ? Math.floor((p.x - ox) / 66) : -1; }
