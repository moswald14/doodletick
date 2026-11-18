// Signed requests never expose a player's vault key to the game frame.
import { hash, sign, checkSignature, random, b64 } from './core.mjs';
export const DOTLANDS_FORMAT = 'doodletick-dotlands-v1';
export const DOTLANDS_PRICE = 1;
export const DOTLANDS_OPERATIONS = Object.freeze(['list', 'create', 'join', 'snapshot', 'start', 'action']);
const plain = value => value && typeof value === 'object' && !Array.isArray(value);
const key = value => typeof value === 'string' && /^[A-Za-z0-9_-]{43}$/.test(value);
export async function dotlandsRequest(identity, issuer, operation, args = {}, now = Date.now(), nonce = b64(random(16))) {
  const record = { format: DOTLANDS_FORMAT, issuer, owner: identity.fingerprint, operation, args, createdAt: now, nonce };
  return { record, publicKey: identity.publicKey, signature: await sign(record, identity.privateKey) };
}
export async function verifyDotlandsRequest(proof, issuer) {
  try {
    const r = proof.record;
    return plain(proof) && plain(r) && r.format === DOTLANDS_FORMAT && key(issuer) && r.issuer === issuer &&
      key(r.owner) && r.owner === await hash(proof.publicKey) && DOTLANDS_OPERATIONS.includes(r.operation) &&
      plain(r.args) && JSON.stringify(r.args).length <= 4096 && Number.isSafeInteger(r.createdAt) && r.createdAt > 0 &&
      typeof r.nonce === 'string' && /^[A-Za-z0-9_-]{22}$/.test(r.nonce) && await checkSignature(r, proof.signature, proof.publicKey);
  } catch { return false; }
}
export async function verifyDotlandsResponse(envelope, issuer, requestId) {
  try {
    const r = envelope.record;
    return plain(r) && r.format === DOTLANDS_FORMAT && r.issuer === issuer && await hash(envelope.publicKey) === issuer &&
      ['info', 'response'].includes(r.kind) && Number.isSafeInteger(r.time) &&
      (requestId === undefined || r.requestId === requestId) && await checkSignature(r, envelope.signature, envelope.publicKey);
  } catch { return false; }
}
