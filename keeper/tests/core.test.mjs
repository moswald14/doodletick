import test from 'node:test';
import assert from 'node:assert/strict';
import { newIdentity, random, b64, deriveKey, encryptVault, decryptVault, sealEntry, verifyEntry, verifyProof, receiptFor, verifyReceipt, validateVault, tickAt, legacyTickAt, EPOCH, hash } from '../public/core.mjs';

const password = 'a long test passphrase ☄';
const identity = await newIdentity('test_creator');
const payload = { title: 'A thought 🌿', body: 'Love, death, and a tiny galaxy.\n你好 — café — 👩🏽‍🚀\r\nLast line.', kind: 'Story', revisionOf: null };
const first = await sealEntry(identity, [], payload, EPOCH + 123456);
const second = await sealEntry(identity, [first], { ...payload, body: 'A new scene.', revisionOf: first.proof.id }, EPOCH + 3699999);
const vault = { version: 1, identity, entries: [first, second], draft: { title: '', body: 'Unfinished 🫧', kind: 'Note', revisionOf: null } };
const salt = b64(random(16));
const key = await deriveKey(password, salt);
const envelope = await encryptVault(vault, key, salt);

test('encrypted backup restores full Unicode history, identity, and draft', async () => {
  const recovered = await decryptVault(envelope, password);
  assert.deepEqual(recovered.vault, vault);
  assert(!JSON.stringify(envelope).includes('Unfinished'));
  assert(!JSON.stringify(envelope).includes(identity.privateKey.d));
  assert.equal(await validateVault(recovered.vault), true);
});
test('incorrect password fails without returning data', async () => { await assert.rejects(decryptVault(envelope, 'definitely wrong password'), /Wrong password/); });
test('ciphertext, IV, and salt changes are rejected', async () => {
  for (const field of ['ciphertext', 'iv', 'salt']) {
    const changed = structuredClone(envelope); changed[field] = (changed[field][0] === 'A' ? 'B' : 'A') + changed[field].slice(1);
    await assert.rejects(decryptVault(changed, password));
  }
});
test('same content encrypts differently on every save', async () => {
  const other = await encryptVault(vault, key, salt);
  assert.notEqual(other.iv, envelope.iv); assert.notEqual(other.ciphertext, envelope.ciphertext);
});
test('invalid envelope parameters fail before derivation', async () => { await assert.rejects(decryptVault({ ...envelope, iterations: 1 }, password), /supported/); });
test('valid signatures, chain, and revision link verify', async () => {
  assert.equal(await verifyProof(first.proof), true); assert.equal(await verifyEntry(first), true); assert.equal(await validateVault(vault), true);
  assert.equal(second.proof.record.previous, first.proof.id); assert.equal(second.payload.revisionOf, first.proof.id);
});
test('tampered text and title fail verification', async () => {
  for (const field of ['body', 'title']) { const changed = structuredClone(first); changed.payload[field] += '!'; assert.equal(await verifyEntry(changed), false); }
});
test('tampered signed record or signature fails', async () => {
  const changed = structuredClone(first); changed.proof.record.sequence = 9;
  changed.proof.id = await hash({ record: changed.proof.record, signature: changed.proof.signature });
  assert.equal(await verifyEntry(changed), false);
  const signature = structuredClone(first); signature.proof.signature = b64(random(64)); assert.equal(await verifyEntry(signature), false);
});
test('reordering, removing a middle entry, and identity substitution fail', async () => {
  const reordered = structuredClone(vault); reordered.entries.reverse(); await assert.rejects(validateVault(reordered), /history/);
  const missing = structuredClone(vault); missing.entries.shift(); await assert.rejects(validateVault(missing), /history/);
  const wrong = structuredClone(vault); const other = await newIdentity('other_creator'); wrong.identity.privateKey = other.privateKey; await assert.rejects(validateVault(wrong), /keys/);
});
test('receipt verifies standalone and distinguishes content checks', async () => {
  const receipt = receiptFor(first);
  assert.equal((await verifyReceipt(receipt)).contentMatches, null);
  assert.equal((await verifyReceipt(receipt, payload.body)).contentMatches, true);
  assert.equal((await verifyReceipt(receipt, payload.body + '!')).contentMatches, false);
  assert.equal((await verifyReceipt(receipt, payload.body.replace('\r\n', '\n'))).contentMatches, false);
  assert(!JSON.stringify(receipt).includes(payload.body));
});
test('receipt disclosure tampering fails content comparison', async () => {
  const receipt = receiptFor(structuredClone(first)); receipt.disclosure.title = 'Stolen title';
  assert.equal((await verifyReceipt(receipt, payload.body)).contentMatches, false);
});
test('restored signing key can continue its original chain', async () => {
  const restored = (await decryptVault(envelope, password)).vault;
  const next = await sealEntry(restored.identity, restored.entries, payload);
  restored.entries.push(next); assert.equal(await validateVault(restored), true);
});
test('clock starts red, ends green and repeats no palette colors within a chapter', () => {
  assert.equal(tickAt(EPOCH).color, '#FF0000'); assert.equal(legacyTickAt(EPOCH + 23 * 3600000).color, '#00FF00');
  assert.equal(tickAt(EPOCH + 3599999).index, 0); assert.equal(tickAt(EPOCH + 3600000).index, 1);
  for (let cycle = 0; cycle < 15; cycle++) {
    const colors = Array.from({ length: 24 }, (_, h) => tickAt(EPOCH + (cycle * 24 + h) * 3600000).color);
    assert.equal(new Set(colors).size, 24);
    assert(colors.every(c => /^#[A-F0-9]{6}$/.test(c)));
  }
});
