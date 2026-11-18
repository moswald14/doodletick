import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, unlink, readdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { newIdentity, sign, checkSignature, hash, tickAt } from '../public/core.mjs';
import { createJazzLibrary, atomicJazzJson, readJazzJson } from '../jazz-library.mjs';

const owner = await newIdentity('jazz_library_fixture');
const signer = { publicKey: owner.publicKey, sign: record => sign(record, owner.privateKey) };
const START = Date.parse('2026-11-17T12:00:00Z');
const audio = number => { const bytes = Buffer.alloc(256, number); bytes.write('ID3'); return bytes; };
const passage = (overrides = {}) => ({ requestId: randomUUID(), chords: Array.from({ length: 8 }, (_, index) => ({ ordinal: index + 1, chord: 'Cmaj7', root: 0, quality: 'maj7', durationMs: 2000 })), samples: 48000 * 2 * 16, audio: audio(1), capturedAt: new Date(START).toISOString(), tick: tickAt(START), ...overrides });
test('eight slow seven-beat measures fit the signed recording limit and remain replayable',async t=>{
  const {open}=await fixture(t), library=await open();
  const samples=Math.ceil(48000*8*7*60/55)*2, receipt=await library.save(passage({samples}));
  assert.equal(receipt.record.durationMs,61091);
  assert(await checkSignature(receipt.record,receipt.signature,receipt.publicKey));
  await library.close();const restored=await open();
  assert.equal(restored.status().count,1);assert.deepEqual(await restored.audio(receipt.record.audio.sha256),audio(1));
});
async function fixture(t) {
  const dataDir = await mkdtemp(path.join(tmpdir(), 'doodletick-jazz-library-'));
  const libraries = [];
  t.after(async () => {
    await Promise.all(libraries.map(library => library.close()));
    assert.equal(path.dirname(path.resolve(dataDir)), path.resolve(tmpdir())); assert(path.basename(dataDir).startsWith('doodletick-jazz-library-'));
    await rm(dataDir, { recursive: true, force: true });
  });
  const open = async () => { const library = await createJazzLibrary({ dataDir, signer }); libraries.push(library); return library; };
  return { dataDir, open, journal: path.join(dataDir, 'jazz-library', 'chords.jsonl'), audioPath: receipt => path.join(dataDir, 'jazz-library', 'audio', receipt.record.audio.sha256 + '.mp3') };
}

test('signed eight-chord recordings, audio hashes and retry identities survive a library restart', async t => {
  const env = await fixture(t), library = await env.open(); assert.equal(library.status().available, true); assert.deepEqual(library.list(), []);
  const firstInput = passage(), first = await library.save(firstInput), second = await library.save(passage({ audio: audio(2) }));
  assert.equal(first.record.sequence, 1); assert.equal(first.record.previous, null); assert.equal(second.record.sequence, 2); assert.equal(second.record.previous, await hash(first));
  assert.equal(first.record.durationMs, 16000); assert.equal(first.record.sampleRate, 48000); assert.equal(first.record.channels, 2);
  assert(await checkSignature(first.record, first.signature, first.publicKey)); assert.deepEqual(await library.audio(first.record.audio.sha256), firstInput.audio);
  assert.deepEqual(await library.save({ ...firstInput, audio: audio(9) }), first); assert.equal(library.status().count, 2);
  await library.close(); const reopened = await env.open();
  assert.equal(reopened.status().available, true); assert.deepEqual(reopened.list(), [second, first]); assert.deepEqual(reopened.findRequest(firstInput.requestId), first);
  assert.deepEqual(await reopened.audio(second.record.audio.sha256), audio(2));
  const raw = await readFile(env.journal, 'utf8'); assert.equal(raw.split('\n').filter(Boolean).length, 2); assert(raw.endsWith('\n'));
  await assert.rejects(reopened.audio('a'.repeat(64)), error => error.status === 404);
});

test('concurrent retries append once, independent requests keep their chain, and shared audio is stored once', async t => {
  const env = await fixture(t), library = await env.open(), same = passage();
  const retried = await Promise.all(Array.from({ length: 4 }, () => library.save(same)));
  assert(retried.every(receipt => receipt.record.id === retried[0].record.id)); assert.equal(library.status().count, 1);
  const next = await Promise.all([library.save(passage()), library.save(passage())]);
  assert.deepEqual(next.map(receipt => receipt.record.sequence), [2, 3]); assert.equal(next[0].record.previous, await hash(retried[0])); assert.equal(next[1].record.previous, await hash(next[0]));
  assert.equal(library.status().bytes, 256); assert.equal((await readdir(path.dirname(env.audioPath(next[0])))).length, 1);
  assert.equal((await readFile(env.journal, 'utf8')).split('\n').filter(Boolean).length, 3);
});

test('an edited or torn journal makes the library unavailable and preserves existing bytes', async t => {
  for (const mutate of [raw => raw.slice(0, -1), raw => raw.replace('Cmaj7', 'Dmin7'), raw => raw + '{broken\n']) {
    const env = await fixture(t), library = await env.open(), receipt = await library.save(passage()); await library.close();
    const damaged = mutate(await readFile(env.journal, 'utf8')); await writeFile(env.journal, damaged);
    const reopened = await env.open(); assert.equal(reopened.status().available, false); assert.deepEqual(reopened.list(), []);
    await assert.rejects(reopened.save(passage()), error => error.status === 503);
    assert.equal(await readFile(env.journal, 'utf8'), damaged); assert.deepEqual(await readFile(env.audioPath(receipt)), audio(1));
  }
});

test('missing or altered referenced audio at startup cannot be mistaken for an absent journal', async t => {
  for (const corrupt of [async name => unlink(name), async name => writeFile(name, audio(7))]) {
    const env = await fixture(t), library = await env.open(), first = await library.save(passage()), second = await library.save(passage({ audio: audio(2) })); await library.close();
    const journal = await readFile(env.journal); await corrupt(env.audioPath(second));
    const reopened = await env.open(); assert.equal(reopened.status().available, false); assert.deepEqual(reopened.list(), []);
    await assert.rejects(reopened.save(passage()), error => error.status === 503);
    assert.deepEqual(await readFile(env.journal), journal); assert.deepEqual(await readFile(env.audioPath(first)), audio(1));
  }
});

test('detecting missing or altered audio during replay immediately blocks further writes', async t => {
  for (const corrupt of [async name => unlink(name), async name => writeFile(name, audio(8))]) {
    const env = await fixture(t), library = await env.open(), receipt = await library.save(passage());
    const journal = await readFile(env.journal); await corrupt(env.audioPath(receipt));
    await assert.rejects(library.audio(receipt.record.audio.sha256), error => error.status === 503);
    assert.equal(library.status().available, false); await assert.rejects(library.save(passage()), error => error.status === 503);
    assert.deepEqual(await readFile(env.journal), journal);
  }
});

test('invalid recordings and closing cannot append partial records', async t => {
  const env = await fixture(t), library = await env.open();
  for (const bad of [{ requestId: 'not-a-request' }, { chords: [] }, { audio: Buffer.alloc(127) }, { samples: 959 }, { samples: 48000 * 2 * 64 + 1 }]) await assert.rejects(library.save(passage(bad)), /Invalid/);
  assert.equal(library.status().count, 0);
  const receipt = await library.save(passage()); await library.close(); await assert.rejects(library.save(passage()), error => error.status === 503);
  const reopened = await env.open(); assert.deepEqual(reopened.list(), [receipt]);
});

test('atomic station JSON replaces complete values and bounded reads reject corrupt files', async t => {
  const env = await fixture(t), filename = path.join(env.dataDir, 'station.json');
  await atomicJazzJson(filename, { revision: 1 }); await atomicJazzJson(filename, { revision: 2, enabled: true });
  assert.deepEqual(await readJazzJson(filename), { revision: 2, enabled: true }); assert.deepEqual(await readdir(env.dataDir), ['station.json']);
  await writeFile(filename, '{'); await assert.rejects(readJazzJson(filename));
  await writeFile(filename, ' '.repeat(32769)); await assert.rejects(readJazzJson(filename), error => error.status === 503);
});
