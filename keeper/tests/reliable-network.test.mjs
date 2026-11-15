import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { simulatedKeepers } from './vpn-fixture.mjs';
import { request } from '../public/vpn-transport.mjs';

const api = async (node, route, method = 'GET', data, token) => {
  const r = await fetch(node.base + '/vpn-api/' + route, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) }, ...(data ? { body: JSON.stringify(data) } : {}) });
  return { status: r.status, data: await r.json() };
};
async function pair(net) {
  const [a, b] = net.nodes;
  const ca = (await api(a, 'channels', 'POST', { label: 'doodleverse-v1' })).data;
  const cb = (await api(b, 'channels', 'POST', { label: 'doodleverse-v1' })).data;
  assert.equal(ca.reliableDelivery, true);
  const ra = 'channels/' + ca.description.channel, rb = 'channels/' + cb.description.channel;
  assert.equal((await api(a, ra + '/bind', 'POST', cb.description, ca.localToken)).status, 200);
  assert.equal((await api(b, rb + '/bind', 'POST', ca.description, cb.localToken)).status, 200);
  return { a, b, ca, cb, ra, rb };
}
test('lost peer and local acknowledgements preserve exactly one copy and ordered next batch', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'keeper-retry-'));
  let attempts = 0;
  const net = await simulatedKeepers(dir, 2, async (packet, send) => {
    const result = await send(packet);
    if (packet.route.startsWith('/vpn-peer/') && ++attempts === 1) throw Object.assign(new Error('Lost acknowledgement'), { status: 503 });
    return result;
  });
  try {
    const { a, b, ca, cb, ra, rb } = await pair(net);
    const body = { clientSeq: 1, messages: [{ kind: 'text', data: 'first' }] };
    const send = body => api(a, ra + '/send', 'POST', body, ca.localToken);
    // Concurrent copies while delivery is pending must join the same send.
    assert.deepEqual((await Promise.all([send(body), send(body)])).map(r => r.status), [200, 200]);
    assert.equal(attempts, 2);
    assert.equal((await send(body)).status, 200); // Browser lost its response.
    assert.equal(attempts, 2);
    assert.equal((await send({ ...body, messages: [{ kind: 'text', data: 'conflict' }] })).status, 409);
    assert.equal((await send({ clientSeq: 3, messages: body.messages })).status, 409);
    assert.equal((await send({ clientSeq: 2, messages: [{ kind: 'text', data: 'second' }] })).status, 200);
    const received = (await api(b, rb + '/events?after=0', 'GET', null, cb.localToken)).data.events;
    assert.deepEqual(received.map(e => [e.cursor, e.message.data]), [[1, 'first'], [2, 'second']]);
  } finally { await net.close(); await rm(dir, { recursive: true, force: true }); }
});
test('peer retries are bounded and do not bypass revoked membership', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'keeper-revoke-'));
  let attempts = 0, revoke;
  const net = await simulatedKeepers(dir, 2, async () => {
    attempts++;
    if (revoke) await revoke();
    throw Object.assign(new Error('Offline'), { status: 503 });
  });
  try {
    const { a, b, ca, ra } = await pair(net);
    const payload = { clientSeq: 1, messages: [{ kind: 'ready' }] };
    assert.equal((await api(a, ra + '/send', 'POST', payload, ca.localToken)).status, 503);
    assert.equal(attempts, 3);
    revoke = async () => { a.raw.Peer[b.ip].Online = false; await a.keeper.vpn.refresh(); };
    assert.equal((await api(a, ra + '/send', 'POST', payload, ca.localToken)).status, 410);
    assert.equal(attempts, 4);
  } finally { await net.close(); await rm(dir, { recursive: true, force: true }); }
});
test('browser retries transient reads and opted-in sends with unchanged body; never retries forbidden or legacy mutations', async () => {
  let calls = [];
  const fetcher = async (url, options) => {
    calls.push(options);
    return new Response(JSON.stringify({ ok: true }), { status: calls.length < 3 ? 503 : 200 });
  };
  const pause = async () => {};
  await request('channels/x/send', { method: 'POST', body: { clientSeq: 1, messages: ['hello'] }, retry: true, fetcher, pause });
  assert.equal(calls.length, 3); assert.equal(new Set(calls.map(c => c.body)).size, 1);
  calls = [];
  await assert.rejects(request('channels', { method: 'POST', body: {}, fetcher, pause })); assert.equal(calls.length, 1);
  let count = 0;
  await assert.rejects(request('status', { fetcher: async () => { count++; return new Response('{}', { status: 403 }); }, pause })); assert.equal(count, 1);
  count = 0;
  await assert.rejects(request('status', { fetcher: async () => { count++; throw new TypeError('network error'); }, pause })); assert.equal(count, 3);
  const controller = new AbortController(); controller.abort();
  await assert.rejects(request('status', { signal: controller.signal, fetcher: async () => { assert.fail('An aborted request must not be sent'); }, pause }));
  count = 0;
  await request('channels/x/events?after=1', { fetcher: async () => new Response('{}', { status: ++count === 1 ? 409 : 200 }), pause }); assert.equal(count, 2);
  count = 0;
  await request('status', { fetcher: async () => new Response(++count === 1 ? '{' : '{}'), pause }); assert.equal(count, 2);
});
