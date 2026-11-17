// SPDX-License-Identifier: GPL-3.0-only
// Explicit native canary: no public VDO.Ninja connection or hardware capture.
// CI must require both these assertions AND a clean process exit.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createJazzNodeCast, createJazzNodeInvitation, loadJazzNodePlatform } from '../keeper/jazz-node-cast.mjs';

if (!process.argv.includes('--native-child')) {
  // An addon can hang during native teardown after JS has finished. Keep its
  // watchdog in a separate, non-native process so that failure stays bounded.
  const child = spawnSync(process.execPath, [fileURLToPath(import.meta.url), '--native-child'], {
    encoding: 'utf8', timeout: 20000, killSignal: 'SIGKILL', windowsHide: true, maxBuffer: 1024 * 1024
  });
  if (child.stdout) process.stdout.write(child.stdout);
  if (child.stderr) process.stderr.write(child.stderr);
  if (child.error) console.error('Jazz native canary failed:', child.error.code || 'child process error');
  console.log(JSON.stringify({ jazzNativeCanary: child.status === 0 && !child.error ? 'passed' : 'failed',
    cleanExit: child.status === 0 && !child.error, childExitCode: child.status, childSignal: child.signal || null }));
  process.exit(child.status === 0 && !child.error ? 0 : 1);
}

const require = createRequire(new URL('../keeper/jazz-stream-deps/package.json', import.meta.url));
const wrtc = require('@roamhq/wrtc');
assert.equal(require('@roamhq/wrtc/package.json').version, '0.10.0');
assert(Number(process.versions.node.split('.')[0]) >= 24, 'Run the canary on the released Node.js image.');

let seeds = 0;
class LocalSignaling extends EventTarget {
  static OPEN = 1; static CLOSED = 3;
  readyState = 0; bufferedAmount = 0;
  constructor(url) {
    super(); assert.equal(url, 'wss://apibackup.vdo.ninja');
    queueMicrotask(() => { this.readyState = 1; this.onopen?.({}); });
  }
  send(value) { if (JSON.parse(value).request === 'seed') seeds++; }
  close() {
    this.readyState = 3;
    queueMicrotask(() => { this.onclose?.({ code: 1000 }); this.dispatchEvent(new Event('close')); });
  }
}

const deadline = setTimeout(() => { console.error('Jazz native canary exceeded 15 seconds.'); process.exit(1); }, 15000);
deadline.unref();
let track, sink, sourceSink, writer, cast, sender, receiver, frames = 0, decodedSamples = 0, peak = 0, channels = 0;
let stereoSourceSamples = 0, sourcePeak = 0;
const decodedFormats = new Set();
let closing = false, connectionError = null, result;
const platform = await loadJazzNodePlatform({ wrtc, WebSocketImpl: LocalSignaling,
  fetchImpl() { throw new Error('The native canary must not fetch any public URL.'); } });
const createSource = platform.createAudioSource;
platform.createAudioSource = () => {
  const source = createSource();
  return { onData: value => source.onData(value), createTrack() {
    track = source.createTrack(); sourceSink = new wrtc.nonstandard.RTCAudioSink(track);
    sourceSink.ondata = data => {
      assert.equal(data.sampleRate, 48000); assert.equal(data.channelCount, 2); assert.equal(data.samples.length, 960);
      stereoSourceSamples += data.samples.length;
      for (const sample of data.samples) sourcePeak = Math.max(sourcePeak, Math.abs(sample));
    };
    return track;
  } };
};
const stereo = description => ({ type: description.type, sdp: description.sdp.replace(
  /^(a=fmtp:\d+ .*useinbandfec=1[^\r\n]*)/gm, '$1;stereo=1;sprop-stereo=1;maxaveragebitrate=128000') });
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const addCandidates = async (peer, queue) => {
  if (!peer.remoteDescription || closing) return;
  while (queue.length && !closing) await peer.addIceCandidate(queue.shift());
};

try {
  cast = createJazzNodeCast({ invitation: createJazzNodeInvitation(), loadPlatform: async () => platform });
  await cast.start(); assert.equal(cast.status().phase, 'advertised'); assert.equal(seeds, 1);
  sender = new wrtc.RTCPeerConnection({ iceServers: [] });
  receiver = new wrtc.RTCPeerConnection({ iceServers: [] });
  const toSender = [], toReceiver = [];
  sender.onicecandidate = event => {
    if (!event.candidate || closing) return;
    toReceiver.push(event.candidate);
    void addCandidates(receiver, toReceiver).catch(error => { if (!closing) connectionError = error; });
  };
  receiver.onicecandidate = event => {
    if (!event.candidate || closing) return;
    toSender.push(event.candidate);
    void addCandidates(sender, toSender).catch(error => { if (!closing) connectionError = error; });
  };
  receiver.ontrack = event => {
    assert.equal(event.track.kind, 'audio'); assert.equal(sink, undefined);
    sink = new wrtc.nonstandard.RTCAudioSink(event.track);
    sink.ondata = data => {
      decodedFormats.add(data.sampleRate + ':' + data.channelCount);
      channels = data.channelCount;
      decodedSamples += data.samples.length;
      for (const sample of data.samples) peak = Math.max(peak, Math.abs(sample));
    };
  };
  sender.addTrack(track, new wrtc.MediaStream([track]));
  writer = setInterval(() => {
    const samples = new Int16Array(960);
    for (let i = 0; i < 480; i++) {
      const phase = (frames * 480 + i) * 2 * Math.PI * 440 / 48000;
      samples[i * 2] = Math.round(Math.sin(phase) * 6000);
      samples[i * 2 + 1] = Math.round(Math.sin(phase * 1.5) * 5000);
    }
    assert.equal(cast.writeFrame(samples), true); frames++;
  }, 10);
  await sender.setLocalDescription(stereo(await sender.createOffer()));
  await receiver.setRemoteDescription(sender.localDescription);
  await addCandidates(receiver, toReceiver);
  await receiver.setLocalDescription(stereo(await receiver.createAnswer()));
  await sender.setRemoteDescription(receiver.localDescription);
  await addCandidates(sender, toSender);
  let outbound;
  for (let i = 0; i < 100; i++) {
    if (connectionError) throw connectionError;
    const stats = [...(await sender.getStats()).values()];
    outbound = stats.find(row => row.type === 'outbound-rtp' && (row.kind || row.mediaType) === 'audio');
    if (peak > 100 && decodedSamples >= 4800 && outbound?.bytesSent > 0 && outbound?.packetsSent > 0) break;
    await wait(50);
  }
  const diagnostics = JSON.stringify({ sender: sender.connectionState, receiver: receiver.connectionState,
    senderICE: sender.iceConnectionState, receiverICE: receiver.iceConnectionState,
    trackEnabled: track.enabled, trackReadyState: track.readyState, frames, stereoSourceSamples, sourcePeak,
    decodedSamples, peak, decodedFormats: [...decodedFormats], bytesSent: outbound?.bytesSent, packetsSent: outbound?.packetsSent });
  assert(peak > 100, 'The remote Opus sink must decode nonzero audio. ' + diagnostics);
  assert(decodedSamples >= 4800, 'The receiver must decode multiple audio frames.');
  assert(stereoSourceSamples > 0, 'The native source must accept and expose 48 kHz stereo PCM.');
  assert(channels === 1 || channels === 2, 'The remote audio sink must expose decoded program audio.');
  assert(outbound?.bytesSent > 0 && outbound?.packetsSent > 0, 'RTP audio bytes and packets must actually leave the sender.');
  result = { platform: process.platform, arch: process.arch, node: process.versions.node,
    sdkSeeded: true, framesSupplied: frames, stereoSourceSamples, decodedSamples, decodedPeak: peak, decodedChannels: channels,
    decodedFormats: [...decodedFormats],
    bytesSent: outbound.bytesSent, packetsSent: outbound.packetsSent };
} finally {
  closing = true; clearInterval(writer);
  sink?.stop(); sourceSink?.stop(); sender?.close(); receiver?.close();
  await cast?.stop(); platform.dispose();
}
console.log(JSON.stringify({ jazzNativeAudio: 'passed', ...result }));
// Do not force a successful exit: a native teardown crash must fail the CI job.
