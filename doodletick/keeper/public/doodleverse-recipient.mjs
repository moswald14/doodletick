// SPDX-License-Identifier: GPL-3.0-only
// Additive, non-spendable recipient proposals. The v1 certificate is immutable;
// no wallet/provider, network request, transaction, or private key export lives here.
import { canonical, sign, checkSignature, b64, unb64 } from './core.mjs';
import { COIN_RULES, PROOF_FORMAT as SOURCE_FORMAT, verifyFounderProof, targetForDifficulty, proofDigest, meetsTarget } from './doodleverse-coin.mjs';
import { getAddress, verifyTypedData, TypedDataEncoder, Signature, AbiCoder, id, sha256, toUtf8Bytes } from './recipient-crypto.mjs';

export const RECIPIENT_PROPOSAL_FORMAT = 'doodleverse-recipient-proposal-v2';
export const RECIPIENT_PROOF_FORMAT = 'doodleverse-recipient-proof-v2';
export const RECIPIENT_MANIFEST_FORMAT = 'doodleverse-recipient-manifest-v2';
export const RECIPIENT_CREATOR_DOMAIN = 'doodleverse-recipient-creator-v2';
export const RECIPIENT_WORK_DOMAIN = 'doodleverse-recipient-work-v2';
export const RECIPIENT_AUDIENCE = 'https://github.com/moswald14/doodletick';
export const RECIPIENT_LIMITS = Object.freeze({ lifetimeMs: 86400000, maxBytes: 65536, maxSignatureBytes: 8192, verificationMs: 15000 });
export const RECIPIENT_STATEMENT = 'Name this wallet as the intended recipient of one 1,000,000 DVC prelaunch founder allocation. This is not a transfer, token approval, spending permission, delegation, or live coin issuance.';
const UINT256 = (1n << 256n) - 1n, MAX_TIME = 8640000000000000;
const DOMAIN_SALT = id('doodleverse-recipient-authorization-v2');
const WRAPPED_6492 = '6492'.repeat(16);
const manifestFields = ['format', 'purpose', 'audience', 'network', 'sourceProofId', 'creatorAddress', 'recipient', 'accountType', 'verificationBlock', 'allocationAtoms', 'decimals', 'symbol', 'nonce', 'issuedAt', 'expiresAt', 'pow'];
const DOMAIN_FIELDS = [{ name: 'name', type: 'string' }, { name: 'version', type: 'string' }, { name: 'chainId', type: 'uint256' }, { name: 'salt', type: 'bytes32' }];
const RECIPIENT_FIELDS = [
  ['statement', 'string'], ['sourceProofId', 'bytes32'], ['creatorAddress', 'string'], ['recipient', 'address'], ['chainId', 'uint256'],
  ['allocationCoins', 'string'], ['allocationAtoms', 'uint256'], ['decimals', 'uint8'], ['symbol', 'string'], ['audience', 'string'],
  ['nonce', 'bytes32'], ['issuedAt', 'uint64'], ['expiresAt', 'uint64'], ['validUntil', 'string'], ['creatorAuthorizationHash', 'bytes32'],
].map(([name, type]) => ({ name, type }));

function aborted(signal) { signal?.throwIfAborted(); }
async function active(promise, signal) {
  aborted(signal); if (!signal) return promise;
  let abort;
  try {
    const result = await Promise.race([promise, new Promise((_, reject) => {
      abort = () => reject(signal.reason ?? new DOMException('Aborted', 'AbortError'));
      signal.addEventListener('abort', abort, { once: true }); if (signal.aborted) abort();
    })]);
    aborted(signal); return result;
  } finally { signal.removeEventListener('abort', abort); }
}
function shape(value, fields, name) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) throw Error(`Invalid ${name}.`);
  const keys = Object.keys(value).sort(), expected = [...fields].sort();
  if (keys.length !== expected.length || keys.some((key, i) => key !== expected[i])) throw Error(`Unexpected fields in ${name}.`);
}
function snapshot(value) {
  let copy, text;
  try { copy = structuredClone(value); text = JSON.stringify(copy); } catch { throw Error('Recipient data must be bounded public JSON.'); }
  if (typeof text !== 'string' || toUtf8Bytes(text).length > RECIPIENT_LIMITS.maxBytes) throw Error('Recipient file exceeds 64 KB.');
  return copy;
}
function numberString(value, name, positive = false) {
  if (typeof value !== 'string' || !/^(0|[1-9][0-9]{0,77})$/.test(value) || BigInt(value) > UINT256 || positive && value === '0') throw Error(`Invalid canonical ${name}.`);
  return value;
}
function hash32(value, name) {
  if (typeof value !== 'string' || !/^0x[0-9a-f]{64}$/.test(value)) throw Error(`Invalid ${name}.`);
  return value;
}
function time(value) { if (!Number.isSafeInteger(value) || value < 0 || value > MAX_TIME) throw Error('Invalid authorization time.'); return value; }
export function normalizeRecipientAddress(value) {
  if (typeof value !== 'string' || !/^0x[0-9a-fA-F]{40}$/.test(value)) throw Error('Choose a full Ethereum wallet address.');
  const normalized = getAddress(value).toLowerCase();
  if (normalized === '0x' + '0'.repeat(40)) throw Error('The recipient must be a nonzero wallet address.');
  return normalized;
}
function validate(proposal) {
  shape(proposal, ['format', 'sourceProof', 'manifest', 'creatorSignature', 'walletSignature'], 'recipient proposal');
  if (proposal.format !== RECIPIENT_PROPOSAL_FORMAT || proposal.sourceProof?.format !== SOURCE_FORMAT) throw Error('Unsupported recipient or source proof format.');
  const m = proposal.manifest;
  shape(m, manifestFields, 'recipient manifest');
  if (m.format !== RECIPIENT_MANIFEST_FORMAT || m.purpose !== 'prelaunch-recipient-proposal-only' || m.audience !== RECIPIENT_AUDIENCE || m.network !== COIN_RULES.network ||
    m.allocationAtoms !== COIN_RULES.allocationAtoms || m.decimals !== COIN_RULES.decimals || m.symbol !== COIN_RULES.symbol) throw Error('Recipient allocation does not match the fixed prelaunch rules.');
  hash32(m.sourceProofId, 'source proof ID'); hash32(m.nonce, 'authorization nonce');
  if (typeof m.creatorAddress !== 'string' || !/^dvc-prelaunch:[A-Za-z0-9_-]{43}$/.test(m.creatorAddress)) throw Error('Invalid creator address.');
  shape(m.recipient, ['namespace', 'chainId', 'address'], 'recipient account');
  if (m.recipient.namespace !== 'eip155' || normalizeRecipientAddress(m.recipient.address) !== m.recipient.address) throw Error('Use a canonical eip155 recipient account.');
  numberString(m.recipient.chainId, 'chain ID', true);
  if (!['eoa', 'erc1271'].includes(m.accountType)) throw Error('Unsupported wallet type. ERC-6492 and EIP-7702 accounts are not supported in this version.');
  shape(m.verificationBlock, ['number', 'hash'], 'verification block');
  numberString(m.verificationBlock.number, 'block number'); hash32(m.verificationBlock.hash, 'block hash');
  time(m.issuedAt); time(m.expiresAt);
  if (m.expiresAt <= m.issuedAt || m.expiresAt - m.issuedAt > RECIPIENT_LIMITS.lifetimeMs) throw Error('Recipient authorization must last at most 24 hours.');
  shape(m.pow, ['algorithm', 'difficulty', 'targetHex'], 'recipient proof rules');
  if (m.pow.algorithm !== 'SHA-256' || m.pow.targetHex !== targetForDifficulty(m.pow.difficulty)) throw Error('Invalid signed proof target.');
  if (typeof proposal.creatorSignature !== 'string' || !/^[A-Za-z0-9_-]{86}$/.test(proposal.creatorSignature) || b64(unb64(proposal.creatorSignature)) !== proposal.creatorSignature) throw Error('Invalid creator signature encoding.');
  if (proposal.walletSignature !== null) validateWalletSignature(proposal.walletSignature, m.accountType);
  return m;
}
function validateWalletSignature(signature, accountType) {
  if (typeof signature !== 'string' || !/^0x(?:[0-9a-f]{2})+$/.test(signature) || signature.length > 2 + RECIPIENT_LIMITS.maxSignatureBytes * 2) throw Error('Invalid or oversized wallet signature.');
  if (signature.endsWith(WRAPPED_6492)) throw Error('ERC-6492 undeployed or wrapped wallet signatures are not supported. No wallet was deployed.');
  if (accountType === 'eoa' && (signature.length !== 132 || Signature.from(signature).serialized.toLowerCase() !== signature)) throw Error('Use a canonical 65-byte EOA signature.');
}
export function recipientContext(value) {
  const proposal = snapshot(value), m = validate(proposal);
  return { address: m.recipient.address, chainId: m.recipient.chainId, verificationBlock: { ...m.verificationBlock }, accountType: m.accountType, sourceProofId: m.sourceProofId };
}
function freshness(m, now, requireFresh) {
  time(now); const expired = now >= m.expiresAt, notYetValid = now < m.issuedAt;
  if (requireFresh && (expired || notYetValid)) throw Error(expired ? 'Recipient authorization expired. Create and approve a new proposal.' : 'Recipient authorization is not yet valid. Check the clock.');
  return { expiresAt: m.expiresAt, issuedAt: m.issuedAt, expired, notYetValid, fresh: !expired && !notYetValid };
}
async function prepared(proposal, { now = Date.now(), requireFresh = false, signal } = {}) {
  aborted(signal); const m = validate(proposal);
  const source = await active(verifyFounderProof(proposal.sourceProof), signal);
  if ('0x' + source.proofId !== m.sourceProofId || source.founderAddress !== m.creatorAddress) throw Error('The recipient proposal does not match its unchanged source proof.');
  if (!await active(checkSignature({ domain: RECIPIENT_CREATOR_DOMAIN, manifest: m }, proposal.creatorSignature, proposal.sourceProof.proposal.publicKey), signal)) throw Error('Recipient proposal needs the same creator key as its source proof.');
  return { valid: true, walletAuthorized: false, ...recipientContext(proposal), creatorAddress: m.creatorAddress,
    ...freshness(m, now, requireFresh), difficulty: m.pow.difficulty, targetHex: m.pow.targetHex,
    spendable: false, canonicalGenesis: false, authority: 'self-signed-proposal-only', allocationAtoms: COIN_RULES.allocationAtoms };
}
export async function createRecipientProposal(identity, sourceProof, { address, chainId, verificationBlock, accountType, difficulty = 20, now = Date.now(), signal } = {}) {
  aborted(signal); time(now);
  if (now > MAX_TIME - RECIPIENT_LIMITS.lifetimeMs) throw Error('Invalid authorization time.');
  const source = snapshot(sourceProof), verified = await active(verifyFounderProof(source), signal);
  if (!identity?.privateKey || identity.publicKey !== source.proposal.publicKey) throw Error('Unlock the original creator vault for this source proof.');
  const nonce = new Uint8Array(32); crypto.getRandomValues(nonce);
  const manifest = { format: RECIPIENT_MANIFEST_FORMAT, purpose: 'prelaunch-recipient-proposal-only', audience: RECIPIENT_AUDIENCE,
    network: COIN_RULES.network, sourceProofId: '0x' + verified.proofId, creatorAddress: verified.founderAddress,
    recipient: { namespace: 'eip155', chainId, address: normalizeRecipientAddress(address) }, accountType,
    verificationBlock: snapshot(verificationBlock), allocationAtoms: COIN_RULES.allocationAtoms, decimals: COIN_RULES.decimals, symbol: COIN_RULES.symbol,
    nonce: '0x' + Array.from(nonce, n => n.toString(16).padStart(2, '0')).join(''), issuedAt: now, expiresAt: now + RECIPIENT_LIMITS.lifetimeMs,
    pow: { algorithm: 'SHA-256', difficulty, targetHex: targetForDifficulty(difficulty) } };
  const proposal = { format: RECIPIENT_PROPOSAL_FORMAT, sourceProof: source, manifest,
    creatorSignature: await active(sign({ domain: RECIPIENT_CREATOR_DOMAIN, manifest }, identity.privateKey), signal), walletSignature: null };
  await prepared(proposal, { now, requireFresh: true, signal }); return proposal;
}
function typed(proposal) {
  const m = proposal.manifest;
  return { domain: { name: 'Doodleverse Founder Recipient', version: '2', chainId: m.recipient.chainId, salt: DOMAIN_SALT },
    types: { EIP712Domain: DOMAIN_FIELDS.map(v => ({ ...v })), DoodleverseRecipient: RECIPIENT_FIELDS.map(v => ({ ...v })) }, primaryType: 'DoodleverseRecipient',
    message: { statement: RECIPIENT_STATEMENT, sourceProofId: m.sourceProofId, creatorAddress: m.creatorAddress, recipient: m.recipient.address,
      chainId: m.recipient.chainId, allocationCoins: COIN_RULES.allocationCoins, allocationAtoms: m.allocationAtoms, decimals: m.decimals,
      symbol: m.symbol, audience: m.audience, nonce: m.nonce, issuedAt: String(m.issuedAt), expiresAt: String(m.expiresAt), validUntil: new Date(m.expiresAt).toISOString(),
      creatorAuthorizationHash: sha256(toUtf8Bytes(canonical({ manifest: m, creatorSignature: proposal.creatorSignature }))) } };
}
const ethersTypes = data => ({ DoodleverseRecipient: data.types.DoodleverseRecipient });
export async function recipientTypedData(value, options = {}) {
  const proposal = snapshot(value); await prepared(proposal, options); return typed(proposal);
}
export function encodeRecipient1271Call({ digest, signature }) {
  hash32(digest, 'typed-data digest'); validateWalletSignature(signature, 'erc1271');
  return '0x1626ba7e' + AbiCoder.defaultAbiCoder().encode(['bytes32', 'bytes'], [digest, signature]).slice(2);
}
export async function verifyRecipientAuthorization(value, { verifyContractSignature, now = Date.now(), requireFresh = false, signal } = {}) {
  const proposal = snapshot(value), verified = await prepared(proposal, { now, requireFresh, signal }), m = proposal.manifest;
  if (proposal.walletSignature === null) throw Error('The recipient wallet has not signed this proposal.');
  const data = typed(proposal), digest = TypedDataEncoder.hash(data.domain, ethersTypes(data), data.message);
  let method;
  if (m.accountType === 'eoa') {
    if (normalizeRecipientAddress(verifyTypedData(data.domain, ethersTypes(data), data.message, proposal.walletSignature)) !== m.recipient.address) throw Error('Wallet signature does not match the signed recipient.');
    method = 'eoa-offline';
  } else {
    if (typeof verifyContractSignature !== 'function') throw Object.assign(Error('ERC-1271 verification needs an explicit read-only connection to this wallet chain and block. This file is not yet wallet-verified.'), { code: 'RECIPIENT_ONLINE_REQUIRED' });
    const controller = new AbortController(), timer = setTimeout(() => controller.abort(new Error('Wallet contract verification timed out.')), RECIPIENT_LIMITS.verificationMs);
    const combined = signal ? AbortSignal.any([signal, controller.signal]) : controller.signal;
    try {
      const checked = await active(Promise.resolve().then(() => verifyContractSignature({ address: m.recipient.address, chainId: m.recipient.chainId,
        blockNumber: m.verificationBlock.number, blockHash: m.verificationBlock.hash, digest, signature: proposal.walletSignature, signal: combined })), combined);
      if (checked?.verified !== true || checked.method !== 'erc1271' || checked.chainId !== m.recipient.chainId ||
        checked.blockNumber !== m.verificationBlock.number || checked.blockHash !== m.verificationBlock.hash) throw Error('Wallet contract verification did not confirm this exact chain and block.');
      method = 'erc1271';
    } finally { clearTimeout(timer); }
  }
  aborted(signal);
  // Callers use their own monotonic session guard too. Real-time freshness is
  // rechecked after asynchronous RPC unless a deterministic test clock is given.
  const finishedAt = arguments[1]?.now === undefined ? Date.now() : now;
  return { ...verified, ...freshness(m, finishedAt, requireFresh), walletAuthorized: true, method, typedDataDigest: digest,
    challengeHex: sha256(toUtf8Bytes(RECIPIENT_WORK_DOMAIN + '\n' + canonical(proposal))).slice(2) };
}
export async function attachRecipientSignature(value, signature, options = {}) {
  const proposal = snapshot(value); validate(proposal);
  if (proposal.walletSignature !== null) throw Error('This proposal already has a wallet signature. Create a new proposal to replace it.');
  if (typeof signature !== 'string') throw Error('Invalid wallet signature.');
  const lower = signature.toLowerCase(); validateWalletSignature(lower, 'erc1271');
  proposal.walletSignature = proposal.manifest.accountType === 'eoa' ? Signature.from(lower).serialized.toLowerCase() : lower;
  await verifyRecipientAuthorization(proposal, { ...options, requireFresh: true }); return proposal;
}
export async function createRecipientProof(value, nonce, options = {}) {
  const proposal = snapshot(value), verified = await verifyRecipientAuthorization(proposal, { ...options, requireFresh: true });
  const digest = await active(proofDigest(verified.challengeHex, nonce), options.signal);
  freshness(proposal.manifest, options.now ?? Date.now(), true);
  if (!meetsTarget(digest, verified.targetHex)) throw Error('Work does not meet this wallet-bound proposal target.');
  return { format: RECIPIENT_PROOF_FORMAT, proposal, proof: { algorithm: 'SHA-256', nonce, digest } };
}
export async function verifyRecipientProof(value, options = {}) {
  const bundle = snapshot(value); shape(bundle, ['format', 'proposal', 'proof'], 'recipient proof');
  if (bundle.format !== RECIPIENT_PROOF_FORMAT) throw Error('Unsupported recipient proof format.');
  shape(bundle.proof, ['algorithm', 'nonce', 'digest'], 'recipient work proof');
  if (bundle.proof.algorithm !== 'SHA-256') throw Error('Unsupported recipient work algorithm.');
  const verified = await verifyRecipientAuthorization(bundle.proposal, options);
  const digest = await active(proofDigest(verified.challengeHex, bundle.proof.nonce), options.signal);
  if (bundle.proof.digest !== digest || !meetsTarget(digest, verified.targetHex)) throw Error('Wallet-bound work proof is invalid.');
  return { ...verified, ...freshness(bundle.proposal.manifest, options.now ?? Date.now(), options.requireFresh === true), digest,
    proofId: sha256(toUtf8Bytes(canonical(bundle))).slice(2), status: 'verified-prelaunch-recipient-proposal' };
}
export async function parseRecipientFile(text, options = {}) {
  if (typeof text !== 'string' || toUtf8Bytes(text).length > RECIPIENT_LIMITS.maxBytes) throw Error('Choose a recipient file no larger than 64 KB.');
  let value; try { value = strictJson(text); } catch (error) { throw Error('Recipient file is not valid unambiguous JSON: ' + error.message); }
  if (value?.format === RECIPIENT_PROOF_FORMAT) return { kind: 'proof', value, verified: await verifyRecipientProof(value, options) };
  if (value?.format === RECIPIENT_PROPOSAL_FORMAT) return { kind: 'proposal', value, verified: value.walletSignature === null
    ? await prepared(snapshot(value), options) : await verifyRecipientAuthorization(value, options) };
  throw Error('This is not a supported recipient proposal or proof. Original v1 files remain separate.');
}

// JSON.parse discards duplicate keys. Reject them (including escaped aliases)
// before a signed document can be displayed, held for online checks or exported.
function strictJson(text) {
  const parsed = JSON.parse(text); let at = 0, nodes = 0;
  const space = () => { while (/[\t\n\r ]/.test(text[at] ?? '\0')) at++; };
  const string = () => {
    const start = at++;
    while (at < text.length) {
      const character = text[at++];
      if (character === '\\') at++;
      else if (character === '"') return JSON.parse(text.slice(start, at));
    }
    throw Error('Unterminated string.');
  };
  function walk(depth = 0) {
    if (++nodes > 300 || depth > 16) throw Error('Document is too deeply nested or complex.');
    space();
    if (text[at] === '"') { string(); return; }
    if (text[at] === '{') {
      at++; space(); const keys = new Set();
      if (text[at] === '}') { at++; return; }
      do {
        space(); const key = string(); if (keys.has(key)) throw Error('Duplicate JSON key.'); keys.add(key);
        space(); at++; walk(depth + 1); space();
        if (text[at++] === '}') return;
      } while (at < text.length);
    } else if (text[at] === '[') {
      at++; space(); if (text[at] === ']') { at++; return; }
      do { walk(depth + 1); space(); if (text[at++] === ']') return; } while (at < text.length);
    } else { const match = /^(?:null|true|false|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/.exec(text.slice(at)); if (match) { at += match[0].length; return; } }
    throw Error('Invalid JSON value.');
  }
  walk(); space(); if (at !== text.length) throw Error('Trailing JSON data.'); return parsed;
}
