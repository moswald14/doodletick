// SPDX-License-Identifier: GPL-3.0-only
// Runs inside the built Linux image, with no user data or external services.
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { spawn } from 'node:child_process';
import { DJRenderer, djMakeBank } from '../keeper/public/jazz-core.mjs';
import { createJazzMonitor, encodeJazzClip } from '../keeper/jazz-media.mjs';
import { JazzVoice } from '../keeper/jazz-voice.mjs';
import { JAZZ_CLIP_MAX_SECONDS } from '../keeper/public/jazz-radio-contract.mjs';

async function decodeClip(mp3, maxPcmBytes) {
  const child = spawn('ffmpeg', ['-hide_banner','-loglevel','error','-nostdin','-protocol_whitelist','pipe','-f','mp3','-i','pipe:0','-ar','48000','-ac','2','-f','s16le','pipe:1'], {shell:false,windowsHide:true,stdio:['pipe','pipe','ignore']});
  return new Promise((resolve,reject) => {
    const chunks = []; let size = 0, settled = false;
    const finish = (failure,value) => {
      if (settled) return; settled = true; clearTimeout(timer); child.stdin.destroy();
      if (failure) { child.kill('SIGKILL'); reject(failure); } else resolve(value);
    };
    const timer = setTimeout(() => finish(Error('MP3 decoder exceeded its time limit.')),12000);
    child.on('error',() => finish(Error('MP3 decoder is unavailable.'))); child.stdin.on('error',() => finish(Error('MP3 decoder input failed.')));
    child.stdout.on('error',() => finish(Error('MP3 decoder output failed.')));
    child.stdout.on('data',chunk => { size += chunk.length; if (size > maxPcmBytes) finish(Error('Decoder exceeded its audio bound.')); else chunks.push(chunk); });
    child.on('close',code => code === 0 ? finish(null,Buffer.concat(chunks,size)) : finish(Error('MP3 did not decode.')));
    child.stdin.end(mp3);
  });
}
function peakOf(data) { let peak = 0; for (let i = 0; i < data.length; i += 2) peak = Math.max(peak,Math.abs(data.readInt16LE(i))); return peak; }

const bank = djMakeBank(24000), renderer = new DJRenderer(48000, bank, { seed: 319, style: 'swing', tempo: 112, swing: 0.64 });
const pcm = new Int16Array(48000 * 2 * 2), left = new Float32Array(480), right = new Float32Array(480);
for (let frame = 0; frame < 200; frame++) {
  renderer.render(left, right);
  for (let i = 0; i < 480; i++) { pcm[frame * 960 + i * 2] = Math.round(left[i] * 32767); pcm[frame * 960 + i * 2 + 1] = Math.round(right[i] * 32767); }
}
assert(pcm.some(sample => Math.abs(sample) > 500), 'Original music must have a nonzero signal.');
const mp3 = await encodeJazzClip(pcm); assert(mp3.length > 10000);
const decoded = await decodeClip(mp3,2000000);
assert(decoded.length >= pcm.byteLength * 0.95 && decoded.length <= pcm.byteLength * 1.1);
assert(peakOf(decoded) > 500, 'The recording must decode into audible nonzero PCM.');

// A slow seven-beat modal bar has one chord. Eight such chords are the longest
// permitted keepsake: 8 * 7 * 60 / 55 = approximately 61.1 seconds.
const longestSeconds = 8 * 7 * 60 / 55, longestFrames = Math.ceil(longestSeconds * 48000);
assert(longestSeconds < JAZZ_CLIP_MAX_SECONDS); assert(longestSeconds > 61 && longestSeconds < 62);
const longestPcm = new Int16Array(longestFrames * 2), chordIndices = new Set();
const longestRenderer = new DJRenderer(48000, bank, { seed:319,style:'modal',tempo:55,swing:.56,beatsPerBar:7 }, info => {
  if (info.seconds < longestSeconds && Number.isInteger(info.chordIndex)) chordIndices.add(info.chordIndex);
});
for (let at = 0; at < longestFrames; at += 480) {
  longestRenderer.render(left,right);
  for (let i = 0; i < Math.min(480,longestFrames-at); i++) { longestPcm[(at+i)*2] = Math.round(left[i]*32767); longestPcm[(at+i)*2+1] = Math.round(right[i]*32767); }
}
assert.equal(chordIndices.size,8); assert(longestPcm.some(sample => Math.abs(sample) > 500));
const encodeStarted = performance.now(), longestMp3 = await encodeJazzClip(longestPcm), encodeMs = Math.round(performance.now()-encodeStarted);
assert(longestMp3.length < 1048576 && longestMp3.length > 900000, 'The longest 128 kbps keepsake must fit below one MiB.');
const longestDecoded = await decodeClip(longestMp3,Math.ceil((JAZZ_CLIP_MAX_SECONDS+.1)*48000)*4);
assert.equal(longestDecoded.length%4,0); assert(Math.abs(longestDecoded.length/(48000*4)-longestSeconds) < .1);
assert(peakOf(longestDecoded) > 500,'The longest keepsake must decode into nonzero stereo PCM.');
console.log(`Eight slow seven-beat modal chords encoded in ${encodeMs} ms: ${longestSeconds.toFixed(3)} seconds, ${longestMp3.length} MP3 bytes, with a bounded nonzero decode.`);
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
  const verifySpeech = async (voice, text, expectedAttempts) => {
    const speech = await voice.synthesize(text);
    assert(speech, 'Offline voice must work: ' + voice.status().error); assert.equal(speech.sampleRate,48000); assert.equal(speech.channels,2);
    assert(speech.samples.some(sample=>Math.abs(sample)>500)); assert(speech.samples.length <= 48000*2*60);
    const status = voice.status(); assert.equal(status.available,true); assert.equal(status.error,''); assert.equal(status.errorCode,null);
    assert.equal(status.attempts,expectedAttempts); assert.equal(status.currentStage,null); assert.equal(status.busy,false);
    assert(Number.isSafeInteger(status.lastAttemptAt) && status.lastAttemptAt > 0);
    assert(Number.isSafeInteger(status.lastSuccessAt) && status.lastSuccessAt >= status.lastAttemptAt);
    return status;
  };
  const voice = new JazzVoice();
  try {
    assert.equal(voice.status().lastSuccessAt,null); assert.equal(voice.status().attempts,0);
    const first = await verifySpeech(voice, 'Doodle Jazz is on the air. The Doodle clock color is hexadecimal F F zero zero zero zero.', 1);
    const second = await verifySpeech(voice, 'This is the Doodle Jazz voice check.', 2);
    assert(second.lastSuccessAt >= first.lastSuccessAt);
  } finally { voice.close(); }
  console.log('Offline voice produced nonzero stereo PCM on two announcements and recorded synthesis success.');
  if (process.platform === 'linux') {
    // The release image installs both tools in /usr/bin. Verify that a restricted
    // service PATH still recovers using only these fixed packaged locations.
    const commands = [], fallback = new JazzVoice({ spawnImpl: (command,args,options) => {
      commands.push(command);
      return spawn(command,args,{...options,env:{...process.env,PATH:'/__keeper_jazz_voice_canary_missing_path__'}});
    } });
    try {
      await verifySpeech(fallback, 'The packaged offline voice works with a restricted service path.', 1);
      assert.deepEqual(commands,['espeak-ng','/usr/bin/espeak-ng','ffmpeg','/usr/bin/ffmpeg']);
    } finally { fallback.close(); }
    console.log('Linux packaged voice recovered through fixed installed paths with no PATH lookup available.');
  }
} else console.log('Offline voice check explicitly skipped on this development host. Release CI must run it.');
console.log('Real synthesized music encoded and decoded, and the ongoing local listening stream produced MP3.');
