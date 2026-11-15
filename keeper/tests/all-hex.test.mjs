import test from 'node:test';
import assert from 'node:assert/strict';
import { HEX_COLOR_COUNT as N, hexColorNumber, tickAt, legacyTickAt, EPOCH, newIdentity, sealEntry, sign, hash, verifyEntry, validateVault } from '../public/core.mjs';
for (const pass of [0, 1]) test(`all RGB colors exactly once in pass ${pass}`, () => {
  const seen = new Uint8Array(N);
  for (let slot = 0; slot < N; slot++) {
    const color = hexColorNumber(pass * N + slot);
    if (color < 0 || color >= N || seen[color]) assert.fail(`Duplicate or invalid color at ${slot}`);
    seen[color] = 1;
  }
  assert.equal(hexColorNumber(pass * N), 0xff0000);
  assert.equal(hexColorNumber((pass + 1) * N - 1), 0x00ff00);
  assert.equal(seen.every(Boolean), true);
});
test('hour boundaries and changed order after a complete pass', () => {
  assert.equal(tickAt(EPOCH + 3599999).index, 0);
  assert.equal(tickAt(EPOCH + 3600000).index, 1);
  assert.notEqual(hexColorNumber(1), hexColorNumber(N + 1));
});
test('legacy signed entries remain valid and can continue with new colors', async () => {
  const identity = await newIdentity('legacy_creator');
  const payload = {title:'Old entry', body:'Preserved', kind:'Note', revisionOf:null};
  const old = await sealEntry(identity, [], payload, EPOCH + 23 * 3600000);
  old.proof.record.version = 1;
  old.proof.record.tick = legacyTickAt(Date.parse(old.proof.record.createdAt));
  old.proof.signature = await sign(old.proof.record, identity.privateKey);
  old.proof.id = await hash({record:old.proof.record, signature:old.proof.signature});
  assert.equal(await verifyEntry(old), true);
  const next = await sealEntry(identity, [old], payload, EPOCH + 24 * 3600000);
  assert.equal(next.proof.record.version, 2);
  assert.equal(await validateVault({version:1, identity, entries:[old,next], draft:payload}), true);
  next.proof.record.version = 1;
  assert.equal(await verifyEntry(next), false);
});

