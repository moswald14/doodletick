// SPDX-License-Identifier: GPL-3.0-only
import { DJ_GENRE_IDS } from './jazz-genres.mjs';

export const JAZZ_RECEIPT_FORMAT = 'doodle-jazz-chord-receipt-v1';
export const JAZZ_NOW_FORMAT = 'doodle-jazz-now-v1';
export const JAZZ_HOUR = 3600000;
export const JAZZ_DEFAULT_SETTINGS = Object.freeze({ style: 'swing', tempo: 112, swing: 64, room: 35, piano: 82, bass: 90, drums: 68 });
export const validJazzRequestId = value => typeof value === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(value);
const invalid = message => Object.assign(new Error(message), { status: 400 });
export function validateRadioSettings(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || !DJ_GENRE_IDS.includes(value.style)) throw invalid('Choose a Jazz genre.');
  const out = { style: value.style };
  for (const [key, lo, hi] of [['tempo',55,180], ['swing',50,72], ['room',0,100], ['piano',0,100], ['bass',0,100], ['drums',0,100]]) {
    if (!Number.isInteger(value[key]) || value[key] < lo || value[key] > hi) throw invalid('The Jazz settings are outside their range.');
    out[key] = value[key];
  }
  // These grooves keep their straight pulse even after a manual adjustment.
  if (['bossa', 'latin', 'funk'].includes(out.style)) out.swing = 50;
  return out;
}
