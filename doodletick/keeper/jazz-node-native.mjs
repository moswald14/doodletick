// SPDX-License-Identifier: GPL-3.0-only
// Dedicated audio-only child. No Keeper server, signer, ledger or data path is loaded.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createJazzDirectNodeCast, loadJazzNodePlatform, validateJazzNodeInvitation } from './jazz-node-cast.mjs';

if (!process.argv.includes('--jazz-native-worker') || !process.send) throw new Error('This module requires its private radio IPC parent.');
const canary = process.argv.includes('--canary');
let cast = null, probe = null, started = false, stopping = false, lastSequence = 0;
const send = message => {
  if (!process.connected) return;
  try { process.send(message, () => {}); } catch {}
};
const heartbeat = setInterval(() => send({ type: 'heartbeat' }), 1000);

async function canaryPlatform() {
  const require = createRequire(new URL('./jazz-stream-deps/package.json', import.meta.url));
  const wrtc = require('@roamhq/wrtc');
  assert.equal(require('@roamhq/wrtc/package.json').version, '0.10.0');
  let seeds = 0, track, sourceSink, sink, sender, receiver, closing = false, connectionError;
  let stereoSourceSamples = 0, sourcePeak = 0, decodedSamples = 0, decodedPeak = 0, decodedChannels = 0;
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
  const platform = await loadJazzNodePlatform({ wrtc, WebSocketImpl: LocalSignaling,
    fetchImpl() { throw new Error('The native canary cannot fetch public URLs.'); } });
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
  const addCandidates = async (peer, queue) => {
    if (!peer.remoteDescription || closing) return;
    while (queue.length && !closing) await peer.addIceCandidate(queue.shift());
  };
  return {
    platform,
    async connect() {
      assert.equal(seeds, 1);
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
        if (closing) { event.track.stop(); return; }
        assert.equal(event.track.kind, 'audio'); assert.equal(sink, undefined);
        sink = new wrtc.nonstandard.RTCAudioSink(event.track);
        sink.ondata = data => {
          decodedSamples += data.samples.length;
          decodedChannels = data.channelCount;
          for (const sample of data.samples) decodedPeak = Math.max(decodedPeak, Math.abs(sample));
        };
      };
      sender.addTrack(track, new wrtc.MediaStream([track]));
      await sender.setLocalDescription(stereo(await sender.createOffer()));
      await receiver.setRemoteDescription(sender.localDescription); await addCandidates(receiver, toReceiver);
      await receiver.setLocalDescription(stereo(await receiver.createAnswer()));
      await sender.setRemoteDescription(receiver.localDescription); await addCandidates(sender, toSender);
    },
    async measure() {
      let outbound;
      for (let i = 0; i < 100 && !closing; i++) {
        if (connectionError) throw connectionError;
        const rows = [...(await sender.getStats()).values()];
        outbound = rows.find(row => row.type === 'outbound-rtp' && (row.kind || row.mediaType) === 'audio');
        if (sourcePeak > 100 && decodedPeak > 100 && decodedSamples >= 4800 &&
            decodedChannels === 2 && outbound?.bytesSent > 0 && outbound?.packetsSent > 0) break;
        await new Promise(resolve => setTimeout(resolve, 50));
      }
      assert(sourcePeak > 100 && stereoSourceSamples > 0);
      assert(decodedPeak > 100 && decodedSamples >= 4800 && decodedChannels === 2);
      assert(outbound?.bytesSent > 0 && outbound?.packetsSent > 0);
      return { sdkSeeded: seeds === 1, framesSupplied: cast.status().framesSupplied,
        stereoSourceSamples, sourcePeak, decodedSamples, decodedPeak, decodedChannels,
        bytesSent: outbound.bytesSent, packetsSent: outbound.packetsSent };
    },
    close() { closing = true; sink?.stop(); sourceSink?.stop(); sender?.close(); receiver?.close(); }
  };
}

async function handle(message) {
  if (!message || typeof message !== 'object' || Array.isArray(message)) throw new Error('Invalid IPC.');
  if (message.type === 'start') {
    if (started || stopping || !Number.isInteger(message.timeoutMs) || message.timeoutMs < 1 || message.timeoutMs > 25000) throw new Error('Invalid start.');
    started = true;
    const invitation = validateJazzNodeInvitation(message.invitation);
    if (canary) probe = await canaryPlatform();
    if (stopping) { probe?.close(); probe?.platform.dispose(); return; }
    cast = createJazzDirectNodeCast({ invitation, timeoutMs: message.timeoutMs,
      ...(canary ? { loadPlatform: async () => probe.platform } : {}) });
    try {
      await cast.start({ onstate: value => { if (!stopping) send({ type: 'state', value }); } });
      if (canary && !stopping) await probe.connect();
      if (!stopping) send({ type: 'started' });
    } catch { if (!stopping) send({ type: 'error' }); }
  } else if (message.type === 'frame') {
    if (stopping || !cast || !Number.isSafeInteger(message.sequence) || message.sequence !== lastSequence + 1 ||
        !(message.samples instanceof Int16Array) || message.samples.length !== 960) throw new Error('Invalid audio frame.');
    lastSequence = message.sequence;
    // IPC deserialization may return a view into a larger wire buffer. Give the
    // native source an exact, owned PCM buffer rather than that shared backing store.
    const accepted = cast.writeFrame(message.samples.slice());
    send({ type: 'frame-ack', sequence: message.sequence, accepted });
  } else if (message.type === 'stop') {
    if (!Number.isSafeInteger(message.id) || message.id < 1) throw new Error('Invalid stop.');
    stopping = true; clearInterval(heartbeat);
    let acknowledged = true;
    try { probe?.close(); await cast?.stop(); } catch { acknowledged = false; }
    send({ type: 'stopped', id: message.id, acknowledged });
    // Keep private IPC open. The parent deliberately terminates this process
    // after acknowledgement; native teardown is not represented as a clean exit.
  } else if (message.type === 'probe' && canary && probe && cast && !stopping) {
    send({ type: 'probe-result', value: await probe.measure() });
  } else throw new Error('Unknown IPC command.');
}
process.on('message', message => { void handle(message).catch(() => { if (!stopping) send({ type: 'error' }); }); });
process.on('disconnect', () => {
  stopping = true; clearInterval(heartbeat); probe?.close(); void cast?.stop();
  // A dead parent must never leave an orphan broadcast. This child owns no data files.
  setTimeout(() => process.kill(process.pid, 'SIGKILL'), 500);
});
send({ type: 'ready', version: 1 });
