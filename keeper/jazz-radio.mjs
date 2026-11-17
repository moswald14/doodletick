// SPDX-License-Identifier: GPL-3.0-only
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { randomBytes, randomUUID } from 'node:crypto';
import { DJRenderer, DJ_STYLES, djMakeBank } from './public/jazz-core.mjs';
import { djShuffleSettings } from './public/jazz-settings.mjs';
import { JAZZ_DEFAULT_SETTINGS, JAZZ_HOUR, JAZZ_NOW_FORMAT, validJazzRequestId, validateRadioSettings } from './public/jazz-radio-contract.mjs';
import { tickAt } from './public/core.mjs';
import { validateJazzContext, validateJazzResult } from './public/jazz-name-contract.mjs';
import { createJazzLibrary, atomicJazzJson, readJazzJson } from './jazz-library.mjs';
import { createJazzMonitor, encodeJazzClip } from './jazz-media.mjs';
import { createJazzNodeCast } from './jazz-node-cast.mjs';
import { createJazzWorld } from './jazz-world.mjs';
import { JazzVoice } from './jazz-voice.mjs';

const rate = 48000, frameSize = 480, freshSeed = () => randomBytes(4).readUInt32LE() || 1;
const error = (message, status = 400) => Object.assign(new Error(message), { status });
function makeInvitation() {
  const streamID = 'DoodleJazz' + randomBytes(16).toString('hex'), password = randomBytes(16).toString('hex');
  const query = new URLSearchParams({ view: streamID, password, wss2: 'apibackup.vdo.ninja', novideo: '1', stereo: '1', proaudio: '1', audiobitrate: '128', label: 'Doodle Jazz' });
  return { streamID, password, url: 'https://vdo.ninja/alpha/?' + query };
}
function validateState(value) {
  if (!value || value.format !== 'doodle-jazz-station-v1' || !Number.isInteger(value.seed) || value.seed < 1 || value.seed > 0xffffffff
    || !['running', 'neverStop', 'voice'].every(key => typeof value[key] === 'boolean')
    || !Number.isSafeInteger(value.revision) || value.revision < 1 || value.revision > Number.MAX_SAFE_INTEGER - 1000
    || !(value.nextShuffleAt === null || Number.isSafeInteger(value.nextShuffleAt))
    || !/^DoodleJazz[a-f0-9]{32}$/.test(value.invitation?.streamID) || !/^[a-f0-9]{32}$/.test(value.invitation?.password)) throw new Error('Jazz station settings need recovery.');
  const invitation = makeInvitation();
  const url = new URL(invitation.url); url.searchParams.set('view', value.invitation.streamID); url.searchParams.set('password', value.invitation.password);
  return { ...value, settings: validateRadioSettings(value.settings), invitation: { streamID: value.invitation.streamID, password: value.invitation.password, url: url.href } };
}

// A bounded stereo room effect, independent of any browser or listening volume.
class JazzRoom {
  constructor() { this.lines = [1429, 1789, 2081, 2371].map((n, i) => ({ l: new Float32Array(n), r: new Float32Array(n + 97 + i * 17), at: 0, bt: 0, dampL: 0, dampR: 0 })); this.amount = 0.35; }
  sample(l, r, room) {
    this.amount += (room - this.amount) * 0.001;
    let wetL = 0, wetR = 0;
    for (const d of this.lines) {
      const a = d.l[d.at], b = d.r[d.bt];
      d.dampL += (a - d.dampL) * 0.32; d.dampR += (b - d.dampR) * 0.32;
      d.l[d.at] = l * 0.15 + d.dampL * 0.61; d.r[d.bt] = r * 0.15 + d.dampR * 0.61;
      d.at = (d.at + 1) % d.l.length; d.bt = (d.bt + 1) % d.r.length; wetL += a; wetR += b;
    }
    return [Math.tanh(l + wetL * this.amount * 0.7), Math.tanh(r + wetR * this.amount * 0.7)];
  }
}

export async function createJazzRadio({ dataDir, signer, enabled = false, now = Date.now,
  transportFactory = createJazzNodeCast, monitorFactory = createJazzMonitor, encoder = encodeJazzClip,
  world = createJazzWorld({ now }), voice = new JazzVoice(), automatic = true, bankFactory = djMakeBank } = {}) {
  const privateDir = path.join(dataDir, 'jazz-radio'); await mkdir(privateDir, { recursive: true, mode: 0o700 });
  const statePath = path.join(privateDir, 'station.json'), library = await createJazzLibrary({ dataDir, signer });
  let saved = { format: 'doodle-jazz-station-v1', settings: { ...JAZZ_DEFAULT_SETTINGS }, seed: freshSeed(), running: false,
    neverStop: false, voice: false, revision: 1, nextShuffleAt: null, invitation: makeInvitation() };
  let storageError = null;
  try { saved = validateState(await readJazzJson(statePath)); }
  catch (e) { if (e.code !== 'ENOENT') storageError = 'Jazz station settings need recovery. Your saved files have been preserved.'; }
  const unreadableStation = storageError !== null;
  let renderer, bank, transport, monitor, room, timer, announceTimer, running = false, starting = false, closing = false;
  let generation = 0, lastInfo = null, namingEvent = null, namingSequence = 0, infoEvents = [], recent = [], current = null, ordinal = 0;
  let startedAt = null, renderedFrames = 0, nextFrameAt = 0, lastWorldAt = 0, lastBrief = null, voiceSamples = null, voiceAt = 0, speaking = false, pendingSpeech = null;
  let lastError = storageError, transportState = { phase: 'off' }, chain = Promise.resolve(), persistence = Promise.resolve(), captureChain = Promise.resolve();
  const jobs = new Map(), tasks = new Set();
  const serialized = task => { const result = chain.then(task); chain = result.catch(() => {}); return result; };
  const remember = promise => { tasks.add(promise); promise.catch(() => {}).finally(() => tasks.delete(promise)); return promise; };
  function requireEnabled(allowStorageFailure = false) { if (!enabled) throw error('Home Assistant broadcasting is not enabled on this Keeper.', 503); if (closing || (storageError && !allowStorageFailure)) throw error(storageError || 'Keeper is closing.', 503); }
  function persist() {
    const copy = structuredClone(saved);
    const result = persistence.then(async () => {
      if (unreadableStation) throw error('The unreadable station file has been preserved for recovery.', 503);
      await atomicJazzJson(statePath, copy);
      if (lastError === storageError) lastError = null;
      storageError = null;
    });
    persistence = result.catch(() => { storageError = 'Jazz could not save its station settings. Check Keeper storage before changing the broadcast.'; lastError = storageError; });
    return result;
  }
  function announce(text) {
    if (!saved.voice || !running || closing) return;
    if (speaking || voiceSamples) { pendingSpeech = text; return; }
    const token = generation; speaking = true;
    remember((async () => {
      try { const result = await voice.synthesize(text); if (result && running && saved.voice && generation === token) { voiceSamples = result.samples; voiceAt = 0; } }
      catch { /* Voice is optional. Its failure must never interrupt the music. */ }
      finally { speaking = false; }
    })());
  }
  function settingsAnnouncement(reason) {
    clearTimeout(announceTimer);
    announceTimer = setTimeout(() => announce(`${reason} ${DJ_STYLES[saved.settings.style].name}, ${saved.settings.tempo} beats per minute. The Doodle clock color is ${tickAt(now()).color}.`), 1200);
    announceTimer.unref?.();
  }
  function worldAnnouncement() {
    if (!saved.voice || !running || speaking) return;
    lastWorldAt = now(); const token = generation;
    remember((async () => { try { const brief = await world.brief(); if (generation !== token || !running) return; lastBrief = brief; announce(brief.text); } catch { announce(`World updates are unavailable at the moment. The Doodle clock color is ${tickAt(now()).color}.`); } })());
  }
  function applySettings(settings, newSet = false) {
    saved.settings = validateRadioSettings(settings); saved.revision++;
    if (newSet) saved.seed = freshSeed();
    renderer?.configure({ composition: { style: saved.settings.style, tempo: saved.settings.tempo, swing: saved.settings.swing / 100,
      ...(newSet ? { seed: saved.seed, newSet: true } : {}) } });
    renderer?.configure({ scene: { id: 'radio-' + saved.revision, composition: { style: saved.settings.style, tempo: saved.settings.tempo, swing: saved.settings.swing / 100 },
      levels: Object.fromEntries(['piano', 'bass', 'drums'].map(key => [key, saved.settings[key] / 100])) } });
  }
  function shuffle(reason) {
    applySettings(djShuffleSettings(saved.settings, freshSeed()), true);
    settingsAnnouncement(reason); return persist();
  }
  function finishChord() {
    if (!current) return;
    current.meta.durationMs = Math.round(current.samples / 2 / rate * 1000);
    recent.push(current); if (recent.length > 20) recent.shift(); current = null;
    for (const job of jobs.values()) {
      if (job.status !== 'collecting' || recent.at(-1).meta.ordinal < job.end) continue;
      const chords = recent.filter(c => c.meta.ordinal >= job.begin && c.meta.ordinal <= job.end);
      if (chords.length !== 8) { job.status = 'failed'; job.message = 'The eight-chord passage was interrupted. Try again while Jazz is playing.'; continue; }
      job.status = 'saving'; job.message = 'Signing and saving eight chords…';
      const task = captureChain.then(async () => {
        const size = chords.reduce((n, c) => n + c.samples, 0), samples = new Int16Array(size); let at = 0;
        for (const chord of chords) for (const chunk of chord.chunks) { samples.set(chunk, at); at += chunk.length; }
        try {
          const audio = await encoder(samples);
          const receipt = await library.save({ id: job.id, requestId: job.requestId, chords: chords.map(c => c.meta), samples: size, audio,
            capturedAt: job.capturedAt, tick: job.tick });
          job.status = 'saved'; job.message = 'Eight chords saved on your Doodlechain.'; job.receipt = receipt;
        } catch (e) { job.status = 'failed'; job.message = e.status ? e.message : 'The audio could not be saved. Your existing recordings are unchanged; try again.'; }
      });
      captureChain = task.catch(() => {}); remember(task);
    }
  }
  function recordPcm(pcm, marks, frameStart) {
    let begin = 0;
    for (const mark of marks) {
      const at = Math.max(0, Math.min(frameSize, mark.frame - frameStart));
      if (current && at > begin) { const copy = pcm.slice(begin * 2, at * 2); current.chunks.push(copy); current.samples += copy.length; }
      finishChord();
      const i = mark.info;
      current = { samples: 0, chunks: [], meta: { ordinal: ++ordinal, chord: i.chord, root: i.chordRoot, quality: i.chordQuality,
        seed: i.seed, set: i.set, style: i.style, tempo: i.tempo, swing: i.swing, key: i.key, bar: i.bar, chorus: i.chorus, beat: i.beat,
        startedAt: new Date(startedAt + mark.frame / rate * 1000).toISOString() } };
      begin = at;
    }
    if (current && begin < frameSize) { const copy = pcm.slice(begin * 2); current.chunks.push(copy); current.samples += copy.length; }
  }
  function renderFrame() {
    if (!renderer || !running) return;
    const left = new Float32Array(frameSize), right = new Float32Array(frameSize), music = new Int16Array(frameSize * 2), output = new Int16Array(frameSize * 2);
    infoEvents = []; const frameStart = renderer.frame; renderer.render(left, right);
    for (let i = 0; i < frameSize; i++) {
      const stereo = room.sample(left[i], right[i], saved.settings.room / 100);
      for (let channel = 0; channel < 2; channel++) {
        const j = i * 2 + channel; music[j] = Math.round(Math.max(-1, Math.min(1, stereo[channel])) * 32767);
        const speech = voiceSamples && voiceAt < voiceSamples.length ? voiceSamples[voiceAt++] / 32768 : null;
        output[j] = speech === null ? music[j] : Math.round(Math.tanh(stereo[channel] * 0.27 + speech * 0.8) * 32767);
      }
      if (voiceSamples && voiceAt >= voiceSamples.length) { voiceSamples = null; voiceAt = 0; }
    }
    recordPcm(music, infoEvents, frameStart); renderedFrames += frameSize;
    if (!speaking && !voiceSamples && pendingSpeech) { const next = pendingSpeech; pendingSpeech = null; announce(next); }
    if (transport?.writeFrame(output) === false) throw new Error('The server cast needs reconnection.');
    monitor?.writeFrame(output);
  }
  function periodic() {
    if (saved.neverStop && saved.nextShuffleAt !== null && now() >= saved.nextShuffleAt) {
      // A jump over several hours makes one new choice; never replay a backlog.
      const missed = Math.floor((now() - saved.nextShuffleAt) / JAZZ_HOUR) + 1;
      saved.nextShuffleAt += missed * JAZZ_HOUR;
      remember(shuffle('It is time for the hourly player shuffle.').catch(() => {}));
    }
    if (saved.voice && now() - lastWorldAt >= 15 * 60000) worldAnnouncement();
  }
  function schedule(token) {
    if (!automatic || !running || generation !== token || closing) return;
    timer = setTimeout(() => {
      if (!running || generation !== token || closing) return;
      try {
        const time = performance.now(); let frames = 0;
        while (time >= nextFrameAt && frames++ < 3) { renderFrame(); nextFrameAt += 10; }
        if (time - nextFrameAt > 100) nextFrameAt = time + 10;
        periodic(); schedule(token);
      } catch { remember(recover('The audio source is restarting.')); }
    }, Math.max(1, Math.min(10, nextFrameAt - performance.now())));
  }
  async function haltResources() {
    running = false; generation++; clearTimeout(timer); clearTimeout(announceTimer); voiceSamples = null; pendingSpeech = null;
    for (const job of jobs.values()) if (job.status === 'collecting') { job.status = 'failed'; job.message = 'The passage ended before eight chords were recorded. Your saved recordings are safe.'; }
    const activeTransport = transport, activeMonitor = monitor; transport = null; monitor = null; renderer = null;
    await Promise.allSettled([activeTransport?.stop(), activeMonitor?.close()]);
  }
  async function startSource() {
    requireEnabled(); if (running || starting) return; starting = true; lastError = null;
    try {
      bank ||= bankFactory(24000); room = new JazzRoom(); recent = []; current = null; ordinal = 0; renderedFrames = 0; lastInfo = null;
      renderer = new DJRenderer(rate, bank, { style: saved.settings.style, tempo: saved.settings.tempo, swing: saved.settings.swing / 100, seed: saved.seed }, info => {
        if (info.partApplied || info.partRejected) { namingEvent = { sequence: ++namingSequence, info }; return; }
        if (typeof info.beat !== 'number') return; lastInfo = info;
        if (info.chords.some(c => c.beat === info.beat)) infoEvents.push({ frame: Math.round(info.seconds * rate), info });
      });
      renderer.configure({ levels: Object.fromEntries(['piano', 'bass', 'drums'].map(key => [key, saved.settings[key] / 100])) });
      const token = ++generation; let monitorFailed = false;
      monitor = await monitorFactory({ onFailure: () => {
        if (generation !== token) return; monitorFailed = true;
        if (running) remember(recover('The listening encoder is restarting.'));
      } });
      transport = transportFactory({ invitation: saved.invitation });
      await transport.start({ onstate: state => {
        if (generation !== token) return;
        transportState = state;
        if (running && state.phase === 'error') remember(recover('Jazz is reconnecting its listener stream.'));
      } });
      if (monitorFailed) throw new Error('The listening encoder stopped during startup.');
      running = true; startedAt = now(); nextFrameAt = performance.now();
      saved.running = true; if (saved.neverStop && saved.nextShuffleAt === null) saved.nextShuffleAt = now() + JAZZ_HOUR;
      await persist(); schedule(token); if (saved.voice) worldAnnouncement();
    } catch { await haltResources(); lastError = 'Jazz could not start its server broadcast. Check the app connection and audio dependencies, then try Start again.'; throw error(lastError, 503); }
    finally { starting = false; }
  }
  let recoveryPending = false;
  async function recover(message) {
    if (recoveryPending || closing) return; recoveryPending = true; lastError = message;
    await haltResources();
    if (automatic && saved.running && !closing) {
      timer = setTimeout(() => { recoveryPending = false; if (saved.running && !closing) remember(serialized(startSource).catch(() => { if (saved.running && !closing) remember(recover('Jazz is retrying its server connection.')); })); }, 15000);
      timer.unref?.();
    } else recoveryPending = false;
  }
  const service = {
    status() {
      return { enabled, running, starting, neverStop: saved.neverStop, voice: saved.voice, revision: saved.revision, settings: { ...saved.settings },
        startedAt, seconds: Math.floor(renderedFrames / rate), nextShuffleAt: saved.nextShuffleAt,
        listenerUrl: running ? saved.invitation.url : null, transport: transportState, error: lastError,
        info: lastInfo, namingEvent, color: tickAt(now()), canDig: running && recent.length >= 4 && library.status().available,
        recentChords: [...recent.slice(-7).map(c => c.meta), ...(current ? [current.meta] : [])],
        jobs: [...jobs.values()].map(({ id, requestId, status, message }) => ({ id, requestId, status, message })),
        library: library.status(), voiceStatus: voice.status(), brief: lastBrief };
    },
    start() { return serialized(async () => { if (!running) { recoveryPending = false; clearTimeout(timer); await startSource(); } return service.status(); }); },
    stop() { return serialized(async () => {
      requireEnabled(true); if (saved.neverStop) throw error('Never stop is on. Turn it off before stopping the broadcast.', 423);
      saved.running = false; await haltResources(); transportState = { phase: 'off' };
      try { await persist(); }
      catch { lastError = 'The broadcast is stopped for this run, but Keeper could not save that choice. It may resume after a restart. Free storage and press Stop again; existing recordings are preserved.'; throw error(lastError, 503); }
      return service.status();
    }); },
    settings(input) { return serialized(async () => { requireEnabled(); applySettings(input); await persist(); settingsAnnouncement('The Jazz settings changed.'); return service.status(); }); },
    shuffle() { return serialized(async () => { requireEnabled(); await shuffle('The players have a new arrangement.'); return service.status(); }); },
    newSet() { return serialized(async () => { requireEnabled(); applySettings(saved.settings, true); await persist(); settingsAnnouncement('A fresh improvisation is beginning.'); return service.status(); }); },
    neverStop(value) { return serialized(async () => {
      requireEnabled(value === false); if (typeof value !== 'boolean') throw error('Choose whether Never stop is on.');
      saved.neverStop = value; if (value) saved.running = true; saved.nextShuffleAt = value ? now() + JAZZ_HOUR : null; saved.revision++;
      try { await persist(); }
      catch { lastError = value ? storageError : 'Never stop is unlocked for this run. Keeper could not save the change; press Stop to end the broadcast here, then repair storage before restarting.'; throw error(lastError, 503); }
      if (value && !running) await startSource(); settingsAnnouncement(value ? 'Never stop is on. The players will shuffle each hour.' : 'Never stop is off. The broadcast can be stopped.');
      return service.status();
    }); },
    voice(value) { return serialized(async () => {
      requireEnabled(); if (typeof value !== 'boolean') throw error('Choose whether voice updates are on.'); saved.voice = value; saved.revision++;
      if (!value) { voiceSamples = null; pendingSpeech = null; clearTimeout(announceTimer); } await persist(); if (value) worldAnnouncement(); return service.status();
    }); },
    dig(requestId) { return serialized(async () => {
      requireEnabled(); if (!validJazzRequestId(requestId)) throw error('A fresh keepsake request is required.');
      const existing = library.findRequest(requestId); if (existing) return { id: existing.record.id, requestId, status: 'saved', receipt: existing };
      const previousJob = jobs.get(requestId); if (previousJob) return { ...previousJob, receipt: previousJob.receipt || null };
      if (!running || recent.length < 4 || !current) throw error('Let four chords play before saving this moment.', 409);
      if (!library.status().available) throw error(library.status().error || 'The chord library is unavailable.', 503);
      if ([...jobs.values()].filter(j => ['collecting', 'saving'].includes(j.status)).length >= 2) throw error('Two passages are already being saved. Wait for them to finish.', 429);
      while (jobs.size >= 20) { const key = [...jobs.keys()].find(key => !['collecting','saving'].includes(jobs.get(key).status)); if (!key) break; jobs.delete(key); }
      const job = { id: randomUUID(), requestId, status: 'collecting', message: 'Keeping four chords before this moment and the four starting here…',
        begin: current.meta.ordinal - 4, end: current.meta.ordinal + 3, capturedAt: new Date(now()).toISOString(), tick: tickAt(now()) };
      jobs.set(requestId, job); return { id: job.id, requestId, status: job.status, message: job.message };
    }); },
    library(offset = 0) {
      if (!Number.isInteger(offset) || offset < 0 || offset > 1999) throw error('Invalid library page.');
      const status = library.status(); return { ...status, receipts: library.list(offset), offset, nextOffset: offset + 50 < status.count ? offset + 50 : null };
    },
    audio(sha256) { return library.audio(sha256); },
    listen(res) { if (!running || !monitor) throw error('Start broadcasting, then press Listen here.', 409); return monitor.subscribe(res); },
    async receipt() {
      requireEnabled(); if (!lastInfo) throw error('Start Jazz before making a chord receipt.', 409);
      const record = { format: JAZZ_NOW_FORMAT, issuedAt: new Date(now()).toISOString(), tick: tickAt(now()), info: lastInfo,
        settings: { ...saved.settings }, message: 'A signed chord snapshot. Use I dig this! to save eight chords with replay audio.' };
      return { record, publicKey: signer.publicKey, signature: await signer.sign(record) };
    },
    context() { requireEnabled(); if (!renderer?.info) throw error('Start Jazz before naming this set.', 409); return validateJazzContext({ ...renderer.info, motif: renderer.events.filter(e => e.role === 'melody').map(e => e.note).slice(0, 8) }); },
    beat(input) {
      requireEnabled();
      if (!running || !renderer?.info || input.targetSet !== renderer.info.set || input.targetSeed !== renderer.info.seed || typeof input.requestId !== 'string' || !/^[a-z0-9-]{1,64}$/i.test(input.requestId)) throw error('The set changed. Your paid title and beat remain saved; apply them to the current set when ready.', 409);
      let result; try { result = validateJazzResult(input.result); } catch { throw error('The saved beat was invalid.'); }
      renderer.configure({ jazzPart: { ...input, result } }); return { queued: true };
    },
    // Deterministic clock/audio advancement is injected in tests; production uses schedule().
    advance(frames = 1) { if (automatic || !Number.isInteger(frames) || frames < 1 || frames > 500) throw new Error('Manual rendering is disabled.'); for (let i = 0; i < frames; i++) renderFrame(); periodic(); },
    async close() {
      closing = true; clearTimeout(timer); clearTimeout(announceTimer); world.close?.(); voice.close(); await chain; await haltResources();
      await Promise.allSettled([...tasks]); await captureChain; await persistence; await library.close();
    }
  };
  if (enabled && saved.running && !storageError) remember(serialized(startSource).catch(() => { if (automatic) remember(recover('Jazz is retrying its server connection.')); }));
  return service;
}
