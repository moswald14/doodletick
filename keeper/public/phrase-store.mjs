// SPDX-License-Identifier: GPL-3.0-only
// This separate, unencrypted workspace never holds Keeper keys or passwords.
import { PHRASE_SOURCE_NOTICE } from './phrase-notices.mjs';
export const MAX_WAITING = 20000;
export const MAX_STORED = 250000;
const request = req => new Promise((resolve, reject) => { req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error); });
const finished = tx => new Promise((resolve, reject) => { tx.oncomplete = resolve; tx.onabort = () => reject(tx.error || new Error('Phrase workspace was not saved.')); tx.onerror = () => {}; });
const fail = message => { throw new Error(message); };

export async function openPhraseStore({ indexedDB = globalThis.indexedDB, name = 'doodlekeeper-phrase-lab-v1' } = {}) {
  if (!indexedDB) fail('This browser cannot save phrase progress. Use a regular browser window.');
  const opening = indexedDB.open(name, 1);
  opening.onupgradeneeded = () => {
    const db = opening.result;
    db.createObjectStore('meta', { keyPath: 'id' });
    const items = db.createObjectStore('items', { keyPath: 'text' });
    items.createIndex('status', 'status');
    const batches = db.createObjectStore('batches', { keyPath: 'id' });
    batches.createIndex('status', 'status');
  };
  const db = await request(opening);
  db.onversionchange = () => db.close();
  async function transaction(names, mode, action) {
    const tx = db.transaction(names, mode), done = finished(tx);
    try { const result = await action(tx); await done; return result; }
    catch (error) { try { tx.abort(); } catch {} await done.catch(() => {}); throw error; }
  }
  const stats = () => transaction(['items'], 'readonly', async tx => {
    const items = tx.objectStore('items'), index = items.index('status');
    const requests = ['pile', 'queued', 'posted'].map(status => request(index.count(status)));
    const total = request(items.count());
    const [pile, queued, posted] = await Promise.all(requests);
    return { pile, queued, posted, total: await total };
  });
  const list = (status, limit = 50, offset = 0) => {
    if (!['pile', 'queued', 'posted'].includes(status) || !Number.isInteger(limit) || limit < 1 || limit > MAX_STORED || !Number.isInteger(offset) || offset < 0) fail('Invalid phrase page.');
    return transaction(['items'], 'readonly', tx => new Promise((resolve, reject) => {
      const rows = [], req = tx.objectStore('items').index('status').openCursor(status);
      let skip = offset;
      req.onerror = () => reject(req.error);
      req.onsuccess = () => {
        const cursor = req.result;
        if (!cursor || rows.length >= limit) return resolve(rows);
        if (skip) { const n = skip; skip = 0; cursor.advance(n); return; }
        rows.push(cursor.value); cursor.continue();
      };
    }));
  };
  return Object.freeze({
    stats, list,
    getJob: id => transaction(['meta'], 'readonly', tx => request(tx.objectStore('meta').get(id))),
    getPreference: () => transaction(['meta'], 'readonly', tx => request(tx.objectStore('meta').get('preferences'))),
    savePreference: settings => transaction(['meta'], 'readwrite', tx => request(tx.objectStore('meta').put({ id: 'preferences', settings }))),
    async commitChunk(job, matches, expectedRevision = 0, autoQueue = true) {
      if (!job || typeof job.id !== 'string' || job.id === 'preferences' || matches.length > 10000) fail('Invalid phrase checkpoint.');
      return transaction(['meta', 'items'], 'readwrite', async tx => {
        const meta = tx.objectStore('meta'), items = tx.objectStore('items');
        const current = await request(meta.get(job.id));
        if ((current?.revision || 0) !== expectedRevision) fail('Another tab advanced this search. Reopen Phrase lab to load its checkpoint.');
        const counts = await Promise.all(['pile', 'queued'].map(status => request(items.index('status').count(status))));
        let waiting = counts[0] + counts[1], total = await request(items.count()), added = 0;
        for (const match of matches) {
          if (!match || typeof match.text !== 'string' || !match.text || match.text.length > 1000 || !Array.isArray(match.sources) || !Array.isArray(match.tags)) fail('Invalid phrase match.');
          if (await request(items.get(match.text))) continue;
          if (total >= MAX_STORED) fail('The phrase workspace has reached its 250,000-phrase history limit. Export a snapshot. Posting cannot expand this limit; this chunk has not advanced.');
          if (waiting >= MAX_WAITING) fail('The waiting pile is full. Queue and post waiting phrases to make room. This chunk has not advanced.');
          await request(items.add({ text: match.text, sources: match.sources, tags: match.tags, dictionaryId: job.dictionaryId, status: autoQueue ? 'queued' : 'pile', addedAt: new Date().toISOString() }));
          waiting++; total++; added++;
        }
        const saved = { ...job, revision: expectedRevision + 1, updatedAt: new Date().toISOString() };
        await request(meta.put(saved));
        return { job: saved, added };
      });
    },
    queuePile(qualifies) {
      return transaction(['items'], 'readwrite', tx => new Promise((resolve, reject) => {
        let changed = 0;
        const req = tx.objectStore('items').index('status').openCursor('pile');
        req.onerror = () => reject(req.error);
        req.onsuccess = () => {
          const cursor = req.result;
          if (!cursor) return resolve(changed);
          if (qualifies(cursor.value)) { cursor.update({ ...cursor.value, status: 'queued' }); changed++; }
          cursor.continue();
        };
      }));
    },
    pendingBatch: () => transaction(['batches'], 'readonly', async tx => (await request(tx.objectStore('batches').index('status').getAll('pending', 1)))[0]?.batch || null),
    async saveBatch(batch) {
      return transaction(['batches', 'items'], 'readwrite', async tx => {
        const batches = tx.objectStore('batches'), items = tx.objectStore('items');
        const existing = await request(batches.get(batch.id));
        if (existing) return existing.batch;
        for (const phrase of batch.phrases) {
          const item = await request(items.get(phrase.text || phrase.phrase || phrase));
          if (!item || item.status !== 'queued') fail('The posting queue changed. Please try again.');
        }
        await request(batches.add({ id: batch.id, status: 'pending', batch }));
        return batch;
      });
    },
    async completeBatch(batch, receipt) {
      if (!receipt || typeof receipt.proofId !== 'string' || !receipt.proofId) fail('Keeper did not return a saved seal. The batch remains pending.');
      return transaction(['batches', 'items'], 'readwrite', async tx => {
        const batches = tx.objectStore('batches'), items = tx.objectStore('items');
        const record = await request(batches.get(batch.id));
        if (!record || record.status === 'posted') return;
        for (const phrase of batch.phrases) {
          const text = phrase.text || phrase.phrase || phrase, item = await request(items.get(text));
          if (!item) fail('A pending phrase is missing. Export the workspace before continuing.');
          await request(items.put({ ...item, status: 'posted', proofId: receipt.proofId, witnessed: !!receipt.witnessed, postedAt: new Date().toISOString() }));
        }
        await request(batches.put({ ...record, status: 'posted', receipt }));
      });
    },
    exportWorkspace: () => transaction(['meta', 'items', 'batches'], 'readonly', async tx => {
      const [meta, items, batches] = await Promise.all(['meta', 'items', 'batches'].map(name => request(tx.objectStore(name).getAll())));
      return { format: 'doodlekeeper-phrase-workspace-v1', exportedAt: new Date().toISOString(), sourceNotices: PHRASE_SOURCE_NOTICE, meta, items, batches };
    }),
    close: () => db.close(),
  });
}
