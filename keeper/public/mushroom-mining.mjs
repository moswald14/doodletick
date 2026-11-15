import { canonical, EPOCH } from './core.mjs';

export const MINING_FORMAT = 'doodletick-private-pow-v1';
export const MINING_RULES = Object.freeze({ difficulty: 15, reward: 1, lifetimeMs: 300000,
  maxNonce: 0xffffffff, activeMs: 8, restMs: 40, batchSize: 128 });
const HOUR = 3600000, encoder = new TextEncoder();
const fingerprint = value => typeof value === 'string' && /^[A-Za-z0-9_-]{43}$/.test(value);

// The challenge is also a signed garden envelope. Signature and owner checks
// happen at the UI/ledger boundary; this shared code fixes the work algorithm.
export function validMiningChallenge(r) {
  return Boolean(r && r.kind === 'mining-challenge' && r.algorithm === MINING_FORMAT &&
    fingerprint(r.issuer) && fingerprint(r.owner) && fingerprint(r.mushroom) &&
    typeof r.challengeId === 'string' && /^[A-Za-z0-9_-]{22}$/.test(r.challengeId) &&
    Number.isSafeInteger(r.ownershipRevision) && r.ownershipRevision >= 0 &&
    Number.isSafeInteger(r.issuedAt) && r.issuedAt >= EPOCH &&
    Number.isSafeInteger(r.expiresAt) && r.expiresAt > r.issuedAt &&
    r.expiresAt - r.issuedAt <= MINING_RULES.lifetimeMs &&
    r.hour === Math.floor((r.issuedAt - EPOCH) / HOUR) &&
    r.expiresAt <= EPOCH + (r.hour + 1) * HOUR &&
    r.difficulty === MINING_RULES.difficulty && r.reward === MINING_RULES.reward);
}

export const validMiningNonce = nonce => Number.isSafeInteger(nonce) && nonce >= 0 && nonce <= MINING_RULES.maxNonce;
export function meetsMiningTarget(bytes, bits = MINING_RULES.difficulty) {
  if (!(bytes instanceof Uint8Array) || bytes.length !== 32 || bits !== MINING_RULES.difficulty) return false;
  for (let bit = 0; bit < bits; bit++) if (bytes[bit >> 3] & (0x80 >> (bit & 7))) return false;
  return true;
}
const prefixFor = challenge => MINING_FORMAT + '\n' + canonical(challenge) + '\n';
export const miningDigest = async (prefix, nonce) => new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(prefix + nonce)));
export async function verifyMiningWork(challenge, nonce) {
  return validMiningChallenge(challenge) && validMiningNonce(nonce) && meetsMiningTarget(await miningDigest(prefixFor(challenge), nonce));
}

// One bounded search, never a mining loop across challenges. After each hash,
// a slice checks its 8 ms / 128-hash budget, then rests for at least 40 ms. This is a work
// scheduling bound, not a promise about the operating system's CPU meter.
export async function searchMiningWork(challenge, { remainingMs = challenge?.expiresAt - Date.now(),
  shouldStop = () => false, onProgress = () => {}, monotonic = () => performance.now(),
  pause = ms => new Promise(resolve => setTimeout(resolve, ms)), digest = miningDigest } = {}) {
  if (!validMiningChallenge(challenge) || !Number.isFinite(remainingMs) || remainingMs <= 0 || remainingMs > MINING_RULES.lifetimeMs) throw Error('The mining challenge expired or is unsupported.');
  const prefix = prefixFor(challenge), deadline = monotonic() + remainingMs;
  let nonce = 0, attempts = 0, reportedAt = -Infinity;
  while (!shouldStop() && monotonic() < deadline && nonce <= MINING_RULES.maxNonce) {
    const started = monotonic(); let count = 0;
    while (count < MINING_RULES.batchSize && monotonic() - started < MINING_RULES.activeMs && monotonic() < deadline && !shouldStop()) {
      const candidate = nonce++, bytes = await digest(prefix, candidate); attempts++; count++;
      if (shouldStop()) return { stopped: true, attempts };
      if (monotonic() >= deadline) break;
      if (meetsMiningTarget(bytes)) return { nonce: candidate, attempts };
      if (nonce > MINING_RULES.maxNonce) break;
    }
    if (monotonic() - reportedAt >= 250) { onProgress({ attempts }); reportedAt = monotonic(); }
    await pause(MINING_RULES.restMs);
  }
  if (shouldStop()) return { stopped: true, attempts };
  throw Error('This mining attempt expired. Press Start mining for a new challenge.');
}
