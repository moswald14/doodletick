// SPDX-License-Identifier: GPL-3.0-only
import { createHash } from 'node:crypto';
import { mkdir, lstat, readFile } from 'node:fs/promises';
import path from 'node:path';
import { atomicJazzJson } from './jazz-library.mjs';
import { DJ_GENRE_IDS } from './public/jazz-genres.mjs';
import { JAZZ_CHORD_QUALITIES } from './public/jazz-name-contract.mjs';

const FORMAT = 'doodle-jazz-band-memory-v1', MAX_PATTERNS = 128, MAX_EVENTS = 7000;
const QUALITIES = new Set(JAZZ_CHORD_QUALITIES);
const NOTES = ['C','D♭','D','E♭','E','F','G♭','G','A♭','A','B♭','B'];
const sha = value => createHash('sha256').update(value).digest('hex');
const validRoot = value => Number.isInteger(value) && value >= 0 && value <= 11;
const fail = message => Object.assign(new Error(message), { status: 503 });
export function jazzTonic(info) {
  if (validRoot(info?.tonic)) return info.tonic;
  const name = typeof info?.key === 'string' ? info.key.split(' ')[0] : '';
  const found = NOTES.indexOf(name);
  if (found < 0) throw new Error('The musical key is unavailable.');
  return found;
}
export function jazzLearningPassage(info, chords) {
  if (!DJ_GENRE_IDS.includes(info?.style) || !Array.isArray(chords) || !chords.length || chords.length > 8) throw new Error('Invalid band feedback.');
  const tonic = jazzTonic(info);
  const values = chords.map(chord => {
    if (validRoot(chord?.root) && QUALITIES.has(chord.quality)) return { root: chord.root, quality: chord.quality };
    const symbol = chord?.text;
    if (typeof symbol !== 'string') throw new Error('Invalid feedback chord.');
    const match = /^(C|D♭|D|E♭|E|F|G♭|G|A♭|A|B♭|B)(maj9|m9|13|7♭9|7|ø7|6\/9|m6|9)$/.exec(symbol);
    if (!match) throw new Error('Invalid feedback chord.');
    return { root: NOTES.indexOf(match[1]), quality: match[2] };
  });
  return { style: info.style, tonic, chords: values };
}
const patternId = passage => sha(JSON.stringify([passage.style, passage.chords.map(c => [(c.root - passage.tonic + 12) % 12, c.quality])]));

// Preference data is independent of permanent signed keepsakes and payment
// records. A damaged memory never stops radio or overwrites the damaged file.
export async function createJazzLearning({ dataDir, now = Date.now } = {}) {
  const directory = path.join(dataDir, 'jazz-learning'), filename = path.join(directory, 'memory.json');
  let state = { format: FORMAT, patterns: [], seen: [], counts: { named: 0, saved: 0 } }, damaged = false, closing = false, chain = Promise.resolve(), lastError = null;
  try {
    await mkdir(directory, { recursive: true, mode: 0o700 });
    const directoryInfo = await lstat(directory);
    if (!directoryInfo.isDirectory() || directoryInfo.isSymbolicLink()) throw new Error('Invalid band directory.');
    const fileInfo = await lstat(filename).catch(error => { if (error.code !== 'ENOENT') throw error; return null; });
    if (fileInfo) {
      if (!fileInfo.isFile() || fileInfo.isSymbolicLink() || fileInfo.size > 2 * 1024 * 1024) throw new Error('Invalid band memory.');
      const stored = JSON.parse(await readFile(filename, 'utf8'));
      if (stored?.format !== FORMAT || !Array.isArray(stored.patterns) || stored.patterns.length > MAX_PATTERNS || !Array.isArray(stored.seen) || stored.seen.length > MAX_EVENTS
        || !stored.seen.every(value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value)) || new Set(stored.seen).size !== stored.seen.length
        || !['named','saved'].every(key => Number.isSafeInteger(stored.counts?.[key]) && stored.counts[key] >= 0)
        || stored.counts.named + stored.counts.saved !== stored.seen.length) throw new Error('Invalid band memory.');
      const ids = new Set();
      for (const item of stored.patterns) {
        const passage = jazzLearningPassage(item, item.chords);
        if (item.id !== patternId(passage) || ids.has(item.id) || !Number.isSafeInteger(item.likes) || item.likes < 1 || item.likes > MAX_EVENTS
          || !Number.isSafeInteger(item.lastLikedAt) || item.lastLikedAt < 0) throw new Error('Invalid band pattern.');
        ids.add(item.id);
      }
      if(stored.patterns.reduce((sum,item)=>sum+item.likes,0)!==stored.seen.length)throw new Error('Inconsistent band memory.');
      state = stored;
    }
  } catch { damaged = true; lastError = 'Band memory needs recovery. Your recordings and existing feedback have been preserved.'; }
  const serialized = task => { const result = chain.then(task); chain = result.catch(() => {}); return result; };
  return {
    status() { return { available: !damaged && !closing, patterns: state.patterns.length, likes: state.seen.length, named: state.counts.named, saved: state.counts.saved, error: lastError }; },
    favorites() { return damaged ? [] : [...state.patterns].sort((a,b) => b.likes - a.likes || b.lastLikedAt - a.lastLikedAt).slice(0,32)
      .map(item => ({ style: item.style, tonic: item.tonic, chords: item.chords.map(c => ({ ...c })), weight: Math.min(100, item.likes) })); },
    remember({ eventId, source, passage }) { return serialized(async () => {
      if (damaged || closing) throw fail(lastError || 'Band memory is unavailable.');
      if (typeof eventId !== 'string' || !eventId || eventId.length > 128 || !['named','saved'].includes(source)) throw new Error('Invalid feedback event.');
      const event = sha(source + ':' + eventId);
      if (state.seen.includes(event)) return { learned: false, duplicate: true };
      const normalized = jazzLearningPassage(passage, passage?.chords), id = patternId(normalized);
      if (state.seen.length >= MAX_EVENTS || (state.patterns.length >= MAX_PATTERNS && !state.patterns.some(item => item.id === id))) {
        lastError = 'The band memory is full. Existing favorites and all saved passages are still available.';
        throw fail(lastError);
      }
      const next = structuredClone(state), existing = next.patterns.find(item => item.id === id), stamp = now();
      if (!Number.isSafeInteger(stamp) || stamp < 0) throw new Error('Invalid feedback time.');
      if (existing) { existing.likes++; existing.lastLikedAt = stamp; existing.tonic = normalized.tonic; existing.chords = normalized.chords; }
      else next.patterns.push({ ...normalized, id, likes: 1, lastLikedAt: stamp });
      next.seen.push(event); next.counts[source]++;
      try { await atomicJazzJson(filename, next); }
      catch { lastError = 'The band could not save this feedback. Your signed keepsakes and previous favorites are safe.'; throw fail(lastError); }
      state = next; lastError = null; return { learned: true, duplicate: false };
    }); },
    async close() { closing = true; await chain; }
  };
}
