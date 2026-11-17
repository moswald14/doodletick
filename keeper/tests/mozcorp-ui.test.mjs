// SPDX-License-Identifier: GPL-3.0-only
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createMozCorpUI, parseMozCorpImport, validateMozCorpHandoff } from '../public/mozcorp-ui.mjs';

const copy = value => JSON.parse(JSON.stringify(value));
const turn = () => new Promise(resolve => setImmediate(resolve));
const gate = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
const cloud = source => ({ format: 'btw-cloud-state-v1', savedAt: '2026-11-17T12:00:00.000Z', seed: source,
  sourceHandling: 'fiction', tone: 'unhinged', calls: 7, damage: 0, brains: 3, gens: 1, consensus: 'interesting', characterLens: 'open',
  preStory: { word: 'word', character: '', hive: '' }, firewall: 'FINAL STORY // EXIT EXCLUDED' });
const record = (id = 'original-world', source = 'ORIGINAL A') => ({ kind: 'doodleverse-telephone-project', version: 1, id, title: id,
  createdAt: '2026-11-17T12:00:00.000Z', updatedAt: '2026-11-17T12:00:00.000Z', revision: 1,
  sourceText: source, sourceMode: 'fiction', masterText: 'MASTER A', storyText: 'STORY A', poemText: 'POEM A', characterText: 'CHARACTER A', asciiText: 'ASCII A', soundtrack: null,
  machine: { engine: 'mozcorp-v13', mozcorp: { version: 1, station: 'machine', cloud: cloud(source) } } });
function makeBridge(initial = [], options = {}) {
  const records = new Map(initial.map(item => [item.id, copy(item)])), saved = [], downloads = [], reads = [];
  return {
    records, saved, downloads, reads, MAX_BYTES: 16000000,
    make(title = 'New world') { return { ...record(crypto.randomUUID(), ''), title, revision: 0, masterText: '', storyText: '', poemText: '', characterText: '', asciiText: '', machine: {} }; },
    validate(value) { assert(value?.kind === 'doodleverse-telephone-project'); assert.equal(value.version, 1); assert.equal(typeof value.id, 'string'); return copy(value); },
    async get(id) { reads.push(id); return records.has(id) ? copy(records.get(id)) : null; },
    async list() { return [...records.values()].map(item => ({ id: item.id, title: item.title, engine: item.machine.engine, station: item.machine.mozcorp?.station })); },
    async save(value) {
      saved.push(copy(value));
      const persist = () => { const previous = records.get(value.id); assert.equal(value.revision || 0, previous?.revision || 0, 'Optimistic record revision must match.'); const next = { ...copy(value), revision: (previous?.revision || 0) + 1 }; records.set(value.id, next); return copy(next); };
      return options.save ? options.save(value, persist, saved.length) : persist();
    },
    download(value) { downloads.push(copy(value)); }, watch() { return () => {}; },
  };
}

test('legacy import preserves the entire original package as inert data and opens the real Bug World engine', () => {
  const bridge = makeBridge();
  const original = { format: 'mozcorp-bugworld-package-v1', name: 'Legacy world', exported_at: '2026-10-04T08:31:08Z',
    contract: { import_behavior: 'RESTORE ONLY // NEVER AUTORUN' },
    state: { fields: { seed: '  exact source\n', teenMode: false, soundVolume: '50' }, bugWorld: { bugs: 19, genes: ['slow', 'bright'], species: ['a'], battle: { care: 17 } },
      newWorldLineage: { generation: 9, lineage: [{ name: 'Old realm' }] }, upgradeKit: { history: [{ script: 'globalThis.privateImportExecuted = true;' }] } } };
  const imported = parseMozCorpImport(JSON.stringify(original), bridge);
  assert.equal(imported.machine.engine, 'mozcorp-bug-world-v2');
  assert.equal(imported.machine.mozcorp.station, 'bug-world');
  assert.deepEqual(imported.machine.legacy, original);
  assert.equal(imported.sourceText, original.state.fields.seed);
  assert.equal(globalThis.privateImportExecuted, undefined);
  assert.equal(bridge.saved.length, 0);
  assert.throws(() => parseMozCorpImport('{"format":"mozcorp-bugworld-package-v1","__proto__":{}}', bridge), /unsafe/);
  const tooLarge = copy(original); tooLarge.state.fields.seed = 'x'.repeat(250001);
  assert.throws(() => parseMozCorpImport(JSON.stringify(tooLarge), bridge), /too large/);
});

test('portable imports become a separate copy while keeping their complete Studio score', () => {
  const bridge = makeBridge(), original = record();
  original.soundtrack = { kind: 'dot-studio-project', version: 2, song: { audio: [{ samples: Array(10000).fill(0.125) }] } };
  const imported = parseMozCorpImport(JSON.stringify(original), bridge);
  assert.notEqual(imported.id, original.id); assert.equal(imported.revision, 0);
  assert.deepEqual(imported.soundtrack, original.soundtrack);
  assert.equal(bridge.saved.length, 0);
});

test('EVERYWHEN handoffs accept only the narrow fiction cue and reject private receipt fields', () => {
  const key = 'btw-everywhen-fiction-cue-v1';
  const cue = { format: 'everywhen.fiction-cue.v1', fictional: true, scene: 3, icon: { palette: 'citron', shape: 'circle', symbol: 'ring', pattern: '91c36a5e', source: 'custom' } };
  const allowed = { [key]: JSON.stringify(cue) };
  assert.deepEqual(validateMozCorpHandoff(allowed), allowed);
  assert.throws(() => validateMozCorpHandoff({ [key]: JSON.stringify({ ...cue, note: 'private sensation' }) }), /fictional/);
  assert.throws(() => validateMozCorpHandoff({ [key]: JSON.stringify({ ...cue, icon: { ...cue.icon, palette: 'private note' } }) }), /icon/);
  assert.throws(() => validateMozCorpHandoff({ arbitrary: 'anything' }), /unsupported/);
});

async function harness(options = {}) {
  const globals = ['document', 'window', 'location', 'localStorage', 'DoodleBridge', 'fetch', 'Option', 'confirm'];
  const previous = new Map(globals.map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  const elements = new Map(), listeners = new Map(), frames = [], fetches = [], storage = new Map(), writes = [];
  const bridge = options.bridge || makeBridge(options.records || [record()]);
  const info = { installed: options.installed !== false, name: 'Private rooms', expected: options.expected || { bytes: 1, sha256: '0'.repeat(64) }, originalUrl: 'https://private.example',
    stations: [
      { id: 'machine', title: 'Whole machine', canonical: 'machine', startAnchor: '' },
      { id: 'recent', title: 'Recent', canonical: 'machine', startAnchor: 'recentTransmissions' },
      { id: 'voodont', title: 'VooDon’t', canonical: 'machine', startAnchor: 'voodontTool' },
      { id: 'bug-world', title: 'Bug World', canonical: 'bug-world', startAnchor: '' },
      { id: 'everywhen', title: 'EVERYWHEN', canonical: 'everywhen', startAnchor: '' },
      { id: 'integrity', title: 'Integrity', canonical: 'integrity', startAnchor: '' },
    ] };
  if (!info.installed) info.stations = [];
  function emit(frame, data, origin = 'null', source = frame.contentWindow) {
    const event = { source, origin, data: { protocol: 'doodle-mozcorp/v1', stationId: frame.stationId, ...data } };
    for (const fn of listeners.get('message') || []) fn(event);
  }
  class Element {
    constructor(tag = 'div', id = '') { this.tagName = tag.toUpperCase(); this.id = id; this.value = ''; this.textContent = ''; this.children = []; this.dataset = {}; this.attributes = {}; this.events = new Map(); this.hidden = false; this.inert = false; this.disabled = false; this.classes = new Set(); this.classList = { toggle: (key, value) => value ? this.classes.add(key) : this.classes.delete(key) }; }
    set innerHTML(text) { this.html = text; for (const [, tag, attrs, id] of text.matchAll(/<([A-Za-z][\w-]*)\b([^>]*\bid="([^"]+)"[^>]*)>/g)) { const element = elements.get(id) || new Element(tag, id); for (const [, name, value] of attrs.matchAll(/([\w-]+)="([^"]*)"/g)) element.attributes[name] = value; if (element.attributes.value !== undefined) element.value = element.attributes.value; element.hidden = /\bhidden\b/.test(attrs); elements.set(id, element); } }
    querySelector(selector) { return elements.get(selector.slice(1)); }
    append(...children) { this.children.push(...children); for (const child of children) { child.parent = this; if (child.tagName === 'IFRAME') queueMicrotask(() => emit(child, { type: 'ready' })); } }
    replaceChildren(...children) { this.children = [...children]; }
    remove() { this.removed = true; if (this.parent) this.parent.children = this.parent.children.filter(child => child !== this); }
    setAttribute(key, value) { this.attributes[key] = value; }
    addEventListener(type, fn) { this.events.set(type, fn); }
    click() { return this.onclick?.({ target: this, preventDefault() {} }); }
    get contentDocument() { throw new Error('Parent must never inspect the private station DOM.'); }
  }
  function createFrame() {
    const frame = new Element('iframe'); frame.version = 0; frame.messages = []; frame.source = 'NEW SOURCE'; frame.mode = 'fiction'; frame.token = null;
    Object.defineProperty(frame, 'src', { get() { return this.url; }, set(value) { this.url = value; this.stationId = new URL(value).pathname.split('/').at(-1); } });
    frame.contentWindow = { postMessage(message) {
      frame.messages.push(copy(message));
      if (message.type === 'init') { frame.token = message.token; return; }
      if (message.type !== 'request') return;
      const respond = result => emit(frame, { type: 'response', token: frame.token, requestId: message.requestId, result });
      const reject = error => emit(frame, { type: 'response', token: frame.token, requestId: message.requestId, error: error.message || String(error) });
      queueMicrotask(async () => {
        try {
          if (options.request) { const handled = await options.request(frame, message, respond, reject); if (handled) return; }
          if (message.requestType === 'restore') {
            if (message.payload.machine.mozcorp?.cloud?.bad) throw new Error('Incoming state rejected before restoration.');
            frame.loaded = copy(message.payload); frame.source = message.payload.sourceText; frame.mode = message.payload.sourceMode;
            respond({ restored: true, engine: frame.stationId === 'bug-world' ? 'mozcorp-bug-world-v2' : 'mozcorp-v13', editVersion: frame.version });
          } else if (message.requestType === 'capture') {
            const value = { engine: frame.stationId === 'bug-world' ? 'mozcorp-bug-world-v2' : 'mozcorp-v13', editVersion: frame.version,
              sourceText: frame.source, sourceMode: frame.mode, masterText: frame.loaded?.masterText || '', storyText: frame.loaded?.storyText || '', poemText: frame.loaded?.poemText || '', characterText: frame.loaded?.characterText || '', asciiText: frame.loaded?.asciiText || '' };
            if (frame.stationId === 'machine') value.cloud = cloud(frame.source); else value.world = { format: 'mozcorp-bug-world-v2', state: { source: frame.source } };
            respond(value);
          } else if (message.requestType === 'checkpoint') respond({ editVersion: frame.version });
          else if (message.requestType === 'focus') respond({ focused: true, handoff: !!Object.keys(message.payload.session || {}).length, editVersion: frame.version });
          else if (message.requestType === 'stop') { frame.stopped = (frame.stopped || 0) + 1; respond({ stopped: true, editVersion: frame.version }); }
          else throw new Error('Unknown parent request.');
        } catch (error) { reject(error); }
      });
    } };
    frame.edit = text => { frame.source = text; frame.version++; emit(frame, { type: 'dirty', token: frame.token, editVersion: frame.version }); };
    frame.childSequence = 0;
    frame.childRequest = (requestType, payload, extra = {}) => emit(frame, { type: 'request', token: frame.token, requestId: 'child-' + (++frame.childSequence), requestType, payload, ...extra });
    frames.push(frame); return frame;
  }
  const document = { createElement: tag => tag === 'iframe' ? createFrame() : new Element(tag), hidden: false, addEventListener() {} };
  const container = new Element();
  const window = { addEventListener(type, fn) { if (!listeners.has(type)) listeners.set(type, []); listeners.get(type).push(fn); } };
  Object.assign(globalThis, { document, window, location: { search: '', href: 'http://keeper.example/', hash: '' }, DoodleBridge: bridge,
    localStorage: { getItem: key => storage.get(key) ?? null, setItem(key, value) { writes.push(key); storage.set(key, value); } },
    Option: class { constructor(text, value) { this.textContent = text; this.value = value; } }, confirm: () => true,
    fetch: async (url, request = {}) => {
      const path = new URL(url).pathname.split('/api/mozcorp/').at(-1), query = new URL(url).searchParams;
      fetches.push({ path, query, request });
      let result;
      if (options.fetch) result = await options.fetch(path, query, request, info);
      if (result === undefined) result = path === 'status' ? copy(info) : { items: [], sourceFeed: 'News RSS', grabbedAt: '2026-11-17T12:00:00Z' };
      return { ok: true, status: 200, json: async () => copy(result) };
    },
  });
  const ui = createMozCorpUI(container, { onVault: options.onVault, onWorld: options.onWorld, navigate() {} });
  const node = id => elements.get(id);
  async function settled() { await turn(); await turn(); }
  await settled();
  if (options.visible !== false && info.installed) { ui.setVisible(true); await settled(); }
  return { ui, node, frames, bridge, fetches, storage, writes, emit, info, settled,
    station: id => node('moz-stations').children.find(button => button.dataset.station === id),
    async open(id) { node('moz-projects').value = id; await node('moz-open').click(); await settled(); },
    warn() { const event = { prevented: false, preventDefault() { this.prevented = true; } }; for (const fn of listeners.get('beforeunload') || []) fn(event); return event.prevented; },
    cleanup() { for (const fn of listeners.get('pagehide') || []) fn({}); for (const [key, descriptor] of previous) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key]; } },
  };
}

test('parent frames remain sandboxed and ignore forged sources, origins, tokens and install requests', async () => {
  const h = await harness();
  try {
    const frame = h.frames[0];
    assert.equal(frame.attributes.sandbox, 'allow-scripts allow-forms allow-modals allow-downloads');
    assert(!frame.attributes.sandbox.includes('allow-same-origin'));
    assert.equal(frame.attributes.referrerpolicy, 'no-referrer');
    const forged = { type: 'request', token: frame.token, requestId: 'spoof', requestType: 'pref-set', payload: { key: 'btw.mozmoji.fork.v1', value: 'private' } };
    h.emit(frame, forged, 'https://attacker.example'); h.emit(frame, forged, 'null', {}); h.emit(frame, { ...forged, token: 'bad' });
    await h.settled(); assert.equal(h.writes.length, 0);
    frame.childRequest('pref-set', { key: 'btw.mozmoji.fork.v1', value: '[]' }); await h.settled();
    assert.deepEqual(h.writes, ['doodleverse-mozcorp-preferences-v1']);
    frame.childRequest('pref-set', { key: 'doodletick-vault', value: 'evil' });
    frame.childRequest('install/start', {}); await h.settled();
    assert.equal(h.writes.length, 1);
    assert(!h.fetches.some(call => call.path.startsWith('install')));
  } finally { h.cleanup(); }
});

test('failed candidate restore leaves active A and its Save target untouched without adding a broken project', async () => {
  const a = record(), bad = record('broken-world', 'BROKEN B'); bad.machine.mozcorp.cloud.bad = true;
  const h = await harness({ records: [a, bad] });
  try {
    await h.open(a.id); const frameA = h.frames.find(frame => !frame.removed && !frame.hidden);
    const beforeCount = h.bridge.saved.length;
    await h.open(bad.id);
    assert.equal(frameA.removed, undefined); assert.equal(frameA.hidden, false); assert.equal(frameA.inert, false);
    assert.match(h.node('moz-status').textContent, /Incoming state rejected/);
    assert.equal(h.bridge.saved.length, beforeCount);
    await h.node('moz-save').click();
    assert.equal(h.bridge.saved.at(-1).id, a.id);
    assert.equal(h.bridge.records.get(a.id).sourceText, 'ORIGINAL A');
  } finally { h.cleanup(); }
});

test('edits made while saving remain unsaved until the next captured version is persisted', async () => {
  const started = gate(), release = gate();
  const bridge = makeBridge([record()], { async save(value, persist, call) { if (call === 1) { started.resolve(); await release.promise; } return persist(); } });
  const h = await harness({ bridge });
  try {
    await h.open('original-world'); const frame = h.frames.find(item => !item.removed && !item.hidden);
    frame.edit('FIRST CAPTURE'); const saving = h.node('moz-save').click(); await started.promise;
    frame.edit('NEWER INPUT'); release.resolve(); await saving;
    assert.equal(bridge.records.get('original-world').sourceText, 'FIRST CAPTURE');
    assert.equal(h.node('moz-save').textContent, 'Save world ●'); assert.equal(h.warn(), true);
    await h.node('moz-save').click();
    assert.equal(bridge.records.get('original-world').sourceText, 'NEWER INPUT');
    assert.equal(h.node('moz-save').textContent, 'Save world'); assert.equal(h.warn(), false);
  } finally { h.cleanup(); }
});

test('a late edit during candidate restoration cancels the swap and a follow-up Save keeps active A', async () => {
  const started = gate(), release = gate();
  const h = await harness({ records: [record(), record('incoming-world', 'INCOMING B')],
    async request(frame, message) { if (message.requestType === 'restore' && message.payload.id === 'incoming-world') { started.resolve(); await release.promise; } return false; },
  });
  try {
    await h.open('original-world'); const frameA = h.frames.find(item => !item.removed && !item.hidden);
    const loading = h.open('incoming-world'); await started.promise;
    assert.equal(frameA.inert, true, 'A remains visible but cannot accept new pointer input while a candidate is pending.');
    frameA.edit('LATE A EDIT'); release.resolve(); await loading;
    assert.equal(frameA.removed, undefined); assert.equal(frameA.hidden, false); assert.equal(frameA.inert, false);
    assert.match(h.node('moz-status').textContent, /canceled because your current world changed/);
    assert.equal(h.warn(), true);
    await h.node('moz-save').click();
    assert.equal(h.bridge.records.get('original-world').sourceText, 'LATE A EDIT');
  } finally { h.cleanup(); }
});

test('saving preserves a newer Studio soundtrack and rejects another tab’s changed story', async () => {
  const a = record(), other = record('other-edition', 'DO NOT READ'); other.machine = {};
  const h = await harness({ records: [a, other] });
  try {
    assert(!h.bridge.reads.includes(other.id), 'Shelf filtering must use the public engine metadata.');
    await h.open(a.id); const frame = h.frames.find(item => !item.removed && !item.hidden);
    const track = { kind: 'dot-studio-project', version: 2, song: { name: 'New Studio score' } };
    h.bridge.records.get(a.id).soundtrack = track; h.bridge.records.get(a.id).revision++;
    frame.edit('LOCAL STORY'); await h.node('moz-save').click();
    assert.deepEqual(h.bridge.records.get(a.id).soundtrack, track);
    const previousWrites = h.bridge.saved.length;
    h.bridge.records.get(a.id).sourceText = 'OTHER TAB STORY'; h.bridge.records.get(a.id).revision++;
    frame.edit('ANOTHER LOCAL EDIT'); await h.node('moz-save').click();
    assert.equal(h.bridge.saved.length, previousWrites);
    assert.match(h.node('moz-status').textContent, /Another tab changed/);
    assert.equal(frame.source, 'ANOTHER LOCAL EDIT'); assert.equal(h.warn(), true);
  } finally { h.cleanup(); }
});

test('aliases reuse the canonical machine and personal desks never grant generic capture or save authority', async () => {
  const h = await harness();
  try {
    const first = h.frames[0];
    await h.station('recent').click(); await h.station('voodont').click();
    assert.equal(h.frames.length, 1);
    assert(first.messages.some(message => message.requestType === 'focus' && message.payload.anchor === 'recentTransmissions'));
    assert(first.messages.some(message => message.requestType === 'focus' && message.payload.anchor === 'voodontTool'));
    await h.station('everywhen').click(); const desk = h.frames.at(-1);
    assert.equal(h.node('moz-save').disabled, true);
    desk.childRequest('save', {}); await h.settled();
    assert(!desk.messages.some(message => message.requestType === 'capture'));
    assert.equal(h.bridge.saved.length, 0);
    h.ui.setVisible(false); await h.settled();
    assert(first.stopped > 0 && desk.stopped > 0);
  } finally { h.cleanup(); }
});

test('original cloud features expose an explicit safe link without automatically opening or sending room data', async () => {
  const h = await harness();
  try {
    const frame = h.frames[0]; frame.childRequest('open-original', { path: '/upgrades' }); await h.settled();
    assert.equal(h.node('moz-original-link').href, 'https://private.example/upgrades');
    assert.equal(h.node('moz-original-link').attributes.rel, 'noopener noreferrer');
    assert.equal(h.node('moz-original-link').attributes.target, '_blank');
    assert(!h.fetches.some(call => call.path.includes('upgrades')));
    frame.childRequest('open-original', { path: 'https://evil.example/' }); await h.settled();
    assert.equal(h.node('moz-original-link').href, 'https://private.example/upgrades');
  } finally { h.cleanup(); }
});

test('a canceled one-use handoff is retained for retry and consumed only after its successful focus acknowledgement', async () => {
  const cueKey = 'btw-everywhen-fiction-cue-v1'; let rejectFirst = true;
  const cue = JSON.stringify({ format: 'everywhen.fiction-cue.v1', fictional: true, scene: 2, icon: { palette: 'tide', shape: 'hexagon', symbol: 'wave', pattern: 'abc12345', source: 'custom' } });
  const h = await harness({ request(frame, message, respond, reject) {
    if (message.requestType === 'focus' && message.payload.session?.[cueKey] && rejectFirst) { rejectFirst = false; reject(new Error('Existing arrival kept; handoff canceled.')); return true; }
    return false;
  } });
  try {
    const machine = h.frames[0];
    await h.station('everywhen').click(); const desk = h.frames.at(-1);
    h.emit(desk, { type: 'navigate', token: desk.token, payload: { stationId: 'machine', anchor: 'everywhenStation', session: { [cueKey]: cue } } });
    await h.settled();
    assert.equal(desk.hidden, false); assert.match(h.node('moz-status').textContent, /handoff canceled/);
    await h.station('machine').click();
    assert.equal(machine.hidden, false);
    await h.station('recent').click();
    const handoffs = machine.messages.filter(message => message.requestType === 'focus' && message.payload.session?.[cueKey]);
    assert.equal(handoffs.length, 2, 'Only the failed attempt and successful retry carry the one-use cue.');
    assert.equal(machine.messages.at(-1).payload.session?.[cueKey], undefined);
    assert.equal(h.storage.size, 0, 'RAM handoffs must not become browser preferences.');
    await h.node('moz-save').click();
    assert(!JSON.stringify(h.bridge.saved).includes(cueKey), 'The cue transport must not enter narrative project storage.');
  } finally { h.cleanup(); }
});

test('approved private ZIP uploads use checked bounded chunks and protected mutation requests', async () => {
  const bytes = new Uint8Array(1073000).fill(71), sha256 = createHash('sha256').update(bytes).digest('hex');
  let uploaded = 0;
  const h = await harness({ installed: false, visible: false, expected: { bytes: bytes.length, sha256 },
    fetch(path, query, request, info) {
      if (path === 'install/start') return { uploadId: 'a'.repeat(32), chunkBytes: 262144, totalBytes: bytes.length };
      if (path === 'install/chunk') { assert.equal(+query.get('offset'), uploaded); assert(request.body.length <= 262144); uploaded += request.body.length; return { offset: uploaded, totalBytes: bytes.length }; }
      if (path === 'install/finish') { assert.equal(uploaded, bytes.length); info.installed = true; return copy(info); }
    },
  });
  try {
    const file = { size: bytes.length, arrayBuffer: async () => bytes.buffer.slice(0) };
    await h.node('moz-bundle-file').onchange({ target: { files: [file], value: 'bundle.zip' } });
    const mutations = h.fetches.filter(call => call.path.startsWith('install/'));
    assert.equal(mutations.filter(call => call.path === 'install/chunk').length, Math.ceil(bytes.length / 262144));
    for (const call of mutations) assert.equal(call.request.headers['X-Keeper-Request'], '1');
    assert.equal(h.node('moz-upload-progress').hidden, true);
    assert.equal(h.info.installed, true);
  } finally { h.cleanup(); }
});

test('a ZIP with the correct byte length but the wrong pinned hash never starts an installation', async () => {
  const expectedBytes = new Uint8Array(300000).fill(11), supplied = new Uint8Array(300000).fill(12);
  const h = await harness({ installed: false, visible: false, expected: { bytes: expectedBytes.length, sha256: createHash('sha256').update(expectedBytes).digest('hex') } });
  try {
    await h.node('moz-bundle-file').onchange({ target: { files: [{ size: supplied.length, arrayBuffer: async () => supplied.buffer }], value: 'different.zip' } });
    assert.match(h.node('moz-status').textContent, /differs from the approved private bundle/);
    assert(!h.fetches.some(call => call.path.startsWith('install/')));
    assert.equal(h.info.installed, false);
  } finally { h.cleanup(); }
});
