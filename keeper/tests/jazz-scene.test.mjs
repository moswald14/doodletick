// SPDX-License-Identifier: GPL-3.0-only
import test from 'node:test';
import assert from 'node:assert/strict';
import { DJRenderer, djMakeBank } from '../public/jazz-core.mjs';
const bank = djMakeBank(12000);
function fixture() {
  const messages = [], renderer = new DJRenderer(12000, bank, { seed: 47, style: 'swing', tempo: 112, swing: 0.64 }, m => messages.push(m));
  const left = new Float32Array(128), right = new Float32Array(128), render = () => renderer.render(left, right);
  render(); const next = () => { const at = renderer.nextBar; while (renderer.nextBar === at) render(); };
  return { renderer, messages, render, next };
}
const scene = (id = 'shuffle-one') => ({ id, composition: { style: 'bossa', tempo: 135, swing: 0.5 }, levels: { piano: 0.9, bass: 0.84, drums: 0.65 } });
test('shuffle composition and trio levels apply together at the next musical bar', () => {
  const f = fixture(), oldTargets = { ...f.renderer.targets };
  f.renderer.configure({ scene: scene() });
  assert.equal(f.renderer.info.tempo, 112); assert.deepEqual(f.renderer.targets, oldTargets); assert(!f.messages.some(m => m.sceneApplied));
  f.next(); assert.equal(f.renderer.info.tempo, 135); assert.equal(f.renderer.info.style, 'bossa'); assert.equal(f.renderer.info.swing, 0.5);
  assert.deepEqual(f.renderer.targets, scene().levels); assert.equal(f.messages.filter(m => m.sceneApplied).length, 1);
});
test('manual mute and level changes made before the bar are retained after a shuffle', () => {
  const f = fixture(); f.renderer.configure({ scene: scene() });
  f.renderer.configure({ levels: { piano: 0, bass: 0.72, drums: 0.42 } }); f.next();
  assert.deepEqual(f.renderer.targets, { piano: 0, bass: 0.72, drums: 0.42 });
});
test('repeated shuffles coalesce and malformed bundles cannot partially change the trio', () => {
  const f = fixture(); f.renderer.configure({ scene: scene('old') });
  f.renderer.configure({ scene: { ...scene('latest'), composition: { style: 'blues', tempo: 90, swing: 0.61 } } });
  f.renderer.configure({ scene: { ...scene('invalid'), levels: { piano: NaN, bass: 1, drums: 1 } } }); f.next();
  assert.equal(f.renderer.info.style, 'blues'); assert.equal(f.renderer.info.tempo, 90);
  assert.deepEqual(f.messages.filter(m => m.sceneApplied).map(m => m.sceneApplied), ['latest']);
});
