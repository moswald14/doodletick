// SPDX-License-Identifier: GPL-3.0-only
import { build } from 'esbuild';
import { createHash } from 'node:crypto';
import { readFile, stat, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2);
if (args.length > 1 || (args.length === 1 && args[0] !== '--check')) {
  throw new Error('Use build-paper-wallet.mjs [--check].');
}

let keeper = new URL('../keeper/', import.meta.url);
if (!(await stat(keeper).catch(() => null))?.isDirectory()) keeper = new URL('../', import.meta.url);
const source = new URL('paper-wallet/', keeper);
const publicFile = name => new URL('public/' + name, keeper);
const readText = async url => (await readFile(url, 'utf8')).replace(/\r\n/g, '\n');
const cspHash = text => "'sha256-" + createHash('sha256').update(text).digest('base64') + "'";
const [template, styles, qrSource, walletNotices, keyNotices, license] = await Promise.all([
  readText(new URL('paper-wallet.html', source)),
  readText(new URL('paper-wallet.css', source)),
  readFile(new URL('qrcodegen.ts', source)),
  readText(publicFile('scrypt-wallet-crypto-notices.txt')),
  readText(publicFile('recipient-crypto-notices.txt')),
  readText(new URL('../LICENSE', import.meta.url)),
]);
const qrBlobHash = createHash('sha1').update('blob ' + qrSource.length + '\0').update(qrSource).digest('hex');
if (qrBlobHash !== '4a2d0acce5a24760245d43c1644a4e1993d70834') {
  throw new Error('The pinned Nayuki QR source differs from v1.8.0.');
}
const result = await build({
  absWorkingDir: fileURLToPath(keeper),
  entryPoints: ['paper-wallet/paper-wallet.mjs'],
  bundle: true,
  platform: 'browser',
  target: 'es2022',
  format: 'iife',
  legalComments: 'inline',
  write: false,
  plugins: [{
    name: 'qr-module',
    setup(plugin) {
      plugin.onLoad({ filter: /[/\\]qrcodegen\.ts$/ }, () => ({
        contents: qrSource.toString('utf8') + '\nexport { qrcodegen };\n',
        loader: 'ts',
      }));
    },
  }],
});
const script = result.outputFiles[0].text;
if (/<\/script\b|<!--/i.test(script) || /<\/style\b/i.test(styles) ||
    /\b(?:fetch|XMLHttpRequest|WebSocket|EventSource|sendBeacon)\s*\(/.test(script)) {
  throw new Error('Offline wallet content must be safe to embed and have no network calls.');
}
const policy = [
  "default-src 'none'",
  "connect-src 'none'",
  'script-src ' + cspHash(script),
  'style-src ' + cspHash(styles),
  "base-uri 'none'",
  "form-action 'none'",
].join('; ');
const qrNotice = qrSource.toString('utf8').split('*/')[0].replace(/^\s*\/\*|^\s*\* ?/gm, '').trim();
const notices = [
  'Doodleverse Paper Wallet · GPL-3.0-only',
  'Corresponding source: https://github.com/moswald14/doodletick',
  'Pinned QR source: https://github.com/nayuki/QR-Code-generator/tree/v1.8.0',
  qrNotice, walletNotices, keyNotices, license,
].join('\n\n').replaceAll(/\r\n/g, '\n').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
const values = { POLICY: policy, STYLE: styles, SCRIPT: script, NOTICES: notices };
const html = template.replace(/@@(POLICY|STYLE|SCRIPT|NOTICES)@@/g, (_placeholder, name) => values[name]);
const output = publicFile('scrypt-paper-wallet.html');
if (args[0] === '--check') {
  if (!(await readFile(output)).equals(Buffer.from(html))) throw new Error('Paper wallet is stale. Rebuild it before release.');
} else await writeFile(output, html, 'utf8');
console.log('Offline paper wallet ' + (args.length ? 'verified' : 'built') + ' (' + Buffer.byteLength(html) + ' bytes).');
