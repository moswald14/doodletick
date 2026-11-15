import { lstat, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const normalizeLines = text => text.replace(/\r\n/g, '\n');

function replaceRequired(text, before, after, name) {
  if (!text.includes(before)) throw new Error(`${name}: the Home Assistant adaptation needs review; its source marker changed.`);
  return text.replaceAll(before, after);
}

// Match the original release generator's compact JSON formatting.
function compactJson(value) {
  if (Array.isArray(value)) return '[' + value.map(compactJson).join(', ') + ']';
  if (value && typeof value === 'object') return '{' + Object.entries(value).map(([k, v]) => JSON.stringify(k) + ': ' + compactJson(v)).join(', ') + '}';
  return JSON.stringify(value);
}

export function adaptForHomeAssistant(name, source) {
  let content = normalizeLines(source);
  if (!name.startsWith('public/')) return content;
  content = content.replaceAll("fetcher('/vpn-api/", "fetcher('./vpn-api/");
  content = content.replaceAll("fetch('/api/", "fetch('./api/").replaceAll("fetch('/vpn-api/", "fetch('./vpn-api/");
  if (name === 'public/vpn-ui.mjs') {
    for (const [before, after] of [
      ['Install Tailscale on each computer and sign in.', 'This Home Assistant add-on already includes Tailscale. Use Connect private network in the Your always-on Keeper panel below, then follow its sign-in link.'],
      ['Run this Keeper on each computer. Share a room code to play.', 'Friends using Windows still need Tailscale and Keeper on their own computers. Share a room code to play.'],
      ['Solo practice and your vault work without a connection.', 'Solo practice and your vault work without a private connection. Open Home Assistant over HTTPS for the encrypted vault and games.'],
      ['<a href="https://tailscale.com/download/windows" target="_blank" rel="noopener noreferrer">Get Tailscale ↗</a> · ', ''],
      ["new Option('This computer', 'self')", "new Option('This Home Assistant Keeper', 'self')"],
      ['Start the Keeper on this computer to connect. Solo practice and your saved work are available.', 'Reopen the add-on Web UI and check the Your always-on Keeper panel below. Solo practice and your saved work remain available over HTTPS.']
    ]) content = replaceRequired(content, before, after, name);
  }
  if (name === 'public/app.mjs') {
    content = replaceRequired(content, "headers: { 'Content-Type':", "headers: { 'X-Keeper-Request': '1', 'Content-Type':", name);
    const registration = /^if \('serviceWorker' in navigator\).*$/m;
    if (!registration.test(content)) throw new Error(`${name}: service worker registration changed; review the ingress adaptation.`);
    content = content.replace(registration, '// Offline service worker is disabled inside authenticated Home Assistant ingress.');
  }
  if (['public/vpn-transport.mjs', 'public/arcade-room.mjs'].includes(name)) {
    content = replaceRequired(content, 'headers: {', "headers: { 'X-Keeper-Request': '1',", name);
  }
  if (name === 'public/index.html') {
    content = content.replaceAll('href="/', 'href="./').replaceAll('src="/', 'src="./');
    content = replaceRequired(content, '</head>', '<link rel="stylesheet" href="./ha.css"><script type="module" src="./ha.mjs"></script></head>', name);
    const panel = `<section class="ha-connection" id="ha-connection" aria-label="Home Assistant Keeper">
<h2>Your always-on Keeper</h2><p id="ha-status" role="status">Checking your private connection…</p>
<button class="button quiet" id="ha-connect" type="button">Connect private network</button>
<a id="ha-login" target="_blank" rel="noopener noreferrer" hidden>Sign in to Tailscale ↗</a>
<p id="ha-secure" hidden>Open Home Assistant over HTTPS to unlock the encrypted vault and play. The background room directory still works on this connection.</p>
<p>Your writing and shared files stay in this browser. Home Assistant keeps the directory and witness online.</p></section>`;
    content = replaceRequired(content, '    <section id="view-arcade"', panel + '\n    <section id="view-arcade"', name);
  }
  if (name === 'public/manifest.webmanifest') {
    const manifest = JSON.parse(content);
    manifest.start_url = './'; manifest.scope = './';
    for (const icon of manifest.icons) icon.src = './logo.svg';
    content = compactJson(manifest);
  }
  return content;
}

async function assertNoLinks(root, relative = '') {
  const parts = relative ? relative.split('/') : [];
  let current = root;
  for (const part of ['', ...parts]) {
    if (part) current = path.join(current, part);
    try {
      if ((await lstat(current)).isSymbolicLink()) throw new Error(`Refusing a symlink in ${relative || '.'}.`);
    } catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
}

async function filesUnder(root, relative = '') {
  let entries;
  try { entries = await readdir(path.join(root, relative), { withFileTypes: true }); }
  catch (error) { if (error.code === 'ENOENT') return []; throw error; }
  const files = [];
  for (const entry of entries) {
    const name = relative ? relative + '/' + entry.name : entry.name;
    if (entry.isSymbolicLink()) throw new Error(`Unexpected symlink in generated runtime: ${name}`);
    if (entry.isDirectory()) files.push(...await filesUnder(root, name));
    else if (entry.isFile()) files.push(name);
    else throw new Error(`Unexpected non-file in generated runtime: ${name}`);
  }
  return files.sort();
}

export async function syncHa({ checkOnly = false, root = repositoryRoot } = {}) {
  const source = path.join(root, 'keeper'), target = path.join(root, 'doodletick', 'keeper');
  await assertNoLinks(root, 'keeper'); await assertNoLinks(root, 'doodletick/keeper');
  await assertNoLinks(source, 'pi/runtime-files.txt');
  const names = normalizeLines(await readFile(path.join(source, 'pi/runtime-files.txt'), 'utf8')).split('\n').filter(Boolean);
  if (new Set(names).size !== names.length) throw new Error('The runtime inventory contains duplicate paths.');
  for (const name of names) {
    if (!/^[a-zA-Z0-9_.-]+(?:\/[a-zA-Z0-9_.-]+)*$/.test(name) || name.split('/').some(part => part === '.' || part === '..')) throw new Error('Unsafe path in the runtime inventory.');
    await assertNoLinks(source, name);
    if (!(await lstat(path.join(source, name))).isFile()) throw new Error(`Runtime input is not a file: ${name}`);
  }
  for (const required of ['package.json', 'server.mjs', 'public/app.mjs', 'public/index.html']) {
    if (!names.includes(required)) throw new Error(`Missing runtime inventory entry: ${required}`);
  }
  const expected = new Map();
  for (const name of names.filter(name => !name.startsWith('pi/') && name !== 'public/sw.mjs')) {
    expected.set(name, adaptForHomeAssistant(name, await readFile(path.join(source, name), 'utf8')));
  }
  const extras = (await filesUnder(target)).filter(name => !expected.has(name));
  if (extras.length) throw new Error('Unexpected generated runtime files (review and remove intentionally):\n' + extras.map(name => '  ' + name).join('\n'));
  const changed = [];
  for (const [name, wanted] of expected) {
    let actual;
    try { actual = await readFile(path.join(target, name), 'utf8'); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
    if (actual !== wanted) changed.push(name);
  }
  if (checkOnly && changed.length) throw new Error('Missing or stale generated runtime files; run node scripts/sync-ha.mjs:\n' + changed.map(name => '  ' + name).join('\n'));
  if (!checkOnly) {
    for (const name of changed) {
      await mkdir(path.dirname(path.join(target, name)), { recursive: true });
      await writeFile(path.join(target, name), expected.get(name), 'utf8');
    }
  }
  return { files: expected.size, changed: changed.length };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = process.argv.slice(2);
    if (args.some(arg => arg !== '--check') || args.length > 1) throw new Error('Usage: node scripts/sync-ha.mjs [--check]');
    const result = await syncHa({ checkOnly: args.includes('--check') });
    console.log(`${args.includes('--check') ? 'Checked' : 'Synchronized'} ${result.files} Home Assistant runtime files; ${result.changed} changed.`);
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
