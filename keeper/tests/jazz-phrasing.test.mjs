// SPDX-License-Identifier: GPL-3.0-only
import test from 'node:test';
import assert from 'node:assert/strict';
import * as jazz from '../public/jazz-core.mjs';

const { DJComposer, DJ_STYLES } = jazz;
const EPSILON = 1e-8;
const phraseRoles = ['call', 'repeat', 'answer', 'cadence'];
const pitchClass = note => ((note % 12) + 12) % 12;
const lead = bar => bar.events.filter(event => event.role === 'melody');

function makeComposer(style, seed, overrides = {}) {
  const preset = DJ_STYLES[style];
  return new DJComposer({ style, seed, tempo: preset.tempo, swing: preset.swing, ...overrides });
}

function beatOf(event) {
  assert(Number.isFinite(event.beat), 'Each musical event exposes its nominal beat.');
  assert(event.beat >= 0 && event.beat < 4, 'A bar onset stays within its four beats.');
  return event.beat;
}

// Derive timing from the musical definition of swing: the two eighth notes
// divide a quarter in the chosen long/short ratio, keeping quarter boundaries.
function gridTime(event, info) {
  const beat = beatOf(event), quarter = Math.floor(beat), subdivision = beat - quarter;
  const fraction = subdivision <= 0.5 ? subdivision * 2 * info.swing :
    info.swing + (subdivision - 0.5) * 2 * (1 - info.swing);
  return (quarter + fraction) * 60 / info.tempo;
}

function near(actual, expected, message) {
  assert(Math.abs(actual - expected) < EPSILON, `${message}: got ${actual}, expected ${expected}`);
}

test('rootless voicings keep three distinct colors within range and include the harmonic guide tones', () => {
  assert.equal(typeof jazz.djVoiceLead, 'function', 'The public voice-leading helper is available.');
  const guideIntervals = new Map([
    ['maj9', [4, 11]], ['m9', [3, 10]], ['13', [4, 10]], ['7', [4, 10]],
    ['7♭9', [4, 10]], ['ø7', [3, 10]], ['6/9', [4, 9]], ['m6', [3, 9]], ['9', [4, 10]]
  ]);
  for (const [quality, guides] of guideIntervals) for (let root = 0; root < 12; root++) {
    const voicing = jazz.djVoiceLead(root, quality, [55, 62, 67]);
    assert.equal(voicing.length, 3, `${quality} has two guide tones and one color.`);
    assert(voicing.every(note => Number.isInteger(note) && note >= 52 && note <= 76));
    assert(voicing[0] < voicing[1] && voicing[1] < voicing[2], 'Voices are sorted and do not double a MIDI note.');
    const colors = new Set(voicing.map(pitchClass));
    assert.equal(colors.size, 3, 'An octave doubling does not substitute for the third chord color.');
    for (const interval of guides) assert(colors.has(pitchClass(root + interval)), `${quality} retains its guide tone ${interval}.`);
    assert(!colors.has(root), 'The bass owns the root of this rootless voicing.');
  }
});

test('Dm9 to G13 to Cmaj9 retains common guide tones and resolves the moving guide by a semitone', () => {
  assert.equal(typeof jazz.djVoiceLead, 'function');
  const dm = jazz.djVoiceLead(2, 'm9');
  const g = jazz.djVoiceLead(7, '13', dm);
  const c = jazz.djVoiceLead(0, 'maj9', g);
  const noteFor = (voicing, pc) => {
    const note = voicing.find(value => pitchClass(value) === pc);
    assert(Number.isInteger(note), `Guide-tone pitch class ${pc} is present.`);
    return note;
  };
  assert.equal(noteFor(dm, 5), noteFor(g, 5), 'F stays in place from Dm9 to G13.');
  assert.equal(noteFor(g, 11), noteFor(dm, 0) - 1, 'C resolves down a semitone to B.');
  assert.equal(noteFor(c, 11), noteFor(g, 11), 'B stays in place from G13 to Cmaj9.');
  assert.equal(noteFor(c, 4), noteFor(g, 5) - 1, 'F resolves down a semitone to E.');
  for (const [before, after] of [[dm, g], [g, c]]) {
    const movement = after.map((note, index) => Math.abs(note - before[index]));
    assert(movement.every(distance => distance <= 2), 'No individual voice makes an unnecessary register jump.');
    assert(movement.reduce((total, distance) => total + distance, 0) <= 4, 'The cadence moves economically as a whole.');
  }
});

test('relaxed four-bar phrases have a call, rhythmic repeat, answer and cadence with room between lead notes', () => {
  for (const style of Object.keys(DJ_STYLES)) for (const seed of [17, 47, 91]) {
    const composer = makeComposer(style, seed);
    for (let phrase = 0; phrase < 8; phrase++) {
      const bars = Array.from({ length: 4 }, () => composer.nextBar());
      assert.deepEqual(bars.map(bar => bar.info.phraseRole), phraseRoles, `${style} exposes its phrase roles.`);
      for (const bar of bars) {
        const melody = lead(bar);
        assert(melody.length >= 2 && melody.length <= 4, `${style} uses two to four relaxed lead notes per bar.`);
        for (const event of melody) beatOf(event);
      }
      assert.deepEqual(lead(bars[1]).map(beatOf), lead(bars[0]).map(beatOf),
        `${style} repeats the call's rhythmic onsets even when its pitches or expression change.`);
      assert.notEqual(lead(bars[1]).at(-1).note, lead(bars[0]).at(-1).note,
        `${style} gives the repeated call a changed ending.`);
    }
  }
});

test('the cadence ends its lead by beat three and leaves at least the final beat free', () => {
  for (const style of Object.keys(DJ_STYLES)) for (const seed of [17, 47, 91]) {
    const composer = makeComposer(style, seed);
    let cadences = 0;
    for (let i = 0; i < 32; i++) {
      const bar = composer.nextBar();
      if (bar.info.phraseRole !== 'cadence') continue;
      cadences++;
      const beatSeconds = 60 / bar.info.tempo;
      const melody = lead(bar);
      assert(melody.length >= 2, 'A cadence has audible lead material before its rest.');
      for (const event of melody) {
        assert(beatOf(event) <= 2, 'Cadence lead onsets stop after beat two.');
        assert(event.time + event.duration <= 3 * beatSeconds + EPSILON,
          'The lead note is released by beat three, allowing at least one full beat of rest.');
      }
    }
    assert.equal(cadences, 8, `${style} completes a cadence in every four-bar phrase.`);
  }
});

test('bass and percussion remain exact rhythmic anchors without independent onset jitter', () => {
  let checked = 0;
  for (const style of Object.keys(DJ_STYLES)) for (const tempo of [55, DJ_STYLES[style].tempo, 180]) {
    const composer = makeComposer(style, 47, { tempo });
    for (let i = 0; i < 16; i++) {
      const bar = composer.nextBar();
      const anchors = bar.events.filter(event => event.instrument === 'bass' || event.role === 'drums');
      assert(anchors.length >= 4, 'The phrase keeps its rhythmic accompaniment.');
      for (const event of anchors) {
        near(event.time, gridTime(event, bar.info), `${style} ${event.instrument} stays on the grid at ${tempo} BPM`);
        checked++;
      }
    }
  }
  assert(checked > 100, 'The check covers many bass and drum attacks.');
});

test('swing and blues delay integer-beat lead notes coherently per phrase while keeping offbeats on the swung grid', () => {
  let checkedDelayed = 0, checkedOffbeat = 0;
  for (const style of ['swing', 'blues']) for (const seed of [17, 47, 91]) {
    const composer = makeComposer(style, seed);
    for (let phrase = 0; phrase < 8; phrase++) {
      const delays = [];
      for (let i = 0; i < 4; i++) {
        const bar = composer.nextBar();
        for (const event of lead(bar)) {
          const beat = beatOf(event), delay = event.time - gridTime(event, bar.info);
          if (Number.isInteger(beat)) {
            assert(delay > EPSILON && delay < 0.5 * 60 / bar.info.tempo,
              'An integer-beat lead note sits positively behind its anchor without moving to the next subdivision.');
            delays.push(delay); checkedDelayed++;
          } else {
            near(delay, 0, `${style} offbeat keeps the shared swung grid`);
            checkedOffbeat++;
          }
        }
      }
      for (const delay of delays.slice(1)) near(delay, delays[0], `${style} uses one coherent lead delay throughout the phrase`);
    }
  }
  assert(checkedDelayed > 0 && checkedOffbeat > 0, 'The check exercises both delayed beats and aligned offbeats.');
});

test('straight bossa lead notes have no swing backbeat delay or independent timing jitter', () => {
  let checked = 0;
  for (const tempo of [55, DJ_STYLES.bossa.tempo, 180]) {
    const composer = makeComposer('bossa', 47, { tempo, swing: 0.5 });
    for (let i = 0; i < 32; i++) {
      const bar = composer.nextBar();
      assert.equal(bar.info.swing, 0.5);
      for (const event of lead(bar)) {
        near(event.time, beatOf(event) * 60 / tempo, 'Bossa lead stays on its straight subdivision');
        checked++;
      }
    }
  }
  assert(checked > 0);
});
