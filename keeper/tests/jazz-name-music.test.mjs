// SPDX-License-Identifier: GPL-3.0-only
import test from 'node:test';
import assert from 'node:assert/strict';
import { DJRenderer, djMakeBank, DJ_STYLES } from '../public/jazz-core.mjs';
import { validateJazzContext } from '../public/jazz-name-contract.mjs';
import { result } from './jazz-name-fixture.mjs';
const bank = djMakeBank(12000);
function fixture(style = 'swing') {
  const messages = [], renderer = new DJRenderer(12000, bank, { ...DJ_STYLES[style], style, seed: 47 }, info => messages.push(info));
  const left = new Float32Array(128), right = new Float32Array(128);
  const render = () => renderer.render(left, right);
  const nextBar = () => { const before = renderer.nextBar; while (before === renderer.nextBar) render(); };
  render(); return { renderer, messages, left, right, render, nextBar };
}
function part(f, patch = {}) { return { requestId: 'paid-fixture', targetSet: f.renderer.info.set, targetSeed: f.renderer.info.seed, result, ...patch }; }

test('naming snapshots describe the audible bar and its performed melody, including a final bar before set rollover', () => {
  const f = fixture('blues'), { renderer: r } = f;
  r.composer.bar = 11; r.composer.chorus = 3; r.composer.set = 1; f.nextBar();
  assert.equal(r.info.set, 1); assert.equal(r.composer.set, 2, 'composer has advanced beyond the audible bar');
  r.configure({ nameSnapshot: 'capture-1' });
  const snapshot = f.messages.find(m => m.nameSnapshot);
  const context = validateJazzContext(snapshot.context);
  assert.equal(context.set, 1); assert.equal(context.bar, 12); assert.equal(context.seed, 47);
  assert.deepEqual(context.motif, r.events.filter(e => e.role === 'melody').map(e => e.note));
});

test('a new beat waits for the next bar, replaces only drums, and preserves piano and bass', () => {
  const f = fixture(), before = structuredClone(f.renderer.events);
  f.renderer.configure({ jazzPart: part(f) });
  assert.deepEqual(f.renderer.events, before); assert(!f.messages.some(m => m.partApplied));
  f.nextBar();
  assert(f.messages.some(m => m.partApplied === 'paid-fixture'));
  assert.equal(f.renderer.info.namedTitle, result.title);
  const drums = f.renderer.events.filter(e => e.role === 'drums');
  assert.equal(drums.length, result.pattern.length);
  assert(f.renderer.events.some(e => e.role === 'melody')); assert.equal(f.renderer.events.filter(e => e.role === 'bass').length, 4);
  assert.deepEqual(drums.map(e => e.beat), result.pattern.map(h => h.step / 4));
});

test('custom drum hits follow the current swung or straight grid in every style', () => {
  for (const style of Object.keys(DJ_STYLES)) {
    const f = fixture(style); f.renderer.configure({ jazzPart: part(f) }); f.nextBar();
    for (const e of f.renderer.events.filter(e => e.role === 'drums')) {
      const whole = Math.floor(e.beat), frac = e.beat - whole, { swing, tempo } = f.renderer.info;
      const grid = (whole + (frac <= 0.5 ? frac * 2 * swing : swing + (frac - 0.5) * 2 * (1 - swing))) * 60 / tempo;
      assert(Math.abs(e.time - grid) < 1e-9);
    }
  }
});

test('a queued part for a stale set is rejected at the real bar boundary', () => {
  const f = fixture(); f.renderer.configure({ jazzPart: part(f) });
  f.renderer.configure({ composition: { newSet: true, seed: 91 } }); f.nextBar();
  assert(f.messages.some(m => m.partRejected === 'paid-fixture')); assert.equal(f.renderer.activePart, null);
  assert.equal(f.renderer.info.namedTitle, undefined);
});

test('new styles and naturally changing sets clear an active beat', () => {
  for (const natural of [false, true]) {
    const f = fixture('blues'); f.renderer.configure({ jazzPart: part(f) }); f.nextBar();
    if (natural) { f.renderer.composer.bar = 11; f.renderer.composer.chorus = 3; f.nextBar(); f.nextBar(); }
    else { f.renderer.configure({ composition: { style: 'bossa', swing: 0.5 } }); f.nextBar(); }
    assert.equal(f.renderer.activePart, null); assert.equal(f.renderer.info.namedTitle, undefined);
  }
});

test('malformed patterns cannot crash audio or bypass the drum mute', () => {
  const f = fixture();
  f.renderer.configure({ jazzPart: part(f, { result: { ...result, pattern: [{ instrument: 'unknown', step: 0, velocity: 0.3 }] } }) });
  assert(f.messages.some(m => m.partRejected));
  f.renderer.configure({ jazzPart: part(f) }); f.nextBar();
  for (let n = 0; n < 80; n++) { f.render(); assert(f.left.every(Number.isFinite)); assert(f.right.every(Number.isFinite)); }
  f.renderer.configure({ levels: { piano: 0, bass: 0, drums: 0 } });
  for (let n = 0; n < 160; n++) f.render();
  assert(f.left.every(v => Math.abs(v) < 1e-9)); assert(f.right.every(v => Math.abs(v) < 1e-9));
});
