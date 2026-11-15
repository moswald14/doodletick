// SPDX-License-Identifier: GPL-3.0-only
// Prelaunch allocation certificates only. This module has no balance ledger or network issuer.
import { canonical, hash, sign, checkSignature, unb64, b64 } from './core.mjs';

export const COIN_RULES = Object.freeze({
  symbol: 'DVC', decimals: 8, allocationCoins: '1000000', allocationAtoms: '100000000000000',
  network: 'dvc-prelaunch-1', genesisVersion: 1, minDifficulty: 16, maxDifficulty: 24,
  defaultDifficulty: 20, maxBundleBytes: 32768, maxMiningMs: 60000, maxCandidates: 4194304,
});
export const MANIFEST_FORMAT = 'doodleverse-founder-manifest-v1';
export const PROPOSAL_FORMAT = 'doodleverse-founder-proposal-v1';
export const PROOF_FORMAT = 'doodleverse-founder-proof-v1';
export const SIGN_DOMAIN = 'doodleverse-founder-authorization-v1';
export const WORK_DOMAIN = 'doodleverse-founder-work-v1';
const encoder = new TextEncoder(), MAX_NONCE = (1n << 256n) - 1n;
const manifestKeys = ['format', 'status', 'network', 'genesisVersion', 'genesisStatus', 'createdAt', 'symbol', 'decimals', 'networkSupplyCapAtoms', 'allocationAtoms', 'allocation', 'futureIssuance', 'founderAddress', 'pow'];

function shape(value, expected, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) throw new Error(`Invalid ${label}.`);
  const keys = Object.keys(value).sort();
  if (keys.length !== expected.length || keys.some((key, i) => key !== [...expected].sort()[i])) throw new Error(`Unexpected fields in ${label}.`);
}
function encoded(value, label, min, max) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]+$/.test(value)) throw new Error(`Invalid ${label} encoding.`);
  const bytes = unb64(value);
  if (bytes.length < min || bytes.length > max || b64(bytes) !== value) throw new Error(`Invalid ${label} length or encoding.`);
  return bytes;
}
export function hex(bytes) { return Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, '0')).join(''); }
export function hexBytes(value) {
  if (typeof value !== 'string' || !/^[0-9a-f]{64}$/.test(value)) throw new Error('Expected a lowercase 32-byte hexadecimal digest.');
  return Uint8Array.from(value.match(/../g), byte => parseInt(byte, 16));
}
async function digestBytes(bytes) {
  if (!globalThis.crypto?.subtle) throw new Error('Proof verification needs HTTPS or localhost with browser cryptography.');
  return new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
}
async function digestText(text) { return hex(await digestBytes(encoder.encode(text))); }
export function targetForDifficulty(difficulty) {
  if (!Number.isInteger(difficulty) || difficulty < COIN_RULES.minDifficulty || difficulty > COIN_RULES.maxDifficulty) throw new Error(`Choose difficulty ${COIN_RULES.minDifficulty}–${COIN_RULES.maxDifficulty}.`);
  return ((1n << BigInt(256 - difficulty)) - 1n).toString(16).padStart(64, '0');
}
export function nonceBytes(nonce) {
  if (typeof nonce !== 'string' || !/^(0|[1-9][0-9]{0,77})$/.test(nonce) || BigInt(nonce) > MAX_NONCE) throw new Error('Nonce must be a canonical unsigned 256-bit decimal string.');
  const bytes = new Uint8Array(32); let value = BigInt(nonce);
  for (let i = 31; i >= 0; i--) { bytes[i] = Number(value & 255n); value >>= 8n; }
  return bytes;
}
export async function founderAddressFor(publicKey) {
  encoded(publicKey, 'founder public key', 80, 200);
  return 'dvc-prelaunch:' + await hash(publicKey);
}
function validateManifest(manifest) {
  shape(manifest, manifestKeys, 'founder manifest');
  if (manifest.format !== MANIFEST_FORMAT || manifest.status !== 'prelaunch-proposal' || manifest.network !== COIN_RULES.network || manifest.genesisVersion !== COIN_RULES.genesisVersion ||
      manifest.symbol !== COIN_RULES.symbol || manifest.decimals !== COIN_RULES.decimals || manifest.networkSupplyCapAtoms !== null || manifest.allocationAtoms !== COIN_RULES.allocationAtoms ||
      manifest.allocation !== '100-percent-founder-certificate' || manifest.futureIssuance !== 'unadopted' || manifest.genesisStatus !== 'unadopted') throw new Error('Manifest does not match the fixed prelaunch founder-allocation certificate rules.');
  if (typeof manifest.createdAt !== 'string' || !Number.isFinite(Date.parse(manifest.createdAt)) || new Date(manifest.createdAt).toISOString() !== manifest.createdAt) throw new Error('Invalid declared creation time.');
  if (typeof manifest.founderAddress !== 'string' || !/^dvc-prelaunch:[A-Za-z0-9_-]{43}$/.test(manifest.founderAddress)) throw new Error('Invalid prelaunch founder address.');
  shape(manifest.pow, ['algorithm', 'difficulty', 'targetHex'], 'proof rules');
  if (manifest.pow.algorithm !== 'SHA-256' || manifest.pow.targetHex !== targetForDifficulty(manifest.pow.difficulty)) throw new Error('Proof target does not match the declared difficulty.');
}
export function canonicalManifest(manifest) { validateManifest(manifest); return canonical(manifest); }

export async function createFounderProposal(identity, { difficulty = COIN_RULES.defaultDifficulty, now = Date.now() } = {}) {
  if (!identity?.publicKey || !identity?.privateKey) throw new Error('Unlock your existing creator vault to sign a founder proposal.');
  const targetHex = targetForDifficulty(difficulty);
  if (!Number.isSafeInteger(now) || now < 0) throw new Error('Invalid proposal time.');
  const manifest = {
    format: MANIFEST_FORMAT, status: 'prelaunch-proposal', network: COIN_RULES.network, genesisVersion: COIN_RULES.genesisVersion, genesisStatus: 'unadopted',
    createdAt: new Date(now).toISOString(), symbol: COIN_RULES.symbol, decimals: COIN_RULES.decimals,
    networkSupplyCapAtoms: null, allocationAtoms: COIN_RULES.allocationAtoms, allocation: '100-percent-founder-certificate', futureIssuance: 'unadopted',
    founderAddress: await founderAddressFor(identity.publicKey), pow: { algorithm: 'SHA-256', difficulty, targetHex },
  };
  const proposal = { format: PROPOSAL_FORMAT, manifest, publicKey: identity.publicKey, signature: await sign({ domain: SIGN_DOMAIN, manifest }, identity.privateKey) };
  await verifyFounderProposal(proposal);
  return proposal;
}
export async function verifyFounderProposal(proposal) {
  shape(proposal, ['format', 'manifest', 'publicKey', 'signature'], 'signed proposal');
  if (proposal.format !== PROPOSAL_FORMAT) throw new Error('Unsupported signed proposal format.');
  validateManifest(proposal.manifest);
  encoded(proposal.publicKey, 'founder public key', 80, 200); encoded(proposal.signature, 'founder signature', 64, 64);
  if (proposal.manifest.founderAddress !== await founderAddressFor(proposal.publicKey)) throw new Error('Founder address does not match the signing key.');
  if (!await checkSignature({ domain: SIGN_DOMAIN, manifest: proposal.manifest }, proposal.signature, proposal.publicKey)) throw new Error('Founder signature is not valid for this proposal.');
  const manifestHash = await digestText(canonicalManifest(proposal.manifest));
  const proposalHash = await digestText(canonical(proposal));
  const challengeHex = await digestText(WORK_DOMAIN + '\n' + canonical(proposal));
  return { manifestHash, proposalHash, challengeHex, founderAddress: proposal.manifest.founderAddress,
    difficulty: proposal.manifest.pow.difficulty, targetHex: proposal.manifest.pow.targetHex,
    authority: 'self-signed-proposal-only', canonicalGenesis: false };
}
export async function proofChallenge(proposal) { return (await verifyFounderProposal(proposal)).challengeHex; }
export function proofMessage(challengeHex, nonce) {
  const bytes = new Uint8Array(64); bytes.set(hexBytes(challengeHex), 0); bytes.set(nonceBytes(nonce), 32); return bytes;
}
export async function proofDigest(challengeHex, nonce) { return hex(await digestBytes(proofMessage(challengeHex, nonce))); }
export function meetsTarget(digest, targetHex) { hexBytes(digest); hexBytes(targetHex); return BigInt('0x' + digest) <= BigInt('0x' + targetHex); }
export async function createFounderProof(proposal, nonce) {
  const verified = await verifyFounderProposal(proposal), digest = await proofDigest(verified.challengeHex, nonce);
  if (!meetsTarget(digest, verified.targetHex)) throw new Error('Candidate does not meet this signed proposal’s target.');
  return { format: PROOF_FORMAT, proposal: structuredClone(proposal), proof: { algorithm: 'SHA-256', nonce, digest } };
}
export async function verifyFounderProof(bundle) {
  shape(bundle, ['format', 'proposal', 'proof'], 'founder proof bundle');
  if (bundle.format !== PROOF_FORMAT) throw new Error('Unsupported founder proof format.');
  shape(bundle.proof, ['algorithm', 'nonce', 'digest'], 'work proof');
  if (bundle.proof.algorithm !== 'SHA-256') throw new Error('Unsupported work algorithm.');
  const verified = await verifyFounderProposal(bundle.proposal);
  const digest = await proofDigest(verified.challengeHex, bundle.proof.nonce);
  if (bundle.proof.digest !== digest || !meetsTarget(digest, verified.targetHex)) throw new Error('Work proof is invalid or does not meet the signed target.');
  return { valid: true, ...verified, digest, proofId: await digestText(canonical(bundle)), allocationAtoms: COIN_RULES.allocationAtoms,
    networkSupplyCapAtoms: null, futureIssuance: 'unadopted', genesisStatus: 'unadopted', spendable: false, status: 'verified-prelaunch-allocation-proposal' };
}
export async function parseFounderFile(text) {
  if (typeof text !== 'string' || encoder.encode(text).length > COIN_RULES.maxBundleBytes) throw new Error('Choose a founder proposal or proof smaller than 32 KB.');
  let parsed; try { parsed = JSON.parse(text); } catch { throw new Error('File is not valid JSON.'); }
  if (parsed?.format === PROOF_FORMAT) return { kind: 'proof', value: parsed, verified: await verifyFounderProof(parsed) };
  if (parsed?.format === PROPOSAL_FORMAT) return { kind: 'proposal', value: parsed, verified: await verifyFounderProposal(parsed) };
  throw new Error('This file is not a Doodleverse prelaunch proposal or proof.');
}
