import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile, writeFile, mkdir, rename, rmdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createMozCorpWorld, CONSENT_VERSION } from '../mozcorp-world.mjs';

const authored = () => ({ title: 'A clearer fictional doorway', summary: 'Make the fictional doorway label easier to read.', proposedChanges: [{ area: 'Navigation', change: 'Use a descriptive button label.', rationale: 'People can identify the destination.' }], privacyImpact: 'No personal data is requested.', reviewChecklist: ['Check the label and keyboard focus.'], rollbackPlan: 'Restore the previous known release.', riskLevel: 'LOW' });
const profile = name => ({ name, pronouns: 'they/them', role: 'fictional courier', place: 'a made-up harbor', bio: 'An explicitly fictional fixture.', theme: 'deep' });
const proposalInput = () => ({ moduleId: 'world_shell', baseRelease: 'fixture-1', instruction: 'Clarify the fictional navigation label.' });
const consent = { version: CONSENT_VERSION, sendInstruction: true, dataScope: 'instruction-only' };
const response = proposal => new Response(JSON.stringify({ status: 'completed', id: 'resp_fixture', output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify(proposal) }] }] }), { headers: { 'content-type': 'application/json' } });
const code = expected => error => error?.code === expected;
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
async function fixture(t, options = {}) {
  const directory = await mkdtemp(path.join(tmpdir(), 'mozcorp-world-test-')); let world = await createMozCorpWorld({ dataDir: directory, ...options });
  t.after(async () => { await world.close(); const absolute = path.resolve(directory); assert.equal(path.dirname(absolute), path.resolve(tmpdir())); assert.ok(path.basename(absolute).startsWith('mozcorp-world-test-')); await rm(absolute, { recursive: true, force: true }); });
  return { get world() { return world; }, directory, async restart() { await world.close(); world = await createMozCorpWorld({ dataDir: directory, ...options }); return world; } };
}
async function upgrade(world, body) { const s = await world.upgradeRead(); return world.upgradeWrite({ scope: s.scope, revision: s.revision, ...body }); }
async function enable(world) { return upgrade(world, { action: 'settings', enabled: true }); }

test('fresh workspace is paused, private provider options never serialize, and state survives restart', async t => {
  const f = await fixture(t, { provider: { apiKey: 'fixture-provider-key', model: 'fixture-model' } });
  assert.equal((await f.world.hopeRead()).enabled, false); const initial = await f.world.upgradeRead(); assert.equal(initial.settings.enabled, false); assert.equal(initial.configured, true);
  const slot = await f.world.cloudWrite({ slotName: 'Fixture', kind: 'animal-animal', payload: { fictional: true } });
  const restarted = await f.restart(); assert.equal((await restarted.cloudRead()).scope, initial.scope); assert.equal((await restarted.cloudRead()).slots[0].id, slot.id);
  assert.equal((await readFile(path.join(f.directory, 'mozcorp-world.json'), 'utf8')).includes('fixture-provider-key'), false); assert.equal(JSON.stringify(await restarted.upgradeRead()).includes('fixture-provider-key'), false);
});

test('concurrent legacy-compatible cloud appends retain every slot and returned values cannot mutate storage', async t => {
  const { world } = await fixture(t);
  await Promise.all(Array.from({ length: 12 }, (_, i) => world.cloudWrite({ slotName: 'Fixture ' + i, kind: 'machine', payload: { value: i } })));
  const read = await world.cloudRead(); assert.equal(read.slots.length, 12); assert.equal(read.revision, 12); assert.equal(new Set(read.slots.map(s => s.payload)).size, 12);
  read.slots.length = 0; assert.equal((await world.cloudRead()).slots.length, 12);
  await assert.rejects(world.cloudWrite({ scope: 'another-workspace', payload: {} }), code('WORKSPACE_CHANGED'));
});

test('cloud UTF8 limits, atomic imports, explicit quota and stale deletion preserve existing records', async t => {
  const { world } = await fixture(t); const payload = '🧪'.repeat(30000);
  await world.cloudWrite({ slotName: 'Exact UTF8 boundary', payload });
  await assert.rejects(world.cloudWrite({ payload: payload + '🧪' }), code('REQUEST_TOO_LARGE'));
  let state = await world.cloudRead(); const initialId = state.slots[0].id;
  await assert.rejects(world.cloudWrite({ action: 'import', scope: state.scope, revision: state.revision, slots: [{ slotName: 'Good', payload: '{}' }, { slotName: 'Bad', kind: '../../bad', payload: '{}' }] }), code('INVALID_REQUEST')); assert.equal((await world.cloudRead()).slots.length, 1);
  await world.cloudWrite({ action: 'import', scope: state.scope, revision: state.revision, slots: Array.from({ length: 23 }, (_, i) => ({ slotName: 'Imported ' + i, kind: 'bug-world', payload: '{}' })) });
  assert.equal((await world.cloudRead()).slots.length, 24); await assert.rejects(world.cloudWrite({ payload: '{}' }), code('CLOUD_QUOTA'));
  await assert.rejects(world.cloudWrite({ action: 'delete', scope: state.scope, revision: state.revision, id: initialId }), code('REVISION_STALE'));
  state = await world.cloudRead(); await world.cloudWrite({ action: 'delete', scope: state.scope, revision: state.revision, id: initialId }); assert.equal((await world.cloudRead()).slots.length, 23);
});

test('HOPE clear/settings generations prevent delayed writes and persona timestamps prevent stale replacement', async t => {
  const f = await fixture(t); let state = await f.world.hopeRead();
  const paused = await f.world.hopeWrite({ action: 'seed', scope: state.scope, generation: state.generation, sourceAt: 10, kind: 'persona', profile: profile('First') }); assert.equal(paused.outcome, 'cancelled');
  state = await f.world.hopeWrite({ action: 'settings', scope: state.scope, generation: state.generation, enabled: true });
  await f.world.hopeWrite({ action: 'seed', scope: state.scope, generation: state.generation, sourceAt: 100, kind: 'persona', profile: profile('Newer') });
  const old = await f.world.hopeWrite({ action: 'seed', scope: state.scope, generation: state.generation, sourceAt: 90, kind: 'persona', profile: profile('Older') }); assert.equal(old.outcome, 'superseded'); assert.equal(old.seeds[0].seed.profile.name, 'Newer');
  await f.restart(); assert.equal((await f.world.hopeRead()).seeds[0].seed.profile.name, 'Newer');
  const cleared = await f.world.hopeWrite({ action: 'clear', scope: state.scope, generation: state.generation }); assert.equal(cleared.enabled, false);
  const delayed = await f.world.hopeWrite({ action: 'seed', scope: state.scope, generation: state.generation, sourceAt: 101, kind: 'persona', profile: profile('Delayed') }); assert.equal(delayed.outcome, 'cancelled'); assert.equal(delayed.total, 0);
  await assert.rejects(f.world.hopeWrite({ action: 'settings', scope: state.scope, generation: state.generation, enabled: true }), code('GENERATION_STALE'));
});

test('fictional case rules are dynamically private; personal receipt fields and unsolved cases reject', async t => {
  let rules = { 'fixture-case': { answer: 'answer-a', essential: ['clue-1', 'clue-2'] } };
  const { world } = await fixture(t, { getCaseRules: () => rules }); let state = await world.hopeRead(); state = await world.hopeWrite({ action: 'settings', scope: state.scope, generation: state.generation, enabled: true });
  const seed = { action: 'seed', scope: state.scope, generation: state.generation, sourceAt: 100, kind: 'case', profile: profile('Fiction'), game: { caseId: 'fixture-case', evaluated: true, revealed: 6, choice: 'answer-a', pinned: ['clue-1', 'clue-2'] } };
  await assert.rejects(world.hopeWrite({ ...seed, receipt: { personal: true } }), code('INVALID_REQUEST'));
  await assert.rejects(world.hopeWrite({ ...seed, game: { ...seed.game, evaluated: false } }), code('INVALID_SEED'));
  const first = await world.hopeWrite(seed); assert.equal(first.outcome, 'saved'); assert.equal((await world.hopeWrite(seed)).outcome, 'duplicate');
  rules = { 'fixture-case': { answer: 'answer-b', essential: ['clue-1', 'clue-2'] } }; await assert.rejects(world.hopeWrite(seed), code('INVALID_SEED'));
});

test('manual proposals work unconfigured, review is versioned, and deployment/rollback are audit references only', async t => {
  let calls = 0; const f = await fixture(t, { fetchImpl: async () => { calls++; throw Error('No network expected'); } });
  let state = await upgrade(f.world, { action: 'propose_manual', ...proposalInput(), proposal: authored() }); const id = state.proposals[0].id;
  assert.equal(state.proposals[0].versions[0].model, 'manual'); assert.equal(state.settings.enabled, false); assert.equal(state.configured, false);
  await assert.rejects(upgrade(f.world, { action: 'propose', ...proposalInput(), consent }), code('OPENAI_KEY_NOT_CONFIGURED'));
  await assert.rejects(upgrade(f.world, { action: 'record_deployment', proposalId: id, version: 1, deploymentReference: 'fixture-release-1' }), code('DEPLOYMENT_NOT_APPROVED'));
  state = await upgrade(f.world, { action: 'approve', proposalId: id, version: 1 }); state = await upgrade(f.world, { action: 'record_deployment', proposalId: id, version: 1, deploymentReference: 'fixture-release-1' });
  assert.equal(state.proposals[0].status, 'DEPLOYED'); state = await upgrade(f.world, { action: 'record_rollback', proposalId: id, rollbackReference: 'fixture-release-0' }); assert.equal(state.proposals[0].status, 'ROLLED_BACK');
  await f.restart(); state = await f.world.upgradeRead(); assert.equal(state.proposals[0].deploymentReference, 'fixture-release-1'); assert.equal(state.proposals[0].rollbackReference, 'fixture-release-0'); assert.ok(state.audit.some(e => e.eventType === 'proposal.rollback_recorded'));
  state = await upgrade(f.world, { action: 'propose_manual', ...proposalInput(), proposalId: id, proposal: { ...authored(), title: 'A second reviewed doorway' } }); assert.equal(state.proposals[0].currentVersion, 2); assert.equal(state.proposals[0].versions.length, 2); assert.equal(state.proposals[0].status, 'PENDING_REVIEW');
  await assert.rejects(upgrade(f.world, { action: 'approve', proposalId: id, version: 1 }), code('REVIEW_STALE')); assert.equal(calls, 0);
});

test('same-revision concurrent reviews cannot overwrite one another, and invalid manual data remains untouched', async t => {
  const { world } = await fixture(t); const s = await upgrade(world, { action: 'propose_manual', ...proposalInput(), proposal: authored() }); const id = s.proposals[0].id;
  const results = await Promise.allSettled(['approve', 'decline'].map(action => world.upgradeWrite({ action, scope: s.scope, revision: s.revision, proposalId: id, version: 1 })));
  assert.equal(results.filter(x => x.status === 'fulfilled').length, 1); assert.equal(results.find(x => x.status === 'rejected').reason.code, 'REVISION_STALE');
  const before = JSON.stringify(await world.upgradeRead()); await assert.rejects(upgrade(world, { action: 'propose_manual', ...proposalInput(), proposal: { ...authored(), privateNotebook: 'Never save this' } }), code('INVALID_REQUEST')); assert.equal(JSON.stringify(await world.upgradeRead()), before);
});

test('external proposals send only the explicit instruction boundary and never disclose workspace content or provider keys', async t => {
  const requests = []; const { world } = await fixture(t, { provider: { apiKey: 'fixture-key-only', model: 'fixture-model' }, fetchImpl: async (url, options) => { requests.push({ url, options }); return response(authored()); } });
  await world.cloudWrite({ slotName: 'Private fixture', payload: 'PRIVATE_WORKSPACE_FIXTURE' }); await enable(world);
  await assert.rejects(upgrade(world, { action: 'propose', ...proposalInput() }), code('CONSENT_REQUIRED')); assert.equal(requests.length, 0);
  const state = await upgrade(world, { action: 'propose', ...proposalInput(), consent }); assert.equal(state.proposals.length, 1); assert.equal(requests.length, 1);
  const { url, options } = requests[0]; assert.equal(url, 'https://api.openai.com/v1/responses'); assert.equal(options.redirect, 'error'); const body = JSON.parse(options.body); assert.equal(body.store, false); assert.equal(body.max_output_tokens, 2200); assert.equal(body.model, 'fixture-model'); assert.equal(options.body.includes('PRIVATE_WORKSPACE_FIXTURE'), false); assert.equal(options.body.includes('fixture-key-only'), false); assert.equal(JSON.stringify(state).includes('fixture-key-only'), false);
  const instruction = JSON.parse(body.input[1].content[0].text); assert.deepEqual(Object.keys(instruction), ['requestedArea', 'permittedBoundary', 'baseRelease', 'operatorInstruction']);
});

test('opting out while AI is delayed cancels the result and stale output never creates a proposal', async t => {
  const started = deferred(), release = deferred(); const { world } = await fixture(t, { provider: { apiKey: 'fixture-key' }, fetchImpl: async () => { started.resolve(); await release.promise; return response(authored()); } });
  const state = await enable(world); const pending = world.upgradeWrite({ action: 'propose', scope: state.scope, revision: state.revision, generation: state.generation, ...proposalInput(), consent }); const rejected = assert.rejects(pending, error => ['REQUEST_CANCELLED', 'SERVICE_CLOSED'].includes(error.code));
  await started.promise; await world.upgradeWrite({ action: 'settings', scope: state.scope, revision: state.revision, enabled: false }); release.resolve(); await rejected;
  assert.equal((await world.upgradeRead()).proposals.length, 0); assert.equal((await world.upgradeRead()).settings.enabled, false);
});

test('a delayed AI revision cannot replace a newer manual version or its reviewed details', async t => {
  const started = deferred(), release = deferred(); const { world } = await fixture(t, { provider: { apiKey: 'fixture-key' }, fetchImpl: async () => { started.resolve(); await release.promise; return response({ ...authored(), title: 'An obsolete external suggestion' }); } });
  let state = await upgrade(world, { action: 'propose_manual', ...proposalInput(), proposal: authored() }); const id = state.proposals[0].id; state = await enable(world);
  const pending = world.upgradeWrite({ action: 'propose', scope: state.scope, revision: state.revision, ...proposalInput(), proposalId: id, consent }); const rejected = assert.rejects(pending, code('REQUEST_CANCELLED'));
  await started.promise; const manual = { ...authored(), title: 'The newer manual design' }; await upgrade(world, { action: 'propose_manual', ...proposalInput(), proposalId: id, proposal: manual }); release.resolve(); await rejected;
  const current = (await world.upgradeRead()).proposals[0]; assert.equal(current.currentVersion, 2); assert.equal(current.versions[1].proposal.title, manual.title); assert.equal(current.versions[1].model, 'manual'); assert.equal(current.versions.some(v => v.proposal.title === 'An obsolete external suggestion'), false);
});

test('external attempts reserve the daily quota before concurrent calls and failures never auto retry', async t => {
  let calls = 0; const started = deferred(), release = deferred();
  const { world } = await fixture(t, { provider: { apiKey: 'fixture-key' }, fetchImpl: async () => { calls++; if(calls === 8) started.resolve(); await release.promise; return new Response('failure', { status: 503 }); } }); const state = await enable(world);
  const attempts = Array.from({ length: 8 }, () => assert.rejects(world.upgradeWrite({ action: 'propose', scope: state.scope, revision: state.revision, ...proposalInput(), consent }), code('PROVIDER_FAILED')));
  await started.promise; await assert.rejects(upgrade(world, { action: 'propose', ...proposalInput(), consent }), code('DAILY_LIMIT_REACHED')); assert.equal(calls, 8); release.resolve(); await Promise.all(attempts); assert.equal((await world.upgradeRead()).proposals.length, 0);
});

test('refusals, incomplete data, oversized provider bodies and slow responses fail honestly', async t => {
  const replies = [new Response(JSON.stringify({ status: 'completed', output: [{ content: [{ type: 'refusal', refusal: 'fixture refusal' }] }] })), new Response(JSON.stringify({ status: 'incomplete', incomplete_details: { reason: 'max_output_tokens' } })), new Response('x'.repeat(65537)), new Response(JSON.stringify({ status: 'completed', output_text: '{"fake":"proposal"}' }))];
  const { world } = await fixture(t, { provider: { apiKey: 'fixture-key' }, fetchImpl: async () => replies.shift() }); await enable(world);
  for (const expected of ['PROVIDER_REFUSED', 'PROVIDER_INCOMPLETE', 'PROVIDER_OUTPUT_TOO_LARGE', 'MODEL_OUTPUT_INVALID']) await assert.rejects(upgrade(world, { action: 'propose', ...proposalInput(), consent }), code(expected));
  const slow = await fixture(t, { provider: { apiKey: 'fixture-key' }, requestTimeoutMs: 25, fetchImpl: async () => new Promise(() => {}) }); await enable(slow.world); await assert.rejects(upgrade(slow.world, { action: 'propose', ...proposalInput(), consent }), code('PROVIDER_TIMEOUT'));
});

test('corrupt or oversized storage fails closed without replacing bytes or poisoning workspace ownership', async t => {
  const f = await fixture(t); await f.world.close(); const file = path.join(f.directory, 'mozcorp-world.json'), damaged = '{"broken":'; await writeFile(file, damaged);
  await assert.rejects(createMozCorpWorld({ dataDir: f.directory }), code('STORAGE_CORRUPT')); assert.equal(await readFile(file, 'utf8'), damaged); await assert.rejects(createMozCorpWorld({ dataDir: f.directory }), code('STORAGE_CORRUPT'));
  await writeFile(file, 'x'.repeat(8000001)); await assert.rejects(createMozCorpWorld({ dataDir: f.directory }), code('STORAGE_CORRUPT')); assert.equal((await readFile(file)).length, 8000001);
});

test('a second owner is rejected and closed services cannot commit more changes', async t => {
  const f = await fixture(t); await assert.rejects(createMozCorpWorld({ dataDir: f.directory }), code('WORKSPACE_IN_USE')); await f.world.close(); await assert.rejects(f.world.cloudRead(), code('SERVICE_CLOSED')); await f.restart(); assert.equal((await f.world.cloudRead()).slots.length, 0);
});

test('the fictional seed quota is bounded and never silently evicts earlier arrivals', async t => {
  const { world } = await fixture(t, { getCaseRules: () => ({ 'quota-fixture': { answer: 'yes', essential: ['clue'] } }) }); let state = await world.hopeRead(); state = await world.hopeWrite({ action: 'settings', scope: state.scope, generation: state.generation, enabled: true });
  const seed = i => ({ action: 'seed', scope: state.scope, generation: state.generation, sourceAt: i, kind: 'case', profile: profile('Fixture ' + i), game: { caseId: 'quota-fixture', evaluated: true, revealed: 6, choice: 'yes', pinned: ['clue'] } });
  await Promise.all(Array.from({ length: 50 }, (_, i) => world.hopeWrite(seed(i)))); const before = await world.hopeRead(); assert.equal(before.total, 50); await assert.rejects(world.hopeWrite(seed(51)), code('HOPE_QUOTA')); assert.deepEqual(await world.hopeRead(), before);
});

test('a failed atomic replacement keeps the previous in-memory revision and committed file recoverable', async t => {
  const f = await fixture(t); await f.world.cloudWrite({ slotName: 'Committed fixture', payload: '{"kept":true}' });
  const file = path.join(f.directory, 'mozcorp-world.json'), backup = path.join(f.directory, 'committed-fixture.json'), before = await readFile(file, 'utf8'), read = await f.world.cloudRead();
  assert.equal(path.dirname(file), f.directory); assert.equal(path.dirname(backup), f.directory);
  await rename(file, backup); await mkdir(file);
  await assert.rejects(f.world.cloudWrite({ slotName: 'Must fail', payload: '{}' }), code('STORAGE_UNAVAILABLE')); assert.deepEqual(await f.world.cloudRead(), read); assert.equal(await readFile(backup, 'utf8'), before);
  await rmdir(file); await rename(backup, file); await f.restart(); assert.deepEqual(await f.world.cloudRead(), read);
});
