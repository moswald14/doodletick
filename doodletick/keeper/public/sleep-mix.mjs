// SPDX-License-Identifier: GPL-3.0-only
// Listening-only layer adapted from the separate Mushroom Garden's zen mix and
// arcade voices. Original Dot Wave recipe rendering and generator hashes stay intact.
import { recipe, renderMushroom } from './mushroom-core.mjs';

export const SLEEP_RATE = 24000;
export const SLEEP_SECONDS = 12;
export const SLEEP_MAX_MUSHROOMS = 100;
export const SLEEP_DEFAULTS = Object.freeze({ volume: 15, wind: 60, mushrooms: 45, reduction: 90, blips: 15, pops: 8, minutes: 480 });

// These voices make the listening screen useful before a player plants anything.
// They are never submitted to a Keeper, imported into a wallet or called earnings.
export const SLEEP_STARTER_MUSHROOMS = Object.freeze([
  ['Pillow spore', 713, .34, .16, .08],
  ['Moon cord', 2718, .48, .12, .12],
  ['Dewdrop', 8041, .25, .09, .05],
].map(([name, seed, growth, staticAmount, glitch]) => Object.freeze({
  recipe: Object.freeze({ kind: 'dot-mushroom', version: 1, name, patch: null,
    settings: Object.freeze({ seed, growth, static: staticAmount, glitch, mix: .55 }) }),
})));

export function sleepPreferences(raw = {}) {
  const input = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  const result = {};
  for (const [key, fallback] of Object.entries(SLEEP_DEFAULTS)) {
    const value = typeof input[key] === 'number' && Number.isFinite(input[key]) ? input[key] : fallback;
    result[key] = Math.round(Math.max(key === 'minutes' ? 15 : 0, Math.min(key === 'minutes' ? 720 : 100, value)));
  }
  return result;
}

export function sleepRecipes(mushrooms) {
  if (!Array.isArray(mushrooms) || mushrooms.length > SLEEP_MAX_MUSHROOMS) throw new Error('Choose up to 100 mushroom voices.');
  // Validate and copy once before generating anything, including on the main
  // thread before posting into the worker. A bad last recipe leaves no partial mix.
  return mushrooms.map(item => ({ recipe: recipe(item?.recipe) }));
}

function soften(input, reduction) {
  const output = new Float32Array(input.length);
  const alpha = 1 - Math.exp(-2 * Math.PI * (700 + 7000 * (1 - reduction) ** 2) / SLEEP_RATE);
  const dcAlpha = 1 - Math.exp(-2 * Math.PI * 28 / SLEEP_RATE);
  let first = 0, second = 0, dc = 0;
  for (let i = 0; i < input.length; i++) {
    dc += dcAlpha * (input[i] - dc); first += alpha * (input[i] - dc - first);
    second += alpha * (first - second); output[i] = second;
  }
  return output;
}

// Crossfade the end into the beginning, retaining a continuous loop boundary.
function smoothLoop(input, fade = 2400) {
  const output = new Float32Array(input.length - fade);
  for (let i = 0; i < output.length; i++) output[i] = i < fade
    ? input[input.length - fade + i] * (1 - i / fade) + input[i] * i / fade : input[i];
  return output;
}

function level(channels, target = .12, maxGain = 4) {
  let sum = 0, peak = 0, length = 0;
  for (const data of channels) for (const value of data) {
    if (!Number.isFinite(value)) throw new Error('A mushroom produced an invalid sound.');
    sum += value * value; peak = Math.max(peak, Math.abs(value)); length++;
  }
  const gain = peak ? Math.min(maxGain, target / Math.max(Math.sqrt(sum / Math.max(1, length)), 1e-8), .55 / peak) : 1;
  for (const data of channels) for (let i = 0; i < data.length; i++) data[i] *= gain;
  return channels;
}

export function renderSleepMushroom(raw, preferences = SLEEP_DEFAULTS) {
  const prefs = sleepPreferences(preferences), reduction = prefs.reduction / 100;
  const r = recipe(raw); r.settings.static *= 1 - .97 * reduction;
  const rendered = renderMushroom(r), output = new Float32Array(rendered.samples);
  // Softness also reduces the additional sound characters. Changes affect this
  // listening mix only, not the user's saved recipe or its identity.
  const blips = prefs.blips / 100 * (1 - .55 * reduction), pops = prefs.pops / 100 * (1 - .72 * reduction);
  let seed = r.settings.seed ^ 0x45d9f3b;
  const rand = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
  const notes = [0, 3, 5, 7, 10, 12, 15], root = [130.81, 146.83, 174.61, 196][r.settings.seed % 4];
  for (let start = .1 + rand() * .12; start < 3.7; start += .24 + rand() * .26) {
    const kind = Math.floor(rand() * 3), frequency = root * 2 ** (notes[Math.floor(rand() * notes.length)] / 12);
    const offset = Math.floor(start * SLEEP_RATE), count = Math.floor((.075 + rand() * .12) * SLEEP_RATE); let phase = 0;
    for (let i = 0; i < count; i++) {
      const t = i / SLEEP_RATE, u = i / count;
      const pitch = kind === 0 ? frequency * 2 ** (Math.floor(u * 3) * 3 / 12)
        : kind === 1 ? frequency * (1.8 - 1.15 * u) : frequency * (1 + .025 * Math.sin(t * 90));
      phase += 2 * Math.PI * pitch / SLEEP_RATE;
      const wave = (Math.sin(phase) + .25 * Math.sin(phase * 3) + .09 * Math.sin(phase * 5)) / 1.34;
      output[offset + i] += wave * Math.min(1, t / .004) * (1 - u) ** 2 * .24 * blips;
    }
  }
  for (let start = .23 + rand() * .25; start < 3.78; start += .42 + rand() * .5) {
    const offset = Math.floor(start * SLEEP_RATE), count = Math.floor((.055 + rand() * .09) * SLEEP_RATE), frequency = 65 + rand() * 65;
    let low = 0, phase = 0;
    for (let i = 0; i < count; i++) {
      const t = i / SLEEP_RATE, u = i / count; low += .15 * (rand() * 2 - 1 - low);
      phase += 2 * Math.PI * (frequency * Math.exp(-t * 24) + 32) / SLEEP_RATE;
      const envelope = Math.min(1, t / .0018) * Math.exp(-t * 55) * (1 - u) ** 2;
      const bubble = Math.sin(phase * 2.7) * Math.exp(-t * 85) * Math.min(1, t / .003);
      output[offset + i] += ((low * 1.9 + Math.sin(phase) * .65) * envelope * .34 + bubble * .035) * pops;
    }
  }
  const smoothed = soften(output, reduction), fade = Math.round(SLEEP_RATE * .008);
  for (let i = 0; i < smoothed.length; i++) smoothed[i] *= Math.min(1, i / fade, (smoothed.length - 1 - i) / fade);
  smoothed[0] = 0; smoothed[smoothed.length - 1] = 0;
  return smoothed;
}

function windTexture() {
  const channels = []; let seed = 2718;
  for (let c = 0; c < 2; c++) {
    const output = new Float32Array(SLEEP_RATE * SLEEP_SECONDS); let brown = 0, dc = 0;
    for (let i = 0; i < output.length; i++) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      brown = .992 * brown + .008 * (seed / 2147483648 - 1); dc += .0008 * (brown - dc);
      const t = i / SLEEP_RATE, gust = .63 + .23 * Math.sin(t * .52 + c * .7) + .14 * Math.sin(t * 1.57 + c);
      output[i] = (brown - dc) * gust * 4;
    }
    channels.push(smoothLoop(output));
  }
  return level(channels, .1, 5);
}

export function createSleepMix(mushrooms, preferences = SLEEP_DEFAULTS, onProgress = () => {}) {
  const voices = sleepRecipes(mushrooms), prefs = sleepPreferences(preferences);
  const length = SLEEP_RATE * SLEEP_SECONDS, channels = [new Float32Array(length), new Float32Array(length)];
  for (let index = 0; index < voices.length; index++) {
    const r = voices[index].recipe, voice = renderSleepMushroom(r, prefs), offset = r.settings.seed % voice.length;
    const pan = .16 + (r.settings.seed % 1000) / 1000 * .68, gain = 1 / Math.sqrt(Math.max(1, voices.length));
    const gains = [Math.cos(pan * Math.PI / 2) * gain, Math.sin(pan * Math.PI / 2) * gain];
    const phase = (r.settings.seed % 628) / 100;
    for (let i = 0; i < length; i++) {
      const sample = voice[(i + offset) % voice.length] * (.78 + .22 * Math.sin(phase + 2 * Math.PI * (1 + index % 3) * i / length));
      channels[0][i] += sample * gains[0]; channels[1][i] += sample * gains[1];
    }
    onProgress(index + 1, voices.length);
  }
  const softened = level(channels.map(channel => smoothLoop(channel))), wind = windTexture();
  for (let c = 0; c < 2; c++) for (let i = 0; i < softened[c].length; i++) {
    softened[c][i] = softened[c][i] * prefs.mushrooms / 100 + wind[c][i] * prefs.wind / 100 * .6;
  }
  // Final limiting never raises a quiet mix: individual layer sliders retain
  // their meaning, and even 100 loud voices cannot exceed the sample ceiling.
  level(softened, 1, 1);
  return { channels: softened, rate: SLEEP_RATE, count: voices.length };
}
