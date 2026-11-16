// SPDX-License-Identifier: GPL-3.0-only
/* Doodle Jazz 1.0.1. Original procedural composition and synthesized instruments. */
const DJ_NOTES = ['C', 'D♭', 'D', 'E♭', 'E', 'F', 'G♭', 'G', 'A♭', 'A', 'B♭', 'B'];
const DJ_CHORDS = {
  maj9: [0, 4, 7, 11, 14], m9: [0, 3, 7, 10, 14], '13': [0, 4, 7, 10, 14, 21],
  '7': [0, 4, 7, 10], '7♭9': [0, 4, 7, 10, 13], 'ø7': [0, 3, 6, 10],
  '6/9': [0, 4, 7, 9, 14], m6: [0, 3, 7, 9], '9': [0, 4, 7, 10, 14]
};
const DJ_STYLES = {
  swing: { name: 'Velvet swing', tempo: 112, swing: 0.64, tonic: 10, bars: 32 },
  blues: { name: 'Blue hour', tempo: 82, swing: 0.61, tonic: 5, bars: 12 },
  bossa: { name: 'Bossa garden', tempo: 128, swing: 0.5, tonic: 2, bars: 16 }
};
const djClamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const djFreq = n => 440 * Math.pow(2, (n - 69) / 12);

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
    this.config = { style: 'swing', tempo: 112, swing: 0.64, ...config };
    this.pending = null;
    this.bar = 0; this.chorus = 0; this.set = 1; this.lastMelody = 72; this.lastBass = 41;
    this.tonic = DJ_STYLES[this.config.style].tonic;
    this.motif = [0, 2, 4, 7, 4, 2, 0, -1];
  }
  configure(change) { this.pending = { ...this.pending, ...change }; }
  applyPending() {
    if (!this.pending) return;
    const change = this.pending; this.pending = null;
    const reset = (change.style && change.style !== this.config.style) || change.newSet;
    if (change.seed) this.rng = new DJRandom(change.seed);
    if (change.style && DJ_STYLES[change.style]) this.config.style = change.style;
    if (Number.isFinite(change.tempo)) this.config.tempo = djClamp(change.tempo, 55, 180);
    if (Number.isFinite(change.swing)) this.config.swing = djClamp(change.swing, 0.5, 0.72);
    if (reset) {
      this.bar = 0; this.chorus = 0; this.set++;
      this.tonic = (DJ_STYLES[this.config.style].tonic + this.rng.pick([0, 0, 2, 5, 7])) % 12;
      this.motif = Array.from({ length: 8 }, () => this.rng.pick([-2, 0, 2, 3, 4, 5, 7]));
    }
  }
  chart() {
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
    const chart = this.chart(), chords = chart[this.bar].map(c => this.absoluteChord(c));
    const nextChord = this.absoluteChord(chart[(this.bar + 1) % chart.length][0]);
    const phase = ['The melody', 'Piano wandering', 'A little breathing room', 'All together'][this.chorus % 4];
    const events = [], rng = this.rng, bossa = this.config.style === 'bossa';
    const seconds = 60 / this.config.tempo, swing = this.config.swing;
    const when = beat => {
      const whole = Math.floor(beat), frac = beat - whole;
      return (whole + (frac <= 0.5 ? frac * 2 * swing : swing + (frac - 0.5) * 2 * (1 - swing))) * seconds;
    };
    const add = (instrument, note, beat, beats, velocity, role = instrument) => {
      events.push({ instrument, role, note, time: when(beat) + rng.next() * 0.007,
        duration: Math.max(0.05, beats * seconds), velocity: velocity * (0.9 + rng.next() * 0.2) });
    };
    const at = beat => chords.findLast(c => c.start <= beat) || chords[0];
    // Rootless guide-tone voicings: thirds, sevenths, ninths and a fifth/sixth.
    for (const c of chords) {
      const intervals = DJ_CHORDS[c.quality], tones = [intervals[1], intervals[3], intervals[4] ?? intervals[2], intervals[2]];
      const voicing = tones.map((v, i) => this.nearestPitch(c.root + v, 53 + i * 5, 49, 75)).sort((a, b) => a - b);
      const rhythm = bossa ? [0, 0.75, 1.5, 2.5, 3.25] : this.bar % 2 ? [0.5, 2, 3.5] : [0, 1.5, 2.75];
      for (const beat of rhythm.filter(b => b >= c.start && b < c.start + c.beats)) {
        if (rng.next() < 0.18 && beat !== c.start) continue;
        voicing.forEach((note, i) => add('piano', note, beat + i * 0.009, bossa ? 0.65 : 0.9, 0.22 + rng.next() * 0.055));
      }
    }
    // A walking line approaches each following harmony; bossa uses a two-feel.
    const bassBeats = bossa ? [0, 1.5, 2, 3.5] : [0, 1, 2, 3];
    bassBeats.forEach((beat, i) => {
      const c = at(beat), intervals = DJ_CHORDS[c.quality];
      let pc = c.root;
      if (bossa) pc += i % 2 ? intervals[2] : 0;
      else if (i === 3) pc = nextChord.root + rng.pick([-1, 1]);
      else if (i === 1) pc += rng.pick([intervals[1], intervals[2]]);
      else if (i === 2) pc += rng.pick([0, intervals[2], intervals[3]]);
      let note = this.nearestPitch(pc, i === 0 ? 38 : this.lastBass, 33, 52);
      if (i === 0 && note > 45) note -= 12;
      this.lastBass = note;
      add('bass', note, beat, bossa ? 1.12 : 0.9, 0.75);
    });
    const density = [0.68, 0.87, 0.34, 0.78][this.chorus % 4];
    const phraseRest = this.bar % 4 === 3 ? rng.pick([2, 2.5, 3, 4]) : 4;
    for (let i = 0; i < 8 && i * 0.5 < phraseRest; i++) {
      if (rng.next() > density || (i === 0 && this.bar % 2 === 1 && rng.next() < 0.5)) continue;
      const beat = i * 0.5, c = at(beat), intervals = DJ_CHORDS[c.quality];
      let note;
      if (this.chorus % 4 === 0) {
        const target = 67 + this.motif[(i + this.bar * 2) % this.motif.length];
        const choices = intervals.map(t => this.nearestPitch(c.root + t, target, 60, 83));
        note = choices.sort((a, b) => Math.abs(a - target) - Math.abs(b - target))[0];
      } else {
        const step = rng.pick([-4, -2, -1, 1, 2, 3, 5]);
        const target = djClamp(this.lastMelody + step, 61, 82);
        let choices = intervals.map(t => this.nearestPitch(c.root + t, target, 60, 84));
        if (i % 2 && rng.next() < 0.38) choices = [target];
        note = choices.sort((a, b) => Math.abs(a - target) - Math.abs(b - target))[0];
      }
      this.lastMelody = note;
      add('piano', note, beat, i % 2 ? 0.43 : rng.pick([0.45, 0.8]), 0.45 + rng.next() * 0.11, 'melody');
    }
    if (bossa) {
      [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5].forEach((beat, i) => add('hat', 0, beat, 0.2, i % 2 ? 0.34 : 0.48, 'drums'));
      [0, 1.5, 2.5, 3].forEach(beat => add('stick', 0, beat, 0.2, 0.36, 'drums'));
    } else {
      [0, 1, 1.5, 2, 3, 3.5].forEach((beat, i) => add('ride', 0, beat, 0.6, [0.4, 0.65, 0.28, 0.4, 0.65, 0.28][i], 'drums'));
      [1, 3].forEach(beat => { add('hat', 0, beat, 0.2, 0.46, 'drums'); add('brush', 0, beat, 0.3, 0.37, 'drums'); });
      if (this.bar % 4 === 3) add('brush', 0, 3.5, 0.3, 0.42, 'drums');
    }
    [0, 2].forEach(beat => add('kick', 0, beat, 0.2, 0.28, 'drums'));
    events.sort((a, b) => a.time - b.time);
    const info = { style: this.config.style, tempo: this.config.tempo, swing: this.config.swing, phase,
      key: DJ_NOTES[this.tonic] + (bossa ? ' minor' : ' major'), bar: this.bar + 1, bars: chart.length,
      chorus: this.chorus + 1, set: this.set,
      chords: chords.map(c => ({ beat: c.start, text: DJ_NOTES[c.root] + c.quality })) };
    this.bar++;
    if (this.bar === chart.length) {
      this.bar = 0; this.chorus++;
      if (this.chorus % 4 === 0) {
        this.tonic = (this.tonic + rng.pick([0, 5, 7])) % 12;
        this.set++;
        this.motif = Array.from({ length: 8 }, () => rng.pick([-2, 0, 2, 3, 4, 5, 7]));
      }
    }
    return { events, info, duration: seconds * 4 };
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
  }
  configure(data) {
    if (data.levels) for (const role of ['piano', 'bass', 'drums']) {
      if (Number.isFinite(data.levels[role])) this.targets[role] = djClamp(data.levels[role], 0, 1);
    }
    if (data.composition) this.composer.configure(data.composition);
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
        const bar = this.composer.nextBar();
        this.events = bar.events; this.eventIndex = 0; this.barStart = this.nextBar;
        this.nextBar += bar.duration * this.rate; this.info = bar.info;
        this.beat = 0; this.nextBeat = this.frame;
      }
      if (this.frame >= this.nextBeat && this.beat < 4) {
        this.notify({ ...this.info, beat: this.beat, seconds: this.frame / this.rate,
          chord: this.info.chords.findLast(c => c.beat <= this.beat).text });
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

export { DJ_NOTES, DJ_STYLES, DJRandom, DJComposer, DJRenderer, djClamp, djMakeBank };
