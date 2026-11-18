// SPDX-License-Identifier: GPL-3.0-only
// This module is shared by the server, browser and audio thread. It contains no credentials.
import { DJ_GENRE_IDS } from './jazz-genres.mjs';
import { validateJazzArrangement } from './jazz-radio-contract.mjs';
export const JAZZ_CHORD_QUALITIES = Object.freeze(['maj9', 'm9', '13', '7', '7♭9', 'ø7', '6/9', 'm6', '9']);
export const PEPE_CHAIN_ID = '0x1';
export const PEPE_CONTRACT = '0x6982508145454ce325ddbe47a25d4ec3d2311933';
export const PEPE_DECIMALS = 18;
export const JAZZ_NAME_USD = '0.02';
export const JAZZ_DRUMS = Object.freeze(['kick', 'hat', 'brush', 'stick', 'ride']);
export const isAddress = value => typeof value === 'string' && /^0x[0-9a-fA-F]{40}$/.test(value) && !/^0x0{40}$/i.test(value);
export const isTransactionHash = value => typeof value === 'string' && /^0x[0-9a-fA-F]{64}$/.test(value);
const object = value => value && typeof value === 'object' && !Array.isArray(value);
function integer(value, min, max) { if (!Number.isSafeInteger(value) || value < min || value > max) throw new Error('Invalid Jazz number.'); return value; }
function number(value, min, max) { if (!Number.isFinite(value) || value < min || value > max) throw new Error('Invalid Jazz number.'); return value; }
function text(value, max) {
  if (typeof value !== 'string' || !value.trim() || value.length > max || /[\x00-\x1f\x7f<>]/.test(value)) throw new Error('Invalid Jazz text.');
  return value.trim();
}
export function validateJazzContext(input) {
  if (!object(input) || !DJ_GENRE_IDS.includes(input.style) || !['call', 'repeat', 'answer', 'cadence'].includes(input.phraseRole)) throw new Error('Play a Jazz set first.');
  const { beatsPerBar, phraseBars, beatPattern, beatOnly, keyRoot } = validateJazzArrangement(input);
  if (!Array.isArray(input.chords) || input.chords.length < 1 || input.chords.length > 2 || !Array.isArray(input.motif) || (!beatOnly && !input.motif.length) || input.motif.length > 8) throw new Error('Invalid Jazz phrase.');
  return { seed: integer(input.seed, 1, 0xffffffff), set: integer(input.set, 1, 0x7fffffff), style: input.style,
    tempo: number(input.tempo, 55, 180), swing: number(input.swing, 0.5, 0.72), key: text(input.key, 24),
    beatsPerBar, phraseBars, beatPattern, beatOnly, keyRoot,
    bar: integer(input.bar, 1, 32), chorus: integer(input.chorus, 1, 0x7fffffff), phraseRole: input.phraseRole,
    chords: input.chords.map(c => { if (!object(c) || ![0, Math.ceil(beatsPerBar / 2)].includes(c.beat)) throw new Error('Invalid Jazz chord.'); return { beat: c.beat, text: text(c.text, 16) }; }),
    motif: input.motif.map(n => integer(n, 0, 127)),
    ...(Object.hasOwn(input, 'tonic') ? { tonic: integer(input.tonic, 0, 11) } : {}),
    ...(Object.hasOwn(input, 'progression') ? { progression: validateJazzProgression(input.progression) } : {}) };
}
export function validateJazzProgression(input) {
  if (!Array.isArray(input) || input.length < 1 || input.length > 8) throw new Error('Invalid Jazz progression.');
  return input.map(chord => {
    if (!object(chord) || !JAZZ_CHORD_QUALITIES.includes(chord.quality)) throw new Error('Invalid Jazz chord.');
    return { root: integer(chord.root, 0, 11), quality: chord.quality };
  });
}
export function validateJazzResult(input) {
  if (!object(input) || !Array.isArray(input.pattern) || input.pattern.length < 2 || input.pattern.length > 24) throw new Error('The new beat was not valid.');
  const used = new Set();
  const pattern = input.pattern.map(hit => {
    if (!object(hit) || !JAZZ_DRUMS.includes(hit.instrument)) throw new Error('The new beat used an unknown instrument.');
    const step = integer(hit.step, 0, 15), key = hit.instrument + ':' + step;
    if (used.has(key)) throw new Error('The new beat repeated a hit.'); used.add(key);
    return { instrument: hit.instrument, step, velocity: number(hit.velocity, 0.08, 0.65) };
  }).sort((a, b) => a.step - b.step || a.instrument.localeCompare(b.instrument));
  return { title: text(input.title, 80), description: text(input.description, 180), pattern };
}
export function encodePepeTransfer(recipient, amount) {
  if (!isAddress(recipient) || typeof amount !== 'string' || !/^[1-9][0-9]{0,76}$/.test(amount) || BigInt(amount) >= 1n << 256n) throw new Error('Invalid PEPE transfer.');
  return '0xa9059cbb' + recipient.slice(2).toLowerCase().padStart(64, '0') + BigInt(amount).toString(16).padStart(64, '0');
}
export function formatPepeUnits(amount) {
  if (typeof amount !== 'string' || !/^[0-9]{1,77}$/.test(amount)) throw new Error('Invalid PEPE amount.');
  const padded = amount.padStart(19, '0');
  return padded.slice(0, -18) + '.' + padded.slice(-18);
}
