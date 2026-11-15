import test from 'node:test';
import assert from 'node:assert/strict';
import { RtcConnection, request } from '../public/vpn-transport.mjs';
import { validRtcDescription } from '../public/vpn-description.mjs';
import { FakePeerConnection, rtcDescription } from './rtc-fixture.mjs';

test('native transport uses no relay or discovery servers and exports only complete reliable data offers', async () => {
  const connection = new RtcConnection({ PeerConnection: FakePeerConnection });
  try {
    assert.deepEqual(connection.pc.configuration.iceServers, []);
    assert.equal(connection.localDescription, null);
    const channel = connection.createDataChannel('doodleverse-v1');
    assert.equal(channel.ordered, true);
    assert.throws(() => connection.createDataChannel('doodleverse-v1'));
    await connection.setLocalDescription(await connection.createOffer());
    assert(validRtcDescription(connection.localDescription, 'offer', 'doodleverse-v1'));
    await connection.setRemoteDescription(rtcDescription('doodleverse-v1', 'answer'));
    assert.equal(connection.pc.remoteDescription.type, 'answer');
    await assert.rejects(connection.setRemoteDescription(rtcDescription('doodleverse-v1', 'answer')));
  } finally { connection.close(); }
});
test('incomplete ICE, missing candidates and closure fail instead of issuing partial invitation codes', async () => {
  const stalled = new RtcConnection({ PeerConnection: FakePeerConnection, gatherTimeoutMs: 12 });
  stalled.pc.stalled = true; stalled.createDataChannel('doodleverse-v1');
  await assert.rejects(stalled.setLocalDescription(await stalled.createOffer()), /did not finish/);
  assert.equal(stalled.connectionState, 'closed'); assert.equal(stalled.localDescription, null);
  const empty = new RtcConnection({ PeerConnection: FakePeerConnection });
  empty.createDataChannel('doodleverse-v1');
  const offer = await empty.createOffer(); offer.sdp = offer.sdp.replace(/^a=candidate:.*\r?\n/m, '');
  await assert.rejects(empty.setLocalDescription(offer), /No complete/);
  assert.equal(empty.connectionState, 'closed');
  const closed = new RtcConnection({ PeerConnection: FakePeerConnection }); closed.pc.stalled = true; closed.createDataChannel('doodleverse-v1');
  const pending = closed.setLocalDescription(await closed.createOffer()); await Promise.resolve(); closed.close();
  await assert.rejects(pending, /closed/);
});
test('descriptions reject legacy VPN tokens, partial ICE, wrong media, fingerprint, channel and type', async () => {
  const good = rtcDescription();
  assert(validRtcDescription(good));
  for (const value of [
    { ...good, format: 'doodletick-vpn-v1' }, { ...good, iceComplete: false }, { ...good, label: 'unknown' },
    { ...good, sdp: good.sdp.replace('m=application', 'm=audio') },
    { ...good, sdp: good.sdp.replace('a=fingerprint:sha-256', 'a=fingerprint:sha-1') },
    { ...good, sdp: good.sdp + 'a=fingerprint:sha-256 ' + Array(32).fill('BB').join(':') + '\r\n' },
    { ...good, sdp: good.sdp.replace('a=ice-pwd:', 'a=invalid:') }
  ]) assert.equal(validRtcDescription(value), false);
  const connection = new RtcConnection({ PeerConnection: FakePeerConnection });
  try {
    await assert.rejects(connection.setRemoteDescription(rtcDescription('doodleverse-v1', 'answer')));
    await connection.setRemoteDescription(good);
    await connection.setLocalDescription(await connection.createAnswer());
    assert.equal(connection.localDescription.type, 'answer');
  } finally { connection.close(); }
});
test('local API retries only bounded transient failures; signed mutations are not retried implicitly', async () => {
  const pause = async () => {}; let calls = 0;
  await request('status', { fetcher: async () => new Response('{}', { status: ++calls < 3 ? 503 : 200 }), pause });
  assert.equal(calls, 3);
  calls = 0; await assert.rejects(request('garden/self/action', { method: 'POST', body: {}, fetcher: async () => { calls++; return new Response('{}', { status: 503 }); }, pause })); assert.equal(calls, 1);
  for (const status of [403, 409, 410]) {
    calls = 0; await assert.rejects(request('status', { fetcher: async () => { calls++; return new Response('{}', { status }); }, pause })); assert.equal(calls, 1);
  }
  const controller = new AbortController(); controller.abort();
  await assert.rejects(request('status', { signal: controller.signal, fetcher: async () => assert.fail('Aborted request was sent'), pause }));
  calls = 0; await request('status', { fetcher: async () => new Response(++calls === 1 ? '{' : '{}'), pause }); assert.equal(calls, 2);
});
