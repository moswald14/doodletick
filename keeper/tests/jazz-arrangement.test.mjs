// SPDX-License-Identifier: GPL-3.0-only
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { DJComposer, DJRenderer, DJ_STYLES, djMakeBank, djValidateFavoriteProgressions } from '../public/jazz-core.mjs';
import { JAZZ_ARRANGEMENT_DEFAULTS, JAZZ_DEFAULT_SETTINGS, JAZZ_METERS, validateRadioSettings } from '../public/jazz-radio-contract.mjs';
import { validateJazzContext } from '../public/jazz-name-contract.mjs';
import { context as oldContext, result } from './jazz-name-fixture.mjs';

const styles = Object.keys(DJ_STYLES);
const compose = (style = 'swing', extra = {}) => new DJComposer({ style, tempo: DJ_STYLES[style].tempo, swing: DJ_STYLES[style].swing, seed: 47, ...extra });
const bank = djMakeBank(12000), EPS = 1e-8;
// Captured from the unmodified 0.14d4 engine: two seeded 256-bar performances
// per genre, with durations and complete event bytes (including velocities).
const legacy = {
  "swing": "e823bd46084850c299d8c505e9c557b9de69cbaa04bf552b73a714efbb0f9de7",
  "blues": "cbeeeeb06ab1159f9a58ec5bb9f06dd7dff9e6a42919ebeb72b63d331284b15f",
  "bossa": "a47bef82ec8691eba4423a8b0cdd6323f04d391cd0fb2ef7a87a20c6c4f6eaf7",
  "bebop": "92dc6d86f48b903523f0b43b01fd9235beade490a5ab83a2cc13d98ee4cd81b0",
  "cool": "d85ad4852c3fc2237f420ee79a65083e80e1a95cc47405a3802ac627bec1f0d9",
  "modal": "35cba83777ea710289697f2d36801eee8d50e6388d7100951b84cd5ac0edf736",
  "latin": "34532b3d6921a634457f65edfa1de307f3f2365a82591334fce7808e321973f0",
  "funk": "8418d95ab3eeb278e488d3f0549b8b5844a19fb6bd54707997b58f3942e36fcd"
};

test('omitted and explicit default controls preserve all eight legacy musical event streams byte for byte', () => {
  for (const style of styles) {
    const hash = createHash('sha256');
    for (const seed of [47, 91]) {
      const implicit = compose(style, { seed }), explicit = compose(style, { seed, ...JAZZ_ARRANGEMENT_DEFAULTS, favoriteProgressions: [] });
      for (let index = 0; index < 256; index++) {
        const bar = implicit.nextBar(), same = explicit.nextBar();
        assert.deepEqual(bar.events, same.events); assert.equal(bar.duration, same.duration);
        hash.update(JSON.stringify({ events: bar.events, duration: bar.duration }));
      }
    }
    assert.equal(hash.digest('hex'), legacy[style], style + ' retains its actual previous playback score');
  }
});

test('every selected meter has real quarter-beat anchors, bounded events and correctly grouped chord changes', () => {
  for (const style of styles) for (const beatsPerBar of JAZZ_METERS) {
    const composer = compose(style, { beatsPerBar });
    for (let index = 0; index < 20; index++) {
      const bar = composer.nextBar(), beatSeconds = 60 / bar.info.tempo;
      assert.equal(bar.info.beatsPerBar, beatsPerBar); assert.equal(bar.duration, beatsPerBar * beatSeconds);
      assert.equal(bar.info.favorLikes, true);
      assert.equal(bar.info.chords[0].beat, 0);
      if (bar.info.chords.length === 2) assert.equal(bar.info.chords[1].beat, Math.ceil(beatsPerBar / 2));
      for (const event of bar.events) {
        assert(event.beat >= 0 && event.beat < beatsPerBar); assert(event.time >= 0 && event.time < bar.duration);
        assert(Number.isFinite(event.note) && Number.isFinite(event.velocity) && event.duration > 0);
        if (beatsPerBar !== 4) assert(event.time + event.duration <= bar.duration + EPS, 'nonlegacy notes release inside their real measure');
      }
      if (['swing', 'blues', 'bebop'].includes(style)) {
        assert.deepEqual(bar.events.filter(event => event.role === 'bass').map(event => event.beat), Array.from({ length: beatsPerBar }, (_, i) => i));
      }
    }
  }
});

test('selected phrase lengths are performed, and changes start at a safe new form boundary', () => {
  for (const style of styles) for (const phraseBars of [4, 8, 16, 32]) {
    const composer = compose(style, { phraseBars, beatsPerBar: 5 });
    for (let index = 0; index <= phraseBars; index++) {
      const bar = composer.nextBar();
      assert.equal(bar.info.bars, phraseBars); assert.equal(bar.info.bar, index % phraseBars + 1);
      assert.equal(bar.info.chorus, Math.floor(index / phraseBars) + 1);
    }
    composer.configure({ phraseBars: 4, beatsPerBar: 7 });
    const next = composer.nextBar(); assert.equal(next.info.bar, 1); assert.equal(next.info.bars, 4); assert.equal(next.info.beatsPerBar, 7);
  }
});

test('manual tonics persist across natural modulation, fresh sets and genre changes while auto still modulates', () => {
  for (const style of styles) {
    const composer = compose(style, { keyRoot: 9, phraseBars: 4 });
    for (let index = 0; index < 40; index++) assert.equal(composer.nextBar().info.tonic, 9);
    composer.configure({ newSet: true, seed: 91, style: style === 'bossa' ? 'swing' : 'bossa' });
    assert.equal(composer.nextBar().info.tonic, 9);
  }
  const auto = compose('swing', { phraseBars: 4 }), tonics = new Set();
  for (let index = 0; index < 160; index++) tonics.add(auto.nextBar().info.tonic);
  assert(tonics.size > 1, 'automatic key behavior continues to explore normal modulations');
});

test('beat-only removes melody, comping and bass events while preserving the exact drum performance', () => {
  for (const style of styles) for (const beatsPerBar of [3, 4, 7]) {
    const trio = compose(style, { beatsPerBar }), drums = compose(style, { beatsPerBar, beatOnly: true });
    for (let index = 0; index < 8; index++) {
      const whole = trio.nextBar(), isolated = drums.nextBar();
      assert(whole.events.some(event => event.role === 'melody')); assert(whole.events.some(event => event.role === 'bass'));
      assert(isolated.events.length > 0 && isolated.events.every(event => event.role === 'drums'));
      assert.deepEqual(isolated.events, whole.events.filter(event => event.role === 'drums'));
    }
  }
});

test('a selected beat changes only the drum groove and its feel on the next bar', () => {
  const original = compose('swing', { beatsPerBar: 5 });
  const changed = compose('swing', { beatsPerBar: 5 });
  original.nextBar();
  changed.nextBar();
  changed.configure({ beatPattern: 'latin' });
  const swing = original.nextBar();
  const latin = changed.nextBar();
  assert.equal(latin.info.beatPattern, 'latin');
  assert.equal(latin.info.set, swing.info.set);
  assert.deepEqual(latin.info.chords, swing.info.chords);
  assert.deepEqual(latin.events.filter(event => event.role !== 'drums'), swing.events.filter(event => event.role !== 'drums'));
  const drums = latin.events.filter(event => event.role === 'drums');
  assert.notDeepEqual(drums, swing.events.filter(event => event.role === 'drums'));
  assert(drums.some(event => event.instrument === 'stick'));
  assert(drums.every(event => Math.abs(event.time - event.beat * 60 / latin.info.tempo) < EPS));
  assert.throws(() => validateRadioSettings({ ...JAZZ_DEFAULT_SETTINGS, beatPattern: '__proto__' }));
});

function renderer(extra = {}, samples = bank) {
  return new DJRenderer(12000, samples, { style: 'swing', tempo: 120, swing: 0.64, seed: 47, ...extra });
}
const block = player => { const left = new Float32Array(128), right = new Float32Array(128); player.render(left, right); return [...left, ...right]; };
function nextBar(player) { const previous = player.nextBar; while (player.nextBar === previous) block(player); }

test('beat-only is audible isolation, clears preceding pitched tails and leaves drum mixer levels untouched', () => {
  const pitchedOnly = { ...bank, drums: Object.fromEntries(Object.entries(bank.drums).map(([kind, data]) => [kind, new Float32Array(data.length)])) };
  const player = renderer({}, pitchedOnly); let heardPitch = false;
  for (let index = 0; index < 60; index++) heardPitch ||= block(player).some(sample => Math.abs(sample) > 0.001);
  assert(heardPitch, 'fixture must first contain audible piano or bass');
  const levels = { ...player.targets }; player.configure({ composition: { beatOnly: true } }); nextBar(player);
  for (let index = 0; index < 100; index++) assert(block(player).every(sample => sample === 0), 'no old piano or bass tail survives the beat-only boundary');
  assert.deepEqual(player.targets, levels);
  const quietPitch = renderer({ beatOnly: true }), loudPitch = renderer({ beatOnly: true });
  quietPitch.configure({ levels: { piano: 0, bass: 0, drums: 0.6 } }); loudPitch.configure({ levels: { piano: 1, bass: 1, drums: 0.6 } });
  let heardDrums = false;
  for (let index = 0; index < 100; index++) {
    const a = block(quietPitch), b = block(loudPitch); assert.deepEqual(a, b); heardDrums ||= a.some(sample => Math.abs(sample) > 0.001);
  }
  assert(heardDrums);
});

test('a trusted bank replacement waits for the next bar and changes sound without restarting the composition', () => {
  const silent = { rate: bank.rate,
    piano: bank.piano.map(sample => ({ ...sample, data: new Float32Array(sample.data.length) })),
    bass: bank.bass.map(sample => ({ ...sample, data: new Float32Array(sample.data.length) })),
    drums: Object.fromEntries(Object.entries(bank.drums).map(([kind, data]) => [kind, new Float32Array(data.length)])) };
  const player = renderer({}, silent); block(player); const before = { ...player.info };
  player.configure({ bank });
  for (let index = 0; index < 25; index++) assert(block(player).every(sample => sample === 0), 'new samples cannot enter midway through an old bar');
  nextBar(player);
  assert.equal(player.info.bar, before.bar + 1); assert.equal(player.info.set, before.set); assert.equal(player.info.seed, before.seed);
  let audible = false;
  for (let index = 0; index < 80; index++) audible ||= block(player).some(sample => Math.abs(sample) > 0.001);
  assert(audible, 'the replacement samples are actually triggered in the next bar');
});

test('already sounding note tails retain their old bank samples across a replacement', () => {
  const zeroDrums = Object.fromEntries(Object.entries(bank.drums).map(([kind, data]) => [kind, new Float32Array(data.length)]));
  const pitched = { ...bank, drums: zeroDrums }, silent = { ...pitched,
    piano: bank.piano.map(sample => ({ ...sample, data: new Float32Array(sample.data.length) })),
    bass: bank.bass.map(sample => ({ ...sample, data: new Float32Array(sample.data.length) })) };
  const player = renderer({}, pitched); block(player); nextBar(player);
  player.configure({ bank: silent }); nextBar(player);
  assert(block(player).some(sample => Math.abs(sample) > 0.00001), 'the preceding bar piano release still uses its old sample');
  let last;
  for (let index = 0; index < 100; index++) last = block(player);
  assert(last.every(sample => sample === 0), 'new notes use the silent replacement after the old releases finish');
});

test('the renderer exposes every real beat and exact split-chord PCM marker in odd measures', () => {
  for (const beatsPerBar of [3, 5, 7]) {
    const messages = [], player = new DJRenderer(12000, bank, { style: 'bebop', tempo: 120, swing: 0.58, seed: 47, beatsPerBar }, message => messages.push(message));
    for (let index = 0; index < Math.ceil(beatsPerBar * 0.5 * 12000 / 128); index++) block(player);
    const first = messages.filter(message => message.barIndex === 0 && Number.isInteger(message.beat));
    assert.deepEqual(first.map(message => message.beat), Array.from({ length: beatsPerBar }, (_, i) => i));
    assert.deepEqual(first.map(message => message.beatNumber), Array.from({ length: beatsPerBar }, (_, i) => i + 1));
    const markers = first.filter(message => message.chords.some(chord => chord.beat === message.beat));
    assert.deepEqual(markers.map(message => message.beat), [0, Math.ceil(beatsPerBar / 2)]);
    for (const message of first) {
      const chord = message.chords.findLast(chord => chord.beat <= message.beat);
      assert.equal(message.chordRoot, chord.root); assert.equal(message.chordQuality, chord.quality);
      assert(Math.abs(message.seconds - message.beat * 0.5) <= 1 / 12000);
    }
  }
});

test('a generated sixteen-step beat spans the chosen measure and naming accepts its empty beat-only melody', () => {
  for (const beatsPerBar of [2, 3, 5, 6, 7]) {
    const messages = [], player = new DJRenderer(12000, bank, { style: 'bossa', tempo: 120, swing: 0.5, seed: 47, beatsPerBar, beatOnly: true }, message => messages.push(message));
    block(player);
    const pattern = [0, 4, 8, 12, 15].map(step => ({ instrument: 'hat', step, velocity: 0.3 }));
    player.configure({ jazzPart: { requestId: 'meter-beat', targetSet: player.info.set, targetSeed: player.info.seed, result: { ...result, pattern } } }); nextBar(player);
    assert.deepEqual(player.events.map(event => event.beat), pattern.map(hit => hit.step * beatsPerBar / 16));
    for (const event of player.events) assert(event.time + event.duration <= beatsPerBar * 0.5 + EPS);
    player.configure({ nameSnapshot: 'beat-snapshot' });
    const snapshot = messages.find(message => message.nameSnapshot); assert(snapshot.context);
    assert.equal(snapshot.context.beatOnly, true); assert.equal(snapshot.context.beatsPerBar, beatsPerBar); assert.deepEqual(snapshot.context.motif, []);
  }
});

const favorites = [
  { style: 'swing', tonic: 6, weight: 1, chords: [{ root: 6, quality: 'ø7' }, { root: 11, quality: '13' }] },
  { style: 'swing', tonic: 2, weight: 9, chords: [{ root: 2, quality: 'm6' }, { root: 9, quality: '7♭9' }] },
  { style: 'blues', tonic: 8, weight: 100, chords: [{ root: 8, quality: '7♭9' }] }
];
test('liked progressions actually recur with a bounded sixty-five-percent bias, weighted likes and fresh melody', () => {
  const composer = compose('swing', { phraseBars: 4, favoriteProgressions: favorites });
  let light = 0, heavy = 0; const melodies = new Set();
  for (let chorus = 0; chorus < 512; chorus++) {
    const first = composer.nextBar(), quality = first.info.chords[0].quality;
    assert.notEqual(quality, '7♭9', 'feedback from another style is excluded');
    if (quality === 'ø7') { light++; assert.equal(first.info.tonic, 6); assert.equal(first.info.chords[0].root, 6); }
    if (quality === 'm6') { heavy++; assert.equal(first.info.tonic, 2); assert.equal(first.info.chords[0].root, 2); }
    if (['ø7', 'm6'].includes(quality)) melodies.add(JSON.stringify(first.events.filter(event => event.role === 'melody').map(event => event.note)));
    for (let bar = 1; bar < 4; bar++) {
      const next = composer.nextBar();
      if (quality === 'ø7' || quality === 'm6') assert.equal(next.info.chords[0].quality, bar % 2 ? quality === 'ø7' ? '13' : '7♭9' : quality);
    }
  }
  assert((light + heavy) / 512 > 0.55 && (light + heavy) / 512 < 0.75);
  assert(heavy / (light + heavy) > 0.8 && heavy / (light + heavy) < 0.97);
  assert(melodies.size > 20, 'learning repeats harmony without replaying one fixed melody');
});

test('favorite harmony transposes to a locked key and feedback updates wait for the next chorus without resetting', () => {
  const favorite = { style: 'swing', tonic: 2, chords: [{ root: 5, quality: 'm6' }, { root: 9, quality: '13' }] };
  const player = compose('swing', { keyRoot: 9, phraseBars: 4, favoriteProgressions: [favorite] });
  const first = player.nextBar(); assert.equal(first.info.tonic, 9); assert.equal(first.info.chords[0].root, 0);
  const unchangedSet = first.info.set; player.configure({ favoriteProgressions: favorites });
  const second = player.nextBar(); assert.equal(second.info.bar, 2); assert.equal(second.info.set, unchangedSet); assert.equal(second.info.chords[0].quality, '13');
  const plain = compose(), disabled = compose('swing', { favoriteProgressions: favorites, favorLikes: false });
  for (let index = 0; index < 160; index++) assert.deepEqual(disabled.nextBar().events, plain.nextBar().events);
});

test('new station fields are backward compatible but provided invalid controls or learned patterns are rejected', () => {
  const old = Object.fromEntries(Object.entries(JAZZ_DEFAULT_SETTINGS).filter(([key]) => !Object.hasOwn(JAZZ_ARRANGEMENT_DEFAULTS, key)));
  assert.deepEqual(validateRadioSettings(old), JAZZ_DEFAULT_SETTINGS);
  for (const patch of [{ beatsPerBar: 1 }, { beatsPerBar: '3' }, { beatsPerBar: 8 }, { phraseBars: 12 }, { phraseBars: '8' },
    { beatOnly: 1 }, { beatOnly: undefined }, { keyRoot: 12 }, { keyRoot: 'C' }, { favorLikes: 'false' }]) assert.throws(() => validateRadioSettings({ ...old, ...patch }), error => error.status === 400);
  assert.equal(djValidateFavoriteProgressions([favorites[0]])[0].weight, 1);
  for (const input of [null, Array(33).fill(favorites[0]), [{ ...favorites[0], weight: 0 }], [{ ...favorites[0], weight: 1.5 }],
    [{ ...favorites[0], tonic: 12 }], [{ ...favorites[0], chords: [] }], [{ ...favorites[0], chords: [{ root: 0, quality: 'unknown' }] }]]) assert.throws(() => djValidateFavoriteProgressions(input));
});

test('legacy naming contexts stay accepted without mutation and meter/feedback context is strictly sanitized', () => {
  const legacyBefore = JSON.stringify(oldContext), normalized = validateJazzContext(oldContext);
  assert.equal(normalized.beatsPerBar, 4); assert.equal(normalized.phraseBars, 'genre'); assert.equal(normalized.beatOnly, false); assert.equal(JSON.stringify(oldContext), legacyBefore);
  const input = { ...oldContext, beatsPerBar: 7, beatOnly: true, motif: [], tonic: 9, progression: [{ root: 9, quality: 'm9', ignored: 'discard' }],
    chords: [{ beat: 0, text: 'Am9' }, { beat: 4, text: 'E13' }] };
  const valid = validateJazzContext(input); assert.deepEqual(valid.progression, [{ root: 9, quality: 'm9' }]); assert.equal(valid.tonic, 9);
  for (const patch of [{ motif: [], beatOnly: false }, { beatsPerBar: 8 }, { tonic: 12 }, { progression: [] }, { progression: Array(9).fill({ root: 0, quality: 'm9' }) },
    { progression: [{ root: -1, quality: 'm9' }] }, { progression: [{ root: 0, quality: 'mystery' }] }]) assert.throws(() => validateJazzContext({ ...input, ...patch }));
});

