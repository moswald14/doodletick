import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
const source = readFileSync(new URL('../public/shelf-idle-card.js', import.meta.url), 'utf8');
const clone = value => JSON.parse(JSON.stringify(value));

function boot(send = async () => {}) {
  class Element {
    constructor(owner = null) { this.owner = owner; this.textContent = ''; this.hidden = false; this.attrs = {}; this.dataset = {}; this.classList = { add() {}, remove() {}, toggle() {} }; this.style = { setProperty() {} }; this.children = []; }
    set innerHTML(value) { this.html = value; if (this.owner) this.owner.activeElement = null; }
    get innerHTML() { return this.html || ''; }
    setAttribute(key, value) { this.attrs[key] = value; } getAttribute(key) { return this.attrs[key] || null; }
    append(element) { this.children.push(element); } remove() {} focus() {}
  }
  class Shadow {
    constructor() { this.elements = new Map(); this.listeners = {}; }
    set innerHTML(value) { this.html = value; for (const match of value.matchAll(/\bid="([^"]+)"/g)) this.elements.set(match[1], new Element(this)); }
    get innerHTML() { return this.html; } getElementById(id) { return this.elements.get(id) || null; }
    querySelectorAll() { return []; } querySelector() { return null; } addEventListener(name, fn) { this.listeners[name] = fn; }
  }
  class HTMLElement { attachShadow() { this.shadowRoot = new Shadow(); return this.shadowRoot; } }
  const registry = new Map(), timers = new Map(), calls = []; let next = 1;
  const window = { confirm: () => true };
  const sandbox = { window, HTMLElement, customElements: { get: key => registry.get(key), define: (key, value) => registry.set(key, value) }, document: { createElement: () => new Element() }, setTimeout: (fn, ms) => { const id = next++; timers.set(id, { fn, ms }); return id; }, clearTimeout: id => timers.delete(id), console, Math };
  vm.createContext(sandbox); vm.runInContext(source, sandbox);
  const card = new window.ShelfIdleCard(); card.setConfig({ title: 'Test shelf' });
  const game = { cookies: 10000, lifetime_total: 20000, run_total: 20000, stars: 0, prestige_gain: 0, click_power: 1, cps: 1, total_clicks: 10, last_update: 100, offline_earned: 0, shelves: [{ id: 'reading', name: 'The Reading Room', unlocked: true, unlock_cost: 0, multiplier: 1, workers: { pencil: 1 }, cps: .1 }, { id: 'greenhouse', name: 'The Greenhouse', unlocked: false, unlock_cost: 5000, multiplier: 1.1, workers: {}, cps: 0 }], workers: [{ id: 'pencil', name: 'Pencil Patrol', base_cost: 15, base_cps: .1, cost: 18, owned_total: 1 }], upgrades: [], achievements: [] };
  card.transport = async (...args) => { calls.push(clone(args)); return send(...args); };
  card.state = { available: true, revision: 1, game };
  return { card, game, calls, window, timers, registry, refresh() { card.state = { available: true, revision: 1, game }; } };
}

test('idle card uses Keeper transport, preserves its cookie control and starts silent', () => {
  const b = boot(), cookie = b.card._el('cookie');
  assert.equal(b.registry.get('shelf-idle-card'), b.card.constructor);
  assert.equal(b.card._soundEnabled, false); assert.equal(b.card._el('missing').hidden, true);
  b.game.cookies = 10100; b.refresh(); assert.equal(b.card._el('cookie'), cookie);
  assert.equal(b.card._el('save-note').textContent, 'Saved on your Keeper');
});

test('rapid taps batch at fifty without inventing local credit', async () => {
  const b = boot(), before = b.game.cookies;
  for (let i = 0; i < 65; i++) b.card._queueTap();
  await b.card.flush();
  assert.deepEqual(b.calls, [['tap', { count: 50 }], ['tap', { count: 15 }]]);
  assert.equal(b.game.cookies, before); assert.equal(b.card._tapQueue, 0);
});

test('a failed pending tap prevents a following purchase and stays visible', async () => {
  const b = boot(async () => { throw Error('Connection interrupted'); }); b.card._queueTap();
  await b.card._act('buy', { worker: 'pencil', shelf: 'reading', quantity: 1 });
  assert.equal(b.calls.length, 1); assert.equal(b.calls[0][0], 'tap');
  assert.match(b.card._el('toast').textContent, /Connection interrupted/); assert.equal(b.card._busy, false);
});

test('source labels are escaped and a missing connection never claims a saved balance', () => {
  const b = boot(), title = '<img src=x onerror=alert(1)>';
  b.card.setConfig({ title }); b.game.workers[0].name = title; b.refresh();
  assert.equal(b.card._el('title').textContent, title);
  assert(!b.card._el('workers').innerHTML.includes('<img')); assert.match(b.card._el('workers').innerHTML, /&lt;img/);
  b.card.state = { available: false }; assert.equal(b.card._el('game-body').hidden, true);
  assert.match(b.card._el('missing').innerHTML, /Keeper/);
});

test('prestige requires its explicit shared-game confirmation', async () => {
  const b = boot(); b.game.prestige_gain = 2; let prompt = '';
  b.window.confirm = text => { prompt = text; return false; }; b.card._handleAction('prestige', {});
  assert.equal(b.calls.length, 0); assert.match(prompt, /clears this run/);
  b.window.confirm = () => true; b.card._handleAction('prestige', {});
  for (let i = 0; i < 8; i++) await Promise.resolve();
  assert.deepEqual(b.calls, [['prestige', { confirm: true }]]);
});

test('leaving cancels queued taps and closes audio without starting an implicit action', () => {
  const b = boot(); let closed = 0; b.card._audio = { close() { closed++; return Promise.resolve(); } };
  b.card._soundEnabled = true; b.card._queueTap(); b.card.stop();
  assert.equal(b.card._tapQueue, 0); assert.equal(b.card._tapTimer, null); assert.equal(b.card._soundEnabled, false);
  assert.equal(closed, 1); assert.equal(b.calls.length, 0);
});
