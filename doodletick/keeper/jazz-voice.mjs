// Copyright © 2026 moswald14 and contributors. GPL-3.0-only.
import { spawn } from 'node:child_process';
import path from 'node:path';

export const JAZZ_VOICE_MAX_TEXT = 900;
export const JAZZ_VOICE_MAX_SECONDS = 60;
export const JAZZ_VOICE_SAMPLE_RATE = 48000;
export const JAZZ_VOICE_CHANNELS = 2;
const MAX_PCM_BYTES = JAZZ_VOICE_SAMPLE_RATE * JAZZ_VOICE_CHANNELS * 2 * JAZZ_VOICE_MAX_SECONDS;
const MAX_WAV_BYTES = 4 * 1024 * 1024, MAX_QUEUE = 2;
const SPEECH_ARGS = Object.freeze(['--stdin', '--stdout', '-v', 'en-us', '-s', '165', '-p', '42', '-a', '100']);
const PCM_ARGS = Object.freeze(['-hide_banner', '-loglevel', 'error', '-nostdin', '-threads', '1', '-protocol_whitelist', 'pipe', '-f', 'wav', '-i', 'pipe:0', '-vn', '-sn', '-dn', '-acodec', 'pcm_s16le', '-ar', '48000', '-ac', '2', '-t', '60', '-f', 's16le', 'pipe:1']);
const failure = (code, message) => Object.assign(Error(message), { code });

function executables(command, platform) {
  if (!['espeak-ng', 'ffmpeg'].includes(command)) throw Error('Invalid voice tool.');
  const candidates = [command];
  if (platform === 'linux') candidates.push('/usr/bin/' + command);
  if (platform === 'win32' && command === 'espeak-ng') {
    // Official MSI install roots only. Do not scan user folders, the registry or
    // accept an executable/argument path from an announcement or HTTP request.
    for (const root of [process.env.ProgramFiles || 'C:\\Program Files', process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)']) {
      if (/^[a-z]:\\/i.test(root) && !root.split(/[\\/]/).includes('..')) candidates.push(path.win32.join(root, 'eSpeak NG', 'espeak-ng.exe'));
    }
  }
  return [...new Set(candidates)];
}

async function runVoiceTool(command, args, options, platform) {
  let missing;
  for (const candidate of executables(command, platform)) {
    try { return await runBoundedProcess(candidate, args, options); }
    catch (error) { if (error?.code !== 'ENOENT') throw error; missing = error; }
  }
  throw missing;
}

function diagnostic(error, stage) {
  const speech = stage === 'speech', name = speech ? 'eSpeak NG' : 'FFmpeg', prefix = speech ? 'SPEECH' : 'ENCODER';
  if (error?.code === 'ENOENT') return { code: prefix + '_NOT_FOUND',
    message: name + ' was not found by this Keeper. Install it on the host and restart Keeper, then test voice again. In Home Assistant, update or rebuild the app.' };
  if (['EACCES', 'EPERM'].includes(error?.code)) return { code: prefix + '_NOT_EXECUTABLE',
    message: name + ' is installed but this Keeper cannot start it. Check its permissions or reinstall the Keeper audio tools, then test voice again.' };
  if (error?.code === 'ETIMEDOUT') return { code: prefix + '_TIMEOUT', message: name + ' took too long to finish this announcement. Test voice again; music can continue without voice.' };
  if (error?.code === 'VOICE_INVALID_AUDIO') return { code: prefix + '_INVALID_AUDIO', message: name + ' returned unusable speech audio. Reinstall the Keeper audio tools, then test voice again.' };
  return { code: prefix + '_FAILED', message: speech ? 'eSpeak NG could not make this announcement. Check its English voice data or reinstall the Keeper audio tools, then test voice again.' : 'FFmpeg could not convert this announcement. Reinstall the Keeper audio tools, then test voice again.' };
}

function runBoundedProcess(command, args, { input, maxOutputBytes, timeoutMs, signal, spawnImpl = spawn }) {
  return new Promise((resolve, reject) => {
    if (signal.aborted) { reject(failure('ABORT_ERR', 'Voice cancelled.')); return; }
    let child, timer, finished = false, bytes = 0, stderrBytes = 0; const chunks = [];
    const finish = (error, output) => {
      if (finished) return; finished = true; clearTimeout(timer); signal.removeEventListener('abort', abort);
      if (error) { child?.kill('SIGKILL'); reject(error); } else resolve(output);
    };
    const abort = () => finish(failure('ABORT_ERR', 'Voice cancelled.'));
    try { child = spawnImpl(command, [...args], { shell: false, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] }); }
    catch (error) { finish(error); return; }
    child.on('error', error => finish(error));
    child.stdin.on('error', error => finish(error));
    child.stdout.on('error', error => finish(error));
    child.stderr.on('error', error => finish(error));
    child.stdout.on('data', chunk => { if (finished) return; bytes += chunk.length; if (bytes > maxOutputBytes) finish(Error('Voice output too large.')); else chunks.push(chunk); });
    child.stderr.on('data', chunk => { stderrBytes += chunk.length; if (stderrBytes > 8192) finish(Error('Voice diagnostics too large.')); });
    child.on('close', code => { if (finished) return; if (code === 0) finish(null, Buffer.concat(chunks, bytes)); else finish(failure('VOICE_PROCESS_FAILED', 'The local voice process failed.')); });
    signal.addEventListener('abort', abort, { once: true });
    timer = setTimeout(() => finish(failure('ETIMEDOUT', 'Voice synthesis timed out.')), timeoutMs);
    try { child.stdin.end(input); } catch (error) { finish(error); }
  });
}

/** Offline English announcer. Creation and status() never spawn a process.
 * The engine controls opt-in, fixed announcement text and the music ducking.
 * Executor injection is for tests; executable names and arguments are not user
 * options. No shell, files, URLs, API keys or browser speech engine are used.
 */
export class JazzVoice {
  constructor({ executor, spawnImpl = spawn, timeoutMs = 12000, platform = process.platform, now = Date.now } = {}) {
    if ((executor !== undefined && typeof executor !== 'function') || typeof spawnImpl !== 'function' || typeof now !== 'function' || typeof platform !== 'string' || !Number.isFinite(timeoutMs) || timeoutMs < 1 || timeoutMs > 30000) throw Error('Invalid voice options.');
    this.executor = executor || ((command, args, options) => runVoiceTool(command, args, { ...options, spawnImpl }, platform));
    this.timeoutMs = timeoutMs; this.queue = []; this.current = null; this.closed = false; this.available = null; this.error = '';
    this.now = now; this.attempts = 0; this.lastAttemptAt = null; this.lastSuccessAt = null; this.currentStage = null; this.errorCode = null;
  }
  // Success means stereo PCM was synthesized, not that a listener heard it.
  status() { return { available: this.available, busy: this.current !== null, queued: this.queue.length, error: this.error,
    errorCode: this.errorCode, attempts: this.attempts, lastAttemptAt: this.lastAttemptAt, lastSuccessAt: this.lastSuccessAt, currentStage: this.currentStage }; }
  timestamp() { try { const value = this.now(); return Number.isSafeInteger(value) && value >= 0 ? value : null; } catch { return null; } }
  synthesize(value) {
    // Newlines/control and bidi markers cannot alter spoken control messages.
    if (this.closed || typeof value !== 'string' || value.length > JAZZ_VOICE_MAX_TEXT || this.queue.length >= MAX_QUEUE) return Promise.resolve(null);
    const text = value.replace(/[\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069]/g, ' ').replace(/\s+/g, ' ').trim();
    if (!text) return Promise.resolve(null);
    return new Promise(resolve => { this.queue.push({ text, resolve }); this.drain(); });
  }
  async stage(command, args, input, maxOutputBytes, signal) {
    let timer, onAbort;
    try {
      const output = await Promise.race([
        this.executor(command, [...args], { input, maxOutputBytes, timeoutMs: this.timeoutMs, signal }),
        new Promise((_, reject) => { timer = setTimeout(() => reject(failure('ETIMEDOUT', 'Voice synthesis timed out.')), this.timeoutMs); }),
        new Promise((_, reject) => { onAbort = () => reject(failure('ABORT_ERR', 'Voice cancelled.')); if (signal.aborted) onAbort(); else signal.addEventListener('abort', onAbort, { once: true }); })
      ]);
      if (!Buffer.isBuffer(output) || output.length > maxOutputBytes) throw failure('VOICE_INVALID_AUDIO', 'Invalid voice output.');
      return output;
    } finally { clearTimeout(timer); if (onAbort) signal.removeEventListener('abort', onAbort); }
  }
  async drain() {
    if (this.current || this.closed || !this.queue.length) return;
    const job = this.queue.shift(), controller = new AbortController(); this.current = controller; let result = null;
    this.attempts++; this.lastAttemptAt = this.timestamp(); this.currentStage = 'speech';
    try {
      const wav = await this.stage('espeak-ng', SPEECH_ARGS, Buffer.from(job.text + '\n', 'utf8'), MAX_WAV_BYTES, controller.signal);
      if (wav.length < 44 || wav.toString('ascii', 0, 4) !== 'RIFF' || wav.toString('ascii', 8, 12) !== 'WAVE') throw failure('VOICE_INVALID_AUDIO', 'Invalid speech WAV.');
      this.currentStage = 'encoder';
      const pcm = await this.stage('ffmpeg', PCM_ARGS, wav, MAX_PCM_BYTES, controller.signal);
      if (!pcm.length || pcm.length % 4) throw failure('VOICE_INVALID_AUDIO', 'Invalid stereo speech PCM.');
      const samples = new Int16Array(pcm.length / 2);
      for (let index = 0; index < samples.length; index++) samples[index] = pcm.readInt16LE(index * 2);
      if (!this.closed) { result = { samples, sampleRate: JAZZ_VOICE_SAMPLE_RATE, channels: JAZZ_VOICE_CHANNELS }; this.available = true; this.error = ''; this.errorCode = null; this.lastSuccessAt = this.timestamp(); }
    } catch (error) {
      if (!this.closed) { const info = diagnostic(error, this.currentStage); this.available = false; this.error = info.message; this.errorCode = info.code; }
    } finally {
      controller.abort(); this.current = null; this.currentStage = null; job.resolve(result); this.drain();
    }
  }
  close() { this.closed = true; this.current?.abort(); for (const job of this.queue.splice(0)) job.resolve(null); }
}
