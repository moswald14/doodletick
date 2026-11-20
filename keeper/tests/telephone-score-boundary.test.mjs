// SPDX-License-Identifier: GPL-3.0-only
// Load the delivered browser modules and their actual DSP/validator globals.
// No CommonJS substitution, audio rendering, browser, server or owner data.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const source = (await readFile(new URL('../public/studio-app.js', import.meta.url), 'utf8')).replaceAll('\r\n', '\n');
const end = source.indexOf('\nclass DotAudio {');
assert.ok(end > 0, 'Locate the end of the embedded browser module prefix');
const scope = { URL, URLSearchParams, TextEncoder, TextDecoder, atob, btoa, location:{search:''},
  document: { currentScript: { src: 'https://keeper.example.invalid/studio-app.js' } } };
scope.window = scope;
vm.runInNewContext(source.slice(0, end), scope, { filename: 'studio-browser-modules-fixture.js' });
assert.equal('module' in scope, false); assert.equal('require' in scope, false);
assert.equal(typeof scope.TelephoneScore?.make, 'function');
assert.equal(typeof scope.DotWave?.validate, 'function');
const { TelephoneScore, DotWave } = scope;
const plain = value => JSON.parse(JSON.stringify(value));
function record(sourceText, sourceMode = 'fiction') {
  return { kind: 'doodleverse-telephone-project', version: 1, id: 'score-boundary-fixture', title: 'A quiet telephone', sourceMode,
    sourceText, masterText: '\tProtected master stays exact.\r\n  Second line. ☎',
    storyText: 'A separate generated story; it does not replace the input.',
    characterText: 'Three moths, each carrying a borrowed star.', poemText: 'A separate poem.', asciiText: ' /\\_/\\\n( o.o )',
    machine: { controls: [{ id: 'seed', tag: 'textarea', value: sourceText }], outputs: [{ id: 'storyOut', text: 'A saved literal output.' }] }, soundtrack: null };
}
function bounds(project) {
  const melodyEnd = project.melody.bars * 4;
  for (const track of project.melody.tracks) for (const note of track.notes) {
    assert.ok(note.duration > 0 && note.start >= 0);
    assert.ok(note.start + note.duration <= melodyEnd + 1e-9, `${track.id}: note ends at ${note.start + note.duration}, after ${melodyEnd}`);
  }
  for (const pattern of project.patterns) for (const note of pattern.notes) {
    assert.ok(note.start + note.duration <= pattern.duration + 1e-9, `${pattern.partId}: copied pattern note exceeds its duration`);
  }
}

test('Telephone score fits the final long note, serializes successfully and preserves original writing', () => {
  const input = record('A paper moon answers a quiet telephone. Three moths return borrowed stars.');
  const before = plain(input);
  const project = TelephoneScore.make(input);
  assert.equal(project.melody.bars, 4); bounds(project);
  const finalNote = project.melody.tracks[0].notes.find(note => note.start === 15.5);
  assert.ok(finalNote, 'Keep the final generated melody note');
  assert.ok(finalNote.duration <= .5, 'The final note must fit the remaining half beat');
  const validated = DotWave.validate(project), serialized = DotWave.serialize(validated);
  const restored = DotWave.open(JSON.parse(serialized));
  bounds(restored);
  assert.deepEqual(plain(restored.melody), plain(validated.melody));
  assert.equal(restored.compatibility.telephone.sourceText, input.sourceText);
  assert.equal(restored.compatibility.telephone.storyText, input.storyText);
  assert.equal(restored.compatibility.telephone.sourceMode, input.sourceMode);
  assert.deepEqual(input, before, 'Generating or serializing a score cannot rewrite input, source, master or existing outputs');
});

test('short, skipped, long and Unicode-derived final notes stay inside their editable patterns', () => {
  const texts = [
    ...['b', 'c', 'd', '🐙', '☂', '😀'].map(last => 'a'.repeat(31) + last),
    ...['b', 'c', 'd'].map(last => '🌙'.repeat(31) + last),
    '', 'a', '☎🦀漢字', 'e\u0301'.repeat(24),
  ];
  const modes = ['fiction', 'personal', 'observer', 'talky'], lastDurations = new Set();
  let skippedFinal = false, interiorLong = false;
  for (const [index, text] of texts.entries()) {
    const input = record(text, modes[index % modes.length]), before = plain(input);
    const project = TelephoneScore.make(input); bounds(project);
    const notes = project.melody.tracks[0].notes, final = notes.find(note => note.start === 15.5);
    if (final) lastDurations.add(final.duration); else skippedFinal = true;
    interiorLong ||= notes.some(note => note.start < 15.5 && note.duration === .75);
    const reopened = DotWave.open(JSON.parse(DotWave.serialize(project))); bounds(reopened);
    assert.equal(reopened.compatibility.telephone.sourceText, text);
    assert.deepEqual(input, before, `Source case ${index} must remain unchanged`);
  }
  assert.ok(lastDurations.has(.4), 'Keep short final notes');
  assert.ok(lastDurations.has(.5), 'Fit long final notes into the remaining half beat');
  assert.ok(skippedFinal, 'Exercise inputs whose last step is a rest');
  assert.ok(interiorLong, 'Keep the longer interior notes instead of shortening every note');
});

test('the real Studio validator still rejects an out-of-bounds melody note', () => {
  const project = TelephoneScore.make(record('a'.repeat(32)));
  const invalid = plain(project), final = invalid.melody.tracks[0].notes.find(note => note.start === 15.5);
  assert.ok(final); final.duration = .75;
  assert.throws(() => DotWave.validate(invalid), /A note extends beyond the melody/);
});
