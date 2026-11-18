// SPDX-License-Identifier: GPL-3.0-only
import { DJ_STYLES } from './jazz-core.mjs';
import { validateJazzArrangement } from './jazz-radio-contract.mjs';

const styles = Object.freeze(Object.keys(DJ_STYLES));
const settingsKeys = Object.freeze(['style', 'tempo', 'swing', 'room', 'piano', 'bass', 'drums']);
const families = Object.freeze([
  Object.freeze({ name: 'Mellow', ending: 'room', tempo: -18, spread: 6, swing: 3, room: 53, piano: 78, bass: 84, drums: 45 }),
  Object.freeze({ name: 'Warm', ending: 'trio', tempo: 0, spread: 6, swing: 0, room: 35, piano: 84, bass: 86, drums: 60 }),
  Object.freeze({ name: 'Bright', ending: 'conversation', tempo: 17, spread: 7, swing: -4, room: 22, piano: 90, bass: 86, drums: 71 })
]);
const bounded = (value, low, high) => Math.min(high, Math.max(low, Math.round(value)));

function seededRandom(seed) {
  // A zero seed is valid too. Advancing before mixing avoids an absorbing zero
  // state, and no shared random state or browser clock affects the result.
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let mixed = Math.imul(state ^ (state >>> 15), state | 1);
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Make one coherent musical choice in the player's UI units. Swing is a whole
 * percentage (50 is straight); room and instrument levels are whole percentages.
 * The seven shuffled controls, preserved arrangement choices and a short label are returned. Applying this
 * bundle must leave master volume, mutes and unrelated user state with the caller.
 */
export function djShuffleSettings(current, seed) {
  if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) {
    throw new RangeError('Jazz shuffle seed must be an unsigned 32-bit integer.');
  }
  const previous = current && typeof current === 'object' && !Array.isArray(current) ? current : {};
  const random = seededRandom(seed >>> 0);
  const hasCurrentStyle = styles.includes(previous.style);
  const continueStyle = random() < 0.78;
  const choices = hasCurrentStyle ? styles.filter(style => style !== previous.style) : styles;
  const style = hasCurrentStyle && continueStyle ? previous.style : choices[Math.floor(random() * choices.length)];
  const preset = DJ_STYLES[style];
  const family = families[Math.floor(random() * families.length)];
  const gesture = random() * 2 - 1;
  const detail = () => random() * 2 - 1;

  // The families keep blues unhurried and bossa lighter and quicker. A livelier
  // gesture within a family nudges tempo/drums up while reducing room and swing.
  const lowTempo = Math.max(55, preset.tempo - (style === 'bossa' ? 28 : 26));
  const highTempo = Math.min(180, preset.tempo + (style === 'blues' ? 26 : 28));
  const tempo = bounded(preset.tempo + family.tempo + gesture * family.spread, lowTempo, highTempo);
  const room = bounded(family.room - gesture * 5 + detail() * 3, 14, 64);
  const piano = bounded(family.piano + detail() * 5, 70, 96);
  const bass = bounded(family.bass + detail() * 5, 76, 96);
  const drums = bounded(family.drums + gesture * 3 + detail() * 3, 38,
    Math.min(76, Math.floor((piano + bass) * 0.44)));
  const settings = {
    style,
    tempo,
    swing: preset.straight ? 50 : bounded(preset.swing * 100 + family.swing - gesture * 1.5, 54, 70),
    room,
    piano,
    bass,
    drums,
    ...validateJazzArrangement(previous),
    label: `${family.name} ${style} ${family.ending}`
  };

  // Even a repeated seed should make a new audible choice when the listener
  // feeds the previous result back in. A one-BPM step preserves the same family.
  if (settingsKeys.every(key => previous[key] === settings[key])) {
    settings.tempo += settings.tempo < highTempo ? 1 : -1;
  }
  return settings;
}

/** Suggest a neighboring key while retaining the selected genre's major/minor mode. */
export function djSuggestKey(current, seed) {
  if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) throw new RangeError('Jazz key seed must be an unsigned 32-bit integer.');
  const names = ['C', 'D♭', 'D', 'E♭', 'E', 'F', 'G♭', 'G', 'A♭', 'A', 'B♭', 'B'];
  const previous = current && typeof current === 'object' ? current : {}, genre = DJ_STYLES[previous.style] || DJ_STYLES.swing;
  const keyFromLabel = names.findIndex(note => typeof previous.key === 'string' && previous.key.startsWith(note + ' '));
  const base = Number.isInteger(previous.keyRoot) && previous.keyRoot >= 0 && previous.keyRoot < 12 ? previous.keyRoot :
    Number.isInteger(previous.tonic) && previous.tonic >= 0 && previous.tonic < 12 ? previous.tonic : keyFromLabel >= 0 ? keyFromLabel : genre.tonic;
  const move = seededRandom(seed >>> 0)() < 0.5 ? 5 : 7, root = (base + move) % 12;
  const mode = previous.style === 'modal' ? 'Dorian' : genre.mode === 'minor' ? 'minor' : 'major';
  return { root, label: names[root] + ' ' + mode, reason: `A ${move === 5 ? 'fourth' : 'fifth'} above ${names[base]} keeps a nearby key color in this genre.` };
}
