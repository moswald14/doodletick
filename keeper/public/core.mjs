const enc = new TextEncoder();
const dec = new TextDecoder('utf-8', { fatal: true });
export const FORMAT = 'doodletick-vault-v1';
export const ITERATIONS = 600000;
export const EPOCH = Date.UTC(2026, 10, 11);
export const MAX_TEXT = 250000;
export const MAX_BACKUP = 4500000;
const aad = enc.encode(FORMAT);
export const canonical = value => {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  return '{' + Object.keys(value).sort().map(k => JSON.stringify(k) + ':' + canonical(value[k])).join(',') + '}';
};
export function b64(bytes) {
  let s = ''; for (const b of new Uint8Array(bytes)) s += String.fromCharCode(b);
  return btoa(s).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}
export function unb64(s) {
  if (typeof s !== 'string' || !/^[A-Za-z0-9_-]+$/.test(s)) throw new Error('Invalid encoding.');
  return Uint8Array.from(atob(s.replaceAll('-', '+').replaceAll('_', '/')), c => c.charCodeAt(0));
}
export const random = n => crypto.getRandomValues(new Uint8Array(n));
export const hash = async value => b64(await crypto.subtle.digest('SHA-256', enc.encode(typeof value === 'string' ? value : canonical(value))));
export async function newIdentity(username) {
  if (!/^[a-zA-Z0-9_-]{3,24}$/.test(username)) throw new Error('Use 3–24 letters, numbers, dashes or underscores.');
  const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const publicKey = b64(await crypto.subtle.exportKey('spki', pair.publicKey));
  return { username, publicKey, privateKey: await crypto.subtle.exportKey('jwk', pair.privateKey), fingerprint: await hash(publicKey) };
}
export async function sign(value, privateKey) {
  const key = await crypto.subtle.importKey('jwk', privateKey, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  return b64(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, enc.encode(canonical(value))));
}
export async function checkSignature(value, signature, publicKey) {
  try {
    const key = await crypto.subtle.importKey('spki', unb64(publicKey), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
    return await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, key, unb64(signature), enc.encode(canonical(value)));
  } catch { return false; }
}
export async function deriveKey(password, salt) {
  const material = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', salt: unb64(salt), iterations: ITERATIONS, hash: 'SHA-256' }, material, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}
export async function encryptVault(vault, key, salt) {
  const iv = random(12);
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: aad }, key, enc.encode(JSON.stringify(vault)));
  const envelope = { format: FORMAT, kdf: 'PBKDF2-SHA256', iterations: ITERATIONS, salt, iv: b64(iv), ciphertext: b64(ciphertext) };
  if (JSON.stringify(envelope).length > MAX_BACKUP) throw new Error('This vault is full. Export a backup before adding more writing.');
  return envelope;
}
export function validateEnvelope(envelope) {
  if (!envelope || envelope.format !== FORMAT || envelope.kdf !== 'PBKDF2-SHA256' || envelope.iterations !== ITERATIONS || JSON.stringify(envelope).length > MAX_BACKUP || unb64(envelope.salt).length !== 16 || unb64(envelope.iv).length !== 12 || unb64(envelope.ciphertext).length < 16) throw new Error('This is not a supported Doodle Tick backup.');
}
export async function decryptVault(envelope, password) {
  validateEnvelope(envelope);
  const key = await deriveKey(password, envelope.salt);
  let vault;
  try {
    const raw = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(envelope.iv), additionalData: aad }, key, unb64(envelope.ciphertext));
    vault = JSON.parse(dec.decode(raw));
  } catch { throw new Error('Wrong password, or this backup has been changed or damaged.'); }
  await validateVault(vault);
  return { vault, key, salt: envelope.salt };
}
export function legacyTickAt(time = Date.now()) {
  const index = Math.max(0, Math.floor((time - EPOCH) / 3600000));
  const position = index % 24;
  const cycle = Math.floor(index / 24);
  // One palette per 24 UTC hours. First chapter is red -> yellow -> green;
  // later chapters use reproducible permutations of the 24 palette positions.
  const slot = cycle === 0 ? position : (position * [5, 7, 11, 13, 17, 19, 23][cycle % 7] + cycle * 7) % 24;
  const p = slot / 23;
  const r = Math.round(255 * Math.min(1, 2 * (1 - p)));
  const g = Math.round(255 * Math.min(1, 2 * p));
  return { index, cycle, position, color: '#' + [r, g, 0].map(v => v.toString(16).padStart(2, '0')).join('').toUpperCase(), startsAt: new Date(EPOCH + index * 3600000).toISOString() };
}
// An odd stride permutes all 24-bit integers. Swap green with the final
// value so every complete pass starts red and ends green, without duplicates.
export const HEX_COLOR_COUNT = 0x1000000;
export function hexColorNumber(index) {
  if (!Number.isSafeInteger(index) || index < 0) throw new Error('Invalid color index.');
  const pass = Math.floor(index / HEX_COLOR_COUNT), slot = index % HEX_COLOR_COUNT;
  const stride = (0x9e3779 + 2 * (pass % 0x800000)) % HEX_COLOR_COUNT;
  const last = (0xff0000 + (HEX_COLOR_COUNT - 1) * stride) % HEX_COLOR_COUNT;
  const value = (0xff0000 + slot * stride) % HEX_COLOR_COUNT;
  return slot === HEX_COLOR_COUNT - 1 ? 0x00ff00 : value === 0x00ff00 ? last : value;
}
export function tickAt(time = Date.now()) {
  const index = Math.max(0, Math.floor((time - EPOCH) / 3600000));
  return { index, cycle: Math.floor(index / 24), position: index % 24,
    color: '#' + hexColorNumber(index).toString(16).padStart(6, '0').toUpperCase(),
    startsAt: new Date(EPOCH + index * 3600000).toISOString() };
}
// Tetrachroma stores a separate black channel. Its eight-digit value must
// never be used directly as a CSS color, where the fourth byte means alpha.
// Signed clock records retain their original RGB representation.
export function tetrachromaColor(rgb, black = 0) {
  if (typeof rgb !== 'string' || !/^#[0-9a-f]{6}$/i.test(rgb)) throw new Error('Choose a six-digit RGB color.');
  if (!Number.isInteger(black) || black < 0 || black > 255) throw new Error('Black focus must be a whole number from 0 to 255.');
  const base = rgb.toUpperCase(), pair = black.toString(16).padStart(2, '0').toUpperCase();
  const preview = '#' + base.slice(1).match(/../g).map(channel => Math.round(parseInt(channel, 16) * (255 - black) / 255).toString(16).padStart(2, '0')).join('').toUpperCase();
  return { format: 'doodletick-tetrachroma-v1', value: base + pair, rgb: base, black, preview };
}
export async function sealEntry(identity, entries, payload, now = Date.now()) {
  validatePayload(payload);
  const salt = b64(random(32));
  const record = { version: 2, author: identity.fingerprint, sequence: entries.length + 1, previous: entries.at(-1)?.proof.id ?? null, contentHash: await hash({ salt, payload }), createdAt: new Date(now).toISOString(), tick: tickAt(now) };
  const signature = await sign(record, identity.privateKey);
  const proof = { record, publicKey: identity.publicKey, signature, id: await hash({ record, signature }) };
  return { payload: structuredClone(payload), salt, proof, witness: null };
}
export function validatePayload(payload) {
  if (!payload || typeof payload.title !== 'string' || payload.title.length > 140 || typeof payload.body !== 'string' || payload.body.length > MAX_TEXT || !['Idea', 'Journal', 'Story', 'Poem', 'Note'].includes(payload.kind) || !(payload.revisionOf === null || typeof payload.revisionOf === 'string')) throw new Error('The writing is missing or too large.');
}
export async function verifyProof(proof) {
  try {
    const r = proof.record;
    if (![1, 2].includes(r.version) || !Number.isSafeInteger(r.sequence) || r.sequence < 1 || !Number.isFinite(Date.parse(r.createdAt)) || r.author !== await hash(proof.publicKey)) return false;
    if (canonical(r.tick) !== canonical((r.version === 1 ? legacyTickAt : tickAt)(Date.parse(r.createdAt)))) return false;
    if (proof.id !== await hash({ record: r, signature: proof.signature })) return false;
    return checkSignature(r, proof.signature, proof.publicKey);
  } catch { return false; }
}
export async function verifyWitness(witness, proofId) {
  try {
    return witness.record.version === 1 && witness.record.proofId === proofId && witness.record.witness === await hash(witness.publicKey) && await checkSignature(witness.record, witness.signature, witness.publicKey);
  } catch { return false; }
}
export async function verifyEntry(entry) {
  try {
    validatePayload(entry.payload);
    return await verifyProof(entry.proof) && await hash({ salt: entry.salt, payload: entry.payload }) === entry.proof.record.contentHash && (!entry.witness || await verifyWitness(entry.witness, entry.proof.id));
  } catch { return false; }
}
export async function validateVault(vault) {
  if (vault?.version !== 1 || !Array.isArray(vault.entries) || vault.entries.length > 10000 || !vault.identity) throw new Error('Invalid vault.');
  if (vault.identity.fingerprint !== await hash(vault.identity.publicKey)) throw new Error('Identity mismatch.');
  const challenge = { check: b64(random(16)) };
  if (!await checkSignature(challenge, await sign(challenge, vault.identity.privateKey), vault.identity.publicKey)) throw new Error('Identity keys do not match.');
  validatePayload(vault.draft);
  for (let i = 0; i < vault.entries.length; i++) {
    const e = vault.entries[i];
    if (e.proof.record.sequence !== i + 1 || e.proof.record.previous !== (vault.entries[i - 1]?.proof.id ?? null) || e.proof.publicKey !== vault.identity.publicKey || !await verifyEntry(e)) throw new Error('The entry history failed verification. Restore a known good backup.');
  }
  return true;
}
export function receiptFor(entry) {
  return { format: 'doodletick-receipt-v1', proof: entry.proof, witness: entry.witness, disclosure: { salt: entry.salt, title: entry.payload.title, kind: entry.payload.kind, revisionOf: entry.payload.revisionOf } };
}
export async function verifyReceipt(receipt, body) {
  if (receipt?.format !== 'doodletick-receipt-v1' || !await verifyProof(receipt.proof)) throw new Error('The creator signature does not match. This receipt is invalid.');
  if (receipt.witness && !await verifyWitness(receipt.witness, receipt.proof.id)) throw new Error('The witness signature does not match.');
  let contentMatches = null;
  if (body !== undefined) {
    const d = receipt.disclosure;
    const payload = { title: d.title, kind: d.kind, revisionOf: d.revisionOf, body };
    validatePayload(payload);
    contentMatches = await hash({ salt: d.salt, payload }) === receipt.proof.record.contentHash;
  }
  return { signature: true, witness: Boolean(receipt.witness), contentMatches, fingerprint: receipt.proof.record.author };
}
