// Offline application-data transfer. This is not a Supervisor backup converter.
import { constants, createReadStream } from 'node:fs';
import { lstat, realpath, readdir, mkdir, mkdtemp, copyFile, chmod, rename, open, readFile, rmdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';

const directories = ['keeper', 'tailscale'];
const marker = '.doodletick-migration.json';
const overlaps = (a, b) => { const relative = path.relative(a, b); return !relative || (!relative.startsWith('..' + path.sep) && relative !== '..' && !path.isAbsolute(relative)); };
const fail = message => { throw Error(message); };

async function directory(value) {
  if (!path.isAbsolute(value)) fail('Use explicit absolute data-directory paths.');
  const resolved = path.resolve(value), parts = resolved.slice(path.parse(resolved).root.length).split(path.sep).filter(Boolean);
  let current = path.parse(resolved).root;
  for (const part of parts) {
    current = path.join(current, part);
    const info = await lstat(current);
    if (info.isSymbolicLink() || !info.isDirectory()) fail('A data-directory path is linked or is not a directory.');
  }
  return realpath(resolved);
}

async function exists(name) {
  try { await lstat(name); return true; } catch (error) { if (error.code === 'ENOENT') return false; throw error; }
}

async function digest(name) {
  const hash = createHash('sha256');
  for await (const bytes of createReadStream(name)) hash.update(bytes);
  return hash.digest('hex');
}

async function flushFile(name, flags = 'r+') {
  const file = await open(name, flags);
  try { await file.sync(); } finally { await file.close(); }
}

async function flushDirectory(name) {
  // Linux is the deployment target. Windows does not allow opening directories
  // this way; disposable Windows tests still verify every file's read-back.
  if (process.platform !== 'win32') await flushFile(name, 'r');
}

async function inventory(root) {
  const files = [];
  async function scan(relative) {
    const absolute = path.join(root, relative), info = await lstat(absolute);
    if (info.isSymbolicLink()) fail('Private data contains a linked path; review it before transfer.');
    if (info.isDirectory()) {
      for (const child of (await readdir(absolute)).sort()) await scan(relative + '/' + child);
    } else if (info.isFile() && info.nlink === 1) files.push({ name: relative, bytes: info.size, sha256: await digest(absolute) });
    else fail('Private data contains a linked or non-regular file; stop the apps before transfer.');
  }
  for (const name of directories) await scan(name);
  if (!files.some(file => file.name === 'keeper/witness-key.json')) fail('The source has no Keeper witness identity.');
  return files.sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
}

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const summary = files => ({ files: files.length, bytes: files.reduce((total, file) => total + file.bytes, 0), verified: true });

async function readRecord(root) {
  const recordPath = path.join(root, marker), info = await lstat(recordPath);
  if (!info.isFile() || info.isSymbolicLink() || info.nlink !== 1 || info.size > 2_000_000) fail('Invalid migration record.');
  const record = JSON.parse(await readFile(recordPath, 'utf8'));
  if (record.format !== 'doodletick-offline-copy-v1' || record.complete !== true || !Array.isArray(record.files) || !record.files.length) fail('No completed migration record.');
  const files = record.files.map(file => {
    if (!file || typeof file.name !== 'string' || !/^(keeper|tailscale)\/[A-Za-z0-9._/-]+$/.test(file.name)
      || file.name.split('/').some(part => !part || part === '.' || part === '..')
      || !Number.isSafeInteger(file.bytes) || file.bytes < 0 || !/^[0-9a-f]{64}$/.test(file.sha256)) fail('Unsafe migration record.');
    return { name: file.name, bytes: file.bytes, sha256: file.sha256 };
  }).sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
  if (new Set(files.map(file => file.name)).size !== files.length || !files.some(file => file.name === 'keeper/witness-key.json')) fail('Invalid migration inventory.');
  return files;
}

export async function copyOfflineData({ source, destination, offline = false }) {
  if (offline !== true) fail('Stop both apps and disable automatic restart before using the offline transfer.');
  source = await directory(source); destination = await directory(destination);
  if (overlaps(source, destination) || overlaps(destination, source)) fail('Source and destination must be separate data directories.');
  const entries = await readdir(destination);
  if (entries.some(name => name !== 'options.json')) fail('The destination already contains data. Only its Supervisor options.json may exist; nothing was replaced.');
  if (entries.length) {
    const options = await lstat(path.join(destination, 'options.json'));
    if (!options.isFile() || options.isSymbolicLink() || options.nlink !== 1) fail('The target options file is linked or is not a regular file.');
  }
  const files = await inventory(source);
  const stage = await mkdtemp(path.join(destination, '.doodletick-migration-stage-'));
  await chmod(stage, 0o700);
  // Leave any incomplete stage for private inspection; never delete source data.
  for (const name of directories) await mkdir(path.join(stage, name), { mode: 0o700 });
  for (const file of files) {
    const target = path.join(stage, file.name);
    await mkdir(path.dirname(target), { recursive: true, mode: 0o700 });
    await copyFile(path.join(source, file.name), target, constants.COPYFILE_EXCL);
    await chmod(target, 0o600);
    await flushFile(target);
  }
  if (!same(files, await inventory(source)) || !same(files, await inventory(stage))) fail('The source changed or a copied file differs. Keep both apps stopped; no complete migration was committed.');
  if ((await readdir(destination)).some(name => name !== 'options.json' && name !== path.basename(stage))) fail('The destination changed during transfer. Keep both apps stopped.');
  const folders = new Set(directories.map(name => path.join(stage, name)));
  for (const file of files) {
    let folder = path.dirname(path.join(stage, file.name));
    while (folder !== stage) { folders.add(folder); folder = path.dirname(folder); }
  }
  for (const folder of [...folders].sort((a, b) => b.length - a.length)) await flushDirectory(folder);
  await flushDirectory(stage);
  // No overwrite is permitted. A failed partial commit remains visible and must
  // be inspected; the original app and the private backup remain the rollback.
  for (const name of directories) {
    if (await exists(path.join(destination, name))) fail('The destination changed during transfer. Keep both apps stopped.');
    await rename(path.join(stage, name), path.join(destination, name));
  }
  await flushDirectory(stage); await flushDirectory(destination);
  if (!same(files, await inventory(destination))) fail('Final read-back differs. Keep both apps stopped.');
  const record = await open(path.join(stage, marker), 'wx', 0o600);
  try { await record.writeFile(JSON.stringify({ format: 'doodletick-offline-copy-v1', complete: true, files }) + '\n'); await record.sync(); }
  finally { await record.close(); }
  if (await exists(path.join(destination, marker))) fail('The migration record appeared during transfer. Keep both apps stopped.');
  await rename(path.join(stage, marker), path.join(destination, marker));
  await flushDirectory(destination);
  await rmdir(stage); // Only the now-empty, tool-created staging directory.
  await flushDirectory(destination);
  return summary(files);
}

export async function verifyOfflineData({ source, destination, offline = false }) {
  if (offline !== true) fail('Verify while both apps are stopped, before the target first starts.');
  source = await directory(source); destination = await directory(destination);
  if (overlaps(source, destination) || overlaps(destination, source)) fail('Source and destination must be separate data directories.');
  const record = await readRecord(destination);
  const files = await inventory(source);
  if (!same(files, record) || !same(files, await inventory(destination))) fail('Source, copied data and migration record differ. Keep both apps stopped.');
  return summary(files);
}

// Call before either daemon starts or creates its data folders. The Supervisor
// still owns options.json; it is intentionally never transferred from staging.
export async function importMigration({ dataDir = '/data', migrationDir = '/config/doodletick-migration' } = {}) {
  dataDir = await directory(dataDir);
  const staged = await exists(migrationDir);
  if (await exists(path.join(dataDir, marker))) {
    const previous = await readRecord(dataDir);
    for (const name of directories) await directory(path.join(dataDir, name));
    for (const file of previous.filter(file => ['keeper/garden-ledger.json', 'keeper/receipts.jsonl', 'tailscale/tailscaled.state'].includes(file.name))) {
      const info = await lstat(path.join(dataDir, file.name));
      if (!info.isFile() || info.isSymbolicLink() || info.nlink !== 1) fail('Imported persistent state is missing or linked. Restore its matching private backup.');
    }
    const witness = path.join(dataDir, 'keeper', 'witness-key.json'), info = await lstat(witness);
    const expected = previous.find(file => file.name === 'keeper/witness-key.json');
    if (!info.isFile() || info.isSymbolicLink() || info.nlink !== 1 || await digest(witness) !== expected.sha256) fail('The imported witness identity changed. Restore its matching private backup.');
    if (staged) {
      migrationDir = await directory(migrationDir);
      if (!same(previous, await readRecord(migrationDir))) fail('A different migration is staged for an already imported app. Nothing was replaced.');
    }
    // Ledger and Tailscale state legitimately change after the first start.
    // Never re-copy an older snapshot, even when the stage is left in place.
    return { status: 'already-imported' };
  }
  if (!staged) return { status: 'not-staged' };
  migrationDir = await directory(migrationDir);
  const expected = await readRecord(migrationDir);
  if (!same(expected, await inventory(migrationDir))) fail('Staged private data does not match its migration inventory.');
  const result = await copyOfflineData({ source: migrationDir, destination: dataDir, offline: true });
  return { status: 'imported', ...result };
}

