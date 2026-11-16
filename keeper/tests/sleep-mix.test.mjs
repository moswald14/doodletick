// SPDX-License-Identifier: GPL-3.0-only
import test from 'node:test';
import assert from 'node:assert/strict';
import { SLEEP_DEFAULTS, SLEEP_STARTER_MUSHROOMS, SLEEP_RATE, SLEEP_SECONDS,
  sleepPreferences, sleepRecipes, renderSleepMushroom, createSleepMix } from '../public/sleep-mix.mjs';
import { mushroomId } from '../public/mushroom-core.mjs';

const energy = data => data.reduce((sum, value) => sum + value * value, 0) / data.length;
const bounded = data => data.every(value => Number.isFinite(value) && Math.abs(value) <= .550001);

test('sleep preferences restore settings only and bound timer and volume', () => {
  assert.deepEqual(sleepPreferences({ playing: true, ended: false }), SLEEP_DEFAULTS);
  assert.deepEqual(sleepPreferences(null), SLEEP_DEFAULTS);
  assert.equal(sleepPreferences({ volume: NaN }).volume, 15);
  assert.equal(sleepPreferences({ volume: 300 }).volume, 100);
  assert.equal(sleepPreferences({ wind: -2 }).wind, 0);
  assert.equal(sleepPreferences({ minutes: -1 }).minutes, 15);
  assert.equal(sleepPreferences({ minutes: Infinity }).minutes, 480);
  assert.equal(sleepPreferences({ minutes: 999999 }).minutes, 720);
  assert.equal(sleepPreferences({ minutes: 30 }).minutes, 30);
  assert.equal(sleepPreferences({ minutes: 120 }).minutes, 120);
});

test('listening copies recipes without changing generator identities or saved sound', async () => {
  const original = structuredClone(SLEEP_STARTER_MUSHROOMS), before = structuredClone(original);
  const ids = await Promise.all(original.map(mushroom => mushroomId(mushroom.recipe)));
  createSleepMix(original);
  assert.deepEqual(original, before);
  assert.deepEqual(await Promise.all(original.map(mushroom => mushroomId(mushroom.recipe))), ids);
  const copy = sleepRecipes(original); copy[0].recipe.settings.growth = 1;
  assert.equal(original[0].recipe.settings.growth, before[0].recipe.settings.growth);
});

test('seeded wind and mushroom sounds reproduce with bounded stereo samples', () => {
  const first = createSleepMix(SLEEP_STARTER_MUSHROOMS), second = createSleepMix(SLEEP_STARTER_MUSHROOMS);
  assert.deepEqual(first.channels, second.channels);
  assert.equal(first.rate, SLEEP_RATE); assert.equal(first.count, 3);
  assert.equal(first.channels[0].length, SLEEP_RATE * SLEEP_SECONDS - 2400);
  assert.ok(first.channels.every(bounded)); assert.ok(energy(first.channels[0]) > 1e-8);
  assert.notDeepEqual(first.channels[0], first.channels[1]);
  // A crossfaded loop join has no artificial step beyond a normal local sample.
  for (const data of first.channels) assert.ok(Math.abs(data[0] - data.at(-1)) < .03);
});

test('static reduction removes high-frequency energy and effects stay independent', () => {
  const raw = { ...SLEEP_STARTER_MUSHROOMS[0].recipe, settings: { seed: 713, growth: .6, static: 1, glitch: .3, mix: 1 } };
  const harsh = renderSleepMushroom(raw, { reduction: 0, blips: 0, pops: 0 });
  const soft = renderSleepMushroom(raw, { reduction: 100, blips: 0, pops: 0 });
  const differences = data => data.subarray(1).reduce((sum, value, i) => sum + (value - data[i]) ** 2, 0);
  assert.ok(differences(soft) < differences(harsh) / 10);
  const silent = { ...raw, settings: { ...raw.settings, static: 0, glitch: 0 } };
  const blips = renderSleepMushroom(silent, { blips: 100, pops: 0 }), pops = renderSleepMushroom(silent, { blips: 0, pops: 100 });
  assert.ok(energy(blips) > 0); assert.ok(energy(pops) > 0); assert.notDeepEqual(blips, pops);
  assert.equal(energy(renderSleepMushroom(silent, { blips: 0, pops: 0 })), 0);
});

test('muted mix layers remain silent and layer volume is not normalized back up', () => {
  const muted = createSleepMix(SLEEP_STARTER_MUSHROOMS, { mushrooms: 0, wind: 0 });
  assert.ok(muted.channels.every(channel => channel.every(value => value === 0)));
  const loud = createSleepMix([], { wind: 100 }), quiet = createSleepMix([], { wind: 10 });
  assert.ok(energy(quiet.channels[0]) < energy(loud.channels[0]) / 90);
  assert.ok(energy(createSleepMix([], { wind: 0 }).channels[0]) === 0);
});

test('100 loud mushroom voices remain bounded and every voice is reported once', () => {
  const voices = Array.from({ length: 100 }, (_, index) => ({ recipe: {
    kind: 'dot-mushroom', version: 1, name: 'Stress voice', patch: null,
    settings: { seed: index + 1, growth: 1, static: 1, glitch: 1, mix: 1 },
  } }));
  const progress = [];
  const mix = createSleepMix(voices, { reduction: 0, mushrooms: 100, wind: 100, blips: 100, pops: 100 }, (done, total) => progress.push([done, total]));
  assert.equal(mix.count, 100); assert.equal(progress.length, 100);
  assert.deepEqual(progress[0], [1, 100]); assert.deepEqual(progress.at(-1), [100, 100]);
  assert.ok(mix.channels.every(bounded));
});

test('invalid or oversized recipe lists fail before generating partial audio', () => {
  let called = 0;
  assert.throws(() => createSleepMix([...SLEEP_STARTER_MUSHROOMS, { recipe: {} }], {}, () => called++));
  assert.equal(called, 0);
  assert.throws(() => sleepRecipes(Array(101).fill(SLEEP_STARTER_MUSHROOMS[0])), /100/);
  assert.throws(() => sleepRecipes(null), /100/);
});
