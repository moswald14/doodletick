// SPDX-License-Identifier: GPL-3.0-only
import test from 'node:test';
import assert from 'node:assert/strict';
import { createJazzNodeCast, createJazzNodeInvitation, validateJazzNodeInvitation, JAZZ_NODE_AUDIO } from '../jazz-node-cast.mjs';

const invitation = createJazzNodeInvitation();
const frame = () => new Int16Array(960).fill(2000);
const deferred = () => {
  let resolve;
  return { promise: new Promise(done => { resolve = done; }), resolve: value => resolve(value) };
};
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(predicate) {
  for (let i = 0; i < 100; i++) { if (predicate()) return; await delay(5); }
  assert.fail('The expected radio state did not arrive.');
}

function fixture({ pendingPhase, failPublish = false, timeoutMs = 1000 } = {}) {
  const gate = deferred(), reached = deferred(), tracks = [], frames = [], sdks = [], calls = {
    load: 0, connect: 0, publish: 0, disconnect: 0, dispose: 0, stopPublishing: 0
  };
  class SDK extends EventTarget {
    reports = {};
    async connect() { calls.connect++; if (pendingPhase === 'connect') { reached.resolve(); await gate.promise; } }
    async publish(stream, options) {
      calls.publish++; this.options = options;
      assert.equal(stream.getTracks().length, 1); assert.equal(stream.getVideoTracks().length, 0);
      if (pendingPhase === 'publish') { reached.resolve(); await gate.promise; }
      if (failPublish) throw new Error('fixture-private-upstream-error');
    }
    stopPublishing() { calls.stopPublishing++; }
    async disconnect() { calls.disconnect++; if (pendingPhase === 'disconnect') { reached.resolve(); await gate.promise; } }
    async getStats() { return this.reports; }
    emit(name, detail) { this.dispatchEvent(new CustomEvent(name, { detail })); }
  }
  const platform = {
    createAudioSource() {
      const track = { kind: 'audio', readyState: 'live', stops: 0, stop() { this.stops++; this.readyState = 'ended'; } };
      tracks.push(track);
      return { createTrack: () => track, onData: data => frames.push(data) };
    },
    createMediaStream: track => ({ getTracks: () => [track], getAudioTracks: () => [track], getVideoTracks: () => [] }),
    createSDK(options) { const sdk = new SDK(); sdk.constructorOptions = options; sdks.push(sdk); return sdk; },
    dispose() { calls.dispose++; }
  };
  const loadPlatform = async () => {
    calls.load++;
    if (pendingPhase === 'load') { reached.resolve(); await gate.promise; }
    return platform;
  };
  const cast = createJazzNodeCast({ invitation, loadPlatform, statsIntervalMs: 5, timeoutMs });
  return { cast, calls, tracks, frames, sdks, gate, reached };
}

test('persistent invitations are validated before dependencies load and preserve the same listener link', async () => {
  assert.equal(validateJazzNodeInvitation(invitation).url, invitation.url);
  const original = JSON.stringify(invitation);
  for (const bad of [null, {}, { ...invitation, password: '' }, { ...invitation, streamID: '__proto__' },
    { ...invitation, url: invitation.url.replace('vdo.ninja/', 'vdo.ninja.example/') },
    { ...invitation, url: invitation.url + '&room=unexpected' }]) {
    assert.throws(() => createJazzNodeCast({ invitation: bad }), TypeError);
  }
  const { cast } = fixture();
  try {
    assert.equal((await cast.start()).listenerUrl, invitation.url);
    await cast.stop();
    assert.equal((await cast.start()).listenerUrl, invitation.url);
  } finally { await cast.stop(); }
  assert.equal(JSON.stringify(invitation), original);
});

test('radio transport accepts exactly one 48 kHz stereo PCM frame and exposes no device capture API', async () => {
  const { cast, frames, sdks, calls, tracks } = fixture();
  assert.equal(calls.load, 0, 'Import and construction do not start a native module or network connection.');
  assert.equal(cast.writeFrame(frame()), false);
  try {
    await cast.start();
    assert.equal(cast.writeFrame(frame()), true);
    assert.equal(frames.length, 1);
    assert.deepEqual({ ...frames[0], samples: undefined }, { sampleRate: 48000, channelCount: 2,
      bitsPerSample: 16, numberOfFrames: 480, samples: undefined });
    assert.equal(frames[0].samples.length, JAZZ_NODE_AUDIO.samplesPerFrame);
    assert.equal(sdks[0].options.streamID, invitation.streamID);
    assert.equal(sdks[0].constructorOptions.password, invitation.password);
    assert.equal(sdks[0].constructorOptions.salt, 'vdo.ninja');
    for (const bad of [new Int16Array(959), new Int16Array(961), new Float32Array(960), Buffer.alloc(1920), null]) {
      assert.throws(() => cast.writeFrame(bad), TypeError);
    }
  } finally { await cast.stop(); }
  assert.equal(tracks[0].readyState, 'ended');
  assert.equal(cast.writeFrame(frame()), false);
  assert.equal(calls.disconnect, 1); assert.equal(calls.dispose, 1);
});

test('a connected data peer is not reported live until outbound audio counters grow', async () => {
  const { cast, sdks } = fixture(), states = [];
  try {
    await cast.start({ onstate: value => states.push(value) });
    const sdk = sdks[0];
    sdk.emit('peerConnected', { uuid: 'fixture-peer', connection: { type: 'publisher' } });
    assert.equal(cast.status().peers, 1);
    assert.equal(cast.status().phase, 'advertised');
    sdk.reports = { fixture: [
      { type: 'outbound-rtp', connectionType: 'publisher', kind: 'video', bytesSent: 999999, packetsSent: 100 },
      { type: 'outbound-rtp', connectionType: 'publisher', kind: 'audio', bytesSent: 2048, packetsSent: 20 }
    ] };
    await until(() => cast.status().phase === 'live');
    assert.equal(cast.status().bytesSent, 2048); assert.equal(cast.status().packetsSent, 20);
    assert(cast.status().lastAudioAt > 0);
    sdk.emit('disconnected', { intentional: false, willReconnect: true, arbitraryPrivateField: 'fixture-private' });
    assert.equal(cast.status().phase, 'reconnecting');
    sdk.emit('peerDisconnected', { uuid: 'fixture-peer' });
    assert.equal(cast.status().phase, 'reconnecting');
    sdk.emit('reconnected', {});
    assert.equal(cast.status().phase, 'advertised');
    assert(!JSON.stringify(states).includes('fixture-peer'));
    assert(!JSON.stringify(states).includes('fixture-private'));
    assert(!JSON.stringify(states).includes(invitation.password + '"'));
  } finally { await cast.stop(); }
});

for (const pendingPhase of ['load', 'connect', 'publish']) {
  test(`Stop during pending ${pendingPhase} releases resources once and prevents a late restart`, async () => {
    const { cast, calls, tracks, gate, reached } = fixture({ pendingPhase });
    const starting = cast.start().catch(error => error);
    await reached.promise;
    const stopping = cast.stop(); assert.equal(cast.stop(), stopping);
    await stopping; gate.resolve();
    assert.equal((await starting).name, 'AbortError');
    await delay(1);
    assert.equal(cast.status().phase, 'idle'); assert.equal(cast.status().listenerUrl, '');
    assert.equal(calls.dispose, 1);
    assert.equal(calls.publish, pendingPhase === 'publish' ? 1 : 0);
    if (pendingPhase === 'load') assert.equal(tracks.length, 0);
    else { assert.equal(tracks[0].stops, 1); assert.equal(calls.disconnect, 1); }
  });
}

test('repeated starts share a session and callback failures cannot interrupt audio', async () => {
  const { cast, calls } = fixture();
  try {
    await Promise.all([cast.start({ onstate() { throw new Error('fixture callback'); } }), cast.start()]);
    await cast.start();
    assert.equal(calls.load, 1); assert.equal(calls.connect, 1); assert.equal(calls.publish, 1);
    assert.equal(cast.writeFrame(frame()), true);
  } finally { await Promise.all([cast.stop(), cast.stop()]); }
  assert.equal(calls.disconnect, 1); assert.equal(calls.dispose, 1);
});

test('upstream failures have a fixed safe public error and release the audio track', async () => {
  const { cast, calls, tracks } = fixture({ failPublish: true });
  await assert.rejects(cast.start(), /Could not start the server audio cast/);
  assert.equal(cast.status().phase, 'error');
  assert.equal(typeof cast.status().error, 'string');
  assert(!JSON.stringify(cast.status()).includes('fixture-private-upstream-error'));
  assert.equal(tracks[0].readyState, 'ended'); assert.equal(calls.disconnect, 1); assert.equal(calls.dispose, 1);
});

test('a restart requested from the stopped callback waits for the old native connection teardown', async () => {
  const { cast, calls, tracks, gate, reached } = fixture({ pendingPhase: 'disconnect' });
  let restart, once = true;
  await cast.start({ onstate(state) {
    if (state.phase === 'idle' && once) {
      once = false; assert.equal(tracks[0].readyState, 'ended'); restart = cast.start();
    }
  } });
  const stopping = cast.stop(); await reached.promise;
  assert.equal(calls.load, 1, 'The new session cannot initialize its native platform yet.');
  gate.resolve(); await stopping; await restart;
  assert.equal(calls.load, 2); assert.equal(calls.connect, 2);
  await cast.stop(); assert.equal(calls.disconnect, 2); assert.equal(calls.dispose, 2);
});

test('Stop can be called synchronously from the starting callback', async () => {
  const { cast, calls } = fixture();
  await assert.rejects(cast.start({ onstate(value) { if (value.phase === 'starting') void cast.stop(); } }), { name: 'AbortError' });
  assert.equal(cast.status().phase, 'idle'); assert.equal(calls.load, 0);
});

test('a startup timeout releases audio resources and cannot publish when its old connection completes', async () => {
  const { cast, calls, tracks, gate } = fixture({ pendingPhase: 'connect', timeoutMs: 10 });
  await assert.rejects(cast.start(), /did not connect in time/);
  gate.resolve(); await delay(1);
  assert.equal(cast.status().phase, 'error'); assert.equal(calls.publish, 0);
  assert.equal(tracks[0].readyState, 'ended'); assert.equal(calls.disconnect, 1); assert.equal(calls.dispose, 1);
});

test('an ended native audio track becomes a safe transport error rather than silently accepting frames', async () => {
  const { cast, tracks, calls } = fixture();
  await cast.start(); tracks[0].readyState = 'ended';
  assert.equal(cast.writeFrame(frame()), false);
  await until(() => calls.dispose === 1);
  assert.equal(cast.status().phase, 'error'); assert.match(cast.status().error, /audio track ended/);
  assert.equal(calls.disconnect, 1);
});
