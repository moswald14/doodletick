// SPDX-License-Identifier: GPL-3.0-only
import test from 'node:test';
import assert from 'node:assert/strict';
import { createBackgroundMusic, musicPreferences, MUSIC_STORAGE } from '../public/background-music.mjs';
import { createBackgroundMusicUI } from '../public/background-music-ui.mjs';

const flush = () => new Promise(resolve => setImmediate(resolve));
function deferred() { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; }
function fixture({ gated = false } = {}) {
  const contexts = [], timers = new Map(); let timerId = 0;
  const param = value => ({ value, values: [], setValueAtTime(n) { this.value = n; this.values.push(n); },
    linearRampToValueAtTime(n) { this.value = n; this.values.push(n); }, exponentialRampToValueAtTime(n) { this.value = n; this.values.push(n); }, cancelScheduledValues() {}, cancelAndHoldAtTime() {} });
  const node = () => ({ disconnected: false, connect() {}, disconnect() { this.disconnected = true; } });
  function contextFactory() {
    const gates = [], oscillators = [], gains = [];
    const context = { currentTime: 0, state: 'suspended', destination: {}, closes: 0, suspends: 0, resumes: 0, gates, oscillators, gains,
      createGain() { const result = { ...node(), gain: param(1) }; gains.push(result); return result; },
      createBiquadFilter() { return { ...node(), frequency: param(0), Q: param(0) }; },
      createOscillator() { const result = { ...node(), frequency: param(0), starts: [], stops: [], start(at) { this.starts.push(at); }, stop(at) { this.stops.push(at); } }; oscillators.push(result); return result; },
      async resume() { this.resumes++; if (gated) { const gate = deferred(); gates.push(gate); await gate.promise; } if (this.state !== 'closed') this.state = 'running'; this.onstatechange?.(); },
      async suspend() { this.suspends++; this.state = 'suspended'; this.onstatechange?.(); },
      async close() { this.closes++; this.state = 'closed'; this.onstatechange?.(); },
    };
    contexts.push(context); return context;
  }
  const engine = createBackgroundMusic({ contextFactory, setTimer(fn, delay) { const id = ++timerId; timers.set(id, { fn, delay }); return id; }, clearTimer: id => timers.delete(id) });
  function runTimer(delay) { const found = [...timers].find(([, entry]) => entry.delay === delay); assert.ok(found, `Missing ${delay}ms timer`); timers.delete(found[0]); found[1].fn(); }
  return { engine, contexts, timers, runTimer };
}

test('construction and saved play-like fields cannot start audio', () => {
  const f = fixture(); assert.equal(f.contexts.length, 0); assert.equal(f.engine.state().phase, 'paused');
  assert.deepEqual(musicPreferences({ playing: true, phase: 'playing', mood: 'dusk', volume: 200, muted: 'yes' }), { mood: 'dusk', volume: 100, muted: false });
  assert.deepEqual(musicPreferences({ mood: '<img>', volume: NaN, muted: true }), { mood: 'cord', volume: 25, muted: true });
  f.engine.destroy();
});

test('explicit play schedules a bounded graph; pause fades then suspends and disconnects voices', async () => {
  const f = fixture(); await f.engine.play(); const ctx = f.contexts[0];
  assert.equal(f.engine.state().phase, 'playing'); assert.equal(ctx.oscillators.length, 3); assert.equal(ctx.resumes, 1);
  await f.engine.play(); assert.equal(ctx.resumes, 1); assert.equal(f.contexts.length, 1);
  f.engine.pause(); assert.equal(f.engine.state().phase, 'paused'); assert.ok(![...f.timers.values()].some(t => t.delay === 100));
  f.engine.setPreferences({ volume: 100 }); // Changing a paused control cannot undo its fade.
  assert.equal(ctx.gains[0].gain.values.at(-1), 0); f.runTimer(60); await flush();
  assert.equal(ctx.state, 'suspended'); assert.ok(ctx.oscillators.every(o => o.disconnected));
  await f.engine.play(); assert.equal(f.contexts.length, 1); assert.equal(f.engine.state().phase, 'playing'); f.engine.destroy();
  assert.equal(ctx.closes, 1); assert.equal(f.timers.size, 0);
});

test('late resume cannot restart audio after pause or page release', async () => {
  const f = fixture({ gated: true }); const pending = f.engine.play(), ctx = f.contexts[0];
  f.engine.pause('Hidden'); ctx.gates[0].resolve(); await pending; await flush();
  assert.equal(f.engine.state().phase, 'paused'); assert.equal(ctx.oscillators.length, 0); assert.equal(ctx.state, 'suspended');
  const second = f.engine.play(); f.engine.release(); ctx.gates[1].resolve(); await second;
  assert.equal(ctx.state, 'closed'); assert.equal(ctx.oscillators.length, 0); assert.equal(f.timers.size, 0); f.engine.destroy();
});

test('an older pending play cannot suspend a newer explicit play', async () => {
  const f = fixture({ gated: true }); const oldPlay = f.engine.play(), ctx = f.contexts[0];
  f.engine.pause(); const newPlay = f.engine.play(); ctx.gates[1].resolve(); await newPlay;
  ctx.gates[0].resolve(); await oldPlay;
  assert.equal(f.engine.state().phase, 'playing'); assert.equal(ctx.state, 'running'); assert.equal(ctx.suspends, 0); assert.equal(f.contexts.length, 1); f.engine.destroy();
});

test('rapid pause/play clears stale suspension; interrupted browser audio waits for another gesture', async () => {
  const f = fixture(); await f.engine.play(); const ctx = f.contexts[0];
  f.engine.pause(); await f.engine.play(); assert.ok(![...f.timers.values()].some(t => t.delay === 60));
  ctx.state = 'suspended'; ctx.onstatechange(); assert.equal(f.engine.state().phase, 'paused'); assert.equal(f.timers.size, 0);
  ctx.state = 'running'; ctx.onstatechange(); assert.equal(f.engine.state().phase, 'paused'); f.engine.destroy();
});

test('long stalls skip a backlog and the voice cap bounds live nodes', async () => {
  const f = fixture(); await f.engine.play(); const ctx = f.contexts[0];
  ctx.currentTime = 1000; f.runTimer(100);
  assert.ok(ctx.oscillators.length <= 6); assert.ok(ctx.oscillators.at(-1).starts[0] >= 1000);
  for (let i = 0; i < 100; i++) { ctx.currentTime += 1; f.runTimer(100); }
  assert.ok(ctx.oscillators.length <= 12); assert.equal(f.timers.size, 1); f.engine.destroy();
});

test('mute and volume remain bounded and never create a context', async () => {
  const f = fixture(); f.engine.setPreferences({ volume: 250, muted: true, mood: 'grove' }); assert.equal(f.contexts.length, 0);
  await f.engine.play(); const gain = f.contexts[0].gains[0].gain;
  assert.equal(gain.values.at(-1), 0); f.engine.setPreferences({ muted: false }); assert.equal(gain.values.at(-1), .28);
  f.engine.setPreferences({ volume: -8 }); assert.equal(gain.values.at(-1), 0); f.engine.destroy();
});

test('audio startup failures are recoverable and dispose their context', async () => {
  const f = fixture({ gated: true }); const pending = f.engine.play(), ctx = f.contexts[0]; ctx.gates[0].reject(new Error('Audio access unavailable'));
  await pending; assert.equal(f.engine.state().phase, 'paused'); assert.match(f.engine.state().error, /unavailable/); assert.equal(ctx.closes, 1);
  const retry = f.engine.play(); const fresh = f.contexts[1]; fresh.gates[0].resolve(); await retry; assert.equal(f.engine.state().phase, 'playing'); f.engine.destroy();
});

function uiFixture(saved = {}, brokenStorage = false) {
  const fields = new Map(), docEvents = new Map(), winEvents = new Map(), savedWrites = [];
  function element() { const events = new Map(); return { value: '', hidden: false, textContent: '', attrs: {}, children: [], append(e) { this.children.push(e); }, setAttribute(k, v) { this.attrs[k] = v; }, addEventListener(n, fn) { events.set(n, fn); }, removeEventListener(n) { events.delete(n); }, fire(n) { events.get(n)?.(); }, events }; }
  const root = { classList: { add() {} }, innerHTML: '', querySelector(selector) { if (!fields.has(selector)) fields.set(selector, element()); return fields.get(selector); } };
  const doc = { hidden: false, createElement: element, addEventListener(n, fn) { docEvents.set(n, fn); }, removeEventListener(n) { docEvents.delete(n); } };
  const win = { localStorage: { getItem: () => JSON.stringify(saved), setItem(key, value) { if (brokenStorage) throw new Error('Storage full'); savedWrites.push({ key, value }); } }, addEventListener(n, fn) { winEvents.set(n, fn); }, removeEventListener(n) { winEvents.delete(n); } };
  let current, engine, plays = 0, releases = 0, destroyed = 0;
  const ui = createBackgroundMusicUI(root, { document: doc, window: win, engineFactory({ preferences, onChange }) {
    current = { ...preferences, phase: 'paused', reason: 'Press Play to begin.', error: '' };
    engine = { state: () => ({ ...current }), play() { plays++; current.phase = 'playing'; onChange(current); return Promise.resolve(current); },
      pause(reason = 'Paused') { current.phase = 'paused'; current.reason = reason; onChange(current); }, release(reason) { releases++; this.pause(reason); },
      setPreferences(change) { current = { ...current, ...musicPreferences({ ...current, ...change }) }; onChange(current); return musicPreferences(current); }, destroy() { destroyed++; } };
    return engine;
  } });
  return { ui, field: name => root.querySelector(`[data-music="${name}"]`), doc, docEvents, winEvents, savedWrites, counts: () => ({ plays, releases, destroyed }) };
}

test('UI restores only preferences, persists no playing state, and has usable mute/volume controls', () => {
  const f = uiFixture({ mood: 'dusk', volume: 37, muted: true, playing: true });
  assert.equal(f.counts().plays, 0); assert.equal(f.field('mute').textContent, 'Unmute'); assert.equal(f.field('volume').value, '37');
  f.field('play').fire('click'); assert.equal(f.counts().plays, 1); assert.match(f.field('status').textContent, /playing silently/);
  f.field('mute').fire('click'); f.field('volume').value = '42'; f.field('volume').fire('input');
  assert.equal(f.savedWrites.at(-1).key, MUSIC_STORAGE); assert.deepEqual(JSON.parse(f.savedWrites.at(-1).value), { mood: 'dusk', volume: 42, muted: false });
  f.ui.destroy();
});

test('UI hides pause audio, visibility return never resumes, and pagehide releases resources', () => {
  const f = uiFixture(); f.field('play').fire('click'); f.doc.hidden = true; f.docEvents.get('visibilitychange')();
  assert.equal(f.ui.state().phase, 'paused'); f.field('play').fire('click'); assert.equal(f.counts().plays, 1);
  f.doc.hidden = false; f.docEvents.get('visibilitychange')(); assert.equal(f.counts().plays, 1);
  f.winEvents.get('pagehide')(); assert.equal(f.counts().releases, 1); f.ui.destroy(); f.ui.destroy();
  assert.equal(f.counts().destroyed, 1); assert.equal(f.docEvents.size, 0); assert.equal(f.winEvents.size, 0); assert.equal(f.field('play').events.size, 0);
});

test('UI storage failure does not prevent playback or change preferences', () => {
  const f = uiFixture({}, true); f.field('volume').value = '12'; f.field('volume').fire('input');
  assert.equal(f.ui.state().volume, 12); assert.equal(f.field('storage').hidden, false); f.field('play').fire('click'); assert.equal(f.counts().plays, 1); f.ui.destroy();
});
