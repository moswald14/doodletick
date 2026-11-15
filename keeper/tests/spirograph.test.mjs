import test from 'node:test';
import assert from 'node:assert/strict';
import { newIdentity, sign, hash } from '../public/core.mjs';
import { identitySeal, pairingSeal, makeSeal } from '../public/spirograph.mjs';
import { SpirographAuth } from '../public/spirograph-auth.mjs';
async function pair() {
  const a = await newIdentity('spiro_alice'), b = await newIdentity('spiro_bob');
  const record = { format: 'test-pair-v1', type: 'offer', session: crypto.randomUUID(), expires: Date.now() + 60000, publicKey: a.publicKey };
  const offer = { record, signature: await sign(record, a.privateKey) };
  const response = { ...record, type: 'answer', session: crypto.randomUUID(), publicKey: b.publicKey, replyTo: await hash(offer) };
  return { offer, answer: { record: response, signature: await sign(response, b.privateKey) }, a, b };
}
test('identity spirographs are deterministic, key-specific, bounded vector drawings with accessible codes', async () => {
  const { a, b } = await pair(), first = await identitySeal(a.publicKey);
  assert.deepEqual(first, await identitySeal(a.publicKey)); assert.notEqual(first.digest, (await identitySeal(b.publicKey)).digest);
  assert.match(first.code, /^[A-F0-9]{5}( [A-F0-9]{5}){3}$/); assert(first.svg.length < 150000); assert(!/NaN|undefined|<script|onload=/.test(first.svg)); assert.match(first.svg, /aria-label="Spirograph verification seal/);
  assert.throws(() => makeSeal('<img onerror=alert(1)>'));
});
test('pair spirographs bind both signatures and a fresh challenge; copied or changed answers fail', async () => {
  const { offer, answer } = await pair(), seal = await pairingSeal(offer, answer);
  assert.deepEqual(seal, await pairingSeal(structuredClone(offer), structuredClone(answer)));
  const next = await pair(); assert.notEqual(seal.digest, (await pairingSeal(next.offer, next.answer)).digest);
  await assert.rejects(pairingSeal(next.offer, answer));
  const changed = structuredClone(answer); changed.record.session += 'changed'; await assert.rejects(pairingSeal(offer, changed));
  const stale = structuredClone(offer); stale.record.expires = 1; await assert.rejects(pairingSeal(stale, answer));
});
test('authentication withholds data until BOTH peers confirm the same spirograph', async () => {
  const seal = makeSeal('a'.repeat(43)), sent = []; let confirm, opened = 0;
  const auth = new SpirographAuth(seal, { peer: { username: 'peer' }, purpose: 'test', confirm: () => new Promise(r => { confirm = r; }), onVerified: () => opened++, onReject: () => {} });
  try {
    auth.begin({ send: raw => sent.push(JSON.parse(raw)) }); assert.equal(sent[0].type, 'hello');
    assert.throws(() => auth.receive('{"type":"catalog-file"}'), /before spirograph/);
    confirm(true); await new Promise(r => setImmediate(r)); assert.equal(opened, 0); assert.equal(auth.verified, false);
    assert.throws(() => auth.receive(JSON.stringify({ auth: 'doodletick-spirograph-v1', type: 'confirm', digest: 'b'.repeat(43) })), /do not match/);
    auth.receive(JSON.stringify({ auth: 'doodletick-spirograph-v1', type: 'confirm', digest: seal.digest })); assert.equal(opened, 1); assert.equal(auth.verified, true);
    assert.equal(auth.receive('{"type":"catalog-file"}'), false);
    auth.receive(JSON.stringify({ auth: 'doodletick-spirograph-v1', type: 'confirm', digest: seal.digest })); assert.equal(opened, 1);
  } finally { auth.close(); }
});
test('rejection and closed comparisons cannot later authenticate from a delayed click', async () => {
  let decide, opened = 0, rejected = 0;
  const auth = new SpirographAuth(makeSeal('a'.repeat(43)), { peer: {}, purpose: '', confirm: () => new Promise(r => { decide = r; }), onVerified: () => opened++, onReject: () => rejected++ });
  auth.begin({ send() {} }); decide(false); await new Promise(r => setImmediate(r)); assert.equal(rejected, 1); assert.equal(opened, 0); assert(auth.closed);
  const second = new SpirographAuth(makeSeal('a'.repeat(43)), { peer: {}, purpose: '', confirm: () => new Promise(r => { decide = r; }), onVerified: () => opened++, onReject() {} });
  second.begin({ send() {} }); second.close(); decide(true); await new Promise(r => setImmediate(r)); assert.equal(opened, 0);
});
