import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import path from 'node:path';
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
  assert.equal(calls.length, 0); assert.deepEqual(voice.status(), { available: null, busy: false, queued: 0, error: '', errorCode: null,
    attempts: 0, lastAttemptAt: null, lastSuccessAt: null, currentStage: null });
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

test('failures identify the speech or conversion stage without exposing process diagnostics', async () => {
  for (const [command, prefix, name] of [['espeak-ng', 'SPEECH', 'eSpeak NG'], ['ffmpeg', 'ENCODER', 'FFmpeg']]) {
    for (const [code, suffix] of [['ENOENT', 'NOT_FOUND'], ['EACCES', 'NOT_EXECUTABLE'], ['EPERM', 'NOT_EXECUTABLE'], ['ETIMEDOUT', 'TIMEOUT'], ['UNKNOWN', 'FAILED']]) {
      const voice = new JazzVoice({ executor: async current => {
        if (current === command) throw Object.assign(Error('private path or diagnostic'), { code });
        return wav();
      } });
      try {
        assert.equal(await voice.synthesize('Doodle Jazz.'), null);
        const status = voice.status(); assert.equal(status.errorCode, prefix + '_' + suffix);
        assert(status.error.startsWith(name)); assert(!JSON.stringify(status).includes('private'));
        assert.equal(status.available, false); assert.equal(status.attempts, 1); assert.equal(status.currentStage, null);
      } finally { voice.close(); }
    }
  }
});

test('a later announcement retries a missing tool and successful synthesis clears the failure', async () => {
  let missing = true, clock = 100;
  const voice = new JazzVoice({ now: () => clock, executor: async command => {
    if (missing) throw Object.assign(Error('missing tool'), { code: 'ENOENT' });
    return command === 'espeak-ng' ? wav() : pcm();
  } });
  try {
    assert.equal(await voice.synthesize('First.'), null);
    assert.equal(voice.status().lastAttemptAt, 100); assert.equal(voice.status().lastSuccessAt, null);
    missing = false; clock = 200;
    assert(await voice.synthesize('Second.'));
    assert.deepEqual(voice.status(), { available: true, busy: false, queued: 0, error: '', errorCode: null,
      attempts: 2, lastAttemptAt: 200, lastSuccessAt: 200, currentStage: null });
    missing = true; clock = 300;
    assert.equal(await voice.synthesize('Third.'), null);
    assert.equal(voice.status().available, false); assert.equal(voice.status().lastSuccessAt, 200);
    assert.equal(voice.status().lastAttemptAt, 300); assert.equal(voice.status().attempts, 3);
  } finally { voice.close(); }
});

test('progress reports the current stage and counts actual attempts rather than queued jobs', async () => {
  let releaseSpeech, releaseEncoder, clock = 100;
  const voice = new JazzVoice({ now: () => clock, executor: command => new Promise(resolve => {
    if (command === 'espeak-ng') releaseSpeech = resolve; else releaseEncoder = resolve;
  }) });
  try {
    const first = voice.synthesize('First.'); const second = voice.synthesize('Second.');
    assert.equal(voice.status().currentStage, 'speech'); assert.equal(voice.status().attempts, 1);
    assert.equal(voice.status().queued, 1); assert.equal(voice.status().lastAttemptAt, 100);
    releaseSpeech(wav()); await flush(); assert.equal(voice.status().currentStage, 'encoder');
    clock = 200; releaseEncoder(pcm()); assert(await first);
    assert.equal(voice.status().attempts, 2); assert.equal(voice.status().lastSuccessAt, 200);
    assert.equal(voice.status().currentStage, 'speech');
    voice.close(); assert.equal(await second, null); await flush();
    assert.equal(voice.status().currentStage, null); assert.equal(voice.status().busy, false);
  } finally { voice.close(); }
});

test('invalid diagnostic clocks cannot strand announcements', async () => {
  const voice = new JazzVoice({ now: () => { throw Error('invalid test clock'); }, executor: async command => command === 'espeak-ng' ? wav() : pcm() });
  try { assert(await voice.synthesize('Ready.')); assert.equal(voice.status().lastAttemptAt, null); assert.equal(voice.status().lastSuccessAt, null); }
  finally { voice.close(); }
});

test('Linux resolves only fixed installed paths after missing PATH commands', async () => {
  const calls = [];
  const voice = new JazzVoice({ platform: 'linux', spawnImpl: (command, args, options) => {
    calls.push({ command, args, options });
    const child = fakeChild();
    if (!command.startsWith('/usr/bin/')) process.nextTick(() => child.emit('error', Object.assign(Error('missing on PATH'), { code: 'ENOENT' })));
    else child.stdin.on('finish', () => { child.stdout.write(command.endsWith('espeak-ng') ? wav() : pcm()); child.emit('close', 0); });
    return child;
  } });
  try {
    assert(await voice.synthesize('A safe announcement.'));
    assert.deepEqual(calls.map(call => call.command), ['espeak-ng', '/usr/bin/espeak-ng', 'ffmpeg', '/usr/bin/ffmpeg']);
    assert.deepEqual(calls[0].args, calls[1].args); assert.deepEqual(calls[2].args, calls[3].args);
    assert(calls.every(call => call.options.shell === false && call.options.windowsHide === true));
  } finally { voice.close(); }
});

test('Windows missing speech checks only official install roots and does not guess an FFmpeg path', async () => {
  const calls = [], missing = Object.assign(Error('missing on PATH'), { code: 'ENOENT' });
  const voice = new JazzVoice({ platform: 'win32', spawnImpl: command => { calls.push(command); throw missing; } });
  try {
    assert.equal(await voice.synthesize('Ready.'), null);
    const expected = ['espeak-ng', ...[process.env.ProgramFiles || 'C:\\Program Files', process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)']
      .filter(root => /^[a-z]:\\/i.test(root) && !root.split(/[\\/]/).includes('..')).map(root => path.win32.join(root, 'eSpeak NG', 'espeak-ng.exe'))];
    assert.deepEqual(calls, [...new Set(expected)]); assert.equal(voice.status().errorCode, 'SPEECH_NOT_FOUND');
  } finally { voice.close(); }
  const encoderCalls = [], encoder = new JazzVoice({ platform: 'win32', spawnImpl: command => {
    encoderCalls.push(command); if (command === 'ffmpeg') throw missing;
    const child = fakeChild(); child.stdin.on('finish', () => { child.stdout.write(wav()); child.emit('close', 0); }); return child;
  } });
  try { assert.equal(await encoder.synthesize('Ready.'), null); assert.deepEqual(encoderCalls, ['espeak-ng', 'ffmpeg']); assert.equal(encoder.status().errorCode, 'ENCODER_NOT_FOUND'); }
  finally { encoder.close(); }
});

test('installed tools with permission or runtime failures do not fall through to another executable', async () => {
  for (const code of ['EACCES', 'EPERM', 'ETIMEDOUT', 'UNKNOWN']) {
    const calls = [], voice = new JazzVoice({ platform: 'linux', spawnImpl: command => { calls.push(command); throw Object.assign(Error('private process failure'), { code }); } });
    try { assert.equal(await voice.synthesize('Ready.'), null); assert.deepEqual(calls, ['espeak-ng']); }
    finally { voice.close(); }
  }
});

test('closing during a missing-command failure prevents fallback processes from starting', async () => {
  const calls = []; let child;
  const voice = new JazzVoice({ platform: 'linux', spawnImpl: command => { calls.push(command); child = fakeChild(); return child; } });
  const pending = voice.synthesize('Ready.');
  child.emit('error', Object.assign(Error('missing command'), { code: 'ENOENT' })); voice.close();
  assert.equal(await pending, null); await flush(); assert.deepEqual(calls, ['espeak-ng']); assert.equal(voice.status().error, '');
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
