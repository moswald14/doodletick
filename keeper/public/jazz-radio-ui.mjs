// SPDX-License-Identifier: GPL-3.0-only
import { DJ_GENRES } from './jazz-genres.mjs';
import { JAZZ_DEFAULT_SETTINGS } from './jazz-radio-contract.mjs';
import { checkSignature } from './core.mjs';
import { createJazzNamingUI } from './jazz-name-ui.mjs';
import { createJazzBandUI } from './jazz-band-ui.mjs';

export async function initializeJazzRadioUI() {
  const $ = id => document.getElementById(id);
  const endpoint = './api/jazz-radio/';
  async function request(action, input) {
    const response = await fetch(endpoint + action, { cache: 'no-store', credentials: 'same-origin', signal: AbortSignal.timeout(input === undefined ? 6500 : 35000),
      ...(input === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Keeper-Request': '1' }, body: JSON.stringify(input) }) });
    const value = await response.json(); if (!response.ok) throw new Error(value.error || 'Jazz is unavailable. Try again shortly.'); return value;
  }
  let station;
  try { station = await request('status'); } catch { return false; }
  if (!station.enabled) return false;
  document.body.classList.add('radio-mode'); $('radio-tools').hidden = false; $('chord-library').hidden = false;
  document.querySelector('.hero-note').lastChild.textContent = 'ALWAYS IMPROVISING · HOME ASSISTANT RADIO';
  document.querySelector('.volume label').textContent = 'LOCAL OUTPUT';
  $('stop').setAttribute('aria-label', 'Stop Home Assistant broadcast');
  document.querySelector('.signal-wrap > span').textContent = 'LOCAL MONITOR';
  $('signal').hidden = true;
  document.querySelector('.jazz-tool #cast-jazz').textContent = 'Start broadcast';
  document.querySelector('#cast-jazz').closest('.jazz-tool').querySelector('p').textContent = 'Free VDO.Ninja audio casting, broadcast by Home Assistant. No microphone or camera.';
  document.querySelector('#cast-link-row > p').textContent = 'Anyone with this link can listen. Home Assistant keeps the music playing when this browser closes. Local Pause, Volume and Mute affect only your listening.';
  document.querySelector('footer > p').textContent = 'MADE FOR THE DOODLEVERSE. Home Assistant radio · Keeper 0.17b';
  document.querySelector('footer details').replaceChildren();
  const footerSummary = document.createElement('summary'), footerText = document.createElement('p');
  footerSummary.textContent = 'Keeping the room open'; footerText.textContent = 'Start the broadcast once. Home Assistant renders original music and keeps the station running, including after a Keeper restart. Never stop locks Stop and shuffles the players hourly; turn it off to stop intentionally. Your local output volume, mute and Pause listening leave the stream alone. Power, network or service outages can interrupt it. Keyboard: Space for local listening, M to mute here, N for a fresh set.';
  document.querySelector('footer details').append(footerSummary, footerText);
  let spiro = ''; for (let i=0; i<=1600; i++) { const t=i/1600*Math.PI*14; spiro += (i?'L':'M')+(200+109*Math.cos(t)+35*Math.cos(23/7*t)).toFixed(2)+','+(200+109*Math.sin(t)-35*Math.sin(23/7*t)).toFixed(2); } $('spirograph').setAttribute('d',spiro);
  let closed = false, pollTimer, pollPending = false, busy = false, dirty = false, changeTimer, settings = { ...station.settings }, undo = null;
  let volume = 45, muted = false, night = false, librarySignature = '', ops = Promise.resolve(), errorMessage = '', session = 1;
  let settingsVersion = 0, namingSequence = null;
  const band = createJazzBandUI({getSettings:()=>settings,getStation:()=>station,request,action,
    changeSettings:patch=>{settings={...settings,...patch};changeSettings();}});
  let libraryVersion = 0, libraryNextOffset = null, libraryLoading = false, libraryMeta = null;
  const libraryIds = new Set(), libraryMore = document.createElement('button');
  libraryMore.type = 'button'; libraryMore.id = 'library-more'; libraryMore.hidden = true;
  libraryMore.textContent = 'Load older passages'; $('saved-chords').after(libraryMore);
  try { const prefs = JSON.parse(localStorage.getItem('doodle-jazz-v1')); if (Number.isFinite(prefs?.volume)) volume = Math.max(0, Math.min(100, prefs.volume)); muted = prefs?.muted === true; night = prefs?.night === true; } catch {}
  const monitor = new Audio(), replayPlayers = new Set(); monitor.preload = 'none';
  function notice(text, failed = false) { $('status').textContent = text; $('status').classList.toggle('error', failed); }
  function saveLocal() { try { const old = JSON.parse(localStorage.getItem('doodle-jazz-v1')) || {}; localStorage.setItem('doodle-jazz-v1', JSON.stringify({ ...old, volume, muted, night })); } catch {} }
  function localVolume() {
    monitor.volume = volume / 100; monitor.muted = muted;
    for (const audio of replayPlayers) { audio.volume = volume / 100; audio.muted = muted; }
    $('volume').value = volume; $('volume-value').textContent = volume + '%';
    $('mute').setAttribute('aria-pressed', String(muted)); $('mute').setAttribute('aria-label', muted ? 'Unmute local listening' : 'Mute local listening');
    document.documentElement.classList.toggle('night', night); $('night').setAttribute('aria-pressed', String(night)); saveLocal();
  }
  function paintSettings() {
    for (const id of ['tempo', 'swing', 'room', 'piano', 'bass', 'drums']) { if (document.activeElement !== $(id)) $(id).value = settings[id]; }
    $('tempo-value').textContent = settings.tempo + ' BPM';
    for (const id of ['swing','room']) $(id + '-value').textContent = settings[id] + '%';
    for (const button of document.querySelectorAll('[data-style]')) {
      const selected = button.dataset.style === settings.style; button.setAttribute('aria-pressed', String(selected)); button.setAttribute('aria-selected', String(selected)); button.tabIndex = selected ? 0 : -1;
    }
    for (const button of document.querySelectorAll('[data-mute]')) { const quiet = settings[button.dataset.mute] === 0; button.setAttribute('aria-pressed', String(quiet)); button.textContent = quiet ? '+' : '−'; }
    $('swing').disabled = ['bossa','latin','funk'].includes(settings.style);
    band.paint(station,settings,busy);
  }
  function paint() {
    const s = station, listening = !monitor.paused && !!monitor.src, info = s.info;
    document.body.classList.toggle('playing', s.running); document.body.dataset.audioState = s.running ? 'broadcasting' : 'idle';
    $('play-text').textContent = busy && s.starting ? 'Starting broadcast…' : listening ? 'Pause listening' : s.running ? 'Listen here' : 'Start Jazz & listen';
    $('play').setAttribute('aria-label', $('play-text').textContent); $('play').disabled = busy;
    $('play-icon').innerHTML = listening ? '<path d="M5 3h3v14H5Zm7 0h3v14h-3Z"/>' : '<path d="M5 2.7L17 10 5 17.3Z"/>';
    $('stop').disabled = busy || !s.running || s.neverStop; $('stop').title = s.neverStop ? 'Turn off Never stop to unlock this button.' : 'Stop the Home Assistant broadcast';
    $('live-label').textContent = s.running ? 'HOME ASSISTANT · ON AIR' : s.starting ? 'TUNING UP' : 'READY TO BROADCAST';
    $('cast-jazz').hidden = s.running; $('cast-jazz').disabled = busy; $('stop-cast').hidden = true;
    $('cast-link-row').hidden = !s.listenerUrl; if (s.listenerUrl) { $('cast-link').value = s.listenerUrl; $('cast-listen').href = s.listenerUrl; }
    $('cast-status').textContent = s.running ? (s.transport.message || 'Home Assistant is broadcasting. You can close this browser.') : 'Start a broadcast for your free VDO.Ninja listener link.';
    $('cast-meter').textContent = s.running ? `${s.transport.peers || 0} connected listener${s.transport.peers === 1 ? '' : 's'} · ${s.transport.phase === 'live' ? 'Audio is reaching listeners' : 'Waiting for a listener to play'}` : '';
    $('never-stop').setAttribute('aria-pressed', String(s.neverStop)); $('never-stop').textContent = s.neverStop ? 'Never stop: ON · unlock' : 'Never stop'; $('never-stop').disabled = busy;
    $('never-stop-status').textContent = s.neverStop ? `Stop is locked. Next player shuffle: ${new Date(s.nextShuffleAt).toLocaleTimeString([], {hour:'numeric',minute:'2-digit'})}. Turn this off to stop intentionally.` : 'Keep broadcasting, guard Stop, and shuffle the players every hour. You can always unlock it.';
    $('voice-updates').checked = s.voice; $('voice-updates').disabled = busy;
    $('voice-status').textContent = s.voiceStatus.error || (s.voice ? 'Voice is on the broadcast. Good news, world weather and clock color arrive about every 15 minutes; changes get a short announcement.' : 'Voice is off. Switch it on for settings updates, good news, world weather and Doodle clock color.');
    $('clock-color').textContent = s.color.color; $('clock-swatch').style.backgroundColor = s.color.color;
    $('dig-this').disabled = busy || !s.canDig;
    $('dig-status').textContent = s.jobs.at(-1)?.message || (s.canDig ? 'Save four chords before this moment and four starting here.' : 'Let four chords play, then save a moment you love.');
    $('chord-receipt').disabled = busy || !info;
    $('chord-trail').textContent = s.recentChords.map(c => c.chord).join(' → ') || 'The next chords will appear here.';
    const brief = s.brief;
    $('world-brief').textContent = brief?.text || 'Source links and the most recent spoken world update appear here.';
    $('world-sources').replaceChildren();
    for (const source of brief?.sourceUrls || []) {
      try { const url = new URL(source.url); if (url.protocol !== 'https:') continue; const a = document.createElement('a'); a.href = url.href; a.textContent = source.label; a.target = '_blank'; a.rel = 'noopener noreferrer'; $('world-sources').append(a, document.createTextNode(' ')); } catch {}
    }
    if (info) {
      $('chord').textContent = info.chord; $('track-name').textContent = info.namedTitle || DJ_GENRES[info.style].name + ' · ' + info.key;
      const feel = info.beatOnly ? ' · Beat only' : info.fromFavorite ? ' · Favorite progression' : '';
      const beat = info.beatNumber ?? (Number.isFinite(info.beat) ? Math.floor(info.beat) + 1 : 1);
      $('track-info').textContent = info.tempo + ' BPM' + feel;
      $('position').textContent = `Bar ${info.bar} of ${info.bars} · beat ${beat} of ${info.beatsPerBar || 4}`;
    }
    const seconds = s.seconds || 0; $('elapsed').textContent = (seconds >= 3600 ? Math.floor(seconds / 3600) + ':' : '') + String(Math.floor(seconds / 60) % 60).padStart(2,'0') + ':' + String(seconds % 60).padStart(2,'0');
    if (!dirty && !busy) { settings = { ...s.settings }; paintSettings(); }
    if (errorMessage || s.error) notice(errorMessage || s.error, true);
    else notice(s.running ? (listening ? 'Listening here. Local volume and mute leave the broadcast playing.' : 'Home Assistant is broadcasting. Listen here, or leave it running and close this page.') : 'Start Jazz. Home Assistant will keep it running when this browser closes.');
    const event = s.namingEvent;
    if (event && Number.isSafeInteger(event.sequence) && event.sequence !== namingSequence) {
      namingSequence = event.sequence; naming.receive(event.info);
    } else if (!event) namingSequence = null;
    if (info) naming.receive(info);
    naming.playbackChanged();
    band.paint(station,settings,busy);
    document.querySelectorAll('.beat-dots i').forEach((dot, i) => dot.classList.toggle('active', s.running && i === info?.beat));
  }
  const naming = createJazzNamingUI({
    getPlayback: () => ({ session, state: station.running ? 'playing' : 'idle', info: station.info }),
    getSnapshot: () => request('context', {}),
    applyResult: (requestId, result, info) => {
      void action('beat', { requestId, result, targetSet: info.set, targetSeed: info.seed }).catch(() => {
        if (!closed) naming.receive({ partRejected: requestId });
      });
    }
  });
  function acceptStation(next) {
    // A poll started before a settings save may finish after it.
    if (next.revision >= station.revision) station = next;
  }
  function action(name, input = {}) {
    const task = ops.then(async () => {
      if (closed) return; busy = true; errorMessage = ''; paint();
      try { const result = await request(name, input); if (result.settings) acceptStation(result); return result; }
      catch (e) { errorMessage = e.message; throw e; }
      finally { busy = false; paint(); }
    });
    ops = task.catch(() => {}); return task;
  }
  function on(id, event, fn) { $(id).addEventListener(event, e => { Promise.resolve(fn(e)).catch(() => {}); }); }
  async function listen() {
    if (!monitor.paused) { monitor.pause(); monitor.removeAttribute('src'); monitor.load(); paint(); return; }
    if (!station.running) await action('start');
    if (!station.running) return;
    monitor.src = endpoint + 'stream'; localVolume();
    try { await monitor.play(); errorMessage = ''; } catch { errorMessage = 'The broadcast is running. Press Listen here again to hear it on this device.'; }
    paint();
  }
  monitor.addEventListener('error', () => { if (closed || !monitor.getAttribute('src')) return; errorMessage = 'Local listening was interrupted. The broadcast is separate; press Listen here to reconnect.'; monitor.pause(); monitor.removeAttribute('src'); paint(); });
  monitor.addEventListener('pause', () => { if (!closed) paint(); });
  on('play','click',listen);
  on('stop','click', async () => { await action('stop'); session++; monitor.pause(); monitor.removeAttribute('src'); monitor.load(); paint(); });
  on('new-set','click', () => action('new-set'));
  on('cast-jazz','click', () => action('start'));
  on('cast-copy','click', async () => { await navigator.clipboard.writeText(station.listenerUrl); $('cast-status').textContent = 'Listener link copied. Anyone with this link can hear the broadcast.'; });
  on('never-stop','click', () => action('never-stop', { enabled: !station.neverStop }));
  on('voice-updates','change', e => action('voice', { enabled: e.target.checked }));
  function beginSettingsEdit() { clearTimeout(changeTimer); dirty = true; return ++settingsVersion; }
  function finishSettingsEdit(version) {
    if (closed || version !== settingsVersion) return false;
    dirty = false; settings = { ...station.settings }; paint(); return true;
  }
  on('shuffle-settings','click', async () => {
    undo = { ...settings }; const version = beginSettingsEdit();
    await action('shuffle');
    if (finishSettingsEdit(version)) { $('undo-shuffle').hidden = false; $('shuffle-info').textContent = 'A new arrangement is queued for the next bar.'; }
  });
  on('undo-shuffle','click', async () => {
    if (!undo) return;
    const previous = { ...undo }, version = beginSettingsEdit();
    await action('settings', previous);
    if (finishSettingsEdit(version)) { $('undo-shuffle').hidden = true; undo = null; }
  });
  on('volume','input', e => { volume = Number(e.target.value); muted = false; localVolume(); });
  on('mute','click', () => { muted = !muted; localVolume(); });
  on('night','click', () => { night = !night; localVolume(); });
  function changeSettings() {
    const version = beginSettingsEdit(), pending = { ...settings }; paintSettings();
    changeTimer = setTimeout(async () => { try { await action('settings', pending); finishSettingsEdit(version); } catch {} }, 400);
  }
  for (const id of ['tempo','swing','room','piano','bass','drums']) on(id,'input', e => { settings[id] = Number(e.target.value); changeSettings(); });
  const levelsBeforeMute = {};
  for (const button of document.querySelectorAll('[data-mute]')) button.addEventListener('click', () => { const key = button.dataset.mute; if (settings[key]) { levelsBeforeMute[key] = settings[key]; settings[key] = 0; } else settings[key] = levelsBeforeMute[key] || JAZZ_DEFAULT_SETTINGS[key]; changeSettings(); });
  const tabs = [...document.querySelectorAll('[data-style]')];
  for (const button of tabs) {
    button.setAttribute('role','tab');
    button.addEventListener('click', () => { const style = button.dataset.style, genre = DJ_GENRES[style]; settings = { ...settings, style, tempo: genre.tempo, swing: Math.round(genre.swing * 100) }; changeSettings(); });
    button.addEventListener('keydown', e => { const at = tabs.indexOf(button); const next = e.key === 'ArrowRight' ? (at+1)%tabs.length : e.key === 'ArrowLeft' ? (at+tabs.length-1)%tabs.length : e.key === 'Home' ? 0 : e.key === 'End' ? tabs.length-1 : null; if (next !== null) { e.preventDefault(); tabs[next].focus(); tabs[next].click(); } });
  }
  function download(value, name) {
    const url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2) + '\n'], {type:'application/json'}));
    const a = document.createElement('a'); a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  on('chord-receipt','click', async () => {
    const receipt = await action('receipt');
    if (!await checkSignature(receipt.record, receipt.signature, receipt.publicKey)) throw new Error('The chord receipt signature did not verify.');
    download(receipt, 'doodle-jazz-chord-receipt.json');
  });
  on('dig-this','click', async () => { await action('dig', { requestId: crypto.randomUUID() }); await poll(); });
  function paintLibrary() {
    libraryMore.hidden = libraryNextOffset === null; libraryMore.disabled = libraryLoading;
    libraryMore.textContent = libraryLoading ? 'Loading older passages…' : 'Load older passages';
    if (libraryMeta) $('library-status').textContent = libraryMeta.error || `${libraryMeta.count} permanent passage${libraryMeta.count === 1 ? '' : 's'} saved on this Keeper. Included in your Home Assistant app backup. Showing ${libraryIds.size} of ${libraryMeta.count}.`;
  }
  function releasePlayer(audio) { audio.pause(); audio.removeAttribute('src'); audio.load(); }
  function releaseReplays() { for (const audio of replayPlayers) releasePlayer(audio); replayPlayers.clear(); }
  async function appendLibrary(data, version) {
    for (const receipt of data.receipts) {
      if (closed || version !== libraryVersion) return;
      if (libraryIds.has(receipt.record.id)) continue;
      const r = receipt.record, article = document.createElement('article'), h = document.createElement('h3'), chords = document.createElement('p'), meta = document.createElement('p'), audio = document.createElement('audio'), button = document.createElement('button');
      h.textContent = `${DJ_GENRES[r.chords[0].style]?.name || 'Jazz'} · ${new Date(r.capturedAt).toLocaleString()}`;
      chords.textContent = r.chords.map(c => c.chord).join(' → '); chords.className = 'saved-chord-names';
      const verified = await checkSignature(r, receipt.signature, receipt.publicKey);
      if (closed || version !== libraryVersion) return;
      meta.textContent = `${(r.durationMs/1000).toFixed(1)} seconds · ${verified ? 'Keeper signature verified' : 'Signature could not be verified'}`;
      audio.controls = true; audio.preload = 'none'; audio.volume = volume / 100; audio.muted = muted;
      audio.src = endpoint + 'audio/' + r.audio.sha256 + '.mp3'; audio.setAttribute('aria-label','Replay saved eight-chord passage'); replayPlayers.add(audio);
      button.type = 'button'; button.textContent = 'Save signed receipt'; button.addEventListener('click', () => download(receipt, 'doodlechain-' + r.id + '.json'));
      const link = document.createElement('a'); link.href = audio.src; link.download = 'doodlechain-' + r.id + '.mp3'; link.textContent = 'Download audio';
      article.append(h, chords, meta, audio, button, link); $('saved-chords').append(article); libraryIds.add(r.id);
    }
    if (closed || version !== libraryVersion) return;
    libraryMeta = data;
    libraryNextOffset = Number.isInteger(data.nextOffset) && data.nextOffset >= 0 && data.nextOffset < 2000 ? data.nextOffset : null;
    paintLibrary();
  }
  async function loadLibrary() {
    const data = await request('library'); if (closed) return;
    const signature = JSON.stringify([data.count, data.error]); if (signature === librarySignature) return;
    librarySignature = signature; const version = ++libraryVersion;
    libraryNextOffset = null; libraryLoading = false; libraryIds.clear(); releaseReplays(); $('saved-chords').replaceChildren(); paintLibrary();
    await appendLibrary(data, version);
  }
  libraryMore.addEventListener('click', async () => {
    if (closed || libraryLoading || libraryNextOffset === null) return;
    const version = libraryVersion, offset = libraryNextOffset; libraryLoading = true; paintLibrary();
    try {
      const data = await request('library?offset=' + offset);
      if (closed || version !== libraryVersion) return;
      if (JSON.stringify([data.count, data.error]) !== librarySignature) await loadLibrary();
      else await appendLibrary(data, version);
    } catch (e) { if (!closed && version === libraryVersion) $('library-status').textContent = e.message; }
    finally { if (!closed && version === libraryVersion) { libraryLoading = false; libraryMore.disabled = false; libraryMore.textContent = 'Load older passages'; } }
  });
  async function poll() {
    if (closed || pollPending) return; pollPending = true;
    try { const next = await request('status'); if (closed) return; acceptStation(next); paint(); await loadLibrary(); }
    catch { if (!closed) notice('Keeper is reconnecting. Local controls will return shortly; saved passages stay on your Keeper.', true); }
    finally { pollPending = false; if (!closed) { clearTimeout(pollTimer); pollTimer = setTimeout(poll, 1250); } }
  }
  document.addEventListener('keydown', e => {
    if (e.ctrlKey || e.metaKey || e.altKey || /^(INPUT|TEXTAREA|SELECT|BUTTON|A)$/.test(e.target.tagName)) return;
    if (e.code === 'Space') { e.preventDefault(); void listen().catch(() => {}); }
    if (e.key.toLowerCase() === 'm') { muted = !muted; localVolume(); }
    if (e.key.toLowerCase() === 'n') void action('new-set').catch(() => {});
  });
  function leave() { closed = true; clearTimeout(pollTimer); clearTimeout(changeTimer); band.dispose(); naming.dispose(); releaseReplays(); releasePlayer(monitor); }
  window.addEventListener('pagehide', leave, {once:true});
  window.addEventListener('pageshow', e => { if (e.persisted) location.reload(); });
  localVolume(); paintSettings(); paint(); void poll();
  return true;
}
