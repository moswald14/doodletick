// SPDX-License-Identifier: GPL-3.0-only
// Ephemeral test identities and small CPU fixtures only; no user wallet, GPU, or network.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { newIdentity, b64, unb64 } from '../public/core.mjs';
import { COIN_RULES, canonicalManifest, createFounderProposal, verifyFounderProposal, createFounderProof,
  verifyFounderProof, proofMessage, proofDigest, targetForDifficulty, meetsTarget, nonceBytes, parseFounderFile } from '../public/doodleverse-coin.mjs';

let identity, proposal, checked, bundle;
test.before(async () => {
  identity = await newIdentity('FixtureFounder');
  proposal = await createFounderProposal(identity, { difficulty: 16, now: Date.UTC(2026, 10, 15) });
  checked = await verifyFounderProposal(proposal);
  // Produce one disposable CPU known-answer fixture. It is never persisted or published.
  for (let nonce = 0n; nonce < 4194304n; nonce++) {
    const digest = createHash('sha256').update(proofMessage(checked.challengeHex, nonce.toString())).digest('hex');
    if (meetsTarget(digest, checked.targetHex)) { bundle = await createFounderProof(proposal, nonce.toString()); break; }
  }
  assert.ok(bundle, 'Fixture proof found within bound');
});

test('certificate fixes exactly one million founder coins while future network issuance is unadopted', async () => {
  assert.equal(proposal.manifest.allocationAtoms, '100000000000000');
  assert.equal(proposal.manifest.decimals, 8);
  assert.equal(proposal.manifest.networkSupplyCapAtoms, null);
  assert.equal(proposal.manifest.futureIssuance, 'unadopted');
  assert.equal(proposal.manifest.genesisStatus, 'unadopted');
  assert.equal(proposal.manifest.allocation, '100-percent-founder-certificate');
  assert.equal(proposal.manifest.founderAddress, 'dvc-prelaunch:' + identity.fingerprint);
  const text = JSON.stringify(proposal);
  for (const secret of ['privateKey', 'password', identity.privateKey.d, identity.username]) assert.equal(text.includes(secret), false);
  assert.equal((await verifyFounderProof(bundle)).spendable, false);
  assert.equal(checked.authority, 'self-signed-proposal-only'); assert.equal(checked.canonicalGenesis, false);
});

test('canonical field ordering is stable and work binds the complete signed proposal', async () => {
  const reordered = Object.fromEntries(Object.entries(proposal).reverse());
  reordered.manifest = Object.fromEntries(Object.entries(proposal.manifest).reverse());
  assert.equal(canonicalManifest(reordered.manifest), canonicalManifest(proposal.manifest));
  assert.equal((await verifyFounderProposal(reordered)).challengeHex, checked.challengeHex);
  const second = await createFounderProposal(identity, { difficulty: 16, now: Date.UTC(2026, 10, 15) + 1 });
  assert.notEqual((await verifyFounderProposal(second)).challengeHex, checked.challengeHex);
  const moved = structuredClone(bundle); moved.proposal = second;
  await assert.rejects(verifyFounderProof(moved), /Work proof/);
});

test('allocation, domain, genesis, future issuance, target, and founder tampering are rejected', async () => {
  for (const [field, value] of [
    ['format', 'bitcoin'], ['status', 'live'], ['network', 'dvc-mainnet'], ['genesisVersion', 2], ['genesisStatus', 'adopted'],
    ['allocationAtoms', '100000000000001'], ['allocationAtoms', 100000000000000], ['allocation', 'fair-launch'],
    ['networkSupplyCapAtoms', '100000000000000'], ['futureIssuance', 'zero'], ['symbol', 'BTC'], ['decimals', 18],
    ['createdAt', '2026-11-16T00:00:00.000Z'], ['founderAddress', 'dvc-prelaunch:' + 'a'.repeat(43)],
  ]) {
    const changed = structuredClone(proposal); changed.manifest[field] = value;
    await assert.rejects(verifyFounderProposal(changed), undefined, field);
  }
  const changed = structuredClone(proposal);
  changed.manifest.pow.difficulty = 17; changed.manifest.pow.targetHex = targetForDifficulty(17);
  await assert.rejects(verifyFounderProposal(changed), /signature/);
  changed.manifest.pow.targetHex = 'f'.repeat(64);
  await assert.rejects(verifyFounderProposal(changed), /target/);
});

test('signatures prove the chosen key and altered, extra, or noncanonical fields fail closed', async () => {
  const second = await newIdentity('OtherFixture');
  await assert.rejects(createFounderProposal({ publicKey: identity.publicKey, privateKey: second.privateKey }), /signature/);
  const altered = structuredClone(proposal), sig = unb64(altered.signature); sig[0] ^= 1; altered.signature = b64(sig);
  await assert.rejects(verifyFounderProposal(altered), /signature/);
  altered.signature = proposal.signature + '='; await assert.rejects(verifyFounderProposal(altered), /encoding/);
  await assert.rejects(verifyFounderProposal({ ...proposal, balance: 1000000 }), /Unexpected fields/);
  await assert.rejects(verifyFounderProof({ ...bundle, privateCoins: 1000000 }), /Unexpected fields/);
  const extraManifest = structuredClone(proposal); extraManifest.manifest.password = 'secret';
  await assert.rejects(verifyFounderProposal(extraManifest), /Unexpected fields/);
  const extraProof = structuredClone(bundle); extraProof.proof.privateKey = { d: 'secret' };
  await assert.rejects(verifyFounderProof(extraProof), /Unexpected fields/);
  const extraRules = structuredClone(proposal); extraRules.manifest.pow.gpuVerified = true;
  await assert.rejects(verifyFounderProposal(extraRules), /Unexpected fields/);
  await assert.rejects(createFounderProposal(null), /Unlock/);
});

test('proof bytes are exactly a 32-byte challenge plus a big-endian unsigned 256-bit nonce', async () => {
  const challenge = '01'.repeat(32), message = proofMessage(challenge, '1');
  assert.equal(message.length, 64); assert.equal(Buffer.from(message.slice(0, 32)).toString('hex'), challenge);
  assert.equal(Buffer.from(message.slice(32)).toString('hex'), '0'.repeat(63) + '1');
  assert.equal(nonceBytes((1n << 255n).toString())[0], 128);
  assert.equal(await proofDigest(challenge, '1'), createHash('sha256').update(message).digest('hex'));
  for (const nonce of ['-1', '01', '1.0', '1e6', '', '0x10', (1n << 256n).toString(), 1]) assert.throws(() => nonceBytes(nonce));
  for (const difficulty of [0, 15, 25, 16.5, '20']) assert.throws(() => targetForDifficulty(difficulty));
});

test('proof verification rejects false digests, wrong nonces and impossible algorithms', async () => {
  const digest = structuredClone(bundle); digest.proof.digest = 'f'.repeat(64);
  await assert.rejects(verifyFounderProof(digest), /Work proof/);
  const nonce = structuredClone(bundle); nonce.proof.nonce = (BigInt(nonce.proof.nonce) + 1n).toString();
  await assert.rejects(verifyFounderProof(nonce), /Work proof/);
  const algorithm = structuredClone(bundle); algorithm.proof.algorithm = 'SHA-256d';
  await assert.rejects(verifyFounderProof(algorithm), /algorithm/);
  let invalid = '0';
  while (meetsTarget(await proofDigest(checked.challengeHex, invalid), checked.targetHex)) invalid = (BigInt(invalid) + 1n).toString();
  await assert.rejects(createFounderProof(proposal, invalid), /target/);
});

test('valid repeated verification is idempotent and never creates a spendable balance', async () => {
  const first = await verifyFounderProof(bundle), second = await verifyFounderProof(bundle);
  assert.deepEqual(first, second); assert.equal(first.valid, true); assert.equal(first.spendable, false);
  assert.equal(first.networkSupplyCapAtoms, null); assert.equal(first.futureIssuance, 'unadopted');
  assert.equal(first.genesisStatus, 'unadopted'); assert.equal(first.allocationAtoms, COIN_RULES.allocationAtoms);
  assert.equal(Object.hasOwn(first, 'balance'), false);
});

test('file import verifies public proposals or proofs and bounds malformed input', async () => {
  assert.equal((await parseFounderFile(JSON.stringify(proposal))).kind, 'proposal');
  const imported = await parseFounderFile(JSON.stringify(bundle));
  assert.equal(imported.kind, 'proof'); assert.equal(imported.verified.proofId, (await verifyFounderProof(bundle)).proofId);
  await assert.rejects(parseFounderFile('x'.repeat(COIN_RULES.maxBundleBytes + 1)), /32 KB/);
  await assert.rejects(parseFounderFile('{'), /valid JSON/);
  await assert.rejects(parseFounderFile('{"privateKey":"not-a-proposal"}'), /not a Doodleverse/);
  await assert.rejects(parseFounderFile('null'), /not a Doodleverse/);
  await assert.rejects(parseFounderFile('😀'.repeat(9000)), /32 KB/);
});

test('timestamps serialize canonically and cannot silently become null or an invalid date', async () => {
  for (const now of [NaN, Infinity, -1, '2026-11-15', 0.5, Number.MAX_SAFE_INTEGER]) await assert.rejects(createFounderProposal(identity, { now }));
  for (const createdAt of ['not-a-date', null, 0, '2026-11-15', '2026-11-15T00:00:00Z', '+999999-01-01T00:00:00.000Z']) {
    const changed = structuredClone(proposal); changed.manifest.createdAt = createdAt;
    await assert.rejects(verifyFounderProposal(changed));
  }
});
