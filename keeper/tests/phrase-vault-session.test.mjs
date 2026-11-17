// SPDX-License-Identifier: GPL-3.0-only
// Execute the delivered app handler with disposable in-memory vaults. Hashing
// uses the real phrase batch module; no browser, server or signing keys are used.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { createPhraseBatch } from '../public/phrase-core.mjs';

const app = (await readFile(new URL('../public/app.mjs', import.meta.url), 'utf8')).replaceAll('\r\n', '\n');
const start = app.indexOf('async function postPhraseBatch(batch) {');
const end = app.indexOf("\n$('seal').addEventListener", start);
assert.ok(start >= 0 && end > start, 'Locate the actual app phrase-posting handler');
const handler = app.slice(start, end);
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
const draft = () => ({ title: 'My open draft', body: 'Unsealed writing stays here.', kind: 'Story', revisionOf: null });
const vault = owner => ({ identity: { owner }, entries: [], draft: draft() });

function harness(owner = 'A') {
  const elements = new Map(['entry-title', 'entry-body', 'entry-kind', 'open-text'].map(id => [id, { disabled: false, value: id + ': unchanged editor text' }]));
  const seals = [], saved = [], witnesses = [];
  const scope = {
    vault: vault(owner), generation: 1, busy: false, createPhraseBatch,
    $: id => { assert.ok(elements.has(id), 'Unexpected editor access: ' + id); return elements.get(id); },
    async flushDraft() {},
    async sealEntry(identity, entries, payload) {
      seals.push({ owner: identity.owner, sequence: entries.length, payload: structuredClone(payload) });
      return { payload: structuredClone(payload), proof: { id: 'disposable-seal-' + seals.length } };
    },
    markDirty() {}, renderEntries() {},
    async persist() { saved.push({ owner: scope.vault.identity.owner, entries: structuredClone(scope.vault.entries) }); },
    async requestWitness(entry) { witnesses.push(entry.proof.id); return false; },
  };
  vm.runInNewContext(handler + '\nglobalThis.post = postPhraseBatch;', scope, { filename: 'app-phrase-posting-fixture.mjs' });
  return { scope, elements, seals, saved, witnesses, post: batch => scope.post(batch) };
}

function gateFirstDigest(context) {
  const entered = deferred(), release = deferred(), original = crypto.subtle.digest.bind(crypto.subtle);
  let first = true;
  context.mock.method(crypto.subtle, 'digest', async (...args) => {
    if (first) { first = false; entered.resolve(); await release.promise; }
    return original(...args);
  });
  return { entered: entered.promise, release: release.resolve };
}

async function fixtureBatch() {
  return createPhraseBatch([{ text: 'keep going', sources: ['https://example.invalid/dictionary'], tags: [] }], { dictionaryId: 'disposable-session-fixture' });
}

test('a pending phrase digest cannot post into a newly unlocked owner vault', async context => {
  const batch = await fixtureBatch(), h = harness(), ownerA = h.scope.vault;
  const gate = gateFirstDigest(context);
  const outcome = h.post(batch).then(value => ({ value }), error => ({ error }));
  await gate.entered;
  h.scope.vault = null; h.scope.generation++;
  const ownerB = vault('B'); h.scope.vault = ownerB; h.scope.generation++;
  gate.release(); const result = await outcome;
  assert.equal(h.seals.length, 0, 'The initiating action must not sign with owner B after its pending digest resolves');
  assert.ok(result.error, 'A changed initiating vault must reject the pending post');
  assert.equal(ownerA.entries.length, 0); assert.equal(ownerB.entries.length, 0);
  assert.equal(h.saved.length, 0); assert.equal(h.witnesses.length, 0);
});

test('a pending phrase digest rejects an invalidated session even if the same vault object returns', async context => {
  const batch = await fixtureBatch(), h = harness(), original = h.scope.vault;
  const gate = gateFirstDigest(context);
  const outcome = h.post(batch).then(value => ({ value }), error => ({ error }));
  await gate.entered;
  h.scope.vault = null; h.scope.generation++;
  h.scope.vault = original; h.scope.generation++;
  gate.release(); const result = await outcome;
  assert.equal(h.seals.length, 0, 'Returning to the same vault must not revive an action from an invalidated generation');
  assert.ok(result.error, 'A changed initiating generation must reject the pending post');
  assert.equal(original.entries.length, 0); assert.equal(h.saved.length, 0);
});

test('same-session phrase posting preserves the open draft and retries the durable seal without duplication', async () => {
  const batch = await fixtureBatch(), h = harness(), before = structuredClone(h.scope.vault.draft);
  const editorBefore = [...h.elements.values()].map(element => element.value);
  const first = await h.post(batch);
  assert.equal(first.proofId, 'disposable-seal-1'); assert.equal(first.witnessed, false);
  assert.equal(h.seals.length, 1); assert.equal(h.seals[0].owner, 'A');
  assert.equal(h.saved.length, 1); assert.equal(h.saved[0].entries.length, 1);
  assert.equal(h.scope.vault.entries[0].payload.title, batch.title);
  assert.equal(h.scope.vault.entries[0].payload.body, batch.body);
  assert.equal(h.scope.vault.entries[0].payload.kind, 'Note');
  assert.deepEqual(h.scope.vault.draft, before);
  assert.deepEqual([...h.elements.values()].map(element => element.value), editorBefore);
  assert.equal(h.scope.busy, false); assert.ok([...h.elements.values()].every(element => !element.disabled));
  // Model loss of the queue acknowledgement: the caller submits its same saved
  // batch again, while the vault already holds the durable signed entry.
  const retry = await h.post(batch);
  assert.equal(retry.proofId, first.proofId); assert.equal(retry.existing, true);
  assert.equal(h.seals.length, 1); assert.equal(h.saved.length, 1); assert.equal(h.witnesses.length, 1);
  assert.equal(h.scope.vault.entries.length, 1); assert.deepEqual(h.scope.vault.draft, before);
});
