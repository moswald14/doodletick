// SPDX-License-Identifier: GPL-3.0-only
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import '../public/vdoninja-sdk.js';

const SDK = globalThis.VDONinjaSDK;
const streamID = 'DoodleJazz0123456789abcdef0123456789abcdef';
const salt = 'vdo.ninja';
const privatePassword = '0123456789abcdef0123456789abcdef';
const offer = Object.freeze({ type: 'offer', sdp: 'v=0\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111\r\n' });

// VDO.Ninja rejects every incoming offer lacking this identity, including
// renegotiation offers sent after its initial data-only connection succeeds.
// https://github.com/steveseguin/vdo.ninja/blob/master/webrtc.js
const viewerAcceptsStreamID = value => typeof value === 'string' && value.length > 0 &&
  !/[^A-Za-z0-9_:]/.test(value) && !Object.prototype.hasOwnProperty.call(Object.prototype, value);

function fixture(password, transport = 'data-channel') {
  const sdk = new SDK({ password, salt, debug: false, turnServers: false, stunServers: [] });
  const frames = [], senders = [], createOptions = [];
  const track = { kind: 'audio' };
  const pc = {
    signalingState: 'stable',
    getSenders: () => senders,
    getTransceivers: () => [],
    addTrack(next) { const sender = { track: next }; senders.push(sender); return sender; },
    async createOffer(options) { createOptions.push(options); return { ...offer }; },
    async setLocalDescription(description) { this.localDescription = description; }
  };
  const connection = {
    uuid: 'fixture-peer', type: 'publisher', streamID, session: 'fixture-session',
    allowAudio: true, allowVideo: false, pc, _finalized: false,
    dataChannel: { readyState: transport === 'data-channel' ? 'open' : 'closed',
      send: value => frames.push({ transport: 'data-channel', message: JSON.parse(value) }) }
  };
  sdk.localStream = { getTracks: () => [track] };
  sdk.connections.set(connection.uuid, { publisher: connection });
  sdk._sendMessageWS = message => frames.push({ transport: 'websocket', message });
  return { sdk, connection, frames, senders, track, createOptions };
}

async function assertViewerOffer({ sdk, connection, frames }, password, transport) {
  assert.equal(frames.length, 1, 'One media offer is emitted.');
  const { message } = frames[0];
  assert.equal(frames[0].transport, transport);
  assert(viewerAcceptsStreamID(message.streamID), 'The stock viewer accepts the offer identity.');
  const suffix = password === false ? '' : createHash('sha256').update(password + salt).digest('hex').slice(0, 6);
  assert.equal(message.streamID, streamID + suffix, 'The same identity convention as the initial offer is retained.');
  assert.equal(message.session, connection.session);
  if (transport === 'websocket') assert.equal(message.UUID, connection.uuid);
  if (password === false) {
    assert(!Object.hasOwn(message, 'vector'));
    assert.deepEqual(message.description, offer);
  } else {
    assert.equal(typeof message.description, 'string', 'Private SDP stays encrypted.');
    assert.match(message.vector, /^[a-f0-9]{32}$/);
    assert.deepEqual(JSON.parse(await sdk._decryptMessage(message.description, message.vector)), offer);
  }
}

for (const password of [false, privatePassword]) for (const transport of ['data-channel', 'websocket']) {
  const mode = password === false ? 'without a password' : 'with private encryption';
  test(`media preference renegotiation includes viewer-compatible stream identity over ${transport} ${mode}`, async () => {
    const state = fixture(password, transport);
    await state.sdk._updateTracksForConnection(state.connection);
    assert.equal(state.senders.length, 1, 'The requested audio track was inserted.');
    assert.equal(state.senders[0].track, state.track);
    await assertViewerOffer(state, password, transport);
  });

  test(`ICE restart includes viewer-compatible stream identity over ${transport} ${mode}`, async () => {
    const state = fixture(password, transport);
    assert.equal(await state.sdk._initiateICERestart(state.connection, 'fixture', {
      skipRemoteRequest: true, preferDataChannel: true
    }), true);
    assert.deepEqual(state.createOptions, [{ iceRestart: true }]);
    await assertViewerOffer(state, password, transport);
  });
}

function deferred() {
  let resolve;
  return { promise: new Promise(done => { resolve = done; }), resolve: () => resolve() };
}

for (const operation of ['media update', 'ICE restart']) {
  test(`${operation} emits no offer when disconnect invalidates asynchronous hashing`, async () => {
    const { sdk, connection, frames } = fixture(privatePassword);
    const reached = deferred(), release = deferred(), generateHash = sdk._generateHash.bind(sdk);
    sdk._generateHash = async (...args) => { reached.resolve(); await release.promise; return generateHash(...args); };
    const pending = operation === 'media update' ? sdk._updateTracksForConnection(connection) :
      sdk._initiateICERestart(connection, 'fixture', { skipRemoteRequest: true, preferDataChannel: true });
    await reached.promise;
    // These are the synchronous cancellation flags set at the start of disconnect.
    sdk._intentionalDisconnect = true; sdk._reconnectGeneration++;
    release.resolve();
    if (operation === 'media update') await assert.rejects(pending, /cancelled by disconnect/);
    else assert.equal(await pending, false);
    assert.equal(frames.length, 0, 'A disconnected generation cannot send its late offer.');
  });
}
