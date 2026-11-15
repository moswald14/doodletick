import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import { createKeeperServer } from '../server.mjs';
import { newIdentity, sealEntry, verifyWitness, receiptFor, verifyReceipt } from '../public/core.mjs';

test('local server serves app, witnesses valid proofs, rejects spoofing, and retains identity', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'doodletick-test-'));
  let keeper = await createKeeperServer({ dataDir: dir, port: 0 });
  try {
    const base = `http://127.0.0.1:${keeper.port}`;
    const page = await fetch(base); assert.equal(page.status, 200); assert.match(await page.text(), /Make a mark/); assert.match(page.headers.get('content-security-policy'), /frame-ancestors 'none'/);
    assert.equal((await fetch(base + '/.doodletick/witness-key.json')).status, 404);
    const status = await (await fetch(base + '/api/status')).json(); assert.equal(status.mode, 'local-witness');
    await assert.rejects(createKeeperServer({ dataDir: dir, port: 0 }), /already running/);
    const identity = await newIdentity('server_test');
    const entry = await sealEntry(identity, [], { title: 'A secret title', body: 'The server must never store this private body.', kind: 'Idea', revisionOf: null });
    const send = (proof, extra = {}) => fetch(base + '/api/witness', { method: 'POST', headers: { 'content-type': 'application/json', ...extra }, body: JSON.stringify({ proof }) });
    const response = await send(entry.proof); assert.equal(response.status, 200); entry.witness = await response.json();
    assert.equal(await verifyWitness(entry.witness, entry.proof.id), true);
    assert.equal((await verifyReceipt(receiptFor(entry), entry.payload.body)).contentMatches, true);
    const ledger = await readFile(path.join(dir, 'receipts.jsonl'), 'utf8'); assert(!ledger.includes(entry.payload.body)); assert(!ledger.includes(entry.payload.title));
    const evil = structuredClone(entry.proof); evil.record.sequence = 99; assert.equal((await send(evil)).status, 400);
    assert.equal((await send(entry.proof, { origin: 'https://attacker.example' })).status, 403);
    const spoofedHostStatus = await new Promise((resolve, reject) => {
      const req = http.request(base + '/api/status', { headers: { host: 'attacker.example' } }, response => { response.resume(); resolve(response.statusCode); });
      req.on('error', reject); req.end();
    });
    assert.equal(spoofedHostStatus, 403);
    assert.equal((await fetch(base + '/api/witness', { method: 'POST', headers: { 'content-type': 'text/plain' }, body: '{}' })).status, 415);
    const parallel = await Promise.all(Array.from({ length: 3 }, () => send(entry.proof).then(r => r.json())));
    assert.equal(new Set(parallel.map(r => r.record.sequence)).size, 3);
    await keeper.close(); keeper = null;
    keeper = await createKeeperServer({ dataDir: dir, port: 0 });
    const restarted = await (await fetch(`http://127.0.0.1:${keeper.port}/api/status`)).json();
    assert.equal(restarted.fingerprint, status.fingerprint); assert.equal(restarted.receipts, 4);
  } finally {
    if (keeper) await keeper.close();
    assert.equal(path.dirname(path.resolve(dir)), path.resolve(os.tmpdir()));
    assert(path.basename(dir).startsWith('doodletick-test-'));
    await rm(dir, { recursive: true, force: true });
  }
});
