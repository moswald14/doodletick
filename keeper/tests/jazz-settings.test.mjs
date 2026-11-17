// SPDX-License-Identifier: GPL-3.0-only
import test from 'node:test';
import assert from 'node:assert/strict';
import { DJ_STYLES } from '../public/jazz-core.mjs';
import { djShuffleSettings } from '../public/jazz-settings.mjs';

const keys = ['style', 'tempo', 'swing', 'room', 'piano', 'bass', 'drums'];
const styles = Object.keys(DJ_STYLES);
const signature = value => JSON.stringify(keys.map(key => value[key]));
const initial = style => ({ style, tempo: DJ_STYLES[style].tempo, swing: Math.round(DJ_STYLES[style].swing * 100),
  room: 35, piano: 82, bass: 90, drums: 68 });

test('shuffle is deterministic for uint32 seeds and leaves its input untouched', () => {
  for (const style of styles) for (const seed of [0, 1, 47, 2147483648, 4294967295]) {
    const current = Object.freeze({ ...initial(style), trackMutes: Object.freeze({ piano: true, bass: false, drums: false }) });
    const before = JSON.stringify(current);
    const a = djShuffleSettings(current, seed), b = djShuffleSettings(current, seed);
    assert.deepEqual(a, b);
    assert.equal(JSON.stringify(current), before);
    assert.notEqual(a, b, 'Calls produce independent output objects.');
  }
  for (const seed of [-1, 4294967296, 0.5, NaN, Infinity, '47', undefined, null]) {
    assert.throws(() => djShuffleSettings(initial('swing'), seed), RangeError);
  }
});

test('every bundle fits the controls and keeps its trio balanced and its style coherent', () => {
  for (const currentStyle of styles) for (let seed = 0; seed < 2048; seed++) {
    const choice = djShuffleSettings(initial(currentStyle), seed);
    assert.deepEqual(Object.keys(choice).sort(), [...keys, 'label'].sort());
    assert(styles.includes(choice.style));
    assert(typeof choice.label === 'string' && choice.label.length > 0 && choice.label.length <= 40);
    assert(!/[\r\n<>]/.test(choice.label));
    for (const key of keys.slice(1)) assert(Number.isInteger(choice[key]), `${key} uses an integer UI value.`);
    assert(choice.tempo >= 55 && choice.tempo <= 180);
    assert(choice.swing >= 50 && choice.swing <= 72);
    assert(choice.room >= 0 && choice.room <= 100);
    for (const key of ['piano', 'bass', 'drums']) assert(choice[key] > 0 && choice[key] <= 100);
    assert(Math.abs(choice.piano - choice.bass) <= 16, 'The piano and bass share the foreground.');
    assert(choice.drums < Math.min(choice.piano, choice.bass), 'Percussion supports both melodic voices.');
    const foreground = (choice.piano + choice.bass) / 2;
    assert(choice.drums >= foreground * 0.4 && choice.drums <= foreground * 0.9);
    if (DJ_STYLES[choice.style].straight) {
      assert.equal(choice.swing, 50, 'Bossa, Afro-Cuban and funk shuffles keep their straight grid.');
      assert(choice.tempo >= 75 && choice.tempo <= 175);
    } else if (choice.style === 'blues') {
      assert(choice.swing > 50, 'Blues retains its long/short swing feel.');
      assert(choice.tempo <= 110, 'Blue hour does not become a racing tempo.');
    } else if (choice.style === 'bebop') {
      assert(choice.swing > 50);
      assert(choice.tempo >= 140 && choice.tempo <= 180, 'Bebop retains its quicker feel.');
    } else if (choice.style === 'cool') {
      assert(choice.swing > 50);
      assert(choice.tempo >= 65 && choice.tempo <= 130, 'Cool jazz stays restrained.');
    } else {
      assert(choice.swing > 50);
      assert(choice.tempo >= 80 && choice.tempo <= 145);
    }
  }
});

test('families correlate tempo, space and accompaniment instead of drawing unrelated controls', () => {
  const groups = new Map();
  for (const currentStyle of styles) for (let seed = 0; seed < 1024; seed++) {
    const choice = djShuffleSettings(initial(currentStyle), seed);
    const family = choice.label.split(' ')[0];
    const id = `${choice.style}:${family}`;
    const group = groups.get(id) || { count: 0, tempo: 0, swing: 0, room: 0, drums: 0 };
    group.count++;
    for (const key of ['tempo', 'swing', 'room', 'drums']) group[key] += choice[key];
    groups.set(id, group);
  }
  const average = (style, family, key) => {
    const group = groups.get(`${style}:${family}`);
    assert(group && group.count > 30, `${style} explores its ${family} family.`);
    return group[key] / group.count;
  };
  for (const style of styles) {
    const mellowTempo = average(style, 'Mellow', 'tempo'), warmTempo = average(style, 'Warm', 'tempo');
    const brightTempo = average(style, 'Bright', 'tempo');
    assert(mellowTempo < warmTempo - 10 && warmTempo < brightTempo - 10);
    assert(average(style, 'Mellow', 'room') > average(style, 'Bright', 'room') + 20);
    assert(average(style, 'Mellow', 'drums') < average(style, 'Bright', 'drums') - 15);
    if (!DJ_STYLES[style].straight) assert(average(style, 'Mellow', 'swing') > average(style, 'Bright', 'swing') + 3);
  }
});

test('shuffle usually continues the current style but also explores the other genres', () => {
  for (const currentStyle of styles) {
    const counts = Object.fromEntries(styles.map(style => [style, 0]));
    for (let seed = 0; seed < 4096; seed++) counts[djShuffleSettings(initial(currentStyle), seed).style]++;
    const continuity = counts[currentStyle] / 4096;
    assert(continuity > 0.65 && continuity < 0.9, 'Style changes are occasional, not constant or impossible.');
    for (const style of styles.filter(value => value !== currentStyle)) assert(counts[style] > 40);
  }
});

test('bounded seed variation produces many musical choices and never immediately repeats the same seven settings', () => {
  const choices = new Set();
  for (let seed = 0; seed < 2048; seed++) choices.add(signature(djShuffleSettings(initial('swing'), seed)));
  assert(choices.size > 500, 'Variation goes beyond labels or a few fixed presets.');
  for (const style of styles) for (const seed of [0, 1, 17, 47, 91, 4294967295]) {
    let current = initial(style);
    for (let i = 0; i < 12; i++) {
      const next = djShuffleSettings(current, seed);
      assert.notEqual(signature(next), signature(current));
      current = next;
    }
  }
});

test('excluded controls and unrelated user state survive applying a shuffled bundle', () => {
  const excluded = Object.freeze({ volume: 0, muted: true, night: true,
    trackMutes: Object.freeze({ piano: true, bass: false, drums: true }),
    identity: Object.freeze({ fixture: 'test-only' }), payment: Object.freeze({ fixture: 'test-only' }) });
  const current = Object.freeze({ ...initial('blues'), ...excluded });
  for (let seed = 0; seed < 100; seed++) {
    const choice = djShuffleSettings(current, seed), applied = { ...current, ...choice };
    for (const key of Object.keys(excluded)) {
      assert(!Object.hasOwn(choice, key), `${key} is outside shuffle's authority.`);
      assert.equal(applied[key], current[key]);
    }
  }
  for (const current of [undefined, null, [], {}, { style: 'unknown' }]) {
    assert(styles.includes(djShuffleSettings(current, 47).style));
  }
});
