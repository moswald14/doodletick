// SPDX-License-Identifier: GPL-3.0-only
import test from 'node:test';
import assert from 'node:assert/strict';
import { createSleepUI, SLEEP_STORAGE } from '../public/sleep-ui.mjs';
import { SLEEP_DEFAULTS, SLEEP_STARTER_MUSHROOMS } from '../public/sleep-mix.mjs';

const flush = () => new Promise(resolve => setImmediate(resolve));
function deferred() { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; }
function fixture({ saved = {}, owned = async () => SLEEP_STARTER_MUSHROOMS, blocked = false } = {}) {
  const elements = new Map(), writes = [], calls = [], winEvents = new Map(), docEvents = new Map();
  function element() { const handlers = new Map(); return { value: '', textContent: '', hidden: false, disabled: false,
    children: [], dataset: {}, attributes: {}, style: { setProperty() {} }, classList: { add() {} },
    append(...items) { this.children.push(...items); }, replaceChildren(...items) { this.children = [...items]; },
    setAttribute(key, value) { this.attributes[key] = value; }, addEventListener(event, callback) { handlers.set(event, callback); },
    removeEventListener(event) { handlers.delete(event); }, fire(event) { return handlers.get(event)?.(); }, click() { return this.fire('click'); }, handlers }; }
  const root = { ...element(), innerHTML: '', querySelector(selector) { if (!elements.has(selector)) elements.set(selector, element()); return elements.get(selector); } };
  const doc = { hidden: false, createElement: element, addEventListener(k, cb) { docEvents.set(k, cb); }, removeEventListener(k) { docEvents.delete(k); } };
  const win = { localStorage: { getItem() { if (blocked) throw Error('Storage unavailable'); return JSON.stringify(saved); },
    setItem(key, value) { if (blocked) throw Error('Storage unavailable'); writes.push({key, value}); } },
    addEventListener(k, cb) { winEvents.set(k, cb); }, removeEventListener(k) { winEvents.delete(k); } };
  let engine, state, onChange, before = 0;
  const ui = createSleepUI(root, { document: doc, window: win, getOwnedMushrooms: owned, onBeforePlay: () => before++, engineFactory(options) {
    onChange = options.onChange; state = { phase: 'idle', reason: 'Ready', count: 0, remainingMs: 0 };
    engine = { state: () => ({...state}), async play(args) { calls.push({type:'play', args}); state = {phase:'playing', count:args.mushrooms.length, remainingMs:args.preferences.minutes * 60000}; onChange(state); },
      stop(reason) { calls.push({type:'stop', reason}); state = {...state, phase:'idle', reason}; onChange(state); },
      setVolume(volume) { calls.push({type:'volume', volume}); onChange(state); }, destroy() { calls.push({type:'destroy'}); } };
    return engine;
  } });
  return { ui, root, doc, winEvents, docEvents, calls, writes, field: name => root.querySelector(`[data-sleep="${name}"]`),
    before: () => before, update(change) { state = {...state, ...change}; onChange(state); } };
}

test('opening or restoring preferences stays silent and writes no identity or playing state', async () => {
  const f = fixture({saved: {...SLEEP_DEFAULTS, volume: 22, playing: true, identity:'not-a-real-key'}});
  assert.equal(f.calls.length, 0); assert.equal(f.field('volume').value, '22');
  assert.match(f.field('source').textContent, /listening only/);
  f.field('volume').value = '18'; f.field('volume').fire('input');
  assert.deepEqual(JSON.parse(f.writes.at(-1).value), {...SLEEP_DEFAULTS, volume:18});
  assert.equal(f.writes.at(-1).key, SLEEP_STORAGE);
  f.field('play').click(); await flush();
  assert.equal(f.before(), 1); assert.equal(f.calls.filter(x => x.type === 'play').length, 1);
  assert.equal(f.ui.state().phase, 'playing'); assert.equal(f.field('timer').textContent, '8h 00m');
  f.ui.destroy();
});

test('each control resolves uniquely and mushroom volume is bound to its input rather than the scene', () => {
  const f = fixture(), fields = [...f.root.innerHTML.matchAll(/data-sleep="([^"]+)"/g)].map(match => match[1]);
  assert.equal(new Set(fields).size, fields.length);
  assert.match(f.root.innerHTML, /<input[^>]+data-sleep="mushrooms"[^>]+aria-label="Mushroom voices"/);
  f.field('mushrooms').value = '20'; f.field('mushrooms').fire('input');
  assert.equal(f.ui.state().preferences.mushrooms, 20); f.ui.destroy();
});

test('background listening is intentional, but starting hidden and pagehide cannot start/resume sound', async () => {
  const f = fixture(); f.doc.hidden = true; f.field('play').click(); await flush();
  assert.equal(f.calls.filter(x => x.type === 'play').length, 0);
  f.doc.hidden = false; f.field('play').click(); await flush();
  f.doc.hidden = true; assert.equal(f.docEvents.has('visibilitychange'), false);
  assert.equal(f.ui.state().phase, 'playing');
  f.winEvents.get('pagehide')(); assert.equal(f.ui.state().phase, 'idle');
  f.ui.destroy(); f.ui.destroy(); assert.equal(f.calls.filter(x => x.type === 'destroy').length, 1);
  assert.equal(f.winEvents.size, 0);
});

test('volume adjusts the session while mix or duration changes stop it for explicit restart', async () => {
  const f = fixture(); f.field('play').click(); await flush();
  f.field('volume').value = '10'; f.field('volume').fire('input'); assert.equal(f.ui.state().phase, 'playing');
  f.update({remainingMs: 59900}); assert.equal(f.field('timer').textContent, '0h 01m');
  f.field('minutes').value = '60'; f.field('minutes').fire('change'); assert.equal(f.ui.state().phase, 'idle');
  assert.match(f.field('status').textContent, /Mix changed/); assert.equal(f.field('timer').textContent, '1h 00m');
  f.field('play').click(); await flush(); f.field('wind').value = '75'; f.field('wind').fire('input');
  assert.equal(f.ui.state().phase, 'idle'); f.ui.destroy();
});

test('stopping during an owned-garden read discards its late response', async () => {
  const gate = deferred(), f = fixture({owned: () => gate.promise}); f.field('owned').click();
  assert.equal(f.field('play').disabled, true); f.field('stop').click(); gate.resolve(SLEEP_STARTER_MUSHROOMS.slice(0, 1)); await flush();
  assert.equal(f.ui.state().source, 'starter'); assert.equal(f.ui.state().count, 3); assert.equal(f.field('play').disabled, false);
  f.ui.destroy();
});

test('vault lock clears owned recipes while an already-rendered mix continues, and cancels unfinished loads', async () => {
  const f = fixture({owned: async () => SLEEP_STARTER_MUSHROOMS.slice(0, 1)});
  f.field('owned').click(); await flush(); assert.equal(f.ui.state().source, 'owned');
  f.field('play').click(); await flush(); assert.equal(f.ui.state().phase, 'playing');
  f.ui.forgetOwned(); assert.equal(f.ui.state().source, 'starter'); assert.equal(f.ui.state().phase, 'playing');
  assert.match(f.field('source').textContent, /prepared garden is playing/);
  f.field('stop').click(); assert.match(f.field('source').textContent, /starting collection/); f.ui.destroy();
  const gate = deferred(), g = fixture({owned: () => gate.promise}); g.field('owned').click(); g.ui.forgetOwned();
  assert.equal(g.field('play').disabled, false); gate.resolve(SLEEP_STARTER_MUSHROOMS.slice(0,1)); await flush();
  assert.equal(g.ui.state().source, 'starter'); g.ui.destroy();
});

test('a vault lock during preparation cancels owned playback before audio can start', async () => {
  const f = fixture({owned: async () => SLEEP_STARTER_MUSHROOMS.slice(0,1)}); f.field('owned').click(); await flush();
  f.update({phase:'preparing'}); f.ui.forgetOwned();
  assert.equal(f.ui.state().phase, 'idle'); assert.match(f.field('status').textContent, /Vault locked/); f.ui.destroy();
});

test('file import rejects oversized or invalid recipes and ignores late reads after a preset change', async () => {
  const f = fixture(); f.field('file').files = [{size:32001, text: async () => { throw Error('Must not read'); }}];
  f.field('file').fire('change'); await flush(); assert.match(f.field('status').textContent, /smaller than/);
  f.field('file').files = [{size:4, text:async () => 'null'}]; f.field('file').fire('change'); await flush();
  assert.equal(f.ui.state().source, 'starter');
  const gate = deferred(); f.field('file').files = [{size:1000, text: () => gate.promise}]; f.field('file').fire('change');
  f.field('preset').click(); gate.resolve(JSON.stringify(SLEEP_STARTER_MUSHROOMS[0].recipe)); await flush();
  assert.equal(f.ui.state().source, 'starter'); assert.equal(f.ui.state().count, 3); f.ui.destroy();
});

test('imported names are rendered as text, and denied storage does not prevent listening', async () => {
  const f = fixture({blocked:true}), data = {...SLEEP_STARTER_MUSHROOMS[0].recipe, name:'<img src=x onerror=alert(1)>'};
  f.field('file').files = [{size:1000, text: async () => JSON.stringify(data)}]; f.field('file').fire('change'); await flush();
  assert.equal(f.ui.state().source, 'import');
  assert.equal(f.field('bed').children[0].children[1].textContent, data.name);
  assert.equal(f.field('storage').hidden, false); f.field('play').click(); await flush();
  assert.equal(f.ui.state().phase, 'playing'); f.ui.destroy();
});
