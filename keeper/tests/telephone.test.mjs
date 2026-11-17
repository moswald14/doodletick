// SPDX-License-Identifier: GPL-3.0-only
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import vm from 'node:vm';
import { createKeeperServer } from '../server.mjs';
import { createIngressServer } from '../../doodletick/gateway.mjs';
import { telephoneWorld } from '../public/telephone-keeper.mjs';
import { validatePack, spawnPoints, walkable } from '../public/game-engine.mjs';

createRequire(import.meta.url)('../public/doodle-bridge.js');
const B = globalThis.DoodleBridge;
const fixture = (mode = 'fiction') => ({ ...B.make('The telephone remembers'), sourceMode: mode,
  sourceText: '  Original words.\nNobody has agreed to a rewrite. ☎ 🐙\n',
  masterText: '\tMaster copy\n  Preserve each space.\r\n',
  storyText: 'A separate fictional machine output.', poemText: 'An unrelated poem.',
  characterText: 'Crumb, keeper of the quiet kitchen.', asciiText: ' /\\_/\\\n( o.o )',
  machine: { controls: [{ id: 'seed', tag: 'textarea', value: '  Original words.\n', checked: false }],
    outputs: [{ id: 'storyOut', text: 'A separate fictional machine output.' }],
    state: { lastSignal: 'Original words.', reiterationCount: 2 } } });

test('portable projects preserve exact held sources, master, separate outputs, and source mode', () => {
  for (const mode of ['fiction', 'personal', 'observer', 'talky']) {
    const original = fixture(mode), checked = B.validate(JSON.parse(JSON.stringify(original)));
    for (const field of ['sourceText', 'masterText', 'storyText', 'poemText', 'characterText', 'asciiText', 'sourceMode']) {
      assert.equal(checked[field], original[field], `${mode}: ${field}`);
    }
    assert.deepEqual(checked.machine, original.machine);
    assert.equal(checked.soundtrack, null);
    checked.machine.state.lastSignal = 'Changed copy';
    assert.equal(original.machine.state.lastSignal, 'Original words.');
    const transcript = B.text(original);
    assert(transcript.includes('ORIGINAL INPUT\n' + original.sourceText));
    assert(transcript.includes('PRESERVED MASTER\n' + original.masterText));
    assert(transcript.includes('MACHINE STORY\n' + original.storyText));
  }
});

test('portable projects strip unexpected envelope credentials and reject prototype pollution', () => {
  const record = fixture();
  record.identity = { privateKey: 'must not travel' }; record.password = 'must not travel';
  const checked = B.validate(record);
  assert(!Object.hasOwn(checked, 'identity')); assert(!Object.hasOwn(checked, 'password'));
  for (const key of ['__proto__', 'constructor', 'prototype']) {
    const poisoned = fixture(); poisoned.machine.state = JSON.parse('{"' + key + '":{"polluted":true}}');
    assert.throws(() => B.validate(poisoned), /Unsafe project property/);
  }
  assert.equal({}.polluted, undefined);
});

test('invalid project identifiers, control shapes, modes, drawings and oversized data fail before import', () => {
  for (const id of [null, 12345678, ['abcdefgh'], { toString: () => 'abcdefgh' }, '../telephone', 'short']) {
    assert.throws(() => B.validate({ ...fixture(), id }), /identifier/);
  }
  assert.throws(() => B.validate({ ...fixture(), sourceMode: 'verified-fact' }), /source handling/);
  assert.throws(() => B.validate({ ...fixture(), sourceText: 'a'.repeat(250001) }), /sourceText/);
  const invalidControl = fixture(); invalidControl.machine.controls[0].checked = 'true';
  assert.throws(() => B.validate(invalidControl), /switch/);
  const invalidDrawing = fixture(); invalidDrawing.machine.canvases = [{ id: 'paintCanvas', png: 'data:image/svg+xml,<svg onload="evil()" />' }];
  assert.throws(() => B.validate(invalidDrawing), /drawing/);
  const oversized = fixture(); oversized.machine.state.bulk = 'a'.repeat(B.MAX_BYTES);
  assert.throws(() => B.validate(oversized), /too large/);
});

test('fictional world conversion is deterministic, playable, and leaves the source record unchanged', () => {
  const record = fixture(), before = JSON.stringify(record);
  const first = telephoneWorld(record), second = telephoneWorld(JSON.parse(before));
  assert.deepEqual(first, second); assert.equal(validatePack(first), true);
  for (const spawn of spawnPoints) assert(walkable(first, spawn.x, spawn.y));
  assert.equal(JSON.stringify(record), before);
  const changed = telephoneWorld({ ...record, storyText: record.storyText + ' Another ending.' });
  assert.notEqual(first.seed, changed.seed);
});

test('every held-source mode refuses fictional map generation', () => {
  for (const mode of ['personal', 'observer', 'talky']) {
    const record = fixture(mode), before = JSON.stringify(record);
    assert.throws(() => telephoneWorld(record), /source is held/);
    assert.equal(JSON.stringify(record), before);
  }
});

test('actual machine restore keeps held source exact, prevents mode override, and excludes unrelated sensitive fields', async () => {
  const code = await readFile(new URL('../public/telephone-1.js', import.meta.url), 'utf8');
  const start = code.indexOf('const DV_FIELDS =');
  assert(start > 0, 'The delivered machine must include its integration adapter.');
  const elements = new Map();
  const node = id => {
    if (!elements.has(id)) elements.set(id, { id, tagName: ['seed', 'masterStoryText', 'asciiPictureText'].includes(id) ? 'TEXTAREA' : id === 'sourceHandling' ? 'SELECT' : 'INPUT',
      value: '', checked: false, textContent: '', width: 900, height: 540, onchange() {}, oninput() {},
      toDataURL: () => 'data:image/png;base64,aGVsbG8=', getContext: () => ({ clearRect() {}, drawImage() {} }) });
    return elements.get(id);
  };
  const context = { window: { DoodleBridge: B }, document: { getElementById: node }, lastSignal: 'old', lastPreHive: 'old', rootHumanSeed: 'old',
    lastStoryContext: { seed: 'old fiction' }, reiterationCount: 99, chain: { children: [] }, moduleDefs: [],
    characterLens: node('characterLens'), damage: node('damage'), updateMasterStatus() {}, audioCtx: null };
  vm.runInNewContext(code.slice(start), context);
  const adapter = context.window.TelephoneMachine;
  for (const mode of ['personal', 'observer', 'talky']) {
    const record = fixture(mode);
    record.machine.controls.push({ id: 'sourceHandling', tag: 'select', value: 'fiction', checked: false },
      { id: 'corruptorPassphrase', tag: 'input', value: 'must not restore', checked: false });
    record.machine.state.lastSignal = 'Imported fictional mutation';
    record.machine.state.lastStoryContext = { seed: 'wrong', name: 'wrong', job: 'wrong', want: 'wrong', word: 'wrong', rule: 'wrong', tone: 'wrong', calls: 7 };
    record.storyText = '<img src=x onerror="evil()">';
    node('corruptorPassphrase').value = 'current private text';
    await adapter.restore(B.validate(record));
    assert.equal(node('seed').value, record.sourceText);
    assert.equal(node('masterStoryText').value, record.masterText);
    assert.equal(node('sourceHandling').value, mode);
    assert.equal(node('storyOut').textContent, record.storyText);
    assert.equal(context.lastSignal, record.sourceText);
    assert.equal(context.lastPreHive, record.sourceText);
    assert.equal(context.rootHumanSeed, record.sourceText);
    assert.equal(context.lastStoryContext, null);
    assert.equal(node('corruptorPassphrase').value, 'current private text');
    const snapshot = adapter.capture();
    assert(!snapshot.controls.some(control => control.id === 'corruptorPassphrase'));
    assert.equal(snapshot.controls.find(control => control.id === 'seed').value, record.sourceText);
  }
});

const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
async function sessionHarness(records, options = {}) {
  const [machineCode, sessionCode] = await Promise.all(['telephone-1.js', 'telephone-session.js'].map(name => readFile(new URL('../public/' + name, import.meta.url), 'utf8')));
  const elements = new Map(), documentEvents = new Map(), windowEvents = new Map(), saves = [];
  let storyObserver;
  const node = id => {
    if (!elements.has(id)) {
      const element = { id, value: '', checked: false, textContent: '', disabled: false, width: 900, height: 540, drawCalls: 0,
        tagName: ['seed', 'masterStoryText', 'asciiPictureText'].includes(id) ? 'TEXTAREA' : id === 'sourceHandling' ? 'SELECT' : 'INPUT',
        listeners: new Map(), children: [], addEventListener(type, fn) { this.listeners.set(type, fn); },
        replaceChildren(...children) { this.children = children; }, append(child) { this.children.push(child); },
        closest(selector) { return selector === '.dv-toolbar' ? (id.startsWith('dv-') ? this : null) : ['paintCanvas', 'chain'].includes(id) ? this : null; },
        onchange() {}, oninput() {}, toDataURL: () => 'data:image/png;base64,aGVsbG8=',
      };
      element.getContext = () => ({ clearRect() { element.drawCalls++; }, drawImage() { element.drawCalls++; } });
      elements.set(id, element);
    }
    return elements.get(id);
  };
  node('sourceHandling').value = 'fiction';
  const stored = new Map(records.map(record => [record.id, structuredClone(record)]));
  const getStored = id => stored.has(id) ? structuredClone(stored.get(id)) : null;
  const persist = value => { const saved = { ...structuredClone(value), revision: (stored.get(value.id)?.revision || 0) + 1 }; stored.set(value.id, saved); return structuredClone(saved); };
  const bridge = { make: B.make, MAX_BYTES: B.MAX_BYTES, validate: B.validate, download() {}, watch() {},
    async get(id) { return options.get ? options.get(id, () => getStored(id)) : getStored(id); },
    async list() { return [...stored.values()].map(record => ({ ...record, hasSoundtrack: !!record.soundtrack })); },
    async save(value) { saves.push(structuredClone(value)); return options.save ? options.save(value, () => persist(value), saves.length) : persist(value); },
  };
  const context = vm.createContext({
    window: { DoodleBridge: bridge, addEventListener(type, fn) { windowEvents.set(type, fn); } },
    document: { getElementById: node, addEventListener(type, fn) { documentEvents.set(type, fn); }, hidden: false },
    DoodleBridge: bridge, lastSignal: '', lastPreHive: '', rootHumanSeed: '', lastStoryContext: null, reiterationCount: 0,
    chain: { children: [] }, moduleDefs: [], characterLens: node('characterLens'), damage: node('damage'), updateMasterStatus() {}, audioCtx: null,
    Image: options.Image || class { width = 1; height = 1; async decode() {} },
    MutationObserver: class { constructor(callback) { storyObserver = callback; } observe() {} }, Option: class { constructor(label, value) { this.label = label; this.value = value; } },
    location: { href: 'http://127.0.0.1/telephone.html', search: '?project=' + records[0].id, pathname: '/telephone.html', hash: '' },
    history: { replaceState() {} }, confirm: () => true, structuredClone, URL, URLSearchParams, crypto: globalThis.crypto, setTimeout, clearTimeout,
  });
  vm.runInContext(machineCode.slice(machineCode.indexOf('const DV_FIELDS =')), context);
  context.TelephoneMachine = context.window.TelephoneMachine;
  await vm.runInContext(sessionCode, context);
  const edit = (id, value) => { node(id).value = value; documentEvents.get('input')({ target: node(id) }); node(id).listeners.get('input')?.({ target: node(id) }); };
  const unloadIsGuarded = () => { const event = { prevented: false, preventDefault() { this.prevented = true; } }; windowEvents.get('beforeunload')(event); return event.prevented; };
  const storyChanged = value => { node('storyOut').textContent = value; storyObserver(); };
  return { node, stored, saves, edit, storyChanged, unloadIsGuarded, context };
}

test('a failed drawing decode never changes the loaded story, source mode, state or canvases, and a later Save still belongs to the original project', async () => {
  const original = fixture('personal'), incoming = fixture('fiction');
  incoming.id = crypto.randomUUID(); incoming.title = 'Incoming B'; incoming.sourceText = 'Never overwrite A with B';
  incoming.machine.canvases = [{ id: 'paintCanvas', png: 'data:image/png;base64,cGFpbnQ=' }, { id: 'desire', png: 'data:image/png;base64,aGVsbG8=' }];
  const h = await sessionHarness([original, incoming], {
    Image: class { width = 1; height = 1; async decode() { if (this.src === 'data:image/png;base64,aGVsbG8=') throw new Error('The saved drawing could not be decoded.'); } },
  });
  const before = JSON.stringify(h.context.TelephoneMachine.capture());
  h.node('dv-projects').value = incoming.id;
  await h.node('dv-load').onclick();
  assert.match(h.node('dv-status').textContent, /could not be decoded/);
  assert.equal(JSON.stringify(h.context.TelephoneMachine.capture()), before);
  assert.equal(h.node('sourceHandling').value, 'personal');
  assert.equal(h.node('paintCanvas').drawCalls + h.node('desire').drawCalls, 0);
  await h.node('dv-save').onclick();
  assert.equal(h.saves.length, 1); assert.equal(h.saves[0].id, original.id);
  assert.equal(h.stored.get(original.id).sourceText, original.sourceText);
  assert.equal(h.stored.get(incoming.id).sourceText, incoming.sourceText);
});

test('malformed module state rejects before decoding or changing the loaded project and a subsequent Save still writes its original identity', async () => {
  const original = fixture('personal'), incoming = fixture('fiction'); let decodeCalls = 0;
  incoming.id = crypto.randomUUID(); incoming.title = 'Malformed incoming project'; incoming.sourceText = 'An incoming source that must never replace the original';
  incoming.machine.state.modules = [{ on: true, level: { toString: null } }];
  incoming.machine.canvases = [{ id: 'paintCanvas', png: 'data:image/png;base64,cGFpbnQ=' }];
  assert.throws(() => B.validate(incoming), /module controls/);
  const h = await sessionHarness([original, incoming], {
    Image: class { width = 1; height = 1; async decode() { decodeCalls++; } },
  });
  const before = JSON.stringify(h.context.TelephoneMachine.capture());
  h.node('dv-projects').value = incoming.id;
  await h.node('dv-load').onclick();
  assert.match(h.node('dv-status').textContent, /module controls/);
  assert.equal(decodeCalls, 0, 'Schema validation must finish before the image decoder or live application is touched.');
  assert.equal(JSON.stringify(h.context.TelephoneMachine.capture()), before);
  assert.equal(h.node('sourceHandling').value, 'personal');
  assert.equal(h.node('paintCanvas').drawCalls + h.node('desire').drawCalls, 0);
  await h.node('dv-save').onclick();
  assert.equal(h.saves.length, 1); assert.equal(h.saves[0].id, original.id);
  assert.equal(h.stored.get(original.id).sourceText, original.sourceText);
  assert.equal(h.stored.get(incoming.id).sourceText, incoming.sourceText);
});

test('saved module switches, numeric levels, narrative state and DOM identifiers have strict import types', () => {
  for (const level of [{ toString: null }, '50', null, Infinity, NaN, -1, 101]) {
    const record = fixture(); record.machine.state.modules = [{ on: true, level }];
    assert.throws(() => B.validate(record), /module controls/);
  }
  const switchType = fixture(); switchType.machine.state.modules = [{ on: 'true', level: 50 }];
  assert.throws(() => B.validate(switchType), /module controls/);
  const modules = fixture(); modules.machine.state.modules = Array.from({ length: 14 }, () => ({ on: true, level: 50 }));
  assert.throws(() => B.validate(modules), /module controls/);
  const state = fixture(); state.machine.state.lastSignal = { toString: null };
  assert.throws(() => B.validate(state), /lastSignal/);
  const count = fixture(); count.machine.state.reiterationCount = '2';
  assert.throws(() => B.validate(count), /reiteration count/);
  const context = fixture(); context.machine.state.lastStoryContext = { seed: 's', name: 'n', job: 'j', want: 'w', word: 'w', rule: 'r', tone: 't', calls: 101 };
  assert.throws(() => B.validate(context), /call count/);
  const control = fixture(); control.machine.controls[0].id = ['seed'];
  assert.throws(() => B.validate(control), /saved control/);
  const output = fixture(); output.machine.outputs[0].id = ['storyOut'];
  assert.throws(() => B.validate(output), /output identifier/);
  const valid = fixture(); valid.machine.state.modules = [{ on: false, level: 0 }, { on: true, level: 100 }];
  assert.deepEqual(B.validate(valid).machine.state.modules, valid.machine.state.modules);
});

test('editing while drawings decode cancels the pending load before any imported fields or canvases are applied', async () => {
  const original = fixture('personal'), incoming = fixture('fiction'), started = deferred(), decoded = deferred();
  incoming.id = crypto.randomUUID(); incoming.sourceText = 'Incoming drawing project';
  incoming.machine.canvases = [{ id: 'paintCanvas', png: 'data:image/png;base64,cGFpbnQ=' }];
  const h = await sessionHarness([original, incoming], {
    Image: class { width = 1; height = 1; decode() { started.resolve(); return decoded.promise; } },
  });
  h.node('dv-projects').value = incoming.id;
  const loading = h.node('dv-load').onclick(); await started.promise;
  h.edit('seed', 'A newer manual edit while decoding');
  decoded.resolve(); await loading;
  assert.match(h.node('dv-status').textContent, /canceled because you edited/);
  assert.equal(h.node('seed').value, 'A newer manual edit while decoding');
  assert.equal(h.node('masterStoryText').value, original.masterText);
  assert.equal(h.node('sourceHandling').value, 'personal');
  assert.equal(h.node('paintCanvas').drawCalls, 0);
  assert.equal(h.unloadIsGuarded(), true);
  await h.node('dv-save').onclick();
  assert.equal(h.saves[0].id, original.id);
  assert.equal(h.stored.get(original.id).sourceText, 'A newer manual edit while decoding');
});

test('editing during the project storage read cancels a load instead of establishing the edit as its replacement baseline', async () => {
  const original = fixture('personal'), incoming = fixture(), started = deferred(), read = deferred();
  incoming.id = crypto.randomUUID(); incoming.sourceText = 'Incoming storage project';
  const h = await sessionHarness([original, incoming], {
    async get(id, getStored) { if (id === incoming.id) { started.resolve(); await read.promise; } return getStored(); },
  });
  h.node('dv-projects').value = incoming.id;
  const loading = h.node('dv-load').onclick(); await started.promise;
  h.edit('seed', 'New text entered during storage read');
  read.resolve(); await loading;
  assert.match(h.node('dv-status').textContent, /canceled because you edited/);
  assert.equal(h.node('seed').value, 'New text entered during storage read');
  assert.equal(h.node('sourceHandling').value, 'personal');
  assert.equal(h.unloadIsGuarded(), true);
});

test('a new machine story generated during drawing decode cancels the pending load and retains its unsaved warning', async () => {
  const original = fixture('fiction'), incoming = fixture('fiction'), started = deferred(), decoded = deferred();
  incoming.id = crypto.randomUUID(); incoming.sourceText = 'Incoming project whose drawing is still loading';
  incoming.machine.canvases = [{ id: 'paintCanvas', png: 'data:image/png;base64,cGFpbnQ=' }];
  const h = await sessionHarness([original, incoming], {
    Image: class { width = 1; height = 1; decode() { started.resolve(); return decoded.promise; } },
  });
  h.node('dv-projects').value = incoming.id;
  const loading = h.node('dv-load').onclick(); await started.promise;
  h.storyChanged('A new machine story generated while the drawing was loading');
  decoded.resolve(); await loading;
  assert.match(h.node('dv-status').textContent, /canceled because you edited/);
  assert.equal(h.node('seed').value, original.sourceText);
  assert.equal(h.node('storyOut').textContent, 'A new machine story generated while the drawing was loading');
  assert.equal(h.node('paintCanvas').drawCalls, 0);
  assert.equal(h.node('dv-save').textContent, 'Save session ●');
  assert.equal(h.unloadIsGuarded(), true);
});

test('an edit during an awaited Save remains dirty and guarded until a subsequent Save persists the newer version', async () => {
  const original = fixture('personal'), started = deferred(), write = deferred();
  const h = await sessionHarness([original], {
    async save(value, persist, call) { if (call === 1) { started.resolve(); await write.promise; } return persist(); },
  });
  h.edit('seed', 'First version submitted for saving');
  const saving = h.node('dv-save').onclick(); await started.promise;
  h.edit('seed', 'Second version typed before saving finished');
  write.resolve(); await saving;
  assert.equal(h.stored.get(original.id).sourceText, 'First version submitted for saving');
  assert.equal(h.node('seed').value, 'Second version typed before saving finished');
  assert.equal(h.node('dv-save').textContent, 'Save session ●');
  assert.match(h.node('dv-status').textContent, /newer edits are still unsaved/);
  assert.equal(h.unloadIsGuarded(), true);
  await h.node('dv-save').onclick();
  assert.equal(h.saves.length, 2);
  assert.equal(h.stored.get(original.id).sourceText, 'Second version typed before saving finished');
  assert.equal(h.node('dv-save').textContent, 'Save session');
  assert.equal(h.unloadIsGuarded(), false);
});

const assets = ['doodle-bridge.js', 'telephone.html', 'telephone.css', 'telephone-1.js', 'telephone-2.js',
  'telephone-session.js', 'telephone-integration.css', 'telephone-rhyme.html', 'telephone-rhyme.css',
  'telephone-rhyme-1.js', 'telephone-keeper.mjs', 'telephone-keeper.css', 'studio.html', 'studio-app.js',
  'studio-worker.js', 'studio.css'];

test('Telephone Stop cancels a pending project read and settles an in-flight worker immediately', async () => {
  const source = await readFile(new URL('../public/telephone-session.js', import.meta.url), 'utf8');
  const functions = source.slice(source.indexOf('  function stopMusic()'), source.indexOf("  $('dv-save').onclick"));
  let releaseRead, forbidAudio = false, audioStarts = 0, workers = [];
  const nodes = new Map(), node = id => { if (!nodes.has(id)) nodes.set(id, {}); return nodes.get(id); };
  const pendingRead = new Promise(resolve => { releaseRead = resolve; });
  const context = vm.createContext({
    B: { get: () => pendingRead }, $: node, TelephoneMachine: { stopSound() {} },
    AudioContext: class { constructor() { audioStarts++; if (forbidAudio) throw Error('Audio restarted after Stop.'); } async resume() {} async suspend() {} },
    Worker: class { constructor() { workers.push(this); } postMessage() {} terminate() { this.terminated = true; } },
    location: { href: 'http://127.0.0.1/telephone.html' }, URL, setTimeout, clearTimeout,
  });
  vm.runInContext("let current={id:'fixture'}, audioTicket=0,worker=null,source=null,musicGain=null,context=null,cancelRender=null;" + functions + '\nglobalThis.play=playMusic;globalThis.stop=stopMusic;', context);
  const reading = context.play(); context.stop(); forbidAudio = true;
  releaseRead({ soundtrack: { kind: 'dot-studio-project', version: 2 } });
  await reading;
  assert.equal(audioStarts, 0, 'Stop during storage read must not initialize audio later.');
  assert.equal(workers.length, 0);
  forbidAudio = false;
  const rendering = context.play();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(workers.length, 1);
  context.stop(); await rendering;
  assert.equal(workers[0].terminated, true);
  assert.equal(node('dv-play').disabled, false);
  assert.equal(node('dv-play').textContent, '▶ Soundtrack');
});
const listen = server => new Promise((resolve, reject) => {
  server.once('error', reject); server.listen(0, '127.0.0.1', () => resolve(`http://127.0.0.1:${server.address().port}`));
});
const close = server => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); });

async function withServer(ingress, run) {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'doodle-telephone-test-'));
  let keeper, gateway;
  try {
    keeper = await createKeeperServer({ dataDir: dir, port: 0 });
    let base = `http://127.0.0.1:${keeper.port}`;
    if (ingress) {
      gateway = createIngressServer({ keeperPort: keeper.port, ingressIP: '127.0.0.1', control: { status: async () => ({ ready: true }) } });
      base = await listen(gateway);
    }
    await run(base);
  } finally {
    if (gateway) await close(gateway);
    if (keeper) await keeper.close();
    assert.equal(path.dirname(path.resolve(dir)), path.resolve(os.tmpdir()));
    assert(path.basename(dir).startsWith('doodle-telephone-test-'));
    await rm(dir, { recursive: true, force: true });
  }
}

for (const ingress of [false, true]) test(`${ingress ? 'authenticated ingress' : 'desktop Keeper'} serves complete integrated assets with strict scripts and page-specific news access`, async () => {
  await withServer(ingress, async base => {
    for (const name of assets) {
      const response = await fetch(base + '/' + name + '?test=1');
      assert.equal(response.status, 200, name);
      const type = name.endsWith('.html') ? 'text/html; charset=utf-8' : name.endsWith('.css') ? 'text/css; charset=utf-8' : 'text/javascript; charset=utf-8';
      assert.equal(response.headers.get('content-type'), type, name);
      const csp = response.headers.get('content-security-policy');
      assert.equal(csp.match(/(?:^|;\s*)script-src ([^;]+)/)[1], "'self'", name);
      assert.equal(csp.match(/(?:^|;\s*)worker-src ([^;]+)/)[1], "'self'", name);
      const body = await response.text();
      if (name.endsWith('.html')) {
        assert(!/(?:src|href)="\//.test(body), name + ' must retain ingress-relative assets');
        assert(!/<script(?![^>]*\bsrc=)[^>]*>\s*\S/i.test(body), name + ' must not require inline execution');
      }
      if (name === 'telephone.html') assert(csp.includes('https://api.gdeltproject.org'));
      else assert(!csp.includes('https://api.gdeltproject.org'), name + ' must not gain news access');
    }
    const app = await fetch(base + '/');
    assert(!app.headers.get('content-security-policy').includes('https://api.gdeltproject.org'));
    assert.equal((await fetch(base + '/workshop.mjs?test=1')).status, 200);
    assert.equal((await fetch(base + '/telephone-not-allowlisted.js')).status, 404);
    assert.equal((await fetch(base + '/.doodletick/witness-key.json')).status, 404);
    if (ingress) assert.equal((await fetch(base + '/sw.mjs')).status, 404);
  });
});
