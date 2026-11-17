// SPDX-License-Identifier: GPL-3.0-only
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { JazzCaster, jazzCastInvitation, JAZZ_CAST_HOST } from '../public/jazz-cast.mjs';

class Track extends EventTarget {
  constructor(kind = 'audio') { super(); this.kind = kind; this.readyState = 'live'; this.stops = 0; }
  stop() { this.readyState = 'ended'; this.stops++; }
}
class SDK extends EventTarget {
  constructor() { super(); this.published = 0; this.disconnected = 0; this.stopped = 0; this.reports = {}; }
  async connect() { if (this.connectGate) await this.connectGate; }
  async publish(stream, options) { this.published++; this.stream = stream; this.options = options; if (this.publishGate) await this.publishGate; return options.streamID; }
  stopPublishing() { this.stopped++; }
  async disconnect() { this.disconnected++; }
  async getStats() { return this.reports; }
  emit(type, detail) { this.dispatchEvent(new CustomEvent(type, { detail })); }
}
function fixture(t, patch = {}) {
  const track = new Track(), source = { stream: { getTracks: () => [track] }, releases: 0, release() { this.releases++; } }, sdk = new SDK();
  let options;
  const caster = new JazzCaster({ createSDK: async config => { options = config; return sdk; }, ...patch });
  t.after(() => caster.stop()); return { caster, sdk, source, track, options: () => options };
}
const tick = () => new Promise(resolve => setImmediate(resolve));

test('cast invitations are fresh, unlisted direct audio viewers with private random passwords', () => {
  const values = Array.from({ length: 30 }, jazzCastInvitation);
  assert.equal(new Set(values.map(v => v.streamID)).size, 30); assert.equal(new Set(values.map(v => v.password)).size, 30);
  for (const v of values) {
    const url = new URL(v.url);
    assert.equal(url.origin, 'https://vdo.ninja'); assert.equal(url.pathname, '/alpha/');
    assert.match(v.streamID, /^DoodleJazz[a-f0-9]{32}$/); assert.match(v.password, /^[a-f0-9]{32}$/);
    assert.equal(url.searchParams.get('view'), v.streamID); assert.equal(url.searchParams.get('password'), v.password);
    assert.equal(url.searchParams.get('novideo'), '1'); assert.equal(url.searchParams.get('push'), null); assert.equal(url.searchParams.get('room'), null);
    assert.equal(url.searchParams.get('wss2'), new URL(JAZZ_CAST_HOST).hostname);
  }
});

test('only an existing single audio track is published, and stop releases it without altering local playback', async t => {
  const f = fixture(t); assert.equal(f.sdk.published, 0);
  const result = await f.caster.start(f.source);
  assert.equal(result.state, 'casting'); assert.equal(f.sdk.stream, f.source.stream); assert.equal(f.sdk.options.media.audio.codec, 'opus');
  assert.equal(f.sdk.options.media.video, undefined); assert.equal(f.options().salt, 'vdo.ninja'); assert.equal(f.options().host, JAZZ_CAST_HOST); assert.equal(f.options().debug, false);
  await f.caster.stop(); await f.caster.stop();
  assert.equal(f.track.readyState, 'ended'); assert.equal(f.source.releases, 1); assert.equal(f.sdk.disconnected, 1);
  assert.equal(f.caster.value.state, 'idle'); assert.equal(f.caster.value.url, '');
});

test('mixed or ended media is refused without contacting the casting service', async t => {
  for (const mode of ['video', 'mixed', 'ended']) {
    const f = fixture(t), video = new Track('video');
    if (mode === 'ended') f.track.readyState = 'ended';
    else f.source.stream.getTracks = () => mode === 'mixed' ? [f.track, video] : [video];
    await assert.rejects(f.caster.start(f.source), /Play Jazz/); assert.equal(f.sdk.published, 0); assert.equal(f.options(), undefined);
    assert.equal(f.source.releases, 1);
  }
});

test('cancel during SDK creation, connection or publishing cannot revive the cast', async t => {
  for (const phase of ['create', 'connect', 'publish']) {
    let release; const gate = new Promise(resolve => { release = resolve; });
    const f = fixture(t);
    if (phase === 'create') f.caster.createSDK = async () => { await gate; return f.sdk; };
    if (phase === 'connect') f.sdk.connectGate = gate;
    if (phase === 'publish') f.sdk.publishGate = gate;
    const pending = assert.rejects(f.caster.start(f.source), /canceled/);
    await tick(); await f.caster.stop(); release(); await pending; await tick();
    assert.equal(f.source.releases, 1); assert.equal(f.sdk.disconnected, 1); assert.equal(f.track.readyState, 'ended'); assert.equal(f.caster.value.state, 'idle');
    if (phase !== 'publish') assert.equal(f.sdk.published, 0);
  }
});

test('connection timeout stops the audio source and a late connection cannot publish', async t => {
  const f = fixture(t, { timeoutMs: 10 }); let release;
  f.sdk.connectGate = new Promise(resolve => { release = resolve; });
  await assert.rejects(f.caster.start(f.source), /did not connect in time/); release(); await tick();
  assert.equal(f.caster.value.state, 'error'); assert.equal(f.sdk.published, 0); assert.equal(f.source.releases, 1);
});

test('listener counts and music counters come from established peers and outbound audio reports', async t => {
  const f = fixture(t);
  f.sdk.reports = { peer: [{ type: 'outbound-rtp', kind: 'audio', bytesSent: 12345, packetsSent: 99, connectionType: 'publisher' },
    { type: 'inbound-rtp', kind: 'audio', bytesReceived: 1000000, connectionType: 'viewer' }, { type: 'outbound-rtp', kind: 'video', bytesSent: 9999999, connectionType: 'publisher' }] };
  await f.caster.start(f.source); await tick();
  assert.equal(f.caster.value.listeners, 0); assert.equal(f.caster.value.bytes, 12345); assert.equal(f.caster.value.packets, 99);
  f.sdk.emit('peerConnected', { uuid: 'viewer', connection: { type: 'publisher' } });
  f.sdk.emit('peerConnected', { uuid: 'viewer', connection: { type: 'publisher' } }); assert.equal(f.caster.value.listeners, 1);
  f.sdk.emit('peerDisconnected', { uuid: 'viewer' }); assert.equal(f.caster.value.listeners, 0);
  f.sdk.emit('peerConnected', { uuid: 'viewer', connection: { type: 'publisher' } });
  f.sdk.emit('connectionFailed', { uuid: 'viewer', type: 'publisher' });
  assert.equal(f.caster.value.listeners, 0); assert.match(f.caster.value.message, /Share the listener link/);
  f.sdk.emit('disconnected', { intentional: false, willReconnect: true }); assert.equal(f.caster.value.state, 'reconnecting');
  f.sdk.emit('reconnected', {}); assert.equal(f.caster.value.state, 'casting');
});

test('a duplicate start disposes the unused source, and ended source tears down its cast', async t => {
  const f = fixture(t), spare = fixture(t); await f.caster.start(f.source);
  await assert.rejects(f.caster.start(spare.source), /already active/); assert.equal(spare.source.releases, 1); assert.equal(f.track.readyState, 'live');
  f.track.dispatchEvent(new Event('ended')); await tick(); assert.equal(f.caster.value.state, 'idle'); assert.equal(f.source.releases, 1);
});

test('the pinned casting library and integration contain no device capture or dynamic code execution', async () => {
  const bytes = await readFile(new URL('../public/vdoninja-sdk.js', import.meta.url));
  assert.equal(createHash('sha256').update(bytes).digest('hex'), '80c0ab876661c4f2f34b1c9b3df4317663dd2bd4e3b22d0cc95c42d4f4dca141');
  assert.match(bytes.toString(), /SPDX-License-Identifier: MPL-2.0/);
  const integration = await readFile(new URL('../public/jazz-cast.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(bytes.toString() + integration, /getUserMedia|getDisplayMedia|\beval\s*\(|new Function\s*\(/);
});
