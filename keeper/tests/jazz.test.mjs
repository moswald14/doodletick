// SPDX-License-Identifier: GPL-3.0-only
import test from 'node:test';
import assert from 'node:assert/strict';
import { DJComposer, DJRenderer, DJ_STYLES, djMakeBank } from '../public/jazz-core.mjs';

test('each jazz style keeps composing bounded, changing phrases across complete sets', () => {
  for (const [style, preset] of Object.entries(DJ_STYLES)) {
    const composer = new DJComposer({ style, tempo: preset.tempo, swing: preset.swing, seed: 47 });
    const phrases = new Set();
    for (let i = 0; i < 1024; i++) {
      const bar = composer.nextBar();
      assert(bar.info.bar >= 1 && bar.info.bar <= preset.bars);
      assert(bar.events.length > 8 && bar.events.length < 100);
      assert.equal(bar.events.filter(e => e.instrument === 'bass').length, 4);
      for (const e of bar.events) {
        assert(e.time >= 0 && e.time < bar.duration && e.duration > 0);
        assert(Number.isFinite(e.velocity));
      }
      phrases.add(JSON.stringify(bar.events.filter(e => e.role === 'melody').map(e => [e.beat, e.note])));
    }
    // Repetition is intentional. Check real pitch/rhythm variety, not tiny
    // random performance differences that can hide an unchanging melody.
    assert(phrases.size > 16);
    assert(composer.set > 8 && composer.chorus > 16);
  }
});

test('composition changes apply on a bar boundary and begin a fresh form', () => {
  const composer = new DJComposer({ seed: 17 });
  composer.nextBar();
  composer.configure({ style: 'bossa', tempo: 128, swing: 0.5, newSet: true, seed: 53 });
  assert.equal(composer.config.style, 'swing');
  const bar = composer.nextBar();
  assert.equal(bar.info.style, 'bossa'); assert.equal(bar.info.bar, 1);
  assert.equal(bar.info.tempo, 128); assert.equal(bar.info.swing, 0.5);
  assert.match(bar.info.key, /minor$/);
});

test('the jazz renderer produces finite stereo audio, keeps its beat clock, and mutes smoothly', () => {
  const rate = 24000, bank = djMakeBank(rate);
  const sampleBytes = [...bank.piano, ...bank.bass].reduce((sum, item) => sum + item.data.byteLength, 0) +
    Object.values(bank.drums).reduce((sum, item) => sum + item.byteLength, 0);
  assert(sampleBytes < 10000000);
  for (const [style, preset] of Object.entries(DJ_STYLES)) {
    const beats = [], renderer = new DJRenderer(rate, bank, { style, tempo: preset.tempo, swing: preset.swing, seed: 91 }, b => beats.push(b));
    const left = new Float32Array(256), right = new Float32Array(256);
    let power = 0, difference = 0;
    while (renderer.frame < rate * 5) {
      renderer.render(left, right);
      for (let i = 0; i < left.length; i++) {
        assert(Number.isFinite(left[i]) && Number.isFinite(right[i]));
        assert(Math.abs(left[i]) <= 0.8 && Math.abs(right[i]) <= 0.8);
        power += left[i] ** 2 + right[i] ** 2;
        difference += (left[i] - right[i]) ** 2;
      }
    }
    assert(power > 10 && difference > 0.1);
    assert(renderer.maxVoices < 73 && beats.length > 4);
    for (let i = 1; i < beats.length; i++) assert(Math.abs(beats[i].seconds - beats[i - 1].seconds - 60 / preset.tempo) <= 1.1 / rate);
    renderer.configure({ levels: { piano: 0, bass: 0, drums: 0 } });
    for (let i = 0; i < 100; i++) renderer.render(left, right);
    assert(left.every(v => Math.abs(v) < 1e-9) && right.every(v => Math.abs(v) < 1e-9));
  }
});
