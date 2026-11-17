import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { JazzVoice, JAZZ_VOICE_MAX_TEXT, JAZZ_VOICE_MAX_SECONDS } from '../jazz-voice.mjs';

const wav = () => { const buffer = Buffer.alloc(48); buffer.write('RIFF', 0); buffer.write('WAVE', 8); return buffer; };
const pcm = () => { const buffer = Buffer.alloc(8); [-32768, 32767, -20, 20].forEach((value, index) => buffer.writeInt16LE(value, index * 2)); return buffer; };
const flush = () => new Promise(resolve => setImmediate(resolve));
function fakeChild() {
  const child = new EventEmitter(); child.stdin = new PassThrough(); child.stdout = new PassThrough(); child.stderr = new PassThrough(); child.killed = false;
  child.kill = signal => { child.killed = signal; child.emit('close', null); return true; };
  return child;
}

test('offline voice stays idle until requested and sends text through stdin with fixed pipe-only conversion', async () => {
  const calls = [], voice = new JazzVoice({ executor: async (command, args, options) => { calls.push({ command, args, options }); return command === 'espeak-ng' ? wav() : pcm(); } });
  assert.equal(calls.length, 0); assert.deepEqual(voice.status(), { available: null, busy: false, queued: 0, error: '' });
  const output = await voice.synthesize('Doodle Jazz; $(untrusted) <voice> is on.');
  assert.deepEqual([...output.samples], [-32768, 32767, -20, 20]); assert.equal(output.sampleRate, 48000); assert.equal(output.channels, 2);
  assert.deepEqual(calls.map(call => call.command), ['espeak-ng', 'ffmpeg']); assert(calls[0].args.includes('--stdin')); assert(calls[0].args.includes('--stdout'));
  assert.equal(calls[0].options.input.toString(), 'Doodle Jazz; $(untrusted) <voice> is on.\n'); assert(!calls[0].args.some(arg => arg.includes('untrusted')));
  const args = calls[1].args; assert.equal(args[args.indexOf('-protocol_whitelist') + 1], 'pipe'); assert.equal(args[args.indexOf('-i') + 1], 'pipe:0'); assert.equal(args.at(-1), 'pipe:1');
  assert.equal(args[args.indexOf('-t') + 1], String(JAZZ_VOICE_MAX_SECONDS)); assert.equal(args[args.indexOf('-ar') + 1], '48000'); assert.equal(args[args.indexOf('-ac') + 1], '2');
  assert.equal(voice.status().available, true); voice.close();
});

test('invalid text, malformed WAV, misaligned PCM and oversized executor output fail closed', async () => {
  let calls = 0; const idle = new JazzVoice({ executor: async () => { calls++; return wav(); } });
  for (const text of ['', null, 42, 'x'.repeat(JAZZ_VOICE_MAX_TEXT + 1), 'ready' + '\n'.repeat(1000)]) assert.equal(await idle.synthesize(text), null);
  assert.equal(calls, 0); idle.close();
  for (const bad of [() => Buffer.from('not a wav'), command => command === 'espeak-ng' ? wav() : Buffer.alloc(3), command => command === 'espeak-ng' ? wav() : Buffer.alloc(48000 * 2 * 2 * 60 + 4)]) {
    const voice = new JazzVoice({ executor: async command => bad(command) }); assert.equal(await voice.synthesize('A short announcement.'), null); assert.equal(voice.status().available, false); voice.close();
  }
});

test('missing local binaries produce a usable status without leaking process text', async () => {
  const voice = new JazzVoice({ executor: async () => { throw Object.assign(Error('private path or diagnostic'), { code: 'ENOENT' }); } });
  assert.equal(await voice.synthesize('Doodle Jazz.'), null); assert.match(voice.status().error, /eSpeak NG and FFmpeg/); assert(!voice.status().error.includes('private')); voice.close();
});

test('announcements run serially with at most two waiting jobs and close cancels all pending work', async () => {
  const calls = []; let release;
  const voice = new JazzVoice({ executor: (command, args, options) => { calls.push({ command, options }); return new Promise(resolve => { release = resolve; }); }, timeoutMs: 5000 });
  const first = voice.synthesize('First.'), second = voice.synthesize('Second.'), third = voice.synthesize('Third.');
  assert.equal(await voice.synthesize('Fourth.'), null); assert.equal(calls.length, 1); assert.equal(voice.status().queued, 2);
  voice.close(); assert.deepEqual(await Promise.all([first, second, third]), [null, null, null]); assert.equal(calls[0].options.signal.aborted, true);
  release(wav()); await flush(); assert.equal(calls.length, 1); assert.equal(await voice.synthesize('Closed.'), null);
});

test('a hung injected executor cannot hold the serial queue indefinitely', async () => {
  const signals = [], voice = new JazzVoice({ executor: (command, args, options) => { signals.push(options.signal); return new Promise(() => {}); }, timeoutMs: 15 });
  assert.deepEqual(await Promise.all([voice.synthesize('First.'), voice.synthesize('Second.')]), [null, null]);
  assert.equal(signals.length, 2); assert(signals.every(signal => signal.aborted)); assert.equal(voice.status().busy, false); voice.close();
});

test('actual process wrapper never uses a shell and kills runaway output and timed-out processes', async () => {
  const children = [], calls = []; const spawnImpl = (command, args, options) => { const child = fakeChild(); children.push(child); calls.push({ command, args, options }); return child; };
  const voice = new JazzVoice({ spawnImpl, timeoutMs: 20 });
  const large = voice.synthesize('A bounded announcement.');
  children[0].stdout.write(Buffer.alloc(4 * 1024 * 1024 + 1)); assert.equal(await large, null); assert.equal(children[0].killed, 'SIGKILL');
  assert.equal(calls[0].options.shell, false); assert.equal(calls[0].options.windowsHide, true); assert.deepEqual(calls[0].options.stdio, ['pipe', 'pipe', 'pipe']);
  const hung = voice.synthesize('A second announcement.'); assert.equal(await hung, null); assert.equal(children[1].killed, 'SIGKILL'); voice.close();
});

test('actual process completion converts WAV into little-endian stereo samples', async () => {
  const spawnImpl = command => { const child = fakeChild(); child.stdin.on('finish', () => { child.stdout.write(command === 'espeak-ng' ? wav() : pcm()); child.emit('close', 0); }); return child; };
  const voice = new JazzVoice({ spawnImpl }); const output = await voice.synthesize('Ready.');
  assert.deepEqual([...output.samples], [-32768, 32767, -20, 20]); assert.equal(voice.status().available, true); voice.close();
});
