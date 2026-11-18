// SPDX-License-Identifier: GPL-3.0-only
// Dot Wave recipe/DSP compatibility: the shipped dot-* modules are the original
// Studio algorithms. A sound-box wave is its 128-term Fourier snapshot plus FX;
// a patch follows Studio's Keep sound snapshot, retaining its editable patch;
// a mushroom uses its original seeded, four-second offline texture renderer.
import { recipe as mushroomRecipe, renderMushroom } from './mushroom-core.mjs';

const Studio = globalThis.StudioDSP, Effects = globalThis.EffectsDSP, Collision = globalThis.CollisionAudio;
export const JAZZ_DOT_VOICE_FORMAT = 'doodle-jazz-dot-voice';
export const JAZZ_DOT_MAX_BYTES = 32768;
export const JAZZ_DOT_MAX_COLLECTION_BYTES = 512 * 1024;
export const JAZZ_DOT_MAX_VOICES = 32;
export const JAZZ_DOT_MAX_GENERATED_BYTES = 16 * 1024 * 1024;
export const JAZZ_DOT_PARTS = Object.freeze(['piano', 'bass', 'drums']);
const DRUMS = Object.freeze(['ride', 'brush', 'kick', 'hat', 'stick']);
const encoder = new TextEncoder();
const fail = text => { throw new Error(text); };
const record = value => value && typeof value === 'object' && !Array.isArray(value);
const own = (value, key) => Object.hasOwn(value, key);
const frequency = note => 440 * 2 ** ((note - 69) / 12);

// Inspect descriptors before reading values: object callers cannot make a
// recipe getter run during validation. Imported JSON never executes code.
function jsonInput(input, maxBytes = JAZZ_DOT_MAX_BYTES, maxNodes = 4096) {
  let value = input;
  if (typeof value === 'string') {
    if (value.length > maxBytes || encoder.encode(value).length > maxBytes) fail('The Dot Wave file exceeds its size limit.');
    try { value = JSON.parse(value); } catch { fail('Choose a Dot Wave JSON recipe or sound-library file.'); }
  }
  let nodes = 0; const ancestors = new Set();
  function inspect(item, depth) {
    if (++nodes > maxNodes || depth > 14) fail('The Dot Wave recipe is too complex.');
    if (item === null || typeof item === 'boolean') return;
    if (typeof item === 'number') { if (!Number.isFinite(item)) fail('Dot Wave numbers must be finite.'); return; }
    if (typeof item === 'string') { if (item.length > maxBytes) fail('Dot Wave text is too long.'); return; }
    if (!item || typeof item !== 'object' || ancestors.has(item)) fail('Dot Wave voices contain JSON data only.');
    const array = Array.isArray(item), prototype = Object.getPrototypeOf(item);
    if (array ? prototype !== Array.prototype : prototype !== Object.prototype && prototype !== null) fail('Dot Wave voices contain plain JSON objects only.');
    if (array && item.length > 128) fail('A Dot Wave array is too large.');
    const entries = Object.getOwnPropertyDescriptors(item), keys = Reflect.ownKeys(entries);
    if (keys.length > (array ? 129 : 40)) fail('A Dot Wave object is too large.');
    ancestors.add(item);
    for (const key of keys) {
      if (typeof key !== 'string' || ['__proto__', 'prototype', 'constructor'].includes(key)) fail('Unsafe Dot Wave recipe property.');
      const descriptor = entries[key];
      if (!own(descriptor, 'value')) fail('Dot Wave recipes cannot contain getters or setters.');
      if (array && key === 'length') continue;
      if (array && !/^(0|[1-9][0-9]*)$/.test(key)) fail('Invalid Dot Wave array property.');
      inspect(descriptor.value, depth + 1);
    }
    if (array && keys.length !== item.length + 1) fail('Dot Wave arrays cannot contain missing values.');
    ancestors.delete(item);
  }
  inspect(value, 0);
  if (encoder.encode(JSON.stringify(value)).length > maxBytes) fail('The Dot Wave file exceeds its size limit.');
  return value;
}
function keys(value, allowed, label) {
  if (!record(value) || Object.keys(value).some(key => !allowed.includes(key))) fail('Unsupported ' + label + ' data.');
}
function text(value, max, label, optional = false) {
  if (value === undefined && optional) return '';
  if (typeof value !== 'string' || value.length > max) fail('Invalid ' + label + '.');
  const result = value.replace(/[\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069]/g, ' ').trim();
  if (!optional && !result) fail('Give the Dot Wave voice a name.');
  return result;
}
function attribution(value) {
  if (value === undefined) return { creator: '', license: '', source: '' };
  keys(value, ['creator', 'license', 'source'], 'attribution');
  // Credits are opaque display text; a source URL is never loaded or executed.
  return { creator: text(value.creator, 120, 'creator credit', true), license: text(value.license, 120, 'license credit', true), source: text(value.source, 240, 'source credit', true) };
}
function normalizedWave(value) {
  keys(value, ['id', 'name', 'real', 'imag', 'effects', 'frequency', 'attribution'], 'sound-box waveform');
  if (typeof value.id !== 'string' || !/^[a-zA-Z0-9_-]{1,90}$/.test(value.id)) fail('Invalid Dot Wave sound identifier.');
  const terms = array => {
    if (!Array.isArray(array) || array.length !== 128 || array.some(number => typeof number !== 'number' || !Number.isFinite(number) || Math.abs(number) > 2) || array[0] !== 0) fail('A Dot Wave sound needs two zero-DC arrays of 128 finite coefficients.');
    return Array.from(Float32Array.from(array));
  };
  let real = terms(value.real), imag = terms(value.imag);
  if (real.reduce((sum, number, index) => sum + number * number + imag[index] * imag[index], 0) < 1e-12) fail('This Dot Wave sound is silent.');
  // Studio sound-box imports normalize only over-range spectra. A tolerance
  // avoids changing Float32 coefficients again on every JSON round trip.
  const peak = Studio.peakOf(Studio.reconstruct(real, imag));
  if (peak > 1.000001) { real = Array.from(Float32Array.from(real, number => number / peak)); imag = Array.from(Float32Array.from(imag, number => number / peak)); }
  if (value.frequency !== undefined && (typeof value.frequency !== 'number' || !Number.isFinite(value.frequency) || value.frequency < 20 || value.frequency > 20000)) fail('Invalid saved Dot Wave pitch.');
  return { id: value.id, name: text(value.name, 48, 'sound name'), real, imag, effects: Effects.validate(value.effects), ...(value.frequency === undefined ? {} : { frequency: value.frequency }) };
}
function checkedPatch(value) {
  keys(value, ['kind', 'name', 'attribution', 'project', 'freePair', 'pitch', 'level', 'volume', 'inverted', 'eq', 'throughEQ', 'channel'], 'Studio patch');
  const project = value.project;
  keys(project, ['version', 'a', 'b', 'mode', 'amount', 'normalize', 'amp', 'effects'], 'Studio waveform project');
  for (const side of ['a', 'b']) keys(project[side], ['points', 'shape', 'level', 'phase', 'ratio', 'inverted'], 'Studio source waveform');
  if (project.amp !== undefined) keys(project.amp, ['enabled', 'drive', 'color', 'mix', 'output', 'low', 'high'], 'Studio amp');
  if (value.freePair !== undefined && value.freePair !== null) keys(value.freePair, ['a', 'b'], 'Studio pitch pair');
  if (value.eq !== undefined) keys(value.eq, ['gains', 'bypass'], 'Studio listening EQ');
  return Studio.validatePatch(value);
}
function checkedRecipe(value) {
  if (value?.kind === 'dot-wave-library') {
    keys(value, ['kind', 'version', 'waves', 'attribution'], 'sound library');
    if (value.version !== 1 || !Array.isArray(value.waves) || value.waves.length !== 1) fail('Choose one sound from the Dot Wave library.');
    return { kind: 'dot-wave-library', version: 1, waves: [normalizedWave(value.waves[0])] };
  }
  if (value?.kind === 'dot-wave-studio') return checkedPatch(value);
  if (value?.kind === 'dot-mushroom') {
    keys(value, ['kind', 'version', 'name', 'settings', 'motion', 'patch', 'attribution'], 'mushroom recipe');
    text(value.name, 60, 'mushroom name');
    keys(value.settings, ['growth', 'static', 'glitch', 'mix', 'seed'], 'mushroom settings');
    if (value.motion !== undefined) keys(value.motion, ['speed', 'depth'], 'mushroom motion');
    if (value.patch !== null && value.patch !== undefined) checkedPatch(value.patch);
    return mushroomRecipe(value);
  }
  if (record(value) && own(value, 'real') && own(value, 'imag')) return { kind: 'dot-wave-library', version: 1, waves: [normalizedWave(value)] };
  fail('Choose a saved Dot Wave sound, Studio patch or mushroom recipe.');
}

/** Validate one explicitly selected, editable voice. This never starts audio. */
export function parseJazzDotVoice(input) {
  const value = jsonInput(input), wrapped = value?.kind === JAZZ_DOT_VOICE_FORMAT;
  if (wrapped) {
    keys(value, ['kind', 'version', 'name', 'attribution', 'recipe'], 'Jazz Dot Wave voice');
    if (value.version !== 1) fail('Unsupported Jazz Dot Wave voice version.');
  }
  const raw = wrapped ? value.recipe : value, recipe = checkedRecipe(raw);
  const inherited = raw?.attribution || (raw?.kind === 'dot-wave-library' ? raw.waves?.[0]?.attribution : undefined);
  const name = wrapped ? text(value.name, 64, 'voice name') : text(raw.name ?? recipe.waves?.[0]?.name ?? 'Dot Wave patch', 64, 'voice name');
  const voice = { kind: JAZZ_DOT_VOICE_FORMAT, version: 1, name, attribution: attribution(wrapped ? value.attribution ?? inherited : inherited), recipe };
  if (encoder.encode(JSON.stringify(voice)).length > JAZZ_DOT_MAX_BYTES) fail('The editable Dot Wave voice exceeds 32 KB.');
  return voice;
}

/** A library remains a set of choices. Callers must ask which sound to assign. */
export function listJazzDotVoices(input) {
  const value = jsonInput(input, JAZZ_DOT_MAX_COLLECTION_BYTES, 65536);
  if (value?.kind !== 'dot-wave-library') return [parseJazzDotVoice(value)];
  keys(value, ['kind', 'version', 'waves', 'attribution'], 'sound library');
  if (value.version !== 1 || !Array.isArray(value.waves) || !value.waves.length || value.waves.length > JAZZ_DOT_MAX_VOICES) fail('Choose a library with one to 32 Dot Wave sounds.');
  const seen = new Set();
  return value.waves.map(wave => {
    if (seen.has(wave?.id)) fail('The Dot Wave library repeats a sound identifier.'); seen.add(wave?.id);
    return parseJazzDotVoice({ kind: 'dot-wave-library', version: 1, waves: [wave], ...(value.attribution === undefined ? {} : { attribution: value.attribution }) });
  });
}

function checkBank(bank) {
  if (!record(bank) || !Number.isInteger(bank.rate) || bank.rate < 8000 || bank.rate > 48000) fail('Use a Jazz sample bank from 8 to 48 kHz.');
  let bytes = 0;
  const samples = data => {
    if (!(data instanceof Float32Array) || !data.length || data.length > bank.rate * 4) fail('Invalid Jazz base-bank samples.');
    bytes += data.byteLength;
    if (bytes > 32 * 1024 * 1024) fail('The Jazz base bank is too large.');
    for (const value of data) if (!Number.isFinite(value)) fail('Jazz base samples must be finite.');
  };
  for (const [part, count] of [['piano', 16], ['bass', 12]]) {
    if (!Array.isArray(bank[part]) || !bank[part].length || bank[part].length > count) fail('Invalid Jazz base-bank instrument.');
    const notes = new Set();
    for (const item of bank[part]) { if (!record(item) || !Number.isInteger(item.note) || item.note < 24 || item.note > 96 || notes.has(item.note)) fail('Invalid Jazz sample pitch.'); notes.add(item.note); samples(item.data); }
  }
  if (!record(bank.drums) || Object.keys(bank.drums).length !== DRUMS.length) fail('Invalid Jazz base-bank drums.');
  for (const part of DRUMS) samples(bank.drums[part]);
}

function waveform(voice) {
  const recipe = voice.recipe;
  if (recipe.kind === 'dot-wave-library') return { ...recipe.waves[0] };
  const signal = recipe.freePair ? Collision.preview(recipe.project, recipe.freePair).result : Studio.compile(recipe.project, { frequency: recipe.pitch }).result;
  return { real: Array.from(signal.real, value => recipe.inverted ? -value : value), imag: Array.from(signal.imag, value => recipe.inverted ? -value : value), effects: recipe.project.effects };
}
function kernel(cutoff, taps = 33, phases = 1) {
  const result = [];
  for (let phase = 0; phase < phases; phase++) {
    const values = new Float64Array(taps), fraction = phase / phases; let sum = 0;
    for (let index = 0; index < taps; index++) {
      const offset = index - (taps - 1) / 2 - fraction;
      const sinc = Math.abs(offset) < 1e-12 ? 2 * cutoff : Math.sin(2 * Math.PI * cutoff * offset) / (Math.PI * offset);
      values[index] = sinc * (.42 - .5 * Math.cos(2 * Math.PI * index / (taps - 1)) + .08 * Math.cos(4 * Math.PI * index / (taps - 1))); sum += values[index];
    }
    for (let index = 0; index < taps; index++) values[index] /= sum;
    result.push(values);
  }
  return result;
}
const guardKernel = kernel(.36)[0];
function bandGuard(input) {
  const output = new Float32Array(input.length), half = guardKernel.length >> 1;
  for (let at = 0; at < input.length; at++) {
    let value = 0;
    for (let tap = 0; tap < guardKernel.length; tap++) { const index = at + tap - half; if (index >= 0 && index < input.length) value += input[index] * guardKernel[tap]; }
    output[at] = value;
  }
  return output;
}
function texture(source, sourceRate, targetRate, hz, reference, frames) {
  const step = hz / reference * sourceRate / targetRate, kernels = kernel(Math.min(.46, .36 / step), 33, 128);
  const output = new Float32Array(frames), half = 16;
  for (let at = 0; at < frames; at++) {
    const position = (at * step) % source.length, index = Math.floor(position), weights = kernels[Math.min(127, Math.floor((position - index) * 128))]; let value = 0;
    for (let tap = 0; tap < weights.length; tap++) value += source[(index + tap - half + source.length) % source.length] * weights[tap];
    output[at] = value;
  }
  return output;
}
function finishSound(input, rate, part) {
  const output = bandGuard(input), attack = part === 'piano' ? .006 : part === 'bass' ? .008 : .002;
  const decay = part === 'piano' ? 2.3 : part === 'bass' ? 1.3 : part === 'ride' ? .24 : part === 'brush' ? .12 : .075;
  const release = Math.min(.04, output.length / rate / 5); let peak = 0, energy = 0;
  for (let index = 0; index < output.length; index++) {
    const envelope = Math.min(1, index / (rate * attack), (output.length - 1 - index) / (rate * release)) * Math.exp(-index / (rate * decay));
    output[index] *= envelope;
    if (!Number.isFinite(output[index])) fail('The Dot Wave voice produced an invalid sample.');
    peak = Math.max(peak, Math.abs(output[index])); energy += output[index] ** 2;
  }
  const audible = peak >= 1e-7 && energy / output.length >= 1e-14;
  const gain = Math.min(1, .72 / peak);
  if (gain < 1) for (let index = 0; index < output.length; index++) output[index] *= gain;
  return { samples: output, audible };
}

/** Build in a worker or before a bar-boundary swap; no playback/Web Audio APIs.
 * Unassigned parts share their read-only base data; assigned parts are new PCM.
 * At most three assignments, fixed note/drum counts and durations bound cost.
 */
export function buildJazzDotBank(baseBank, assignments = {}) {
  checkBank(baseBank);
  const selected = jsonInput(assignments, JAZZ_DOT_MAX_BYTES * 3 + 64, 12288);
  keys(selected, JAZZ_DOT_PARTS, 'Jazz voice assignments');
  const voices = Object.fromEntries(JAZZ_DOT_PARTS.map(part => [part, selected[part] == null ? null : parseJazzDotVoice(selected[part])]));
  const output = { rate: baseBank.rate, piano: baseBank.piano, bass: baseBank.bass, drums: baseBank.drums };
  let generated = 0;
  for (const part of JAZZ_DOT_PARTS) {
    const voice = voices[part]; if (!voice) continue;
    const isTexture = voice.recipe.kind === 'dot-mushroom';
    const mushroom = isTexture ? renderMushroom(voice.recipe) : null, wave = isTexture ? null : waveform(voice);
    let audible = false;
    const make = (hz, seconds, role) => {
      const frames = Math.ceil(baseBank.rate * seconds); generated += frames * 4;
      if (generated > JAZZ_DOT_MAX_GENERATED_BYTES) fail('The Dot Wave sample bank exceeds its memory limit.');
      let raw;
      if (mushroom) raw = texture(mushroom.samples, mushroom.rate, baseBank.rate, hz, voice.recipe.patch?.pitch ?? 134, frames);
      else {
        const table = Studio.reconstruct(wave.real, wave.imag, Math.floor(baseBank.rate * .36 / hz));
        const pre = Math.ceil(Math.min(2, Effects.tail(wave.effects)) * baseBank.rate);
        const dry = Float32Array.from({ length: frames + pre }, (_, index) => Studio.sample(table, index * hz / baseBank.rate) * .65);
        raw = Effects.process(dry, baseBank.rate, wave.effects).slice(pre);
      }
      const finished = finishSound(raw, baseBank.rate, role); audible ||= finished.audible;
      return finished.samples;
    };
    if (part === 'piano' || part === 'bass') output[part] = baseBank[part].map(item => ({ note: item.note, data: make(frequency(item.note), part === 'piano' ? 2.8 : 1.6, part) }));
    else {
      const pitches = { ride: 660, brush: 240, kick: 65, hat: 940, stick: 460 };
      const durations = { ride: .62, brush: .30, kick: .35, hat: .19, stick: .23 };
      output.drums = Object.fromEntries(DRUMS.map(kind => [kind, make(pitches[kind], durations[kind], kind)]));
    }
    // A high sample may correctly lose every partial at the Nyquist guard;
    // reject a silent assignment only when its entire playable bank is silent.
    if (!audible) fail('This Dot Wave voice is silent in the Jazz register.');
  }
  return output;
}
