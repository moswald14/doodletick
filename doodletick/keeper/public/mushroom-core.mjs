// The original Dot Wave algorithms run in dependency order, in Node and browsers.
import './dot-effects-dsp.mjs';
import './dot-amp-tone.mjs';
import './dot-studio-dsp.mjs';
import './dot-collision-audio.mjs';
import './dot-wave-export.mjs';
import './dot-mushroom-dsp.mjs';
import './dot-mushroom-motion.mjs';
import { hash, canonical, sign, checkSignature, random, b64, EPOCH } from './core.mjs';

export const HOUR = 3600000;
export const GARDEN_FORMAT = 'doodletick-garden-v1';
export const MAX_RECIPE = 32000;
export const DECORATIONS = Object.freeze({ ring: { name: 'Golden ring', price: 5 }, lantern: { name: 'Spore lantern', price: 12 }, halo: { name: 'Moon halo', price: 24 } });
export const gardenHour = time => Math.floor((time - EPOCH) / HOUR);
export function recipe(raw) {
  if (!raw || raw.kind !== 'dot-mushroom' || raw.version !== 1 || typeof raw.name !== 'string' || JSON.stringify(raw).length > MAX_RECIPE) throw new Error('Choose a Dot Wave Studio mushroom recipe (32 KB maximum).');
  if (!raw.settings || typeof raw.settings !== 'object') throw new Error('Mushroom settings are missing.');
  return { kind: 'dot-mushroom', version: 1, name: raw.name.trim().slice(0, 60) || 'My mushroom',
    settings: globalThis.MushroomDSP.settings(raw.settings), motion: globalThis.MushroomMotion.settings(raw.motion),
    patch: raw.patch == null ? null : globalThis.StudioDSP.validatePatch(raw.patch) };
}
export async function mushroomId(raw) {
  const r = recipe(raw);
  // Names, motion preferences and listening/EQ controls do not create a new generator.
  const p = r.patch;
  return hash({ format: 'dot-mushroom-generator-v1', settings: r.settings,
    source: p ? { project: p.project, pitch: p.pitch, freePair: p.freePair, inverted: p.inverted } : null });
}
export function renderMushroom(raw) {
  const r = recipe(raw), rate = 24000, p = r.patch;
  const input = p ? globalThis.WaveExport.render(p.project, p.freePair, globalThis.StudioDSP.compile(p.project, { frequency: p.pitch }).result, p.pitch,
    { rate, duration: 4, gain: .25, inverted: p.inverted, loop: true }) : new Float32Array(rate * 4);
  return { ...globalThis.MushroomDSP.render(input, rate, r.settings), rate };
}
export const newRecipe = () => recipe({ kind: 'dot-mushroom', version: 1, name: 'New spore', settings: { seed: 1 + (new DataView(random(4).buffer).getUint32(0) % 2147483647) }, patch: null });
export async function gardenRequest(identity, issuer, action, args = {}, sequence = 0, now = Date.now()) {
  const record = { format: GARDEN_FORMAT, issuer, owner: identity.fingerprint, action, args, sequence,
    createdAt: now, nonce: b64(random(16)) };
  return { record, publicKey: identity.publicKey, signature: await sign(record, identity.privateKey) };
}
export async function verifyGardenRequest(proof, issuer) {
  try {
    const r = proof.record;
    return r.format === GARDEN_FORMAT && r.issuer === issuer && r.owner === await hash(proof.publicKey) &&
      /^[A-Za-z0-9_-]{22}$/.test(r.nonce) && Number.isSafeInteger(r.createdAt) && Number.isSafeInteger(r.sequence) && r.sequence >= 0 &&
      r.args && typeof r.args === 'object' && !Array.isArray(r.args) && await checkSignature(r, proof.signature, proof.publicKey);
  } catch { return false; }
}
export async function verifyGardenResponse(envelope, issuer, requestId) {
  try {
    return envelope.record.format === GARDEN_FORMAT && envelope.record.issuer === issuer && await hash(envelope.publicKey) === issuer &&
      (requestId === undefined || envelope.record.requestId === requestId) && await checkSignature(envelope.record, envelope.signature, envelope.publicKey);
  } catch { return false; }
}
export function pendingCoins(mushroom, time) { return Math.max(0, gardenHour(time) - mushroom.paidThrough); }
export function playerAddress(issuer, owner) { return 'doodlecoin:' + issuer + ':' + owner; }
export function parseAddress(text, issuer) {
  const match = /^doodlecoin:([\w-]{43}):([\w-]{43})$/.exec(text.trim());
  if (!match || match[1] !== issuer) throw new Error('Use a player address from this same garden Keeper.');
  return match[2];
}
export { canonical };
