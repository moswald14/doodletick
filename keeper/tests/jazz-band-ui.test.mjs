// SPDX-License-Identifier: GPL-3.0-only
// Shipped component with a small in-process DOM. No browser/account/network data.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { djSuggestKey } from '../public/jazz-settings.mjs';
import { listJazzDotVoices, parseJazzDotVoice } from '../public/jazz-dot-voices.mjs';
import { JAZZ_DEFAULT_SETTINGS, JAZZ_BEAT_PATTERNS, JAZZ_METERS, JAZZ_PHRASE_BARS } from '../public/jazz-radio-contract.mjs';

const source = (await readFile(new URL('../public/jazz-band-ui.mjs', import.meta.url), 'utf8')).replace(/^import[^\n]*\n/gm, '').replace('export function createJazzBandUI', 'function createJazzBandUI');
const copy = value => JSON.parse(JSON.stringify(value));
const flush = () => new Promise(resolve => setImmediate(resolve));
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
const wave = (id = 'fixture-wave', name = 'Fixture wave') => ({ id, name, real: Array(128).fill(0), imag: Array.from({ length: 128 }, (_, index) => index === 1 ? .5 : 0), effects: [] });
const library = waves => JSON.stringify({ kind: 'dot-wave-library', version: 1, waves });

function fixture(t, { saved = library([wave()]) } = {}) {
  const elements = new Map(), nodes = [], storageReads = [], changes = [], actions = [], requests = [], downloads = [], blobs = new Map(), revoked = [], timers = new Map(), forbidden = [];
  let settings = { ...JAZZ_DEFAULT_SETTINGS }, station = { running: true, voice: true, info: { tonic: 0, beatsPerBar: 4 }, voiceStatus: { busy: false }, playerVoices: { parts: {} } }, timer = 0;
  class Element {
    constructor(tag = 'div') { this.tagName = tag.toUpperCase(); this.children = []; this.parentNode = null; this.listeners = new Map(); this.attributes = {}; this.className = ''; this._text = ''; this._value = ''; this.disabled = false; this.checked = false; this.files = []; nodes.push(this); }
    set id(value) { this._id = value; elements.set(value, this); } get id() { return this._id; }
    set textContent(value) { this._text = String(value); this.children = []; } get textContent() { return this._text + this.children.map(node => node.textContent || '').join(''); }
    set innerHTML(value) { forbidden.push(value); throw Error('The band UI must use text, never imported HTML.'); }
    set value(value) { this._value = String(value); } get value() { return this._value; }
    setAttribute(name, value) { this.attributes[name] = String(value); } getAttribute(name) { return this.attributes[name] ?? null; }
    addEventListener(name, handler) { const values = this.listeners.get(name) || []; values.push(handler); this.listeners.set(name, values); }
    removeEventListener(name, handler) { this.listeners.set(name, (this.listeners.get(name) || []).filter(value => value !== handler)); }
    fire(name, data = {}) { for (const handler of this.listeners.get(name) || []) void handler({ target: this, preventDefault() {}, ...data }); }
    append(...children) { for (const child of children) { if (child.parentNode) child.parentNode.children = child.parentNode.children.filter(node => node !== child); child.parentNode = this; this.children.push(child); if (this.tagName === 'SELECT' && this.children.length === 1 && !this._value) this._value = child.value; } }
    replaceChildren(...children) { for (const child of this.children) child.parentNode = null; this.children = []; this._text = ''; this.append(...children); }
    before(...children) { this.insert(children, 0); } after(...children) { this.insert(children, 1); }
    insert(children, offset) { if (!this.parentNode) return; const parent = this.parentNode, index = parent.children.indexOf(this) + offset; for (const child of children) child.parentNode = parent; parent.children.splice(index, 0, ...children); }
    closest(selector) { for (let node = this; node; node = node.parentNode) if (selector === '.feel' && node.className.split(' ').includes('feel')) return node; return null; }
    querySelector(selector) { const descendants = this.children.filter(child => child.tagName); return descendants.find(child => selector === 'label' && child.tagName === 'LABEL') || descendants.map(child => child.querySelector(selector)).find(Boolean) || null; }
    click() { if (this.disabled) return; if (this.tagName === 'A') downloads.push({ href: this.href, name: this.download }); this.fire('click'); }
  }
  const document = { activeElement: null, createElement: tag => new Element(tag), createTextNode: value => ({ textContent: String(value), parentNode: null }), getElementById: id => elements.get(id), querySelector: selector => selector === '.beat-dots' ? dots : null };
  const root = new Element('main'), feel = new Element(); feel.className = 'feel'; const label = new Element('label'), speed = new Element('input'), value = new Element('output'); speed.id = 'tempo'; value.id = 'tempo-value'; label.append(document.createTextNode('Tempo '), value); feel.append(label, speed); root.append(feel);
  for (const id of ['radio-tools', 'voice-status']) { const element = new Element(); element.id = id; root.append(element); }
  const dots = new Element(); dots.className = 'beat-dots'; dots.append(...Array.from({ length: 4 }, () => new Element('i'))); root.append(dots);
  const context = vm.createContext({ document, djSuggestKey, listJazzDotVoices, JAZZ_BEAT_PATTERNS, JAZZ_METERS, JAZZ_PHRASE_BARS, Blob, Date,
    crypto: { getRandomValues(array) { array[0] = 123456; return array; } },
    localStorage: { getItem(key) { storageReads.push(key); return saved; } },
    URL: { createObjectURL(blob) { const url = 'blob:fixture-' + blobs.size; blobs.set(url, blob); return url; }, revokeObjectURL: url => revoked.push(url) },
    setTimeout(callback, delay) { timers.set(++timer, { callback, delay }); return timer; }, clearTimeout: id => timers.delete(id),
    fetch: (...args) => { forbidden.push(args); throw Error('No band import may fetch a URL.'); },
    getSettings: () => settings, getStation: () => station,
    changeSettings(patch) { changes.push(copy(patch)); settings = { ...settings, ...copy(patch) }; },
    action(name, input) { const pending = deferred(); actions.push({ name, input: input === undefined ? undefined : copy(input), ...pending }); return pending.promise; },
    request(name) { const pending = deferred(); requests.push({ name, ...pending }); return pending.promise; }
  });
  vm.runInContext(source + '\nglobalThis.band=createJazzBandUI({getSettings,getStation,changeSettings,action,request});', context);
  const api = context.band, field = id => document.getElementById(id), button = label => { const found = nodes.find(node => node.tagName === 'BUTTON' && node.textContent === label); assert(found, label); return found; };
  api.paint(station, settings, false); t.after(() => api.dispose());
  return { api, field, button, nodes, storageReads, changes, actions, requests, downloads, blobs, revoked, forbidden, dots, speed, value, feel, label,
    paint(busy = false) { api.paint(station, settings, busy); }, station: () => station, setStation(value) { station = { ...station, ...value }; },
    change(id, value) { const control = field(id); if (typeof value === 'boolean') control.checked = value; else control.value = value; control.fire('change'); },
    file(value) { const input = nodes.find(node => node.tagName === 'INPUT' && node.type === 'file'); input.files = [value]; input.fire('change'); return input; },
    fileInput: () => nodes.find(node => node.tagName === 'INPUT' && node.type === 'file'),
    runTimers() { for (const entry of timers.values()) entry.callback(); timers.clear(); }
  };
}

test('speed keeps its existing input and meter, phrase, beat-only and key choices emit typed musical settings', t => {
  const f = fixture(t); assert.equal(f.field('tempo'), f.speed); assert.equal(f.speed.closest('.feel'), f.feel); assert.match(f.label.textContent, /^Speed /); assert.equal(f.speed.getAttribute('aria-label'), 'Speed in beats per minute');
  assert.deepEqual(f.field('beats-per-bar').children.map(option => option.value), ['2', '3', '4', '5', '6', '7']);
  for (const value of [2, 7]) f.change('beats-per-bar', value);
  f.change('phrase-bars', 16); f.change('phrase-bars', 'genre'); f.change('beat-pattern', 'latin'); f.change('beat-only', true); f.change('beat-only', false); f.change('key-root', 9); f.change('key-root', 'auto'); f.change('favor-likes', false);
  assert.deepEqual(f.changes, [{ beatsPerBar: 2 }, { beatsPerBar: 7 }, { phraseBars: 16 }, { phraseBars: 'genre' }, { beatPattern: 'latin' }, { beatOnly: true }, { beatOnly: false }, { keyRoot: 9 }, { keyRoot: 'auto' }, { favorLikes: false }]);
  f.field('suggest-key').click(); assert(Number.isInteger(f.changes.at(-1).keyRoot)); assert(f.changes.at(-1).keyRoot >= 0 && f.changes.at(-1).keyRoot < 12); assert.match(f.field('key-suggestion').textContent, /next bar/);
  f.setStation({ info: { beatsPerBar: 7 } }); f.paint(); assert.equal(f.dots.children.length, 7); assert.equal(f.actions.length, 0); assert.equal(f.storageReads.length, 0);
});

test('saved sounds load only after an explicit click and assigning or restoring a player requires its own successful action', async t => {
  const f = fixture(t, { saved: library([wave('first', 'First sound'), wave('second', 'Second sound')]) });
  assert.deepEqual(f.storageReads, []); assert.equal(f.actions.length, 0);
  f.button('Use saved Dot Wave sounds').click(); await flush(); assert.deepEqual(f.storageReads, ['dot-wave-v2-library']); assert.equal(f.actions.length, 0);
  assert.deepEqual(f.field('dot-voice-choice').children.map(option => option.textContent), ['Original trio voice', 'First sound', 'Second sound']);
  f.change('dot-voice-player', 'bass'); f.change('dot-voice-choice', '1'); f.button('Give voice to player').click(); await flush();
  assert.equal(f.actions[0].name, 'player-voice'); assert.equal(f.actions[0].input.part, 'bass'); assert.equal(f.actions[0].input.voice.name, 'Second sound'); assert.match(f.field('dot-voice-status').textContent, /Preparing/); assert.doesNotMatch(f.field('dot-voice-status').textContent, /Voice saved/);
  f.actions[0].resolve({}); await flush(); assert.match(f.field('dot-voice-status').textContent, /Voice saved/);
  f.change('dot-voice-choice', ''); f.button('Give voice to player').click(); await flush(); assert.deepEqual(f.actions[1].input, { part: 'bass', voice: null });
  f.actions[1].reject(Error('Keeper storage is full.')); await flush(); assert.match(f.field('dot-voice-status').textContent, /storage is full/); assert.doesNotMatch(f.field('dot-voice-status').textContent, /Voice saved/);
});

test('JSON import enforces file and recipe bounds and rejects a bad collection atomically', async t => {
  const f = fixture(t); let reads = 0;
  f.file({ size: 512 * 1024 + 1, async text() { reads++; return library([wave()]); } }); await flush(); assert.equal(reads, 0); assert.match(f.field('dot-voice-status').textContent, /512 KB/);
  f.file({ size: 100, async text() { reads++; return library([wave()]); } }); await flush(); assert.equal(f.field('dot-voice-choice').children.length, 2);
  const before = f.field('dot-voice-choice').children.map(option => option.textContent);
  for (const body of ['{not json', library(Array.from({ length: 33 }, (_, index) => wave('wave-' + index))), library([wave('good'), { ...wave('bad'), imag: Array(128).fill(0) }]), library([{ ...wave(), url: 'https://example.invalid/audio.wav' }]), 'x'.repeat(512 * 1024 + 1)]) {
    f.file({ size: 100, async text() { return body; } }); await flush(); assert.deepEqual(f.field('dot-voice-choice').children.map(option => option.textContent), before);
  }
  assert.equal(f.actions.length, 0); assert.deepEqual(f.forbidden, []);
});

test('untrusted sound names and credit URLs remain inert text and export preserves the editable normalized voice', async t => {
  const voice = parseJazzDotVoice({ ...wave('inert', '<img src=x onerror=run()>'), attribution: { creator: '<script>run()</script>', license: 'Fixture only', source: 'javascript:run()' } });
  const f = fixture(t); f.file({ size: 100, async text() { return JSON.stringify(voice); } }); await flush();
  assert.equal(f.field('dot-voice-choice').children[1].textContent, voice.name); assert(!f.nodes.some(node => ['IMG', 'SCRIPT', 'AUDIO'].includes(node.tagName))); assert.deepEqual(f.forbidden, []);
  f.change('dot-voice-player', 'piano'); f.button('Export player voice').click(); await flush(); assert.equal(f.requests[0].name, 'voices'); assert.equal(f.downloads.length, 0);
  f.requests[0].resolve({ assignments: { piano: voice } }); await flush(); assert.equal(f.downloads.length, 1); assert.equal(f.downloads[0].name, 'doodle-jazz-piano-voice.json'); assert.match(f.downloads[0].href, /^blob:/);
  assert.deepEqual(JSON.parse(await f.blobs.get(f.downloads[0].href).text()), voice); f.runTimers(); assert.deepEqual(f.revoked, [f.downloads[0].href]); assert.deepEqual(f.forbidden, []);
});

test('dispose suppresses late file loads, export downloads and later setting events', async t => {
  const f = fixture(t), pending = deferred(), previous = f.field('dot-voice-status').textContent;
  f.file({ size: 100, text: () => pending.promise }); await flush(); f.api.dispose(); pending.resolve(library([wave()])); await flush();
  assert.equal(f.field('dot-voice-choice').children.length, 1); assert.equal(f.field('dot-voice-status').textContent, previous);
  f.change('beats-per-bar', 7); f.change('key-root', 9); f.change('beat-only', true); f.field('suggest-key').fire('click'); assert.equal(f.changes.length, 0); assert.equal(f.actions.length, 0);
  const g = fixture(t); g.button('Export player voice').click(); await flush(); g.api.dispose(); g.requests[0].resolve({ assignments: { piano: parseJazzDotVoice(wave()) } }); await flush(); assert.equal(g.downloads.length, 0);
});

test('completion of local work cannot re-enable controls held busy by another station action', async t => {
  const f = fixture(t), pending = deferred(); f.file({ size: 100, text: () => pending.promise }); await flush();
  f.paint(false); assert.equal(f.button('Give voice to player').disabled, true, 'local preparation still owns its busy state');
  f.paint(true); pending.resolve(library([wave()])); await flush();
  for (const control of [f.field('beats-per-bar'), f.field('beat-only'), f.field('key-root'), f.button('Give voice to player'), f.button('Export player voice'), f.fileInput(), f.field('voice-test')]) assert.equal(control.disabled, true);
  f.paint(false); assert.equal(f.button('Give voice to player').disabled, false); assert.equal(f.field('beats-per-bar').disabled, false);
});

test('voice test availability follows running/voice state and cannot duplicate a pending action', async t => {
  const f = fixture(t); f.setStation({ voice: false }); f.paint(); assert.equal(f.field('voice-test').disabled, true); f.field('voice-test').click(); assert.equal(f.actions.length, 0);
  f.setStation({ voice: true, running: true }); f.paint(); f.field('voice-test').click(); await flush(); f.field('voice-test').click(); assert.equal(f.actions.length, 1); assert.equal(f.actions[0].name, 'voice-test');
  f.actions[0].resolve({}); await flush(); f.setStation({ voiceStatus: { busy: false, lastSuccessAt: Date.parse('2026-11-17T12:00:00Z') } }); f.paint(); assert.match(f.field('voice-check-status').textContent, /Voice checked/);
});
