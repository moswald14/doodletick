// SPDX-License-Identifier: GPL-3.0-only
import { build } from 'esbuild';
import { readFile, writeFile, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
if (process.argv.slice(2).some(arg => arg !== '--check')) throw Error('Use build-scrypt-wallet.mjs [--check].');
const check = process.argv.includes('--check'), root = fileURLToPath(new URL('./', import.meta.url));
let directory;
for (const relative of ['../keeper/public/', '../public/']) {
  try { const value = new URL(relative, import.meta.url); if ((await stat(value)).isDirectory()) { directory = value; break; } }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
}
if (!directory) throw Error('Build in crypto-vendor or an extracted crypto-source folder.');
const result = await build({ absWorkingDir: root, entryPoints: ['scrypt-wallet-entry.mjs'], bundle: true,
  write: false, platform: 'browser', format: 'esm', target: 'es2022', minify: false, legalComments: 'inline', charset: 'utf8', metafile: true,
  banner: { js: '// Generated from pinned crypto-vendor/package-lock.json. See scrypt-wallet-crypto-notices.txt.\n// Pure RIPEMD160 primitive; no storage, wallet or network code.' } });
const bytes = result.outputFiles[0].contents;
if (/\b(?:fetch|XMLHttpRequest|WebSocket)\s*\(/.test(new TextDecoder().decode(bytes))) throw Error('Network code is not permitted.');
const names = [...new Set(Object.values(result.metafile.outputs).flatMap(output => Object.entries(output.inputs).filter(([, info]) => info.bytesInOutput > 0).map(([name]) => name)))].sort();
if (names.some(name => name !== 'scrypt-wallet-entry.mjs' && !name.startsWith('node_modules/@noble/hashes/'))) throw Error('Unexpected hash dependency.');
const files = {};
async function source(name) { const contents = (await readFile(new URL(name, import.meta.url), 'utf8')).replace(/\r\n/g, '\n'); files[name] = { sha256: createHash('sha256').update(contents).digest('hex'), contents }; }
for (const name of ['scrypt-wallet-entry.mjs', 'build-scrypt-wallet.mjs', 'SCRYPT-WALLET.md', 'package.json', 'package-lock.json', 'node_modules/@noble/hashes/package.json', 'node_modules/@noble/hashes/LICENSE']) await source(name);
for (const name of names) { await source(name); if (name.includes('/esm/')) await source(name.replace('/esm/', '/src/').replace(/\.js$/, '.ts')); }
const meta = JSON.parse(await readFile(new URL('node_modules/@noble/hashes/package.json', import.meta.url), 'utf8'));
if (meta.version !== '1.3.2') throw Error('Unexpected pinned hash version.');
const notices = 'Doodleverse native wallet hash primitive\n\n@noble/hashes 1.3.2\nhttps://github.com/paulmillr/noble-hashes\n\n' + files['node_modules/@noble/hashes/LICENSE'].contents.trim() + '\n';
const sourceText = JSON.stringify({ format: 'doodleverse-wallet-hash-source-v1', build: { entry: 'scrypt-wallet-entry.mjs', esbuild: '0.28.2', target: 'es2022' }, versions: { '@noble/hashes': meta.version }, inputs: names, files: Object.fromEntries(Object.entries(files).sort(([a],[b]) => a < b ? -1 : a > b ? 1 : 0)) }, null, 2) + '\n';
for (const [url, contents] of [[new URL('scrypt-wallet-crypto.mjs', directory), bytes], [new URL('scrypt-wallet-crypto-notices.txt', directory), notices], [new URL('scrypt-wallet-source-inputs.json', import.meta.url), sourceText]]) {
  if (check) { if (!Buffer.from(await readFile(url)).equals(Buffer.from(contents))) throw Error('Native wallet hash bundle or source is stale.'); }
  else await writeFile(url, contents);
}
console.log(JSON.stringify({ mode: check ? 'check' : 'build', bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') }));
