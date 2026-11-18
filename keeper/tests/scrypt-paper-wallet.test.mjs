import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import {
  WALLET_NETWORKS, generatePrivateKey, privateKeyFromWif, privateKeyIdentity, privateKeyToWif,
  encryptWallet, decryptWallet,
} from '../public/scrypt-wallet-core.mjs';

const consensus = JSON.parse(await readFile(new URL('../../doodleverse-core/chain-manifest.json', import.meta.url)));
const alphabet = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
const fixture = Uint8Array.from({ length: 32 }, (_, index) => index === 31 ? 1 : 0);
const sha256 = data => createHash('sha256').update(data).digest();

function expectedWif(bytes) {
  const checked = Buffer.concat([bytes, sha256(sha256(bytes)).subarray(0, 4)]);
  // Independent base conversion uses base-58 digits and byte-wise carry.
  const digits = [0];
  for (const byte of checked) {
    let carry = byte;
    for (let index = 0; index < digits.length; index++) {
      carry += digits[index] * 256;
      digits[index] = carry % 58;
      carry = Math.floor(carry / 58);
    }
    while (carry) {
      digits.push(carry % 58);
      carry = Math.floor(carry / 58);
    }
  }
  return digits.reverse().map(digit => alphabet[digit]).join('');
}

test('paper keys use Core compressed WIF and the correct prefix on every DVC network', () => {
  for (const [network, info] of Object.entries(WALLET_NETWORKS)) {
    const prefix = consensus.networks[network].private_key_prefix;
    assert.equal(info.wifPrefix, prefix);
    const encoded = privateKeyToWif(fixture, network);
    assert.equal(encoded.length, 52);
    assert.equal(encoded, expectedWif(Buffer.from([prefix, ...fixture, 1])));
    const restored = privateKeyFromWif(' ' + encoded + ' ', network);
    assert.deepEqual(restored, fixture);
    assert.equal(privateKeyIdentity(restored, network).address, privateKeyIdentity(fixture, network).address);
    restored.fill(0);
  }
});

test('paper key recovery rejects invalid checksums, foreign networks and invalid scalars', () => {
  const encoded = privateKeyToWif(fixture, 'main');
  const changed = encoded.slice(0, -1) + (encoded.endsWith('1') ? '2' : '1');
  assert.throws(() => privateKeyFromWif(changed, 'main'), /checksum/);
  assert.throws(() => privateKeyFromWif(encoded, 'regtest'), /another network/);
  assert.throws(() => privateKeyFromWif(expectedWif(Buffer.from([159, ...fixture, 2])), 'main'), /compressed/);
  const zero = new Uint8Array(32);
  assert.throws(() => privateKeyToWif(zero, 'main'), /Invalid native wallet key/);
  assert.throws(() => privateKeyFromWif(expectedWif(Buffer.from([159, ...zero, 1])), 'main'), /Invalid native wallet key/);
});

test('a recovered paper key yields a restorable encrypted Keeper backup for the same address', async () => {
  const secret = generatePrivateKey();
  const password = 'disposable test password';
  let restored, reopened;
  try {
    const wif = privateKeyToWif(secret, 'regtest');
    restored = privateKeyFromWif(wif, 'regtest');
    const backup = await encryptWallet(restored, 'regtest', password);
    reopened = await decryptWallet(backup, password, 'regtest');
    assert.equal(backup.address, privateKeyIdentity(secret, 'regtest').address);
    assert.equal(JSON.stringify(backup).includes(wif), false);
    assert.deepEqual(reopened, secret);
  } finally {
    secret.fill(0);
    restored?.fill(0);
    reopened?.fill(0);
  }
});

test('the single-file wallet pins both inline payloads and blocks external connections', async () => {
  const html = await readFile(new URL('../public/scrypt-paper-wallet.html', import.meta.url), 'utf8');
  const style = html.match(/<style>([\s\S]+?)<\/style>/)[1];
  const script = html.match(/<script defer type="module">([\s\S]+?)<\/script>/)[1];
  const policy = html.match(/http-equiv="Content-Security-Policy" content="([^"]+)"/)[1];
  assert.ok(policy.includes("default-src 'none'"));
  assert.ok(policy.includes("connect-src 'none'"));
  assert.ok(policy.includes("form-action 'none'"));
  assert.ok(policy.includes("style-src 'sha256-" + sha256(style).toString('base64') + "'"));
  assert.ok(policy.includes("script-src 'sha256-" + sha256(script).toString('base64') + "'"));
  assert.match(script, /location\.protocol === "file:"/);
  assert.doesNotMatch(html.replace(script, '').replace(style, ''), /<(?:link|iframe|img)\s|\bsrc\s*=/i);
});
