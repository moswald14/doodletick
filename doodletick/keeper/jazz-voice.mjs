// Copyright © 2026 moswald14 and contributors. GPL-3.0-only.
import { spawn } from 'node:child_process';

export const JAZZ_VOICE_MAX_TEXT = 900;
export const JAZZ_VOICE_MAX_SECONDS = 60;
export const JAZZ_VOICE_SAMPLE_RATE = 48000;
export const JAZZ_VOICE_CHANNELS = 2;
const MAX_PCM_BYTES = JAZZ_VOICE_SAMPLE_RATE * JAZZ_VOICE_CHANNELS * 2 * JAZZ_VOICE_MAX_SECONDS;
const MAX_WAV_BYTES = 4 * 1024 * 1024, MAX_QUEUE = 2;
const SPEECH_ARGS = Object.freeze(['--stdin', '--stdout', '-v', 'en-us', '-s', '165', '-p', '42', '-a', '100']);
const PCM_ARGS = Object.freeze(['-hide_banner', '-loglevel', 'error', '-nostdin', '-threads', '1', '-protocol_whitelist', 'pipe', '-f', 'wav', '-i', 'pipe:0', '-vn', '-sn', '-dn', '-acodec', 'pcm_s16le', '-ar', '48000', '-ac', '2', '-t', '60', '-f', 's16le', 'pipe:1']);

function runBoundedProcess(command, args, { input, maxOutputBytes, timeoutMs, signal, spawnImpl = spawn }) {
  return new Promise((resolve, reject) => {
    if (signal.aborted) { reject(Error('Voice cancelled.')); return; }
    let child, timer, finished = false, bytes = 0, stderrBytes = 0; const chunks = [];
    const finish = (error, output) => {
      if (finished) return; finished = true; clearTimeout(timer); signal.removeEventListener('abort', abort);
      if (error) { child?.kill('SIGKILL'); reject(error); } else resolve(output);
    };
    const abort = () => finish(Error('Voice cancelled.'));
    try { child = spawnImpl(command, [...args], { shell: false, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] }); }
    catch (error) { finish(error); return; }
    child.on('error', error => finish(error));
    child.stdin.on('error', error => finish(error));
    child.stdout.on('error', error => finish(error));
    child.stderr.on('error', error => finish(error));
    child.stdout.on('data', chunk => { if (finished) return; bytes += chunk.length; if (bytes > maxOutputBytes) finish(Error('Voice output too large.')); else chunks.push(chunk); });
    child.stderr.on('data', chunk => { stderrBytes += chunk.length; if (stderrBytes > 8192) finish(Error('Voice diagnostics too large.')); });
    child.on('close', code => { if (finished) return; if (code === 0) finish(null, Buffer.concat(chunks, bytes)); else finish(Error('The local voice process failed.')); });
    signal.addEventListener('abort', abort, { once: true });
    timer = setTimeout(() => finish(Error('Voice synthesis timed out.')), timeoutMs);
    try { child.stdin.end(input); } catch (error) { finish(error); }
  });
}

/** Offline English announcer. Creation and status() never spawn a process.
 * The engine controls opt-in, fixed announcement text and the music ducking.
 * Executor injection is for tests; executable names and arguments are not user
 * options. No shell, files, URLs, API keys or browser speech engine are used.
 */
export class JazzVoice {
  constructor({ executor, spawnImpl = spawn, timeoutMs = 12000 } = {}) {
    if ((executor !== undefined && typeof executor !== 'function') || typeof spawnImpl !== 'function' || !Number.isFinite(timeoutMs) || timeoutMs < 1 || timeoutMs > 30000) throw Error('Invalid voice options.');
    this.executor = executor || ((command, args, options) => runBoundedProcess(command, args, { ...options, spawnImpl }));
    this.timeoutMs = timeoutMs; this.queue = []; this.current = null; this.closed = false; this.available = null; this.error = '';
  }
  status() { return { available: this.available, busy: this.current !== null, queued: this.queue.length, error: this.error }; }
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
        new Promise((_, reject) => { timer = setTimeout(() => reject(Error('Voice synthesis timed out.')), this.timeoutMs); }),
        new Promise((_, reject) => { onAbort = () => reject(Error('Voice cancelled.')); if (signal.aborted) onAbort(); else signal.addEventListener('abort', onAbort, { once: true }); })
      ]);
      if (!Buffer.isBuffer(output) || output.length > maxOutputBytes) throw Error('Invalid voice output.');
      return output;
    } finally { clearTimeout(timer); if (onAbort) signal.removeEventListener('abort', onAbort); }
  }
  async drain() {
    if (this.current || this.closed || !this.queue.length) return;
    const job = this.queue.shift(), controller = new AbortController(); this.current = controller; let result = null;
    try {
      const wav = await this.stage('espeak-ng', SPEECH_ARGS, Buffer.from(job.text + '\n', 'utf8'), MAX_WAV_BYTES, controller.signal);
      if (wav.length < 44 || wav.toString('ascii', 0, 4) !== 'RIFF' || wav.toString('ascii', 8, 12) !== 'WAVE') throw Error('Invalid speech WAV.');
      const pcm = await this.stage('ffmpeg', PCM_ARGS, wav, MAX_PCM_BYTES, controller.signal);
      if (!pcm.length || pcm.length % 4) throw Error('Invalid stereo speech PCM.');
      const samples = new Int16Array(pcm.length / 2);
      for (let index = 0; index < samples.length; index++) samples[index] = pcm.readInt16LE(index * 2);
      if (!this.closed) { result = { samples, sampleRate: JAZZ_VOICE_SAMPLE_RATE, channels: JAZZ_VOICE_CHANNELS }; this.available = true; this.error = ''; }
    } catch (error) {
      if (!this.closed) { this.available = false; this.error = error?.code === 'ENOENT' ? 'Offline voice needs eSpeak NG and FFmpeg installed on this Keeper.' : 'The offline voice could not complete this announcement.'; }
    } finally {
      controller.abort(); this.current = null; job.resolve(result); this.drain();
    }
  }
  close() { this.closed = true; this.current?.abort(); for (const job of this.queue.splice(0)) job.resolve(null); }
}
