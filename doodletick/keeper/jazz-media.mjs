// SPDX-License-Identifier: GPL-3.0-only
import { spawn } from 'node:child_process';

const inputArgs = ['-hide_banner', '-loglevel', 'error', '-nostdin', '-protocol_whitelist', 'pipe', '-probesize', '64', '-analyzeduration', '1000', '-f', 's16le', '-ar', '48000', '-ac', '2', '-i', 'pipe:0'];
const outputArgs = ['-map', '0:a:0', '-codec:a', 'libmp3lame', '-b:a', '128k', '-write_xing', '0', '-flush_packets', '1', '-f', 'mp3', 'pipe:1'];
const pcmBuffer = samples => Buffer.from(samples.buffer, samples.byteOffset, samples.byteLength);

// The encoder accepts only in-memory PCM. No URL, shell, microphone or file input.
export async function createJazzMonitor({ spawnImpl = spawn, onFailure = () => {} } = {}) {
  const child = spawnImpl('ffmpeg', [...inputArgs, ...outputArgs], { stdio: ['pipe', 'pipe', 'ignore'], windowsHide: true, shell: false });
  const listeners = new Set(); let closed = false, ready = false;
  const fail = () => { if (!closed) { closed = true; for (const res of listeners) res.destroy(); listeners.clear(); child.kill(); onFailure(); } };
  await new Promise((resolve, reject) => {
    child.once('spawn', () => { ready = true; resolve(); });
    child.once('error', () => { reject(new Error('The server audio encoder is unavailable.')); fail(); });
  });
  child.on('error', fail); child.stdin.on('error', fail);
  child.on('exit', () => { if (ready) fail(); });
  child.stdout.on('data', chunk => {
    for (const res of listeners) {
      if (res.destroyed || res.writableLength > 262144) { res.destroy(); listeners.delete(res); }
      else res.write(chunk);
    }
  });
  return {
    writeFrame(samples) {
      if (closed || child.stdin.writableLength > 524288) { fail(); return false; }
      return child.stdin.write(pcmBuffer(samples));
    },
    subscribe(res) {
      if (closed) throw Object.assign(new Error('Start the broadcast before listening.'), { status: 409 });
      if (listeners.size >= 6) throw Object.assign(new Error('Six local listeners are already connected. Use the casting link for more listeners.'), { status: 429 });
      res.writeHead(200, { 'Content-Type': 'audio/mpeg', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'X-Accel-Buffering': 'no' });
      res.flushHeaders?.(); listeners.add(res); res.on('close', () => listeners.delete(res));
    },
    async close() {
      if (closed) return; closed = true;
      for (const res of listeners) res.end(); listeners.clear(); child.stdin.destroy(); child.kill();
      await new Promise(resolve => { const timer = setTimeout(() => { child.kill('SIGKILL'); resolve(); }, 1500); timer.unref(); child.once('exit', () => { clearTimeout(timer); resolve(); }); if (child.exitCode !== null) { clearTimeout(timer); resolve(); } });
    }
  };
}

export async function encodeJazzClip(samples, { spawnImpl = spawn, timeoutMs = 12000 } = {}) {
  if (!(samples instanceof Int16Array) || samples.length < 960 || samples.length > 48000 * 2 * 40 || samples.length % 2) throw new Error('The eight-chord audio is outside its recording limit.');
  const child = spawnImpl('ffmpeg', [...inputArgs, ...outputArgs], { stdio: ['pipe', 'pipe', 'ignore'], windowsHide: true, shell: false });
  return new Promise((resolve, reject) => {
    const chunks = []; let bytes = 0, settled = false;
    const finish = (error, value) => { if (settled) return; settled = true; clearTimeout(timer); child.stdin.destroy(); if (error) { child.kill('SIGKILL'); reject(error); } else resolve(value); };
    const timer = setTimeout(() => finish(new Error('The chord recording encoder timed out.')), timeoutMs);
    child.on('error', () => finish(new Error('The chord recording encoder is unavailable.')));
    child.stdin.on('error', () => finish(new Error('The chord recording could not be encoded.')));
    child.stdout.on('data', chunk => { bytes += chunk.length; if (bytes > 1048576) finish(new Error('The chord recording exceeded its size limit.')); else chunks.push(chunk); });
    child.on('close', code => { if (code !== 0 || bytes < 128) finish(new Error('The chord recording could not be encoded.')); else finish(null, Buffer.concat(chunks)); });
    child.stdin.end(pcmBuffer(samples));
  });
}
