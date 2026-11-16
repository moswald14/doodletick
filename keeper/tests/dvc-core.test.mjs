// SPDX-License-Identifier: GPL-3.0-only
// Disposable public fixture keys, real hashes and signatures, isolated regtest genesis.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {SigningKey, computeAddress, TypedDataEncoder} from '../public/recipient-crypto.mjs';
import {MAIN_GENESIS, MAIN_NETWORK_NAME, MAIN_NETWORK_ID, DVC_RULES, genesis, validateGenesis, canonical, hashCanonical, parseStrictJSON,
  createTransferDraft, transferTypedData, attachTransferSignature, verifyTransfer, validateTransfer, validatePendingTransfers,
  transactionRoot, workPrefix, effectiveTarget, workDigest, blockWork, medianTimePast, nextBaseTarget, blockSubsidy,
  createMiningJob, finalizeBlock, validateBlock, validateChain, chainWork, chooseBetterChain, accountView} from '../public/dvc-core.mjs';

const aliceKey = new SigningKey('0x' + '1'.repeat(64)), bobKey = new SigningKey('0x' + '2'.repeat(64)), minerKey = new SigningKey('0x' + '3'.repeat(64));
const alice = computeAddress(aliceKey.publicKey).toLowerCase(), bob = computeAddress(bobKey.publicKey).toLowerCase(), miner = computeAddress(minerKey.publicKey).toLowerCase();
const TARGET = ((1n << 252n) - 1n).toString(16).padStart(64, '0'), MAX_TARGET = ((1n << 254n) - 1n).toString(16).padStart(64, '0');
const START = 1794816000, NOW = (START + 1000000) * 1000;
const clone = value => JSON.parse(JSON.stringify(value));
function fixture(name = 'unit', overrides = {}) {
  const g = genesis('doodleverse-regtest-' + name, {founderAddress: alice, initialBaseTarget: TARGET, maxBaseTarget: MAX_TARGET, ...overrides});
  return {g, state: validateChain([], {genesis: g, now: NOW}), blocks: []};
}
function transfer(f, fields = {}, key = aliceKey) {
  const draft = createTransferDraft({sender: alice, recipient: bob, amountAtoms: '2000', feeAtoms: '1000', nonce: '0', validUntilHeight: '100', ...fields}, {genesis: f.g});
  const typed = transferTypedData(draft, {genesis: f.g});
  const signature = key.sign(TypedDataEncoder.hash(typed.domain, {DoodleverseTransfer: typed.types.DoodleverseTransfer}, typed.message)).serialized;
  return attachTransferSignature(draft, signature, {genesis: f.g});
}
function solve(job) {
  for (let nonce = 0n; nonce < 1000000n; nonce++) {
    const digest = workDigest(job.prefixHex, nonce.toString(), job.header.algorithm);
    if (BigInt('0x' + digest) <= BigInt('0x' + job.targetHex)) return finalizeBlock(job, nonce.toString());
  }
  throw Error('Real regtest work search exhausted its fixture bound.');
}
function append(f, options = {}) {
  const timestamp = START + (Number(f.state.height) + 1) * 60;
  const job = createMiningJob(f.state, {miner, timestamp, now: NOW, ...options}), block = solve(job);
  f.state = validateBlock(block, f.state, {now: NOW}); f.blocks.push(block); return block;
}
function total(state) { return Object.values(state.accounts).reduce((sum, account) => sum + BigInt(account.balanceAtoms), 0n) + state.pendingCoinbases.reduce((sum, reward) => sum + BigInt(reward.amountAtoms), 0n); }

test('production genesis is immutable, content-addressed and distinct from all test configurations', () => {
  assert.equal(MAIN_GENESIS.timestamp, START); assert.equal(MAIN_GENESIS.networkId, MAIN_GENESIS.hash); assert.equal(MAIN_NETWORK_ID, MAIN_GENESIS.hash);
  const {hash, networkId, ...manifest} = MAIN_GENESIS; assert.equal(hash, hashCanonical(manifest));
  assert.equal(MAIN_GENESIS.rules.initialBaseTarget, ((1n << 236n) - 1n).toString(16).padStart(64, '0'));
  assert.equal(MAIN_GENESIS.rules.maxBaseTarget, ((1n << 240n) - 1n).toString(16).padStart(64, '0'));
  assert.equal(MAIN_GENESIS.maxSupplyAtoms, '2100000000000000'); assert.equal(MAIN_GENESIS.founderAtoms, '100000000000000');
  assert.equal(MAIN_GENESIS.miningReserveAtoms, '2000000000000000'); assert.equal(MAIN_GENESIS.founderAddress, DVC_RULES.founderAddress);
  assert.throws(() => genesis(MAIN_NETWORK_NAME, {initialBaseTarget: TARGET}), /immutable/);
  assert.throws(() => genesis('another-mainnet', {}));
  const f = fixture(); assert.notEqual(f.g.hash, MAIN_NETWORK_ID); assert.deepEqual(validateGenesis(clone(f.g)), f.g);
  const corrupt = clone(MAIN_GENESIS); corrupt.founderAddress = alice; assert.throws(() => validateGenesis(corrupt), /immutable manifest/);
  assert.equal(Object.isFrozen(MAIN_GENESIS.rules), true);
});

test('strict serialization rejects duplicates, unsafe numbers, extra accessors and ambiguous arrays', () => {
  assert.equal(canonical({b: '2', a: 1}), '{"a":1,"b":"2"}');
  for (const raw of ['{"a":1,"a":2}', '{"a":1,"\\u0061":2}', '{', '[] trailing']) assert.throws(() => parseStrictJSON(raw));
  assert.throws(() => parseStrictJSON(' '.repeat(65537))); assert.throws(() => parseStrictJSON('['.repeat(34) + '0' + ']'.repeat(34)), /complex/);
  for (const value of [NaN, 1.5, -0, 9007199254740992, [,,], {amount: 1n}]) assert.throws(() => canonical(value));
  let touched = false; const object = {}; Object.defineProperty(object, 'x', {enumerable: true, get() {touched = true; return 1;}});
  assert.throws(() => canonical(object)); assert.equal(touched, false);
  const inherited = []; Object.setPrototypeOf(inherited, {map() {touched = true; return [];}});
  assert.throws(() => canonical(inherited)); assert.equal(touched, false);
});

test('native EIP712 transfer names the native network and has no Ethereum spending domain', () => {
  const f = fixture(), signed = transfer(f), {signature, ...draft} = signed, typed = transferTypedData(draft, {genesis: f.g});
  assert.deepEqual(typed.domain, {name: 'Doodleverse Native Coin', version: '1', salt: '0x' + f.g.hash});
  assert.equal(typed.message.networkId, f.g.hash); assert.equal(typed.types.DoodleverseTransfer.length, 7);
  const checked = verifyTransfer(signed, {genesis: f.g, height: '1'}); assert.equal(checked.sender, alice); assert.equal(checked.id, hashCanonical(signed));
  assert.equal(validateTransfer(signed, f.state).valid, true);
  const changed = clone(signed); changed.recipient = miner; assert.throws(() => verifyTransfer(changed, {genesis: f.g}), /signature/);
  assert.throws(() => verifyTransfer(signed, {genesis: fixture('other').g}), /different network/);
  const replay = clone(signed); replay.networkId = fixture('other').g.hash; assert.throws(() => verifyTransfer(replay, {genesis: fixture('other').g}), /signature/);
  assert.throws(() => attachTransferSignature(draft, signature.toUpperCase(), {genesis: f.g}), /canonical/);
});

test('amounts, fees, nonces and expiry are canonical, bounded and enforced at inclusion', () => {
  const f = fixture();
  for (const change of [{amountAtoms:'0'},{amountAtoms:'01'},{amountAtoms:2},{feeAtoms:'999'},{nonce:(1n<<64n).toString()},{nonce:'-1'},{validUntilHeight:'0'},{recipient:'0x'+'0'.repeat(40)}]) assert.throws(() => transfer(f, change));
  assert.equal(verifyTransfer(transfer(f, {validUntilHeight:'1'}), {genesis:f.g,height:'1'}).valid,true);
  assert.throws(() => verifyTransfer(transfer(f, {validUntilHeight:'1'}), {genesis:f.g,height:'2'}), /expired/);
  assert.throws(() => verifyTransfer(transfer(f, {validUntilHeight:'1442'}), {genesis:f.g,height:'1'}), /too far/);
  assert.equal(verifyTransfer(transfer(f, {validUntilHeight:'1441'}), {genesis:f.g,height:'1'}).valid,true);
});

test('SHA256 and genuine SHA256d work agree with independent Node crypto over64exactbytes', () => {
  const prefix = 'ab'.repeat(32), nonce = ((1n << 200n) + 12345n).toString(), bytes = Buffer.from(prefix + BigInt(nonce).toString(16).padStart(64,'0'), 'hex');
  const first = createHash('sha256').update(bytes).digest(), second = createHash('sha256').update(first).digest('hex');
  assert.equal(bytes.length,64); assert.equal(workDigest(prefix,nonce,'sha256'),first.toString('hex')); assert.equal(workDigest(prefix,nonce,'sha256d'),second);
  assert.notEqual(first.toString('hex'),second);
  assert.equal(BigInt('0x'+effectiveTarget(TARGET,'sha256d')), (BigInt('0x'+TARGET)+1n)*3n/2n-1n);
  assert.throws(() => effectiveTarget('f'.repeat(64),'sha256d'), /exceeds/);
});

test('both algorithms produce real valid blocks with identical normalized credited work', () => {
  const a = fixture('algorithms'), b = fixture('algorithms');
  const ba = append(a,{algorithm:'sha256'}), bb = append(b,{algorithm:'sha256d'});
  assert.notEqual(ba.digest,bb.digest); assert.equal(chainWork(a.state),chainWork(b.state)); assert.equal(chainWork(a.state),blockWork(TARGET));
  assert.equal(a.state.tipHash,ba.digest); assert.equal(workPrefix(ba),workPrefix(Object.fromEntries(Object.entries(ba).filter(([key]) => !['nonce','digest','transactions'].includes(key)))));
  assert.equal(total(a.state),BigInt(a.state.issuedAtoms));
});

test('headers bind network, parent, miner, time, algorithm, target and transaction order', () => {
  const f = fixture('headers'), before=f.state, block=append(f);
  for (const change of [{networkId: MAIN_NETWORK_ID},{parent:'0'.repeat(64)},{miner:bob},{timestamp:block.timestamp+1},{algorithm:'sha256d'},{baseTarget:MAX_TARGET},{transactionRoot:'0'.repeat(64)},{nonce:(BigInt(block.nonce)+1n).toString()},{digest:'0'.repeat(64)},{extra:'field'}]) {
    assert.throws(() => validateBlock({...block,...change},before,{now:NOW}));
  }
  assert.notEqual(transactionRoot([transfer(f)]),transactionRoot([]));
  assert.throws(() => validateBlock(block,clone(before),{now:NOW}), /Replay/);
  assert.throws(() => {before.accounts[alice].balanceAtoms='0';},TypeError);
});

test('founder funds are spendable, fees go to immature miner rewards, and issued supply excludes fees', () => {
  const f=fixture('payments'), before=f.state; append(f,{transactions:[transfer(f)]});
  assert.equal(accountView(before,alice).balanceAtoms,f.g.founderAtoms);
  assert.equal(accountView(f.state,alice).balanceAtoms,(BigInt(f.g.founderAtoms)-3000n).toString());
  assert.equal(accountView(f.state,alice).nextNonce,'1'); assert.equal(accountView(f.state,bob).balanceAtoms,'2000');
  assert.equal(accountView(f.state,miner).balanceAtoms,'0'); assert.equal(accountView(f.state,miner).immatureAtoms,'5000001000');
  assert.equal(f.state.minedAtoms,'5000000000'); assert.equal(total(f.state),BigInt(f.state.issuedAtoms));
  assert.throws(() => createMiningJob(f.state,{miner,now:NOW,transactions:[transfer(f)]}),/nonce/);
});

test('nonce gaps, double spends and amount plus fee overdraws are rejected without mutating the parent', () => {
  const f=fixture('overspend'), state=f.state;
  assert.throws(() => validateTransfer(transfer(f,{nonce:'1'}),state),/nonce/);
  assert.throws(() => validateTransfer(transfer(f,{amountAtoms:f.g.founderAtoms}),state),/balance/);
  const first=transfer(f,{amountAtoms:(BigInt(f.g.founderAtoms)-2000n).toString()}), second=transfer(f,{nonce:'1',amountAtoms:'1'});
  assert.throws(() => createMiningJob(state,{miner,now:NOW,transactions:[first,second]}),/balance/);
  assert.throws(() => createMiningJob(state,{miner,now:NOW,transactions:[first,first]}),/Duplicate/);
  assert.equal(state.accounts[alice].balanceAtoms,f.g.founderAtoms); assert.equal(state.accounts[alice].nonce,'0');
});

test('pending projection reserves outgoing funds and never spends incoming unconfirmed funds', () => {
  const f=fixture('pending'), incoming=transfer(f,{amountAtoms:'5000'}), outgoing=transfer(f,{sender:bob,recipient:miner,amountAtoms:'2000'},bobKey);
  assert.throws(() => validatePendingTransfers([incoming,outgoing],f.state),/confirmed spendable/);
  const projected=validatePendingTransfers([incoming,transfer(f,{nonce:'1'})],f.state);
  assert.equal(projected.reservedAtoms[alice],'9000'); assert.equal(projected.accounts[alice].nonce,'2'); assert.equal(projected.accounts[bob],undefined);
  append(f,{transactions:[incoming,outgoing]}); assert.equal(accountView(f.state,bob).balanceAtoms,'2000');
  assert.equal(accountView(f.state,miner).balanceAtoms,'2000');
});

test('coinbase at height1 is first spendable in block7, including its fee credit', () => {
  const f=fixture('maturity'); append(f,{transactions:[transfer(f)]});
  while(BigInt(f.state.height)<5n) append(f);
  const spend=transfer(f,{sender:miner,recipient:bob,amountAtoms:'5000000000',nonce:'0'},minerKey);
  assert.throws(() => validateTransfer(spend,f.state),/balance/);
  append(f); assert.equal(f.state.height,'6'); assert.equal(accountView(f.state,miner).spendableAtoms,'0');
  assert.equal(validateTransfer(spend,f.state).valid,true); append(f,{transactions:[spend]});
  assert.equal(f.state.height,'7'); assert.equal(accountView(f.state,miner).balanceAtoms,'0'); assert.equal(accountView(f.state,bob).balanceAtoms,'5000002000');
  assert.equal(total(f.state),BigInt(f.state.issuedAtoms));
});

test('halving boundaries and final truncation preserve the21million lifetime cap', () => {
  const half=fixture('halving',{halvingInterval:2}); append(half); append(half); assert.equal(half.state.minedAtoms,'10000000000'); append(half); assert.equal(half.state.minedAtoms,'12500000000');
  assert.equal(blockSubsidy('1',(BigInt(half.g.miningReserveAtoms)-7n).toString(),half.g),'7');
  const cap=fixture('cap',{initialRewardAtoms:DVC_RULES.miningReserveAtoms}); append(cap); assert.equal(cap.state.issuedAtoms,DVC_RULES.maxSupplyAtoms); assert.equal(cap.state.minedAtoms,DVC_RULES.miningReserveAtoms);
  append(cap); assert.equal(cap.state.issuedAtoms,DVC_RULES.maxSupplyAtoms); assert.equal(cap.state.pendingCoinbases.length,1); assert.equal(total(cap.state),BigInt(DVC_RULES.maxSupplyAtoms));
  assert.equal(blockSubsidy('1',DVC_RULES.miningReserveAtoms,cap.g),'0');
});

test('median timestamps, future bounds and genesis launch boundary are independently checked', () => {
  const f=fixture('time'); assert.equal(medianTimePast(f.state),START);
  assert.throws(() => createMiningJob(f.state,{miner,timestamp:START,now:NOW}),/median/);
  assert.throws(() => createMiningJob(f.state,{miner,timestamp:START+121,now:START*1000}),/future/);
  assert.throws(() => createMiningJob(f.state,{miner,timestamp:START+1,now:(START-1)*1000}),/launch/);
  for(let i=1;i<=11;i++) append(f,{timestamp:START+i}); assert.equal(medianTimePast(f.state),START+6);
  assert.throws(() => createMiningJob(f.state,{miner,timestamp:START+6,now:NOW}),/median/);
  const block=append(f,{timestamp:START+7}); assert.equal(block.timestamp,START+7,'strict parent timestamp increase is not required; MTP is');
});

test('retarget is based on the declared32block MTP windows, clamps4x and is bounded by pow limit', () => {
  const fast=fixture('retarget-fast');
  for(let i=1;i<=32;i++) append(fast,{timestamp:START+i});
  assert.equal(nextBaseTarget(fast.state),(BigInt('0x'+TARGET)/4n).toString(16).padStart(64,'0'));
  const block=append(fast,{timestamp:START+33}); assert.equal(block.baseTarget,(BigInt('0x'+TARGET)/4n).toString(16).padStart(64,'0'));
  const slow=fixture('retarget-slow'); for(let i=1;i<=32;i++) append(slow,{timestamp:START+i*400});
  const next=nextBaseTarget(slow.state); assert.equal(next,(BigInt('0x'+TARGET)*4n).toString(16).padStart(64,'0'));
  for(let i=33;i<=64;i++) append(slow,{timestamp:START+i*400}); assert.equal(nextBaseTarget(slow.state),MAX_TARGET);
  assert.equal(slow.state.history.length,43);
});

test('strictly greater cumulative work wins even at lower height; equal work keeps current', () => {
  const slow=fixture('forkwork',{retargetInterval:2}), fast=fixture('forkwork',{retargetInterval:2});
  for(let i=1;i<=4;i++) append(slow,{timestamp:START+i*600});
  for(let i=1;i<=3;i++) append(fast,{timestamp:START+i});
  assert(BigInt(slow.state.height)>BigInt(fast.state.height)); assert(chainWork(fast.state)>chainWork(slow.state));
  assert.equal(chooseBetterChain(slow.state,fast.state),fast.state);
  const a=fixture('tie'),b=fixture('tie'); append(a,{miner});append(b,{miner:bob}); assert.equal(chainWork(a.state),chainWork(b.state)); assert.equal(chooseBetterChain(a.state,b.state),a.state);
  assert.throws(() => chooseBetterChain(a.state,fast.state),/different/);
});

test('replay from a different valid branch restores balances/nonces/maturity exactly', () => {
  const paid=fixture('reorg'),alternative=fixture('reorg'); append(paid,{transactions:[transfer(paid)]}); append(alternative);append(alternative);
  const adopted=chooseBetterChain(paid.state,alternative.state); assert.equal(adopted,alternative.state);
  assert.equal(accountView(adopted,bob).balanceAtoms,'0'); assert.equal(accountView(adopted,alice).nonce,'0');
  assert.equal(accountView(paid.state,bob).balanceAtoms,'2000');
  const restored=validateChain(parseStrictJSON(JSON.stringify(alternative.blocks)),{genesis:clone(alternative.g),now:NOW});
  assert.equal(canonical(restored),canonical(adopted)); assert.equal(total(restored),BigInt(restored.issuedAtoms));
});

test('block count and byte limits reject overload before signatures or work are trusted', () => {
  const f=fixture('bounds'); assert.throws(() => createMiningJob(f.state,{miner,now:NOW,transactions:Array(65).fill(transfer(f))}),/transfers/);
  const block=append(f), parent=validateChain([],{genesis:f.g,now:NOW});
  assert.throws(() => validateBlock({...block,padding:'x'.repeat(65536)},parent,{now:NOW}),/byte limit/);
  assert.throws(() => validateBlock({...block,transactions:[{...transfer(f),privateKey:'not-a-key'}]},parent,{now:NOW}));
});
