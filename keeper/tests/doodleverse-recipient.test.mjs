// SPDX-License-Identifier: GPL-3.0-only
// Disposable identities and CPU fixtures only: no wallet, network or GPU access.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { canonical, newIdentity, sign } from '../public/core.mjs';
import { createFounderProposal, verifyFounderProposal, createFounderProof, verifyFounderProof,
  proofMessage, proofDigest, meetsTarget, targetForDifficulty } from '../public/doodleverse-coin.mjs';
import { SigningKey, TypedDataEncoder, computeAddress, AbiCoder } from '../public/recipient-crypto.mjs';
import { createRecipientProposal, recipientContext, recipientTypedData, attachRecipientSignature,
  verifyRecipientAuthorization, createRecipientProof, verifyRecipientProof, parseRecipientFile,
  encodeRecipient1271Call, normalizeRecipientAddress, RECIPIENT_CREATOR_DOMAIN,
  RECIPIENT_LIMITS, RECIPIENT_WORK_DOMAIN, RECIPIENT_STATEMENT } from '../public/doodleverse-recipient.mjs';

const now = Date.UTC(2026, 10, 15), copy = structuredClone;
const signingKey = new SigningKey('0x' + '21'.repeat(32));
const otherKey = new SigningKey('0x' + '22'.repeat(32));
const address = computeAddress(signingKey.publicKey).toLowerCase();
const verificationBlock = { number: '12345', hash: '0x' + 'ab'.repeat(32) };
const input = { address, chainId: '8453', verificationBlock, accountType: 'eoa', difficulty: 16, now };
let identity, sourceProof, sourceChecked, sourceText, proposal, signed, checked, bundle, smart;
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
function solve(prefix, target) {
  const message = Buffer.from(proofMessage(prefix, '0'));
  for (let n = 0; n < 4194304; n++) {
    message.writeUInt32BE(n, 60);
    const digest = createHash('sha256').update(message).digest('hex');
    if (meetsTarget(digest, target)) return String(n);
  }
  throw Error('Disposable fixture did not meet its bounded target.');
}
async function walletSignature(value, key = signingKey) {
  const { domain, types, message } = await recipientTypedData(value, { now });
  const { EIP712Domain, ...payloadTypes } = types;
  return key.sign(TypedDataEncoder.hash(domain, payloadTypes, message)).serialized;
}
async function resign(value) {
  value.creatorSignature = await sign({ domain: RECIPIENT_CREATOR_DOMAIN, manifest: value.manifest }, identity.privateKey);
  return value;
}
const approvedContract = request => ({ verified: true, method: 'erc1271', chainId: request.chainId, blockNumber: request.blockNumber, blockHash: request.blockHash });

test.before(async () => {
  identity = await newIdentity('RecipientFixture');
  const original = await createFounderProposal(identity, { now, difficulty: 16 });
  const work = await verifyFounderProposal(original);
  sourceProof = await createFounderProof(original, solve(work.challengeHex, work.targetHex));
  sourceChecked = await verifyFounderProof(sourceProof); sourceText = JSON.stringify(sourceProof);
  proposal = await createRecipientProposal(identity, sourceProof, input);
  signed = await attachRecipientSignature(proposal, await walletSignature(proposal), { now });
  checked = await verifyRecipientAuthorization(signed, { now });
  bundle = await createRecipientProof(signed, solve(checked.challengeHex, checked.targetHex), { now });
  const contract = await createRecipientProposal(identity, sourceProof, { ...input, accountType: 'erc1271' });
  smart = await attachRecipientSignature(contract, '0x0102', { now, verifyContractSignature: approvedContract });
});

test('recipient proof keeps the original v1 certificate exact and never issues a balance', async () => {
  assert.equal(JSON.stringify(sourceProof), sourceText);
  assert.equal(JSON.stringify(bundle.proposal.sourceProof), sourceText);
  assert.equal(bundle.proposal.manifest.sourceProofId, '0x' + sourceChecked.proofId);
  const verified = await verifyRecipientProof(bundle, { now });
  assert.equal(verified.valid, true); assert.equal(verified.walletAuthorized, true);
  assert.equal(verified.method, 'eoa-offline'); assert.equal(verified.allocationAtoms, '100000000000000');
  assert.equal(verified.spendable, false); assert.equal(verified.canonicalGenesis, false);
  assert.equal(verified.authority, 'self-signed-proposal-only'); assert.equal('balance' in verified, false);
  assert.equal(verified.status, 'verified-prelaunch-recipient-proposal');
  assert.deepEqual(await verifyRecipientProof(bundle, { now }), verified);
  const text = JSON.stringify(bundle);
  for (const privateValue of ['privateKey', 'password', identity.privateKey.d, identity.username, 'rpcUrl', '127.0.0.1', '10.0.0.']) assert.equal(text.includes(privateValue), false, privateValue);
});

test('fixed typed data is human-readable, domain-bound, and commits to the creator authorization', async () => {
  const data = await recipientTypedData(proposal, { now });
  assert.equal(data.domain.name, 'Doodleverse Founder Recipient'); assert.equal(data.domain.version, '2');
  assert.equal(data.domain.chainId, input.chainId); assert.equal('verifyingContract' in data.domain, false);
  assert.deepEqual(data.types.EIP712Domain.map(field => field.name), ['name', 'version', 'chainId', 'salt']);
  assert.equal(data.primaryType, 'DoodleverseRecipient'); assert.equal(data.message.statement, RECIPIENT_STATEMENT);
  assert.equal(data.message.recipient, address); assert.equal(data.message.allocationCoins, '1000000');
  assert.equal(data.message.validUntil, new Date(now + 86400000).toISOString());
  assert.equal(data.message.expiresAt, String(now + 86400000));
  const commitment = createHash('sha256').update(canonical({ manifest: proposal.manifest, creatorSignature: proposal.creatorSignature })).digest('hex');
  assert.equal(data.message.creatorAuthorizationHash, '0x' + commitment);
  assert.equal(data.message.audience, 'https://github.com/moswald14/doodletick');
});

test('work uses a new domain and both approvals; old work cannot simply be relabeled', async () => {
  const prefix = createHash('sha256').update(RECIPIENT_WORK_DOMAIN + '\n' + canonical(signed)).digest('hex');
  assert.equal(checked.challengeHex, prefix); assert.notEqual(prefix, sourceChecked.challengeHex);
  const relabeled = copy(bundle); relabeled.proof = copy(sourceProof.proof);
  await assert.rejects(verifyRecipientProof(relabeled, { now }), /work proof/i);
  const moved = copy(bundle); moved.proposal = smart;
  await assert.rejects(verifyRecipientProof(moved, { now, verifyContractSignature: approvedContract }), /work proof/i);
  const changed = copy(signed); changed.walletSignature = '0x' + '00'.repeat(65);
  await assert.rejects(verifyRecipientAuthorization(changed, { now }));
});

test('same creator key and recipient wallet must both authorize the exact proposal', async () => {
  const otherIdentity = await newIdentity('OtherRecipient');
  await assert.rejects(createRecipientProposal(otherIdentity, sourceProof, input), /original creator/);
  await assert.rejects(createRecipientProposal({ ...identity, privateKey: otherIdentity.privateKey }, sourceProof, input), /same creator/);
  await assert.rejects(attachRecipientSignature(proposal, await walletSignature(proposal, otherKey), { now }), /does not match/);
  await assert.rejects(attachRecipientSignature(signed, signed.walletSignature, { now }), /already has/);
  await assert.rejects(verifyRecipientAuthorization(proposal, { now }), /has not signed/);
});

test('creator signatures bind recipient, chain, verification block, nonce and proof rules', async () => {
  const mutations = [
    value => { value.manifest.recipient.address = computeAddress(otherKey.publicKey).toLowerCase(); },
    value => { value.manifest.recipient.chainId = '1'; },
    value => { value.manifest.verificationBlock.number = '12346'; },
    value => { value.manifest.verificationBlock.hash = '0x' + 'cd'.repeat(32); },
    value => { value.manifest.nonce = '0x' + 'cd'.repeat(32); },
    value => { value.manifest.accountType = 'erc1271'; },
    value => { value.manifest.issuedAt--; },
    value => { value.manifest.expiresAt--; },
    value => { value.manifest.pow.difficulty = 17; value.manifest.pow.targetHex = targetForDifficulty(17); },
  ];
  for (const mutate of mutations) {
    const changed = copy(signed); mutate(changed);
    await assert.rejects(verifyRecipientAuthorization(changed, { now, verifyContractSignature: approvedContract }));
  }
  const changed = copy(signed); changed.manifest.nonce = '0x' + 'cd'.repeat(32); await resign(changed);
  await assert.rejects(verifyRecipientAuthorization(changed, { now }), /Wallet signature/);
});

test('source, supply, domain and extra private fields are rejected even before wallet recovery', async () => {
  for (const [field, value] of [['sourceProofId', '0x' + '00'.repeat(32)], ['allocationAtoms', '100000000000001'],
    ['decimals', 18], ['symbol', 'ETH'], ['audience', 'https://example.invalid'], ['network', 'mainnet'], ['purpose', 'transfer']]) {
    const changed = copy(signed); changed.manifest[field] = value;
    await assert.rejects(verifyRecipientAuthorization(changed, { now }), undefined, field);
  }
  for (const location of [value => value, value => value.manifest, value => value.sourceProof.proposal, value => value.manifest.recipient, value => value.manifest.pow]) {
    const changed = copy(signed); location(changed).privateKey = { d: 'do-not-export' };
    await assert.rejects(verifyRecipientAuthorization(changed, { now }));
  }
  const changed = copy(bundle); changed.proof.verified = true;
  await assert.rejects(verifyRecipientProof(changed, { now }), /Unexpected fields/);
});

test('authorization is limited to 24 hours with exact expiry and not-before boundaries', async () => {
  assert.equal((await verifyRecipientAuthorization(signed, { now: now + 86399999, requireFresh: true })).fresh, true);
  await assert.rejects(verifyRecipientAuthorization(signed, { now: now + 86400000, requireFresh: true }), /expired/);
  await assert.rejects(verifyRecipientAuthorization(signed, { now: now - 1, requireFresh: true }), /not yet valid/);
  await assert.rejects(attachRecipientSignature(proposal, signed.walletSignature, { now: now + 86400000 }), /expired/);
  await assert.rejects(createRecipientProof(signed, bundle.proof.nonce, { now: now + 86400000 }), /expired/);
  for (const change of [m => { m.expiresAt++; }, m => { m.expiresAt = m.issuedAt; }, m => { m.issuedAt = -1; }, m => { m.expiresAt = Infinity; }]) {
    const invalid = copy(signed); change(invalid.manifest); await assert.rejects(verifyRecipientAuthorization(invalid, { now }));
  }
});

test('archival integrity is distinct from a fresh authorization and never proves historical adoption', async () => {
  const expired = await verifyRecipientProof(bundle, { now: now + 86400001 });
  assert.equal(expired.valid, true); assert.equal(expired.expired, true); assert.equal(expired.fresh, false);
  assert.equal(expired.canonicalGenesis, false); assert.equal(expired.spendable, false);
  const future = await verifyRecipientProof(bundle, { now: now - 1 });
  assert.equal(future.notYetValid, true); assert.equal(future.fresh, false);
  assert.equal(expired.proofId, (await verifyRecipientProof(bundle, { now })).proofId);
  const parsed = await parseRecipientFile(JSON.stringify(bundle), { now: now + 86400000 });
  assert.equal(parsed.verified.expired, true);
});

test('a contract reply arriving at the expiry boundary cannot create fresh authorization', async context => {
  let clock = now + RECIPIENT_LIMITS.lifetimeMs - 1;
  context.mock.method(Date, 'now', () => clock);
  const pending = deferred(), entered = deferred();
  const task = verifyRecipientAuthorization(smart, { requireFresh: true, verifyContractSignature: request => {
    entered.resolve(request); return pending.promise;
  } });
  const request = await entered.promise; clock++;
  pending.resolve(approvedContract(request));
  await assert.rejects(task, /expired/);
});

test('unsigned proposals import as creator-only and canonical object ordering is stable', async () => {
  const parsed = await parseRecipientFile(JSON.stringify(proposal), { now });
  assert.equal(parsed.kind, 'proposal'); assert.equal(parsed.verified.walletAuthorized, false);
  const reordered = Object.fromEntries(Object.entries(signed).reverse());
  reordered.manifest = Object.fromEntries(Object.entries(signed.manifest).reverse());
  assert.equal((await verifyRecipientAuthorization(reordered, { now })).challengeHex, checked.challengeHex);
  const signedImport = await parseRecipientFile(JSON.stringify(signed), { now });
  assert.equal(signedImport.verified.walletAuthorized, true);
  await assert.rejects(parseRecipientFile(sourceText), /Original v1 files remain separate/);
});

test('smart wallets need a new read-only exact-chain and exact-block result every time', async () => {
  await assert.rejects(verifyRecipientAuthorization(smart, { now }), { code: 'RECIPIENT_ONLINE_REQUIRED' });
  await assert.rejects(parseRecipientFile(JSON.stringify(smart), { now }), { code: 'RECIPIENT_ONLINE_REQUIRED' });
  let calls = 0;
  const verifyContractSignature = request => {
    calls++; assert.equal(request.address, address); assert.equal(request.chainId, '8453');
    assert.equal(request.blockNumber, verificationBlock.number); assert.equal(request.blockHash, verificationBlock.hash);
    assert.match(request.digest, /^0x[0-9a-f]{64}$/); assert.equal(request.signature, '0x0102');
    assert.equal(request.signal.aborted, false); return approvedContract(request);
  };
  const first = await verifyRecipientAuthorization(smart, { now, verifyContractSignature });
  const second = await verifyRecipientAuthorization(smart, { now, verifyContractSignature });
  assert.equal(calls, 2); assert.equal(first.method, 'erc1271'); assert.deepEqual(first, second);
  for (const alter of [result => { result.verified = false; }, result => { result.method = 'eoa-offline'; },
    result => { result.chainId = '1'; }, result => { result.blockNumber = '12346'; }, result => { result.blockHash = '0x' + '01'.repeat(32); }]) {
    await assert.rejects(verifyRecipientAuthorization(smart, { now, verifyContractSignature: request => {
      const result = approvedContract(request); alter(result); return result;
    } }), /exact chain and block/);
  }
});

test('fixed ERC1271 encoding calls only isValidSignature(bytes32,bytes)', async () => {
  const data = await recipientTypedData(smart, { now });
  const digest = TypedDataEncoder.hash(data.domain, { DoodleverseRecipient: data.types.DoodleverseRecipient }, data.message);
  const call = encodeRecipient1271Call({ digest, signature: smart.walletSignature });
  assert.equal(call.slice(0, 10), '0x1626ba7e');
  const decoded = AbiCoder.defaultAbiCoder().decode(['bytes32', 'bytes'], '0x' + call.slice(10));
  assert.equal(decoded[0], digest); assert.equal(decoded[1], smart.walletSignature);
  assert.throws(() => encodeRecipient1271Call({ digest: '0x12', signature: '0x01' }));
});

test('unsupported wrapped and delegated account formats fail closed before invoking a hook', async () => {
  let calls = 0;
  for (const original of [proposal, { ...smart, walletSignature: null }]) {
    await assert.rejects(attachRecipientSignature(original, '0x1234' + '6492'.repeat(16), { now,
      verifyContractSignature: () => { calls++; return { verified: true }; } }), /ERC-6492/);
  }
  assert.equal(calls, 0);
  for (const accountType of ['7702', 'eip7702', 'erc6492', 'contract', null]) await assert.rejects(createRecipientProposal(identity, sourceProof, { ...input, accountType }), /Unsupported wallet type/);
  const changed = copy(smart); changed.walletSignature = '0x' + '00'.repeat(8193);
  await assert.rejects(verifyRecipientAuthorization(changed, { now, verifyContractSignature: approvedContract }), /oversized/);
});

test('canonical account, quantity and signature formats cannot silently change meaning', async () => {
  assert.equal(normalizeRecipientAddress(computeAddress(signingKey.publicKey)), address);
  for (const invalid of ['0x' + '0'.repeat(40), 'alice.eth', address.slice(2), '0x1234']) assert.throws(() => normalizeRecipientAddress(invalid));
  for (const chainId of [1, '0', '01', '-1', '0x1', (1n << 256n).toString()]) await assert.rejects(createRecipientProposal(identity, sourceProof, { ...input, chainId }));
  for (const block of [{ ...verificationBlock, number: '012345' }, { ...verificationBlock, hash: verificationBlock.hash.toUpperCase() }, { ...verificationBlock, rpcUrl: 'https://example.invalid' }]) await assert.rejects(createRecipientProposal(identity, sourceProof, { ...input, verificationBlock: block }));
  for (const signature of ['0x', '0x1', '0x' + '00'.repeat(65), signed.walletSignature + '00']) await assert.rejects(attachRecipientSignature(proposal, signature, { now }));
  const noncanonical = copy(signed); noncanonical.walletSignature = signed.walletSignature.slice(0, -2) + (parseInt(signed.walletSignature.slice(-2), 16) - 27).toString(16).padStart(2, '0');
  await assert.rejects(verifyRecipientAuthorization(noncanonical, { now }), /canonical/);
  const highS = copy(signed), curveOrder = 0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n;
  const reflectedS = (curveOrder - BigInt('0x' + signed.walletSignature.slice(66, 130))).toString(16).padStart(64, '0');
  highS.walletSignature = signed.walletSignature.slice(0, 66) + reflectedS + (signed.walletSignature.endsWith('1b') ? '1c' : '1b');
  await assert.rejects(verifyRecipientAuthorization(highS, { now }), /non-canonical s/);
});

test('proof parser rejects duplicate and escaped-alias keys, oversized, deep and ambiguous JSON', async () => {
  const text = JSON.stringify(bundle);
  for (const duplicate of [text.replace('"format":', '"format":"ignored","format":'),
    text.replace('"format":', '"for\\u006dat":"ignored","format":'),
    text.replace('"chainId":', '"chainId":"1","chainId":')]) await assert.rejects(parseRecipientFile(duplicate, { now }), /Duplicate JSON key/);
  for (const invalid of ['{', text + '{}', '{"__proto__":{},"__proto__":{}}']) await assert.rejects(parseRecipientFile(invalid, { now }), /unambiguous JSON/);
  await assert.rejects(parseRecipientFile(' '.repeat(65537)), /64 KB/);
  await assert.rejects(parseRecipientFile('😀'.repeat(17000)), /64 KB/);
  await assert.rejects(parseRecipientFile('['.repeat(18) + '0' + ']'.repeat(18)), /deeply nested/);
  await assert.rejects(parseRecipientFile(JSON.stringify(Array(310).fill(0)), { now }), /complex/);
  assert.equal((await parseRecipientFile(' \n' + JSON.stringify(bundle, null, 2) + '\t', { now })).kind, 'proof');
});

test('proof digest, algorithm, nonce and work target are all checked independently', async () => {
  for (const mutate of [value => { value.proof.digest = 'f'.repeat(64); }, value => { value.proof.algorithm = 'SHA-256d'; },
    value => { value.proof.nonce = '01'; }, value => { value.proof.nonce = 1; }]) {
    const changed = copy(bundle); mutate(changed); await assert.rejects(verifyRecipientProof(changed, { now }));
  }
  let invalid = '0'; while (meetsTarget(await proofDigest(checked.challengeHex, invalid), checked.targetHex)) invalid = String(Number(invalid) + 1);
  await assert.rejects(createRecipientProof(signed, invalid, { now }), /target/);
});

test('verification snapshots caller data before asynchronous contract checks', async () => {
  const pending = deferred(), entered = deferred(), value = copy(smart);
  const task = verifyRecipientAuthorization(value, { now, verifyContractSignature: request => {
    entered.resolve(request); return pending.promise;
  } });
  const request = await entered.promise;
  value.manifest.recipient.address = computeAddress(otherKey.publicKey).toLowerCase();
  value.walletSignature = '0x9999'; pending.resolve(approvedContract(request));
  const result = await task;
  assert.equal(result.address, address); assert.equal(result.challengeHex, (await verifyRecipientAuthorization(smart, { now, verifyContractSignature: approvedContract })).challengeHex);
});

test('canceling a pending contract check discards its late success and stops waiting', async () => {
  const pending = deferred(), entered = deferred(), controller = new AbortController();
  const task = verifyRecipientAuthorization(smart, { now, signal: controller.signal, verifyContractSignature: request => {
    entered.resolve(request); return pending.promise;
  } });
  const request = await entered.promise; controller.abort(new Error('Fixture canceled'));
  await assert.rejects(task, /Fixture canceled/); assert.equal(request.signal.aborted, true);
  pending.resolve(approvedContract(request));
  const preAborted = new AbortController(); preAborted.abort(); let calls = 0;
  await assert.rejects(verifyRecipientAuthorization(smart, { now, signal: preAborted.signal, verifyContractSignature: () => { calls++; } }), { name: 'AbortError' });
  assert.equal(calls, 0);
});

test('EOA typed-data primitive agrees with the published EIP-712 Mail digest vector', () => {
  const domain = { name: 'Ether Mail', version: '1', chainId: 1, verifyingContract: '0xCcCCccccCCCCcCCCCCCcCcCccCcCCCcCcccccccC' };
  const types = { Person: [{ name: 'name', type: 'string' }, { name: 'wallet', type: 'address' }],
    Mail: [{ name: 'from', type: 'Person' }, { name: 'to', type: 'Person' }, { name: 'contents', type: 'string' }] };
  const message = { from: { name: 'Cow', wallet: '0xCD2a3d9F938E13CD947Ec05AbC7FE734Df8DD826' },
    to: { name: 'Bob', wallet: '0xbBbBBBBbbBBBbbbBbbBbbbbBBbBbbbbBbBbbBBbB' }, contents: 'Hello, Bob!' };
  // https://eips.ethereum.org/EIPS/eip-712#test-cases
  assert.equal(TypedDataEncoder.hash(domain, types, message), '0xbe609aee343fb3c4b28e1df9e632fca64fcfaede20f02e86244efddf30957bd2');
});
