// SPDX-License-Identifier: GPL-3.0-only
// Native UTXO wallet operations. Private keys never leave the calling browser.
import { SigningKey, sha256, toUtf8Bytes } from './recipient-crypto.mjs';
import { ripemd160 } from './scrypt-wallet-crypto.mjs';
import { parseStrictJSON } from './dvc-core.mjs';

export const WALLET_NETWORKS = Object.freeze({
  main: Object.freeze({ prefix: 31, wifPrefix: 159, genesis: '0307d627595365a02cbcfd7c2614be41b1f38989ac550f5499343226f1d2d9bb' }),
  test: Object.freeze({ prefix: 65, wifPrefix: 193, genesis: '99e61f98fedac138dfb311d88779023b60aa9601f87d1c35d94e9a837f75ce05' }),
  regtest: Object.freeze({ prefix: 112, wifPrefix: 240, genesis: 'e410039c6dc7111cf8b680962a2fc7fdafec5878f96dce4e79043d754417a44e' }),
});
export const MAX_ATOMS = 21000000n * 100000000n;
export const FEE_ATOMS_PER_BYTE = 1000n, MIN_OUTPUT_ATOMS = 1000000n, MAX_FEE_ATOMS = 100000000n;
export const WALLET_KDF_ITERATIONS = 600000;
const FORMAT = 'doodleverse-scrypt-wallet-v1', BASE58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
const CURVE_ORDER = BigInt('0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141');
const fail = message => { throw new Error(message); };
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
const keys = (value, names) => object(value) && Object.keys(value).sort().join(',') === names.split(',').sort().join(',');
function networkInfo(network) { if (!Object.hasOwn(WALLET_NETWORKS, network)) fail('Choose a supported Doodleverse network.'); return WALLET_NETWORKS[network]; }
export function hex(bytes) { return Array.from(bytes, value => value.toString(16).padStart(2, '0')).join(''); }
export function unhex(value, length) { if (typeof value !== 'string' || value.length % 2 || !/^[0-9a-f]*$/.test(value) || (length !== undefined && value.length !== length * 2)) fail('Invalid byte encoding.'); return Uint8Array.from(value.match(/../g) || [], value => parseInt(value, 16)); }
const join = (...parts) => { const result = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0)); let at = 0; for (const part of parts) { result.set(part, at); at += part.length; } return result; };
const digest = bytes => unhex(sha256(bytes).slice(2), 32);
const doubleDigest = bytes => digest(digest(bytes));
function equal(a, b) { if (a.length !== b.length) return false; let difference = 0; for (let i = 0; i < a.length; i++) difference |= a[i] ^ b[i]; return difference === 0; }
function atomValue(value, label = 'amount') { if (typeof value !== 'string' || !/^(0|[1-9][0-9]{0,15})$/.test(value)) fail('Invalid ' + label + '.'); const result = BigInt(value); if (result > MAX_ATOMS) fail('Invalid ' + label + '.'); return result; }
export function parseCoins(value) {
  if (typeof value !== 'string' || !/^(0|[1-9][0-9]{0,7})(?:\.[0-9]{1,8})?$/.test(value)) fail('Enter a DVC amount with at most eight decimal places.');
  const [whole, fraction = ''] = value.split('.'), result = BigInt(whole) * 100000000n + BigInt(fraction.padEnd(8, '0'));
  if (result > MAX_ATOMS) fail('The amount exceeds the DVC supply.'); return result;
}
export function formatAtoms(value) { const amount = typeof value === 'bigint' ? value : atomValue(value); if (amount < 0n || amount > MAX_ATOMS) fail('Invalid amount.'); return `${amount / 100000000n}.${(amount % 100000000n).toString().padStart(8, '0')}`; }
function encodeBase58(bytes) { let number = BigInt('0x' + hex(bytes)), result = ''; while (number) { result = BASE58[Number(number % 58n)] + result; number /= 58n; } for (const byte of bytes) { if (byte) break; result = '1' + result; } return result; }
function base58Text(value, minimum, maximum) {
  return typeof value === 'string' && value.length >= minimum && value.length <= maximum &&
    [...value].every(character => BASE58.includes(character));
}
function encodeBase58Check(payload) {
  const bytes = join(payload, doubleDigest(payload).subarray(0, 4));
  try { return encodeBase58(bytes); }
  finally { bytes.fill(0); }
}
function decodeBase58Check(value, payloadLength) {
  let number = 0n; for (const character of value) number = number * 58n + BigInt(BASE58.indexOf(character));
  let text = number.toString(16); if (text.length % 2) text = '0' + text;
  const zeroes = value.match(/^1*/)[0].length;
  const bytes = number === 0n ? new Uint8Array() : unhex(text);
  const decoded = join(new Uint8Array(zeroes), bytes);
  bytes.fill(0);
  try {
    const payload = decoded.subarray(0, payloadLength);
    if (decoded.length !== payloadLength + 4 || encodeBase58(decoded) !== value ||
        !equal(decoded.subarray(payloadLength), doubleDigest(payload).subarray(0, 4))) return null;
    return payload.slice();
  } finally { decoded.fill(0); }
}
export function addressScript(address, network) {
  if (!base58Text(address, 26, 35)) fail('Enter a native Doodleverse receiving address.');
  const payload = decodeBase58Check(address, 21);
  if (!payload) fail('The receiving address checksum is incorrect.');
  if (payload[0] !== networkInfo(network).prefix) fail('The receiving address belongs to another network.');
  return '76a914' + hex(payload.subarray(1)) + '88ac';
}
export function publicKeyAddress(publicKey, network) {
  const key = unhex(publicKey, 33); if (![2, 3].includes(key[0])) fail('A compressed public key is required.');
  try { if (SigningKey.computePublicKey('0x' + publicKey, true).slice(2) !== publicKey) fail('Invalid public key.'); } catch { fail('Invalid public key.'); }
  const payload = join(Uint8Array.of(networkInfo(network).prefix), ripemd160(digest(key)));
  return encodeBase58Check(payload);
}
export function privateKeyIdentity(secret, network) {
  if (!(secret instanceof Uint8Array) || secret.length !== 32) fail('Invalid native wallet key.');
  let publicKey; try { publicKey = new SigningKey(secret).compressedPublicKey.slice(2); } catch { fail('Invalid native wallet key.'); }
  return { network, genesis: networkInfo(network).genesis, address: publicKeyAddress(publicKey, network), publicKey };
}
export function generatePrivateKey() {
  if (!globalThis.crypto?.getRandomValues) fail('A secure browser is required to create a wallet.');
  for (let attempt = 0; attempt < 100; attempt++) {
    const key = crypto.getRandomValues(new Uint8Array(32));
    const scalar = BigInt('0x' + hex(key));
    if (scalar > 0n && scalar < CURVE_ORDER) return key;
    key.fill(0);
  }
  fail('The browser could not create a secure wallet.');
}
export function privateKeyToWif(secret, network) {
  privateKeyIdentity(secret, network);
  const payload = join(Uint8Array.of(networkInfo(network).wifPrefix), secret, Uint8Array.of(1));
  try { return encodeBase58Check(payload); }
  finally { payload.fill(0); }
}
export function privateKeyFromWif(wif, network) {
  const prefix = networkInfo(network).wifPrefix;
  const value = typeof wif === 'string' ? wif.trim() : '';
  if (!base58Text(value, 52, 52)) fail('Enter the 52-character private key from the paper wallet.');
  const payload = decodeBase58Check(value, 34);
  if (!payload) fail('The private key checksum is incorrect.');
  try {
    if (payload[0] !== prefix) fail('The private key belongs to another network.');
    if (payload[33] !== 1) fail('The private key must use the compressed wallet format.');
    const secret = payload.slice(1, 33);
    try { privateKeyIdentity(secret, network); return secret; }
    catch (error) { secret.fill(0); throw error; }
  } finally { payload.fill(0); }
}
function passwordBytes(password) { if (typeof password !== 'string' || [...password].length < 12 || toUtf8Bytes(password).length > 1024) fail('Use a password of at least 12 characters, up to 1024 UTF-8 bytes.'); return toUtf8Bytes(password); }
function aad(record) { return toUtf8Bytes(JSON.stringify({ format: record.format, version: record.version, network: record.network, genesis: record.genesis, address: record.address, publicKey: record.publicKey, kdf: { name: record.kdf.name, hash: record.kdf.hash, iterations: record.kdf.iterations, salt: record.kdf.salt }, cipher: { name: record.cipher.name, iv: record.cipher.iv } })); }
async function encryptionKey(password, salt, usage) {
  const bytes = passwordBytes(password);
  try { const material = await crypto.subtle.importKey('raw', bytes, 'PBKDF2', false, ['deriveKey']); return await crypto.subtle.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: WALLET_KDF_ITERATIONS }, material, { name: 'AES-GCM', length: 256 }, false, [usage]); }
  finally { bytes.fill(0); }
}
export function validateEncryptedWallet(value, expectedNetwork) {
  const record = typeof value === 'string' ? parseStrictJSON(value, { maxBytes: 4096 }) : value;
  if (!keys(record, 'format,version,network,genesis,address,publicKey,kdf,cipher') || record.format !== FORMAT || record.version !== 1) fail('This is not a supported native DVC wallet backup.');
  const info = networkInfo(record.network); if (record.genesis !== info.genesis || (expectedNetwork && expectedNetwork !== record.network)) fail('The wallet backup belongs to another network.');
  if (record.address !== publicKeyAddress(record.publicKey, record.network)) fail('The wallet backup identity is incorrect.');
  if (!keys(record.kdf, 'name,hash,iterations,salt') || record.kdf.name !== 'PBKDF2' || record.kdf.hash !== 'SHA-256' || record.kdf.iterations !== WALLET_KDF_ITERATIONS) fail('The wallet backup uses unsupported password protection.');
  if (!keys(record.cipher, 'name,iv,data') || record.cipher.name !== 'AES-GCM') fail('The wallet backup uses unsupported encryption.');
  unhex(record.kdf.salt, 16); unhex(record.cipher.iv, 12); unhex(record.cipher.data, 48);
  // Return a detached canonical object so prototypes, extra properties and caller mutations cannot enter storage.
  return JSON.parse(JSON.stringify(record));
}
export async function encryptWallet(secret, network, password) {
  if (!globalThis.crypto?.subtle) fail('HTTPS or localhost is required to protect a wallet.');
  passwordBytes(password).fill(0);
  const identity = privateKeyIdentity(secret, network), salt = crypto.getRandomValues(new Uint8Array(16)), iv = crypto.getRandomValues(new Uint8Array(12));
  const record = { format: FORMAT, version: 1, ...identity, kdf: { name: 'PBKDF2', hash: 'SHA-256', iterations: WALLET_KDF_ITERATIONS, salt: hex(salt) }, cipher: { name: 'AES-GCM', iv: hex(iv), data: '' } };
  const key = await encryptionKey(password, salt, 'encrypt');
  record.cipher.data = hex(new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: aad(record), tagLength: 128 }, key, secret)));
  return validateEncryptedWallet(record, network);
}
export async function decryptWallet(value, password, expectedNetwork) {
  if (!globalThis.crypto?.subtle) fail('HTTPS or localhost is required to unlock a wallet.');
  const record = validateEncryptedWallet(value, expectedNetwork); let secret;
  try {
    const key = await encryptionKey(password, unhex(record.kdf.salt, 16), 'decrypt');
    secret = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unhex(record.cipher.iv, 12), additionalData: aad(record), tagLength: 128 }, key, unhex(record.cipher.data, 48)));
    const identity = privateKeyIdentity(secret, record.network);
    if (identity.publicKey !== record.publicKey || identity.address !== record.address) fail('Invalid key.');
    return secret;
  } catch { secret?.fill(0); fail('Password or encrypted wallet backup is incorrect.'); }
}

// An untrusted node must not be able to understate a previous output and turn
// undisclosed input value into a miner fee. Authenticate the full previous
// transaction against its outpoint before trusting any amount or script.
function previousTransaction(rawTransaction, txid) {
  // With SegWit disabled, no transaction can exceed the consensus 1 MB base
  // block size. Counts and scripts below are bounded by those serialized bytes,
  // not by smaller ad-hoc limits that would strand otherwise valid rewards.
  if (typeof rawTransaction !== 'string' || rawTransaction.length < 120 || rawTransaction.length > 2000000 || rawTransaction.length % 2 || !/^[0-9a-f]+$/.test(rawTransaction) || !/^[0-9a-f]{64}$/.test(txid || '')) fail('The previous transaction is missing or exceeds wallet limits.');
  const bytes = unhex(rawTransaction); if (hex(doubleDigest(bytes).reverse()) !== txid) fail('The previous transaction does not match its output identifier.');
  let offset = 0;
  function take(count) { if (!Number.isSafeInteger(count) || count < 0 || offset + count > bytes.length) fail('The previous transaction is truncated.'); const result = bytes.slice(offset, offset + count); offset += count; return result; }
  const number = count => { let result = 0n; const value = take(count); for (let i = count - 1; i >= 0; i--) result = result * 256n + BigInt(value[i]); return result; };
  function compact(maximum) { const first = take(1)[0]; let value = first; if (first === 253) { value = Number(number(2)); if (value < 253) fail('The previous transaction has a noncanonical length.'); } else if (first === 254) { value = Number(number(4)); if (value <= 65535) fail('The previous transaction has a noncanonical length.'); } else if (first === 255) fail('The previous transaction is too large.'); if (value > maximum) fail('The previous transaction is too large.'); return value; }
  const version = number(4); if (version !== 1n && version !== 2n) fail('This wallet cannot spend this transaction version.');
  const inputCount = compact(Math.floor(bytes.length / 41)); if (!inputCount) fail('This wallet requires a legacy native transaction.');
  let coinbase = false;
  for (let index = 0; index < inputCount; index++) { const previous = take(32), position = number(4); if (inputCount === 1 && previous.every(byte => byte === 0) && position === 0xffffffffn) coinbase = true; take(compact(bytes.length)); take(4); }
  const outputCount = compact(Math.floor(bytes.length / 9)); if (!outputCount) fail('The previous transaction has no outputs.');
  const outputs = []; let total = 0n;
  for (let index = 0; index < outputCount; index++) { const amount = number(8), script = take(compact(bytes.length)); total += amount; if (amount > MAX_ATOMS || total > MAX_ATOMS) fail('The previous transaction contains an invalid amount.'); outputs.push(Object.freeze({ valueAtoms: amount.toString(), scriptPubKey: hex(script), coinbase })); }
  take(4); if (offset !== bytes.length) fail('The previous transaction has trailing data.');
  return Object.freeze(outputs);
}
export function verifyPreviousOutput(rawTransaction, txid, vout) {
  if (!Number.isSafeInteger(vout) || vout < 0 || vout > 0xffffffff) fail('The previous output does not exist.');
  const outputs = previousTransaction(rawTransaction, txid); if (!outputs[vout]) fail('The previous output does not exist.'); return outputs[vout];
}

export function validateWalletBalance(value, address, network) {
  const info = networkInfo(network), script = addressScript(address, network);
  if (!object(value) || value.network !== network || value.genesis !== info.genesis || value.address !== address || value.syncing !== false) fail('The node has not synchronized this wallet on the selected network.');
  if (!Number.isSafeInteger(value.height) || value.height < 0 || !/^[0-9a-f]{64}$/.test(value.tip || '') || !Array.isArray(value.utxos) || value.utxos.length > 2000) fail('The node returned invalid wallet data.');
  const confirmed = atomValue(value.confirmedAtoms, 'confirmed balance'), immature = atomValue(value.immatureAtoms, 'immature balance');
  if (confirmed + immature > MAX_ATOMS) fail('The node returned an invalid balance.');
  if (!object(value.transactions) || Object.keys(value.transactions).length > 2000) fail('Authenticated previous transactions are required.');
  let rawSize = 0;
  for (const [txid, raw] of Object.entries(value.transactions)) { if (!/^[0-9a-f]{64}$/.test(txid) || typeof raw !== 'string' || (rawSize += raw.length) > 4194304) fail('Previous transactions exceed the wallet response limit.'); }
  const seen = new Set(), previousTransactions = new Map(); let total = 0n;
  const utxos = value.utxos.map(input => {
    if (!object(input) || !/^[0-9a-f]{64}$/.test(input.txid || '') || !Number.isSafeInteger(input.vout) || input.vout < 0 || input.vout > 0xffffffff || input.scriptPubKey !== script || !Number.isSafeInteger(input.confirmations) || input.confirmations < 1 || typeof input.coinbase !== 'boolean' || (input.coinbase && input.confirmations < 30)) fail('The node returned an invalid or immature spendable output.');
    const id = input.txid + ':' + input.vout; if (seen.has(id)) fail('The node returned a duplicate output.'); seen.add(id);
    const amount = atomValue(input.valueAtoms, 'output amount'); if (!amount) fail('The node returned an empty output.'); total += amount;
    if (!previousTransactions.has(input.txid)) previousTransactions.set(input.txid, previousTransaction(value.transactions[input.txid], input.txid));
    const previous = previousTransactions.get(input.txid)[input.vout];
    if (!previous) fail('The previous output does not exist.');
    if (previous.valueAtoms !== input.valueAtoms || previous.scriptPubKey !== script || previous.coinbase !== input.coinbase) fail('The node output does not match its authenticated previous transaction.');
    return Object.freeze({ txid: input.txid, vout: input.vout, valueAtoms: amount.toString(), scriptPubKey: script, confirmations: input.confirmations, coinbase: input.coinbase });
  });
  if (total !== confirmed) fail('The node balance does not match its spendable outputs.');
  if (previousTransactions.size !== Object.keys(value.transactions).length) fail('The node returned unrelated previous transactions.');
  return Object.freeze({ network, genesis: info.genesis, height: value.height, tip: value.tip, address, confirmedAtoms: confirmed.toString(), immatureAtoms: immature.toString(), utxos: Object.freeze(utxos), transactions: Object.freeze({ ...value.transactions }), syncing: false });
}
const plans = new WeakSet();
export function createTransactionPlan({ network, address, recipient, amount, balance }) {
  const checked = validateWalletBalance(balance, address, network), recipientScript = addressScript(recipient, network), amountAtoms = parseCoins(amount);
  if (recipient === address) fail('Choose a different recipient address.');
  if (amountAtoms < MIN_OUTPUT_ATOMS) fail('The minimum payment is 0.01 DVC.');
  const available = [...checked.utxos].sort((a,b) => BigInt(a.valueAtoms) > BigInt(b.valueAtoms) ? -1 : BigInt(a.valueAtoms) < BigInt(b.valueAtoms) ? 1 : a.txid.localeCompare(b.txid) || a.vout - b.vout);
  const inputs = []; let total = 0n, fee = 0n, change = 0n, ready = false;
  for (const input of available) {
    if (inputs.length >= 100) break;
    inputs.push(input); total += BigInt(input.valueAtoms);
    const twoOutputFee = BigInt(10 + 148 * inputs.length + 68) * FEE_ATOMS_PER_BYTE;
    const oneOutputFee = BigInt(10 + 148 * inputs.length + 34) * FEE_ATOMS_PER_BYTE;
    if (total >= amountAtoms + twoOutputFee + MIN_OUTPUT_ATOMS) { fee = twoOutputFee; change = total - amountAtoms - fee; ready = true; break; }
    if (total >= amountAtoms + oneOutputFee && total - amountAtoms - twoOutputFee < MIN_OUTPUT_ATOMS) { fee = total - amountAtoms; ready = true; break; }
  }
  if (!ready) fail('There are not enough matured coins for this amount and its network fee.');
  if (fee > MAX_FEE_ATOMS) fail('This payment would exceed the 1 DVC fee limit. Use fewer inputs or a smaller payment.');
  const outputs = [{ address: recipient, valueAtoms: amountAtoms.toString(), scriptPubKey: recipientScript }];
  if (change) outputs.push({ address, valueAtoms: change.toString(), scriptPubKey: addressScript(address, network) });
  const plan = Object.freeze({ network, genesis: networkInfo(network).genesis, address, recipient, amountAtoms: amountAtoms.toString(), feeAtoms: fee.toString(), changeAtoms: change.toString(), totalDebitAtoms: (amountAtoms + fee).toString(), inputAtoms: total.toString(), height: checked.height, tip: checked.tip, inputs: Object.freeze(inputs), outputs: Object.freeze(outputs.map(Object.freeze)), estimatedBytes: 10 + inputs.length * 148 + outputs.length * 34 });
  plans.add(plan); return plan;
}
function little(number, size) { const value = typeof number === 'bigint' ? number : BigInt(number); if (value < 0n || value >= (1n << BigInt(size * 8))) fail('Invalid transaction integer.'); const result = new Uint8Array(size); let rest = value; for (let i = 0; i < size; i++) { result[i] = Number(rest & 255n); rest >>= 8n; } return result; }
function varint(number) { if (!Number.isSafeInteger(number) || number < 0 || number > 65535) fail('Transaction size exceeds limits.'); return number < 253 ? Uint8Array.of(number) : join(Uint8Array.of(253), little(number, 2)); }
function serialize(plan, scripts) {
  return join(little(1, 4), varint(plan.inputs.length), ...plan.inputs.map((input, index) => join(unhex(input.txid, 32).reverse(), little(input.vout, 4), varint(scripts[index].length), scripts[index], little(0xffffffff, 4))), varint(plan.outputs.length), ...plan.outputs.map(output => { const script = unhex(output.scriptPubKey); return join(little(BigInt(output.valueAtoms), 8), varint(script.length), script); }), little(0, 4));
}
function derInteger(value) { let bytes = unhex(value.slice(2), 32); while (bytes.length > 1 && bytes[0] === 0) bytes = bytes.slice(1); if (bytes[0] & 128) bytes = join(Uint8Array.of(0), bytes); return join(Uint8Array.of(2, bytes.length), bytes); }
function derSignature(signature) {
  if (BigInt(signature.s) < 1n || BigInt(signature.s) > CURVE_ORDER / 2n) fail('The signer did not create a low-S signature.');
  const pair = join(derInteger(signature.r), derInteger(signature.s)); return join(Uint8Array.of(0x30, pair.length), pair);
}
export function transactionSigningDigest(plan, inputIndex) {
  if (!plans.has(plan) || !Number.isSafeInteger(inputIndex) || inputIndex < 0 || inputIndex >= plan.inputs.length) fail('Review a fresh payment before signing.');
  return doubleDigest(join(serialize(plan, plan.inputs.map((input, index) => index === inputIndex ? unhex(input.scriptPubKey) : new Uint8Array())), little(1, 4)));
}
export function verifyPlanStillSpendable(plan, balance) {
  if (!plans.has(plan)) fail('Review a fresh payment before signing.');
  const current = validateWalletBalance(balance, plan.address, plan.network), outputs = new Map(current.utxos.map(input => [input.txid + ':' + input.vout, input]));
  for (const input of plan.inputs) { const next = outputs.get(input.txid + ':' + input.vout); if (!next || next.valueAtoms !== input.valueAtoms || next.scriptPubKey !== input.scriptPubKey) fail('Your spendable coins changed. Review this payment again.'); }
  return true;
}
export function signTransactionPlan(plan, secret) {
  if (!plans.has(plan)) fail('Review a fresh payment before signing.');
  const identity = privateKeyIdentity(secret, plan.network); if (identity.address !== plan.address) fail('Unlock the wallet that owns these coins.');
  const signer = new SigningKey(secret), publicKey = unhex(identity.publicKey, 33);
  const scripts = plan.inputs.map((_, index) => { const signature = join(derSignature(signer.sign(transactionSigningDigest(plan, index))), Uint8Array.of(1)); return join(Uint8Array.of(signature.length), signature, Uint8Array.of(publicKey.length), publicKey); });
  const bytes = serialize(plan, scripts), fee = BigInt(plan.feeAtoms);
  if (bytes.length > 32000 || bytes.length > plan.estimatedBytes || fee < BigInt(bytes.length) * FEE_ATOMS_PER_BYTE || fee > MAX_FEE_ATOMS) fail('The signed transaction does not meet the reviewed fee limits.');
  return Object.freeze({ rawTransaction: hex(bytes), expectedTxid: hex(doubleDigest(bytes).reverse()), feeAtoms: plan.feeAtoms, bytes: bytes.length, network: plan.network });
}
function founderClaim(address, publicKey) {
  return { format: 'doodleverse-native-founder-recipient-v1', domain: 'Doodleverse Core native founder enrollment', network: 'main', genesis: WALLET_NETWORKS.main.genesis, address, publicKey, founderAtoms: '100000000000000', maximumSupplyAtoms: MAX_ATOMS.toString(), purpose: 'Approve this native address for the disclosed Doodleverse founder allocation. This is a message, not a transaction.' };
}
export function createFounderRecipientRecord(secret) {
  const identity = privateKeyIdentity(secret, 'main'), claim = founderClaim(identity.address, identity.publicKey);
  if (identity.publicKey === '0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798') fail('The public test key cannot receive the live founder allocation.');
  const hash = sha256(toUtf8Bytes(JSON.stringify(claim))), signature = new SigningKey(secret).sign(hash).serialized;
  return Object.freeze({ ...claim, digest: hash.slice(2), signature });
}
export function verifyFounderRecipientRecord(value) {
  const record = typeof value === 'string' ? parseStrictJSON(value, { maxBytes: 4096 }) : value;
  if (!keys(record, 'format,domain,network,genesis,address,publicKey,founderAtoms,maximumSupplyAtoms,purpose,digest,signature')) fail('Invalid native founder recipient record.');
  const claim = founderClaim(record.address, record.publicKey);
  for (const name of Object.keys(claim)) if (record[name] !== claim[name]) fail('The founder record has different launch parameters.');
  if (record.address !== publicKeyAddress(record.publicKey, 'main') || record.publicKey === '0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798') fail('The founder address is invalid or uses the public test key.');
  const hash = sha256(toUtf8Bytes(JSON.stringify(claim)));
  if (record.digest !== hash.slice(2) || !/^0x[0-9a-f]{128}(1b|1c)$/.test(record.signature || '') || BigInt('0x' + record.signature.slice(66, 130)) > CURVE_ORDER / 2n) fail('Invalid native founder signature.');
  try { if (SigningKey.computePublicKey(SigningKey.recoverPublicKey(hash, record.signature), true).slice(2) !== record.publicKey) fail('Signature mismatch.'); } catch { fail('The founder signature does not match this native wallet.'); }
  return Object.freeze({ verified: true, network: 'main', genesis: claim.genesis, address: record.address, publicKey: record.publicKey, scriptPubKey: addressScript(record.address, 'main'), founderAtoms: claim.founderAtoms, maximumSupplyAtoms: claim.maximumSupplyAtoms });
}
