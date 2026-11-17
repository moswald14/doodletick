// SPDX-License-Identifier: GPL-3.0-only
import { DJ_NOTES, DJ_STYLES, DJRandom, djClamp, djMakeBank } from './jazz-core.mjs';
import { createJazzNamingUI } from './jazz-name-ui.mjs';
import { djShuffleSettings } from './jazz-settings.mjs';
import { createJazzCastUI } from './jazz-cast.mjs';
import { initializeJazzRadioUI } from './jazz-radio-ui.mjs';
'use strict';
if (!await initializeJazzRadioUI()) (() => {
  const $ = id => document.getElementById(id), storageKey = 'doodle-jazz-v1';
  const defaults = { style: 'swing', tempo: 112, swing: 64, volume: 45, room: 35, piano: 82, bass: 90, drums: 68,
    muted: false, night: false, trackMutes: { piano: false, bass: false, drums: false } };
  const prefs = { ...defaults, trackMutes: { ...defaults.trackMutes } };
  try {
    const stored = JSON.parse(localStorage.getItem(storageKey));
    if (stored && typeof stored === 'object') {
      if (Object.hasOwn(DJ_STYLES, stored.style)) prefs.style = stored.style;
      for (const [id, lo, hi] of [['tempo',55,180],['swing',50,72],['volume',0,100],['room',0,100],['piano',0,100],['bass',0,100],['drums',0,100]]) {
        if (Number.isFinite(stored[id])) prefs[id] = djClamp(stored[id], lo, hi);
      }
      for (const id of ['muted', 'night']) if (typeof stored[id] === 'boolean') prefs[id] = stored[id];
      for (const id of ['piano', 'bass', 'drums']) if (typeof stored.trackMutes?.[id] === 'boolean') prefs.trackMutes[id] = stored.trackMutes[id];
    }
  } catch (_) { /* Playback also works when browser storage is unavailable. */ }
  const save = () => { try { localStorage.setItem(storageKey, JSON.stringify(prefs)); } catch (_) {} };
  let context = null, node = null, master = null, wet = null, analyser = null, bank = null;
  let state = 'idle', busy = false, sessionToken = 0, seed = freshSeed(), meterData;
  let pendingChange = false;
  let lastInfo = null;
  let pendingShuffle = null, previousSettings = null;
  const casting = createJazzCastUI({ getPlayback: () => state, getSource: () => {
    if (!context || !analyser || state !== 'playing') throw new Error('Play Jazz before casting.');
    const sourceNode = analyser, destination = context.createMediaStreamDestination();
    sourceNode.connect(destination);
    return { stream: destination.stream, release() { try { sourceNode.disconnect(destination); } catch {} } };
  } });
  const snapshots = new Map();
  const naming = createJazzNamingUI({
    getPlayback: () => ({ session: sessionToken, state, info: state === 'playing' ? lastInfo : null }),
    getSnapshot: () => new Promise((resolve, reject) => {
      if (!node || state !== 'playing') { reject(new Error('Play jazz before naming this set.')); return; }
      const id = crypto.randomUUID(), token = sessionToken;
      const timer = setTimeout(() => { snapshots.delete(id); reject(new Error('The trio is still warming up. Try again in a moment.')); }, 3000);
      snapshots.set(id, { resolve, reject, timer, token }); node.port.postMessage({ nameSnapshot: id });
    }),
    applyResult: (requestId, result, info) => node?.port.postMessage({ jazzPart: { requestId, result, targetSet: info.set, targetSeed: info.seed } })
  });
  function freshSeed() { const n = new Uint32Array(1); crypto.getRandomValues(n); return n[0] || 1; }
  function notice(text, error = false) { $('status').textContent = text; $('status').classList.toggle('error', error); }
  function paintState(next) {
    state = next;
    const playing = next === 'playing';
    document.body.classList.toggle('playing', playing);
    document.body.dataset.audioState = next;
    $('play-text').textContent = playing ? 'Pause jazz' : next === 'starting' ? 'Warming up…' : next === 'paused' ? 'Resume jazz' : 'Play jazz';
    $('play').setAttribute('aria-label', $('play-text').textContent);
    $('play-icon').innerHTML = playing ? '<path d="M5 3h3v14H5Zm7 0h3v14h-3Z"/>' : '<path d="M5 2.7L17 10 5 17.3Z"/>';
    $('play').disabled = next === 'starting';
    $('live-label').textContent = playing ? 'ON & ON' : next === 'paused' ? 'TAKING FIVE' : next === 'starting' ? 'TUNING UP' : 'TAKE A SEAT';
    if (!playing) { $('signal').value = 0; document.querySelectorAll('.beat-dots i').forEach(e => e.classList.remove('active')); }
    if ('mediaSession' in navigator) navigator.mediaSession.playbackState = playing ? 'playing' : next === 'paused' ? 'paused' : 'none';
    naming.playbackChanged();
    casting.playbackChanged();
  }
  function paintPrefs() {
    for (const id of ['volume', 'tempo', 'swing', 'room', 'piano', 'bass', 'drums']) $(id).value = prefs[id];
    for (const id of ['volume', 'swing', 'room']) $(id + '-value').textContent = prefs[id] + '%';
    $('tempo-value').textContent = prefs.tempo;
    $('tempo').setAttribute('aria-valuetext', prefs.tempo + ' beats per minute');
    document.documentElement.classList.toggle('night', prefs.night);
    $('night').setAttribute('aria-pressed', prefs.night);
    $('night').setAttribute('aria-label', prefs.night ? 'Brighten the room' : 'Dim the room');
    $('mute').setAttribute('aria-pressed', prefs.muted);
    $('mute').setAttribute('aria-label', prefs.muted ? 'Unmute jazz' : 'Mute jazz');
    document.querySelectorAll('[data-style]').forEach(e => e.setAttribute('aria-pressed', e.dataset.style === prefs.style));
    document.querySelectorAll('[data-mute]').forEach(e => {
      const role = e.dataset.mute, muted = prefs.trackMutes[role];
      e.setAttribute('aria-pressed', muted); e.setAttribute('aria-label', (muted ? 'Unmute ' : 'Mute ') + role);
      e.title = e.getAttribute('aria-label'); e.textContent = muted ? '+' : '−';
    });
    if (!context) {
      $('track-name').textContent = DJ_STYLES[prefs.style].name;
      $('track-info').textContent = 'Piano, upright bass & brushes';
      $('chord').textContent = DJ_NOTES[DJ_STYLES[prefs.style].tonic] + (prefs.style === 'bossa' ? 'm9' : prefs.style === 'blues' ? '9' : 'maj9');
    }
  }
  function sendLevels() {
    const levels = {};
    for (const role of ['piano', 'bass', 'drums']) levels[role] = prefs.trackMutes[role] ? 0 : prefs[role] / 100;
    node?.port.postMessage({ levels });
  }
  function masterVolume() {
    if (context && master) master.gain.setTargetAtTime(prefs.muted ? 0 : Math.pow(prefs.volume / 100, 1.7) * 1.25, context.currentTime, 0.025);
  }
  function composition(change) {
    node?.port.postMessage({ composition: change });
    if (node) { pendingChange = true; notice('The trio will pick up your changes on the next bar.'); }
  }
  function makeRoom(ctx) {
    const length = Math.floor(ctx.sampleRate * 1.05), impulse = ctx.createBuffer(2, length, ctx.sampleRate);
    const rng = new DJRandom(31415);
    for (let channel = 0; channel < 2; channel++) {
      const samples = impulse.getChannelData(channel); let smooth = 0;
      for (let i = 0; i < length; i++) {
        smooth += ((rng.next() * 2 - 1) - smooth) * 0.45;
        samples[i] = smooth * Math.pow(1 - i / length, 3.5) * (i < ctx.sampleRate * 0.015 ? i / (ctx.sampleRate * 0.015) : 1);
      }
    }
    const convolver = ctx.createConvolver(); convolver.buffer = impulse; return convolver;
  }
  function receive(info, token) {
    if (token !== sessionToken || !context) return;
    if (info.sceneApplied) {
      if (info.sceneApplied === pendingShuffle) {
        pendingShuffle = null; pendingChange = false;
        wet?.gain.setTargetAtTime(prefs.room / 100 * 0.45, context.currentTime, 0.05);
        notice('The trio has picked up your new settings.');
      }
      return;
    }
    if (info.nameSnapshot) {
      const pending = snapshots.get(info.nameSnapshot);
      if (pending) { clearTimeout(pending.timer); snapshots.delete(info.nameSnapshot);
        if (pending.token === sessionToken && info.context) pending.resolve(info.context);
        else pending.reject(new Error('Play jazz before naming this set.')); }
      return;
    }
    if (naming.receive(info)) return;
    lastInfo = info; naming.playbackChanged();
    if (pendingChange && info.beat === 0 && info.style === prefs.style && info.tempo === prefs.tempo && Math.abs(info.swing - prefs.swing / 100) < 0.001) {
      pendingChange = false;
      notice('The trio is finding a new way. Stay awhile.');
    }
    $('chord').textContent = info.chord;
    $('track-name').textContent = info.namedTitle || DJ_STYLES[info.style].name + ' · ' + info.key;
    $('track-info').textContent = info.phase + ' / ' + info.tempo + ' BPM';
    $('position').textContent = 'BAR ' + info.bar + '/' + info.bars + ' · CHORUS ' + info.chorus;
    const s = Math.floor(info.seconds), h = Math.floor(s / 3600);
    $('elapsed').textContent = (h ? h + ':' : '') + String(Math.floor(s / 60) % 60).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
    document.querySelectorAll('.beat-dots i').forEach((e, i) => e.classList.toggle('active', state === 'playing' && i === info.beat));
  }
  async function play() {
    if (busy || state === 'playing') return;
    busy = true;
    const token = sessionToken;
    try {
      if (context) {
        await context.resume();
        if (token !== sessionToken) return;
        if (context.state !== 'running') throw new Error('Playback was interrupted. Press Resume jazz to try again.');
        paintState('playing'); notice('Settle in. The music keeps going until you stop it.');
        return;
      }
      paintState('starting'); notice('Getting the trio together…');
      const Audio = window.AudioContext || window.webkitAudioContext;
      if (!Audio) throw new Error('Open this Keeper in a current version of Chrome or Edge.');
      const ctx = new Audio({ latencyHint: 'playback' }); context = ctx;
      // Resume directly from the Play gesture before any asynchronous preparation.
      await ctx.resume();
      if (token !== sessionToken) return;
      if (!ctx.audioWorklet) throw new Error('Audio needs a current browser over trusted HTTPS or localhost. Reopen this Keeper from its normal Web UI.');
      // Resolve within this Keeper, including Home Assistant's authenticated ingress prefix.
      await ctx.audioWorklet.addModule(new URL('./jazz-worklet.mjs', import.meta.url));
      if (token !== sessionToken) return;
      await new Promise(resolve => requestAnimationFrame(resolve));
      if (token !== sessionToken) return;
      bank ||= djMakeBank();
      node = new AudioWorkletNode(ctx, 'doodle-jazz', { numberOfInputs: 0, numberOfOutputs: 1,
        outputChannelCount: [2], processorOptions: { bank, config: { seed, style: prefs.style, tempo: prefs.tempo, swing: prefs.swing / 100 } } });
      node.port.onmessage = e => receive(e.data, token);
      node.onprocessorerror = () => { if (token === sessionToken) { stop(); notice('The trio was interrupted. Press Play jazz to start a fresh session.', true); } };
      master = ctx.createGain(); master.gain.value = 0;
      const compressor = ctx.createDynamicsCompressor();
      compressor.threshold.value = -12; compressor.knee.value = 10; compressor.ratio.value = 3;
      compressor.attack.value = 0.006; compressor.release.value = 0.18;
      analyser = ctx.createAnalyser(); analyser.fftSize = 512; meterData = new Float32Array(analyser.fftSize);
      const room = makeRoom(ctx); wet = ctx.createGain(); wet.gain.value = prefs.room / 100 * 0.45;
      const dry = ctx.createGain(); dry.gain.value = 0.92;
      node.connect(dry).connect(master); node.connect(room).connect(wet).connect(master);
      master.connect(compressor).connect(analyser).connect(ctx.destination);
      sendLevels(); masterVolume();
      ctx.onstatechange = () => {
        if (token !== sessionToken || ctx !== context) return;
        if (state === 'playing' && ctx.state !== 'running') {
          paintState('paused');
          notice('Playback paused. Press Resume jazz when you are ready.');
        }
      };
      if ('mediaSession' in navigator) {
        if ('MediaMetadata' in window) navigator.mediaSession.metadata = new MediaMetadata({ title: 'Doodle Jazz', artist: 'Doodleverse', album: 'The everlasting trio' });
      }
      paintState('playing'); notice('Settle in. The music keeps going until you stop it.');
    } catch (error) {
      if (token === sessionToken) { stop(); notice(error.message || 'Could not start playback. Reopen this Keeper in Chrome or Edge, then press Play.', true); }
    } finally { busy = false; }
  }
  async function pause() {
    if (busy || !context || state !== 'playing') return;
    busy = true;
    try {
      const ctx = context; await ctx.suspend();
      if (ctx === context) { paintState('paused'); notice('Taking five. Resume whenever you like.'); }
    } catch (_) { notice('Could not pause. Use Stop to end this session.', true); }
    finally { busy = false; }
  }
  function stop() {
    sessionToken++;
    void casting.stop(); pendingShuffle = null;
    lastInfo = null;
    for (const pending of snapshots.values()) { clearTimeout(pending.timer); pending.reject(new Error('The session stopped. Play jazz and try again.')); }
    snapshots.clear();
    const old = context;
    if (node) { node.port.onmessage = null; node.port.close(); node.disconnect(); }
    context = node = master = wet = analyser = null;
    pendingChange = false;
    if (old && old.state !== 'closed') { old.onstatechange = null; old.close().catch(() => {}); }
    paintState('idle'); paintPrefs(); $('elapsed').textContent = '00:00'; $('position').textContent = 'THE ROOM IS YOURS';
    notice('The room is quiet. Come back anytime.');
  }
  $('play').addEventListener('click', () => state === 'playing' ? pause() : play());
  $('stop').addEventListener('click', stop);
  function newSet() {
    seed = freshSeed();
    if (node) composition({ newSet: true, seed });
    else notice('A fresh improvisation is ready. Press Play jazz.');
  }
  $('new-set').addEventListener('click', newSet);
  const musicalSettings = () => Object.fromEntries(['style', 'tempo', 'swing', 'room', 'piano', 'bass', 'drums'].map(key => [key, prefs[key]]));
  function applySettings(settings, label) {
    for (const key of ['style', 'tempo', 'swing', 'room', 'piano', 'bass', 'drums']) prefs[key] = settings[key];
    paintPrefs(); save(); $('shuffle-info').textContent = label + ' · ' + prefs.tempo + ' BPM';
    if (node) {
      const levels = Object.fromEntries(['piano', 'bass', 'drums'].map(role => [role, prefs.trackMutes[role] ? 0 : prefs[role] / 100]));
      pendingShuffle = crypto.randomUUID(); pendingChange = true;
      node.port.postMessage({ scene: { id: pendingShuffle, composition: { style: prefs.style, tempo: prefs.tempo, swing: prefs.swing / 100 }, levels } });
      notice(label + ' will join on the next bar.');
    } else notice(label + ' is ready. Press Play jazz.');
  }
  $('shuffle-settings').addEventListener('click', () => {
    previousSettings = musicalSettings();
    const shuffled = djShuffleSettings(prefs, freshSeed()); applySettings(shuffled, shuffled.label);
    $('undo-shuffle').hidden = false;
  });
  $('undo-shuffle').addEventListener('click', () => {
    if (!previousSettings) return;
    applySettings(previousSettings, 'Your previous settings'); previousSettings = null; $('undo-shuffle').hidden = true;
  });
  $('mute').addEventListener('click', () => { prefs.muted = !prefs.muted; masterVolume(); paintPrefs(); save(); });
  $('night').addEventListener('click', () => { prefs.night = !prefs.night; paintPrefs(); save(); });
  for (const id of ['volume', 'tempo', 'swing', 'room', 'piano', 'bass', 'drums']) $(id).addEventListener('input', () => {
    prefs[id] = Number($(id).value); paintPrefs(); save();
    if (id === 'volume') masterVolume();
    else if (id === 'room' && context) wet?.gain.setTargetAtTime(prefs.room / 100 * 0.45, context.currentTime, 0.05);
    else if (id === 'tempo') composition({ tempo: prefs.tempo });
    else if (id === 'swing') composition({ swing: prefs.swing / 100 });
    else sendLevels();
  });
  document.querySelectorAll('[data-style]').forEach(button => button.addEventListener('click', () => {
    prefs.style = button.dataset.style;
    prefs.tempo = DJ_STYLES[prefs.style].tempo; prefs.swing = Math.round(DJ_STYLES[prefs.style].swing * 100);
    paintPrefs(); save(); composition({ style: prefs.style, tempo: prefs.tempo, swing: prefs.swing / 100 });
    if (!node) notice(DJ_STYLES[prefs.style].name + ' is ready. Press Play jazz.');
  }));
  document.querySelectorAll('[data-mute]').forEach(button => button.addEventListener('click', () => {
    const role = button.dataset.mute; prefs.trackMutes[role] = !prefs.trackMutes[role];
    sendLevels(); paintPrefs(); save();
  }));
  window.addEventListener('keydown', event => {
    if (event.altKey || event.ctrlKey || event.metaKey || event.repeat || /INPUT|TEXTAREA|SELECT|BUTTON|SUMMARY/.test(event.target.tagName) || event.target.isContentEditable) return;
    if (event.code === 'Space') { event.preventDefault(); state === 'playing' ? pause() : play(); }
    else if (event.key.toLowerCase() === 'm') $('mute').click();
    else if (event.key.toLowerCase() === 'n') newSet();
  });
  if ('mediaSession' in navigator) for (const [action, handler] of [['play', play], ['pause', pause], ['stop', stop], ['nexttrack', newSet]]) {
    try { navigator.mediaSession.setActionHandler(action, handler); } catch (_) {}
  }
  window.addEventListener('pagehide', () => { naming.dispose(); stop(); });
  window.addEventListener('pageshow', event => { if (event.persisted) naming.resume(); });
  function meterTick() {
    if (state === 'playing' && analyser && !document.hidden) {
      analyser.getFloatTimeDomainData(meterData);
      let square = 0; for (const sample of meterData) square += sample * sample;
      const rms = Math.sqrt(square / meterData.length);
      $('signal').value = Math.min(1, rms * 9);
      $('signal').setAttribute('aria-valuetext', rms < 0.00001 ? 'Quiet' : Math.round(20 * Math.log10(rms)) + ' decibels');
    }
    requestAnimationFrame(meterTick);
  }
  let path = '';
  for (let i = 0; i <= 2400; i++) {
    const t = i / 2400 * Math.PI * 14;
    const x = 200 + 109 * Math.cos(t) + 35 * Math.cos(23 / 7 * t);
    const y = 200 + 109 * Math.sin(t) - 35 * Math.sin(23 / 7 * t);
    path += (i ? 'L' : 'M') + x.toFixed(2) + ',' + y.toFixed(2);
  }
  $('spirograph').setAttribute('d', path);
  paintPrefs(); paintState('idle'); requestAnimationFrame(meterTick);
})();
