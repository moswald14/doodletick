import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { repositoryRoot, syncHa } from './sync-ha.mjs';

const fail = message => { throw new Error(message); };
const read = name => readFile(path.join(repositoryRoot, name), 'utf8');
function scalar(text, key) {
  const value = text.match(new RegExp('^' + key + ':\\s*(.*?)\\s*$', 'm'))?.[1];
  if (!value) fail(`Missing metadata field: ${key}`);
  return value.replace(/^(["'])(.*)\1$/, '$2');
}

async function publicFiles(relative = '') {
  const files = [];
  const blockedDirectories = new Set(['.doodletick', 'node_modules', '__pycache__', 'user-data', '.aws', '.codex', '.ssh']);
  const blockedNames = new Set(['witness-key.json', 'garden-ledger.json', 'shelf-idle.json', 'mozcorp-world.json', 'options.json', 'receipts.jsonl', 'dvc-chain.jsonl', 'server.lock', 'tailscaled.state', 'id_rsa', 'id_ed25519']);
  for (const entry of await readdir(path.join(repositoryRoot, relative), { withFileTypes: true })) {
    if (!relative && entry.name === '.git') continue;
    // Build/test dependencies are reproducibly installed from the lockfile and
    // excluded by the release packager; they are not application source.
    if (entry.name === 'node_modules' && entry.isDirectory()) continue;
    const name = relative ? relative + '/' + entry.name : entry.name;
    if (entry.isSymbolicLink()) fail(`Symlinks are not allowed in the distribution: ${name}`);
    if (!relative && entry.name === 'dist' && entry.isDirectory()) continue;
    if (blockedDirectories.has(entry.name) || blockedNames.has(entry.name) || /^\.env(?:\.|$)/.test(entry.name)
      || /\.(?:vault\.json|doodletick-receipt\.json|log|pem|key|pfx|exe|msi|scr|zip|tar|gz|tmp|bak)$/i.test(entry.name)) fail(`Runtime, private or packaged artifact found: ${name}`);
    if (entry.isDirectory()) files.push(...await publicFiles(name));
    else if (entry.isFile()) files.push(name);
    else fail(`Unexpected non-file: ${name}`);
  }
  return files;
}

try {
  if (process.argv.length !== 2) fail('Usage: node scripts/check-repository.mjs');
  const pkg = JSON.parse(await read('keeper/package.json'));
  const release = pkg.release;
  if (typeof release !== 'string' || !/^[0-9][0-9A-Za-z.-]*$/.test(release)) fail('A public release label is required in keeper/package.json.');
  if (!/^\d+\.\d+\.\d+(?:-[\w.-]+)?$/.test(pkg.version)) fail('Node package version must use semantic versioning.');
  if (!['GPL-3.0-only', 'GPL-3.0-or-later'].includes(pkg.license)) fail('Declare the approved GPLv3 code license in keeper/package.json.');
  const license = await read('LICENSE');
  if (!license.includes('GNU GENERAL PUBLIC LICENSE') || !license.includes('Version 3, 29 June 2007')) fail('The complete GPLv3 license text is required.');
  const repository = await read('repository.yaml');
  scalar(repository, 'name');
  if (!/^https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(scalar(repository, 'url'))) fail('repository.yaml needs the public GitHub repository URL.');
  const config = await read('doodletick/config.yaml');
  if (scalar(config, 'version') !== release || scalar(config, 'slug') !== 'doodletick') fail('Home Assistant release metadata differs from Keeper.');
  if (scalar(config, 'ingress') !== 'true' || scalar(config, 'host_network') !== 'false' || scalar(config, 'apparmor') !== 'true') fail('Review the Home Assistant access configuration.');
  if (/^(?:ports|full_access|docker_api|hassio_api|homeassistant_api|privileged|devices):/m.test(config)) fail('The release must not add host ports, network capabilities, devices or administrative API access without a reviewed policy change.');
  const mount = config.match(/^map:\s*\n((?:[ \t]+[^\n]*\n?)*)/m)?.[1];
  if (mount?.trim() !== '- type: app_config\n    read_only: true') fail('Only this app\'s read-only configuration folder may be mounted for offline migration.');
  if (scalar(config, 'backup') !== 'cold') fail('Keeper state requires a stopped-app backup.');
  const requiredMarkers = [
    ['doodletick/Dockerfile', `io.hass.version="${release}"`],
    ['keeper/server.mjs', `version: '${release}'`],
    ['keeper/public/index.html', `DOODLE TICK ${release}`],
    ['keeper/public/sw.mjs', `doodletick-shell-v${release}`],
    ['keeper/RELEASES.md', `## ${release}`],
    ['doodletick/CHANGELOG.md', `# ${release}`]
  ];
  for (const [name, marker] of requiredMarkers) if (!(await read(name)).includes(marker)) fail(`Release label is missing or stale in ${name}.`);
  const dependencies = JSON.parse(await read('keeper/pi/dependencies.json'));
  if (!dependencies.bundle.startsWith(release + '-pi.')) fail('The Pi bundle label is stale.');
  const installer = await read('keeper/pi/install.sh');
  if (!installer.includes(dependencies.bundle)) fail('The Pi installer label is stale.');
  if (installer.includes('\r')) fail('The Pi installer must retain LF line endings.');
  // Read the actual Bash ERE, rather than maintaining a second allowlist.
  // This restricted expression grammar has the same meaning in Bash and JavaScript.
  const pattern = installer.match(/\[\[ \$file =~ (\S+) && \$file != \*\.\.\* \]\]/)?.[1];
  const alternatives = pattern?.match(/^\^\((.*)\)\$$/)?.[1]?.split('|');
  if (!alternatives || alternatives.some(value => value !== 'public/[a-z0-9.-]+' && !/^[A-Za-z0-9_/-]+(?:\\\.[A-Za-z0-9_-]+)*$/.test(value))) fail('The Pi installer allowlist expression changed; review the compatibility check.');
  const runtimePattern = new RegExp(pattern);
  const accepted = name => runtimePattern.test(name) && !name.includes('..');
  const runtimeNames = (await read('keeper/pi/runtime-files.txt')).trim().split(/\r?\n/);
  for (const name of runtimeNames) if (!accepted(name)) fail(`The Pi installer rejects a published runtime file: ${name}`);
  for (const name of ['../witness-key.json', 'public/../witness-key.json', '/server.mjs', 'pi/install.sh', 'garden-ledger.json', 'public/a..mjs', 'public/name with spaces.mjs']) {
    if (accepted(name)) fail(`The Pi installer allowlist accepts an unsafe or non-runtime path: ${name}`);
  }
  const generated = await syncHa({ checkOnly: true });
  const files = await publicFiles();
  for (const name of files) {
    const bytes = await readFile(path.join(repositoryRoot, name));
    if (bytes.includes(0)) continue; // Binary artwork is checked by filename, not parsed as text.
    const content = bytes.toString('utf8');
    if (/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/.test(content)
      || /\b(?:github_pat_|ghp_|tskey-auth-)[A-Za-z0-9_-]{20,}/.test(content)
      || /"privateKey"\s*:\s*"[A-Za-z0-9_+\/=\-]{64,}"/.test(content)) fail(`Possible credential material in ${name}; inspect it before publishing.`);
    if (/[A-Za-z]:[\\/]+Users[\\/]+[^\s\\/]+[\\/]/.test(content)) fail(`A personal workstation path remains in ${name}.`);
  }
  console.log(`Repository checks passed: ${release}, ${files.length} files, ${generated.files} matching generated runtime files. These checks are not a security audit.`);
} catch (error) { console.error(error.message); process.exitCode = 1; }
