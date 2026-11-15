import { b64, canonical, hash, sign, checkSignature } from './core.mjs';
export const MAX_FILE = 20 * 1024 * 1024;
export const MAX_MANIFEST = 24000;
export const LICENSES = Object.freeze(Object.fromEntries([
  ['CC-BY-4.0', 'CC BY 4.0', 'by', false, false, false],
  ['CC-BY-SA-4.0', 'CC BY-SA 4.0', 'by-sa', false, true, false],
  ['CC-BY-NC-4.0', 'CC BY-NC 4.0', 'by-nc', true, false, false],
  ['CC-BY-NC-SA-4.0', 'CC BY-NC-SA 4.0', 'by-nc-sa', true, true, false],
  ['CC-BY-ND-4.0', 'CC BY-ND 4.0', 'by-nd', false, false, true],
  ['CC-BY-NC-ND-4.0', 'CC BY-NC-ND 4.0', 'by-nc-nd', true, false, true],
  ['CC0-1.0', 'CC0 1.0', null, false, false, false]
].map(([id, label, slug, nc, sa, nd]) => [id, { id, label, nc, sa, nd, url: slug ? `https://creativecommons.org/licenses/${slug}/4.0/` : 'https://creativecommons.org/publicdomain/zero/1.0/' }])));
export const digestBytes = async bytes => b64(await crypto.subtle.digest('SHA-256', bytes));
const bounded = (s, min, max) => typeof s === 'string' && s.trim().length >= min && s.length <= max;
const digest = s => typeof s === 'string' && /^[A-Za-z0-9_-]{43}$/.test(s);
export function safeName(name) { return name.normalize('NFKC').replace(/[\x00-\x1f<>:"/\\|?*]/g, '_').replace(/^\.+/, '_').slice(0, 160) || 'file'; }
export function adaptationLicenses(parent) {
  if (!parent) return Object.keys(LICENSES);
  const l = Object.hasOwn(LICENSES, parent.record.license) ? LICENSES[parent.record.license] : null;
  if (!l || l.nd) return [];
  if (l.sa) return [l.id];
  return Object.values(LICENSES).filter(candidate => (!l.nc || candidate.nc) && (l.id === 'CC0-1.0' || candidate.id !== 'CC0-1.0')).map(l => l.id);
}
export function canUse(manifest, purpose) {
  if (!['noncommercial', 'commercial'].includes(purpose)) return false;
  let depth = 0;
  for (let p = manifest; p; p = p.record.parent) {
    if (++depth > 6 || !Object.hasOwn(LICENSES, p.record.license)) return false;
    if (LICENSES[p.record.license].nc && purpose === 'commercial') return false;
  }
  return true;
}
export async function createManifest(identity, bytes, file, credits, license, parent = null) {
  if (parent && !await verifyManifest(parent)) throw new Error('The source license record is invalid.');
  if (!adaptationLicenses(parent).includes(license)) throw new Error('This license is not supported for an adaptation of that source.');
  if (parent && !credits.changes?.trim()) throw new Error('Describe what you changed in the adaptation.');
  const record = {
    format: 'doodletick-file-v1', createdAt: new Date().toISOString(),
    author: identity.fingerprint, license, licenseUrl: LICENSES[license]?.url,
    file: { name: safeName(file.name), mime: file.type || 'application/octet-stream', size: bytes.byteLength, digest: await digestBytes(bytes) },
    credits: { title: credits.title.trim(), creator: credits.creator.trim(), source: credits.source.trim(), notices: credits.notices.trim(), changes: credits.changes.trim() },
    parent
  };
  const signature = await sign(record, identity.privateKey);
  const manifest = { record, publicKey: identity.publicKey, signature, id: await hash({ record, signature }) };
  if (!await verifyManifest(manifest)) throw new Error('Check the title, credit, source link, and file size (20 MiB maximum). Adaptation trails support at most six generations.');
  return manifest;
}
export async function verifyManifest(manifest, depth = 0) {
  try {
    if (depth > 5 || JSON.stringify(manifest).length > MAX_MANIFEST) return false;
    const r = manifest.record, f = r.file, c = r.credits, l = Object.hasOwn(LICENSES, r.license) ? LICENSES[r.license] : null;
    if (r.format !== 'doodletick-file-v1' || !l || r.licenseUrl !== l.url || !Number.isFinite(Date.parse(r.createdAt))) return false;
    if (!bounded(f.name, 1, 160) || f.name !== safeName(f.name) || !bounded(f.mime, 1, 120) || !Number.isSafeInteger(f.size) || f.size < 0 || f.size > MAX_FILE || !digest(f.digest)) return false;
    if (!bounded(c.title, 1, 140) || !bounded(c.creator, 1, 200) || !bounded(c.source, 0, 1000) || !bounded(c.notices, 0, 2000) || !bounded(c.changes, 0, 1000)) return false;
    if (c.source && !['http:', 'https:'].includes(new URL(c.source).protocol)) return false;
    if (r.parent !== null) {
      if (!await verifyManifest(r.parent, depth + 1) || !adaptationLicenses(r.parent).includes(r.license) || !c.changes.trim()) return false;
    }
    if (r.author !== await hash(manifest.publicKey) || manifest.id !== await hash({ record: r, signature: manifest.signature })) return false;
    return await checkSignature(r, manifest.signature, manifest.publicKey);
  } catch { return false; }
}
export async function verifyFile(manifest, bytes) {
  return bytes.byteLength === manifest.record.file.size && await verifyManifest(manifest) && await digestBytes(bytes) === manifest.record.file.digest;
}
export function attributionText(manifest) {
  const parts = ['DOODLE TICK — FILE, CREDIT & LICENSE', ''];
  let n = 0;
  for (let m = manifest; m; m = m.record.parent) {
    const r = m.record, c = r.credits, l = LICENSES[r.license];
    parts.push(n++ ? 'SOURCE WORK / INHERITED TERMS' : 'THIS WORK', `Title: ${c.title}`, `Credit: ${c.creator}`, `Source: ${c.source || 'urn:sha256:' + r.file.digest}`, `${r.parent ? 'Adapter license (source terms remain applicable)' : 'License / dedication'}: ${l.label}`, l.url, `Changes: ${c.changes || 'None declared by this publisher.'}`);
    if (c.notices) parts.push('Supplied copyright, license, disclaimer and other notices:', c.notices);
    if (l.id === 'CC0-1.0') parts.push('CC0 does not require attribution. This credit is supplied as provenance, not an added license condition.');
    if (l.nc) parts.push('NonCommercial: commercial use is not granted by this license.');
    if (l.sa) parts.push('ShareAlike: shared adaptations must use the same or a CC-designated compatible license. This Keeper currently offers the same 4.0 license.');
    if (l.nd) parts.push('NoDerivatives: the license does not permit sharing adapted material. Mere format changes are not necessarily adaptations.');
    parts.push(`Creator key: ${r.author}`, `Content SHA-256 (base64url): ${r.file.digest}`, `Signed record: ${m.id}`, '');
  }
  parts.push('No endorsement is implied. Public-domain elements, exceptions, limitations and separately granted permissions are unaffected. Other rights may apply. Read the linked legal terms.', 'These records preserve declared licensing and integrity; signatures do not establish ownership. No DRM or additional use restrictions are imposed by this bundle.');
  return parts.join('\n');
}
