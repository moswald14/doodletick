// SPDX-License-Identifier: GPL-3.0-only
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createKeeperServer } from '../server.mjs';
import { createIngressServer } from '../../doodletick/gateway.mjs';
import { djMakeBank } from '../public/jazz-core.mjs';
import { checkSignature } from '../public/core.mjs';
import { JAZZ_DEFAULT_SETTINGS, JAZZ_HOUR, JAZZ_NOW_FORMAT } from '../public/jazz-radio-contract.mjs';

const root = '/api/jazz-radio/';
const audioBytes = Buffer.alloc(256, 37); audioBytes.write('ID3');
let bank;

// Native transport, encoders and optional world/voice requests are replaced only at
// their public service boundaries. All HTTP, station state and signatures are real.
async function fixture(t, enabled = false) {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), 'doodle-jazz-radio-http-'));
  const calls = { starts: 0, stops: 0, frames: 0, listeners: 0, encodes: 0, world: 0, voice: 0 };
  let time = Date.parse('2026-11-17T12:00:00Z');
  const keeper = await createKeeperServer({ dataDir, port: 0, jazzRadioOptions: {
    enabled, automatic: false, now: () => time,
    bankFactory: () => bank ||= djMakeBank(24000),
    transportFactory: () => ({
      async start({ onstate }) { calls.starts++; onstate({ phase: 'advertised', message: 'Fixture transport', peers: 0 }); },
      writeFrame() { calls.frames++; return true; },
      async stop() { calls.stops++; }
    }),
    monitorFactory: async () => ({
      writeFrame() {},
      subscribe(res) {
        calls.listeners++;
        res.writeHead(200, { 'Content-Type': 'audio/mpeg', 'X-Accel-Buffering': 'no' });
        res.end(audioBytes);
      },
      async close() {}
    }),
    encoder: async () => { calls.encodes++; return Buffer.from(audioBytes); },
    world: { async brief() { calls.world++; return { text: 'Fixture world update.', sourceUrls: [] }; }, close() {} },
    voice: { async synthesize() { calls.voice++; return null; }, status: () => ({ available: true, error: '' }), close() {} }
  } });
  t.after(async () => {
    keeper.server.closeAllConnections(); await keeper.close();
    assert.equal(path.dirname(path.resolve(dataDir)), path.resolve(os.tmpdir()));
    assert(path.basename(dataDir).startsWith('doodle-jazz-radio-http-'));
    await rm(dataDir, { recursive: true, force: true });
  });
  const url = 'http://127.0.0.1:' + keeper.port;
  const advance = seconds => {
    let frames = Math.round(seconds * 100);
    while (frames) { const count = Math.min(frames, 500); time += count * 10; keeper.jazzRadio.advance(count); frames -= count; }
  };
  return { keeper, calls, url, advance, now: () => time };
}

const post = (base, action, input = {}, headers = {}) => fetch(base + root + action, {
  method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Keeper-Request': '1', ...headers },
  body: JSON.stringify(input), signal: AbortSignal.timeout(15000)
});
async function json(response, status = 200) {
  const value = await response.json(); assert.equal(response.status, status, JSON.stringify(value)); return value;
}
const status = base => fetch(base + root + 'status').then(response => json(response));
async function until(predicate) {
  const deadline = performance.now() + 4000;
  while (!predicate()) { if (performance.now() > deadline) assert.fail('Timed out waiting for the fixture recording.'); await new Promise(resolve => setTimeout(resolve, 5)); }
}
function raw(base, { target, method = 'GET', headers = {}, body } = {}) {
  const url = new URL(base);
  return new Promise((resolve, reject) => {
    const req = http.request({ hostname: url.hostname, port: url.port, path: target, method, headers }, res => {
      const chunks = []; res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) }));
      res.on('error', reject);
    });
    req.on('error', reject); req.setTimeout(15000, () => req.destroy(new Error('Fixture HTTP request timed out.')));
    req.end(body);
  });
}
async function ingress(t, keeperPort, ingressIP) {
  const server = createIngressServer({ keeperPort, ingressIP, control: { status: async () => ({ ready: true }) } });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); });
  return 'http://127.0.0.1:' + server.address().port;
}

test('disabled radio serves its public state and assets without starting audio or exposing station files', async t => {
  const f = await fixture(t), before = await (await fetch(f.url + '/api/status')).json();
  const station = await status(f.url);
  assert.equal(station.enabled, false); assert.equal(station.running, false); assert.equal(station.listenerUrl, null);
  assert.equal((await json(await fetch(f.url + root + 'library'))).count, 0);
  for (const action of ['start', 'stop', 'shuffle', 'new-set', 'receipt', 'context']) await json(await post(f.url, action), 503);
  await json(await fetch(f.url + root + 'stream'), 409);
  for (const asset of ['jazz-radio-ui.mjs', 'jazz-radio-contract.mjs', 'jazz-genres.mjs']) {
    const response = await fetch(f.url + '/' + asset); assert.equal(response.status, 200);
    assert.match(response.headers.get('content-type'), /javascript/);
    assert.match(response.headers.get('content-security-policy'), /script-src 'self';/);
    assert.equal(response.headers.get('cache-control'), 'no-store'); await response.text();
  }
  for (const target of ['/jazz-radio.mjs', '/jazz-library.mjs', '/jazz-radio/station.json', '/jazz-library/library.json', '/options.json',
    root + 'audio/not-a-hash.mp3', root + 'audio/' + 'A'.repeat(64) + '.mp3', root + 'audio/%2e%2e/%2e%2e/options.json']) {
    assert.equal((await raw(f.url, { target })).status, 404, target);
  }
  const after = await (await fetch(f.url + '/api/status')).json();
  assert.equal(after.fingerprint, before.fingerprint); assert.equal(after.receipts, before.receipts);
  assert.equal(f.calls.starts, 0); assert.equal(f.calls.frames, 0); assert.equal(f.calls.world, 0); assert.equal(f.calls.voice, 0);
});

test('real Keeper mutation routes enforce origin, host, JSON shape and a six-kilobyte body limit before changing radio', async t => {
  const f = await fixture(t, true), before = await status(f.url);
  await json(await post(f.url, 'start', {}, { 'X-Keeper-Request': '' }), 403);
  await json(await post(f.url, 'start', {}, { Origin: 'https://example.invalid' }), 403);
  await json(await post(f.url, 'start', {}, { 'Content-Type': 'text/plain' }), 415);
  await json(await post(f.url, 'start', { padding: 'x'.repeat(6000) }), 413);
  const hostile = await raw(f.url, { target: root + 'start', method: 'POST',
    headers: { Host: 'example.invalid', 'Content-Type': 'application/json', 'X-Keeper-Request': '1' }, body: '{}' });
  assert.equal(hostile.status, 403);
  for (const body of ['{', 'null', '[]', 'true']) {
    const response = await fetch(f.url + root + 'start', { method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Keeper-Request': '1' }, body });
    await json(response, 400);
  }
  for (const action of ['never-stop', 'voice']) await json(await post(f.url, action, { enabled: 'true' }), 400);
  await json(await post(f.url, 'dig', { requestId: '../station.json' }), 400);
  await json(await post(f.url, 'unknown'), 404);
  assert.equal((await raw(f.url, { target: root + 'start', method: 'DELETE', headers: { 'X-Keeper-Request': '1' } })).status, 404);
  const after = await status(f.url);
  assert.equal(after.running, false); assert.equal(after.revision, before.revision); assert.deepEqual(after.settings, before.settings);
  assert.equal(f.calls.starts, 0);
  // A valid request with its actual origin must still work after rejected traffic.
  const accepted = await json(await post(f.url, 'settings', JAZZ_DEFAULT_SETTINGS, { Origin: f.url }));
  assert.deepEqual(accepted.settings, JAZZ_DEFAULT_SETTINGS); assert.equal(accepted.revision, before.revision + 1);
});

test('radio HTTP controls keep local listening separate and return verifiable current-chord receipts', async t => {
  const f = await fixture(t, true), ownerBefore = await (await fetch(f.url + '/api/status')).json();
  const settings = { ...JAZZ_DEFAULT_SETTINGS, style: 'bossa', swing: 72, tempo: 130 };
  const adjusted = await json(await post(f.url, 'settings', { ...settings, volume: 0, localVolume: 0, muted: true, wallet: 'ignored' }));
  assert.deepEqual(adjusted.settings, { ...settings, swing: 50 });
  await json(await post(f.url, 'receipt'), 409); await json(await post(f.url, 'context'), 409);
  assert.equal((await json(await post(f.url, 'start'))).running, true); f.advance(0.1);
  const snapshot = await json(await post(f.url, 'context'));
  assert.equal(snapshot.style, 'bossa'); assert.equal(snapshot.swing, 0.5); assert(snapshot.motif.length > 0);
  const receipt = await json(await post(f.url, 'receipt'));
  assert.equal(receipt.record.format, JAZZ_NOW_FORMAT); assert.equal(receipt.publicKey, ownerBefore.publicKey);
  assert(await checkSignature(receipt.record, receipt.signature, receipt.publicKey));
  assert(!Object.hasOwn(receipt.record.settings, 'volume')); assert(!Object.hasOwn(receipt.record.settings, 'wallet'));
  const listened = await fetch(f.url + root + 'stream'); assert.equal(listened.status, 200);
  assert.equal(listened.headers.get('content-type'), 'audio/mpeg'); assert.deepEqual(Buffer.from(await listened.arrayBuffer()), audioBytes);
  const frames = f.calls.frames; f.advance(0.1); assert(f.calls.frames > frames); assert.equal(f.calls.listeners, 1);
  assert.equal((await status(f.url)).running, true, 'an ended local monitor request leaves the station playing');
  const neverStop = await json(await post(f.url, 'never-stop', { enabled: true }));
  assert.equal(neverStop.neverStop, true); assert.equal(neverStop.nextShuffleAt, f.now() + JAZZ_HOUR);
  await json(await post(f.url, 'stop'), 423); assert.equal((await status(f.url)).running, true);
  await json(await post(f.url, 'never-stop', { enabled: false }));
  const beforeSet = await status(f.url); const nextSet = await json(await post(f.url, 'new-set'));
  assert(nextSet.revision > beforeSet.revision); assert.equal(nextSet.listenerUrl, beforeSet.listenerUrl);
  const shuffled = await json(await post(f.url, 'shuffle')); assert.notDeepEqual(shuffled.settings, nextSet.settings);
  await json(await post(f.url, 'voice', { enabled: true })); await until(() => f.calls.world === 1);
  await json(await post(f.url, 'voice', { enabled: false }));
  const stopped = await json(await post(f.url, 'stop')); assert.equal(stopped.running, false); assert.equal(f.calls.stops, 1);
  const ownerAfter = await (await fetch(f.url + '/api/status')).json();
  assert.equal(ownerAfter.fingerprint, ownerBefore.fingerprint); assert.equal(ownerAfter.receipts, ownerBefore.receipts);
});

test('invalid station settings return a client error and preserve the last accepted arrangement', async t => {
  const f = await fixture(t, true), before = await status(f.url);
  for (const input of [
    { ...JAZZ_DEFAULT_SETTINGS, style: 'unknown' },
    { ...JAZZ_DEFAULT_SETTINGS, tempo: 54 },
    { ...JAZZ_DEFAULT_SETTINGS, tempo: 180.5 },
    { ...JAZZ_DEFAULT_SETTINGS, swing: 73 },
    { ...JAZZ_DEFAULT_SETTINGS, piano: -1 },
    { ...JAZZ_DEFAULT_SETTINGS, bass: null },
    { ...JAZZ_DEFAULT_SETTINGS, drums: 101 },
    { ...JAZZ_DEFAULT_SETTINGS, room: '35' }
  ]) {
    const response = await post(f.url, 'settings', input), error = await response.json();
    assert.equal(response.status, 400, JSON.stringify(error));
    const after = await status(f.url);
    assert.deepEqual(after.settings, before.settings); assert.equal(after.revision, before.revision); assert.equal(after.running, false);
  }
  assert.equal(f.calls.starts, 0);
});

test('radio HTTP keepsakes are signed once and replay by bounded content hash and byte ranges through authenticated ingress', async t => {
  const f = await fixture(t, true), gateway = await ingress(t, f.keeper.port, '127.0.0.1');
  await json(await post(gateway, 'start')); f.advance(11);
  const requestId = randomUUID(), collecting = await json(await post(gateway, 'dig', { requestId }), 202);
  assert.equal(collecting.status, 'collecting');
  assert.equal((await json(await post(gateway, 'dig', { requestId }), 202)).id, collecting.id);
  f.advance(12); await until(() => f.keeper.jazzRadio.status().jobs.some(job => job.requestId === requestId && job.status === 'saved'));
  const saved = await json(await post(gateway, 'dig', { requestId }));
  assert.equal(saved.status, 'saved'); assert.equal(saved.receipt.record.chords.length, 8); assert.equal(f.calls.encodes, 1);
  assert(await checkSignature(saved.receipt.record, saved.receipt.signature, saved.receipt.publicKey));
  const library = await json(await fetch(gateway + root + 'library'));
  assert.equal(library.count, 1); assert.deepEqual(library.receipts, [saved.receipt]);
  const hash = saved.receipt.record.audio.sha256, route = root + 'audio/' + hash + '.mp3';
  assert.match(hash, /^[a-f0-9]{64}$/);
  for (const base of [f.url, gateway]) {
    const whole = await fetch(base + route); assert.equal(whole.status, 200); assert.equal(whole.headers.get('content-type'), 'audio/mpeg');
    assert.equal(whole.headers.get('accept-ranges'), 'bytes'); assert.equal(whole.headers.get('cache-control'), 'no-store');
    assert.equal(Number(whole.headers.get('content-length')), audioBytes.length); assert.deepEqual(Buffer.from(await whole.arrayBuffer()), audioBytes);
    for (const [range, start, end] of [['bytes=4-15', 4, 15], ['bytes=250-', 250, 255], ['bytes=250-9999', 250, 255]]) {
      const part = await fetch(base + route, { headers: { Range: range } });
      assert.equal(part.status, 206); assert.equal(part.headers.get('content-range'), `bytes ${start}-${end}/${audioBytes.length}`);
      assert.equal(Number(part.headers.get('content-length')), end - start + 1); assert.deepEqual(Buffer.from(await part.arrayBuffer()), audioBytes.subarray(start, end + 1));
    }
    for (const range of ['bytes=256-', 'bytes=20-10', 'bytes=-12', 'bytes=0-1,4-5', 'bytes=99999999999-']) {
      const rejected = await fetch(base + route, { headers: { Range: range } });
      assert.equal(rejected.status, 416, range); assert.equal(rejected.headers.get('content-range'), `bytes */${audioBytes.length}`); await rejected.arrayBuffer();
    }
    for (const target of [root + 'audio/' + 'f'.repeat(64) + '.mp3', route + '/extra', route.replace('.mp3', '.json'), root + 'audio/%2e%2e/station.json']) {
      assert.equal((await raw(base, { target })).status, 404, target);
    }
  }
  await json(await post(gateway, 'stop'));
  const replay = await fetch(gateway + route); assert.equal(replay.status, 200); assert.deepEqual(Buffer.from(await replay.arrayBuffer()), audioBytes);
});

test('Home Assistant radio ingress rejects direct clients and spoofed source headers while forwarding protected controls and monitor headers', async t => {
  const f = await fixture(t, true), allowed = await ingress(t, f.keeper.port, '127.0.0.1'), denied = await ingress(t, f.keeper.port);
  await json(await post(denied, 'start', {}, { 'X-Forwarded-For': '172.30.32.2', 'X-Real-IP': '172.30.32.2' }), 403);
  await json(await fetch(denied + root + 'status'), 403);
  await json(await post(allowed, 'start', {}, { 'X-Keeper-Request': '' }), 403);
  assert.equal(f.calls.starts, 0);
  assert.equal((await json(await post(allowed, 'start'))).running, true); assert.equal(f.calls.starts, 1);
  const stream = await fetch(allowed + root + 'stream'); assert.equal(stream.status, 200);
  assert.equal(stream.headers.get('x-accel-buffering'), 'no'); assert.deepEqual(Buffer.from(await stream.arrayBuffer()), audioBytes);
  const response = await fetch(allowed + '/jazz.html'); assert.equal(response.status, 200);
  assert.match(response.headers.get('content-security-policy'), /script-src 'self';/); assert.match(response.headers.get('content-security-policy'), /frame-ancestors 'self';/); await response.text();
  assert.equal((await fetch(allowed + '/sw.mjs')).status, 404);
  assert.equal((await raw(allowed, { target: '//example.invalid/api/jazz-radio/start' })).status, 400);
  assert.equal((await raw(allowed, { target: root + 'start', method: 'PUT', headers: { 'X-Keeper-Request': '1' } })).status, 405);
  await json(await post(allowed, 'stop'));
});

test('radio mutation rate limit is bounded even for otherwise valid requests that cannot yet run', async t => {
  const f = await fixture(t, true);
  for (let index = 0; index < 120; index++) await json(await post(f.url, 'context'), 409);
  const rejected = await json(await post(f.url, 'context'), 429); assert.match(rejected.error, /wait a minute/i);
  assert.equal((await status(f.url)).running, false); assert.equal(f.calls.starts, 0);
});
