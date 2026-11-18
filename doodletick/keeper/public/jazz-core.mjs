// SPDX-License-Identifier: GPL-3.0-only
/* Doodle Jazz. Original procedural composition and synthesized instruments. */
import { validateJazzContext, validateJazzResult, validateJazzProgression } from './jazz-name-contract.mjs';
import { DJ_GENRES, djGenreChart } from './jazz-genres.mjs';
import { validateJazzArrangement } from './jazz-radio-contract.mjs';
const DJ_NOTES = ['C', 'D♭', 'D', 'E♭', 'E', 'F', 'G♭', 'G', 'A♭', 'A', 'B♭', 'B'];
const DJ_CHORDS = {
  maj9: [0, 4, 7, 11, 14], m9: [0, 3, 7, 10, 14], '13': [0, 4, 7, 10, 14, 21],
  '7': [0, 4, 7, 10], '7♭9': [0, 4, 7, 10, 13], 'ø7': [0, 3, 6, 10],
  '6/9': [0, 4, 7, 9, 14], m6: [0, 3, 7, 9], '9': [0, 4, 7, 10, 14]
};
const DJ_STYLES = DJ_GENRES;
const DJ_COMPOSITION_FIELDS = ['style', 'tempo', 'swing', 'seed', 'newSet', 'beatsPerBar', 'phraseBars', 'beatPattern', 'beatOnly', 'keyRoot', 'favorLikes', 'favoriteProgressions'];
const djClamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const djFreq = n => 440 * Math.pow(2, (n - 69) / 12);
const DJ_MOTIFS = [[0, 2, 4, 2], [0, 3, 5, 3], [0, -2, -3, 0], [0, 2, 0, -2], [0, -1, 2, 0]];
const DJ_CALL_RHYTHMS = [[0, 0.5, 1.5, 2], [0, 1, 1.5, 2.5], [0.5, 1, 2, 2.5]];
const DJ_GENRE_RHYTHMS = {
  bebop: [[0, 0.5, 1.5, 2.5], [0.5, 1, 1.5, 2.5], [0, 0.5, 1, 2.5]],
  cool: [[0, 1.5, 2.5], [0.5, 1.5, 2.75], [0, 1, 2.5]],
  modal: [[0, 1.5, 3], [0.5, 1.5, 2.75], [0, 1, 2.5]],
  latin: [[0, 0.75, 1.5, 2.75], [0.5, 1, 2.5, 3.5], [0, 1.5, 2, 3.25]],
  funk: [[0, 0.75, 1.75, 2.5], [0.25, 1, 2.5, 3.25], [0, 1.25, 2, 3.5]]
};

// Thirds and sevenths (sixths on sixth chords) carry the harmony. Enumerate
// nearby rootless shapes and keep common tones instead of jumping to fixed
// registers. One color tone leaves room for the bass and the melody.
function djVoiceLead(root, quality, previous = []) {
  const intervals = DJ_CHORDS[quality];
  if (!intervals) throw new Error('Unknown jazz chord quality.');
  const pitchClass = n => (n % 12 + 12) % 12;
  const candidates = interval => Array.from({ length: 25 }, (_, i) => i + 52)
    .filter(note => pitchClass(note) === pitchClass(root + interval));
  const colors = quality === '13' ? [14, 21] : [intervals[4] ?? intervals[2]];
  const target = previous.length === 3 ? previous : [55, 60, 65];
  let best = null, bestCost = Infinity;
  for (const third of candidates(intervals[1])) for (const seventh of candidates(intervals[3])) {
    for (const color of colors) for (const extension of candidates(color)) {
      const notes = [third, seventh, extension].sort((a, b) => a - b);
      if (notes[1] - notes[0] < 2 || notes[2] - notes[1] < 2 || notes[2] - notes[0] > 17) continue;
      const motion = notes.reduce((sum, note, i) => sum + Math.abs(note - target[i]), 0);
      const cost = motion + Math.abs(notes[1] - 61) * 0.08 + (notes[2] - notes[0]) * 0.025;
      if (cost < bestCost) { best = notes; bestCost = cost; }
    }
  }
  if (!best) throw new Error('No playable jazz voicing.');
  return best;
}

class DJRandom {
  constructor(seed) { this.state = (seed >>> 0) || 1; }
  next() {
    let v = this.state;
    v ^= v << 13; v ^= v >>> 17; v ^= v << 5;
    this.state = v >>> 0;
    return this.state / 4294967296;
  }
  pick(a) { return a[Math.floor(this.next() * a.length)]; }
}

function djValidateFavoriteProgressions(input) {
  if (!Array.isArray(input) || input.length > 32) throw new Error('Invalid favorite Jazz progressions.');
  return input.map(entry => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry) || !Object.hasOwn(DJ_STYLES, entry.style)
      || !Number.isInteger(entry.tonic) || entry.tonic < 0 || entry.tonic > 11) throw new Error('Invalid favorite Jazz progression.');
    const weight = Object.hasOwn(entry, 'weight') ? entry.weight : 1;
    if (!Number.isInteger(weight) || weight < 1 || weight > 100) throw new Error('Invalid favorite Jazz weight.');
    return { style: entry.style, tonic: entry.tonic, chords: validateJazzProgression(entry.chords), weight };
  });
}

// Small, reusable sample banks keep rendering work and memory bounded indefinitely.
function djMakeBank(rate = 24000) {
  const random = new DJRandom(271828);
  const bank = { rate, piano: [], bass: [], drums: {} };
  for (let note = 45; note <= 87; note += 3) {
    const length = Math.ceil(rate * 3.8), data = new Float32Array(length), f = djFreq(note);
    for (let harmonic = 1; harmonic <= 9; harmonic++) {
      const amplitude = [0, 0.73, 0.31, 0.18, 0.085, 0.055, 0.027, 0.018, 0.012, 0.007][harmonic];
      const decay = Math.exp(-1 / (rate * (2.1 / Math.pow(harmonic, 0.74))));
      const stretch = Math.sqrt(1 + 0.000045 * harmonic * harmonic);
      const w = 2 * Math.PI * f * harmonic * stretch / rate;
      if (f * harmonic > rate * 0.43) continue;
      const cs = Math.cos(w), sn = Math.sin(w);
      const cs2 = Math.cos(w * 1.0007), sn2 = Math.sin(w * 1.0007);
      let x = 0, y = 1, x2 = 0, y2 = 1, env = amplitude;
      for (let i = 0; i < length; i++) {
        data[i] += (x * 0.72 + x2 * 0.28) * env;
        const nx = x * cs + y * sn; y = y * cs - x * sn; x = nx;
        const nx2 = x2 * cs2 + y2 * sn2; y2 = y2 * cs2 - x2 * sn2; x2 = nx2;
        env *= decay;
      }
    }
    for (let i = 0; i < length; i++) {
      const t = i / rate;
      const attack = Math.min(1, t / 0.004);
      data[i] = (data[i] + (random.next() * 2 - 1) * 0.055 * Math.exp(-t * 105)) * attack * 0.65;
      if (i > length - rate * 0.1) data[i] *= (length - i) / (rate * 0.1);
    }
    bank.piano.push({ note, data });
  }
  for (let note = 30; note <= 57; note += 3) {
    const data = new Float32Array(Math.ceil(rate * 1.6));
    const period = rate / djFreq(note), size = Math.floor(period), fraction = period - size;
    const string = new Float32Array(size + 1);
    for (let i = 0; i < string.length; i++) string[i] = (random.next() * 2 - 1) * 0.85;
    let at = 0, body = 0;
    for (let i = 0; i < data.length; i++) {
      const next = (at + 1) % string.length, next2 = (at + 2) % string.length;
      const average = (string[at] + string[next]) * 0.5;
      string[at] = (average * fraction + (string[next] + string[next2]) * 0.5 * (1 - fraction)) * 0.994;
      body += (string[at] - body) * 0.14;
      data[i] = body * Math.min(1, i / (rate * 0.005));
      at = next;
      if (i > data.length - rate * 0.08) data[i] *= (data.length - i) / (rate * 0.08);
    }
    bank.bass.push({ note, data });
  }
  for (const kind of ['ride', 'brush', 'kick', 'hat', 'stick']) {
    const duration = kind === 'ride' ? 0.62 : kind === 'brush' ? 0.30 : 0.19;
    const data = new Float32Array(Math.ceil(rate * duration));
    let low = 0, last = 0;
    for (let i = 0; i < data.length; i++) {
      const t = i / rate, noise = random.next() * 2 - 1;
      low += 0.24 * (noise - low);
      const high = noise - low;
      if (kind === 'ride') {
        data[i] = (Math.sin(t * 2 * Math.PI * 2123) * 0.14 + Math.sin(t * 2 * Math.PI * 3517) * 0.08 +
          Math.sin(t * 2 * Math.PI * 5411) * 0.035 + high * 0.15) * Math.exp(-t * 10) * Math.min(1, t * 1800);
      } else if (kind === 'brush') {
        last += (high - last) * 0.48;
        data[i] = last * 0.32 * Math.exp(-t * 14) * Math.min(1, t * 500);
      } else if (kind === 'hat') {
        data[i] = high * 0.25 * Math.exp(-t * 65) * Math.min(1, t * 2500);
      } else if (kind === 'stick') {
        data[i] = (Math.sin(t * 2 * Math.PI * 740) * 0.4 + high * 0.25) * Math.exp(-t * 58) * Math.min(1, t * 3000);
      } else {
        data[i] = (Math.sin(2 * Math.PI * (46 * t + 2.6 * (1 - Math.exp(-t * 35)))) * 0.65 + low * 0.06) *
          Math.exp(-t * 24) * Math.min(1, t * 1400);
      }
      data[i] *= Math.min(1, (data.length - i) / (rate * 0.008));
    }
    bank.drums[kind] = data;
  }
  return bank;
}

class DJComposer {
  constructor(config = {}) {
    this.rng = new DJRandom(config.seed || 7);
    this.config = { style: 'swing', tempo: 112, swing: 0.64, ...config, ...validateJazzArrangement(config),
      favoriteProgressions: Object.hasOwn(config, 'favoriteProgressions') ? djValidateFavoriteProgressions(config.favoriteProgressions) : [] };
    this.pending = null;
    this.barIndex = 0; this.chordIndex = 0;
    this.bar = 0; this.chorus = 0; this.set = 1; this.lastMelody = 72; this.lastBass = 41;
    this.tonic = this.config.keyRoot === 'auto' ? DJ_STYLES[this.config.style].tonic : this.config.keyRoot;
    this.motif = [...DJ_MOTIFS[0]];
    this.phrase = null; this.lastVoicing = [];
    this.favorite = null;
  }
  configure(change) {
    const arrangement = validateJazzArrangement({ ...this.config, ...this.pending, ...change });
    this.pending = { ...this.pending, ...change, ...arrangement,
      ...(Object.hasOwn(change, 'favoriteProgressions') ? { favoriteProgressions: djValidateFavoriteProgressions(change.favoriteProgressions) } : {}) };
  }
  applyPending() {
    if (!this.pending) return;
    const change = this.pending; this.pending = null;
    const reset = (change.style && change.style !== this.config.style) || change.newSet
      || ['beatsPerBar', 'phraseBars', 'keyRoot'].some(key => Object.hasOwn(change, key) && change[key] !== this.config[key]);
    if (change.seed) { this.rng = new DJRandom(change.seed); this.config.seed = change.seed; }
    if (change.style && DJ_STYLES[change.style]) this.config.style = change.style;
    if (Number.isFinite(change.tempo)) this.config.tempo = djClamp(change.tempo, 55, 180);
    if (Number.isFinite(change.swing)) this.config.swing = djClamp(change.swing, 0.5, 0.72);
    Object.assign(this.config, validateJazzArrangement({ ...this.config, ...change }));
    if (Object.hasOwn(change, 'favoriteProgressions')) this.config.favoriteProgressions = change.favoriteProgressions;
    if (reset) {
      this.bar = 0; this.chorus = 0; this.set++;
      this.tonic = (DJ_STYLES[this.config.style].tonic + this.rng.pick([0, 0, 2, 5, 7])) % 12;
      if (this.config.keyRoot !== 'auto') this.tonic = this.config.keyRoot;
      this.motif = [...this.rng.pick(DJ_MOTIFS)];
      this.phrase = null; this.lastVoicing = []; this.favorite = null;
    }
  }
  genreChart() {
    const extra = djGenreChart(this.config.style);
    if (extra) return extra;
    const one = (root, quality) => [{ root, quality, start: 0, beats: 4 }];
    const two = (a, aq, b, bq) => [{ root: a, quality: aq, start: 0, beats: 2 }, { root: b, quality: bq, start: 2, beats: 2 }];
    if (this.config.style === 'blues') return [
      one(0, '9'), one(5, '9'), one(0, '9'), one(0, '13'), one(5, '9'), one(5, '9'),
      one(0, '9'), one(9, '7'), one(2, 'm9'), one(7, '13'), two(0, '9', 9, '7'), two(2, 'm9', 7, '13')
    ];
    if (this.config.style === 'bossa') return [
      one(0, 'm9'), one(0, 'm6'), one(2, 'ø7'), one(7, '7♭9'), one(0, 'm9'), one(0, 'm9'), one(5, 'm9'), one(10, '13'),
      one(3, 'maj9'), one(8, 'maj9'), one(2, 'ø7'), one(7, '7♭9'), one(0, 'm9'), one(8, '7'), two(2, 'ø7', 7, '7♭9'), two(0, 'm6', 7, '7♭9')
    ];
    const a = [one(0, 'maj9'), one(9, '7'), one(2, 'm9'), one(7, '13'), two(4, 'm9', 9, '7'),
      two(2, 'm9', 7, '13'), two(0, '6/9', 9, '7'), two(2, 'm9', 7, '13')];
    const bridge = [one(4, '7'), one(4, '13'), one(9, '7'), one(9, '13'), one(2, '7'), one(2, '13'), one(7, '7'), one(7, '13')];
    return [...a, ...a, ...bridge, ...a];
  }
  chooseProgression() {
    this.favorite = null;
    const choices = this.config.favorLikes ? this.config.favoriteProgressions.filter(entry => entry.style === this.config.style) : [];
    // The legacy random stream is untouched when no matching feedback exists.
    if (!choices.length || this.rng.next() >= 0.65) return;
    let position = this.rng.next() * choices.reduce((sum, entry) => sum + entry.weight, 0);
    this.favorite = choices.find(entry => (position -= entry.weight) < 0) || choices.at(-1);
    this.tonic = this.config.keyRoot === 'auto' ? this.favorite.tonic : this.config.keyRoot;
    this.motif = [...this.rng.pick(DJ_MOTIFS)]; this.phrase = null;
  }
  chart() {
    const source = this.favorite ? this.favorite.chords.map(chord => [{ root: (chord.root - this.favorite.tonic + 12) % 12,
      quality: chord.quality, start: 0, beats: 4 }]) : this.genreChart();
    const length = this.config.phraseBars === 'genre' ? DJ_STYLES[this.config.style].bars : this.config.phraseBars;
    return source.length === length ? source : Array.from({ length }, (_, index) => source[index % source.length]);
  }
  absoluteChord(c) { return { ...c, root: (c.root + this.tonic) % 12 }; }
  nearestPitch(pc, previous, low, high) {
    let best = low, distance = Infinity;
    for (let n = low; n <= high; n++) if ((n % 12 + 12) % 12 === (pc % 12 + 12) % 12 && Math.abs(n - previous) < distance) {
      best = n; distance = Math.abs(n - previous);
    }
    return best;
  }
  nextBar() {
    this.applyPending();
    if (this.bar === 0) this.chooseProgression();
    const meter = this.config.beatsPerBar;
    const source = this.chart(), chart = meter === 4 ? source : source.map(bar => bar.map((chord, index) => ({ ...chord,
      start: index ? Math.ceil(meter / 2) : 0, beats: bar.length === 1 ? meter : index ? Math.floor(meter / 2) : Math.ceil(meter / 2) })));
    const chords = chart[this.bar].map(c => this.absoluteChord(c));
    const nextChord = this.absoluteChord(chart[(this.bar + 1) % chart.length][0]);
    const phase = ['The melody', 'Piano wandering', 'A little breathing room', 'All together'][this.chorus % 4];
    const style = this.config.style, genre = DJ_STYLES[style];
    const events = [], rng = this.rng, bossa = style === 'bossa';
    const callRhythms = DJ_GENRE_RHYTHMS[style] || DJ_CALL_RHYTHMS;
    const seconds = 60 / this.config.tempo, swing = this.config.swing;
    const expand = rhythm => {
      if (meter === 4) return rhythm;
      const out = [];
      for (let offset = 0; offset < meter; offset += 4) for (const beat of rhythm) if (offset + beat < meter) out.push(offset + beat);
      return out;
    };
    const phraseBar = this.bar % 4, phraseRole = ['call', 'repeat', 'answer', 'cadence'][phraseBar];
    if (phraseBar === 0 || !this.phrase) {
      const rhythm = rng.pick(callRhythms);
      this.phrase = { rhythm: [...rhythm], callNotes: [], anchor: djClamp(this.lastMelody + rng.pick([-2, 0, 2]), 65, 75),
        delay: Math.min(0.018, seconds * (0.018 + rng.next() * 0.012)), level: 0.92 + rng.next() * 0.08 };
      if (style === 'cool') this.phrase.anchor = djClamp(this.phrase.anchor, 67, 72);
    }
    const drumStyle = this.config.beatPattern === 'genre' ? style : this.config.beatPattern;
    const drumSwing = this.config.beatPattern === 'genre' ? swing : DJ_STYLES[drumStyle].swing;
    const when = (beat, feel = swing) => {
      const whole = Math.floor(beat), frac = beat - whole;
      return (whole + (frac <= 0.5 ? frac * 2 * feel : feel + (frac - 0.5) * 2 * (1 - feel))) * seconds;
    };
    const add = (instrument, note, beat, beats, velocity, role = instrument, roll = 0) => {
      // The rhythm section anchors the pulse. Swing/blues melody downbeats sit
      // a little behind it, consistently through a phrase; offbeats line up.
      // Bossa keeps its straight grid. These are compositional choices, not a
      // claim that one timing offset reproduces every musician's swing.
      for (const onset of role === 'drums' ? expand([beat]) : [beat]) {
        if (onset >= meter) continue;
        const delay = !genre.straight && role === 'melody' && Number.isInteger(onset) ? this.phrase.delay : 0;
        const time = when(onset, role === 'drums' ? drumSwing : swing) + delay + roll;
        const duration = meter === 4 ? Math.max(0.05, beats * seconds) : Math.min(Math.max(0.05, beats * seconds), meter * seconds - time);
        if (duration > 0) events.push({ instrument, role, note, beat: onset, time, duration, velocity });
      }
    };
    const at = beat => chords.findLast(c => c.start <= beat) || chords[0];
    // Sparse accompaniment answers in the lead's rests. The bossa pattern
    // retains its own interlocking rhythm rather than borrowing swing comping.
    let compRhythm = bossa ? [0, 0.75, 1.5, 2.5, 3.25] : [[0.5, 3], [1, 3.5], [0, 2.75], [2, 3]][phraseBar];
    if (style === 'bebop') compRhythm = [[0.5, 1.5, 2.5, 3.5], [0, 1.5, 3], [0.5, 2, 3.5], [1, 2.5, 3.5]][phraseBar];
    else if (style === 'cool') compRhythm = [[0.5], [2.5], [0, 3], [2.5]][phraseBar];
    else if (style === 'modal') compRhythm = [0, 2.5];
    else if (style === 'latin') compRhythm = this.bar % 2 ? [0.5, 1, 1.5, 2.5, 3, 3.5] : [0, 0.5, 1.5, 2, 2.5, 3.5];
    else if (style === 'funk') compRhythm = [0.25, 0.75, 1.75, 2.5, 3.25];
    compRhythm = expand(compRhythm);
    for (const c of chords) {
      const rhythm = compRhythm.filter(b => b >= c.start && b < c.start + c.beats);
      if (!rhythm.length) continue;
      const voicing = djVoiceLead(c.root, c.quality, this.lastVoicing);
      this.lastVoicing = voicing;
      for (const beat of rhythm) {
        let level = (beat >= 3 ? 0.21 : 0.16) * (this.chorus % 4 === 2 ? 0.8 : 1);
        if (style === 'cool') level *= 0.7;
        else if (style === 'modal') level *= 0.78;
        const duration = style === 'cool' ? 1.3 : style === 'modal' ? 1.4 : style === 'funk' ? 0.28 : style === 'latin' ? 0.4 : bossa ? 0.56 : 0.72;
        voicing.forEach((note, i) => add('piano', note, beat, duration, level * [0.88, 1, 0.8][i], 'piano', i * 0.003));
      }
    }
    // A walking line approaches each following harmony; bossa uses a two-feel.
    const bassPattern = style === 'cool' || style === 'modal' ? [0, 2] : style === 'latin' ? [0, 1.5, 2.5, 3.5] :
      style === 'funk' ? [0, 0.75, 1.5, 2.75, 3.5] : bossa ? [0, 1.5, 2, 3.5] : [0, 1, 2, 3];
    const bassBeats = expand(bassPattern);
    bassBeats.forEach((beat, i) => {
      const step = i % bassPattern.length;
      const c = at(beat), intervals = DJ_CHORDS[c.quality];
      let pc = c.root;
      if (style === 'modal') pc += i ? 7 : 0;
      else if (style === 'cool') pc += i ? intervals[2] : 0;
      else if (style === 'latin') pc = i === 3 ? nextChord.root : c.root + (i % 2 ? intervals[2] : 0);
      else if (style === 'funk') pc += [0, 0, intervals[2], intervals[3], 12][step];
      else if (bossa) pc += i % 2 ? intervals[2] : 0;
      else if (meter === 4 ? i === 3 : i === bassBeats.length - 1) pc = nextChord.root + rng.pick([-1, 1]);
      else if (step === 1) pc += rng.pick([intervals[1], intervals[2]]);
      else if (step === 2) pc += rng.pick([0, intervals[2], intervals[3]]);
      let note = this.nearestPitch(pc, i === 0 ? 38 : this.lastBass, 33, 52);
      if (i === 0 && note > 45) note -= 12;
      this.lastBass = note;
      const length = style === 'cool' || style === 'modal' ? 1.7 : style === 'funk' ? 0.45 : bossa ? 1.12 : 0.9;
      add('bass', note, beat, length, [0.76, 0.58, 0.68, 0.56, 0.64][i % 5]);
    });
    // Four related bars: call, repeat its rhythm with a new ending, answer in
    // another direction/register, then a guide-tone cadence and real silence.
    // The motif remains recognizable during the solo and sparse choruses too.
    let leadBeats = [...this.phrase.rhythm];
    if (phraseRole === 'answer') leadBeats = [...callRhythms[(callRhythms.findIndex(r => r.every((b, i) => b === leadBeats[i])) + 1) % callRhythms.length]];
    if (phraseRole === 'cadence') leadBeats = leadBeats.filter(b => b <= 1.5).slice(0, 2);
    else if (this.chorus % 4 === 2) leadBeats = leadBeats.slice(0, 3);
    if (meter !== 4) leadBeats = [...new Set(leadBeats.map(beat => Math.round(beat * meter) / 4).filter(beat => beat < meter))];
    leadBeats.forEach((beat, i) => {
      const c = at(beat), intervals = DJ_CHORDS[c.quality], last = i === leadBeats.length - 1;
      const answer = phraseRole === 'answer';
      const contour = (answer ? -1 : 1) * this.motif[i % this.motif.length];
      const target = djClamp(this.phrase.anchor + (answer ? 3 : 0) + contour, 60, 82);
      const tones = last && (phraseRole === 'repeat' || phraseRole === 'cadence') ? [intervals[1], intervals[3]] :
        style === 'modal' ? [0, 2, 3, 5, 7, 9, 10] : style === 'funk' ? [0, 3, 5, 7, 10] : intervals;
      let choices = tones.map(t => this.nearestPitch(c.root + t, target, 60, 84));
      if (phraseRole === 'repeat' && last) {
        const endings = choices.filter(note => note !== this.phrase.callNotes[i]);
        if (endings.length) choices = endings;
      }
      let note = choices.sort((a, b) => Math.abs(a - target) - Math.abs(b - target) || a - b)[0];
      if (style === 'bebop' && !last && i % 2 === 1) {
        note = Math.min(84, this.nearestPitch(c.root + intervals[1], target, 60, 83) + 1);
      }
      if (phraseRole === 'call') this.phrase.callNotes[i] = note;
      this.lastMelody = note;
      let energy = [0.94, 1, 0.72, 0.9][this.chorus % 4];
      if (style === 'cool') energy *= 0.72;
      else if (style === 'modal') energy *= 0.85;
      const accent = [1, 0.72, 0.9, 0.64][i];
      const length = phraseRole === 'cadence' && last ? 0.65 : style === 'cool' ? 0.68 : style === 'modal' ? 0.95 :
        style === 'funk' ? 0.25 : Number.isInteger(beat) ? 0.46 : 0.32;
      add('piano', note, beat, length, 0.52 * energy * accent * this.phrase.level * (phraseRole === 'cadence' ? 0.82 : 1), 'melody');
    });
    if (drumStyle === 'cool') {
      [0, 1, 2, 3].forEach((beat, i) => add('brush', 0, beat, 0.3, i % 2 ? 0.3 : 0.2, 'drums'));
      [1, 3].forEach(beat => add('hat', 0, beat, 0.2, 0.25, 'drums'));
      [0, 2].forEach(beat => add('ride', 0, beat, 0.6, 0.18, 'drums'));
    } else if (drumStyle === 'modal') {
      [0, 1, 2, 2.5, 3].forEach(beat => add('ride', 0, beat, 0.6, beat === 2.5 ? 0.2 : 0.36, 'drums'));
      [1, 3].forEach(beat => add('hat', 0, beat, 0.2, 0.32, 'drums'));
      add('brush', 0, 3, 0.3, 0.2, 'drums');
    } else if (drumStyle === 'latin') {
      // Son clave has two attacks in one bar and three in the other. Keep its
      // direction stable while bass and comping interlock around it.
      (this.bar % 2 ? [0, 1.5, 3] : [1, 2]).forEach(beat => add('stick', 0, beat, 0.2, 0.42, 'drums'));
      [0, 0.5, 1.5, 2, 2.5, 3.5].forEach(beat => add('ride', 0, beat, 0.5, 0.24, 'drums'));
      [0, 1, 2, 3].forEach(beat => add('hat', 0, beat, 0.2, 0.32, 'drums'));
    } else if (drumStyle === 'funk') {
      for (let step = 0; step < 16; step++) add('hat', 0, step / 4, 0.2, step % 4 === 0 ? 0.42 : step % 2 === 0 ? 0.3 : 0.18, 'drums');
      [1, 3].forEach(beat => add('stick', 0, beat, 0.2, 0.62, 'drums'));
      [1.75, 3.25].forEach(beat => add('brush', 0, beat, 0.3, 0.16, 'drums'));
    } else if (drumStyle === 'bossa') {
      [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5].forEach((beat, i) => add('hat', 0, beat, 0.2, i % 2 ? 0.34 : 0.48, 'drums'));
      [0, 1.5, 2.5, 3].forEach(beat => add('stick', 0, beat, 0.2, 0.36, 'drums'));
    } else {
      [0, 1, 1.5, 2, 3, 3.5].forEach((beat, i) => add('ride', 0, beat, 0.6, [0.4, 0.65, 0.28, 0.4, 0.65, 0.28][i], 'drums'));
      [1, 3].forEach(beat => { add('hat', 0, beat, 0.2, 0.46, 'drums'); add('brush', 0, beat, 0.3, 0.37, 'drums'); });
      if (this.bar % 4 === 3) add('brush', 0, 3.5, 0.3, 0.42, 'drums');
      if (drumStyle === 'bebop') add('brush', 0, 2.5, 0.3, 0.36, 'drums');
    }
    (drumStyle === 'funk' ? [0, 0.75, 2, 2.75] : drumStyle === 'cool' ? [0] : [0, 2])
      .forEach(beat => add('kick', 0, beat, 0.2, drumStyle === 'cool' ? 0.18 : 0.28, 'drums'));
    events.sort((a, b) => a.time - b.time);
    const info = { seed: this.config.seed || 7, style: this.config.style, tempo: this.config.tempo, swing: this.config.swing,
      beatsPerBar: meter, phraseBars: this.config.phraseBars, beatPattern: this.config.beatPattern,
      beatOnly: this.config.beatOnly, keyRoot: this.config.keyRoot, favorLikes: this.config.favorLikes, tonic: this.tonic,
      fromFavorite: this.favorite !== null,
      phase: phase + ' · ' + phraseRole, phraseRole,
      key: DJ_NOTES[this.tonic] + (style === 'modal' ? ' Dorian' : genre.mode === 'minor' ? ' minor' : ' major'), bar: this.bar + 1, bars: chart.length,
      chorus: this.chorus + 1, set: this.set,
      barIndex: this.barIndex++,
      chords: chords.map(c => ({ beat: c.start, text: DJ_NOTES[c.root] + c.quality,
        root: c.root, quality: c.quality, index: this.chordIndex++ })) };
    this.bar++;
    if (this.bar === chart.length) {
      this.bar = 0; this.chorus++;
      if (this.chorus % 4 === 0) {
        this.tonic = (this.tonic + rng.pick([0, 5, 7])) % 12;
        if (this.config.keyRoot !== 'auto') this.tonic = this.config.keyRoot;
        this.set++;
        this.motif = [...rng.pick(DJ_MOTIFS)];
      }
    }
    return { events: this.config.beatOnly ? events.filter(event => event.role === 'drums') : events, info, duration: seconds * meter };
  }
}

// All composition and timing run on the audio thread, independent of page timers.
class DJRenderer {
  constructor(rate, bank, config, notify = () => {}) {
    this.rate = rate; this.bank = bank; this.composer = new DJComposer(config); this.notify = notify;
    this.voices = []; this.frame = 0; this.nextBar = 0; this.events = []; this.eventIndex = 0;
    this.nextBeat = 0; this.beat = 0; this.info = null;
    this.levels = { piano: 0.82, bass: 0.9, drums: 0.68 };
    this.targets = { ...this.levels }; this.maxVoices = 0;
    this.pendingPart = null; this.activePart = null;
    this.pendingScene = null;
    this.pendingBank = null;
  }
  configure(data) {
    if (data.bank) {
      const bank = data.bank;
      if (Number.isInteger(bank.rate) && bank.rate >= 8000 && bank.rate <= 96000
        && ['piano', 'bass'].every(role => Array.isArray(bank[role]) && bank[role].length > 0
          && bank[role].every(sample => Number.isInteger(sample.note) && sample.note >= 0 && sample.note <= 127 && sample.data instanceof Float32Array && sample.data.length >= 2))
        && ['ride', 'brush', 'kick', 'hat', 'stick'].every(kind => bank.drums?.[kind] instanceof Float32Array && bank.drums[kind].length >= 2)) this.pendingBank = bank;
    }
    if (data.levels) for (const role of ['piano', 'bass', 'drums']) {
      if (Number.isFinite(data.levels[role])) {
        this.targets[role] = djClamp(data.levels[role], 0, 1);
        if (this.pendingScene) this.pendingScene.levels[role] = this.targets[role];
      }
    }
    if (data.composition) this.composer.configure(data.composition);
    if (data.scene && typeof data.scene.id === 'string' && /^[a-z0-9-]{1,64}$/i.test(data.scene.id)) {
      const scene = data.scene, c = scene.composition, levels = scene.levels;
      if (c && Object.hasOwn(DJ_STYLES, c.style) && Number.isFinite(c.tempo) && c.tempo >= 55 && c.tempo <= 180
        && Number.isFinite(c.swing) && c.swing >= 0.5 && c.swing <= 0.72 && levels
        && ['piano', 'bass', 'drums'].every(role => Number.isFinite(levels[role]) && levels[role] >= 0 && levels[role] <= 1)) {
        try {
          this.composer.configure(Object.fromEntries(DJ_COMPOSITION_FIELDS.filter(key => Object.hasOwn(c, key)).map(key => [key, c[key]])));
          this.pendingScene = { id: scene.id, levels: { piano: levels.piano, bass: levels.bass, drums: levels.drums } };
        } catch { /* A malformed scene cannot partially replace a queued arrangement. */ }
      }
    }
    if (typeof data.nameSnapshot === 'string' && /^[a-z0-9-]{1,64}$/i.test(data.nameSnapshot)) {
      let context = null;
      if (this.info) try { context = validateJazzContext({ ...this.info,
        motif: this.events.filter(e => e.role === 'melody').map(e => e.note).slice(0, 8) }); } catch {}
      this.notify({ nameSnapshot: data.nameSnapshot, context, error: context ? null : 'NOT_READY' });
    }
    if (data.jazzPart) {
      const part = data.jazzPart;
      try {
        if (typeof part.requestId !== 'string' || !/^[a-z0-9-]{1,64}$/i.test(part.requestId) || !this.info
          || part.targetSet !== this.info.set || part.targetSeed !== this.info.seed) throw new Error('SET_CHANGED');
        const result = validateJazzResult(part.result);
        this.pendingPart = { requestId: part.requestId, targetSet: part.targetSet, targetSeed: part.targetSeed, result };
      } catch { this.notify({ partRejected: typeof part.requestId === 'string' ? part.requestId.slice(0, 64) : '', reason: 'SET_CHANGED_OR_INVALID' }); }
    }
  }
  trigger(e) {
    let data, speed = this.bank.rate / this.rate;
    const pitched = e.instrument === 'piano' || e.instrument === 'bass';
    if (pitched) {
      const samples = this.bank[e.instrument];
      const sample = samples.reduce((a, b) => Math.abs(b.note - e.note) < Math.abs(a.note - e.note) ? b : a);
      data = sample.data; speed *= Math.pow(2, (e.note - sample.note) / 12);
    } else data = this.bank.drums[e.instrument];
    const pan = e.role === 'melody' ? 0.15 : e.instrument === 'piano' ? -0.27 : e.instrument === 'bass' ? -0.06 : 0.32;
    if (this.voices.length >= 72) this.voices.shift();
    this.voices.push({ data, speed, position: 0, age: 0, duration: Math.floor(e.duration * this.rate),
      tail: Math.floor(this.rate * (e.instrument === 'piano' ? 0.23 : 0.07)),
      gain: e.velocity * (e.instrument === 'bass' ? 1.9 : 0.66), pitched,
      role: e.role === 'melody' ? 'piano' : e.role,
      left: Math.sqrt((1 - pan) * 0.5), right: Math.sqrt((1 + pan) * 0.5) });
    this.maxVoices = Math.max(this.maxVoices, this.voices.length);
  }
  render(left, right) {
    for (let i = 0; i < left.length; i++, this.frame++) {
      if (this.frame >= this.nextBar) {
        if (this.pendingBank) { this.bank = this.pendingBank; this.pendingBank = null; }
        if (this.pendingScene) {
          this.targets = { ...this.targets, ...this.pendingScene.levels };
          this.notify({ sceneApplied: this.pendingScene.id }); this.pendingScene = null;
        }
        const bar = this.composer.nextBar();
        const matches = part => part.targetSet === bar.info.set && part.targetSeed === bar.info.seed;
        if (this.activePart && (!matches(this.activePart) || this.info?.beatPattern !== bar.info.beatPattern)) this.activePart = null;
        if (this.pendingPart) {
          const part = this.pendingPart; this.pendingPart = null;
          if (matches(part)) { this.activePart = part; this.notify({ partApplied: part.requestId, set: bar.info.set }); }
          else this.notify({ partRejected: part.requestId, reason: 'SET_CHANGED' });
        }
        if (this.activePart) {
          const seconds = 60 / bar.info.tempo, swing = bar.info.swing;
          bar.events = bar.events.filter(e => e.role !== 'drums');
          for (const hit of this.activePart.result.pattern) {
            const beat = hit.step * bar.info.beatsPerBar / 16, whole = Math.floor(beat), frac = beat - whole;
            const time = (whole + (frac <= 0.5 ? frac * 2 * swing : swing + (frac - 0.5) * 2 * (1 - swing))) * seconds;
            const duration = bar.info.beatsPerBar === 4 ? 0.25 * seconds : Math.min(bar.info.beatsPerBar / 16 * seconds, bar.duration - time);
            bar.events.push({ instrument: hit.instrument, role: 'drums', note: 0, beat, time, duration, velocity: hit.velocity });
          }
          bar.events.sort((a, b) => a.time - b.time);
          bar.info.namedTitle = this.activePart.result.title;
        }
        if (bar.info.beatOnly) this.voices = this.voices.filter(voice => voice.role === 'drums');
        this.events = bar.events; this.eventIndex = 0; this.barStart = this.nextBar;
        this.nextBar += bar.duration * this.rate; this.info = bar.info;
        this.beat = 0; this.nextBeat = this.frame;
      }
      if (this.frame >= this.nextBeat && this.beat < this.info.beatsPerBar) {
        const chord = this.info.chords.findLast(c => c.beat <= this.beat);
        this.notify({ ...this.info, beat: this.beat, beatNumber: this.beat + 1, seconds: this.frame / this.rate,
          chord: chord.text, chordIndex: chord.index, chordRoot: chord.root, chordQuality: chord.quality });
        this.beat++; this.nextBeat = this.barStart + this.beat * (60 / this.info.tempo) * this.rate;
      }
      while (this.eventIndex < this.events.length && this.barStart + this.events[this.eventIndex].time * this.rate <= this.frame) {
        this.trigger(this.events[this.eventIndex++]);
      }
      this.levels.piano += (this.targets.piano - this.levels.piano) * 0.002;
      this.levels.bass += (this.targets.bass - this.levels.bass) * 0.002;
      this.levels.drums += (this.targets.drums - this.levels.drums) * 0.002;
      let l = 0, r = 0;
      for (let j = this.voices.length - 1; j >= 0; j--) {
        const v = this.voices[j], at = Math.floor(v.position);
        const release = v.pitched ? djClamp(1 - (v.age - v.duration) / v.tail, 0, 1) : 1;
        if (at >= v.data.length - 1 || release <= 0) { this.voices.splice(j, 1); continue; }
        const fraction = v.position - at;
        const value = (v.data[at] + (v.data[at + 1] - v.data[at]) * fraction) * v.gain * release * this.levels[v.role];
        l += value * v.left; r += value * v.right;
        v.age++; v.position += v.speed;
      }
      left[i] = Math.tanh(l * 1.1) * 0.8; right[i] = Math.tanh(r * 1.1) * 0.8;
    }
  }
}

export { DJ_NOTES, DJ_STYLES, DJRandom, DJComposer, DJRenderer, djVoiceLead, djClamp, djMakeBank, djValidateFavoriteProgressions };
