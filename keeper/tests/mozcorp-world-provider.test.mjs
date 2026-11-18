import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { requestUpgrade } from '../mozcorp-world-provider.mjs';
import { createMozCorpWorld, CONSENT_VERSION, MozCorpWorldError } from '../mozcorp-world.mjs';

const KEY = 'fixture-server-credential-do-not-forward';
const INSTRUCTION = 'Fixture private instruction text never echoed by an error.';
const SECRET = 'provider-private-detail-never-forward';
const input = { moduleId: 'world_shell', baseRelease: 'fixture-release', instruction: INSTRUCTION };
const provider = { apiKey: KEY, model: 'fixture-model' };
const body = (code, type = 'fixture-error') => JSON.stringify({ error: { code, type, message: KEY + ' ' + INSTRUCTION + ' ' + SECRET, param: SECRET }, request_id: SECRET });
const fails = expected => error => {
  assert.equal(error.code, expected); assert.equal(error.status, 502);
  for (const secret of [KEY, INSTRUCTION, SECRET, 'request_id', 'invalid_api_key']) { assert.equal(error.message.includes(secret), false); assert.equal(error.stack.includes(secret), false); assert.equal(JSON.stringify(error).includes(secret), false); }
  assert.equal(Object.hasOwn(error, 'cause'), false); assert.equal(Object.hasOwn(error, 'response'), false); return true;
};
async function failure(response, expected, messagePattern) {
  let calls = 0;
  await assert.rejects(requestUpgrade({ provider, input, fetchImpl: async (url, options) => {
    calls++; assert.equal(url, 'https://api.openai.com/v1/responses'); assert.equal(options.redirect, 'error');
    const sent = JSON.parse(options.body); assert.equal(sent.store, false); assert.equal(sent.model, 'fixture-model'); assert.equal(sent.max_output_tokens, 2200);
    assert.deepEqual(Object.keys(JSON.parse(sent.input[1].content[0].text)), ['requestedArea', 'permittedBoundary', 'baseRelease', 'operatorInstruction']);
    return response;
  } }), error => { fails(expected)(error); if (messagePattern) assert.match(error.message, messagePattern); return true; });
  assert.equal(calls, 1);
}

test('HTTP authentication, permissions and request failures use fixed local messages without provider text', async () => {
  for (const [status, expected] of [[401, 'PROVIDER_AUTH_FAILED'], [403, 'PROVIDER_PERMISSION_DENIED'], [400, 'PROVIDER_REQUEST_REJECTED']]) await failure(new Response(body('invalid_api_key'), { status }), expected);
});

test('only allowlisted quota/rate diagnostics distinguish upstream usage limits from temporary throttling', async () => {
  for (const code of ['insufficient_quota', 'credit_balance_exhausted', 'organization_spend_limit_exceeded', 'project_spend_limit_exceeded', 'organization_usage_limit_exceeded']) await failure(new Response(body(code), { status: 429 }), 'PROVIDER_QUOTA_EXHAUSTED');
  for (const code of ['rate_limit_exceeded', 'slow_down']) await failure(new Response(body(code), { status: 429 }), 'PROVIDER_RATE_LIMITED');
  await failure(new Response(body(null, 'insufficient_quota'), { status: 429 }), 'PROVIDER_QUOTA_EXHAUSTED');
  await failure(new Response(body(null, 'rate_limit_error'), { status: 429 }), 'PROVIDER_RATE_LIMITED');
});

test('model-not-found uses a fixed access/model notice; unrecognized diagnostics remain generic', async () => {
  await failure(new Response(body('model_not_found', 'invalid_request_error'), { status: 404 }), 'PROVIDER_MODEL_UNAVAILABLE');
  for (const response of [
    new Response(body('unknown_model_error'), { status: 404 }),
    new Response(body('unknown_quota_error', 'insufficient_quota'), { status: 429 }),
    new Response(body('x'.repeat(100), 'insufficient_quota'), { status: 429 }),
    new Response(body({ private: SECRET }, 'insufficient_quota'), { status: 429 }),
    new Response(body(null, 'unknown_type'), { status: 429 }),
    new Response(body('insufficient_quota'), { status: 418 }),
    new Response(body('model_not_found'), { status: 402 })
  ]) await failure(response, 'PROVIDER_FAILED');
});

test('server failures and redirect responses preserve the generic failure without following or reading another endpoint', async () => {
  for (const status of [500, 502, 503, 599]) await failure(new Response(body('insufficient_quota'), { status }), 'PROVIDER_FAILED', /provider reported a service failure/);
  for (const status of [301, 302, 307]) await failure(new Response(body('insufficient_quota'), { status }), 'PROVIDER_FAILED', /proposal service could not complete/);
  const redirected = new Response(body('model_not_found'), { status: 404 }); Object.defineProperty(redirected, 'redirected', { value: true }); await failure(redirected, 'PROVIDER_FAILED', /proposal service could not complete/);
});

test('malformed, absent, nonobject and secret-bearing free-text diagnostic bodies never escape', async () => {
  for (const raw of ['not JSON ' + SECRET, JSON.stringify(SECRET), 'null', '[]', JSON.stringify({ error: SECRET }), JSON.stringify({ error: { message: 'insufficient_quota ' + SECRET } })]) await failure(new Response(raw, { status: 429 }), 'PROVIDER_FAILED');
  await failure(new Response(null, { status: 429 }), 'PROVIDER_FAILED');
  const response = new Response('{}', { status: 429 }); Object.defineProperty(response, 'body', { value: { getReader() { throw Error(SECRET); } } }); await failure(response, 'PROVIDER_FAILED');
});

test('diagnostic reads are capped at 8 KiB by declared and actual size and cancelled on overflow', async () => {
  let read = false, cancelled = false;
  const declared = new Response('{}', { status: 429, headers: { 'content-length': '8193' } });
  Object.defineProperty(declared, 'body', { value: { getReader() { read = true; throw Error('Must not read a declared oversized body'); }, cancel() { cancelled = true; return Promise.resolve(); } } });
  await failure(declared, 'PROVIDER_FAILED'); assert.equal(read, false); assert.equal(cancelled, true);
  cancelled = false;
  const streamed = new Response(new ReadableStream({ start(controller) { controller.enqueue(new TextEncoder().encode(body('insufficient_quota') + 'x'.repeat(8193))); }, cancel() { cancelled = true; } }), { status: 429 });
  await failure(streamed, 'PROVIDER_FAILED'); assert.equal(cancelled, true);
  const exact = body('insufficient_quota').padEnd(8192, ' '); assert.equal(Buffer.byteLength(exact), 8192); await failure(new Response(exact, { status: 429 }), 'PROVIDER_QUOTA_EXHAUSTED');
});

test('authentication status does not wait for an unneeded diagnostic body', async () => {
  let cancelled = false;
  const response = new Response(new ReadableStream({ cancel() { cancelled = true; } }), { status: 401 });
  await failure(response, 'PROVIDER_AUTH_FAILED'); assert.equal(cancelled, true);
});

test('slow diagnostics retain the original request timeout and external cancellation; neither makes another attempt', async () => {
  for (const external of [false, true]) {
    let calls = 0, cancelled = false; const abort = new AbortController();
    const result = requestUpgrade({ provider, input, signal: abort.signal, timeoutMs: external ? 1000 : 25, fetchImpl: async () => { calls++; if (external) queueMicrotask(() => abort.abort()); return new Response(new ReadableStream({ cancel() { cancelled = true; } }), { status: 429 }); } });
    await assert.rejects(result, error => { assert.equal(error.code, external ? 'REQUEST_CANCELLED' : 'PROVIDER_TIMEOUT'); assert.equal(error.message.includes(SECRET), false); return true; }); assert.equal(calls, 1); assert.equal(cancelled, true);
  }
});

test('unknown network exceptions are generic and are not retried or forwarded', async () => {
  let calls = 0;
  for (const error of [new Error(KEY + ' ' + INSTRUCTION + ' ' + SECRET), new MozCorpWorldError(401, SECRET, KEY + ' ' + INSTRUCTION)]) await assert.rejects(requestUpgrade({ provider, input, fetchImpl: async () => { calls++; throw error; } }), fails('PROVIDER_FAILED'));
  assert.equal(calls, 2);
  const abort = new AbortController(); abort.abort(); await assert.rejects(requestUpgrade({ provider, input, signal: abort.signal, fetchImpl: async () => { calls++; throw Error('Must not start'); } }), error => error.code === 'REQUEST_CANCELLED'); assert.equal(calls, 2);
});

test('world-service failures persist only the local category, create no proposal and never leak diagnostics', async t => {
  const directory = await mkdtemp(path.join(tmpdir(), 'mozcorp-provider-test-')); let calls = 0;
  const world = await createMozCorpWorld({ dataDir: directory, provider, fetchImpl: async () => { calls++; return new Response(body('insufficient_quota'), { status: 429 }); } });
  t.after(async () => { await world.close(); const resolved = path.resolve(directory); assert.equal(path.dirname(resolved), path.resolve(tmpdir())); assert.ok(path.basename(resolved).startsWith('mozcorp-provider-test-')); await rm(resolved, { recursive: true, force: true }); });
  let state = await world.upgradeRead(); state = await world.upgradeWrite({ action: 'settings', scope: state.scope, revision: state.revision, enabled: true });
  await assert.rejects(world.upgradeWrite({ action: 'propose', scope: state.scope, revision: state.revision, ...input, consent: { version: CONSENT_VERSION, sendInstruction: true, dataScope: 'instruction-only' } }), fails('PROVIDER_QUOTA_EXHAUSTED'));
  const after = await world.upgradeRead(); assert.equal(after.proposals.length, 0); assert.equal(calls, 1); assert.equal(after.audit[0].eventType, 'proposal.generation_failed'); assert.equal(after.audit[0].metadata.reason, 'PROVIDER_QUOTA_EXHAUSTED');
  const saved = await readFile(path.join(directory, 'mozcorp-world.json'), 'utf8'); for (const secret of [KEY, INSTRUCTION, SECRET, 'insufficient_quota', 'invalid_api_key']) assert.equal(saved.includes(secret), false);
});
