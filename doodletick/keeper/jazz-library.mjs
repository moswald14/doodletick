// SPDX-License-Identifier: GPL-3.0-only
import { mkdir, lstat, open, readFile, readdir, rename, unlink } from 'node:fs/promises';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { checkSignature, hash } from './public/core.mjs';
import { JAZZ_RECEIPT_FORMAT, JAZZ_CLIP_MAX_SECONDS, validJazzRequestId } from './public/jazz-radio-contract.mjs';

const quota = 256 * 1024 * 1024, maxRecords = 2000, maxJournal = 8 * 1024 * 1024;
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const fault = () => Object.assign(new Error('The Jazz keepsake library needs recovery. Existing recordings have been preserved; restore a Keeper backup before saving more.'), { status: 503 });
async function syncDirectory(directory) {
  if (process.platform === 'win32') return;
  const file = await open(directory, 'r'); try { await file.sync(); } finally { await file.close(); }
}
async function regular(name, maxBytes) {
  const info = await lstat(name);
  if (!info.isFile() || info.isSymbolicLink() || info.size > maxBytes) throw fault();
  return info;
}
export async function atomicJazzJson(name, value) {
  const temp = name + '.' + randomUUID() + '.tmp'; let file;
  try {
    file = await open(temp, 'wx', 0o600); await file.writeFile(JSON.stringify(value)); await file.sync(); await file.close(); file = null;
    await rename(temp, name);
    await syncDirectory(path.dirname(name));
  } finally { await file?.close().catch(() => {}); await unlink(temp).catch(() => {}); }
}
export async function readJazzJson(name) {
  await regular(name, 32768); return JSON.parse(await readFile(name, 'utf8'));
}

// An independent local journal. It never modifies the vault, witness ledger or DVC.
export async function createJazzLibrary({ dataDir, signer }) {
  const dir = path.join(dataDir, 'jazz-library'), audioDir = path.join(dir, 'audio'), journal = path.join(dir, 'chords.jsonl');
  await mkdir(audioDir, { recursive: true, mode: 0o700 });
  for (const name of [dir, audioDir]) { const info = await lstat(name); if (!info.isDirectory() || info.isSymbolicLink()) throw fault(); }
  let records = [], usedBytes = 0, journalBytes = 0, previous = null, damaged = false, closing = false, chain = Promise.resolve();
  const requests = new Map();
  try {
    const names = await readdir(audioDir);
    if (names.length > maxRecords + 10) throw fault();
    for (const name of names) {
      if (!/^[a-f0-9]{64}\.mp3$/.test(name)) throw fault();
      usedBytes += (await regular(path.join(audioDir, name), 1048576)).size;
    }
    let raw = '';
    try { journalBytes = (await regular(journal, maxJournal)).size; raw = await readFile(journal, 'utf8'); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
      if (raw && !raw.endsWith('\n')) throw fault();
      for (const line of raw.split('\n').filter(Boolean)) {
        const receipt = JSON.parse(line), r = receipt.record;
        if (!r || r.format !== JAZZ_RECEIPT_FORMAT || r.sequence !== records.length + 1 || r.previous !== previous
          || !validJazzRequestId(r.id) || !validJazzRequestId(r.requestId) || requests.has(r.requestId)
          || !Array.isArray(r.chords) || r.chords.length !== 8 || !/^[a-f0-9]{64}$/.test(r.audio?.sha256)
          || receipt.publicKey !== signer.publicKey || !await checkSignature(r, receipt.signature, receipt.publicKey)) throw fault();
        const audio = path.join(audioDir, r.audio.sha256 + '.mp3');
        const info = await regular(audio, 1048576);
        if (info.size !== r.audio.bytes || digest(await readFile(audio)) !== r.audio.sha256) throw fault();
        records.push(receipt); requests.set(r.requestId, receipt); previous = await hash(receipt);
        if (records.length > maxRecords) throw fault();
      }
    if (usedBytes > quota) throw fault();
  } catch { damaged = true; }
  const serialized = task => { const result = chain.then(task); chain = result.catch(() => {}); return result; };
  return {
    status() { return { available: !damaged && !closing, count: records.length, bytes: usedBytes, limitBytes: quota, error: damaged ? fault().message : null }; },
    list(offset = 0) { return damaged ? [] : records.slice().reverse().slice(offset, offset + 50); },
    findRequest(id) { return requests.get(id) || null; },
    save({ id = randomUUID(), requestId, chords, samples, audio, capturedAt, tick }) { return serialized(async () => {
      if (damaged || closing) throw fault();
      if (requests.has(requestId)) return requests.get(requestId);
      if (!validJazzRequestId(id) || !validJazzRequestId(requestId) || !Array.isArray(chords) || chords.length !== 8
        || !Buffer.isBuffer(audio) || audio.length < 128 || audio.length > 1048576
        || !Number.isSafeInteger(samples) || samples < 960 || samples > 48000 * 2 * JAZZ_CLIP_MAX_SECONDS) throw new Error('Invalid Jazz keepsake.');
      if (records.length >= maxRecords || usedBytes + audio.length > quota || journalBytes > maxJournal - 12000) throw Object.assign(new Error('The permanent Jazz library is full. Export or back up its recordings before adding more; nothing has been removed.'), { status: 507 });
      const sha256 = digest(audio), audioPath = path.join(audioDir, sha256 + '.mp3'); let added = false, fd;
      const record = { format: JAZZ_RECEIPT_FORMAT, id, requestId, sequence: records.length + 1, previous,
        capturedAt, savedAt: new Date().toISOString(), tick, chords,
        durationMs: Math.round(samples / (48000 * 2) * 1000), sampleRate: 48000, channels: 2,
        audio: { sha256, bytes: audio.length, type: 'audio/mpeg' } };
      const receipt = { record, publicKey: signer.publicKey, signature: await signer.sign(record) };
      const line = JSON.stringify(receipt) + '\n';
      if (Buffer.byteLength(line) > 12000) throw new Error('The Jazz receipt exceeded its size limit.');
      try {
        try { fd = await open(audioPath, 'wx', 0o600); await fd.writeFile(audio); await fd.sync(); await fd.close(); fd = null; await syncDirectory(audioDir); added = true; }
        catch (error) { if (error.code !== 'EEXIST') throw error; await regular(audioPath, 1048576); if (digest(await readFile(audioPath)) !== sha256) throw fault(); }
        fd = await open(journal, 'a', 0o600); await fd.writeFile(line); await fd.sync(); await fd.close(); fd = null;
        await syncDirectory(dir);
        records.push(receipt); requests.set(requestId, receipt); previous = await hash(receipt);
        journalBytes += Buffer.byteLength(line); if (added) usedBytes += audio.length;
        return receipt;
      } catch { damaged = true; throw fault(); }
      finally { await fd?.close().catch(() => {}); }
    }); },
    async audio(sha256) {
      if (damaged || !/^[a-f0-9]{64}$/.test(sha256) || !records.some(receipt => receipt.record.audio.sha256 === sha256)) throw Object.assign(new Error('Recording not found.'), { status: 404 });
      try {
        const name = path.join(audioDir, sha256 + '.mp3'); await regular(name, 1048576);
        const bytes = await readFile(name);
        if (digest(bytes) !== sha256) throw fault();
        return bytes;
      } catch { damaged = true; throw fault(); }
    },
    async close() { closing = true; await chain; }
  };
}
