// SPDX-License-Identifier: GPL-3.0-only
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { DJ_GENRES, DJ_GENRE_IDS, djGenreChart } from '../public/jazz-genres.mjs';
import { DJComposer, DJRenderer, DJ_STYLES, DJ_NOTES, djMakeBank } from '../public/jazz-core.mjs';

const ids = ['swing', 'blues', 'bossa', 'bebop', 'cool', 'modal', 'latin', 'funk'];
const composer = (style, patch = {}) => new DJComposer({ ...DJ_STYLES[style], style, seed: 47, ...patch });
const bars = (style, count) => { const c = composer(style); return Array.from({ length: count }, () => c.nextBar()); };
const attacks = (bar, instrument) => bar.events.filter(event => event.instrument === instrument).map(event => event.beat);

test('the eight genre choices expose frozen, JSON-safe musical presets', () => {
  assert.deepEqual(DJ_GENRE_IDS, ids);
  assert.deepEqual(Object.keys(DJ_STYLES), ids);
  assert.equal(DJ_STYLES, DJ_GENRES);
  assert(Object.isFrozen(DJ_GENRES) && Object.isFrozen(DJ_GENRE_IDS));
  assert.deepEqual(JSON.parse(JSON.stringify(DJ_GENRES)), DJ_GENRES);
  for (const id of ids) {
    const genre = DJ_GENRES[id];
    assert(Object.isFrozen(genre));
    assert(genre.name && genre.label && genre.description);
    assert(genre.tempo >= 55 && genre.tempo <= 180);
    assert(genre.swing >= 0.5 && genre.swing <= 0.72);
    assert([12, 16, 32].includes(genre.bars));
    assert(Number.isInteger(genre.tonic) && genre.tonic >= 0 && genre.tonic < 12);
    if (['bossa', 'latin', 'funk'].includes(id)) assert.equal(genre.swing, 0.5);
  }
  const a = djGenreChart('bebop'), b = djGenreChart('bebop');
  a[0][0].root = 99;
  assert.notEqual(b[0][0].root, 99, 'A caller cannot mutate another composer’s chart.');
});

test('all genre forms are seeded, bounded and expose absolute chord metadata without changing their clock', () => {
  const qualities = new Set(['maj9', 'm9', '13', '7', '7♭9', 'ø7', '6/9', 'm6', '9']);
  for (const style of ids) {
    const a = composer(style), b = composer(style);
    let nextChord = 0;
    for (let index = 0; index < DJ_STYLES[style].bars * 2; index++) {
      const bar = a.nextBar();
      assert.deepEqual(bar, b.nextBar(), `${style} is reproducible from its seed and settings.`);
      assert.equal(bar.info.barIndex, index);
      assert.equal(bar.info.bar, index % DJ_STYLES[style].bars + 1);
      assert.equal(bar.duration, 4 * 60 / DJ_STYLES[style].tempo);
      assert(bar.events.length > 8 && bar.events.length < 96);
      assert.equal(bar.info.chords[0].beat, 0);
      assert(bar.info.chords.length >= 1 && bar.info.chords.length <= 2);
      for (const chord of bar.info.chords) {
        assert.equal(chord.index, nextChord++);
        assert(Number.isInteger(chord.root) && chord.root >= 0 && chord.root < 12);
        assert(qualities.has(chord.quality));
        assert.equal(chord.text, DJ_NOTES[chord.root] + chord.quality);
        assert(chord.beat === 0 || chord.beat === 2);
      }
      for (const event of bar.events) {
        assert(Number.isFinite(event.time) && event.time >= 0 && event.time < bar.duration);
        assert(Number.isFinite(event.duration) && event.duration > 0);
        assert(Number.isFinite(event.velocity) && event.velocity > 0 && event.velocity <= 1);
        assert(Number.isFinite(event.beat) && event.beat >= 0 && event.beat < 4);
      }
      assert.doesNotThrow(() => JSON.stringify(bar));
    }
  }
});

test('new genre choices change harmony and accompaniment rather than just their labels', () => {
  const signatures = new Set();
  for (const style of ids) {
    const form = bars(style, DJ_STYLES[style].bars);
    const tonic = DJ_STYLES[style].tonic;
    signatures.add(JSON.stringify(form.map(bar => ({
      harmony: bar.info.chords.map(c => [c.beat, (c.root - tonic + 12) % 12, c.quality]),
      bass: attacks(bar, 'bass'),
      drums: bar.events.filter(e => e.role === 'drums').map(e => [e.instrument, e.beat]),
      comp: [...new Set(bar.events.filter(e => e.role === 'piano').map(e => e.beat))]
    }))));
  }
  assert.equal(signatures.size, 8);
  const swing = bars('swing', 32), bebop = bars('bebop', 32);
  assert(bebop.filter(b => b.info.chords.length === 2).length > swing.filter(b => b.info.chords.length === 2).length,
    'Bebop turns through its harmonies more frequently than the original swing form.');
  const modal = bars('modal', 16);
  assert(modal.slice(0, 8).every(b => b.info.chords[0].root === 2 && b.info.chords[0].quality === 'm9'));
  assert(modal.slice(8, 12).every(b => b.info.chords[0].root === 3));
  assert(modal.slice(12).every(b => b.info.chords[0].root === 2));
  const cool = bars('cool', 16);
  const compDensity = form => form.reduce((sum, b) => sum + b.events.filter(e => e.role === 'piano').length, 0) / form.length;
  assert(compDensity(cool) < compDensity(swing), 'Cool accompaniment leaves more space.');
  assert(cool.every(b => attacks(b, 'bass').length === 2));
});

test('Afro-Cuban jazz maintains its two-bar clave while jazz funk uses a sixteenth grid and backbeat', () => {
  const latin = bars('latin', 4), funk = bars('funk', 4);
  assert.deepEqual(attacks(latin[0], 'stick'), [1, 2]);
  assert.deepEqual(attacks(latin[1], 'stick'), [0, 1.5, 3]);
  assert.deepEqual(attacks(latin[2], 'stick'), [1, 2]);
  assert.deepEqual(attacks(latin[3], 'stick'), [0, 1.5, 3]);
  assert(latin.every(b => attacks(b, 'bass').includes(3.5)), 'Bass anticipates the following bar.');
  for (const bar of funk) {
    assert.deepEqual(attacks(bar, 'hat'), Array.from({ length: 16 }, (_, i) => i / 4));
    assert.deepEqual(attacks(bar, 'stick'), [1, 3]);
    assert(attacks(bar, 'kick').includes(0.75) && attacks(bar, 'kick').includes(2.75));
    assert.equal(attacks(bar, 'bass').length, 5);
    assert.equal(attacks(bar, 'ride').length, 0);
  }
});

test('bebop adds chromatic neighbors while the original swing melody stays within its chosen chord tones', () => {
  const intervals = { maj9: [0, 4, 7, 11, 2], m9: [0, 3, 7, 10, 2], '13': [0, 4, 7, 10, 2, 9],
    '7': [0, 4, 7, 10], '7♭9': [0, 4, 7, 10, 1], 'ø7': [0, 3, 6, 10], '6/9': [0, 4, 7, 9, 2], m6: [0, 3, 7, 9], '9': [0, 4, 7, 10, 2] };
  const outside = style => bars(style, 32).reduce((count, bar) => count + bar.events.filter(e => {
    if (e.role !== 'melody') return false;
    const chord = bar.info.chords.findLast(c => c.beat <= e.beat);
    return !intervals[chord.quality].includes((e.note - chord.root + 120) % 12);
  }).length, 0);
  assert.equal(outside('swing'), 0);
  assert(outside('bebop') > 8, 'The quicker line has audible chromatic pitch material.');
});

test('audible chord IDs follow actual half-bar changes and remain monotonic across genre changes', () => {
  const rate = 12000, messages = [];
  const renderer = new DJRenderer(rate, djMakeBank(rate), { ...DJ_STYLES.bebop, style: 'bebop', seed: 47, tempo: 180 }, m => messages.push(m));
  const left = new Float32Array(128), right = new Float32Array(128);
  while (messages.length < 12) renderer.render(left, right);
  for (const message of messages) {
    const chord = message.chords.findLast(c => c.beat <= message.beat);
    assert.equal(message.chordIndex, chord.index);
    assert.equal(message.chordRoot, chord.root);
    assert.equal(message.chordQuality, chord.quality);
    assert.equal(message.chord, chord.text);
  }
  assert.equal(messages[0].chordIndex, messages[1].chordIndex);
  assert.equal(messages[2].chordIndex, messages[1].chordIndex + 1);
  const last = messages.at(-1);
  renderer.configure({ composition: { style: 'modal', tempo: 108, swing: 0.56 } });
  while (renderer.info.style !== 'modal') renderer.render(left, right);
  assert(renderer.info.barIndex > last.barIndex);
  assert(renderer.info.chords[0].index > last.chordIndex);
  assert.equal(renderer.info.bar, 1);
  assert(renderer.info.set > last.set);
});

test('the three legacy arrangements retain their pre-expansion musical event streams', () => {
  // Captured from the integrated pre-expansion source, excluding display metadata.
  const expected = {
    swing: 'c5f4c0f23667070ef3b25cc86935d6ad4ababdd9aa53fbe6f0e071e6f663d1f8',
    blues: 'a4c98946eb686f4dd3f9edf2bf2c4a628895d59835dde0cb44ce0c97323fd340',
    bossa: '2347261d0db571cd365901099251fee358684e7f60d822dd0f1d86a3193c8418'
  };
  for (const [style, digest] of Object.entries(expected)) {
    const c = composer(style), hash = createHash('sha256');
    for (let i = 0; i < 512; i++) {
      const bar = c.nextBar();
      hash.update(JSON.stringify({ events: bar.events, duration: bar.duration }));
    }
    assert.equal(hash.digest('hex'), digest, `${style} preserves the existing performance.`);
  }
});
