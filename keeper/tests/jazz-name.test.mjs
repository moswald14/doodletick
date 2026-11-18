// SPDX-License-Identifier: GPL-3.0-only
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createJazzNamingService, jazzConfigFromEnvironment } from '../jazz-name.mjs';
import { quotePepeUnits, verifyPepePayment, createJazzNetwork, JAZZ_MODEL } from '../jazz-name-network.mjs';
import { validateJazzContext, validateJazzResult, encodePepeTransfer } from '../public/jazz-name-contract.mjs';
import { context, config, result, payer, recipient, txHash, testTime, fakeNetwork } from './jazz-name-fixture.mjs';

async function serviceFixture(t, options = {}) {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'jazz-naming-')), network = fakeNetwork();
  const s = await createJazzNamingService({ dataDir: dir, config, network, now: () => testTime, ...options });
  t.after(async () => { await s.close(); await rm(dir, { recursive: true, force: true }); });
  return { s, network, dir };
}
const input = q => ({ id: q.id, capability: q.capability, hash: txHash });
const settle = () => new Promise(resolve => setImmediate(resolve));
async function completed(s, q) { let job; for (let i = 0; i < 30; i++) { job = await s.job(input(q)); if (job.status !== 'generating') return job; await settle(); } throw new Error('Fixture did not settle.'); }

test('fiat conversion rounds upward in integer base units and rejects invalid prices', () => {
  assert.equal(quotePepeUnits('0.000004'), 5000n * 10n ** 18n);
  const price = 3835n, amount = quotePepeUnits('0.000003835');
  assert(amount * price >= 2n * 10n ** 25n); assert((amount - 1n) * price < 2n * 10n ** 25n);
  for (const value of ['0', '-1', 'NaN', '1e-7', '0.0000000000001', '1001', '0.1junk', 0.1]) assert.throws(() => quotePepeUnits(value));
});

test('the OpenAI connection check is coalesced and uses no payment, generation, or secret-bearing response', async t => {
  const network = fakeNetwork();
  let checks = 0;
  network.checkOpenAI = async () => { checks++; return { ok: false, status: 401, detail: 'never echo provider detail' }; };
  network.preflight = async () => assert.fail('A connection check must not use payment preflight.');
  const { s } = await serviceFixture(t, { network });
  const [first, second] = await Promise.all([s.checkConnection(), s.checkConnection()]);
  assert.deepEqual(first, second);
  assert.equal(checks, 1);
  assert.equal(first.ok, false);
  assert.match(first.message, /declined the key/);
  assert.equal(JSON.stringify(first).includes('provider detail'), false);
  assert.equal(network.generates, 0);
});

test('a completed payment teaches the band once with musical context only', async t => {
  const feedback = [];
  const { s, network } = await serviceFixture(t, { onComplete: async value => feedback.push(value) });
  const quote = await s.quote({ payer, context });
  assert.deepEqual(feedback, []);
  network.pay(quote);
  await s.claim(input(quote));
  assert.equal((await completed(s, quote)).status, 'complete');
  assert.equal(feedback.length, 1);
  assert.deepEqual(feedback[0], { id: quote.id, context: validateJazzContext(context) });
  assert.deepEqual(s.completedFeedback(), feedback);
  await s.claim(input(quote));
  assert.equal(feedback.length, 1);
});

test('musical inputs and AI patterns are bounded and copied without injected fields', () => {
  assert.deepEqual(validateJazzContext({ ...context, wallet: 'unused' }), { ...context, beatsPerBar: 4, phraseBars: 'genre', beatPattern: 'genre', beatOnly: false, keyRoot: 'auto' });
  assert.deepEqual(validateJazzResult({ ...result, script: 'unused' }), result);
  for (const patch of [{ tempo: Infinity }, { seed: 0 }, { motif: Array(9).fill(60) }, { key: '<script>' }, { style: 'unknown' }]) assert.throws(() => validateJazzContext({ ...context, ...patch }));
  for (const pattern of [[{ instrument: 'piano', step: 0, velocity: 0.3 }, result.pattern[0]], [{ ...result.pattern[0], step: 16 }, result.pattern[1]], [result.pattern[0], result.pattern[0]], Array(25).fill(result.pattern[0]), [{ ...result.pattern[0], velocity: NaN }, result.pattern[1]]]) assert.throws(() => validateJazzResult({ ...result, pattern }));
  assert.throws(() => encodePepeTransfer(recipient, (1n << 256n).toString()));
});

test('missing account, opt-in, network or budget keeps payment collection disabled', async t => {
  const empty = jazzConfigFromEnvironment({}); assert.equal(empty.enabled, false); assert.equal(empty.apiKey, '');
  for (const patch of [{ enabled: false }, { apiKey: '' }, { recipient: '' }, { network: 'base' }, { rpcUrl: 'http://localhost' }, { dailyLimit: 0 }]) {
    const { s, network } = await serviceFixture(t, { config: { ...config, ...patch } });
    assert.equal(s.configuration().ready, false);
    await assert.rejects(s.quote({ payer, context }), /not connected/); assert.equal(network.generates, 0);
    assert.equal(JSON.stringify(s.configuration()).includes(config.apiKey), false);
  }
});

test('quotes reserve unique exact invoice amounts and persist only a capability hash', async t => {
  const { s, dir } = await serviceFixture(t);
  const a = await s.quote({ payer, context });
  const b = await s.quote({ payer: '0x' + '33'.repeat(20), context });
  assert.notEqual(a.amount, b.amount); assert(BigInt(a.amount) >= quotePepeUnits(a.price));
  assert(BigInt(a.amount) - quotePepeUnits(a.price) < 1n << 48n);
  const disk = await readFile(path.join(dir, 'jazz-naming.json'), 'utf8');
  assert(!disk.includes(a.capability)); assert(!disk.includes(config.apiKey));
  await assert.rejects(s.job({ id: a.id, capability: '00'.repeat(32) }), /not available/);
  await assert.rejects(s.quote({ payer, context }), /unfinished/);
});

test('a quote fails before payment if price, chain or OpenAI preflight is unavailable', async t => {
  const { s, network } = await serviceFixture(t);
  network.preflight = async () => { throw new Error('secret upstream detail'); };
  await assert.rejects(s.quote({ payer, context }), /No payment has been requested/);
  assert.equal(network.generates, 0);
});

test('no AI call occurs while a payment is unmined or has fewer than three confirmations', async t => {
  const { s, network } = await serviceFixture(t), q = await s.quote({ payer, context });
  assert.equal((await s.claim(input(q))).status, 'pending'); assert.equal(network.generates, 0);
  network.pay(q); network.head = '0x66';
  assert.equal((await s.claim(input(q))).paid, false); assert.equal(network.generates, 0);
  network.head = '0x67'; await s.claim(input(q));
  assert.equal((await completed(s, q)).status, 'complete'); assert.equal(network.generates, 1);
});

test('verification rejects wrong chain, sender, contract, recipient, amount, calldata and reverted or removed transfers', async t => {
  const { s, network } = await serviceFixture(t), q = await s.quote({ payer, context });
  const full = { ...q, minimumBlock: '100', createdAt: testTime, expiresAt: testTime + 300000 };
  const corruptions = [
    () => { network.chainId = '0x2105'; },
    () => { network.payment.receipt.status = '0x0'; },
    () => { network.payment.receipt.from = recipient; },
    () => { network.payment.receipt.to = recipient; },
    () => { network.payment.receipt.logs[0].address = recipient; },
    () => { network.payment.receipt.logs[0].topics[2] = network.payment.receipt.logs[0].topics[1]; },
    () => { network.payment.receipt.logs[0].data = '0x' + '0'.repeat(64); },
    () => { network.payment.receipt.logs[0].removed = true; },
    () => { network.payment.tx.input = encodePepeTransfer(recipient, (BigInt(q.amount) + 1n).toString()); },
    () => { network.payment.tx.value = '0x1'; },
    () => { network.payment.block.hash = '0x' + '00'.repeat(32); },
    () => { network.payment.receipt.logs.push(structuredClone(network.payment.receipt.logs[0])); }
  ];
  for (const corrupt of corruptions) {
    network.chainId = '0x1'; network.pay(q); corrupt();
    await assert.rejects(verifyPepePayment(network.rpc, full, txHash));
    assert.equal(network.generates, 0);
  }
});

test('payments mined before a quote or after expiry cannot buy an AI response', async t => {
  const { s, network } = await serviceFixture(t), q = await s.quote({ payer, context });
  network.pay(q, txHash, testTime + 301000);
  await assert.rejects(s.claim(input(q)), /could not be verified/);
  network.pay(q, txHash, testTime - 20000);
  await assert.rejects(s.claim(input(q)), /could not be verified/);
  assert.equal(network.generates, 0);
});

test('concurrent claims invoke OpenAI once and spent transactions cannot buy a second result', async t => {
  const { s, network } = await serviceFixture(t), q = await s.quote({ payer, context });
  network.pay(q); await Promise.all(Array.from({ length: 12 }, () => s.claim(input(q))));
  assert.deepEqual((await completed(s, q)).result, result); assert.equal(network.generates, 1);
  const second = await s.quote({ payer, context });
  await assert.rejects(s.claim(input(second)), /already been used/); assert.equal(network.generates, 1);
});

test('paid jobs survive restart, and retry uses the same payment with a bounded attempt count', async t => {
  const { s, dir, network } = await serviceFixture(t), q = await s.quote({ payer, context });
  network.pay(q); network.fail = true;
  await s.claim(input(q)); assert.equal((await completed(s, q)).status, 'retry'); await s.close();
  const restarted = await createJazzNamingService({ dataDir: dir, config, network, now: () => testTime }); t.after(() => restarted.close());
  assert.equal((await restarted.job(input(q))).paid, true);
  assert.equal(network.generates, 1, 'restart does not auto-charge the API');
  await restarted.retry(input(q)); assert.equal((await completed(restarted, q)).status, 'retry');
  await restarted.retry(input(q)); assert.equal((await completed(restarted, q)).status, 'exhausted');
  await assert.rejects(restarted.retry(input(q)), /Do not pay again/); assert.equal(network.generates, 3);
});

test('completed results survive restart without another API call', async t => {
  const { s, dir, network } = await serviceFixture(t), q = await s.quote({ payer, context }); network.pay(q);
  await s.claim(input(q)); await completed(s, q); await s.close();
  const restarted = await createJazzNamingService({ dataDir: dir, config, network, now: () => testTime }); t.after(() => restarted.close());
  assert.deepEqual((await restarted.claim(input(q))).result, result); assert.equal(network.generates, 1);
});

test('budget reservation stops new quotes before a listener can pay', async t => {
  const { s, network } = await serviceFixture(t, { config: { ...config, dailyLimit: 3 } });
  await s.quote({ payer, context });
  await assert.rejects(s.quote({ payer: recipient, context }), /full for now/); assert.equal(network.generates, 0);
});

test('corrupt payment history fails closed without overwriting it', async t => {
  const { s, dir, network } = await serviceFixture(t); await s.close();
  const file = path.join(dir, 'jazz-naming.json'); await writeFile(file, '{broken');
  const bad = await createJazzNamingService({ dataDir: dir, config, network }); t.after(() => bad.close());
  assert.equal(bad.configuration().ready, false); await assert.rejects(bad.quote({ payer, context }), /not connected/);
  assert.equal(await readFile(file, 'utf8'), '{broken');
});

test('a persistence failure disables new payments before returning an invoice', async t => {
  const { s, dir, network } = await serviceFixture(t);
  await mkdir(path.join(dir, 'jazz-naming.json.new'));
  await assert.rejects(s.quote({ payer, context }), /No new payments can be accepted/);
  assert.equal(s.configuration().ready, false); assert.equal(network.generates, 0);
  await assert.rejects(s.quote({ payer, context }), /not connected/);
});

test('a saved interrupted generation requires an explicit retry after restart', async t => {
  const { s, dir, network } = await serviceFixture(t), q = await s.quote({ payer, context }); network.pay(q);
  await s.claim(input(q)); await completed(s, q); await s.close();
  const filename = path.join(dir, 'jazz-naming.json'), state = JSON.parse(await readFile(filename, 'utf8'));
  state.quotes[0].status = 'generating'; delete state.quotes[0].result;
  await writeFile(filename, JSON.stringify(state));
  const restarted = await createJazzNamingService({ dataDir: dir, config, network, now: () => testTime }); t.after(() => restarted.close());
  const recovered = await restarted.job(input(q));
  assert.equal(recovered.status, 'retry'); assert.equal(recovered.paid, true); assert.equal(network.generates, 1);
  await restarted.retry(input(q)); assert.equal((await completed(restarted, q)).status, 'complete'); assert.equal(network.generates, 2);
});

test('OpenAI adapter sends bounded music data to a fixed endpoint, with server authorization only', async () => {
  const calls = [];
  const fetcher = async (url, init) => { calls.push({ url, init }); return new Response(JSON.stringify({ status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify(result) }] }] })); };
  const network = createJazzNetwork({ rpcUrl: config.rpcUrl, apiKey: config.apiKey, fetcher });
  assert.deepEqual(await network.generate(context), result);
  assert.equal(calls.length, 1); assert.equal(calls[0].url, 'https://api.openai.com/v1/responses');
  const body = JSON.parse(calls[0].init.body);
  assert.equal(body.model, JAZZ_MODEL); assert.equal(body.store, false); assert.equal(body.max_output_tokens, 1600);
  assert.equal(body.text.format.strict, true); assert.equal(body.tools, undefined);
  assert.deepEqual(JSON.parse(body.input), context); assert(!calls[0].init.body.includes(config.apiKey));
  assert.equal(calls[0].init.headers.Authorization, 'Bearer ' + config.apiKey);
});

test('preflight decodes padded ERC20 decimals and rejects a wrong network or unavailable model', async () => {
  const fetcher = async (url, init) => {
    if (url.includes('openai.com')) return new Response(JSON.stringify({ id: JAZZ_MODEL }));
    const method = JSON.parse(init.body).method;
    return new Response(JSON.stringify({ id: 1, jsonrpc: '2.0', result: method === 'eth_chainId' ? '0x1' : '0x' + '12'.padStart(64, '0') }));
  };
  await createJazzNetwork({ ...config, fetcher }).preflight();
});
