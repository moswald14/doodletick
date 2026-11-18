// SPDX-License-Identifier: GPL-3.0-only
import { DJ_GENRE_IDS } from './jazz-genres.mjs';

export const JAZZ_RECEIPT_FORMAT = 'doodle-jazz-chord-receipt-v1';
export const JAZZ_NOW_FORMAT = 'doodle-jazz-now-v1';
export const JAZZ_HOUR = 3600000;
export const JAZZ_CLIP_MAX_SECONDS = 64;
export const JAZZ_METERS = Object.freeze([2, 3, 4, 5, 6, 7]);
export const JAZZ_PHRASE_BARS = Object.freeze(['genre', 4, 8, 16, 32]);
export const JAZZ_BEAT_PATTERNS = Object.freeze({
  genre: 'Follow the genre', swing: 'Swing ride', cool: 'Quiet brushes', bossa: 'Bossa', latin: 'Latin clave', funk: 'Funk backbeat'
});
export const JAZZ_ARRANGEMENT_DEFAULTS = Object.freeze({
  beatsPerBar: 4, phraseBars: 'genre', beatPattern: 'genre', beatOnly: false, keyRoot: 'auto', favorLikes: true
});
export const JAZZ_DEFAULT_SETTINGS = Object.freeze({ style: 'swing', tempo: 112, swing: 64, room: 35, piano: 82, bass: 90, drums: 68, ...JAZZ_ARRANGEMENT_DEFAULTS });
export const validJazzRequestId = value => typeof value === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(value);
const invalid = message => Object.assign(new Error(message), { status: 400 });
export function validateJazzArrangement(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw invalid('Choose valid Jazz arrangement settings.');
  const out = { ...JAZZ_ARRANGEMENT_DEFAULTS };
  for (const key of Object.keys(out)) if (Object.hasOwn(value, key)) out[key] = value[key];
  if (!JAZZ_METERS.includes(out.beatsPerBar) || !JAZZ_PHRASE_BARS.includes(out.phraseBars)
    || typeof out.beatPattern !== 'string' || !Object.hasOwn(JAZZ_BEAT_PATTERNS, out.beatPattern)
    || typeof out.beatOnly !== 'boolean' || typeof out.favorLikes !== 'boolean'
    || !(out.keyRoot === 'auto' || Number.isInteger(out.keyRoot) && out.keyRoot >= 0 && out.keyRoot <= 11)) throw invalid('The Jazz arrangement settings are outside their range.');
  return out;
}
export function validateRadioSettings(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || !DJ_GENRE_IDS.includes(value.style)) throw invalid('Choose a Jazz genre.');
  const out = { style: value.style };
  for (const [key, lo, hi] of [['tempo',55,180], ['swing',50,72], ['room',0,100], ['piano',0,100], ['bass',0,100], ['drums',0,100]]) {
    if (!Number.isInteger(value[key]) || value[key] < lo || value[key] > hi) throw invalid('The Jazz settings are outside their range.');
    out[key] = value[key];
  }
  // These grooves keep their straight pulse even after a manual adjustment.
  if (['bossa', 'latin', 'funk'].includes(out.style)) out.swing = 50;
  return { ...out, ...validateJazzArrangement(value) };
}
