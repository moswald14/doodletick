// SPDX-License-Identifier: GPL-3.0-only
import test from 'node:test';
import assert from 'node:assert/strict';
import { createSleepAudio } from '../public/sleep-audio.mjs';
import { SLEEP_RATE, SLEEP_SECONDS, SLEEP_STARTER_MUSHROOMS } from '../public/sleep-mix.mjs';

const flush = () => new Promise(resolve => setImmediate(resolve));
function gate() { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; }
function fixture({ gated = false, failWorker = false } = {}) {
  const contexts = [], workers = [], timers = new Map(), changes = []; let nextTimer = 0, elapsed = 0;
  const node = () => ({ disconnected: false, connections: [], connect(other) { this.connections.push(other); }, disconnect() { this.disconnected = true; } });
  function parameter() { return { value: 0, events: [], setValueAtTime(value, at) { this.value = value; this.events.push(['set', value, at]); },
    linearRampToValueAtTime(value, at) { this.value = value; this.events.push(['ramp', value, at]); },
    cancelScheduledValues(at) { this.events.push(['cancel', at]); }, cancelAndHoldAtTime(at) { this.events.push(['hold', at]); } }; }
  function contextFactory() {
    const ctx = { currentTime: 0, state: 'suspended', destination: {}, gains: [], sources: [], gates: [], closes: 0,
      createGain() { const gain = { ...node(), gain: parameter() }; this.gains.push(gain); return gain; },
      createBuffer(channels, length, rate) { return { channels, length, rate, copies: [], copyToChannel(data, index) { this.copies.push([data.length, index]); } }; },
      createBufferSource() { const source = { ...node(), starts: [], stops: [], start(at) { this.starts.push(at); }, stop(at) { this.stops.push(at); } }; this.sources.push(source); return source; },
      async resume() { if (gated) { const pending = gate(); this.gates.push(pending); await pending.promise; } if (this.state !== 'closed') this.state = 'running'; this.onstatechange?.(); },
      async close() { this.closes++; this.state = 'closed'; this.onstatechange?.(); },
    }; contexts.push(ctx); return ctx;
  }
  function workerFactory() {
    if (failWorker) throw Error('Workers unavailable');
    const worker = { terminated: false, posts: [], postMessage(data) { this.posts.push(data); }, terminate() { this.terminated = true; } };
    workers.push(worker); return worker;
  }
  const engine = createSleepAudio({ contextFactory, workerFactory, monotonicNow: () => elapsed,
    setTimer(fn, delay) { const id = ++nextTimer; timers.set(id, { fn, delay }); return id; }, clearTimer: id => timers.delete(id), onChange: value => changes.push(value) });
  function run(delay) {
    const entry = [...timers].find(([, value]) => value.delay === delay); assert.ok(entry, `Missing ${delay}ms timer`);
    timers.delete(entry[0]); entry[1].fn();
  }
  function ready(worker = workers.at(-1), overrides = {}) {
    worker.onmessage?.({ data: { type: 'ready', rate: SLEEP_RATE, count: worker.posts[0].mushrooms.length,
      channels: [new Float32Array(SLEEP_RATE * SLEEP_SECONDS - 2400), new Float32Array(SLEEP_RATE * SLEEP_SECONDS - 2400)], ...overrides } });
  }
  async function play(options = {}) { const pending = engine.play({ mushrooms: SLEEP_STARTER_MUSHROOMS, ...options }); await flush(); ready(); await pending; return contexts.at(-1); }
  function advance(seconds) { elapsed += seconds * 1000; contexts.at(-1).currentTime += seconds; }
  return { engine, contexts, workers, timers, changes, run, ready, play, advance, setElapsed: value => { elapsed = value; } };
}

test('constructing or changing volume does not start a session or create audio nodes', () => {
  const f = fixture(); assert.equal(f.engine.state().phase, 'idle'); f.engine.setVolume(90);
  assert.equal(f.contexts.length, 0); assert.equal(f.workers.length, 0); assert.equal(f.timers.size, 0);
  f.engine.destroy(); f.engine.play(); assert.equal(f.contexts.length, 0);
});

test('Listen prepares a worker mix and schedules the full timer on audio time', async () => {
  const f = fixture(), ctx = await f.play();
  assert.equal(f.engine.state().phase, 'playing'); assert.equal(f.engine.state().count, 3);
  assert.equal(f.workers[0].terminated, true); assert.equal(ctx.sources.length, 1);
  const source = ctx.sources[0], fade = ctx.gains[0].gain, output = ctx.gains[1].gain;
  assert.equal(source.loop, true); assert.deepEqual(source.starts, [.04]); assert.deepEqual(source.stops, [28800.04]);
  assert.deepEqual(fade.events.at(-2), ['set', 1, 28740.04]); assert.deepEqual(fade.events.at(-1), ['ramp', 0, 28800.04]);
  assert.deepEqual(output.events[0], ['set', .0975, 0]);
  assert.equal(f.timers.size, 1); assert.ok([...f.timers.values()].every(timer => timer.delay === 1000));
  await f.engine.play(); assert.equal(f.contexts.length, 1); f.engine.destroy();
});

test('volume changes cannot erase or move the scheduled sleep fade and deadline', async () => {
  const f = fixture(), ctx = await f.play({ preferences: { minutes: 30 } });
  const envelope = structuredClone(ctx.gains[0].gain.events), deadline = [...ctx.sources[0].stops];
  f.advance(1770); f.engine.setVolume(100); f.run(1000);
  assert.deepEqual(ctx.gains[0].gain.events, envelope); assert.deepEqual(ctx.sources[0].stops, deadline);
  assert.equal(f.engine.state().phase, 'playing'); assert.ok(f.engine.state().remainingMs <= 30040);
  f.engine.setVolume(-9); assert.equal(ctx.gains[1].gain.events.at(-1)[1], 0); f.engine.destroy();
});

test('a delayed UI callback does not replay sound or extend the timer', async () => {
  const f = fixture(), ctx = await f.play({ preferences: { minutes: 15 } });
  f.advance(600); f.run(1000); assert.equal(f.engine.state().phase, 'playing'); assert.equal(ctx.sources.length, 1);
  assert.deepEqual(ctx.sources[0].stops, [900.04]); assert.ok(f.engine.state().remainingMs <= 300040);
  f.advance(301); f.run(1000); assert.equal(f.engine.state().phase, 'idle'); assert.match(f.engine.state().reason, /finished/);
  assert.equal(ctx.state, 'closed'); assert.equal(f.timers.size, 0); f.engine.destroy();
});

test('audio source completion stops even before JavaScript status callbacks run', async () => {
  const f = fixture(), ctx = await f.play(); ctx.currentTime = 28800.04;
  ctx.sources[0].onended(); assert.equal(f.engine.state().phase, 'idle'); assert.match(f.engine.state().reason, /finished/);
  assert.equal(ctx.state, 'closed'); assert.equal(f.timers.size, 0);
});

test('Stop during worker generation cancels the promise and a saved late callback cannot play', async () => {
  const f = fixture(), pending = f.engine.play({ mushrooms: SLEEP_STARTER_MUSHROOMS }); await flush();
  const old = f.workers[0], late = old.onmessage; f.engine.stop(); await pending;
  late({ data: { type: 'ready' } }); assert.equal(f.engine.state().phase, 'idle');
  assert.equal(old.terminated, true); assert.equal(f.contexts[0].sources.length, 0); assert.equal(f.contexts[0].state, 'closed');
  assert.equal(f.timers.size, 0); f.engine.destroy();
});

test('Stop during a pending resume cannot revive playback or suppress a newer session', async () => {
  const f = fixture({ gated: true }), first = f.engine.play({ mushrooms: [] }), old = f.contexts[0];
  f.engine.stop(); const next = f.engine.play({ mushrooms: [] }), current = f.contexts[1];
  current.gates[0].resolve(); await flush(); f.ready(); await next;
  old.gates[0].resolve(); await first;
  assert.equal(old.state, 'closed'); assert.equal(current.state, 'running'); assert.equal(f.engine.state().phase, 'playing');
  assert.equal(old.sources.length, 0); assert.equal(current.sources.length, 1); f.engine.destroy();
});

test('normal Stop uses a short audio fade and terminates the old graph', async () => {
  const f = fixture(), ctx = await f.play(); f.engine.stop();
  assert.equal(f.engine.state().phase, 'idle'); assert.deepEqual(ctx.gains[1].gain.events.at(-1), ['ramp', 0, .1]);
  assert.equal(ctx.sources[0].stops.at(-1), .12); assert.equal(ctx.sources[0].onended, null);
  f.run(160); assert.equal(ctx.state, 'closed'); assert.equal(f.timers.size, 0); f.engine.destroy();
});

test('browser interruption requires another explicit Listen and never auto-resumes', async () => {
  const f = fixture(), ctx = await f.play(); ctx.state = 'interrupted'; ctx.onstatechange();
  assert.equal(f.engine.state().phase, 'idle'); assert.match(f.engine.state().reason, /interrupted/); assert.equal(ctx.state, 'closed');
  ctx.state = 'running'; ctx.onstatechange?.(); assert.equal(f.engine.state().phase, 'idle'); assert.equal(f.timers.size, 0);
  const next = await f.play(); assert.notEqual(ctx, next); assert.equal(f.engine.state().phase, 'playing'); f.engine.destroy();
});

test('sleep/wake elapsed-clock divergence stops instead of extending the session', async () => {
  const f = fixture(), ctx = await f.play(); f.setElapsed(60000); f.run(1000);
  assert.equal(f.engine.state().phase, 'idle'); assert.match(f.engine.state().reason, /fresh timer/); assert.equal(ctx.state, 'closed');
  assert.equal(f.timers.size, 0); f.engine.destroy();
});

test('worker errors, malformed samples and timed-out preparation close the audio context', async () => {
  for (const failure of ['error', 'samples', 'timeout']) {
    const f = fixture(), pending = f.engine.play({ mushrooms: [] }); await flush();
    const worker = f.workers[0];
    if (failure === 'error') worker.onerror();
    else if (failure === 'samples') f.ready(worker, { channels: [new Float32Array([Infinity]), new Float32Array([0])] });
    else f.run(60000);
    await pending; assert.equal(f.engine.state().phase, 'idle'); assert.ok(f.engine.state().error);
    assert.equal(f.contexts[0].state, 'closed'); assert.equal(worker.terminated, true); assert.equal(f.timers.size, 0); f.engine.destroy();
  }
});

test('unsupported workers and rejected AudioContext resume fail without leaked playback', async () => {
  const missing = fixture({ failWorker: true }); await missing.engine.play();
  assert.equal(missing.engine.state().phase, 'idle'); assert.match(missing.engine.state().error, /Workers/);
  assert.equal(missing.contexts[0].state, 'closed'); missing.engine.destroy();
  const f = fixture({ gated: true }), pending = f.engine.play(); f.contexts[0].gates[0].reject(Error('Audio blocked')); await pending;
  assert.equal(f.engine.state().phase, 'idle'); assert.equal(f.contexts[0].state, 'closed'); assert.equal(f.workers.length, 0); f.engine.destroy();
});

test('Destroy while generating cancels work and repeated destroy/play remains silent', async () => {
  const f = fixture(), pending = f.engine.play(); await flush(); f.engine.destroy(); await pending; f.engine.destroy(); await f.engine.play();
  assert.equal(f.workers[0].terminated, true); assert.equal(f.contexts[0].state, 'closed'); assert.equal(f.contexts[0].sources.length, 0);
  assert.equal(f.contexts.length, 1); assert.equal(f.timers.size, 0);
});
