import { build } from 'esbuild';
import { readFile, writeFile, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
const root = fileURLToPath(new URL('./', import.meta.url));
const check = process.argv.includes('--check');
if (process.argv.slice(2).some(arg => arg !== '--check')) throw Error('Use build.mjs [--check].');
// These are the only supported output locations: source checkout first, then
// the crypto-source/ directory shipped beside public/ in a Keeper download.
const outputLayouts = ['../keeper/public/', '../public/'];
let runtimeDirectory;
for (const relative of outputLayouts) {
  const directory = new URL(relative, import.meta.url);
  try {
    if (!(await stat(directory)).isDirectory()) throw Error('Expected a standard Keeper public directory.');
    runtimeDirectory = directory; break;
  } catch (error) { if (error.code !== 'ENOENT') throw error; }
}
if (!runtimeDirectory) throw Error('Build from crypto-vendor/ in the source checkout or crypto-source/ in an extracted Keeper.');
const result = await build({ absWorkingDir: root, entryPoints: ['entry.mjs'], bundle: true,
  write: false, platform: 'browser', format: 'esm', target: 'es2022', minify: false,
  legalComments: 'inline', charset: 'utf8', treeShaking: true, metafile: true,
  banner: { js: '// Generated from pinned crypto-vendor/package-lock.json. See recipient-crypto-notices.txt.\n// Ethers 6.17.0; pure offline Ethereum signature verification primitives.' } });
const output = new URL('recipient-crypto.mjs', runtimeDirectory);
const bytes = result.outputFiles[0].contents;
const inputNames = [...new Set(Object.values(result.metafile.outputs).flatMap(output => Object.entries(output.inputs)
  .filter(([, info]) => info.bytesInOutput > 0).map(([name]) => name)))].sort();
if (inputNames.some(name => /\/ethers\/lib\.esm\/(providers|wallet|contract)\//.test(name)) || /\b(?:fetch|XMLHttpRequest|WebSocket)\s*\(|eth_sendTransaction|wallet_sendCalls/.test(new TextDecoder().decode(bytes))) throw Error('Unexpected provider or network code in recipient crypto bundle.');
const packages = new Set(inputNames.flatMap(name => {
  const match = name.match(/^node_modules\/((?:@[^/]+\/)?[^/]+)\//); return match ? [match[1]] : [];
}));
let notices = 'Doodle Tick recipient signature verification bundle\n\n';
const sources = {}, versions = {};
async function source(name, optional = false) {
  try {
    // Git normalizes repository text to LF; source snapshots must be identical
    // on Windows and Linux, independent of a contributor's checkout settings.
    const contents = (await readFile(new URL(name, import.meta.url), 'utf8')).replace(/\r\n/g, '\n');
    sources[name] = { sha256: createHash('sha256').update(contents).digest('hex'), contents };
  } catch (error) { if (!optional || error.code !== 'ENOENT') throw error; }
}
for (const name of ['entry.mjs', 'build.mjs', 'package.json', 'package-lock.json', 'README.md']) await source(name);
for (const name of inputNames) {
  await source(name);
  if (name.includes('/ethers/lib.esm/')) await source(name.replace('/lib.esm/', '/src.ts/').replace(/\.js$/, '.ts'));
  else if (name.includes('/@noble/')) await source(name.replace('/esm/', '/src/').replace(/\.js$/, '.ts'));
}
for (const name of [...packages].sort()) {
  const meta = JSON.parse(await readFile(new URL(`./node_modules/${name}/package.json`, import.meta.url), 'utf8'));
  versions[name] = meta.version; await source(`node_modules/${name}/package.json`);
  let license;
  for (const filename of ['LICENSE', 'LICENSE.md', 'LICENSE.txt']) {
    try { license = await readFile(new URL(`./node_modules/${name}/${filename}`, import.meta.url), 'utf8'); await source(`node_modules/${name}/${filename}`); break; } catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  if (!license) throw Error(`Missing license for ${name}`);
  notices += `${name} ${meta.version}\n${meta.repository?.url || meta.repository || ''}\n\n${license.replace(/\r\n/g, '\n').trim()}\n\n`;
}
const noticeFile = new URL('recipient-crypto-notices.txt', runtimeDirectory);
const sourceFile = new URL('./source-inputs.json', import.meta.url);
const sourceText = JSON.stringify({ format: 'doodletick-recipient-crypto-source-v1',
  build: { entry: 'entry.mjs', ethers: '6.17.0', esbuild: '0.28.2', platform: 'browser', format: 'esm', target: 'es2022', minify: false, outputLayouts },
  versions, inputs: inputNames, files: Object.fromEntries(Object.entries(sources).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)) }, null, 2) + '\n';
if (check) {
  if (!Buffer.from(await readFile(output)).equals(Buffer.from(bytes)) || await readFile(noticeFile, 'utf8') !== notices || await readFile(sourceFile, 'utf8') !== sourceText) throw Error('Recipient crypto bundle, preferred source or license notices are stale.');
} else { await writeFile(output, bytes); await writeFile(noticeFile, notices); await writeFile(sourceFile, sourceText); }
console.log(JSON.stringify({ mode: check ? 'check' : 'build', bytes: bytes.length,
  sha256: createHash('sha256').update(bytes).digest('hex'), packages: [...packages].sort() }));
