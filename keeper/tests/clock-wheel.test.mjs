import test from 'node:test';
import assert from 'node:assert/strict';
import { EPOCH, tickAt } from '../public/core.mjs';
import { clockModel, sectorPath } from '../public/clock-wheel.mjs';
test('24-hour wheel follows UTC boundaries and wraps to the next chapter', () => {
  const start = clockModel(EPOCH), noon = clockModel(EPOCH + 12.5 * 3600000);
  assert.equal(start.angle, 0); assert.equal(start.time, '00:00:00');
  assert.equal(noon.angle, 187.5); assert.equal(noon.time, '12:30:00');
  assert.equal(start.colors.length, 24); assert.equal(start.colors[0].rgb, '#FF0000'); assert.equal(new Set(start.colors.map(c => c.rgb)).size, 24);
  const end = clockModel(EPOCH + 86400000 - 1), next = clockModel(EPOCH + 86400000);
  assert(end.angle > 359.99); assert.equal(next.angle, 0); assert.equal(next.tick.cycle, 1);
  assert.deepEqual(next.tick, tickAt(EPOCH + 86400000));
  assert.equal(new Set([...next.colors, ...start.colors].map(c => c.rgb)).size, 48);
  assert.equal(new Set(start.colors.map(c => sectorPath(c.hour))).size, 24);
});
test('black focus affects wheel previews without changing canonical colors or ticks', () => {
  const pure = clockModel(EPOCH + 7200000, 0), black = clockModel(EPOCH + 7200000, 255);
  assert.deepEqual(pure.tick, black.tick);
  assert(black.colors.every(c => c.preview === '#000000' && c.value.endsWith('FF')));
  assert(pure.colors.every(c => c.preview === c.rgb && c.value.endsWith('00')));
});
