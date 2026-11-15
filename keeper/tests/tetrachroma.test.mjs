import test from 'node:test';
import assert from 'node:assert/strict';
import { tetrachromaColor, tickAt, EPOCH } from '../public/core.mjs';

test('Tetrachroma preserves RGB and encodes a separate black byte', () => {
  assert.deepEqual(tetrachromaColor('#ff0000'), { format: 'doodletick-tetrachroma-v1', value: '#FF000000', rgb: '#FF0000', black: 0, preview: '#FF0000' });
  assert.deepEqual(tetrachromaColor('#4080ff', 128), { format: 'doodletick-tetrachroma-v1', value: '#4080FF80', rgb: '#4080FF', black: 128, preview: '#20407F' });
  const black = tetrachromaColor('#FFFFFF', 255);
  assert.equal(black.value, '#FFFFFFFF');
  assert.equal(black.preview, '#000000'); // Deliberately different from CSS RGBA.
});

test('all black depths stay opaque and darken monotonically without losing the source color', () => {
  let previous = [255, 161, 63];
  for (let black = 0; black <= 255; black++) {
    const color = tetrachromaColor('#FFA13F', black);
    assert.equal(parseInt(color.value.slice(-2), 16), black);
    assert.equal(color.value.slice(0, 7), '#FFA13F');
    assert.match(color.preview, /^#[0-9A-F]{6}$/);
    const channels = color.preview.slice(1).match(/../g).map(pair => parseInt(pair, 16));
    assert(channels.every((channel, i) => channel <= previous[i]));
    previous = channels;
  }
  assert.deepEqual(previous, [0, 0, 0]);
});

test('ambiguous CSS shorthand, alpha bytes and invalid black values are rejected', () => {
  for (const rgb of ['#FFF', '#12345678', 'red', '123456', '#GG0000', null, 123456]) assert.throws(() => tetrachromaColor(rgb));
  for (const black of [-1, 256, 0.5, NaN, Infinity, '80', null]) assert.throws(() => tetrachromaColor('#AABBCC', black));
});

test('a local Tetrachroma preview leaves shared hourly clock values intact', () => {
  const first = tickAt(EPOCH), last = tickAt(EPOCH + 23 * 3600000);
  assert.equal(tetrachromaColor(first.color).value, '#FF000000');
  assert.equal(tetrachromaColor(last.color).value, last.color + '00');
  assert.equal(tetrachromaColor(first.color, 255).preview, '#000000');
  assert.deepEqual(tickAt(EPOCH), first);
  assert.deepEqual(tickAt(EPOCH + 23 * 3600000), last);
});

