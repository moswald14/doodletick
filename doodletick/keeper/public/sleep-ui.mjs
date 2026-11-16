// SPDX-License-Identifier: GPL-3.0-only
import { createSleepAudio } from './sleep-audio.mjs';
import { SLEEP_DEFAULTS, sleepPreferences, SLEEP_STARTER_MUSHROOMS } from './sleep-mix.mjs';
import { recipe } from './mushroom-core.mjs';
import { mushroomArt } from './mushroom-art.mjs';

export const SLEEP_STORAGE = 'doodletick-sleep-garden-v1';
export function remainingLabel(ms) {
  const minutes = Math.max(0, Math.ceil(Number.isFinite(ms) ? ms / 60000 : 0));
  return `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, '0')}m`;
}

export function createSleepUI(root, { engineFactory = createSleepAudio, document: doc = globalThis.document,
  window: win = globalThis.window, getOwnedMushrooms = async () => [], onBeforePlay = () => {}, onActivity = () => {} } = {}) {
  let prefs = sleepPreferences(SLEEP_DEFAULTS), storageOK = true, destroyed = false, generation = 0;
  let source = 'starter', selected = structuredClone(SLEEP_STARTER_MUSHROOMS), loading = false, dim = false;
  let preparedOwned = false;
  const listeners = [];
  try { prefs = sleepPreferences(JSON.parse(win.localStorage.getItem(SLEEP_STORAGE) || '{}')); } catch { storageOK = false; }
  root.classList.add('sleep-garden');
  root.innerHTML = `<div class="sleep-heading"><div><span class="section-kicker">A LITTLE QUIETER, A LITTLE SLOWER</span><h1>Your sleep<br><em>mushroom garden.</em></h1><p>Soft wind. Little pixel voices. A place to leave the day.</p></div><span class="sleep-moon" aria-hidden="true">☾</span></div>
    <section class="sleep-scene" aria-label="Sleep mushroom garden"><div class="sleep-stars" aria-hidden="true">· &nbsp; ✧ &nbsp; · &nbsp; &nbsp; · &nbsp; ✦ &nbsp; ·</div><div class="sleep-mushrooms" data-sleep="bed"></div><p data-sleep="source" class="sleep-source"></p></section>
    <section class="sleep-player" aria-label="Sleep listening controls"><div><span class="section-kicker">LET IT WANDER</span><strong data-sleep="timer">8h 00m</strong><p data-sleep="status" role="status" aria-live="polite">Ready when you are.</p></div><div class="sleep-actions"><button type="button" class="button primary" data-sleep="play">Start sleep sounds</button><button type="button" class="button quiet" data-sleep="stop" disabled>Stop sounds</button><button type="button" class="button quiet" data-sleep="dim" aria-pressed="false">Dim garden</button></div></section>
    <div class="sleep-adjustments"><div class="sleep-knobs">${[['volume','Listening volume'],['wind','Soft wind'],['mushrooms','Mushroom voices'],['reduction','Static reduction']].map(([id,label]) => `<label>${label}<output data-sleep="${id}-label"></output><input type="range" data-sleep="${id}" aria-label="${label}" min="0" max="100" step="1"></label>`).join('')}<label>Fade out after<select data-sleep="minutes" aria-label="Sleep duration"><option value="30">30 minutes</option><option value="60">1 hour</option><option value="120">2 hours</option><option value="240">4 hours</option><option value="480">8 hours</option><option value="720">12 hours</option></select></label></div>
    <details class="sleep-details"><summary>Little arcade voices & your mushrooms</summary><div class="sleep-knobs">${[['blips','Arcade blips'],['pops','Mic pops']].map(([id,label]) => `<label>${label}<output data-sleep="${id}-label"></output><input type="range" data-sleep="${id}" aria-label="Sleep ${label.toLowerCase()}" min="0" max="100" step="1"></label>`).join('')}</div><div class="sleep-actions"><button type="button" class="button quiet" data-sleep="preset">Use bedtime preset</button><button type="button" class="button quiet" data-sleep="owned">Use my saved mushrooms</button><button type="button" class="button quiet" data-sleep="import">Open a Dot Wave recipe</button><input data-sleep="file" type="file" accept=".json,application/json" hidden></div><p>The starting mushrooms are a listening collection, ready without a vault. Load your garden from this Keeper or open a recipe to hear your own sounds. Listening never plants, spends or mines coins.</p></details></div>
    <p class="sleep-note">The final minute fades gently. Sound may continue in a background tab; keep this page open and the computer awake. Your vault can stay locked. A browser interruption needs another press of Start.</p><p data-sleep="storage" class="sleep-note" hidden>Settings apply for this visit; browser storage is unavailable.</p>`;
  const el = name => root.querySelector(`[data-sleep="${name}"]`);
  function listen(target, name, fn) { target.addEventListener(name, fn); listeners.push(() => target.removeEventListener(name, fn)); }
  function save() {
    try { win.localStorage.setItem(SLEEP_STORAGE, JSON.stringify(prefs)); storageOK = true; } catch { storageOK = false; }
    el('storage').hidden = storageOK;
  }
  function controls() {
    for (const key of ['volume','wind','mushrooms','reduction','blips','pops']) {
      el(key).value = String(prefs[key]); el(key + '-label').textContent = prefs[key] + '%';
    }
    el('minutes').value = String(prefs.minutes);
    el('storage').hidden = storageOK;
  }
  function collection() {
    const bed = el('bed'); bed.replaceChildren();
    for (const [index, mushroom] of selected.slice(0, 9).entries()) {
      const r = recipe(mushroom.recipe), card = doc.createElement('div'), art = doc.createElement('div'), name = doc.createElement('span');
      art.innerHTML = mushroomArt('sleep-' + r.settings.seed, [], r.settings.growth);
      name.textContent = r.name; card.className = 'sleep-spore'; card.style.setProperty('--spore-delay', `${index * -.7}s`);
      card.append(art, name); bed.append(card);
    }
    el('source').textContent = preparedOwned ? 'Your prepared garden is playing. The starting collection is ready for next time.' : source === 'owned' ? `${selected.length} mushrooms from your Keeper garden` : source === 'import' ? 'Your Dot Wave recipe · listening only' : 'A starting collection · listening only';
  }
  function render(state) {
    if (destroyed) return;
    if (preparedOwned && state.phase !== 'playing') { preparedOwned = false; collection(); }
    const active = state.phase === 'playing' || state.phase === 'preparing';
    root.dataset.playing = String(state.phase === 'playing');
    el('play').disabled = active || loading; el('stop').disabled = !active && !loading;
    el('play').textContent = state.phase === 'preparing' ? 'Preparing your garden…' : 'Start sleep sounds';
    el('timer').textContent = remainingLabel(state.phase === 'playing' ? state.remainingMs : prefs.minutes * 60000);
    el('status').textContent = state.error || (state.phase === 'playing' ? `Listening quietly · ${state.count} mushroom voices` : state.reason || 'Ready when you are.');
  }
  const engine = engineFactory({ onChange: render });
  function stop(reason = 'Stopped. Start whenever you are ready.') { generation++; loading = false; engine.stop(reason); render(engine.state()); }
  function changed(key) {
    prefs = sleepPreferences({ ...prefs, [key]: Number(el(key).value) }); save(); controls();
    if (key === 'volume') engine.setVolume(prefs.volume);
    else stop('Mix changed. Press Start to hear it.');
    onActivity();
  }
  async function play() {
    if (destroyed || loading || ['preparing','playing'].includes(engine.state().phase)) return;
    if (doc.hidden) { stop('Return to the garden and press Start.'); return; }
    onActivity(); onBeforePlay();
    await engine.play({ mushrooms: selected, preferences: prefs });
  }
  async function useOwned() {
    stop('Loading your saved mushrooms…'); const ticket = generation; loading = true; render(engine.state());
    try {
      const entries = await getOwnedMushrooms();
      if (destroyed || ticket !== generation) return;
      if (!Array.isArray(entries) || !entries.length) throw Error('No mushrooms loaded. Unlock your existing vault and join this Keeper garden, or enjoy the starting collection.');
      if (entries.length > 100) throw Error('Choose a garden with at most 100 mushrooms.');
      const next = entries.map(m => ({ recipe: recipe(m.recipe) }));
      selected = next; source = 'owned'; collection(); engine.stop(`${next.length} mushrooms loaded. Press Start to listen.`);
    } catch (error) { if (!destroyed && ticket === generation) engine.stop(error.message); }
    finally { if (!destroyed && ticket === generation) { loading = false; render(engine.state()); } }
  }
  async function openRecipe() {
    const file = el('file').files?.[0]; el('file').value = ''; if (!file) return;
    stop('Opening your recipe…'); const ticket = generation; loading = true; render(engine.state());
    try {
      if (file.size > 32000) throw Error('Choose a Dot Wave recipe smaller than 32 KB.');
      const parsed = recipe(JSON.parse(await file.text()));
      if (destroyed || ticket !== generation) return;
      selected = [{ recipe: parsed }]; source = 'import'; collection(); engine.stop('Recipe ready. Press Start to listen.');
    } catch (error) { if (!destroyed && ticket === generation) engine.stop(error.message); }
    finally { if (!destroyed && ticket === generation) { loading = false; render(engine.state()); } }
  }
  function preset() {
    stop('Bedtime preset ready. Press Start to listen.'); prefs = sleepPreferences(SLEEP_DEFAULTS);
    source = 'starter'; selected = structuredClone(SLEEP_STARTER_MUSHROOMS); collection(); save(); controls(); render(engine.state());
  }
  listen(el('play'), 'click', () => { void play().catch(error => stop(error.message)); });
  listen(el('stop'), 'click', () => stop());
  listen(el('preset'), 'click', preset); listen(el('owned'), 'click', () => { void useOwned(); });
  listen(el('import'), 'click', () => el('file').click()); listen(el('file'), 'change', () => { void openRecipe(); });
  for (const key of ['volume','wind','mushrooms','reduction','blips','pops']) listen(el(key), 'input', () => changed(key));
  listen(el('minutes'), 'change', () => changed('minutes'));
  listen(el('dim'), 'click', () => { dim = !dim; root.dataset.dim = String(dim); el('dim').setAttribute('aria-pressed', String(dim)); el('dim').textContent = dim ? 'Show controls' : 'Dim garden'; });
  listen(win, 'pagehide', () => stop('Page closed. Press Start when you return.'));
  controls(); collection(); render(engine.state());
  return {
    state: () => ({ ...engine.state(), source, count: selected.length, preferences: { ...prefs } }),
    stop, preset,
    // Locking the vault removes recipe references, never postpones locking. The
    // already rendered, explicitly started sound may finish without any key.
    forgetOwned() {
      generation++; loading = false;
      if (source === 'owned') {
        preparedOwned = engine.state().phase === 'playing';
        source = 'starter'; selected = structuredClone(SLEEP_STARTER_MUSHROOMS); collection();
        if (engine.state().phase === 'preparing') stop('Vault locked before the mix was ready. Press Start for the starting collection.');
      }
      render(engine.state());
    },
    destroy() { if (destroyed) return; destroyed = true; generation++; for (const remove of listeners) remove(); engine.destroy(); },
  };
}
