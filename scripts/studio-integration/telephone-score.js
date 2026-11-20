(function (root) {
  'use strict';
  const node = typeof module !== 'undefined' && module.exports;
  const C = node ? require('./core.js') : root.DotWave;
  function checked(record) {
    C.assert(record && record.kind === 'doodleverse-telephone-project' && record.version === 1, 'Choose a Telephone World project.');
    C.assert(typeof record.id === 'string' && /^[a-zA-Z0-9_-]{1,90}$/.test(record.id), 'Invalid Telephone project identifier.');
    C.assert(typeof record.title === 'string' && record.title.trim() && record.title.length <= 160, 'Invalid Telephone project title.');
    C.assert(['fiction', 'personal', 'observer', 'talky'].includes(record.sourceMode), 'Invalid source handling mode.');
    for (const key of ['sourceText', 'storyText', 'characterText', 'poemText', 'masterText', 'asciiText']) C.assert(typeof record[key] === 'string' && record[key].length <= 250000, 'Invalid Telephone text.');
    return record;
  }
  function seedOf(text) {
    let seed = 2166136261;
    for (let i = 0; i < text.length; i++) { seed ^= text.charCodeAt(i); seed = Math.imul(seed, 16777619) >>> 0; }
    return seed;
  }
  function provenance(record) {
    checked(record);
    return {projectId: record.id, title: record.title, sourceMode: record.sourceMode, sourceText: record.sourceText,
      storyText: record.storyText, characterText: record.characterText, generatedBy: 'Telephone Score 1'};
  }
  function make(record) {
    checked(record);
    // A text-derived composition is editable music. Source writing is never rewritten.
    const text = (record.sourceText + '\n' + record.storyText + '\n' + record.characterText) || record.title;
    const seed = seedOf(text), codes = Array.from(text, c => c.codePointAt(0));
    if (!codes.length) codes.push(seed);
    const p = C.blank(), minor = (seed & 1) === 1, scale = minor ? [0, 2, 3, 5, 7, 8, 10] : [0, 2, 4, 5, 7, 9, 11];
    const rootNote = (seed >>> 3) % 12, bpm = 72 + (seed >>> 8) % 49;
    C.syncTempo(p, bpm); p.song.name = (record.title + ' · Telephone').slice(0, 64); p.melody.name = p.song.name;
    p.melody.bars = 4; p.melody.root = rootNote; p.melody.mode = minor ? 'minor' : 'major';
    const melody = p.melody.tracks[0], chords = p.melody.tracks[1], bass = p.melody.tracks[2];
    const progression = [0, (seed >>> 16) % 7, 3, 4];
    for (let bar = 0; bar < 4; bar++) {
      const degree = progression[bar], root = rootNote + scale[degree];
      for (let step = 0; step < 8; step++) {
        const code = codes[(bar * 8 + step) % codes.length], start = bar * 4 + step * .5;
        if (step % 4 === 0 || code % 5 !== 0) melody.notes.push({start,
          midi: 60 + rootNote + scale[(degree + code) % 7] + (code % 4 === 0 ? 12 : 0), duration: Math.min(code % 3 === 0 ? .75 : .4, p.melody.bars * 4 - start), velocity: .42 + (code % 5) * .055});
      }
      for (const offset of [0, 2, 4]) {
        const index = degree + offset;
        chords.notes.push({start: bar * 4, midi: 48 + rootNote + scale[index % 7] + Math.floor(index / 7) * 12, duration: 3.6, velocity: .33});
      }
      for (const beat of [0, 2]) bass.notes.push({start: bar * 4 + beat, midi: 36 + root, duration: 1.6, velocity: .57});
    }
    for (const part of ['melody', 'chords', 'bass']) {
      const pattern = C.patternFromPart(p, part, null, part === 'melody' ? 'Telephone melody' : part === 'chords' ? 'Story chords' : 'Phone cord bass');
      p.patterns.push(pattern); const selection = C.addPattern(p, pattern, 0); C.findClip(p, selection).repeats = 2;
    }
    p.beat.name = 'Telephone footsteps'; p.beat.pattern.swing = (seed % 3) * .06;
    for (const track of p.beat.pattern.tracks) track.steps.fill(0);
    const [kick, snare, hat, perc] = p.beat.pattern.tracks;
    for (const i of [0, 8]) kick.steps[i] = 1;
    for (const i of [4, 12]) snare.steps[i] = .5;
    for (let i = 0; i < 16; i += 2) hat.steps[i] = codes[i % codes.length] % 3 === 0 ? 1 : .5;
    perc.steps[(seed >>> 22) % 16] = .5;
    const selection = C.addBeat(p, p.beat, 0), first = C.findClip(p, selection);
    for (let bar = 1; bar < 8; bar++) p.song.clips.push({...C.clone(first), id: C.id('beatclip'), start: bar * 4});
    p.compatibility.telephone = provenance(record);
    return C.validate(p);
  }
  const api = {make, checked, provenance, seedOf};
  if (node) module.exports = api; else root.TelephoneScore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
