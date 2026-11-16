// SPDX-License-Identifier: GPL-3.0-only
// Original, locally synthesized motifs. No recordings, requests or account data.
export const MUSIC_MOODS = Object.freeze([
  Object.freeze({ id: 'cord', name: 'Phone cord', beat: .72, root: 48, notes: [0, 7, 12, 9, 7, 4, 2, 7, 12, 14, 9, 7, 4, 7, 2, 0] }),
  Object.freeze({ id: 'grove', name: 'Mushroom grove', beat: .9, root: 50, notes: [0, 3, 7, 10, 7, 5, 3, 7, 12, 10, 7, 3, 5, 7, 3, 0] }),
  Object.freeze({ id: 'dusk', name: 'Afterglow', beat: 1.15, root: 45, notes: [0, 7, 10, 14, 12, 7, 3, 5, 7, 12, 10, 7, 5, 3, 7, 0] }),
]);
export const MUSIC_STORAGE = 'doodletick-background-music-v1';
const DEFAULTS = Object.freeze({ mood: 'cord', volume: 25, muted: false });

export function musicPreferences(value) {
  const input = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  return {
    mood: MUSIC_MOODS.some(m => m.id === input.mood) ? input.mood : DEFAULTS.mood,
    volume: typeof input.volume === 'number' && Number.isFinite(input.volume) ? Math.round(Math.max(0, Math.min(100, input.volume))) : DEFAULTS.volume,
    muted: typeof input.muted === 'boolean' ? input.muted : DEFAULTS.muted,
  };
}

const frequency = midi => 440 * 2 ** ((midi - 69) / 12);

export function createBackgroundMusic({ preferences, onChange = () => {},
  contextFactory = () => {
    const Audio = globalThis.AudioContext || globalThis.webkitAudioContext;
    if (!Audio) throw new Error('Background music needs a browser with Web Audio.');
    return new Audio();
  }, setTimer = setTimeout, clearTimer = clearTimeout } = {}) {
  let prefs = musicPreferences(preferences), phase = 'paused', reason = 'Press Play to begin.', error = '';
  let context = null, output = null, filter = null, scheduler = null, fading = null, generation = 0, step = 0, nextNote = 0, disposed = false;
  const voices = new Set();
  const state = () => ({ ...prefs, phase, reason, error });
  const notify = () => onChange(state());
  function clearTimers() {
    if (scheduler !== null) clearTimer(scheduler);
    if (fading !== null) clearTimer(fading);
    scheduler = fading = null;
  }
  function dropVoice(voice) {
    voices.delete(voice); voice.osc.onended = null;
    try { voice.osc.stop(); } catch { /* Already ended. */ }
    try { voice.osc.disconnect(); voice.envelope.disconnect(); } catch { /* Already detached. */ }
  }
  function dropVoices() { for (const voice of [...voices]) dropVoice(voice); }
  function level(value = prefs.muted ? 0 : prefs.volume / 100 * .28, ramp = .04) {
    if (!output || !context || context.state === 'closed') return;
    const at = context.currentTime, gain = output.gain;
    // Gain changes use a short ramp; note envelopes provide their own attack/release.
    if (typeof gain.cancelAndHoldAtTime === 'function') gain.cancelAndHoldAtTime(at);
    else { gain.cancelScheduledValues(at); gain.setValueAtTime(gain.value, at); }
    gain.linearRampToValueAtTime(value, at + ramp);
  }
  function note(midi, at, duration, amplitude, wave = 'sine') {
    if (voices.size >= 12) return;
    const osc = context.createOscillator(), envelope = context.createGain(), voice = { osc, envelope };
    voices.add(voice);
    try {
      osc.type = wave; osc.frequency.setValueAtTime(frequency(midi), at);
      envelope.gain.setValueAtTime(0, at);
      envelope.gain.linearRampToValueAtTime(amplitude, at + .08);
      envelope.gain.exponentialRampToValueAtTime(.0001, at + duration);
      envelope.gain.linearRampToValueAtTime(0, at + duration + .02);
      osc.connect(envelope); envelope.connect(filter);
      osc.onended = () => dropVoice(voice);
      osc.start(at); osc.stop(at + duration + .03);
    } catch (cause) { dropVoice(voice); throw cause; }
  }
  function tick(token) {
    scheduler = null;
    if (disposed || token !== generation || phase !== 'playing') return;
    if (context?.state !== 'running') { pause('Audio was interrupted. Press Play to continue.'); return; }
    try {
      const mood = MUSIC_MOODS.find(m => m.id === prefs.mood);
      // Do not replay a backlog after a slow frame or a throttled browser.
      if (nextNote < context.currentTime - .15) nextNote = context.currentTime + .03;
      let scheduled = 0;
      while (nextNote < context.currentTime + .24 && scheduled++ < 3) {
        note(mood.root + 12 + mood.notes[step % mood.notes.length], nextNote, mood.beat * 1.6, .14, 'triangle');
        if (step % 4 === 0) note(mood.root - 12, nextNote, mood.beat * 3.8, .13);
        if (step % 8 === 0) note(mood.root + 7, nextNote, mood.beat * 5.5, .09);
        nextNote += mood.beat; step = (step + 1) % 256;
      }
      scheduler = setTimer(() => tick(token), 100);
    } catch { pause('Music paused. Press Play to try again.'); error = 'The browser could not render the music.'; notify(); }
  }
  function makeContext() {
    context = contextFactory();
    const owned = context;
    output = context.createGain(); output.gain.value = 0;
    filter = context.createBiquadFilter(); filter.type = 'lowpass'; filter.frequency.value = 1100; filter.Q.value = .45;
    filter.connect(output); output.connect(context.destination);
    context.onstatechange = () => {
      if (context === owned && phase === 'playing' && owned.state !== 'running') pause('Audio was interrupted. Press Play to continue.');
    };
  }
  async function play() {
    if (disposed || phase === 'playing' || phase === 'starting') return state();
    const token = ++generation;
    clearTimers(); dropVoices(); phase = 'starting'; error = ''; reason = 'Starting music…'; notify();
    let owned;
    try {
      if (!context || context.state === 'closed') makeContext();
      owned = context;
      // Called directly from the Play gesture. A late permission/resume response
      // can never restart audio after Pause, pagehide or destruction.
      await owned.resume();
      if (disposed || token !== generation || context !== owned) {
        if (context === owned && phase !== 'playing' && phase !== 'starting') void owned.suspend().catch(() => {});
        return state();
      }
      if (owned.state !== 'running') throw new Error('Audio is paused by the browser. Press Play to try again.');
      phase = 'playing'; reason = ''; nextNote = owned.currentTime + .04;
      output.gain.cancelScheduledValues(owned.currentTime); output.gain.setValueAtTime(0, owned.currentTime); level(undefined, .12);
      tick(token); notify();
    } catch (cause) {
      if (token !== generation || disposed) return state();
      release('Press Play to try again.'); error = cause?.message || 'Music could not start.'; notify();
    }
    return state();
  }
  function pause(message = 'Paused. Press Play to continue.') {
    if (disposed) return;
    const token = ++generation;
    clearTimers(); phase = 'paused'; reason = message; error = '';
    if (context && context.state === 'running') {
      level(0);
      fading = setTimer(() => {
        fading = null;
        if (token !== generation) return;
        dropVoices();
        if (context && context.state !== 'closed') void context.suspend().catch(() => {});
      }, 60);
    } else { dropVoices(); }
    notify();
  }
  function release(message = 'Paused. Press Play to continue.') {
    ++generation; clearTimers(); dropVoices();
    const owned = context; context = null;
    if (owned) { owned.onstatechange = null; if (owned.state !== 'closed') void owned.close().catch(() => {}); }
    try { output?.disconnect(); filter?.disconnect(); } catch { /* Graph already closed. */ }
    output = filter = null; phase = 'paused'; reason = message; error = ''; notify();
  }
  function setPreferences(change) { prefs = musicPreferences({ ...prefs, ...change }); level(phase === 'playing' ? undefined : 0); notify(); return { ...prefs }; }
  function destroy() { if (disposed) return; release(); disposed = true; }
  return { play, pause, release, setPreferences, state, destroy };
}
