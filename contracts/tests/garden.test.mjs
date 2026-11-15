// SPDX-License-Identifier: GPL-3.0-only
// In-memory EVM calls only: no RPC, wallet keys, signatures, or real transactions.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { createVM } from '@ethereumjs/vm';
import { Common, Mainnet, Hardfork, createCustomCommon } from '@ethereumjs/common';
import { createBlock } from '@ethereumjs/block';
import { createAccount, createAddressFromString, hexToBytes, bytesToHex } from '@ethereumjs/util';
import { GARDEN_ARTIFACT as artifact, encode, word, uint, words, recipeList, proofData, proofValid } from '../../keeper/public/public-chain-wallet.mjs';

const ALICE = '0x' + '11'.repeat(20), BOB = '0x' + '22'.repeat(20), CAROL = '0x' + '33'.repeat(20);
const recipe = n => '0x' + word(n);
const stored = JSON.parse(await readFile(new URL('../artifacts/DoodleGarden.json', import.meta.url), 'utf8'));
async function harness(chainId = 1) {
  const common = chainId === 1 ? new Common({ chain: Mainnet, hardfork: Hardfork.Paris }) : createCustomCommon({ chainId }, Mainnet, { hardfork: Hardfork.Paris });
  const vm = await createVM({ common });
  let timestamp = 12 * 3600 + 1200, blockNumber = 1;
  for (const owner of [ALICE, BOB, CAROL]) await vm.stateManager.putAccount(createAddressFromString(owner), createAccount({ balance: 10n ** 24n }));
  const block = () => createBlock({ header: { timestamp: BigInt(timestamp), number: BigInt(blockNumber), gasLimit: 30000000n } }, { common });
  const deploy = async () => {
    const result = await vm.evm.runCall({ caller: createAddressFromString(ALICE), data: hexToBytes(artifact.bytecode), gasLimit: 10000000n, block: block() });
    assert.equal(result.execResult.exceptionError, undefined);
    assert.equal(bytesToHex(await vm.stateManager.getCode(result.createdAddress)), artifact.deployedBytecode);
    return result.createdAddress;
  };
  const target = await deploy();
  const invoke = async (method, args = [], { from = ALICE, to = target, fail = false, nextBlock = true } = {}) => {
    if (nextBlock) blockNumber++;
    const result = await vm.evm.runCall({ caller: createAddressFromString(from), to, data: hexToBytes(encode(method, args)), gasLimit: 10000000n, block: block() });
    if (fail) { assert.ok(result.execResult.exceptionError, `Expected ${method} to revert`); return result; }
    assert.equal(result.execResult.exceptionError, undefined, `${method}: ${result.execResult.exceptionError?.error ?? ''}`);
    return bytesToHex(result.execResult.returnValue);
  };
  const register = async (id, owner = ALICE, to = target) => {
    const commit = await invoke('registrationCommitment(bytes32,address)', [id, owner], { from: owner, to });
    await invoke('reserve(bytes32)', [commit], { from: owner, to });
    await invoke('register(bytes32)', [id], { from: owner, to });
  };
  const storage = async (name, value) => {
    const slot = stored.storageLayout.storage.find(item => item.label === name).slot;
    await vm.stateManager.putStorage(target, hexToBytes('0x' + word(slot)), hexToBytes('0x' + word(value)));
  };
  return { vm, common, target, invoke, register, storage, deploy, setTime(value) { timestamp = value; }, time: () => timestamp };
}
function solve(challenge) {
  for (let nonce = 0n; nonce < 2000000n; nonce++) {
    const digest = createHash('sha256').update(proofData(challenge, nonce)).digest();
    if (digest[0] === 0 && digest[1] === 0) return nonce;
  }
  throw new Error('Fixture proof search exhausted.');
}

test('commitment requires a later block, binds sender, rejects duplicate/empty/expired recipes', async () => {
  const h = await harness(), id = recipe(1);
  await h.invoke('register(bytes32)', [id], { fail: true });
  const commitment = await h.invoke('registrationCommitment(bytes32,address)', [id, ALICE]);
  await h.invoke('reserve(bytes32)', [commitment]);
  await h.invoke('register(bytes32)', [id], { nextBlock: false, fail: true });
  await h.invoke('reserve(bytes32)', [commitment], { from: BOB });
  await h.invoke('register(bytes32)', [id], { from: BOB, fail: true });
  await h.invoke('register(bytes32)', [id]);
  await h.invoke('register(bytes32)', [id], { fail: true });
  await h.invoke('reserve(bytes32)', [recipe(0)], { fail: true });
  await h.invoke('register(bytes32)', [recipe(0)], { fail: true });
  const next = recipe(2), nextCommit = await h.invoke('registrationCommitment(bytes32,address)', [next, ALICE]);
  await h.invoke('reserve(bytes32)', [nextCommit]);
  h.setTime(h.time() + 86401);
  await h.invoke('register(bytes32)', [next], { fail: true });
  assert.deepEqual(recipeList(await h.invoke('recipesOf(address)', [ALICE])), [id]);
});

test('only completed owned hours accrue, catch-up is bounded without losing backlog, no repeated claims', async () => {
  const h = await harness(), id = recipe(10);
  await h.register(id);
  assert.equal(uint(await h.invoke('claimable(bytes32)', [id])), 0n);
  h.setTime(14 * 3600 - 1); await h.invoke('claim(bytes32)', [id], { fail: true });
  h.setTime(14 * 3600);
  assert.equal(uint(await h.invoke('claimable(bytes32)', [id])), 1n);
  await h.invoke('claim(bytes32)', [id], { from: BOB, fail: true });
  await h.invoke('claim(bytes32)', [id]);
  await h.invoke('claim(bytes32)', [id], { fail: true });
  h.setTime((14 + 721) * 3600);
  await h.invoke('claim(bytes32)', [id]);
  assert.equal(uint(await h.invoke('balanceOf(address)', [ALICE])), 721n);
  assert.equal(uint(await h.invoke('claimable(bytes32)', [id])), 1n);
  await h.invoke('claim(bytes32)', [id]);
  assert.equal(uint(await h.invoke('balanceOf(address)', [ALICE])), 722n);
});

test('registration caps bound account storage and garden count', async () => {
  const h = await harness();
  for (let n = 1; n <= 32; n++) await h.register(recipe(n));
  const id = recipe(33), commit = await h.invoke('registrationCommitment(bytes32,address)', [id, ALICE]);
  await h.invoke('reserve(bytes32)', [commit]);
  await h.invoke('register(bytes32)', [id], { fail: true });
  assert.equal(recipeList(await h.invoke('recipesOf(address)', [ALICE])).length, 32);
  // Move the real contract's storage to a near-limit state to test its final transition.
  await h.storage('generatorCount', 4095);
  await h.register(recipe(34), BOB);
  const other = await h.invoke('registrationCommitment(bytes32,address)', [recipe(35), BOB]);
  await h.invoke('reserve(bytes32)', [other], { from: BOB });
  await h.invoke('register(bytes32)', [recipe(35)], { from: BOB, fail: true });
});

test('registration exactly at a UTC boundary earns its first fully owned hour', async () => {
  const h = await harness(), id = recipe(123);
  h.setTime(12 * 3600); await h.register(id);
  h.setTime(13 * 3600 - 1);
  assert.equal(uint(await h.invoke('claimable(bytes32)', [id])), 0n);
  h.setTime(13 * 3600);
  assert.equal(uint(await h.invoke('claimable(bytes32)', [id])), 1n);
  await h.invoke('claim(bytes32)', [id]);
  assert.equal(uint(await h.invoke('balanceOf(address)', [ALICE])), 1n);
});

test('hourly pool clamps the last reward and never silently advances an exhausted claim', async () => {
  const h = await harness(), id = recipe(5);
  await h.register(id); h.setTime(18 * 3600);
  await h.storage('hourlyMinted', 899999);
  assert.equal(uint(await h.invoke('claimable(bytes32)', [id])), 1n);
  await h.invoke('claim(bytes32)', [id]);
  const before = await h.invoke('generators(bytes32)', [id]);
  await h.invoke('claim(bytes32)', [id], { fail: true });
  assert.equal(await h.invoke('generators(bytes32)', [id]), before);
  assert.equal(uint(await h.invoke('hourlyMinted()')), 900000n);
});

test('proof agrees with browser SHA-256 and rejects wrong owner, replay, hour, counter, and other gardens', async () => {
  const h = await harness(), id = recipe(77); await h.register(id);
  const state = words(await h.invoke('miningState(bytes32)', [id]));
  const challenge = '0x' + state[0], hour = BigInt('0x' + state[1]), counter = BigInt('0x' + state[2]), nonce = solve(challenge);
  assert.equal(await proofValid(challenge, nonce), true);
  await h.invoke('mine(bytes32,uint256,uint256,uint256)', [id, hour, counter, nonce], { from: BOB, fail: true });
  await h.invoke('mine(bytes32,uint256,uint256,uint256)', [id, hour, counter + 1n, nonce], { fail: true });
  let invalid = nonce + 1n;
  while (await proofValid(challenge, invalid)) invalid++;
  await h.invoke('mine(bytes32,uint256,uint256,uint256)', [id, hour, counter, invalid], { fail: true });
  const second = await h.deploy(); await h.register(id, ALICE, second);
  assert.notEqual((await h.invoke('miningState(bytes32)', [id], { to: second })).slice(0, 66), challenge);
  await h.invoke('mine(bytes32,uint256,uint256,uint256)', [id, hour, counter, nonce], { to: second, fail: true });
  await h.invoke('mine(bytes32,uint256,uint256,uint256)', [id, hour, counter, nonce]);
  await h.invoke('mine(bytes32,uint256,uint256,uint256)', [id, hour, counter, nonce], { fail: true });
  assert.equal(uint(await h.invoke('balanceOf(address)', [ALICE])), 1n);
  assert.equal(uint(await h.invoke('miningMinted()')), 1n);
  assert.equal(words(await h.invoke('miningState(bytes32)', [id]))[3], word(0));
  h.setTime((Number(hour) + 1) * 3600);
  await h.invoke('mine(bytes32,uint256,uint256,uint256)', [id, hour, counter, nonce], { fail: true });
  assert.equal(words(await h.invoke('miningState(bytes32)', [id]))[3], word(1));
});

test('proof domain changes across chain IDs and exhausted mining pool rejects a valid proof', async () => {
  const h = await harness(), other = await harness(222), id = recipe(88);
  await h.register(id); await other.register(id);
  const state = words(await h.invoke('miningState(bytes32)', [id]));
  assert.notEqual(state[0], words(await other.invoke('miningState(bytes32)', [id]))[0]);
  const nonce = solve('0x' + state[0]);
  await h.storage('miningMinted', 99999);
  await h.invoke('mine(bytes32,uint256,uint256,uint256)', [id, BigInt('0x' + state[1]), 0n, nonce]);
  assert.equal(uint(await h.invoke('miningMinted()')), 100000n);
  h.setTime(h.time() + 3600);
  assert.equal(words(await h.invoke('miningState(bytes32)', [id]))[3], word(0));
  const exhausted = words(await h.invoke('miningState(bytes32)', [id]));
  await h.invoke('mine(bytes32,uint256,uint256,uint256)', [id, BigInt('0x' + exhausted[1]), 1n, 0n], { fail: true });
});

test('a global hourly proof limit applies across wallets and resets only on a new UTC hour', async () => {
  const h = await harness();
  for (let n = 1; n <= 64; n++) {
    const from = n <= 32 ? ALICE : BOB, id = recipe(1000 + n);
    await h.register(id, from);
    const state = words(await h.invoke('miningState(bytes32)', [id], { from }));
    await h.invoke('mine(bytes32,uint256,uint256,uint256)', [id, BigInt('0x' + state[1]), 0n, solve('0x' + state[0])], { from });
  }
  const last = recipe(1065); await h.register(last, CAROL);
  const state = words(await h.invoke('miningState(bytes32)', [last], { from: CAROL }));
  assert.equal(state[3], word(0));
  await h.invoke('mine(bytes32,uint256,uint256,uint256)', [last, BigInt('0x' + state[1]), 0n, 0n], { from: CAROL, fail: true });
  assert.equal(uint(await h.invoke('totalSupply()')), 64n);
  assert.equal(uint(await h.invoke('hourlyProofs(uint256)', [BigInt('0x' + state[1])])), 64n);
  h.setTime(h.time() + 3600);
  assert.equal(words(await h.invoke('miningState(bytes32)', [last], { from: CAROL }))[3], word(1));
});

test('the ERC20 mint hook enforces the hard supply cap and rolls back mining effects on failure', async () => {
  const h = await harness(), id = recipe(9); await h.register(id);
  h.setTime(14 * 3600);
  await h.storage('_totalSupply', 999999); await h.storage('hourlyMinted', 899999);
  await h.invoke('claim(bytes32)', [id]);
  assert.equal(uint(await h.invoke('totalSupply()')), 1000000n);
  const state = words(await h.invoke('miningState(bytes32)', [id]));
  const before = await h.invoke('generators(bytes32)', [id]);
  await h.invoke('mine(bytes32,uint256,uint256,uint256)', [id, BigInt('0x' + state[1]), 0n, solve('0x' + state[0])], { fail: true });
  assert.equal(uint(await h.invoke('miningMinted()')), 0n);
  assert.equal(await h.invoke('generators(bytes32)', [id]), before);
  assert.equal(uint(await h.invoke('totalSupply()')), 1000000n);
});

test('1000 randomized harvest/transfer steps conserve balances and cannot mint past accrued time', async () => {
  const h = await harness();
  await h.register(recipe(101), ALICE); await h.register(recipe(102), BOB);
  let seed = 123456789, expected = 0n, paid = [13, 13], balances = [0n, 0n];
  const owners = [ALICE, BOB];
  for (let step = 0; step < 1000; step++) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    const who = seed % 2, hour = Math.floor(h.time() / 3600), accrual = Math.min(720, Math.max(0, hour - paid[who]));
    if (seed % 3 === 0 && balances[who] > 0n) {
      const amount = BigInt(seed % Number(balances[who]) + 1);
      await h.invoke('transfer(address,uint256)', [owners[1 - who], amount], { from: owners[who] });
      balances[who] -= amount; balances[1 - who] += amount;
    } else {
      await h.invoke('claim(bytes32)', [recipe(101 + who)], { from: owners[who], fail: accrual === 0 });
      balances[who] += BigInt(accrual); expected += BigInt(accrual); paid[who] += accrual;
    }
    assert.equal(uint(await h.invoke('totalSupply()')), expected);
    assert.equal(uint(await h.invoke('balanceOf(address)', [ALICE])), balances[0]);
    assert.equal(uint(await h.invoke('balanceOf(address)', [BOB])), balances[1]);
    assert.ok(expected <= 1000000n);
    h.setTime(h.time() + seed % 7200);
  }
});
