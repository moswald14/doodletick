// SPDX-License-Identifier: GPL-3.0-only
// In-process DOM and deferred HTTP boundaries exercise the shipped UI. No browser,
// wallets, audio output, network services or live Keeper data are used here.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { DJ_GENRES } from '../public/jazz-genres.mjs';
import { JAZZ_DEFAULT_SETTINGS } from '../public/jazz-radio-contract.mjs';

const html = await readFile(new URL('../public/jazz.html', import.meta.url), 'utf8');
const source = (await readFile(new URL('../public/jazz-radio-ui.mjs', import.meta.url), 'utf8'))
  .replace(/^import[^\n]*\n/gm, '').replace('export async function initializeJazzRadioUI', 'async function initializeJazzRadioUI');
const copy = value => JSON.parse(JSON.stringify(value));
const flush = () => new Promise(resolve => setImmediate(resolve));
const info = { seed: 7, set: 1, style: 'swing', key: 'C major', chord: 'Cmaj9', phase: 'Call', tempo: 112, bar: 1, bars: 32, chorus: 1, beat: 0 };
function station() {
  return { enabled: true, running: true, starting: false, revision: 1, settings: { ...JAZZ_DEFAULT_SETTINGS }, info: { ...info },
    namingEvent: null, neverStop: false, nextShuffleAt: null, voice: false, voiceStatus: { error: '' },
    transport: { peers: 0 }, listenerUrl: 'https://example.invalid/fixture-listener', color: { color: '#123456' },
    recentChords: [], jobs: [], canDig: false, seconds: 0, error: '' };
}
const reply = (value, status = 200) => ({ ok: status >= 200 && status < 300, status, async json() { return copy(value); } });

async function fixture(t, pages = new Map([[0, { count: 0, receipts: [], offset: 0, nextOffset: null }]]), prefs = null) {
  const elements = new Map(), selectors = new Map(), timers = new Map(), windowEvents = new Map(), documentEvents = new Map(), requests = [], pending = [], received = [], audioPlayers = [];
  let remote = station(), nextTimer = 0, namingOptions, bandOptions, bandDisposed = false, disposed = false, holdStatus = false, heldPoll, holdLibrary = false, heldLibrary;
  class Element {
    constructor(tagName = 'div') {
      this.tagName = tagName.toUpperCase(); this.children = []; this.listeners = new Map(); this.attributes = new Map(); this.dataset = {}; this.style = {};
      this.hidden = false; this.disabled = false; this.textContent = ''; this._value = ''; this.lastChild = { textContent: '' };
      this.classList = { add() {}, toggle() {} };
      if (this.tagName === 'AUDIO') { this.paused = true; this.pauseCalls = 0; this.loadCalls = 0; audioPlayers.push(this); }
    }
    set id(value) { this._id = value; elements.set(value, this); } get id() { return this._id; }
    set value(value) { this._value = String(value); } get value() { return this._value; }
    set src(value) { this.setAttribute('src', value); } get src() { return this.getAttribute('src') || ''; }
    setAttribute(name, value) { this.attributes.set(name, String(value)); } getAttribute(name) { return this.attributes.get(name) ?? null; }
    removeAttribute(name) { this.attributes.delete(name); }
    addEventListener(name, fn) { const listeners = this.listeners.get(name) || []; listeners.push(fn); this.listeners.set(name, listeners); }
    fire(name) { for (const fn of this.listeners.get(name) || []) void fn({ target: this, preventDefault() {} }); }
    append(...children) { this.children.push(...children); } replaceChildren(...children) { this.children = children; }
    after(...children) { this.afterChildren = children; } closest() { return generic('cast-tool'); }
    querySelector(selector) { return generic(selector); } click() { if (!this.disabled) this.fire('click'); } focus() {}
    async play() { this.paused = false; } pause() { this.paused = true; this.pauseCalls++; } load() { this.loadCalls++; }
  }
  const generic = selector => { if (!selectors.has(selector)) selectors.set(selector, new Element()); return selectors.get(selector); };
  for (const match of html.matchAll(/\bid="([^"]+)"/g)) { const element = new Element(); element.id = match[1]; }
  const tabs = Object.keys(DJ_GENRES).map(style => { const button = new Element('button'); button.dataset.style = style; return button; });
  const muteButtons = ['piano', 'bass', 'drums'].map(key => { const button = new Element('button'); button.dataset.mute = key; return button; });
  const document = {
    body: new Element('body'), documentElement: new Element('html'), activeElement: null,
    getElementById(id) { assert(elements.has(id), 'Shipped Jazz HTML contains ' + id); return elements.get(id); },
    querySelector(selector) { return selector === '.jazz-tool #cast-jazz' ? elements.get('cast-jazz') : generic(selector); },
    querySelectorAll(selector) { return selector === '[data-style]' ? tabs : selector === '[data-mute]' ? muteButtons : [new Element(), new Element(), new Element(), new Element()]; },
    createElement: tag => new Element(tag), createTextNode: text => ({ textContent: text }), addEventListener(name, handler) { documentEvents.set(name, handler); }
  };
  const fetch = async (url, options = {}) => {
    const action = String(url).split('/api/jazz-radio/')[1];
    requests.push({ action, options: copy({ ...options, signal: undefined }) });
    if (options.method === 'POST') return new Promise(resolve => pending.push({ action, input: JSON.parse(options.body), resolve }));
    if (action === 'status') {
      if (holdStatus) { holdStatus = false; const value = copy(remote); return new Promise(resolve => { heldPoll = () => resolve(reply(value)); }); }
      return reply(remote);
    }
    if (action.startsWith('library')) {
      const offset = Number(new URL('http://fixture/' + action).searchParams.get('offset') || 0), value = pages.get(offset);
      assert(value, 'Fixture has a library page for offset ' + offset);
      if (offset && holdLibrary) { holdLibrary = false; return new Promise(resolve => { heldLibrary = error => resolve(error ? reply({ error }, 503) : reply(value)); }); }
      return reply(value);
    }
    throw new Error('Unexpected fixture route: ' + action);
  };
  const context = vm.createContext({
    document, window: { addEventListener: (name, fn) => windowEvents.set(name, fn) },
    localStorage: { getItem: () => prefs ? JSON.stringify(prefs) : null, setItem() {} }, Audio: class extends Element { constructor() { super('audio'); } },
    fetch, DJ_GENRES, JAZZ_DEFAULT_SETTINGS, checkSignature: async () => true,
    createJazzNamingUI(options) { namingOptions = options; return { receive: data => received.push(copy(data)), playbackChanged() {}, dispose() { disposed = true; } }; },
    createJazzBandUI(options) { bandOptions = options; return { paint() {}, dispose() { bandDisposed = true; } }; },
    setTimeout(fn, delay) { const id = ++nextTimer; timers.set(id, { fn, delay }); return id; }, clearTimeout: id => timers.delete(id),
    AbortSignal: { timeout: () => ({}) }, URL, Blob, Date, console, navigator: { clipboard: { writeText: async () => {} } }
  });
  vm.runInContext(source + '\nglobalThis.mount = initializeJazzRadioUI;', context);
  assert.equal(await context.mount(), true); await flush();
  t.after(() => windowEvents.get('pagehide')?.());
  const field = id => document.getElementById(id);
  return {
    field, requests, pending, received, pages, naming: () => namingOptions, band: () => bandOptions, bandDisposed: () => bandDisposed, disposed: () => disposed, monitor: () => audioPlayers[0],
    remote: () => remote, setRemote(value) { remote = copy(value); },
    input(id, value) { field(id).value = value; field(id).fire('input'); }, click(id) { field(id).click(); },
    timer(delay) { const entry = [...timers].find(([, item]) => item.delay === delay); if (!entry) return false; timers.delete(entry[0]); void entry[1].fn(); return true; },
    resolve(index, values = {}) {
      const request = pending[index]; assert(request, 'Deferred UI request exists');
      if (values.error) return request.resolve(reply({ error: values.error }, 400));
      if (request.action === 'beat') return request.resolve(reply({ queued: true }));
      remote = { ...remote, revision: remote.revision + 1, settings: copy(values.settings || request.input), ...values };
      request.resolve(reply(remote));
    },
    holdPoll() { holdStatus = true; }, releasePoll() { assert(heldPoll); heldPoll(); },
    holdOlderPage() { holdLibrary = true; }, releaseOlderPage(error) { assert(heldLibrary); heldLibrary(error); },
    key(key, { code = key, targetTag = 'DIV', ctrlKey = false, metaKey = false, altKey = false } = {}) { documentEvents.get('keydown')?.({ key, code, target: { tagName: targetTag }, ctrlKey, metaKey, altKey, preventDefault() {} }); },
    leave() { windowEvents.get('pagehide')?.(); }
  };
}

test('a slow settings response cannot overwrite newer input before its debounce fires', async t => {
  const f = await fixture(t);
  f.input('tempo', 140); f.timer(400); await flush(); assert.equal(f.pending.length, 1);
  f.input('bass', 44); f.resolve(0); await flush();
  assert.equal(f.field('bass').value, '44'); assert.equal(f.field('tempo').value, '140');
  f.timer(400); await flush(); assert.deepEqual(f.pending[1].input, { ...JAZZ_DEFAULT_SETTINGS, tempo: 140, bass: 44 });
  f.resolve(1); await flush(); assert.equal(f.field('bass').value, '44'); assert.equal(f.remote().settings.bass, 44);
});

test('queued full arrangements preserve all newer edits until the newest save completes', async t => {
  const f = await fixture(t);
  f.input('room', 21); f.timer(400); await flush();
  f.input('piano', 35); f.timer(400); await flush();
  f.input('drums', 52); f.timer(400); await flush(); assert.equal(f.pending.length, 1, 'settings writes are serialized');
  f.resolve(0); await flush(); assert.equal(f.pending[1].input.piano, 35); assert.equal(f.field('drums').value, '52');
  f.resolve(1); await flush(); assert.deepEqual(f.pending[2].input, { ...JAZZ_DEFAULT_SETTINGS, room: 21, piano: 35, drums: 52 });
  f.resolve(2); await flush(); assert.equal(f.field('piano').value, '35'); assert.equal(f.field('drums').value, '52');
});

test('an older poll and an older shuffle response cannot restore obsolete settings', async t => {
  const f = await fixture(t); f.holdPoll(); f.timer(1250); await flush();
  f.input('tempo', 145); f.timer(400); await flush(); f.resolve(0); await flush(); f.releasePoll(); await flush();
  assert.equal(f.field('tempo').value, '145', 'lower revision poll does not undo a saved edit');
  f.click('shuffle-settings'); await flush(); f.input('piano', 24);
  f.resolve(1, { settings: { ...JAZZ_DEFAULT_SETTINGS, style: 'modal', tempo: 100 } }); await flush();
  assert.equal(f.field('piano').value, '24'); assert.equal(f.field('tempo').value, '145');
  f.timer(400); await flush(); assert.equal(f.pending[2].input.piano, 24); assert.equal(f.pending[2].input.tempo, 145);
  f.resolve(2); await flush(); assert.equal(f.field('piano').value, '24');
});

test('cached naming events are delivered once and normal info still announces a fresh set', async t => {
  const f = await fixture(t), requestId = 'fixture-name';
  f.setRemote({ ...f.remote(), namingEvent: { sequence: 1, info: { partApplied: requestId, set: 1 } }, info: { ...info, namedTitle: 'Warm Window' } });
  f.timer(1250); await flush(); f.timer(1250); await flush();
  assert.equal(f.received.filter(event => event.partApplied === requestId).length, 1);
  f.setRemote({ ...f.remote(), namingEvent: { sequence: 2, info: { partRejected: 'stale-name', reason: 'SET_CHANGED' } }, info: { ...info, set: 2 } });
  f.timer(1250); await flush();
  assert.equal(f.received.filter(event => event.partRejected === 'stale-name').length, 1);
  assert(f.received.some(event => event.set === 2 && !event.namedTitle && !event.partRejected));
});

test('an Undo reply cannot discard adjustments made while restoring the old arrangement', async t => {
  const f = await fixture(t);
  f.click('shuffle-settings'); await flush(); f.resolve(0, { settings: { ...JAZZ_DEFAULT_SETTINGS, style: 'cool', tempo: 94 } }); await flush();
  assert.equal(f.field('undo-shuffle').hidden, false); f.click('undo-shuffle'); await flush();
  f.input('bass', 57); f.resolve(1); await flush(); assert.equal(f.field('bass').value, '57');
  f.timer(400); await flush(); assert.equal(f.pending[2].input.bass, 57); assert.equal(f.pending[2].input.style, 'cool');
  f.resolve(2); await flush(); assert.equal(f.field('bass').value, '57');
});

test('a failed beat request releases naming for retry and preserves the server error for the listener', async t => {
  const f = await fixture(t);
  f.naming().applyResult('stale-name', { title: 'Fixture' }, info); await flush();
  assert.equal(f.pending[0].action, 'beat'); assert.equal(f.pending[0].input.targetSet, info.set);
  f.resolve(0, { error: 'The Jazz set changed. Choose Apply beat again.' }); await flush();
  assert(f.received.some(event => event.partRejected === 'stale-name'));
  assert.match(f.field('status').textContent, /set changed/);
  f.leave(); assert.equal(f.disposed(), true);
});

test('band meter, phrase, beat-only and key edits preserve the full station settings through its existing debounce', async t => {
  const f = await fixture(t);
  f.band().changeSettings({ beatsPerBar: 7, phraseBars: 8, beatOnly: true, keyRoot: 9 });
  assert.equal(f.pending.length, 0); f.timer(400); await flush();
  assert.deepEqual(f.pending[0].input, { ...JAZZ_DEFAULT_SETTINGS, beatsPerBar: 7, phraseBars: 8, beatOnly: true, keyRoot: 9 });
  f.resolve(0); await flush(); assert.equal(f.remote().settings.beatsPerBar, 7);
  f.leave(); assert.equal(f.bandDisposed(), true);
});

test('keyboard listening and mute remain local, new set is explicit, and editing controls keep their own keys', async t => {
  const f = await fixture(t); f.key('m'); assert.equal(f.monitor().muted, true); assert.equal(f.pending.length, 0);
  for (const targetTag of ['INPUT', 'SELECT', 'TEXTAREA', 'BUTTON', 'A']) f.key('m', { targetTag });
  assert.equal(f.monitor().muted, true); f.key(' ', { code: 'Space' }); await flush(); assert.equal(f.monitor().paused, false); assert.equal(f.pending.length, 0);
  f.key('n', { ctrlKey: true }); f.key('n', { targetTag: 'SELECT' }); assert.equal(f.pending.length, 0);
  f.key('n'); await flush(); assert.equal(f.pending.length, 1); assert.equal(f.pending[0].action, 'new-set'); f.resolve(0, { settings: { ...JAZZ_DEFAULT_SETTINGS } }); await flush();
});

function receipt(index) {
  return { publicKey: 'fixture', signature: 'fixture', record: { id: 'passage-' + index, capturedAt: '2026-11-17T12:00:00Z', durationMs: 8000,
    chords: [{ style: 'swing', chord: 'Cmaj9' }], audio: { sha256: index.toString(16).padStart(64, '0') } } };
}
function libraryPages(count) {
  const receipts = Array.from({ length: count }, (_, index) => receipt(count - index));
  return new Map([[0, { count, error: '', receipts: receipts.slice(0, 50), offset: 0, nextOffset: count > 50 ? 50 : null }],
    [50, { count, error: '', receipts: receipts.slice(50), offset: 50, nextOffset: null }]]);
}

test('older permanent passages append once, replay without autoplay and reset to newest when the library grows', async t => {
  const f = await fixture(t, libraryPages(51)), list = f.field('saved-chords');
  assert.equal(list.children.length, 50); assert.equal(f.field('library-more').hidden, false);
  f.click('library-more'); await flush(); assert.equal(list.children.length, 51); assert.equal(f.field('library-more').hidden, true);
  const audios = list.children.map(article => article.children.find(child => child.tagName === 'AUDIO'));
  assert.equal(audios.length, 51); assert(audios.every(audio => audio.controls && audio.preload === 'none' && !audio.autoplay));
  assert.equal(new Set(audios.map(audio => audio.src)).size, 51);
  for (const [offset, page] of libraryPages(52)) f.pages.set(offset, page);
  f.timer(1250); await flush(); assert.equal(list.children.length, 50); assert.equal(f.field('library-more').hidden, false);
  assert.match(f.field('library-status').textContent, /Showing 50 of 52/);
});

test('an older page arriving after a new save cannot append an obsolete library window', async t => {
  const f = await fixture(t, libraryPages(51)); f.holdOlderPage(); f.click('library-more'); await flush();
  for (const [offset, page] of libraryPages(52)) f.pages.set(offset, page);
  f.timer(1250); await flush(); assert.equal(f.field('saved-chords').children.length, 50);
  f.releaseOlderPage(); await flush(); assert.equal(f.field('saved-chords').children.length, 50);
  f.click('library-more'); await flush(); assert.equal(f.field('saved-chords').children.length, 52);
});

test('a newly shifted older-page window refreshes page zero and a failed load can be retried without losing passages', async t => {
  const f = await fixture(t, libraryPages(51));
  for (const [offset, page] of libraryPages(52)) f.pages.set(offset, page);
  f.click('library-more'); await flush(); assert.equal(f.field('saved-chords').children.length, 50);
  assert.match(f.field('library-status').textContent, /Showing 50 of 52/);
  f.holdOlderPage(); f.click('library-more'); await flush(); f.releaseOlderPage('The library is reconnecting. Try again.'); await flush();
  assert.equal(f.field('saved-chords').children.length, 50); assert.equal(f.field('library-more').disabled, false);
  assert.match(f.field('library-status').textContent, /Try again/);
  f.click('library-more'); await flush(); assert.equal(f.field('saved-chords').children.length, 52); assert.equal(f.field('library-more').hidden, true);
});

const replayPlayers = f => f.field('saved-chords').children.map(article => article.children.find(child => child.tagName === 'AUDIO'));

test('saved passage players inherit stored local mute and volume, including passages loaded later', async t => {
  const f = await fixture(t, libraryPages(51), { volume: 23, muted: true });
  assert(replayPlayers(f).every(audio => audio.volume === 0.23 && audio.muted === true));
  f.input('volume', 61); f.click('mute'); f.click('library-more'); await flush();
  assert.equal(replayPlayers(f).length, 51);
  assert(replayPlayers(f).every(audio => audio.volume === 0.61 && audio.muted === true));
  assert.equal(f.pending.length, 0, 'local output preferences never write station settings');
});

test('one local volume and mute update every playing replay and the monitor without stopping the broadcast', async t => {
  const f = await fixture(t, libraryPages(3)), players = replayPlayers(f);
  f.click('play'); await flush(); for (const audio of players) await audio.play();
  f.input('volume', 16);
  assert([...players, f.monitor()].every(audio => audio.volume === 0.16 && audio.muted === false && audio.paused === false));
  f.click('mute'); assert([...players, f.monitor()].every(audio => audio.muted === true && audio.paused === false));
  f.click('mute'); assert([...players, f.monitor()].every(audio => audio.muted === false));
  assert.equal(f.remote().running, true); assert.equal(f.pending.length, 0);
});

test('library reset and leaving the page release removed local players while the server keeps broadcasting', async t => {
  const f = await fixture(t, libraryPages(2)), oldPlayers = replayPlayers(f);
  f.click('play'); await flush(); for (const audio of oldPlayers) await audio.play();
  for (const [offset, page] of libraryPages(3)) f.pages.set(offset, page);
  f.timer(1250); await flush();
  assert(oldPlayers.every(audio => audio.paused && audio.src === '' && audio.pauseCalls >= 1 && audio.loadCalls >= 1));
  assert.equal(f.monitor().paused, false, 'refreshing the saved library leaves local live listening alone');
  const current = replayPlayers(f); f.input('volume', 77);
  assert(current.every(audio => audio.volume === 0.77)); assert(oldPlayers.every(audio => audio.volume === 0.45), 'released players are no longer retained by the master controls');
  for (const audio of current) await audio.play();
  f.leave();
  assert([...current, f.monitor()].every(audio => audio.paused && audio.src === '' && audio.pauseCalls >= 1 && audio.loadCalls >= 1));
  assert.equal(f.disposed(), true); assert.equal(f.remote().running, true);
  assert.equal(f.requests.filter(request => request.options.method === 'POST').length, 0, 'cleanup never sends Stop or any other station mutation');
});
