import test from 'node:test';
import assert from 'node:assert/strict';
import { DJRenderer, djMakeBank } from '../public/jazz-core.mjs';
import { parseJazzDotVoice, listJazzDotVoices, buildJazzDotBank, JAZZ_DOT_VOICE_FORMAT, JAZZ_DOT_MAX_BYTES, JAZZ_DOT_MAX_GENERATED_BYTES } from '../public/jazz-dot-voices.mjs';

const Studio = globalThis.StudioDSP;
const wave = (id = 'my-wave', name = 'Hand drawn voice') => ({ id, name, real: Array(128).fill(0), imag: Array.from({ length: 128 }, (_, index) => index === 1 ? .65 : index === 3 ? .20 : index === 5 ? .10 : 0), effects: [], frequency: 134 });
const patch = () => ({ kind: 'dot-wave-studio', project: Studio.defaultProject(), freePair: null, pitch: 134, level: -12, volume: .4, inverted: false, eq: { gains: Array(10).fill(0), bypass: false }, throughEQ: false, channel: 0 });
function base(rate = 24000, notes = [48, 60, 69, 72]) {
  return { rate, piano: notes.map(note => Object.freeze({ note, data: new Float32Array(128).fill(.01) })), bass: [36, 48].map(note => Object.freeze({ note, data: new Float32Array(128).fill(.02) })), drums: Object.fromEntries(['ride', 'brush', 'kick', 'hat', 'stick'].map(kind => [kind, new Float32Array(128).fill(.03)])) };
}
const finite = bank => {
  for (const data of [...bank.piano.map(item => item.data), ...bank.bass.map(item => item.data), ...Object.values(bank.drums)]) for (const value of data) assert(Number.isFinite(value) && Math.abs(value) <= .720001);
};
const freeze = value => { if (value && typeof value === 'object' && !ArrayBuffer.isView(value)) { Object.values(value).forEach(freeze); Object.freeze(value); } return value; };
function amplitude(data, rate, hz) {
  let a = 0, b = 0; const begin = Math.round(rate * .2), length = Math.round(rate * .5);
  for (let index = 0; index < length; index++) { const phase = 2 * Math.PI * hz * (begin + index) / rate; a += data[begin + index] * Math.cos(phase); b += data[begin + index] * Math.sin(phase); }
  return 2 * Math.hypot(a, b) / length;
}
function measuredFrequency(data, rate) {
  const crossings = [];
  for (let index = Math.round(rate * .2); index < Math.round(rate * 1.2); index++) if (data[index] <= 0 && data[index + 1] > 0) crossings.push(index - data[index] / (data[index + 1] - data[index]));
  return (crossings.length - 1) * rate / (crossings.at(-1) - crossings[0]);
}

test('the actual Studio sound-box library recipe, name, effects and credits round-trip without selecting or mutating other waves', () => {
  const input = wave(); input.effects = [{ type: 'echo', enabled: true, mix: .25, time: .2, feedback: .3 }];
  input.attribution = { creator: 'Fixture composer', license: 'CC BY 4.0', source: 'https://example.invalid/original-credit' };
  const original = JSON.stringify(input), voice = parseJazzDotVoice(input);
  assert.equal(voice.kind, JAZZ_DOT_VOICE_FORMAT); assert.equal(voice.name, input.name); assert.deepEqual(voice.attribution, input.attribution);
  assert.deepEqual(voice.recipe, { kind: 'dot-wave-library', version: 1, waves: [{ ...input, attribution: undefined, real: input.real.map(Math.fround), imag: input.imag.map(Math.fround) }].map(({ attribution, ...item }) => item) });
  assert.deepEqual(parseJazzDotVoice(JSON.stringify(voice)), voice); assert.equal(JSON.stringify(input), original);
  const library = { kind: 'dot-wave-library', version: 1, waves: [input, wave('second', 'Other sound')] };
  assert.throws(() => parseJazzDotVoice(library), /Choose one sound/);
  const choices = listJazzDotVoices(JSON.stringify(library)); assert.deepEqual(choices.map(item => item.name), [input.name, 'Other sound']); assert.deepEqual(choices[0], voice);
});

test('editable Studio patches and seeded mushroom recipes keep their real recipe controls and explicit credits', () => {
  const original = patch(); original.project.a = Studio.source('organ'); original.project.amp = { enabled: true, drive: 3, color: .4, mix: .7, output: .6, low: 2, high: -1 }; original.project.effects = [{ type: 'reverb', mix: .2 }];
  const wrapper = { kind: JAZZ_DOT_VOICE_FORMAT, version: 1, name: 'Warm drawn organ', attribution: { creator: 'Fixture musician', license: 'All rights reserved', source: 'Original drawing' }, recipe: original };
  const voice = parseJazzDotVoice(wrapper); assert.deepEqual(voice.recipe.project.a.points, original.project.a.points); assert.deepEqual(voice.recipe.project.amp, original.project.amp); assert.equal(voice.recipe.volume, .4);
  assert.deepEqual(parseJazzDotVoice(JSON.stringify(voice)), voice); assert.equal(voice.attribution.license, 'All rights reserved');
  const mushroom = { kind: 'dot-mushroom', version: 1, name: 'Blue spore', settings: { seed: 1984, growth: .3, static: .2, glitch: .4, mix: .6 }, motion: { speed: .5, depth: .25 }, patch: original };
  const spore = parseJazzDotVoice(mushroom); assert.equal(spore.name, 'Blue spore'); assert.deepEqual(spore.recipe.settings, mushroom.settings); assert.deepEqual(spore.recipe.motion, mushroom.motion); assert.deepEqual(parseJazzDotVoice(JSON.stringify(spore)), spore);
});

test('selected patch instruments use the same frozen sound snapshot as Studio Keep sound, retaining inversion and amp timbre', () => {
  const p = patch(); p.project.a = Studio.source('hollow'); p.project.b = Studio.source('organ'); p.project.amount = .31; p.project.amp.enabled = true; p.inverted = true;
  const signal = Studio.compile(p.project, { frequency: p.pitch }).result;
  const stored = { id: 'snapshot', name: 'Snapshot', real: Array.from(signal.real, value => -value), imag: Array.from(signal.imag, value => -value), effects: p.project.effects, frequency: p.pitch };
  const fromPatch = buildJazzDotBank(base(), { piano: p }), fromSoundBox = buildJazzDotBank(base(), { piano: stored });
  for (let index = 0; index < fromPatch.piano.length; index++) {
    const a = fromPatch.piano[index].data, b = fromSoundBox.piano[index].data; let difference = 0;
    for (let sample = 0; sample < a.length; sample++) difference = Math.max(difference, Math.abs(a[sample] - b[sample]));
    assert(difference < 1e-6);
  }
});

test('band-limited sound-box samples retain their harmonic timbre and deterministic MIDI pitch across octaves', () => {
  const sine = wave(); sine.imag.fill(0); sine.imag[1] = .65;
  const bank = buildJazzDotBank(base(), { piano: sine });
  for (const item of bank.piano) assert(Math.abs(measuredFrequency(item.data, bank.rate) - 440 * 2 ** ((item.note - 69) / 12)) < .1);
  assert(Math.abs(measuredFrequency(bank.piano[3].data, bank.rate) / measuredFrequency(bank.piano[1].data, bank.rate) - 2) < .001);
  assert.deepEqual(buildJazzDotBank(base(), { piano: sine }).piano, bank.piano);
  const timbre = buildJazzDotBank(base(), { piano: wave() }).piano.find(item => item.note === 69).data;
  const fundamental = amplitude(timbre, 24000, 440);
  assert(Math.abs(amplitude(timbre, 24000, 1320) / fundamental - .20 / .65) < .025);
  assert(Math.abs(amplitude(timbre, 24000, 2200) / fundamental - .10 / .65) < .025);
  assert(amplitude(timbre, 24000, 11000) / fundamental < .0001);
  finite(bank);
});

test('piano, bass and all drum voices replace only assigned parts and null assignments restore untouched originals', () => {
  const original = base(), snapshot = original.piano.map(item => item.data.slice()); freeze(original.piano); Object.freeze(original.bass); Object.freeze(original.drums); Object.freeze(original);
  const voice = freeze(parseJazzDotVoice(wave())), assigned = buildJazzDotBank(original, { piano: voice, bass: voice, drums: voice });
  assert.notEqual(assigned.piano, original.piano); assert.notEqual(assigned.bass, original.bass); assert.notEqual(assigned.drums, original.drums);
  assert.deepEqual(assigned.piano.map(item => item.note), original.piano.map(item => item.note)); assert.deepEqual(Object.keys(assigned.drums), Object.keys(original.drums));
  for (const kind of Object.keys(assigned.drums)) { assert(assigned.drums[kind].some(value => value !== 0)); assert(assigned.drums[kind][0] === 0); assert(assigned.drums[kind].at(-1) === 0); }
  for (let index = 0; index < snapshot.length; index++) assert.deepEqual(original.piano[index].data, snapshot[index]);
  finite(assigned);
  const restored = buildJazzDotBank(original, { piano: null, bass: null, drums: null }); assert.equal(restored.piano, original.piano); assert.equal(restored.bass, original.bass); assert.equal(restored.drums, original.drums);
  const onlyBass = buildJazzDotBank(original, { bass: voice }); assert.equal(onlyBass.piano, original.piano); assert.equal(onlyBass.drums, original.drums);
});

test('mushroom assignment runs the original seeded texture renderer reproducibly and different seeds remain different sounds', () => {
  const mushroom = { kind: 'dot-mushroom', version: 1, name: 'Seeded texture', settings: { seed: 100, growth: .35, static: .5, glitch: .4, mix: .8 }, patch: null };
  const a = buildJazzDotBank(base(), { drums: mushroom }), b = buildJazzDotBank(base(), { drums: mushroom });
  assert.deepEqual(a.drums, b.drums);
  const changed = buildJazzDotBank(base(), { drums: { ...mushroom, settings: { ...mushroom.settings, seed: 101 } } }); assert.notDeepEqual(a.drums.kick, changed.drums.kick); finite(a);
});

test('an above-band partial is silent in that sample without rejecting its audible lower register', () => {
  const high = wave(); high.imag.fill(0); high.imag[8] = .65;
  const bank = buildJazzDotBank(base(24000, [48, 87]), { piano: high });
  assert(bank.piano[0].data.some(value => value !== 0)); assert(bank.piano[1].data.every(value => value === 0)); finite(bank);
});

test('the real Jazz renderer accepts the replacement bank and output remains finite with the shipped bank dimensions', () => {
  const original = djMakeBank(24000), replacement = buildJazzDotBank(original, { piano: wave(), bass: wave(), drums: wave() });
  let bytes = 0; for (const data of [...replacement.piano.map(item => item.data), ...replacement.bass.map(item => item.data), ...Object.values(replacement.drums)]) bytes += data.byteLength;
  assert(bytes <= JAZZ_DOT_MAX_GENERATED_BYTES); assert.equal(replacement.piano.length, 15); assert.equal(replacement.bass.length, 10);
  const renderer = new DJRenderer(48000, replacement, { seed: 47, style: 'swing', tempo: 112, swing: .64 }), left = new Float32Array(480), right = new Float32Array(480); let energy = 0;
  for (let frame = 0; frame < 120; frame++) { renderer.render(left, right); for (let index = 0; index < left.length; index++) { assert(Number.isFinite(left[index]) && Number.isFinite(right[index])); energy += left[index] ** 2 + right[index] ** 2; } }
  assert(energy > 1); finite(replacement);
});

test('oversize, empty, nonfinite, external audio and executable object inputs fail before generating samples', () => {
  const invalid = [null, 'x'.repeat(JAZZ_DOT_MAX_BYTES + 1), { ...wave(), imag: Array(128).fill(0) }, { ...wave(), real: Array(127).fill(0) }, { ...wave(), real: [1, ...Array(127).fill(0)] }, { ...wave(), imag: [0, Infinity, ...Array(126).fill(0)] }, { ...wave(), imag: [0, 2.1, ...Array(126).fill(0)] }, { ...wave(), url: 'https://example.invalid/audio.wav' }, { ...wave(), script: 'run()' }, { ...wave(), samples: [0, 1] }, { ...wave(), effects: Array(7).fill({ type: 'echo' }) }, JSON.parse('{"__proto__":{"polluted":true}}')];
  for (const input of invalid) assert.throws(() => parseJazzDotVoice(input));
  const holes = wave(); holes.imag = new Array(128); assert.throws(() => parseJazzDotVoice(holes));
  const cycle = wave(); cycle.other = cycle; assert.throws(() => parseJazzDotVoice(cycle));
  let executed = 0; const getter = { ...wave() }; Object.defineProperty(getter, 'real', { get() { executed++; return Array(128).fill(0); } });
  assert.throws(() => parseJazzDotVoice(getter), /getters/); assert.equal(executed, 0);
  const assignments = {}; Object.defineProperty(assignments, 'piano', { enumerable: true, get() { executed++; return wave(); } }); assert.throws(() => buildJazzDotBank(base(), assignments), /getters/); assert.equal(executed, 0);
  assert.throws(() => buildJazzDotBank(base(), { piano: wave(), arbitrary: wave() })); assert.throws(() => buildJazzDotBank({ ...base(), rate: 192000 }, {}));
  assert.throws(() => buildJazzDotBank(base(), { piano: { kind: 'dot-mushroom', version: 1, name: 'Silence', settings: { growth: 0, static: 0, glitch: 0, mix: 0, seed: 1 }, patch: null } }), /silent/);
  assert.equal({}.polluted, undefined);
});

test('collection import offers at most 32 explicit choices and rejects duplicate IDs or unsupported versions atomically', () => {
  const collection = { kind: 'dot-wave-library', version: 1, waves: Array.from({ length: 32 }, (_, index) => wave('voice-' + index, 'Voice ' + index)) };
  assert.equal(listJazzDotVoices(collection).length, 32); assert.equal(collection.waves.length, 32);
  assert.throws(() => listJazzDotVoices({ ...collection, waves: [...collection.waves, wave('extra')] }));
  assert.throws(() => listJazzDotVoices({ ...collection, waves: [wave('same'), wave('same')] }));
  assert.throws(() => listJazzDotVoices({ ...collection, version: 2 })); assert.throws(() => parseJazzDotVoice({ ...parseJazzDotVoice(wave()), version: 9 }));
});
