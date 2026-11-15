import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
const source = await readFile(new URL('../public/theme.mjs', import.meta.url), 'utf8');
const key = 'doodletick-theme-v1';

function boot({ at = '2026-11-13T20:59:58', raw, blocked = false } = {}) {
  let now = new Date(at).getTime(), timerId = 0;
  const timers = new Map(), stored = new Map(raw === undefined ? [] : [[key, raw]]);
  const events = () => ({ handlers: new Map(), addEventListener(name, callback) { const list = this.handlers.get(name) || []; list.push(callback); this.handlers.set(name, list); }, dispatchEvent(event) { for (const callback of this.handlers.get(event.type) || []) callback(event); } });
  const window = events(), document = Object.assign(events(), { hidden: false, documentElement: { dataset: {}, style: {} }, querySelector: () => ({ setAttribute() {} }) });
  class Clock extends Date { constructor(...args) { super(...(args.length ? args : [now])); } static now() { return now; } }
  vm.runInNewContext(source, { window, document, Date: Clock, CustomEvent: class { constructor(type) { this.type = type; } }, localStorage: { getItem: k => { if (blocked) throw new Error('Storage blocked'); return stored.get(k) ?? null; }, setItem: (k, value) => { if (blocked) throw new Error('Storage blocked'); stored.set(k, value); } }, setTimeout: (callback, ms) => { timers.set(++timerId, { callback, ms }); return timerId; }, clearTimeout: id => timers.delete(id) });
  const api = window.KeeperTheme;
  return { api, window, document, stored, timers, state: () => JSON.parse(JSON.stringify(api.getState())), at(time) { now = new Date(time).getTime(); }, tick() { const timer = [...timers.values()].at(-1); timer.callback(); } };
}

test('automatic night theme starts at 21:00, spans midnight, and ends at 07:00', () => {
  const env = boot();
  assert.equal(env.document.documentElement.dataset.theme, 'day');
  assert.equal([...env.timers.values()].at(-1).ms, 2000);
  for (const [at, expected] of [['2026-11-13T21:00:00', 'night'], ['2026-11-14T00:00:00', 'night'], ['2026-11-14T06:59:59', 'night'], ['2026-11-14T07:00:00', 'day']]) {
    env.at(at); env.tick(); assert.equal(env.state().theme, expected);
  }
  assert.equal(env.document.documentElement.style.colorScheme, 'light');
});

test('custom same-day schedules, explicit modes and restore automatic work', () => {
  const env = boot({ at: '2026-11-13T12:00:00' });
  assert.equal(env.api.setPreferences({ mode: 'auto', start: '10:00', end: '18:00' }).theme, 'night');
  env.at('2026-11-13T18:00:00'); env.tick(); assert.equal(env.state().theme, 'day');
  assert.equal(env.api.setPreferences({ mode: 'night', start: '21:00', end: '07:00' }).theme, 'night');
  env.at('2026-11-13T12:00:00'); env.tick(); assert.equal(env.state().theme, 'night');
  assert.equal(env.api.setPreferences({ mode: 'day', start: '21:00', end: '07:00' }).theme, 'day');
  env.at('2026-11-13T23:00:00'); env.tick(); assert.equal(env.state().theme, 'day');
  env.api.reset(); assert.deepEqual(env.state(), { mode: 'auto', start: '21:00', end: '07:00', theme: 'night' });
});

test('bad saved preferences fall back to automatic; invalid edits leave the existing schedule intact', () => {
  for (const raw of ['{', 'null', '42', '{"mode":"auto","start":"24:00","end":"07:00"}', '{"mode":"auto","start":"21:00","end":"21:00"}']) {
    assert.equal(boot({ raw, at: '2026-11-13T22:00:00' }).state().theme, 'night');
  }
  const env = boot();
  for (const patch of [{ mode: 'other' }, { start: '9:00' }, { start: '21:60' }, { end: '21:00' }]) {
    assert.throws(() => env.api.setPreferences({ mode: 'auto', start: '21:00', end: '07:00', ...patch }));
  }
  assert.deepEqual(env.state(), { mode: 'auto', start: '21:00', end: '07:00', theme: 'day' });
});

test('blocked storage still applies the schedule and reports temporary manual preferences honestly', () => {
  const env = boot({ blocked: true, at: '2026-11-13T23:00:00' });
  assert.equal(env.state().theme, 'night');
  const changed = env.api.setPreferences({ mode: 'day', start: '21:00', end: '07:00' });
  assert.equal(changed.persisted, false); assert.equal(changed.theme, 'day');
});

test('other-tab settings, clearing preferences and waking after a time change apply immediately', () => {
  const env = boot({ at: '2026-11-13T12:00:00' });
  env.stored.set(key, JSON.stringify({ mode: 'night', start: '22:00', end: '06:00' }));
  env.window.dispatchEvent({ type: 'storage', key }); assert.equal(env.state().theme, 'night');
  env.stored.delete(key); env.window.dispatchEvent({ type: 'storage', key: null }); assert.equal(env.state().theme, 'day');
  env.at('2026-11-13T23:00:00'); env.document.dispatchEvent({ type: 'visibilitychange' }); assert.equal(env.state().theme, 'night');
  env.window.dispatchEvent({ type: 'pagehide' }); assert.equal(env.timers.size, 0);
  env.at('2026-11-14T08:00:00'); env.window.dispatchEvent({ type: 'pageshow' }); assert.equal(env.state().theme, 'day');
  assert.equal(env.timers.size, 1);
  env.at('2026-11-14T22:00:00'); env.window.dispatchEvent({ type: 'focus' }); assert.equal(env.state().theme, 'night');
  assert.equal(env.timers.size, 1);
});
