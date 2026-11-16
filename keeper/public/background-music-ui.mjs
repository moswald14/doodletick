// SPDX-License-Identifier: GPL-3.0-only
import { createBackgroundMusic, musicPreferences, MUSIC_MOODS, MUSIC_STORAGE } from './background-music.mjs';

export function createBackgroundMusicUI(root, { engineFactory = createBackgroundMusic, document: doc = globalThis.document, window: win = globalThis.window, onChange = () => {}, onBeforePlay = () => {} } = {}) {
  let storage = null, saved = null, storageOK = true, destroyed = false;
  try { storage = win.localStorage; saved = JSON.parse(storage.getItem(MUSIC_STORAGE)); } catch { storageOK = false; }
  root.classList.add('background-music');
  root.innerHTML = `<div class="music-heading"><span class="section-kicker">A LITTLE ATMOSPHERE</span><h2>Background music <span aria-hidden="true">♫</span></h2></div>
    <div class="music-controls"><button class="button quiet" type="button" data-music="play">Play music</button>
    <button class="button quiet" type="button" data-music="mute" aria-pressed="false">Mute</button>
    <label>Soundscape<select data-music="mood" aria-label="Music soundscape"></select></label>
    <label class="music-volume">Volume <output data-music="volume-label">25%</output><input data-music="volume" aria-label="Music volume" type="range" min="0" max="100" step="1" value="25"></label></div>
    <p class="music-status" data-music="status" role="status">Press Play to begin.</p>
    <p class="music-note">Original ambient loops made on this device. Music continues between Doodle Tick pages and pauses when this browser tab is hidden. Press Play to resume.</p>
    <p class="music-note" data-music="storage" hidden>Settings apply for this visit; browser storage is unavailable.</p>`;
  const el = name => root.querySelector(`[data-music="${name}"]`);
  for (const mood of MUSIC_MOODS) { const option = doc.createElement('option'); option.value = mood.id; option.textContent = mood.name; el('mood').append(option); }
  function render(state) {
    if (destroyed) return;
    const playing = state.phase === 'playing', starting = state.phase === 'starting';
    el('play').textContent = playing || starting ? 'Pause music' : 'Play music';
    el('play').setAttribute('aria-pressed', String(playing || starting));
    el('mute').textContent = state.muted ? 'Unmute' : 'Mute'; el('mute').setAttribute('aria-pressed', String(state.muted));
    el('mood').value = state.mood; el('volume').value = String(state.volume); el('volume-label').textContent = state.volume + '%';
    el('status').textContent = state.error || (playing ? `${MUSIC_MOODS.find(m => m.id === state.mood).name} · ${state.muted || state.volume === 0 ? 'playing silently' : 'playing'}` : state.reason);
    el('storage').hidden = storageOK;
    onChange(state);
  }
  const engine = engineFactory({ preferences: musicPreferences(saved), onChange: render });
  function save(change) {
    const prefs = engine.setPreferences(change);
    try { if (!storage) throw new Error(); storage.setItem(MUSIC_STORAGE, JSON.stringify(prefs)); storageOK = true; } catch { storageOK = false; }
    render(engine.state());
  }
  function togglePlay() {
    if (doc.hidden) { engine.pause('Tab is hidden. Press Play when you return.'); return; }
    if (['playing', 'starting'].includes(engine.state().phase)) engine.pause(); else { onBeforePlay(); void engine.play(); }
  }
  const mute = () => save({ muted: !engine.state().muted });
  const volume = () => save({ volume: Number(el('volume').value) });
  const mood = () => save({ mood: el('mood').value });
  const visibility = () => { if (doc.hidden) engine.pause('Paused while this tab was hidden. Press Play to continue.'); };
  const pagehide = () => engine.release('Paused after leaving this page. Press Play to continue.');
  el('play').addEventListener('click', togglePlay); el('mute').addEventListener('click', mute);
  el('volume').addEventListener('input', volume); el('mood').addEventListener('change', mood);
  doc.addEventListener('visibilitychange', visibility); win.addEventListener('pagehide', pagehide);
  render(engine.state());
  return {
    state: engine.state,
    pause: engine.pause,
    destroy() {
      if (destroyed) return; destroyed = true; engine.destroy();
      el('play').removeEventListener('click', togglePlay); el('mute').removeEventListener('click', mute);
      el('volume').removeEventListener('input', volume); el('mood').removeEventListener('change', mood);
      doc.removeEventListener('visibilitychange', visibility); win.removeEventListener('pagehide', pagehide);
    },
  };
}
