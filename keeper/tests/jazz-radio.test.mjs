import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { EventEmitter } from 'node:events';
import { createJazzRadio } from '../jazz-radio.mjs';
import { djMakeBank } from '../public/jazz-core.mjs';
import { DJ_GENRE_IDS } from '../public/jazz-genres.mjs';
import { JAZZ_DEFAULT_SETTINGS, JAZZ_HOUR } from '../public/jazz-radio-contract.mjs';
import { newIdentity, sign, checkSignature, tickAt } from '../public/core.mjs';

const owner = await newIdentity('jazz_radio_fixture');
const signer = { publicKey: owner.publicKey, sign: record => sign(record, owner.privateKey) };
const bank = djMakeBank(24000), START = Date.parse('2026-11-17T12:00:00Z');
async function until(predicate, message = 'asynchronous radio operation') {
  const deadline = performance.now() + 4000;
  while (!predicate()) { if (performance.now() > deadline) assert.fail('Timed out waiting for ' + message); await new Promise(resolve => setTimeout(resolve, 5)); }
}
const flush = () => new Promise(resolve => setImmediate(resolve));
async function fixture(t, options = {}) {
  const dataDir = await mkdtemp(path.join(tmpdir(), 'doodletick-jazz-radio-'));
  const radios = [], transports = [], monitors = [], encoded = [], voiceCalls = [], worlds = [];
  let time = START, radio;
  const sampleFrame = (target, samples) => { assert(samples instanceof Int16Array); assert.equal(samples.length, 960); target.frames++; target.lastFrame = samples.slice(); for (let index = 0; index < samples.length; index += 16) target.energy += samples[index] ** 2; };
  const transportFactory = invitationOptions => {
    const transport = { invitation: invitationOptions.invitation, frames: 0, energy: 0, stopped: false, callback: null, writable: true,
      async start({ onstate }) { this.callback = onstate; if (options.failStart && transports.length === 1) throw Error('Injected transport failure'); onstate({ phase: 'advertised', advertised: true }); },
      writeFrame(samples) { if (!this.writable) return false; sampleFrame(this, samples); return true; },
      fail() { this.writable = false; this.callback({ phase: 'error', advertised: false, error: 'Injected terminal transport error' }); },
      async stop() { this.stopped = true; }
    }; transports.push(transport); return transport;
  };
  const monitorFactory = async ({ onFailure }) => {
    const monitor = { frames: 0, energy: 0, closed: false, listeners: new Set(),
      writeFrame(samples) { sampleFrame(this, samples); return true; },
      subscribe(res) { this.listeners.add(res); res.on('close', () => this.listeners.delete(res)); return 'listening'; },
      fail: onFailure,
      async close() { this.closed = true; this.listeners.clear(); }
    }; monitors.push(monitor); return monitor;
  };
  async function open(overrides = {}) {
    const world = { closed: false, async brief() { worlds.push(time); return { text: 'Fixture world update.', sourceUrls: [] }; }, close() { this.closed = true; } };
    const voice = { closed: false, async synthesize(text) { voiceCalls.push(text); if (options.voiceFailure) throw Error('Injected optional voice failure'); return { samples: new Int16Array(48000 * 2 * 35).fill(14000), sampleRate: 48000, channels: 2 }; }, status() { return { available: true, busy: false, queued: 0, error: '' }; }, close() { this.closed = true; } };
    radio = await createJazzRadio({ dataDir, signer, enabled: options.enabled !== false, now: () => time,
      transportFactory, monitorFactory, automatic: false, bankFactory: () => bank, world, voice,
      encoder: async samples => { encoded.push(samples.slice()); if (options.encoder) return options.encoder(samples); const bytes = Buffer.alloc(256, encoded.length); bytes.write('ID3'); return bytes; }, ...overrides });
    radios.push(radio); return radio;
  }
  t.after(async () => {
    for (const service of radios) await service.close();
    assert.equal(path.dirname(path.resolve(dataDir)), path.resolve(tmpdir())); assert(path.basename(dataDir).startsWith('doodletick-jazz-radio-'));
    await rm(dataDir, { recursive: true, force: true });
  });
  const advance = seconds => { let frames = Math.round(seconds * 100); while (frames) { const count = Math.min(500, frames); time += count * 10; radio.advance(count); frames -= count; } };
  return { dataDir, open, advance, transports, monitors, encoded, voiceCalls, worlds, at: value => { time = value; }, now: () => time };
}

test('server playback runs without listeners, local listening volume never becomes a station setting, and stop is persistent', async t => {
  const env = await fixture(t), radio = await env.open(); assert.equal(radio.status().running, false); assert.equal(env.transports.length, 0);
  await assert.rejects(radio.dig(randomUUID()), error => error.status === 409);
  await radio.start(); env.advance(2); assert.equal(radio.status().seconds, 2); assert(env.transports[0].energy > 0); assert.equal(env.monitors[0].listeners.size, 0);
  assert.deepEqual(env.transports[0].lastFrame, env.monitors[0].lastFrame);
  await radio.settings({ ...JAZZ_DEFAULT_SETTINGS, localVolume: 0, volume: 0, muted: true });
  assert.deepEqual(radio.status().settings, JAZZ_DEFAULT_SETTINGS); env.advance(1); assert(env.transports[0].lastFrame.some(value => value !== 0));
  const listener = new EventEmitter(); assert.equal(radio.listen(listener), 'listening'); listener.emit('close'); env.advance(1);
  assert.equal(radio.status().running, true); assert.equal(env.transports[0].frames, 400); assert.equal(env.monitors[0].listeners.size, 0);
  await radio.stop(); assert.equal(radio.status().running, false); assert.equal(env.transports[0].stopped, true); assert.equal(env.monitors[0].closed, true);
  env.advance(1); assert.equal(env.transports[0].frames, 400); await radio.close(); const reopened = await env.open();
  assert.equal(reopened.status().running, false); assert.equal(env.transports.length, 1);
});

test('Never stop persists, refuses Stop, shuffles on hourly boundaries and skips missed-hour backlogs', async t => {
  const env = await fixture(t), radio = await env.open(); await radio.neverStop(true);
  assert.equal(radio.status().running, true); assert.equal(radio.status().nextShuffleAt, START + JAZZ_HOUR);
  const initial = radio.status(); await assert.rejects(radio.stop(), error => error.status === 423); assert.equal(radio.status().running, true);
  env.at(START + JAZZ_HOUR - 10); radio.advance(1); assert.equal(radio.status().revision, initial.revision);
  env.at(START + JAZZ_HOUR); radio.advance(1); const shuffled = radio.status();
  assert.equal(shuffled.revision, initial.revision + 1); assert.notDeepEqual(shuffled.settings, initial.settings); assert.equal(shuffled.nextShuffleAt, START + 2 * JAZZ_HOUR);
  env.at(START + 4.5 * JAZZ_HOUR); radio.advance(1); assert.equal(radio.status().revision, shuffled.revision + 1); assert.equal(radio.status().nextShuffleAt, START + 5 * JAZZ_HOUR);
  const link = radio.status().listenerUrl, settings = radio.status().settings; await radio.close(); const reopened = await env.open();
  await until(() => reopened.status().running, 'saved station restart'); assert.equal(reopened.status().neverStop, true); assert.equal(reopened.status().listenerUrl, link); assert.deepEqual(reopened.status().settings, settings);
  assert.equal(reopened.status().nextShuffleAt, START + 5 * JAZZ_HOUR);
  await reopened.neverStop(false); assert.equal(reopened.status().nextShuffleAt, null); await reopened.stop(); assert.equal(reopened.status().running, false);
});

test('a keepsake captures four previous chords and four starting here, signs once, and survives restart and replay', async t => {
  const env = await fixture(t), radio = await env.open(); await radio.start(); env.advance(11);
  assert.equal(radio.status().canDig, true); const current = radio.status().recentChords.at(-1).ordinal, requestId = randomUUID();
  const collecting = await radio.dig(requestId), retry = await radio.dig(requestId); assert.equal(collecting.status, 'collecting'); assert.equal(retry.id, collecting.id);
  assert.equal(radio.status().learning.likes, 0, 'feedback is learned after a durable save');
  env.advance(12); await until(() => radio.status().jobs.some(job => job.requestId === requestId && job.status === 'saved'), 'eight-chord save');
  assert.equal(env.encoded.length, 1); const result = await radio.dig(requestId), receipt = result.receipt;
  assert.equal(result.status, 'saved'); assert.equal(receipt.record.chords.length, 8); assert.deepEqual(receipt.record.chords.map(chord => chord.ordinal), Array.from({ length: 8 }, (_, index) => current - 4 + index));
  assert(receipt.record.chords.every(chord => chord.durationMs > 0)); assert(await checkSignature(receipt.record, receipt.signature, receipt.publicKey));
  const pcm = env.encoded[0]; assert(pcm.length > 48000 * 2 * 8 && pcm.length < 48000 * 2 * 40); assert(pcm.some(value => value !== 0));
  assert.equal(receipt.record.durationMs, Math.round(pcm.length / (48000 * 2) * 1000)); assert.equal(receipt.record.tick.color, tickAt(Date.parse(receipt.record.capturedAt)).color);
  const before = await radio.audio(receipt.record.audio.sha256); await radio.stop(); await radio.close(); const reopened = await env.open();
  assert.equal(reopened.status().running, false); assert.deepEqual((await reopened.dig(requestId)).receipt, receipt); assert.deepEqual(await reopened.audio(receipt.record.audio.sha256), before); assert.equal(reopened.library().count, 1);
  assert.equal(reopened.status().learning.saved, 1, 'loading the same signed keepsake does not count twice');
});

test('saved player voices enter at a bar boundary and survive a failed replacement and restart', async t => {
  const env = await fixture(t);
  let failBuild = false;
  const dotBankFactory = async () => {
    if (failBuild) throw Error('Injected voice bank error');
    return { ...bank };
  };
  const radio = await env.open({ dotBankFactory });
  await radio.settings({ ...JAZZ_DEFAULT_SETTINGS, style: 'bebop', tempo: 120 });
  await radio.start();
  env.advance(0.45);
  const voice = { id: 'fixture-wave', name: 'Test keys', real: Array(128).fill(0),
    imag: Array.from({ length: 128 }, (_, index) => index === 1 ? 0.5 : 0), effects: [] };
  await radio.assignVoice({ part: 'piano', voice });
  assert.equal(radio.status().playerVoices.parts.piano.name, 'Test keys');
  env.advance(0.7);
  assert.equal(radio.status().info.playerVoices.piano, null, 'the second chord is still played with the old bank');
  env.advance(1);
  assert.equal(radio.status().info.playerVoices.piano.name, 'Test keys');
  failBuild = true;
  await assert.rejects(radio.assignVoice({ part: 'piano', voice: null }), /prepare/);
  assert.equal(radio.voices().assignments.piano.name, 'Test keys');
  await radio.stop();
  await radio.close();
  const restored = await env.open({ dotBankFactory });
  assert.equal(restored.voices().assignments.piano.name, 'Test keys');
  await restored.start();
  env.advance(0.1);
  assert(restored.status().running);
  assert.match(restored.status().playerVoices.error, /original trio/);
  assert.equal(restored.status().info.playerVoices.piano, null);
});

test('an older unlearnable naming context does not block later valid feedback at startup', async t => {
  const env = await fixture(t);
  const context = { seed: 1, set: 1, style: 'swing', tempo: 112, swing: 0.64, key: 'C major', bar: 1, chorus: 1,
    phraseRole: 'call', chords: [{ beat: 0, text: 'Cmaj9' }], motif: [60] };
  const history = [{ id: 'a'.repeat(32), context: { ...context, key: 'old unknown key' } }, { id: 'b'.repeat(32), context }];
  const radio = await env.open({ getNamedFeedback: () => history });
  assert.equal(radio.status().learning.named, 1);
  await radio.close();
  const restored = await env.open({ getNamedFeedback: () => history });
  assert.equal(restored.status().learning.named, 1);
});

test('two captures share the bounded eight-chord window and Stop interrupts only unfinished passages', async t => {
  const env = await fixture(t), radio = await env.open(); await radio.start(); env.advance(11);
  const first = await radio.dig(randomUUID()), second = await radio.dig(randomUUID()); assert.notEqual(first.id, second.id);
  await assert.rejects(radio.dig(randomUUID()), error => error.status === 429);
  await radio.stop(); assert(radio.status().jobs.every(job => job.status === 'failed')); assert.equal(radio.library().count, 0); assert.equal(env.encoded.length, 0);
  await radio.start(); env.advance(11); const third = await radio.dig(randomUUID()); env.advance(12);
  await until(() => radio.status().jobs.some(job => job.id === third.id && job.status === 'saved')); assert.equal(radio.library().count, 1);
});

test('voice is optional and is mixed into the cast without becoming part of a keepsake recording', async t => {
  const env = await fixture(t), radio = await env.open(); await radio.settings({ ...JAZZ_DEFAULT_SETTINGS, piano: 0, bass: 0, drums: 0, room: 0 });
  await radio.start(); assert.equal(env.voiceCalls.length, 0); assert.equal(env.worlds.length, 0); await radio.voice(true); await until(() => env.voiceCalls.length === 1); await flush();
  env.advance(11); assert(env.transports[0].lastFrame.some(value => value !== 0)); const job = await radio.dig(randomUUID()); env.advance(12);
  await until(() => radio.status().jobs.some(value => value.id === job.id && value.status === 'saved'));
  assert.equal(env.encoded.length, 1); assert(env.encoded[0].every(value => value === 0), 'keepsake excludes the announcer while all musical instruments are silent');
  await radio.voice(false); env.advance(0.1); assert(env.transports[0].lastFrame.every(value => value === 0)); assert.equal(radio.status().running, true);
});

test('a failed optional voice or terminal transport never silently stops the musical service', async t => {
  const env = await fixture(t, { voiceFailure: true }), radio = await env.open(); await radio.start(); await radio.voice(true); await flush();
  env.advance(1); assert.equal(radio.status().running, true); assert(env.transports[0].energy > 0);
  env.transports[0].fail(); await until(() => !radio.status().running, 'terminal cast failure recovery');
  assert.equal(env.transports[0].stopped, true); await radio.start(); env.advance(0.1); assert.equal(radio.status().running, true); assert.equal(env.transports.length, 2); assert.equal(env.transports[1].frames, 10);
});

test('a failed start releases resources and a retry keeps the same station identity', async t => {
  const env = await fixture(t, { failStart: true }), radio = await env.open(); await assert.rejects(radio.start(), error => error.status === 503);
  assert.equal(radio.status().running, false); assert.equal(env.transports[0].stopped, true); assert.equal(env.monitors[0].closed, true);
  const invitation = env.transports[0].invitation; await radio.start(); assert.equal(radio.status().running, true); assert.deepEqual(env.transports[1].invitation, invitation);
});

test('all shipped genre choices use bounded server settings and straight genres retain a straight pulse', async t => {
  const env = await fixture(t), radio = await env.open();
  for (const style of DJ_GENRE_IDS) { await radio.settings({ ...JAZZ_DEFAULT_SETTINGS, style }); assert.equal(radio.status().settings.style, style); if (['bossa', 'latin', 'funk'].includes(style)) assert.equal(radio.status().settings.swing, 50); }
  await assert.rejects(radio.settings({ ...JAZZ_DEFAULT_SETTINGS, tempo: 0 })); await assert.rejects(radio.settings({ ...JAZZ_DEFAULT_SETTINGS, style: 'unknown' }));
  await radio.start(); env.advance(0.1); const receipt = await radio.receipt(); assert(await checkSignature(receipt.record, receipt.signature, receipt.publicKey)); assert(!Object.hasOwn(receipt.record.settings, 'volume'));
});

test('disabled or corrupt station storage cannot start or overwrite the original station file', async t => {
  const disabledEnv = await fixture(t, { enabled: false }), disabled = await disabledEnv.open(); await assert.rejects(disabled.start(), error => error.status === 503); assert.equal(disabledEnv.transports.length, 0);
  const env = await fixture(t); await mkdir(path.join(env.dataDir, 'jazz-radio')); const filename = path.join(env.dataDir, 'jazz-radio', 'station.json'); await writeFile(filename, '{damaged');
  const radio = await env.open(); assert.match(radio.status().error, /recovery/); await assert.rejects(radio.start(), error => error.status === 503); await assert.rejects(radio.settings(JAZZ_DEFAULT_SETTINGS), error => error.status === 503);
  assert.equal(await readFile(filename, 'utf8'), '{damaged'); assert.equal(env.transports.length, 0);
});
