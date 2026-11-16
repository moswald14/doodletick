// SPDX-License-Identifier: GPL-3.0-only
import { b64, random, hash, checkSignature, EPOCH } from './core.mjs';

export const KEEPER_TIME_FORMAT = 'doodletick-keeper-time-v1';
export const validTimeNonce = value => typeof value === 'string' && /^[A-Za-z0-9_-]{22}$/.test(value);
const validTime = value => Number.isSafeInteger(value) && value >= EPOCH && value <= 253402300799999;
const fail = message => new Error(message);

/** A Keeper signature identifies the source; it is not proof of Internet UTC.
 * The fresh random nonce prevents a cached, previously signed answer from
 * becoming a new clock sample. No client wall-clock comparison is involved.
 */
export async function verifyTimeSample(envelope, { nonce, keeper, started, ended, maxRttMs = 2000 }) {
  const r = envelope?.record, rtt = ended - started;
  if (!Number.isFinite(started) || !Number.isFinite(ended) || rtt < 0 || rtt > maxRttMs) throw fail('The Keeper time response was too slow. Try syncing again.');
  if (!r || r.format !== KEEPER_TIME_FORMAT || r.nonce !== nonce || !validTimeNonce(nonce) ||
      r.issuer !== keeper?.fingerprint || envelope.publicKey !== keeper?.publicKey ||
      !validTime(r.receivedAt) || !validTime(r.sentAt) || r.sentAt < r.receivedAt ||
      r.sentAt - r.receivedAt > rtt + 2 || !await checkSignature(r, envelope.signature, keeper.publicKey)) {
    throw fail('The Keeper time response did not verify.');
  }
  // Four-timestamp midpoint estimate. The signature computation and any
  // asymmetric travel time are conservatively included in the uncertainty.
  const processing = r.sentAt - r.receivedAt;
  return { mono: ended, server: (r.receivedAt + r.sentAt + rtt) / 2,
    rttMs: rtt, uncertaintyMs: Math.max(0, rtt - processing) / 2 + 2 };
}

/** One same-origin Keeper is the authority. Nothing here updates an OS clock,
 * ledger, block timestamp or signed format. Call sync() at startup and about
 * once a minute; call invalidate() before resyncing after page suspension.
 */
export function createKeeperClock({
  fetchImpl = (...args) => fetch(...args), monotonicNow = () => performance.now(), wallNow = () => Date.now(),
  randomNonce = () => b64(random(16)), onChange = () => {},
  requestTimeoutMs = 5000, maxRttMs = 2000, staleAfterMs = 120000,
  setTimer = setTimeout, clearTimer = clearTimeout
} = {}) {
  if (![requestTimeoutMs, maxRttMs, staleAfterMs].every(v => Number.isFinite(v) && v > 0)) throw fail('Invalid clock limits.');
  const startMono = monotonicNow(), startWall = wallNow();
  if (!Number.isFinite(startMono) || !Number.isFinite(startWall)) throw fail('This browser has no usable clock.');
  let lastReadMono = startMono, lastReadWall = startWall, keeper = null, anchor = null;
  let display = startWall, displayMono = startMono, invalidReason = '', clockChanged = false;
  let stopped = false, syncing = false, generation = 0, controller = null, pending = null;
  let lastError = '', candidateChange = null, lastCorrectionMs = null, lastCorrectionMono = null;

  function cancel() { generation++; controller?.abort(); controller = null; syncing = false; pending = null; }
  function markInvalid(reason, changed = false) {
    cancel(); invalidReason = reason; clockChanged = changed;
  }
  function clocks() {
    const mono = monotonicNow(), wall = wallNow();
    if (!Number.isFinite(mono) || !Number.isFinite(wall) || mono < lastReadMono) {
      markInvalid('The elapsed-time clock changed. Sync again.', true);
      return { mono: lastReadMono, wall: lastReadWall };
    }
    // performance.now() can pause through system sleep on some platforms. A
    // wall/elapsed discrepancy invalidates authority rather than inventing
    // elapsed rewards or extending the freshness of a pre-sleep sample.
    if (Math.abs((wall - lastReadWall) - (mono - lastReadMono)) > 2000) {
      markInvalid('The device clock changed or the computer resumed. Sync again.', true);
    }
    lastReadMono = mono; lastReadWall = wall;
    return { mono, wall };
  }
  const estimate = mono => anchor ? anchor.server + Math.max(0, mono - anchor.mono) : startWall + Math.max(0, mono - startMono);
  function displayAt(mono) {
    const target = estimate(mono), elapsed = Math.max(0, mono - displayMono);
    // Smooth small jitter by running at 90–110% speed. A large correction is
    // instead confirmed and reanchored in runSync: hours lost through system
    // sleep must not take days to catch up. Rewards are guarded by the ledger,
    // not by promising that a display of corrected UTC can never move backward.
    display += Math.max(elapsed * .9, Math.min(elapsed * 1.1, target - display));
    displayMono = mono;
    return Math.floor(display);
  }
  function snapshot() {
    const { mono, wall } = clocks();
    const ageMs = anchor ? Math.max(0, mono - anchor.sampledAtMono) : null;
    const fresh = Boolean(anchor && !stopped && !invalidReason && ageMs <= staleAfterMs);
    const state = stopped ? (anchor ? 'stale' : 'unsynced') : syncing ? 'syncing' :
      clockChanged ? 'clock-changed' : fresh ? 'synced' : anchor ? 'stale' : 'unsynced';
    const raw = estimate(mono), shown = displayAt(mono);
    const lastCorrectionAgeMs = lastCorrectionMono === null ? null : Math.max(0, mono - lastCorrectionMono);
    const message = stopped ? 'Clock synchronization stopped.' : syncing ? 'Checking the Keeper clock…' :
      invalidReason || (!anchor ? lastError || 'Using device time until the Keeper verifies.' : !fresh ?
        lastError || 'Keeper time is stale. Sync before signing garden actions.' :
        lastCorrectionAgeMs !== null && lastCorrectionAgeMs <= staleAfterMs ?
          `Keeper clock corrected ${lastCorrectionMs < 0 ? 'backward' : 'forward'} after confirmation. The display now matches verified Keeper time.` :
          'Keeper time verified. The Keeper remains the source of this time.');
    return { state, fresh, now: shown, keeperNow: anchor ? Math.floor(raw) : null,
      issuer: keeper?.fingerprint ?? null, ageMs,
      uncertaintyMs: anchor ? Math.ceil(anchor.uncertaintyMs + ageMs * .0001) : null,
      offsetMs: anchor ? Math.round(raw - wall) : null, correctionMs: anchor ? Math.round(raw - shown) : null,
      lastCorrectionMs, lastCorrectionAgeMs, rttMs: anchor?.rttMs ?? null, message, error: lastError || null };
  }
  function emit() { const result = snapshot(); onChange(result); return result; }
  async function json(url, signal) {
    let timer, abortListener;
    const timeout = new Promise((_, reject) => {
      timer = setTimer(() => reject(fail('The Keeper clock request timed out.')), requestTimeoutMs);
      abortListener = () => reject(fail('Clock synchronization canceled.'));
      signal.addEventListener('abort', abortListener, { once: true });
    });
    try {
      return await Promise.race([(async () => {
        const response = await fetchImpl(url, { method: 'GET', credentials: 'same-origin', cache: 'no-store', redirect: 'error', signal });
        if (!response.ok) throw fail('The Keeper clock is unavailable.');
        const text = await response.text();
        if (text.length > 8192) throw fail('The Keeper clock response was too large.');
        return JSON.parse(text);
      })(), timeout]);
    } finally { clearTimer(timer); signal.removeEventListener('abort', abortListener); }
  }
  async function runSync(ticket, signal) {
    try {
      const source = await json('./api/status', signal);
      if (ticket !== generation) return snapshot();
      if (typeof source.publicKey !== 'string' || source.publicKey.length > 1024 ||
          typeof source.fingerprint !== 'string' || source.fingerprint !== await hash(source.publicKey)) throw fail('The Keeper identity did not verify.');
      if (keeper && (source.fingerprint !== keeper.fingerprint || source.publicKey !== keeper.publicKey)) throw fail('The Keeper identity changed. Reload and check which Keeper you opened.');
      const verifiedKeeper = { fingerprint: source.fingerprint, publicKey: source.publicKey }, samples = [];
      const nonces = new Set();
      for (let i = 0; i < 3; i++) {
        const nonce = randomNonce();
        if (!validTimeNonce(nonce) || nonces.has(nonce)) throw fail('Could not create a fresh clock challenge.');
        nonces.add(nonce);
        const started = clocks().mono;
        if (ticket !== generation) return snapshot();
        const envelope = await json('./api/time?nonce=' + encodeURIComponent(nonce), signal), ended = clocks().mono;
        if (ticket !== generation) return snapshot();
        const sample = await verifyTimeSample(envelope, { nonce, keeper: verifiedKeeper, started, ended, maxRttMs });
        if (ticket !== generation) return snapshot();
        samples.push(sample);
      }
      const mono = clocks().mono;
      if (ticket !== generation) return snapshot();
      const best = samples.reduce((a, b) => a.rttMs <= b.rttMs ? a : b);
      for (const sample of samples) {
        const disagreement = Math.abs(sample.server + mono - sample.mono - (best.server + mono - best.mono));
        if (disagreement > sample.uncertaintyMs + best.uncertaintyMs + 100) throw fail('Keeper clock samples disagree. Sync again after its clock settles.');
      }
      const next = { ...best, sampledAtMono: best.mono, server: best.server + mono - best.mono, mono };
      // A large server correction needs a second complete signed burst. A
      // single surprising response must not silently authorize garden actions.
      const largeCorrection = Boolean(anchor && Math.abs(next.server - estimate(mono)) > 5000);
      if (largeCorrection &&
          (!candidateChange || Math.abs(next.server - (candidateChange.server + mono - candidateChange.mono)) > 1000)) {
        candidateChange = next; keeper = verifiedKeeper;
        invalidReason = 'The Keeper clock changed substantially. Sync again to confirm it.'; clockChanged = true;
      } else {
        const first = !anchor, previousDisplay = displayAt(mono);
        anchor = next; keeper = verifiedKeeper; candidateChange = null;
        invalidReason = ''; clockChanged = false; lastError = '';
        if (first || largeCorrection) { display = next.server; displayMono = mono; }
        if (largeCorrection) { lastCorrectionMs = Math.round(next.server - previousDisplay); lastCorrectionMono = mono; }
      }
    } catch (error) {
      if (ticket === generation) { invalidReason = 'Time could not be verified. Sync before signing garden actions.'; lastError = error.message; }
    } finally {
      if (ticket === generation) { syncing = false; controller?.abort(); controller = null; pending = null; }
    }
    return ticket === generation ? emit() : snapshot();
  }
  function sync() {
    if (stopped) return Promise.resolve(snapshot());
    clocks();
    if (pending) return pending;
    const ticket = ++generation; controller = new AbortController(); syncing = true; emit();
    pending = runSync(ticket, controller.signal);
    return pending;
  }
  return {
    sync, snapshot,
    now() { return snapshot().now; },
    requestNow() {
      const state = snapshot();
      if (!state.fresh) throw fail('Sync the Keeper clock before signing this garden action.');
      return state.keeperNow;
    },
    invalidate(reason = 'The page resumed. Sync the Keeper clock again.') { markInvalid(reason); return emit(); },
    stop() { stopped = true; markInvalid('Clock synchronization stopped.'); return emit(); }
  };
}
