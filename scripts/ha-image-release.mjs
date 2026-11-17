// SPDX-License-Identifier: GPL-3.0-only
// Release-only tooling. Tokens stay in memory; logs contain public refs/digests.
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

export const HA_REPOSITORY = 'moswald14/doodletick';
export const HA_ARCHES = Object.freeze(['amd64', 'aarch64']);
const workflows = ['ci.yml', 'doodleverse-ha.yml'];
const digestPattern = /^sha256:[a-f0-9]{64}$/;
const manifestTypes = ['application/vnd.docker.distribution.manifest.v2+json', 'application/vnd.oci.image.manifest.v1+json'];

export function releaseContext(env, release, tagged = false) {
  if (env.GITHUB_REPOSITORY !== HA_REPOSITORY || env.GITHUB_EVENT_NAME !== 'push'
    || !/^[a-f0-9]{40}$/.test(env.GITHUB_SHA || '') || !/^0\.\d+(?:\.\d+)*b$/.test(release || '')) throw new Error('Only a trusted repository push can publish checked Home Assistant images.');
  if (tagged ? env.GITHUB_REF !== 'refs/tags/' + release || env.GITHUB_REF_NAME !== release
    : !/^refs\/heads\/(?:main|feature\/dvc-scrypt|release\/.+)$/.test(env.GITHUB_REF || '')) throw new Error('The release tag must match package.release, or staging must use a checked source branch.');
  return { repository: HA_REPOSITORY, sha: env.GITHUB_SHA, release };
}

export function successfulWorkflowRun(runs, context, workflow) {
  if (!Array.isArray(runs)) throw new Error('The workflow check response was invalid.');
  const matching = runs.filter(run => run.head_sha === context.sha && run.event === 'push'
    && run.repository?.full_name === context.repository && run.head_repository?.full_name === context.repository
    && run.path === '.github/workflows/' + workflow);
  matching.sort((a, b) => b.id - a.id || (b.run_attempt || 1) - (a.run_attempt || 1));
  const latest = matching[0];
  if (!latest || latest.status !== 'completed' || latest.conclusion !== 'success') throw new Error(workflow + ' must have a completed successful push run for the exact tagged commit.');
  return latest.id;
}

export async function requireWorkflowChecks(context, github) {
  const checks = [];
  for (const workflow of workflows) {
    const query = new URLSearchParams({ head_sha: context.sha, event: 'push', per_page: '100' });
    const result = await github('/repos/' + context.repository + '/actions/workflows/' + workflow + '/runs?' + query);
    checks.push({ workflow, id: successfulWorkflowRun(result.workflow_runs, context, workflow) });
  }
  return checks;
}

export async function promoteImages(context, { github, registry, log = () => {} }) {
  const checks = await requireWorkflowChecks(context, github);
  const plans = [];
  // Preflight both architectures before publishing either version tag.
  for (const arch of HA_ARCHES) {
    const image = HA_REPOSITORY.replace('/doodletick', '/doodletick-' + arch);
    const source = await registry.manifest(image, 'sha-' + context.sha);
    if (!source) throw new Error('The checked commit image is missing for ' + arch + '.');
    const existing = await registry.manifest(image, context.release);
    if (existing && existing.digest !== source.digest) throw new Error('Refusing to replace a different immutable release image for ' + arch + '.');
    plans.push({ image, source, skip: !!existing });
  }
  for (const plan of plans) {
    if (!plan.skip) await registry.copy(plan.image, context.release, plan.source);
    log(plan.image + ':' + context.release + ' ' + plan.source.digest + (plan.skip ? ' already matched' : ' promoted'));
  }
  return checks;
}

async function responseBytes(response, limit) {
  const chunks = []; let size = 0;
  for await (const chunk of response.body || []) {
    size += chunk.length;
    if (size > limit) throw new Error('The registry response exceeded its bound.');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

export function createRegistry({ token, actor, fetcher = fetch }) {
  if (!token || !actor) throw new Error('An ephemeral workflow token is required.');
  const tokens = new Map();
  async function request(image, reference, options = {}) {
    if (!/^moswald14\/doodletick-(?:amd64|aarch64)$/.test(image)
      || !/^(?:sha-[a-f0-9]{40}|0\.\d+(?:\.\d+)*b)$/.test(reference)) throw new Error('Invalid Home Assistant registry reference.');
    if (!tokens.has(image)) {
      const query = new URLSearchParams({ service: 'ghcr.io', scope: 'repository:' + image + ':pull,push' });
      const response = await fetcher('https://ghcr.io/token?' + query, { redirect: 'error', signal: AbortSignal.timeout(15000),
        headers: { Authorization: 'Basic ' + Buffer.from(actor + ':' + token).toString('base64'), Accept: 'application/json' } });
      if (!response.ok) throw new Error('Registry authentication failed (HTTP ' + response.status + ').');
      let data;
      try { data = JSON.parse((await responseBytes(response, 32768)).toString('utf8')); }
      catch { throw new Error('Registry authentication returned invalid data.'); }
      if (typeof data.token !== 'string' || !data.token || data.token.length > 16384) throw new Error('Registry authentication returned no usable token.');
      tokens.set(image, data.token);
    }
    return fetcher('https://ghcr.io/v2/' + image + '/manifests/' + reference, {
      ...options, redirect: 'error', signal: AbortSignal.timeout(30000),
      headers: { Accept: manifestTypes.join(', '), Authorization: 'Bearer ' + tokens.get(image), ...options.headers }
    });
  }
  async function manifest(image, reference) {
    const response = await request(image, reference);
    if (response.status === 404) { await response.body?.cancel(); return null; }
    if (!response.ok) throw new Error('Cannot inspect the registry image (HTTP ' + response.status + ').');
    const mediaType = (response.headers.get('content-type') || '').split(';')[0];
    const body = await responseBytes(response, 2097152), digest = 'sha256:' + createHash('sha256').update(body).digest('hex');
    const claimed = response.headers.get('docker-content-digest');
    if (claimed && claimed !== digest) throw new Error('The registry manifest digest did not verify.');
    const parsed = JSON.parse(body.toString('utf8'));
    if (!manifestTypes.includes(mediaType) || parsed.mediaType !== mediaType || parsed.schemaVersion !== 2
      || !digestPattern.test(parsed.config?.digest || '') || !Array.isArray(parsed.layers)) throw new Error('Expected one checked platform image manifest.');
    return { digest, configDigest: parsed.config.digest, mediaType, body };
  }
  return {
    manifest,
    async copy(image, reference, source) {
      if (!Buffer.isBuffer(source.body) || !manifestTypes.includes(source.mediaType)
        || source.digest !== 'sha256:' + createHash('sha256').update(source.body).digest('hex')) throw new Error('The checked source manifest digest did not verify.');
      // Recheck immediately before the write; the workflow also serializes tag runs.
      const existing = await manifest(image, reference);
      if (existing) {
        if (existing.digest !== source.digest) throw new Error('Refusing to replace a different immutable registry image.');
        return;
      }
      // Preserve the exact checked manifest bytes, without a rebuild or re-encoding.
      const response = await request(image, reference, { method: 'PUT', body: source.body,
        headers: { 'Content-Type': source.mediaType, 'If-None-Match': '*' } });
      if (response.status !== 201 && response.status !== 412) throw new Error('The registry did not accept the immutable image tag (HTTP ' + response.status + ').');
      await response.body?.cancel();
      const saved = await manifest(image, reference);
      if (!saved || saved.digest !== source.digest) throw new Error('The published image digest did not match the checked image.');
    }
  };
}

export async function stageImage(context, arch, { registry, docker, log = () => {} }) {
  if (!HA_ARCHES.includes(arch)) throw new Error('Unsupported Home Assistant architecture.');
  const image = HA_REPOSITORY.replace('/doodletick', '/doodletick-' + arch), tag = 'sha-' + context.sha;
  const [local] = JSON.parse(docker(['image', 'inspect', 'doodleverse-ha:check'], true));
  const labels = local?.Config?.Labels;
  if (!digestPattern.test(local?.Id || '') || local.Os !== 'linux' || local.Architecture !== (arch === 'aarch64' ? 'arm64' : 'amd64')
    || labels?.['org.opencontainers.image.revision'] !== context.sha || labels?.['org.opencontainers.image.source'] !== 'https://github.com/' + context.repository
    || labels?.['io.hass.arch'] !== arch || labels?.['io.hass.version'] !== context.release) throw new Error('The checked local image does not match this commit, architecture and release.');
  const existing = await registry.manifest(image, tag);
  if (existing) {
    if (existing.configDigest !== local.Id) throw new Error('Refusing to replace a different immutable commit image.');
    log(image + ':' + tag + ' already matched'); return;
  }
  docker(['tag', 'doodleverse-ha:check', 'ghcr.io/' + image + ':' + tag]);
  docker(['push', 'ghcr.io/' + image + ':' + tag]);
  const saved = await registry.manifest(image, tag);
  if (!saved || saved.configDigest !== local.Id) throw new Error('The staged image did not match the checked local image.');
  log(image + ':' + tag + ' ' + saved.digest + ' staged');
}

async function main() {
  const [mode, arch, ...extra] = process.argv.slice(2);
  if (!['stage', 'promote'].includes(mode) || extra.length || (mode === 'stage' ? !arch : !!arch)) throw new Error('Usage: ha-image-release.mjs stage <arch> | promote');
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const { release } = JSON.parse(await readFile(path.join(root, 'keeper/package.json'), 'utf8'));
  const context = releaseContext(process.env, release, mode === 'promote'), token = process.env.GH_TOKEN;
  const head = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8', windowsHide: true });
  if (head.status !== 0 || head.stdout.trim() !== context.sha) throw new Error('The checked-out source must match GITHUB_SHA exactly.');
  const registry = createRegistry({ token, actor: process.env.GITHUB_ACTOR });
  const docker = (args, capture = false) => {
    const result = spawnSync('docker', args, { cwd: root, shell: false, windowsHide: true, ...(capture ? { encoding: 'utf8' } : { stdio: 'inherit' }) });
    if (result.error || result.status !== 0) throw new Error('The checked image command failed.');
    return result.stdout;
  };
  if (mode === 'stage') await stageImage(context, arch, { registry, docker, log: console.log });
  else {
    const github = async endpoint => {
      const response = await fetch('https://api.github.com' + endpoint, { redirect: 'error', signal: AbortSignal.timeout(20000),
        headers: { Authorization: 'Bearer ' + token, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' } });
      if (!response.ok) throw new Error('Cannot verify required GitHub workflow checks (HTTP ' + response.status + ').');
      return JSON.parse((await responseBytes(response, 4194304)).toString('utf8'));
    };
    const checks = await promoteImages(context, { github, registry, log: console.log });
    for (const check of checks) console.log(check.workflow + ' exact-SHA successful run ' + check.id);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(error => { console.error(error.message); process.exitCode = 1; });
