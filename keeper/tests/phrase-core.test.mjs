// SPDX-License-Identifier: GPL-3.0-only
import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizePhrase, phraseWords, wordCount, createEnumerator, createAttestedIndex, assessPhrase, prepareBlockedTerms, dedupePhrases, createPhraseBatch } from '../public/phrase-core.mjs';
import { newIdentity, sealEntry, verifyEntry, validateVault } from '../public/core.mjs';

test('normalization preserves contractions, hyphenated words and Unicode letters', () => {
  assert.equal(normalizePhrase('  ＤＯＮ’T\tstop\nre‑reading café  '), "don't stop re-reading café");
  assert.deepEqual(phraseWords('“Don’t stop, re‑read café!”'), ["don't", 'stop', 're-read', 'café']);
  assert.equal(wordCount('Mother-in-law can’t go.'), 3);
  assert.throws(() => normalizePhrase('hello\u0000there'));
});
test('small exhaustive enumeration visits every ordered sequence including repeats', () => {
  const generator = createEnumerator(['a', 'b'], { dictionaryId: 'tiny', minWords: 1, maxWords: 2 });
  assert.equal(generator.total, 6n);
  const result = generator.next(10);
  assert.deepEqual(result.phrases, ['a', 'b', 'a a', 'a b', 'b a', 'b b']);
  assert.equal(result.done, true); assert.equal(result.nextCursor.nextRank, '6');
  assert.deepEqual(generator.next(2).phrases, []);
});
test('saved checkpoints resume at exactly the next attempt across length boundaries', () => {
  const options = { dictionaryId: 'tiny', minWords: 1, maxWords: 3 };
  const first = createEnumerator(['a', 'b'], options).next(5);
  const restored = createEnumerator(['a', 'b'], { ...options, cursor: JSON.parse(JSON.stringify(first.nextCursor)) });
  const rest = restored.next(100);
  assert.deepEqual([...first.phrases, ...rest.phrases], createEnumerator(['a', 'b'], options).next(100).phrases);
  assert.equal(rest.phrases[0], 'b b');
  assert.equal(rest.phrases.at(-1), 'b b b');
});
test('checkpoint binding rejects changed contents, ordering, dictionary ID and lengths', () => {
  const options = { dictionaryId: 'tiny', minWords: 1, maxWords: 2 };
  const cursor = createEnumerator(['a', 'b'], options).next(3).nextCursor;
  for (const words of [['a', 'c'], ['b', 'a'], ['a']]) assert.throws(() => createEnumerator(words, { ...options, cursor }), /checkpoint/);
  assert.throws(() => createEnumerator(['a', 'b'], { ...options, dictionaryId: 'other', cursor }), /checkpoint/);
  assert.throws(() => createEnumerator(['a', 'b'], { ...options, maxWords: 3, cursor }), /checkpoint/);
});
test('strict checkpoint and chunk validation fails before generation', () => {
  const options = { dictionaryId: 'tiny' }, generator = createEnumerator(['a'], options), cursor = generator.cursor();
  for (const nextRank of ['-1', '01', '1.0', 1, '9', '9'.repeat(100)]) assert.throws(() => createEnumerator(['a'], { ...options, cursor: { ...cursor, nextRank } }));
  assert.throws(() => createEnumerator(['a'], { ...options, cursor: { ...cursor, extra: true } }));
  for (const limit of [0, -1, 10001, 0.5, '1']) assert.throws(() => generator.next(limit));
  assert.throws(() => createEnumerator(['a'], { ...options, maxWords: 9 }));
  assert.throws(() => createEnumerator(['a', 'A'], options), /duplicate/);
  assert.throws(() => createEnumerator(['two words'], options), /one word/);
});
test('eight-word ranks remain exact beyond Number precision', () => {
  const words = Array.from({ length: 100 }, (_, i) => 'w' + String.fromCharCode(97 + Math.floor(i / 26)) + String.fromCharCode(97 + i % 26));
  const generator = createEnumerator(words, { dictionaryId: 'large-ranks', minWords: 8, maxWords: 8 });
  assert.equal(generator.total, 10000000000000000n);
  const cursor = { ...generator.cursor(), nextRank: '9999999999999999' };
  const last = createEnumerator(words, { dictionaryId: 'large-ranks', minWords: 8, maxWords: 8, cursor }).next(2);
  assert.equal(last.phrases[0], Array(8).fill(words.at(-1).toLowerCase()).join(' '));
  assert.equal(last.done, true);
});
test('dictionary attestation is required; grammar alone does not qualify a phrase', () => {
  const index = createAttestedIndex([{ text: 'only time will tell', source: 'https://example.com/phrase', tags: ['idiomatic'] }]);
  assert.equal(assessPhrase('Only time will tell', index).accepted, true);
  assert.equal(assessPhrase('the cloud drinks soup', index).accepted, false);
  const knownWords = new Set(['cloud']);
  assert.equal(assessPhrase('cloud', index, { knownWords, knownWordSource: 'https://example.com/dictionary' }).accepted, true);
  assert.equal(assessPhrase('cloud cloud', index, { knownWords }).accepted, false);
});
test('Friendly mode conservatively unions all tags and blocked flags across senses', () => {
  const index = createAttestedIndex([
    { text: 'bad expression', tags: ['informal'], source: 'https://example.com/a' },
    { phrase: 'BAD expression', tags: ['vulgar'], source: 'https://example.com/b' },
    { text: 'another expression', blocked: true },
  ]);
  assert.equal(index.size, 2);
  assert.equal(assessPhrase('bad expression', index).reason, 'friendly-filter');
  assert.equal(assessPhrase('bad expression', index, { friendly: false }).accepted, true);
  assert.equal(assessPhrase('another expression', index).accepted, false);
  assert.deepEqual(index.get('bad expression').sources, ['https://example.com/a', 'https://example.com/b']);
});
test('blocked terms match word boundaries and multiword sequences without substring false positives', () => {
  const index = createAttestedIndex(['green grass', 'an ass', 'ass-hole', 'not safe here', 'not safer here']);
  const blockedWords = new Set(['ass', 'not safe']);
  assert.equal(prepareBlockedTerms(blockedWords), prepareBlockedTerms(blockedWords));
  assert.equal(assessPhrase('green grass', index, { blockedWords }).accepted, true);
  assert.equal(assessPhrase('an ass', index, { blockedWords }).accepted, false);
  assert.equal(assessPhrase('ass-hole', index, { blockedWords }).accepted, false);
  assert.equal(assessPhrase('not safe here', index, { blockedWords }).accepted, false);
  assert.equal(assessPhrase('not safer here', index, { blockedWords }).accepted, true);
  assert.equal(assessPhrase('an ass', index, { blockedWords, friendly: false }).accepted, true);
});
test('deduplication merges normalized expressions and source evidence in first-seen order', () => {
  const rows = dedupePhrases([{ text: 'Keep going', source: 'https://example.com/b' }, { text: 'KEEP going', source: 'https://example.com/a' }, 'come home']);
  assert.deepEqual(rows.map(row => row.text), ['keep going', 'come home']);
  assert.deepEqual(rows[0].sources, ['https://example.com/a', 'https://example.com/b']);
});
test('batch IDs and duplicate recovery markers are stable across aliases and metadata ordering', async () => {
  const options = { dictionaryId: 'source-sha256' };
  const a = await createPhraseBatch([{ text: 'Keep going', sources: ['https://example.com/b', 'https://example.com/a'], tags: ['informal'] }], options);
  const b = await createPhraseBatch([{ phrase: 'keep going', sources: ['https://example.com/a', 'https://example.com/b'] }], options);
  assert.equal(a.id, b.id); assert.equal(a.body, b.body); assert.equal(a.title, b.title);
  assert(a.body.includes('MACHINE-COLLECTED PHRASE LIST')); assert(a.body.includes(a.id)); assert(a.title.includes(a.id));
  assert.equal(a.kind, 'Note'); assert.equal(a.revisionOf, null);
  assert.notEqual(a.id, (await createPhraseBatch(['keep going'], options)).id);
  assert.notEqual(a.id, (await createPhraseBatch(a.phrases, { dictionaryId: 'other' })).id);
});
test('malformed source links, unsupported phrase sizes and oversized batches are rejected', async () => {
  assert.throws(() => createAttestedIndex([{ text: 'good words', source: 'javascript:alert(1)' }]));
  assert.throws(() => createAttestedIndex([{ text: 'one two three four five six seven eight nine' }]));
  await assert.rejects(createPhraseBatch([], { dictionaryId: 'tiny' }));
  await assert.rejects(createPhraseBatch(Array(101).fill('one'), { dictionaryId: 'tiny' }));
  await assert.rejects(createPhraseBatch(['one'], {}));
});
test('a phrase batch uses the existing signed Note format without changing an open draft', async () => {
  const batch = await createPhraseBatch([{ text: 'only time will tell', source: 'https://en.wiktionary.org/wiki/only_time_will_tell' }], { dictionaryId: 'disposable-test-dictionary' });
  const identity = await newIdentity('phrase_fixture');
  const draft = { title: 'preserved', body: 'Disposable draft', kind: 'Note', revisionOf: null };
  const payload = { title: batch.title, body: batch.body, kind: batch.kind, revisionOf: batch.revisionOf };
  const entry = await sealEntry(identity, [], payload);
  const vault = { version: 1, identity, entries: [entry], draft: structuredClone(draft) };
  assert.equal(await verifyEntry(entry), true);
  assert.equal(await validateVault(vault), true);
  assert.deepEqual(vault.draft, draft);
});
