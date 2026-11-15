import test from 'node:test';
import assert from 'node:assert/strict';
import { newIdentity, sign, hash, b64, random } from '../public/core.mjs';
import { LICENSES, createManifest, verifyManifest, verifyFile, adaptationLicenses, canUse, attributionText, safeName, MAX_FILE } from '../public/licenses.mjs';
import { zip, unzip, crc32 } from '../public/archive.mjs';
import { parsePeerCode } from '../public/peers.mjs';
const a = await newIdentity('creator_one'), b = await newIdentity('creator_two');
const data = new TextEncoder().encode('A little universe. 🌱\nAttribution stays with this file.');
const file = { name: 'universe.txt', type: 'text/plain' };
const credits = { title: 'Little universe', creator: 'Creator One & collaborators', source: 'https://example.com/universe', notices: 'Copyright 2026 Creator One. Supplied disclaimer: no warranties.', changes: '' };
const originals = Object.fromEntries(await Promise.all(Object.keys(LICENSES).map(async id => [id, await createManifest(a, data, file, credits, id)])));
test('all six CC 4.0 licenses and CC0 bind bytes, license and attribution to a signature', async () => {
  for (const manifest of Object.values(originals)) { assert.equal(await verifyManifest(manifest), true); assert.equal(await verifyFile(manifest, data), true); assert(attributionText(manifest).includes(credits.notices)); }
});
test('modified bytes, credit, source, notices, or license fail integrity checks', async () => {
  assert.equal(await verifyFile(originals['CC-BY-4.0'], new TextEncoder().encode('stolen edit')), false);
  for (const field of ['creator', 'source', 'notices', 'title']) { const bad = structuredClone(originals['CC-BY-4.0']); bad.record.credits[field] += ' changed'; assert.equal(await verifyManifest(bad), false); }
  const bad = structuredClone(originals['CC-BY-4.0']); bad.record.license = 'CC0-1.0'; bad.record.licenseUrl = LICENSES['CC0-1.0'].url; assert.equal(await verifyManifest(bad), false);
});
test('NonCommercial blocks declared commercial use and rejects unknown purposes', () => {
  for (const [id, manifest] of Object.entries(originals)) { assert.equal(canUse(manifest, 'commercial'), !LICENSES[id].nc); assert.equal(canUse(manifest, 'noncommercial'), true); assert.equal(canUse(manifest, 'anything'), false); }
});
test('NoDerivatives original copies verify but adaptation creation is blocked', async () => {
  for (const id of ['CC-BY-ND-4.0', 'CC-BY-NC-ND-4.0']) {
    assert.equal(await verifyFile(originals[id], data), true); assert.deepEqual(adaptationLicenses(originals[id]), []);
    await assert.rejects(createManifest(b, data, file, { ...credits, changes: 'New ending' }, id, originals[id]), /adaptation/);
  }
});
test('ShareAlike preserves its license and signed upstream credit; changes required', async () => {
  const source = originals['CC-BY-SA-4.0'];
  await assert.rejects(createManifest(b, data, file, credits, 'CC-BY-SA-4.0', source), /Describe/);
  await assert.rejects(createManifest(b, data, file, { ...credits, changes: 'Revised' }, 'CC-BY-4.0', source), /adaptation/);
  const adapted = await createManifest(b, data, file, { ...credits, creator: 'Creator Two', changes: 'A different ending.' }, 'CC-BY-SA-4.0', source);
  assert.equal(await verifyManifest(adapted), true); assert.equal(adapted.record.parent.id, source.id);
  const text = attributionText(adapted); assert(text.includes('Creator Two')); assert(text.includes('Creator One & collaborators')); assert(text.includes('A different ending.')); assert(text.includes(credits.source));
  const forged = structuredClone(adapted); forged.record.license = 'CC-BY-4.0'; forged.record.licenseUrl = LICENSES['CC-BY-4.0'].url; forged.signature = await sign(forged.record, b.privateKey); forged.id = await hash({ record: forged.record, signature: forged.signature });
  assert.equal(await verifyManifest(forged), false, 'a valid adapter signature cannot bypass the inherited license rule');
});
test('NC inheritance, CC0 notice, invalid schemes and oversized files are handled', async () => {
  assert(adaptationLicenses(originals['CC-BY-NC-4.0']).every(id => LICENSES[id].nc));
  assert.match(attributionText(originals['CC0-1.0']), /does not require attribution/);
  await assert.rejects(createManifest(a, data, file, { ...credits, source: 'javascript:alert(1)' }, 'CC-BY-4.0'));
  const bad = structuredClone(originals['CC-BY-4.0']); bad.record.file.size = MAX_FILE + 1; assert.equal(await verifyManifest(bad), false);
  const proto = structuredClone(originals['CC-BY-4.0']); proto.record.license = 'constructor'; delete proto.record.licenseUrl; proto.signature = await sign(proto.record, a.privateKey); proto.id = await hash({ record: proto.record, signature: proto.signature }); assert.equal(await verifyManifest(proto), false);
});
test('licensed ZIP preserves exact bytes and credits, catches damage and unsafe paths', async () => {
  const manifest = originals['CC-BY-4.0'];
  const bundle = await zip([['files/universe.txt', data], ['ATTRIBUTION.txt', attributionText(manifest)], ['doodletick.json', JSON.stringify(manifest)]]).arrayBuffer();
  const parts = unzip(bundle); assert.deepEqual(parts.get('files/universe.txt'), data); assert.equal(parts.size, 3);
  const parsed = JSON.parse(new TextDecoder().decode(parts.get('doodletick.json'))); assert.equal(await verifyFile(parsed, parts.get('files/universe.txt')), true);
  const changed = new Uint8Array(bundle.slice(0)); changed[60] ^= 1; assert.throws(() => unzip(changed.buffer));
  assert.throws(() => zip([['../secret.txt', 'bad']])); assert.throws(() => zip([['same', '1'], ['same', '2']]));
  assert.equal(crc32(new TextEncoder().encode('123456789')), 0xcbf43926); assert(!safeName('../../file.exe').includes('/'));
});
test('pairing codes require a valid signature, type, expiry, and a private VPN endpoint', async () => {
  const record = { format: 'doodletick-peer-v2', type: 'offer', session: b64(random(16)), replyTo: null, expires: Date.now() + 3600000, username: a.username, publicKey: a.publicKey, vpn: { format: 'doodletick-vpn-v1', network: 'test.ts.net', ip: '100.64.0.1', port: 4318, channel: 'a'.repeat(32), token: 'b'.repeat(43), label: 'doodletick-files-v1' } };
  const packet = { record, signature: await sign(record, a.privateKey) };
  assert.deepEqual(await parsePeerCode(JSON.stringify(packet), 'offer'), packet);
  await assert.rejects(parsePeerCode(JSON.stringify(packet), 'answer'));
  const changed = structuredClone(packet); changed.record.vpn.token = 'z'.repeat(43); await assert.rejects(parsePeerCode(JSON.stringify(changed), 'offer'));
  for (const update of [{ expires: Date.now() - 1 }, { vpn: { ...record.vpn, ip: '8.8.8.8' } }]) { const r = { ...record, ...update }; await assert.rejects(parsePeerCode(JSON.stringify({ record: r, signature: await sign(r, a.privateKey) }), 'offer')); }
});
