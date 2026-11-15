import { b64, unb64, random } from './core.mjs';
import { verifyFile, verifyManifest, MAX_FILE } from './licenses.mjs';
import { zip, unzip } from './archive.mjs';
const enc = new TextEncoder(), dec = new TextDecoder('utf-8', { fatal: true });
export const LIBRARY_LIMIT = 100 * 1024 * 1024;
export const MAX_ITEMS = 100;
const request = req => new Promise((resolve, reject) => { req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error); });
let connection;
async function database() {
  if (!connection) connection = new Promise((resolve, reject) => {
    const req = indexedDB.open('doodletick-files-v1', 1);
    req.onupgradeneeded = () => { req.result.createObjectStore('files', { keyPath: 'pk' }).createIndex('scope', 'scope'); };
    req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error);
  });
  return connection;
}
const aad = (scope, id, part) => enc.encode(`doodletick-file-v1:${scope}:${id}:${part}`);
export class FileStore {
  constructor(identity, key) { this.scope = identity.fingerprint; this.key = key; this.closed = false; }
  ensure() { if (this.closed) throw new Error('Unlock your vault to use stored files.'); }
  close() { this.closed = true; this.key = null; }
  async rows() { this.ensure(); const db = await database(); return request(db.transaction('files').objectStore('files').index('scope').getAll(this.scope)); }
  async row(id) { this.ensure(); const db = await database(); const row = await request(db.transaction('files').objectStore('files').get(this.scope + ':' + id)); if (!row) throw new Error('This file is no longer stored here.'); return row; }
  async decode(row, withData = false) {
    this.ensure(); const key = this.key;
    if (row.scope !== this.scope || row.pk !== this.scope + ':' + row.id) throw new Error('This file backup belongs to a different identity.');
    const raw = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(row.ivMeta), additionalData: aad(this.scope, row.id, 'meta') }, key, row.meta);
    const meta = JSON.parse(dec.decode(raw));
    if (meta.manifest.id !== row.id || !await verifyManifest(meta.manifest)) throw new Error('A stored license record failed verification.');
    if (withData) {
      meta.data = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(row.ivData), additionalData: aad(this.scope, row.id, 'data') }, key, row.data);
      if (!await verifyFile(meta.manifest, meta.data)) throw new Error('The stored file does not match its signed record.');
    }
    this.ensure(); return { ...meta, id: row.id, bytes: row.meta.byteLength + row.data.byteLength };
  }
  async list() { return Promise.all((await this.rows()).map(row => this.decode(row))); }
  async get(id) { return this.decode(await this.row(id), true); }
  async put(manifest, data, shared = false) {
    this.ensure(); if (!await verifyFile(manifest, data)) throw new Error('The file or license signature does not match. Nothing was stored.');
    const id = manifest.id, ivMeta = random(12), ivData = random(12), key = this.key;
    const meta = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: ivMeta, additionalData: aad(this.scope, id, 'meta') }, key, enc.encode(JSON.stringify({ manifest, shared: Boolean(shared), savedAt: new Date().toISOString() })));
    const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: ivData, additionalData: aad(this.scope, id, 'data') }, key, data);
    const row = { pk: this.scope + ':' + id, scope: this.scope, id, ivMeta: b64(ivMeta), ivData: b64(ivData), meta, data: ciphertext };
    await this.commit([row]); return id;
  }
  async commit(incoming) {
    this.ensure();
    await navigator.locks.request('doodletick-files:' + this.scope, async () => {
      this.ensure(); const existing = await this.rows(), rows = new Map(existing.map(row => [row.id, row]));
      for (const row of incoming) rows.set(row.id, row);
      if (rows.size > MAX_ITEMS || [...rows.values()].reduce((n, row) => n + row.meta.byteLength + row.data.byteLength, 0) > LIBRARY_LIMIT) throw new Error('This library is full (100 MiB / 100 files). Download backups and remove a local copy first.');
      const db = await database(); this.ensure();
      await new Promise((resolve, reject) => {
        const tx = db.transaction('files', 'readwrite'); for (const row of incoming) tx.objectStore('files').put(row);
        tx.oncomplete = resolve; tx.onerror = tx.onabort = () => reject(new Error('Browser storage is full or unavailable. Nothing was committed.'));
      });
    });
  }
  async setShared(id, shared) { const entry = await this.get(id); return this.put(entry.manifest, entry.data, shared); }
  async remove(id) {
    this.ensure(); await navigator.locks.request('doodletick-files:' + this.scope, async () => {
      const db = await database(); this.ensure(); await new Promise((resolve, reject) => { const tx = db.transaction('files', 'readwrite'); tx.objectStore('files').delete(this.scope + ':' + id); tx.oncomplete = resolve; tx.onabort = tx.onerror = () => reject(tx.error); });
    });
  }
  async backup() {
    const rows = await this.rows(), entries = [];
    for (const row of rows) {
      const { data, meta, ...header } = row;
      entries.push([row.id + '.json', JSON.stringify({ ...header, meta: b64(meta) })], [row.id + '.bin', data]);
    }
    entries.unshift(['index.json', JSON.stringify({ format: 'doodletick-file-backup-v1', scope: this.scope, ids: rows.map(r => r.id) })]);
    this.ensure(); return zip(entries);
  }
  async restore(buffer) {
    this.ensure(); const parts = unzip(buffer, LIBRARY_LIMIT + 5 * 1024 * 1024), index = JSON.parse(dec.decode(parts.get('index.json')));
    if (index.format !== 'doodletick-file-backup-v1' || index.scope !== this.scope || !Array.isArray(index.ids) || index.ids.length > MAX_ITEMS || new Set(index.ids).size !== index.ids.length || parts.size !== index.ids.length * 2 + 1) throw new Error('Restore the matching identity vault before importing this file backup.');
    const restored = [];
    for (const id of index.ids) {
      if (!/^[A-Za-z0-9_-]{43}$/.test(id)) throw new Error('Invalid file backup.');
      const row = JSON.parse(dec.decode(parts.get(id + '.json'))); row.meta = unb64(row.meta).buffer; row.data = parts.get(id + '.bin')?.buffer;
      if (row.id !== id || !row.data || row.data.byteLength > MAX_FILE + 16) throw new Error('Invalid file backup.');
      const decoded = await this.decode(row, true);
      // Restoring never silently enables sharing. Reseal only the local encrypted metadata.
      const iv = random(12); row.ivMeta = b64(iv);
      row.meta = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: aad(this.scope, id, 'meta') }, this.key, enc.encode(JSON.stringify({ manifest: decoded.manifest, shared: false, savedAt: new Date().toISOString() })));
      restored.push(row);
    }
    await this.commit(restored); return restored.length;
  }
}
