// SPDX-License-Identifier: GPL-3.0-only
// Runs inside the built Linux image, with no user data or external services.
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { spawn } from 'node:child_process';
import { DJRenderer, djMakeBank } from '../keeper/public/jazz-core.mjs';
import { createJazzMonitor, encodeJazzClip } from '../keeper/jazz-media.mjs';
import { JazzVoice } from '../keeper/jazz-voice.mjs';

const renderer = new DJRenderer(48000, djMakeBank(24000), { seed: 319, style: 'swing', tempo: 112, swing: 0.64 });
const pcm = new Int16Array(48000 * 2 * 2), left = new Float32Array(480), right = new Float32Array(480);
for (let frame = 0; frame < 200; frame++) {
  renderer.render(left, right);
  for (let i = 0; i < 480; i++) { pcm[frame * 960 + i * 2] = Math.round(left[i] * 32767); pcm[frame * 960 + i * 2 + 1] = Math.round(right[i] * 32767); }
}
assert(pcm.some(sample => Math.abs(sample) > 500), 'Original music must have a nonzero signal.');
const mp3 = await encodeJazzClip(pcm); assert(mp3.length > 10000);
const decoded = await new Promise((resolve, reject) => {
  const child = spawn('ffmpeg', ['-hide_banner','-loglevel','error','-nostdin','-protocol_whitelist','pipe','-f','mp3','-i','pipe:0','-ar','48000','-ac','2','-f','s16le','pipe:1'], {shell:false,stdio:['pipe','pipe','ignore']});
  const chunks = []; let size = 0;
  child.on('error',reject); child.stdin.on('error',reject);
  child.stdout.on('data', chunk => { size += chunk.length; if (size > 2000000) { child.kill(); reject(Error('Decoder exceeded its bound.')); } else chunks.push(chunk); });
  child.on('close', code => code === 0 ? resolve(Buffer.concat(chunks)) : reject(Error('MP3 did not decode.'))); child.stdin.end(mp3);
});
assert(decoded.length >= pcm.byteLength * 0.95 && decoded.length <= pcm.byteLength * 1.1);
let peak = 0; for (let i = 0; i < decoded.length; i += 2) peak = Math.max(peak, Math.abs(decoded.readInt16LE(i)));
assert(peak > 500, 'The recording must decode into audible nonzero PCM.');
const listener = Object.assign(new EventEmitter(), { destroyed:false, writableLength:0, chunks:[], writeHead(code, headers) { assert.equal(code,200); assert.equal(headers['Content-Type'],'audio/mpeg'); }, flushHeaders() {}, write(chunk) { this.chunks.push(Buffer.from(chunk)); return true; }, end() {}, destroy() { this.destroyed = true; this.emit('close'); } });
let monitorFailed = false;
const monitor = await createJazzMonitor({ onFailure: () => { monitorFailed = true; } });
try {
  monitor.subscribe(listener);
  for (let i = 0; i < 200; i++) { monitor.writeFrame(pcm.subarray(i*960,(i+1)*960)); if (i % 20 === 19) await new Promise(resolve=>setTimeout(resolve,10)); }
  for (let i=0; i<50 && Buffer.concat(listener.chunks).length < 10000; i++) await new Promise(resolve=>setTimeout(resolve,20));
  assert(!monitorFailed); assert(Buffer.concat(listener.chunks).length > 10000, 'The ongoing listening stream must emit MP3 frames.');
} finally { await monitor.close(); }
if (!process.argv.includes('--skip-voice')) {
const voice = new JazzVoice();
try {
  const speech = await voice.synthesize('Doodle Jazz is on the air. The Doodle clock color is hexadecimal F F zero zero zero zero.');
  assert(speech, 'Offline eSpeak NG and FFmpeg voice must work.'); assert.equal(speech.sampleRate,48000); assert.equal(speech.channels,2);
  assert(speech.samples.some(sample=>Math.abs(sample)>500)); assert(speech.samples.length <= 48000*2*60);
} finally { voice.close(); }
console.log('Offline voice produced stereo PCM.');
} else console.log('Offline voice check explicitly skipped on this development host. Release CI must run it.');
console.log('Real synthesized music encoded and decoded, and the ongoing local listening stream produced MP3.');
