// SPDX-License-Identifier: GPL-3.0-only
// Native DVC consensus. Pure public-data transforms: no network, storage, wallet,
// secret keys, automatic mining or Ethereum transaction methods.
import {getAddress, verifyTypedData, Signature, sha256, toUtf8Bytes} from './recipient-crypto.mjs';

export const MAIN_NETWORK_NAME = 'doodleverse-native-1';
export const TRANSFER_FORMAT = 'doodleverse-native-transfer-v1';
export const BLOCK_FORMAT = 'doodleverse-native-block-v1';
export const GENESIS_FORMAT = 'doodleverse-native-genesis-v1';
export const ALGORITHMS = Object.freeze(['sha256', 'sha256d']);
export const MAX_BLOCK_BYTES = 65536;
const U64 = (1n << 64n) - 1n, U256 = (1n << 256n) - 1n, SPACE = 1n << 256n;
const HASH = /^[0-9a-f]{64}$/, DECIMAL = /^(0|[1-9][0-9]{0,77})$/;
const hex256 = value => value.toString(16).padStart(64, '0');
export const DVC_RULES = Object.freeze({
  symbol: 'DVC', decimals: 8, founderAddress: '0x41ed762a78bf3bb6007770bda259d40bbeca2d93',
  founderAtoms: '100000000000000', miningReserveAtoms: '2000000000000000', maxSupplyAtoms: '2100000000000000',
  minFeeAtoms: '1000', maxExpiryBlocks: '1440', maxTransactions: 64, maxBlockBytes: MAX_BLOCK_BYTES,
  targetSeconds: 60, retargetInterval: 32, retargetClamp: 4, mtpWindow: 11, futureSeconds: 120, coinbaseMaturity: 6,
  initialRewardAtoms: '5000000000', halvingInterval: 210000,
  initialBaseTarget: hex256((1n << 236n) - 1n), maxBaseTarget: hex256((1n << 240n) - 1n),
  powNormalization: 'sha256d-target=floor((baseTarget+1)*3/2)-1;work=floor(2^256/(baseTarget+1))',
});
const RULE_KEYS = ['minFeeAtoms','maxExpiryBlocks','maxTransactions','maxBlockBytes','targetSeconds','retargetInterval','retargetClamp','mtpWindow','futureSeconds','coinbaseMaturity','initialRewardAtoms','halvingInterval','initialBaseTarget','maxBaseTarget','powNormalization'];
const GENESIS_KEYS = ['format','networkName','timestamp','founderAddress','founderAtoms','miningReserveAtoms','maxSupplyAtoms','decimals','symbol','sourceProofId','recipientProofId','rules','hash','networkId'];
const TEST_KEYS = ['founderAddress','timestamp','initialBaseTarget','maxBaseTarget','initialRewardAtoms','halvingInterval','retargetInterval'];
const TRANSFER_KEYS = ['format','networkId','sender','recipient','amountAtoms','feeAtoms','nonce','validUntilHeight'];
const HEADER_KEYS = ['format','networkId','height','parent','timestamp','miner','algorithm','baseTarget','transactionRoot'];
const BLOCK_KEYS = [...HEADER_KEYS, 'nonce','digest','transactions'];
const DOMAIN_TYPES = Object.freeze([{name:'name',type:'string'},{name:'version',type:'string'},{name:'salt',type:'bytes32'}]);
const TRANSFER_TYPES = Object.freeze([
  {name:'networkId',type:'string'}, {name:'sender',type:'address'}, {name:'recipient',type:'address'},
  {name:'amountAtoms',type:'uint256'}, {name:'feeAtoms',type:'uint256'}, {name:'nonce',type:'uint64'}, {name:'validUntilHeight',type:'uint64'},
]);
const knownGeneses = new WeakSet(), verifiedStates = new WeakSet();

function fail(message) { throw new Error(message); }
function plain(value) { return value && typeof value === 'object' && !Array.isArray(value) && [Object.prototype, null].includes(Object.getPrototypeOf(value)); }
function keys(value, expected, label) {
  if (!plain(value)) fail(`Invalid ${label}.`);
  const names = Reflect.ownKeys(value);
  if (names.length !== expected.length || !expected.every(name => names.includes(name))) fail(`Unexpected fields in ${label}.`);
  for (const name of names) { const d = Object.getOwnPropertyDescriptor(value, name); if (!d?.enumerable || !Object.hasOwn(d, 'value')) fail(`Invalid property in ${label}.`); }
}
function array(value, max, label) {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype || value.length > max || Reflect.ownKeys(value).length !== value.length + 1) fail(`Invalid ${label}.`);
  for (let i = 0; i < value.length; i++) { const d = Object.getOwnPropertyDescriptor(value, String(i)); if (!d?.enumerable || !Object.hasOwn(d, 'value')) fail(`Invalid item in ${label}.`); }
}
function uint(value, label, max = U256, positive = false) {
  if (typeof value !== 'string' || !DECIMAL.test(value) || BigInt(value) > max || (positive && value === '0')) fail(`Invalid ${label}. Use a canonical whole-number string.`);
  return BigInt(value);
}
function hash(value, label = 'hash') { if (typeof value !== 'string' || !HASH.test(value)) fail(`Invalid ${label}.`); return value; }
function seconds(value, label = 'timestamp') { if (!Number.isSafeInteger(value) || value < 0 || value > 8640000000000) fail(`Invalid ${label}.`); return value; }
function clock(now) { if (!Number.isSafeInteger(now) || now < 0 || now > 8640000000000000) fail('An explicit valid current time in milliseconds is required.'); return Math.floor(now / 1000); }
export function normalizeAddress(value) {
  if (typeof value !== 'string' || !/^0x[0-9a-fA-F]{40}$/.test(value)) fail('Use a full nonzero wallet address.');
  let normalized; try { normalized = getAddress(value).toLowerCase(); } catch { fail('The wallet address checksum is invalid.'); }
  if (normalized === '0x' + '0'.repeat(40)) fail('The wallet address must not be zero.');
  return normalized;
}
function canonicalAddress(value) { if (normalizeAddress(value) !== value) fail('Use a canonical lowercase wallet address.'); return value; }
function freeze(value) { if (value && typeof value === 'object' && !Object.isFrozen(value)) { for (const child of Object.values(value)) freeze(child); Object.freeze(value); } return value; }
export function canonical(value) {
  let nodes = 0;
  function encode(item, depth) {
    if (++nodes > 20000 || depth > 32) fail('Public data is too complex.');
    if (item === null || typeof item === 'boolean' || typeof item === 'string') return JSON.stringify(item);
    if (typeof item === 'number') { if (!Number.isSafeInteger(item) || item < 0 || Object.is(item, -0)) fail('Public numbers must be nonnegative safe integers.'); return String(item); }
    if (Array.isArray(item)) { array(item, 10000, 'public array'); return '[' + item.map(child => encode(child, depth + 1)).join(',') + ']'; }
    if (!plain(item)) fail('Only plain public JSON is supported.');
    const names = Reflect.ownKeys(item);
    if (names.some(name => typeof name !== 'string')) fail('Public JSON keys must be strings.');
    keys(item, names, 'public object');
    return '{' + names.sort().map(name => JSON.stringify(name) + ':' + encode(item[name], depth + 1)).join(',') + '}';
  }
  return encode(value, 0);
}
export function hashCanonical(value) { return sha256(toUtf8Bytes(canonical(value))).slice(2); }
function copy(value, limit = MAX_BLOCK_BYTES) { const text = canonical(value); if (toUtf8Bytes(text).length > limit) fail('Public data exceeds its byte limit.'); return JSON.parse(text); }
export function parseStrictJSON(text, {maxBytes = MAX_BLOCK_BYTES} = {}) {
  if (!Number.isInteger(maxBytes) || maxBytes < 1 || maxBytes > 1048576 || typeof text !== 'string' || toUtf8Bytes(text).length > maxBytes) fail('Public JSON exceeds its byte limit.');
  let parsed; try { parsed = JSON.parse(text); } catch { fail('Invalid public JSON.'); }
  let at = 0, nodes = 0;
  const space = () => { while (/[\t\n\r ]/.test(text[at] ?? '\0')) at++; };
  const string = () => { const start = at++; while (at < text.length) { const c = text[at++]; if (c === '\\') at++; else if (c === '"') return JSON.parse(text.slice(start, at)); } fail('Invalid JSON string.'); };
  function walk(depth = 0) {
    if (++nodes > 20000 || depth > 32) fail('Public JSON is too complex.'); space();
    if (text[at] === '"') { string(); return; }
    if (text[at] === '{') { at++; space(); const seen = new Set(); if (text[at] === '}') { at++; return; } do { space(); const key = string(); if (seen.has(key)) fail('Duplicate JSON key.'); seen.add(key); space(); at++; walk(depth + 1); space(); if (text[at++] === '}') return; } while (at < text.length); }
    else if (text[at] === '[') { at++; space(); if (text[at] === ']') { at++; return; } do { walk(depth + 1); space(); if (text[at++] === ']') return; } while (at < text.length); }
    else { const start = at; while (at < text.length && !/[\t\n\r ,\]}]/.test(text[at])) at++; if (at > start) return; }
    fail('Invalid public JSON structure.');
  }
  walk(); space(); if (at !== text.length) fail('Trailing public JSON data.'); return parsed;
}

export function genesis(networkName = MAIN_NETWORK_NAME, testOptions = {}) {
  if (typeof networkName !== 'string' || !(networkName === MAIN_NETWORK_NAME || /^doodleverse-regtest-[a-z0-9-]{1,48}$/.test(networkName))) fail('Unsupported native network name.');
  if (!plain(testOptions)) fail('Invalid test genesis options.');
  const supplied = Reflect.ownKeys(testOptions); keys(testOptions, supplied, 'test genesis options');
  if (supplied.some(key => !TEST_KEYS.includes(key)) || (networkName === MAIN_NETWORK_NAME && supplied.length)) fail('Production genesis rules are immutable.');
  const rules = Object.fromEntries(RULE_KEYS.map(key => [key, DVC_RULES[key]]));
  for (const key of TEST_KEYS) if (Object.hasOwn(testOptions, key) && key in rules) rules[key] = testOptions[key];
  for (const key of ['retargetInterval','halvingInterval']) if (!Number.isSafeInteger(rules[key]) || rules[key] < 2 || rules[key] > 1000000) fail('Invalid test consensus interval.');
  if (rules.retargetInterval > 2016) fail('Retarget history exceeds its bound.');
  const initial = BigInt('0x' + hash(rules.initialBaseTarget, 'initial target')), maximum = BigInt('0x' + hash(rules.maxBaseTarget, 'maximum target'));
  if (initial < 1n || initial > maximum || maximum > (SPACE * 2n / 3n) - 1n) fail('Invalid target bounds.');
  uint(rules.initialRewardAtoms, 'initial reward', BigInt(DVC_RULES.miningReserveAtoms), true);
  const manifest = {format: GENESIS_FORMAT, networkName, timestamp: seconds(testOptions.timestamp ?? 1794816000),
    founderAddress: normalizeAddress(testOptions.founderAddress ?? DVC_RULES.founderAddress), founderAtoms: DVC_RULES.founderAtoms,
    miningReserveAtoms: DVC_RULES.miningReserveAtoms, maxSupplyAtoms: DVC_RULES.maxSupplyAtoms, decimals: DVC_RULES.decimals, symbol: DVC_RULES.symbol,
    sourceProofId: '15b4e76b46e47d853fa24a1d1215fe73a5742e0299a97431bc544c843c43714b',
    recipientProofId: '7854967cea894f6c4f7f4a0d559c1aa0c96055c324bd86a7bab5c6a5c41f8d56', rules};
  const id = hashCanonical(manifest), result = freeze({...manifest, hash: id, networkId: id}); knownGeneses.add(result); return result;
}
export const MAIN_GENESIS = genesis();
export const MAIN_NETWORK_ID = MAIN_GENESIS.networkId;
export function validateGenesis(value = MAIN_GENESIS) {
  if (knownGeneses.has(value)) return value;
  const given = copy(value, 16384); keys(given, GENESIS_KEYS, 'genesis'); keys(given.rules, RULE_KEYS, 'genesis rules');
  const options = given.networkName === MAIN_NETWORK_NAME ? {} : {founderAddress: given.founderAddress, timestamp: given.timestamp,
    ...Object.fromEntries(TEST_KEYS.filter(key => key in given.rules).map(key => [key, given.rules[key]]))};
  const expected = genesis(given.networkName, options);
  if (canonical(given) !== canonical(expected)) fail('Genesis does not match its immutable manifest and network hash.');
  return expected;
}

function draftChecked(value, g, signed = false) {
  keys(value, signed ? [...TRANSFER_KEYS, 'signature'] : TRANSFER_KEYS, 'native transfer');
  if (value.format !== TRANSFER_FORMAT || value.networkId !== g.networkId) fail('Native transfer belongs to a different network or format.');
  canonicalAddress(value.sender); canonicalAddress(value.recipient);
  uint(value.amountAtoms, 'transfer amount', BigInt(g.maxSupplyAtoms), true);
  if (uint(value.feeAtoms, 'transfer fee', BigInt(g.maxSupplyAtoms)) < BigInt(g.rules.minFeeAtoms)) fail('Transfer fee is below the native minimum.');
  if (BigInt(value.amountAtoms) + BigInt(value.feeAtoms) > BigInt(g.maxSupplyAtoms)) fail('Transfer amount and fee exceed the supply.');
  uint(value.nonce, 'transfer nonce', U64); uint(value.validUntilHeight, 'transfer expiry', U64, true);
}
export function createTransferDraft(fields, {genesis: supplied = MAIN_GENESIS} = {}) {
  const g = validateGenesis(supplied);
  keys(fields, Object.hasOwn(fields ?? {}, 'feeAtoms') ? ['sender','recipient','amountAtoms','feeAtoms','nonce','validUntilHeight'] : ['sender','recipient','amountAtoms','nonce','validUntilHeight'], 'transfer draft input');
  const result = {format: TRANSFER_FORMAT, networkId: g.networkId, sender: normalizeAddress(fields.sender), recipient: normalizeAddress(fields.recipient), amountAtoms: fields.amountAtoms, feeAtoms: fields.feeAtoms ?? g.rules.minFeeAtoms, nonce: fields.nonce, validUntilHeight: fields.validUntilHeight};
  draftChecked(result, g); return freeze(result);
}
export function transferTypedData(value, {genesis: supplied = MAIN_GENESIS} = {}) {
  const g = validateGenesis(supplied), draft = copy(value, 2048); draftChecked(draft, g);
  const message = Object.fromEntries(TRANSFER_TYPES.map(field => [field.name, draft[field.name]]));
  return freeze({domain: {name: 'Doodleverse Native Coin', version: '1', salt: '0x' + g.hash},
    types: {EIP712Domain: DOMAIN_TYPES.map(item => ({...item})), DoodleverseTransfer: TRANSFER_TYPES.map(item => ({...item}))}, primaryType: 'DoodleverseTransfer', message});
}
export function verifyTransfer(value, {genesis: supplied = MAIN_GENESIS, height} = {}) {
  const g = validateGenesis(supplied), transfer = copy(value, 2048); draftChecked(transfer, g, true);
  if (typeof transfer.signature !== 'string' || !/^0x[0-9a-f]{130}$/.test(transfer.signature)) fail('Native transfers require a canonical 65-byte EOA signature.');
  const {signature, ...draft} = transfer, typed = transferTypedData(draft, {genesis: g});
  let recovered;
  try { if (Signature.from(signature).serialized !== signature) fail('Noncanonical signature.'); recovered = verifyTypedData(typed.domain, {DoodleverseTransfer: typed.types.DoodleverseTransfer}, typed.message, signature).toLowerCase(); }
  catch { fail('The native transfer signature is invalid.'); }
  if (recovered !== transfer.sender) fail('Native transfer signature does not match its sender.');
  if (height !== undefined) {
    const at = uint(height, 'inclusion height', U64, true), expiry = BigInt(transfer.validUntilHeight);
    if (expiry < at) fail('Native transfer has expired.');
    if (expiry > at + BigInt(g.rules.maxExpiryBlocks)) fail('Native transfer expiry is too far ahead of inclusion.');
  }
  return freeze({valid: true, id: hashCanonical(transfer), sender: transfer.sender, recipient: transfer.recipient, amountAtoms: transfer.amountAtoms, feeAtoms: transfer.feeAtoms, nonce: transfer.nonce, validUntilHeight: transfer.validUntilHeight});
}
export function attachTransferSignature(draft, signature, options = {}) {
  const g = validateGenesis(options.genesis ?? MAIN_GENESIS), value = copy(draft, 2048); draftChecked(value, g);
  // Never normalize a malleable signature into a different transaction ID silently.
  const result = {...value, signature}; verifyTransfer(result, {genesis: g}); return freeze(result);
}

export function transactionRoot(transactions) {
  array(transactions, DVC_RULES.maxTransactions, 'block transfers');
  return hashCanonical({format: 'doodleverse-native-transfer-list-v1', count: transactions.length, transactions});
}
function headerChecked(header) {
  keys(header, HEADER_KEYS, 'block header');
  if (header.format !== BLOCK_FORMAT || !ALGORITHMS.includes(header.algorithm)) fail('Unsupported native block format or algorithm.');
  hash(header.networkId, 'network ID'); uint(header.height, 'block height', U64, true); hash(header.parent, 'parent'); seconds(header.timestamp);
  canonicalAddress(header.miner); hash(header.baseTarget, 'base target'); hash(header.transactionRoot, 'transfer root');
  if (BigInt('0x' + header.baseTarget) < 1n) fail('Base target must be positive.');
  effectiveTarget(header.baseTarget, header.algorithm);
}
export function workPrefix(value) {
  const data = copy(value); keys(data, Object.hasOwn(data, 'transactions') ? BLOCK_KEYS : HEADER_KEYS, 'work header or block');
  const header = Object.fromEntries(HEADER_KEYS.map(key => [key, data[key]])); headerChecked(header); return hashCanonical(header);
}
export function effectiveTarget(baseTarget, algorithm) {
  const base = BigInt('0x' + hash(baseTarget, 'base target'));
  if (base < 1n || !ALGORITHMS.includes(algorithm)) fail('Invalid work algorithm or base target.');
  const target = algorithm === 'sha256d' ? (base + 1n) * 3n / 2n - 1n : base;
  if (target > U256) fail('Effective target exceeds 256 bits.'); return hex256(target);
}
export function workDigest(prefixHex, nonce, algorithm = 'sha256') {
  hash(prefixHex, 'work prefix'); const value = uint(nonce, 'work nonce');
  if (!ALGORITHMS.includes(algorithm)) fail('Unsupported work algorithm.');
  const first = sha256('0x' + prefixHex + hex256(value));
  return (algorithm === 'sha256d' ? sha256(first) : first).slice(2);
}
export function blockWork(baseTarget) { const target = BigInt('0x' + hash(baseTarget, 'base target')); if (target < 1n) fail('Invalid base target.'); return SPACE / (target + 1n); }
function stateChecked(state) { if (!verifiedStates.has(state)) fail('Replay the chain to obtain a verified state.'); return state; }
function finishState(state) { freeze(state); verifiedStates.add(state); return state; }
function initialState(g) {
  return finishState({genesis: g, networkId: g.networkId, height: '0', tipHash: g.hash, timestamp: g.timestamp, chainWork: '0', issuedAtoms: g.founderAtoms, minedAtoms: '0',
    accounts: {[g.founderAddress]: {balanceAtoms: g.founderAtoms, nonce: '0'}}, pendingCoinbases: [],
    history: [{height: '0', timestamp: g.timestamp, baseTarget: g.rules.initialBaseTarget, digest: g.hash}]});
}
function median(headers) { const times = headers.map(header => header.timestamp).sort((a,b) => a - b); return times[Math.floor(times.length / 2)]; }
export function medianTimePast(state) { stateChecked(state); return median(state.history.slice(-state.genesis.rules.mtpWindow)); }
export function nextBaseTarget(state) {
  stateChecked(state); const g = state.genesis, last = state.history.at(-1), height = BigInt(state.height);
  if (height === 0n) return g.rules.initialBaseTarget;
  if (height % BigInt(g.rules.retargetInterval) !== 0n) return last.baseTarget;
  const ancestorHeight = (height - BigInt(g.rules.retargetInterval)).toString(), index = state.history.findIndex(h => h.height === ancestorHeight);
  if (index < 0) fail('Retarget history is incomplete.');
  // First retarget uses the available genesis MTP window; later windows contain11 timestamps each.
  const start = median(state.history.slice(Math.max(0, index - g.rules.mtpWindow + 1), index + 1)), end = medianTimePast(state);
  const expected = g.rules.retargetInterval * g.rules.targetSeconds;
  const elapsed = Math.max(Math.floor(expected / g.rules.retargetClamp), Math.min(expected * g.rules.retargetClamp, end - start));
  let result = BigInt('0x' + last.baseTarget) * BigInt(elapsed) / BigInt(expected);
  if (result < 1n) result = 1n; const maximum = BigInt('0x' + g.rules.maxBaseTarget); if (result > maximum) result = maximum;
  return hex256(result);
}
export function blockSubsidy(height, minedAtoms, supplied = MAIN_GENESIS) {
  const g = validateGenesis(supplied), h = uint(height, 'reward height', U64, true), mined = uint(minedAtoms, 'mined supply', BigInt(g.miningReserveAtoms));
  const eras = (h - 1n) / BigInt(g.rules.halvingInterval), scheduled = eras >= 256n ? 0n : BigInt(g.rules.initialRewardAtoms) >> eras;
  const left = BigInt(g.miningReserveAtoms) - mined; return (scheduled < left ? scheduled : left).toString();
}
function applyTransfers(state, transfers, height) {
  const g = state.genesis, accounts = Object.fromEntries(Object.entries(state.accounts).map(([address, account]) => [address, {...account}]));
  const pending = [];
  const account = address => accounts[address] ??= {balanceAtoms: '0', nonce: '0'};
  for (const reward of state.pendingCoinbases) {
    if (BigInt(reward.maturesAtHeight) <= BigInt(height)) { const target = account(reward.miner); target.balanceAtoms = (BigInt(target.balanceAtoms) + BigInt(reward.amountAtoms)).toString(); }
    else pending.push(reward);
  }
  let fees = 0n; const ids = new Set();
  for (const transfer of transfers) {
    const checked = verifyTransfer(transfer, {genesis: g, height});
    if (ids.has(checked.id)) fail('Duplicate native transfer in block.'); ids.add(checked.id);
    const sender = account(checked.sender), recipient = account(checked.recipient), cost = BigInt(checked.amountAtoms) + BigInt(checked.feeAtoms);
    if (checked.nonce !== sender.nonce) fail('Native transfer nonce is stale or has a gap.');
    if (cost > BigInt(sender.balanceAtoms)) fail('Native transfer exceeds the spendable balance.');
    sender.balanceAtoms = (BigInt(sender.balanceAtoms) - cost).toString(); sender.nonce = (BigInt(sender.nonce) + 1n).toString();
    recipient.balanceAtoms = (BigInt(recipient.balanceAtoms) + BigInt(checked.amountAtoms)).toString(); fees += BigInt(checked.feeAtoms);
  }
  return {accounts, pending, fees};
}
export function validateTransfer(transfer, state, {height = (BigInt(stateChecked(state).height) + 1n).toString()} = {}) {
  stateChecked(state); if (height !== (BigInt(state.height) + 1n).toString()) fail('Pending transfers are checked at the next block height.');
  applyTransfers(state, [transfer], height); return verifyTransfer(transfer, {genesis: state.genesis, height});
}
export function validatePendingTransfers(transfers, state) {
  stateChecked(state); array(transfers, state.genesis.rules.maxTransactions, 'pending transfers');
  const height = (BigInt(state.height) + 1n).toString(), projected = applyTransfers(state, [], height).accounts, checked = [], reservedAtoms = {}, ids = new Set();
  for (const transfer of transfers) {
    const result = verifyTransfer(transfer, {genesis: state.genesis, height});
    if (ids.has(result.id)) fail('Duplicate pending native transfer.'); ids.add(result.id);
    const account = projected[result.sender] ??= {balanceAtoms: '0', nonce: '0'}, cost = BigInt(result.amountAtoms) + BigInt(result.feeAtoms);
    if (account.nonce !== result.nonce) fail('Pending native transfer nonce is stale or has a gap.');
    if (cost > BigInt(account.balanceAtoms)) fail('Pending transfers exceed confirmed spendable funds.');
    account.balanceAtoms = (BigInt(account.balanceAtoms) - cost).toString(); account.nonce = (BigInt(account.nonce) + 1n).toString();
    reservedAtoms[result.sender] = (BigInt(reservedAtoms[result.sender] ?? '0') + cost).toString(); checked.push(result);
    // Incoming pending payments (including self-payments) never fund another
    // mempool transfer. Confirmed block execution separately permits tx ordering.
  }
  return freeze({height, transfers: checked, accounts: projected, reservedAtoms});
}
function checkHeaderContext(header, state, now) {
  headerChecked(header); const g = state.genesis;
  if (header.networkId !== g.networkId || header.parent !== state.tipHash || header.height !== (BigInt(state.height) + 1n).toString()) fail('Block does not extend this native chain.');
  if (header.timestamp < g.timestamp || header.timestamp <= medianTimePast(state)) fail('Block timestamp does not exceed median past time.');
  if (header.timestamp > clock(now) + g.rules.futureSeconds) fail('Block timestamp is too far in the future; it may be reconsidered later.');
  if (clock(now) < g.timestamp) fail('Native network has not reached its genesis launch time.');
  if (header.baseTarget !== nextBaseTarget(state)) fail('Block target does not match consensus difficulty.');
}
export function createMiningJob(state, {miner, algorithm = 'sha256', transactions = [], timestamp, now} = {}) {
  stateChecked(state); array(transactions, state.genesis.rules.maxTransactions, 'block transfers');
  const transfers = copy(transactions), height = (BigInt(state.height) + 1n).toString();
  const header = {format: BLOCK_FORMAT, networkId: state.networkId, height, parent: state.tipHash,
    timestamp: timestamp ?? Math.max(clock(now), medianTimePast(state) + 1), miner: normalizeAddress(miner), algorithm,
    baseTarget: nextBaseTarget(state), transactionRoot: transactionRoot(transfers)};
  checkHeaderContext(header, state, now); const applied = applyTransfers(state, transfers, height);
  const job = {header, transactions: transfers, prefixHex: workPrefix(header), targetHex: effectiveTarget(header.baseTarget, algorithm), rewardAtoms: blockSubsidy(height, state.minedAtoms, state.genesis), feesAtoms: applied.fees.toString()};
  if (toUtf8Bytes(canonical({...header, nonce: U256.toString(), digest: '0'.repeat(64), transactions: transfers})).length > state.genesis.rules.maxBlockBytes) fail('Mining block exceeds its byte limit.');
  return freeze(job);
}
export function finalizeBlock(job, nonce) {
  keys(job, ['header','transactions','prefixHex','targetHex','rewardAtoms','feesAtoms'], 'mining job'); headerChecked(job.header);
  if (job.prefixHex !== workPrefix(job.header) || job.targetHex !== effectiveTarget(job.header.baseTarget, job.header.algorithm) || job.header.transactionRoot !== transactionRoot(job.transactions)) fail('Mining job was altered.');
  return freeze({...copy(job.header), nonce, digest: workDigest(job.prefixHex, nonce, job.header.algorithm), transactions: copy(job.transactions)});
}
export function validateBlock(value, state, {now} = {}) {
  stateChecked(state); const block = copy(value, state.genesis.rules.maxBlockBytes); keys(block, BLOCK_KEYS, 'native block');
  array(block.transactions, state.genesis.rules.maxTransactions, 'block transfers'); uint(block.nonce, 'work nonce'); hash(block.digest, 'work digest');
  const header = Object.fromEntries(HEADER_KEYS.map(key => [key, block[key]])); checkHeaderContext(header, state, now);
  if (block.transactionRoot !== transactionRoot(block.transactions)) fail('Block transfer root does not match its contents.');
  const digest = workDigest(workPrefix(header), block.nonce, block.algorithm);
  if (block.digest !== digest || BigInt('0x' + digest) > BigInt('0x' + effectiveTarget(block.baseTarget, block.algorithm))) fail('Native proof of work is invalid.');
  const applied = applyTransfers(state, block.transactions, block.height), subsidy = BigInt(blockSubsidy(block.height, state.minedAtoms, state.genesis));
  const mined = BigInt(state.minedAtoms) + subsidy, issued = BigInt(state.issuedAtoms) + subsidy;
  if (mined > BigInt(state.genesis.miningReserveAtoms) || issued > BigInt(state.genesis.maxSupplyAtoms)) fail('Native supply cap exceeded.');
  const reward = subsidy + applied.fees;
  if (reward) applied.pending.push({height: block.height, maturesAtHeight: (BigInt(block.height) + BigInt(state.genesis.rules.coinbaseMaturity)).toString(), miner: block.miner, amountAtoms: reward.toString()});
  const history = [...state.history, {height: block.height, timestamp: block.timestamp, baseTarget: block.baseTarget, digest}].slice(-(state.genesis.rules.retargetInterval + state.genesis.rules.mtpWindow));
  return finishState({genesis: state.genesis, networkId: state.networkId, height: block.height, tipHash: digest, timestamp: block.timestamp,
    chainWork: (BigInt(state.chainWork) + blockWork(block.baseTarget)).toString(), issuedAtoms: issued.toString(), minedAtoms: mined.toString(), accounts: applied.accounts, pendingCoinbases: applied.pending, history});
}
export function validateChain(blocks, {genesis: supplied = MAIN_GENESIS, now} = {}) {
  const g = validateGenesis(supplied); clock(now); array(blocks, 1000000, 'chain block list');
  let state = initialState(g); for (const block of blocks) state = validateBlock(block, state, {now}); return state;
}
export function chainWork(state) { return BigInt(stateChecked(state).chainWork); }
export function chooseBetterChain(a, b) {
  stateChecked(a); stateChecked(b); if (a.networkId !== b.networkId) fail('Cannot compare different native networks.');
  const aw = chainWork(a), bw = chainWork(b);
  // Keep the current chain on equal work; only strictly more work triggers a reorg.
  return bw > aw ? b : a;
}
export function accountView(state, address) {
  stateChecked(state); const key = normalizeAddress(address), account = state.accounts[key] ?? {balanceAtoms: '0', nonce: '0'};
  const immature = state.pendingCoinbases.filter(item => item.miner === key).reduce((sum, item) => sum + BigInt(item.amountAtoms), 0n);
  return freeze({address: key, balanceAtoms: account.balanceAtoms, spendableAtoms: account.balanceAtoms, immatureAtoms: immature.toString(), totalAtoms: (BigInt(account.balanceAtoms) + immature).toString(), nonce: account.nonce, nextNonce: account.nonce});
}
