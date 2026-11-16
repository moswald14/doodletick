// SPDX-License-Identifier: GPL-3.0-only
import { sleepPreferences, sleepRecipes, SLEEP_RATE, SLEEP_SECONDS } from './sleep-mix.mjs';

const defaultContext = () => {
  const Audio = globalThis.AudioContext || globalThis.webkitAudioContext;
  if (!Audio) throw new Error('Sleep listening needs a browser with Web Audio.');
  return new Audio();
};
const defaultWorker = () => {
  if (!globalThis.Worker) throw new Error('Sleep listening needs browser worker support.');
  return new Worker(new URL('./sleep-worker.mjs', import.meta.url), { type: 'module' });
};

/**
 * One explicit listening session. Generation is bounded and off the UI thread;
 * AudioContext.currentTime owns all audible timing, not setInterval or Date.now.
 * The occasional JS timer only updates the label and detects interruptions.
 * Nothing is persisted, automatically resumed or connected to a coin ledger.
 */
export function createSleepAudio({ contextFactory = defaultContext, workerFactory = defaultWorker,
  monotonicNow = () => performance.now(), setTimer = setTimeout, clearTimer = clearTimeout,
  onChange = () => {} } = {}) {
  let phase = 'idle', reason = 'Press Listen to begin.', error = '', count = 0, progress = 0;
  let preferences = sleepPreferences(), context = null, source = null, output = null, envelope = null, worker = null;
  let generation = 0, timer = null, preparationTimer = null, closingTimers = new Set(), started = 0, ends = 0, elapsedStarted = 0, disposed = false;
  let settlePreparation = null;
  const state = () => ({ phase, reason, error, count, progress, volume: preferences.volume,
    remainingMs: phase === 'playing' && context ? Math.max(0, Math.round((ends - context.currentTime) * 1000)) : 0 });
  const notify = () => onChange(state());
  const clear = () => { if (timer !== null) clearTimer(timer); if (preparationTimer !== null) clearTimer(preparationTimer); timer = preparationTimer = null; };
  function stopWorker() {
    if (worker) { worker.onmessage = worker.onerror = null; worker.terminate(); worker = null; }
    const settle = settlePreparation; settlePreparation = null; settle?.(null);
  }
  function closeGraph(ctx, src, nodes) {
    if (!ctx) return;
    src && (src.onended = null);
    try { src?.stop(); } catch { /* Already stopped. */ }
    try { src?.disconnect(); for (const node of nodes) node?.disconnect(); } catch { /* Already closed. */ }
    ctx.onstatechange = null;
    if (ctx.state !== 'closed') void ctx.close().catch(() => {});
  }
  function release(message, fade = true) {
    generation++; clear(); stopWorker();
    const ctx = context, src = source, gain = output, nodes = [output, envelope];
    context = source = output = envelope = null; started = ends = elapsedStarted = 0;
    phase = 'idle'; reason = message; error = ''; progress = 0;
    if (ctx) {
      ctx.onstatechange = null; if (src) src.onended = null;
      if (fade && gain && ctx.state === 'running') {
        const at = ctx.currentTime;
        try {
          if (typeof gain.gain.cancelAndHoldAtTime === 'function') gain.gain.cancelAndHoldAtTime(at);
          else { gain.gain.cancelScheduledValues(at); gain.gain.setValueAtTime(gain.gain.value, at); }
          gain.gain.linearRampToValueAtTime(0, at + .1); src?.stop(at + .12);
        } catch { /* Closing below still stops playback. */ }
        const token = setTimer(() => { closingTimers.delete(token); closeGraph(ctx, src, nodes); }, 160);
        closingTimers.add(token);
      } else closeGraph(ctx, src, nodes);
    }
    notify();
  }
  function stop(message = 'The garden is quiet. Press Listen when you are ready.') { if (!disposed) release(message); }
  function observe(token) {
    timer = null;
    if (disposed || token !== generation || phase !== 'playing' || !context) return;
    if (context.state !== 'running') { release('Audio was interrupted. Press Listen to start again.', false); return; }
    const remaining = ends - context.currentTime;
    if (remaining <= 0) { release('Sleep timer finished.', false); return; }
    // A frozen audio clock followed by an OS/browser wake must not silently
    // extend a bedtime session. This is elapsed time, independent of UTC edits.
    const elapsed = (monotonicNow() - elapsedStarted) / 1000;
    if (!Number.isFinite(elapsed) || elapsed < 0 || Math.abs(elapsed - (context.currentTime - started)) > 5) {
      release('Playback was interrupted. Press Listen to start a fresh timer.', false); return;
    }
    notify(); timer = setTimer(() => observe(token), Math.min(1000, remaining * 1000));
  }
  function makeMix(voices, prefs, token) {
    return new Promise((resolve, reject) => {
      const job = workerFactory(); worker = job; settlePreparation = resolve;
      const finish = (result, cause) => {
        if (worker !== job || generation !== token) return;
        worker = null; settlePreparation = null; job.onmessage = job.onerror = null; job.terminate();
        if (preparationTimer !== null) clearTimer(preparationTimer); preparationTimer = null;
        cause ? reject(cause) : resolve(result);
      };
      preparationTimer = setTimer(() => finish(null, new Error('The sound mix took too long. Try fewer mushroom voices.')), 60000);
      job.onmessage = ({ data }) => {
        if (worker !== job || token !== generation) return;
        if (data?.type === 'progress' && Number.isInteger(data.completed) && data.completed >= 0 && data.completed <= voices.length) {
          progress = data.completed; notify(); return;
        }
        if (data?.type !== 'ready') { finish(null, new Error('The sound mix could not be prepared. Press Listen to try again.')); return; }
        const channels = data.channels;
        if (data.rate !== SLEEP_RATE || data.count !== voices.length || !Array.isArray(channels) || channels.length !== 2
          || channels.some(channel => !(channel instanceof Float32Array) || channel.length !== SLEEP_RATE * SLEEP_SECONDS - 2400
            || channel.some(value => !Number.isFinite(value) || Math.abs(value) > .55001))) {
          finish(null, new Error('The sound mix did not validate. Press Listen to try again.')); return;
        }
        finish(data);
      };
      job.onerror = () => finish(null, new Error('The sound worker stopped. Press Listen to try again.'));
      try { job.postMessage({ mushrooms: voices, preferences: prefs }); }
      catch { finish(null, new Error('The sound mix could not be prepared. Press Listen to try again.')); }
    });
  }
  async function play({ mushrooms = [], preferences: raw } = {}) {
    if (disposed || phase === 'preparing' || phase === 'playing') return state();
    const token = ++generation; clear(); phase = 'preparing'; reason = 'Softening your mushroom voices…'; error = ''; progress = 0; notify();
    let ctx;
    try {
      const voices = sleepRecipes(mushrooms); count = voices.length; preferences = sleepPreferences(raw);
      // Create and resume synchronously inside the user's Listen gesture, before
      // awaiting worker output. A late result cannot revive a stopped session.
      ctx = contextFactory(); context = ctx;
      await ctx.resume();
      if (disposed || token !== generation || context !== ctx) { closeGraph(ctx, null, []); return state(); }
      if (ctx.state !== 'running') throw new Error('Audio is paused by the browser. Press Listen to try again.');
      ctx.onstatechange = () => {
        if (context === ctx && (phase === 'preparing' || phase === 'playing') && ctx.state !== 'running') release('Audio was interrupted. Press Listen to start again.', false);
      };
      const mix = await makeMix(voices, preferences, token);
      if (!mix || disposed || token !== generation || context !== ctx) return state();
      if (ctx.state !== 'running') throw new Error('Audio is paused by the browser. Press Listen to try again.');
      const buffer = ctx.createBuffer(2, mix.channels[0].length, mix.rate);
      mix.channels.forEach((channel, index) => buffer.copyToChannel(channel, index));
      source = ctx.createBufferSource(); source.buffer = buffer; source.loop = true;
      envelope = ctx.createGain(); output = ctx.createGain();
      source.connect(envelope); envelope.connect(output); output.connect(ctx.destination);
      started = ctx.currentTime + .04; ends = started + preferences.minutes * 60; elapsedStarted = monotonicNow() + 40;
      // A separate envelope prevents later volume changes from cancelling the
      // sleep fade or its deadline. Both fade and source stop run on audio time,
      // even if the browser delays JavaScript callbacks in a hidden tab.
      envelope.gain.setValueAtTime(0, ctx.currentTime);
      envelope.gain.linearRampToValueAtTime(1, started + 2);
      envelope.gain.setValueAtTime(1, ends - 60);
      envelope.gain.linearRampToValueAtTime(0, ends);
      output.gain.setValueAtTime(preferences.volume / 100 * .65, ctx.currentTime);
      const ownedSource = source;
      source.onended = () => { if (token === generation && source === ownedSource) release('Sleep timer finished.', false); };
      source.start(started); source.stop(ends);
      phase = 'playing'; reason = 'Listening. The final minute fades to silence.'; notify();
      timer = setTimer(() => observe(token), 1000);
    } catch (cause) {
      if (disposed || token !== generation) return state();
      release('Press Listen to try again.', false); error = cause?.message || 'Sleep listening could not start.'; notify();
    }
    return state();
  }
  function setVolume(value) {
    preferences = sleepPreferences({ ...preferences, volume: value });
    if (phase === 'playing' && output && context?.state === 'running') {
      const at = context.currentTime, gain = output.gain;
      if (typeof gain.cancelAndHoldAtTime === 'function') gain.cancelAndHoldAtTime(at);
      else { gain.cancelScheduledValues(at); gain.setValueAtTime(gain.value, at); }
      gain.linearRampToValueAtTime(preferences.volume / 100 * .65, at + .15);
    }
    notify(); return preferences.volume;
  }
  function destroy() {
    if (disposed) return;
    release('The garden is quiet.', false); disposed = true;
    // The closing callbacks own only already-muted old graphs. Keep them alive
    // until they close; clearing them would leak contexts during rapid restarts.
  }
  return { play, stop, setVolume, state, destroy };
}
