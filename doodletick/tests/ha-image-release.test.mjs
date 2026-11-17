// SPDX-License-Identifier: GPL-3.0-only
// All API, registry and Docker boundaries below are disposable in-memory fixtures.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { HA_REPOSITORY, HA_ARCHES, releaseContext, successfulWorkflowRun, requireWorkflowChecks,
  promoteImages, createRegistry, stageImage } from '../../scripts/ha-image-release.mjs';

const sha = 'a'.repeat(40), release = '0.14b', configDigest = 'sha256:' + 'b'.repeat(64), otherDigest = 'sha256:' + 'c'.repeat(64);
const context = { repository: HA_REPOSITORY, sha, release };
const env = { GITHUB_REPOSITORY: HA_REPOSITORY, GITHUB_EVENT_NAME: 'push', GITHUB_SHA: sha, GITHUB_REF: 'refs/tags/' + release, GITHUB_REF_NAME: release };
const run = (workflow, extra = {}) => ({ id: 11, run_attempt: 1, head_sha: sha, event: 'push', status: 'completed', conclusion: 'success',
  path: '.github/workflows/' + workflow, repository: { full_name: HA_REPOSITORY }, head_repository: { full_name: HA_REPOSITORY }, ...extra });
const github = async endpoint => ({ workflow_runs: [run(endpoint.includes('/ci.yml/') ? 'ci.yml' : 'doodleverse-ha.yml')] });

test('publication context rejects forks, PRs, moved source and a tag different from package.release', () => {
  assert.deepEqual(releaseContext(env, release, true), context);
  for (const patch of [{ GITHUB_REPOSITORY: 'other/doodletick' }, { GITHUB_EVENT_NAME: 'pull_request' }, { GITHUB_SHA: 'main' },
    { GITHUB_REF: 'refs/heads/main' }, { GITHUB_REF_NAME: '0.15b' }]) assert.throws(() => releaseContext({ ...env, ...patch }, release, true));
  assert.throws(() => releaseContext(env, '0.14b; echo bad', true));
  assert.deepEqual(releaseContext({ ...env, GITHUB_REF: 'refs/heads/release/0.14b-jazz-radio' }, release), context);
  assert.throws(() => releaseContext({ ...env, GITHUB_REF: 'refs/heads/unreviewed' }, release));
});

test('required workflow success belongs to the exact SHA, push source and workflow, with the newest run authoritative', () => {
  const good = run('ci.yml'); assert.equal(successfulWorkflowRun([good], context, 'ci.yml'), 11);
  for (const patch of [{ head_sha: 'd'.repeat(40) }, { event: 'pull_request' }, { status: 'in_progress' }, { conclusion: 'failure' },
    { head_repository: { full_name: 'fork/doodletick' } }, { repository: { full_name: 'fork/doodletick' } }, { path: '.github/workflows/another.yml' }]) {
    assert.throws(() => successfulWorkflowRun([{ ...good, ...patch }], context, 'ci.yml'));
  }
  assert.throws(() => successfulWorkflowRun([good, run('ci.yml', { id: 12, conclusion: 'failure' })], context, 'ci.yml'));
  assert.throws(() => successfulWorkflowRun([good, run('ci.yml', { id: 11, run_attempt: 2, status: 'in_progress', conclusion: null })], context, 'ci.yml'));
  assert.throws(() => successfulWorkflowRun([], context, 'ci.yml'));
});

test('both named workflows are queried for the exact tagged commit before registry access', async () => {
  const endpoints = [];
  const checks = await requireWorkflowChecks(context, async endpoint => { endpoints.push(endpoint); return github(endpoint); });
  assert.deepEqual(checks.map(item => item.workflow), ['ci.yml', 'doodleverse-ha.yml']);
  for (const endpoint of endpoints) {
    const url = new URL('https://api.github.com' + endpoint);
    assert.equal(url.searchParams.get('head_sha'), sha); assert.equal(url.searchParams.get('event'), 'push');
  }
  let registryReads = 0;
  await assert.rejects(promoteImages(context, { github: async () => ({ workflow_runs: [] }), registry: { manifest() { registryReads++; } } }));
  assert.equal(registryReads, 0);
});

function promotionRegistry({ missing = null, conflict = null, matching = null } = {}) {
  const writes = [], reads = [];
  return { writes, reads,
    async manifest(image, tag) {
      const arch = image.endsWith('-aarch64') ? 'aarch64' : 'amd64'; reads.push([arch, tag]);
      if (tag.startsWith('sha-')) return arch === missing ? null : { digest: configDigest, body: Buffer.from(arch) };
      return arch === conflict ? { digest: otherDigest } : arch === matching ? { digest: configDigest } : null;
    },
    async copy(image, tag, source) { writes.push({ image, tag, body: source.body }); }
  };
}

test('missing or conflicting second architecture prevents either release tag from being written', async () => {
  for (const options of [{ missing: 'aarch64' }, { conflict: 'aarch64' }]) {
    const registry = promotionRegistry(options); await assert.rejects(promoteImages(context, { github, registry }));
    assert.equal(registry.writes.length, 0);
  }
});

test('promotion preserves checked source manifests and matching existing version digests are idempotent', async () => {
  const registry = promotionRegistry({ matching: 'amd64' }); await promoteImages(context, { github, registry });
  assert.equal(registry.writes.length, 1); assert.equal(registry.writes[0].image, 'moswald14/doodletick-aarch64');
  assert.equal(registry.writes[0].tag, release); assert.deepEqual(registry.writes[0].body, Buffer.from('aarch64'));
  assert.deepEqual(registry.reads.filter(([, tag]) => tag.startsWith('sha-')).map(([arch]) => arch), HA_ARCHES);
});

const mediaType = 'application/vnd.docker.distribution.manifest.v2+json';
const body = Buffer.from(JSON.stringify({ schemaVersion: 2, mediaType, config: { digest: configDigest }, layers: [] }));
const manifestDigest = 'sha256:' + createHash('sha256').update(body).digest('hex');
function registryFixture({ status = 200, claimed = manifestDigest, existing = false, race = null } = {}) {
  const requests = []; let saved = existing, putCount = 0;
  const fetcher = async (url, options) => {
    requests.push({ url, options });
    if (url.startsWith('https://ghcr.io/token?')) return Response.json({ token: 'fixture-short-lived-registry-token' });
    if (options.method === 'PUT') { putCount++; saved = true; return new Response(null, { status: 201 }); }
    if (status !== 200) return new Response(null, { status });
    if (url.endsWith('/' + release) && !saved) {
      if (race) {
        saved = true;
        const raced = Buffer.from(JSON.stringify({ schemaVersion: 2, mediaType, config: { digest: otherDigest }, layers: [] }));
        return new Response(raced, { headers: { 'Content-Type': mediaType, 'Docker-Content-Digest': 'sha256:' + createHash('sha256').update(raced).digest('hex') } });
      }
      return new Response(null, { status: 404 });
    }
    return new Response(body, { headers: { 'Content-Type': mediaType, 'Docker-Content-Digest': claimed } });
  };
  return { registry: createRegistry({ token: 'fixture-workflow-token', actor: 'fixture-actor', fetcher }), requests, puts: () => putCount };
}

test('registry reads authenticate only to fixed HTTPS endpoints and verify raw manifest digests', async () => {
  const f = registryFixture(), image = 'moswald14/doodletick-amd64';
  const source = await f.registry.manifest(image, 'sha-' + sha);
  assert.equal(source.digest, manifestDigest); assert.equal(source.configDigest, configDigest); assert.deepEqual(source.body, body);
  assert.equal(f.requests[0].options.headers.Authorization, 'Basic ' + Buffer.from('fixture-actor:fixture-workflow-token').toString('base64'));
  assert.equal(f.requests[1].options.headers.Authorization, 'Bearer fixture-short-lived-registry-token');
  assert(f.requests.every(request => request.options.redirect === 'error'));
  assert(!f.requests.some(request => request.url.includes('fixture-workflow-token')));
  await assert.rejects(f.registry.manifest('other/arbitrary', 'sha-' + sha));
  await assert.rejects(f.registry.manifest(image, '../escape'));
  await assert.rejects(registryFixture({ claimed: otherDigest }).registry.manifest(image, 'sha-' + sha), /digest did not verify/);
});

test('registry transport failures and denied access never masquerade as a missing image', async () => {
  const image = 'moswald14/doodletick-amd64';
  assert.equal(await registryFixture({ status: 404 }).registry.manifest(image, 'sha-' + sha), null);
  for (const status of [401, 403, 429, 500]) await assert.rejects(registryFixture({ status }).registry.manifest(image, 'sha-' + sha));
  const registry = createRegistry({ token: 'fixture-token', actor: 'fixture', fetcher: async () => { throw new Error('Fixture unavailable'); } });
  await assert.rejects(registry.manifest(image, 'sha-' + sha));
});

test('registry promotion sends identical manifest bytes and matching retries perform no PUT', async () => {
  const image = 'moswald14/doodletick-amd64', f = registryFixture();
  const source = await f.registry.manifest(image, 'sha-' + sha); await f.registry.copy(image, release, source);
  const put = f.requests.find(request => request.options.method === 'PUT');
  assert.deepEqual(put.options.body, body); assert.equal(put.options.headers['Content-Type'], mediaType);
  assert.equal(put.options.headers['If-None-Match'], '*'); assert.equal(f.puts(), 1);
  await f.registry.copy(image, release, source); assert.equal(f.puts(), 1);
  const differentBody = Buffer.from(JSON.stringify({ schemaVersion: 2, mediaType, config: { digest: otherDigest }, layers: [] }));
  await assert.rejects(f.registry.copy(image, release, { ...source, body: differentBody, digest: 'sha256:' + createHash('sha256').update(differentBody).digest('hex') }), /Refusing to replace/);
  assert.equal(f.puts(), 1);
});

test('invalid source bytes and malformed authentication fail before any registry write or token disclosure', async () => {
  const f = registryFixture();
  await assert.rejects(f.registry.copy('moswald14/doodletick-amd64', release, { digest: otherDigest, mediaType, body }), /source manifest digest/);
  assert.equal(f.requests.length, 0);
  for (const response of [new Response(null, { status: 403 }), new Response('fixture-secret-that-must-never-be-logged{')]) {
    let calls = 0;
    const registry = createRegistry({ token: 'fixture-secret', actor: 'fixture', fetcher: async () => { calls++; return response; } });
    await assert.rejects(registry.manifest('moswald14/doodletick-amd64', 'sha-' + sha), error => !error.message.includes('fixture-secret'));
    assert.equal(calls, 1);
  }
});

test('a concurrent conflicting version tag is detected at the final pre-write check', async () => {
  const f = registryFixture({ race: otherDigest });
  await assert.rejects(f.registry.copy('moswald14/doodletick-amd64', release, { digest: manifestDigest, mediaType, body }), /Refusing to replace/);
  assert.equal(f.puts(), 0);
});

function localImage(arch = 'amd64') {
  return { Id: configDigest, Os: 'linux', Architecture: arch === 'aarch64' ? 'arm64' : arch, Config: { Labels: {
    'org.opencontainers.image.source': 'https://github.com/' + HA_REPOSITORY, 'org.opencontainers.image.revision': sha,
    'io.hass.arch': arch, 'io.hass.version': release
  } } };
}
test('staging refuses mismatched checked image labels, platform or immutable commit contents', async () => {
  for (const local of [{ ...localImage(), Architecture: 'arm64' }, { ...localImage(), Config: { Labels: {} } }]) {
    const commands = [];
    await assert.rejects(stageImage(context, 'amd64', { registry: {}, docker: args => { commands.push(args); return JSON.stringify([local]); } }));
    assert.deepEqual(commands.map(args => args[0]), ['image']);
  }
  const commands = [];
  await assert.rejects(stageImage(context, 'amd64', { registry: { manifest: async () => ({ configDigest: otherDigest }) },
    docker: args => { commands.push(args); return JSON.stringify([localImage()]); } }), /immutable commit/);
  assert.equal(commands.length, 1);
});

test('staging publishes only the checked commit tag and an identical retry never pushes again', async () => {
  const commands = []; let stored = false;
  const registry = { manifest: async () => stored ? { configDigest, digest: manifestDigest } : null };
  const docker = args => { commands.push(args); if (args[0] === 'push') stored = true; return JSON.stringify([localImage('aarch64')]); };
  await stageImage(context, 'aarch64', { registry, docker });
  assert.deepEqual(commands.map(args => args[0]), ['image', 'tag', 'push']);
  assert.equal(commands[2][1], 'ghcr.io/moswald14/doodletick-aarch64:sha-' + sha);
  await stageImage(context, 'aarch64', { registry, docker }); assert.equal(commands.filter(args => args[0] === 'push').length, 1);
});
