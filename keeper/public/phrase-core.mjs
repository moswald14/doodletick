// SPDX-License-Identifier: GPL-3.0-only
import { hash, MAX_TEXT } from './core.mjs';
import { PHRASE_SOURCE_NOTICE } from './phrase-notices.mjs';

export const PHRASE_CURSOR_FORMAT = 'doodlekeeper-phrase-cursor-v1';
const MAX_PHRASE = 2000, MAX_DICTIONARY = 2000000, MAX_CHUNK = 10000;
const token = /[\p{L}\p{N}][\p{L}\p{M}\p{N}]*(?:['-][\p{L}\p{N}][\p{L}\p{M}\p{N}]*)*/gu;
const oneWord = /^[\p{L}][\p{L}\p{M}]*(?:['-][\p{L}][\p{L}\p{M}]*)*$/u;
const blockedTags = /(?:^|[-_\s])(?:vulgar|offensive|derogatory|slur|racist|sexist|homophobic|transphobic|pejorative|profanity|taboo|sexual|explicit|obscene)(?:$|[-_\s])/i;
const compiledTerms = new WeakMap();
const fail = message => { throw new Error(message); };
function plain(value) { return value !== null && typeof value === 'object' && !Array.isArray(value) && [Object.prototype, null].includes(Object.getPrototypeOf(value)); }
function dictionaryName(value) { if (typeof value !== 'string' || !value || value.length > 300 || /[\r\n\u0000]/u.test(value)) fail('A dictionary identity is required.'); return value; }

export function normalizePhrase(text) {
  if (typeof text !== 'string' || text.length > MAX_PHRASE || /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/u.test(text)) fail('The phrase is missing, too long or contains control characters.');
  return text.normalize('NFKC').replace(/[\u2018\u2019\u02BC\uFF07]/gu, "'").replace(/[\u2010-\u2013\u2212]/gu, '-').toLowerCase().trim().replace(/\s+/gu, ' ');
}
export function phraseWords(text) { return normalizePhrase(text).match(token) || []; }
export function wordCount(text) { return phraseWords(text).length; }

// This checksum detects incompatible resume inputs, rather than authenticating
// dictionary content. The bundled dictionary has its own SHA-256 identity.
function listChecksum(words) {
  let a = 0x811c9dc5, b = 0x9e3779b9;
  for (const word of words) {
    for (let i = 0; i < word.length; i++) { const n = word.charCodeAt(i); a = Math.imul(a ^ n, 0x01000193); b = Math.imul(b ^ n, 0x85ebca6b); }
    a = Math.imul(a ^ 10, 0x01000193); b = Math.imul(b ^ 10, 0xc2b2ae35);
  }
  return (a >>> 0).toString(16).padStart(8, '0') + (b >>> 0).toString(16).padStart(8, '0');
}
function limits(minWords, maxWords) {
  if (!Number.isInteger(minWords) || !Number.isInteger(maxWords) || minWords < 1 || maxWords > 8 || minWords > maxWords) fail('Choose a phrase length from one to eight words.');
}
export function createEnumerator(words, { dictionaryId, minWords = 1, maxWords = 8, cursor } = {}) {
  dictionaryName(dictionaryId); limits(minWords, maxWords);
  if (!Array.isArray(words) || !words.length || words.length > MAX_DICTIONARY) fail('Choose a nonempty supported dictionary.');
  const vocabulary = words.map(word => {
    const normalized = normalizePhrase(word);
    if (!oneWord.test(normalized)) fail('Dictionary entries must each contain one word.');
    return normalized;
  });
  if (new Set(vocabulary).size !== vocabulary.length) fail('The dictionary contains duplicate words.');
  const dictionaryHash = listChecksum(vocabulary), base = BigInt(vocabulary.length);
  const spans = [];
  let total = 0n;
  for (let length = minWords; length <= maxWords; length++) { const size = base ** BigInt(length); spans.push({ length, start: total, size }); total += size; }
  let nextRank = 0n;
  if (cursor !== undefined) {
    const fields = ['format', 'dictionaryId', 'dictionaryHash', 'minWords', 'maxWords', 'nextRank'];
    if (!plain(cursor) || Object.keys(cursor).length !== fields.length || fields.some(key => !Object.hasOwn(cursor, key)) || cursor.format !== PHRASE_CURSOR_FORMAT || cursor.dictionaryId !== dictionaryId || cursor.dictionaryHash !== dictionaryHash || cursor.minWords !== minWords || cursor.maxWords !== maxWords || typeof cursor.nextRank !== 'string' || !/^(?:0|[1-9][0-9]{0,55})$/u.test(cursor.nextRank)) fail('This checkpoint does not match the dictionary or search settings.');
    nextRank = BigInt(cursor.nextRank);
    if (nextRank > total) fail('This checkpoint is outside the search.');
  }
  const checkpoint = () => ({ format: PHRASE_CURSOR_FORMAT, dictionaryId, dictionaryHash, minWords, maxWords, nextRank: String(nextRank) });
  return Object.freeze({
    dictionaryId, total,
    cursor: checkpoint,
    next(limit = 1000) {
      if (!Number.isInteger(limit) || limit < 1 || limit > MAX_CHUNK) fail('A search chunk must contain from one to 10,000 attempts.');
      const phrases = [];
      while (phrases.length < limit && nextRank < total) {
        const span = spans.find(value => nextRank < value.start + value.size);
        let rank = nextRank - span.start;
        const parts = Array(span.length);
        for (let i = span.length - 1; i >= 0; i--) { parts[i] = vocabulary[Number(rank % base)]; rank /= base; }
        phrases.push(parts.join(' ')); nextRank++;
      }
      return { phrases, nextCursor: checkpoint(), done: nextRank === total };
    },
  });
}

function stringList(value, label, limit = 30) {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > limit || value.some(item => typeof item !== 'string' || item.length > 2000)) fail(`Unsupported ${label}.`);
  return [...new Set(value)];
}
function sourcesFor(item) {
  const sources = stringList(item.sources, 'phrase sources', 16);
  if (item.source !== undefined) sources.push(...stringList([item.source], 'phrase source', 1));
  return [...new Set(sources)].map(source => {
    let url; try { url = new URL(source); } catch { fail('A phrase source must be a valid HTTPS link.'); }
    if (url.protocol !== 'https:' || url.username || url.password || /[\r\n]/u.test(source)) fail('A phrase source must be a valid HTTPS link.');
    return url.href;
  }).sort();
}
function phraseRecord(value) {
  const item = typeof value === 'string' ? { text: value } : value;
  if (!plain(item)) fail('Unsupported phrase record.');
  const text = normalizePhrase(item.text ?? item.phrase);
  const count = wordCount(text);
  if (!text || count < 1 || count > 8) fail('A phrase must contain from one to eight words.');
  if (item.blocked !== undefined && typeof item.blocked !== 'boolean') fail('Unsupported phrase filter flag.');
  return { text, sources: sourcesFor(item), tags: stringList(item.tags, 'phrase tags').sort(), blocked: item.blocked === true };
}
export function createAttestedIndex(records) {
  if (!Array.isArray(records) || records.length > 1000000) fail('Unsupported phrase attestations.');
  const result = new Map();
  for (const record of records) {
    const item = phraseRecord(record), previous = result.get(item.text);
    if (previous) {
      previous.sources = [...new Set([...previous.sources, ...item.sources])].sort();
      previous.tags = [...new Set([...previous.tags, ...item.tags])].sort();
      previous.blocked ||= item.blocked;
    } else result.set(item.text, item);
  }
  return result;
}

const boundaryParts = text => normalizePhrase(text).match(/[\p{L}\p{M}\p{N}]+/gu) || [];
export function prepareBlockedTerms(terms) {
  if (terms && compiledTerms.has(terms)) return compiledTerms.get(terms);
  if (!(terms instanceof Set) && !Array.isArray(terms)) fail('Blocked terms must be a list or Set.');
  if (terms.size > MAX_DICTIONARY || terms.length > MAX_DICTIONARY) fail('The blocked-term list is too large.');
  const normalized = new Set(); let maxWords = 1;
  for (const term of terms) {
    const parts = boundaryParts(term); if (!parts.length) continue;
    if (parts.length > 16) fail('A blocked term is too long.');
    normalized.add(parts.join(' ')); maxWords = Math.max(maxWords, parts.length);
  }
  const matcher = Object.freeze({ terms: normalized, maxWords });
  compiledTerms.set(terms, matcher); return matcher;
}
function matchesBlocked(text, matcher) {
  const parts = boundaryParts(text);
  for (let start = 0; start < parts.length; start++) {
    for (let end = start + 1; end <= Math.min(parts.length, start + matcher.maxWords); end++) {
      if (matcher.terms.has(parts.slice(start, end).join(' '))) return true;
    }
  }
  return false;
}
export function assessPhrase(text, index, { friendly = true, blockedTerms = [], blockedWords, knownWords, knownWordSource } = {}) {
  if (!(index instanceof Map) || typeof friendly !== 'boolean' || (knownWords !== undefined && !(knownWords instanceof Set)) || (blockedWords !== undefined && !(blockedWords instanceof Set))) fail('Unsupported phrase filter settings.');
  const phrase = normalizePhrase(text), count = wordCount(phrase), record = index.get(phrase);
  const result = { accepted: false, phrase, wordCount: count, reason: 'not-attested', tags: record ? [...record.tags] : [], sources: record ? [...record.sources] : [] };
  if (!phrase || count < 1 || count > 8) return { ...result, reason: 'word-count' };
  const knownWord = count === 1 && knownWords?.has(phrase);
  if (!record && !knownWord) return result;
  if (knownWord && knownWordSource !== undefined) result.sources = [...new Set([...result.sources, ...sourcesFor({ source: knownWordSource })])].sort();
  if (friendly && (record?.blocked || result.tags.some(tag => blockedTags.test(tag)) || matchesBlocked(phrase, prepareBlockedTerms(blockedWords || blockedTerms)))) return { ...result, reason: 'friendly-filter' };
  return { ...result, accepted: true, reason: record ? 'dictionary-attested' : 'dictionary-word' };
}

export function dedupePhrases(items) {
  if (!Array.isArray(items) || items.length > 10000) fail('Unsupported phrase list.');
  const byText = new Map();
  for (const value of items) {
    const item = phraseRecord(value), previous = byText.get(item.text);
    if (previous) {
      previous.sources = [...new Set([...previous.sources, ...item.sources])].sort();
      previous.tags = [...new Set([...previous.tags, ...item.tags])].sort(); previous.blocked ||= item.blocked;
    } else byText.set(item.text, item);
  }
  return [...byText.values()];
}
export async function createPhraseBatch(items, { dictionaryId } = {}) {
  dictionaryName(dictionaryId);
  if (!Array.isArray(items) || !items.length || items.length > 100) fail('A Keeper batch contains from one to 100 phrases.');
  const phrases = dedupePhrases(items);
  const contents = phrases.map(({ text, sources }) => ({ text, sources }));
  const id = await hash({ format: 'doodlekeeper-phrase-batch-v1', dictionaryId, phrases: contents, notices: await hash(PHRASE_SOURCE_NOTICE) });
  const title = 'Phrase pile / ' + id;
  const lines = [
    'MACHINE-COLLECTED PHRASE LIST',
    'Batch: doodlekeeper-phrase-batch-v1:' + id,
    'Dictionary: ' + dictionaryId,
    'Recorded expressions, collected as text. This list does not assert their truth, endorse them, or claim original authorship.',
    'Sources: English Speller Database / SCOWL, DWYL english-words, and English Wiktionary contributors via Kaikki.org.',
    'Source-specific copyright, permission and attribution notices follow the phrase list.', '',
  ];
  for (const item of phrases) {
    const phraseId = await hash({ format: 'doodlekeeper-phrase-v1', dictionaryId, text: item.text });
    lines.push('[' + phraseId + '] ' + item.text);
    if (item.sources.length) lines.push('Source: ' + item.sources.join(' '));
    lines.push('');
  }
  const body = lines.join('\n') + '\n' + PHRASE_SOURCE_NOTICE;
  if (body.length > Math.min(MAX_TEXT, 200000)) fail('This phrase batch is too large for a Keeper note.');
  return { id, dictionaryId, title, body, kind: 'Note', revisionOf: null, phrases };
}
