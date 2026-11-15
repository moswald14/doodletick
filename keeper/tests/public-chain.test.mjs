// SPDX-License-Identifier: GPL-3.0-only
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { GardenWallet, GARDEN_ARTIFACT, encode, word, words, uint, address, fingerprintHex,
  recipeList, proofData, proofValid, mineProof, MAX_ATTEMPTS, walletError } from '../public/public-chain-wallet.mjs';

const owner = '0x' + '11'.repeat(20), receiver = '0x' + '22'.repeat(20), garden = '0x' + '33'.repeat(20), hash = '0x' + '44'.repeat(32);
class Provider {
  requests = []; listeners = new Map(); chain = '0xaa36a7'; accounts = [owner]; code = GARDEN_ARTIFACT.deployedBytecode;
  receipt = { transactionHash: hash, status: '0x1', contractAddress: garden };
  on(event, handler) { if (!this.listeners.has(event)) this.listeners.set(event, new Set()); this.listeners.get(event).add(handler); }
  removeListener(event, handler) { this.listeners.get(event)?.delete(handler); }
  emit(event) { for (const handler of this.listeners.get(event) ?? []) handler(); }
  async request(request) {
    this.requests.push(request);
    const overridden = await this.hook?.(request);
    if (overridden !== undefined) return overridden;
    switch (request.method) {
      case 'eth_requestAccounts': case 'eth_accounts': return this.accounts;
      case 'eth_chainId': return this.chain;
      case 'eth_getCode': return this.code;
      case 'eth_estimateGas': return '0x12345';
      case 'eth_sendTransaction': return hash;
      case 'eth_getTransactionReceipt': return this.receipt;
      case 'eth_call': return '0x' + word(7);
      case 'wallet_switchEthereumChain': this.chain = request.params[0].chainId; this.emit('chainChanged'); return null;
      default: throw new Error('Unexpected method: ' + request.method);
    }
  }
}
async function connected(options = {}) {
  const provider = new Provider(), wallet = new GardenWallet(provider, options);
  await wallet.connect(); await wallet.attach(garden);
  return { provider, wallet };
}

test('ABI encoding is exact, bounded, and independent of private coin addresses', () => {
  assert.equal(encode('transfer(address,uint256)', [receiver, 42n]), '0xa9059cbb' + '0'.repeat(24) + receiver.slice(2) + word(42));
  for (const invalid of [-1n, 1n << 256n, '1.5', 'NaN', '1e4']) assert.throws(() => word(invalid));
  assert.throws(() => address('doodlecoin:private:player'));
  assert.throws(() => address('0x' + '0'.repeat(40)));
  assert.throws(() => encode('transfer(address,uint256)', [receiver]));
  assert.throws(() => encode('adminMint(address,uint256)', [receiver, 1]));
  assert.throws(() => words('0x1234'));
  assert.throws(() => uint('0x' + word(1) + word(2)));
  assert.deepEqual(recipeList('0x' + word(32) + word(1) + word(5)), ['0x' + word(5)]);
  assert.throws(() => recipeList('0x' + word(32) + word(33) + word(5)));
  const bytes = createHash('sha256').update('normalized recipe').digest();
  assert.equal(fingerprintHex(bytes.toString('base64url')), '0x' + bytes.toString('hex'));
});

test('wallet construction and context events do not request accounts or send transactions', async () => {
  const provider = new Provider(), wallet = new GardenWallet(provider);
  assert.deepEqual(provider.requests, []);
  provider.emit('accountsChanged'); provider.emit('chainChanged');
  assert.deepEqual(provider.requests, []);
  await wallet.connect();
  assert.equal(provider.requests.filter(r => r.method === 'eth_requestAccounts').length, 1);
  assert.equal(provider.requests.filter(r => r.method === 'eth_sendTransaction').length, 0);
  wallet.destroy();
  assert.equal([...provider.listeners.values()].reduce((n, values) => n + values.size, 0), 0);
});

test('initial wallet authorization tolerates accountsChanged but validates the returned account', async () => {
  const provider = new Provider(), wallet = new GardenWallet(provider);
  provider.hook = request => { if (request.method === 'eth_requestAccounts') provider.emit('accountsChanged'); };
  await wallet.connect(); assert.equal(wallet.account, owner);
  provider.accounts = [receiver];
  await assert.rejects(wallet.call('totalSupply()'), /context changed/);
  assert.equal(wallet.account, null);
});

test('attaching checks the complete runtime and never accepts a lookalike/proxy/empty address', async () => {
  const { provider, wallet } = await connected();
  provider.code = '0x'; await assert.rejects(wallet.attach(garden), /exact supported/);
  provider.code = GARDEN_ARTIFACT.deployedBytecode.slice(0, -2) + '00';
  await assert.rejects(wallet.attach(garden), /exact supported/);
  assert.equal(provider.requests.some(r => r.method === 'eth_sendTransaction'), false);
});

test('network switching is explicit and clears attached garden and account', async () => {
  const { provider, wallet } = await connected();
  await wallet.switchChain('1');
  assert.equal(provider.chain, '0x1'); assert.equal(wallet.garden, null); assert.equal(wallet.account, null);
  await assert.rejects(wallet.send('claim(bytes32)', ['0x' + word(1)]), /Connect your wallet/);
});

test('transaction preflight and wallet request contain zero native value and the selected contract only', async () => {
  const { provider, wallet } = await connected();
  const receipt = await wallet.send('transfer(address,uint256)', [receiver, 2]);
  assert.equal(receipt.status, '0x1'); assert.equal(wallet.pending, null);
  const sent = provider.requests.find(r => r.method === 'eth_sendTransaction').params[0];
  assert.deepEqual(sent, { from: owner, to: garden, data: encode('transfer(address,uint256)', [receiver, 2]), value: '0x0' });
  assert.ok(provider.requests.findIndex(r => r.method === 'eth_estimateGas') < provider.requests.findIndex(r => r.method === 'eth_sendTransaction'));
  assert.equal(provider.requests.some(r => /sign|approve|addEthereumChain/i.test(r.method)), false);
});

test('gas simulation failure and account change before confirmation prevent submission', async () => {
  const { provider, wallet } = await connected();
  provider.hook = request => { if (request.method === 'eth_estimateGas') throw new Error('Execution reverted'); };
  await assert.rejects(wallet.send('transfer(address,uint256)', [receiver, 2]), /reverted/);
  assert.equal(provider.requests.some(r => r.method === 'eth_sendTransaction'), false);
  provider.hook = request => { if (request.method === 'eth_estimateGas') { provider.accounts = [receiver]; provider.emit('accountsChanged'); } };
  await assert.rejects(wallet.send('transfer(address,uint256)', [receiver, 2]), /changed/);
  assert.equal(provider.requests.some(r => r.method === 'eth_sendTransaction'), false);
});

test('rejected, reverted, and malformed receipts remain distinct', async () => {
  const { provider, wallet } = await connected();
  provider.hook = request => { if (request.method === 'eth_sendTransaction') throw Object.assign(new Error('User rejected'), { code: 4001 }); };
  await assert.rejects(wallet.send('transfer(address,uint256)', [receiver, 2]), error => error.code === 4001);
  assert.equal(wallet.pending, null); assert.match(walletError({ code: 4001 }), /Cancelled/);
  provider.hook = null; provider.receipt.status = '0x0';
  await assert.rejects(wallet.send('transfer(address,uint256)', [receiver, 2]), /failed on-chain/);
  assert.equal(wallet.pending, null);
  provider.receipt.status = undefined;
  await assert.rejects(wallet.send('transfer(address,uint256)', [receiver, 2]), /receipt status/);
  assert.equal(wallet.pending.hash, hash);
});

test('pending receipts retain their chain and block duplicate submission until checked', async () => {
  const { provider, wallet } = await connected({ timeoutMs: 0 });
  provider.receipt = null;
  assert.equal(await wallet.send('transfer(address,uint256)', [receiver, 2]), null);
  assert.equal(wallet.pending.hash, hash);
  await assert.rejects(wallet.send('transfer(address,uint256)', [receiver, 2]), /pending transaction/);
  provider.chain = '0x1'; provider.emit('chainChanged');
  await assert.rejects(wallet.waitReceipt(), /Switch back/);
  assert.equal(wallet.pending.hash, hash);
  provider.chain = '0xaa36a7';
  provider.receipt = { transactionHash: hash, status: '0x1' };
  assert.equal((await wallet.waitReceipt()).status, '0x1');
  assert.equal(wallet.pending, null);
});

test('account change during wallet confirmation retains a submitted transaction hash', async () => {
  const { provider, wallet } = await connected();
  provider.hook = request => { if (request.method === 'eth_sendTransaction') { provider.accounts = [receiver]; provider.emit('accountsChanged'); } };
  await assert.rejects(wallet.send('transfer(address,uint256)', [receiver, 2]), /changed/);
  assert.equal(wallet.pending.hash, hash); assert.equal(wallet.pending.account, owner);
});

test('deployment only submits compiled creation code after an explicit call and checks resulting runtime', async () => {
  const { provider, wallet } = await connected();
  await wallet.deploy();
  const sent = provider.requests.find(r => r.method === 'eth_sendTransaction').params[0];
  assert.equal(sent.data, GARDEN_ARTIFACT.bytecode); assert.equal(sent.to, undefined); assert.equal(sent.value, '0x0');
  assert.equal(wallet.garden, garden);
  provider.code = '0x';
  await assert.rejects(wallet.deploy(), /runtime did not match/);
});

test('network change while verifying a deployment cannot resurrect a stale garden selection', async () => {
  const { provider, wallet } = await connected();
  provider.hook = request => { if (request.method === 'eth_getCode') { provider.chain = '0x1'; provider.emit('chainChanged'); } };
  await assert.rejects(wallet.deploy(), /changed/);
  assert.equal(wallet.account, null); assert.equal(wallet.chain, null); assert.equal(wallet.garden, null);
});

test('proof bytes use fixed-width SHA-256 encoding and bounded uint256 nonces', async () => {
  const challenge = '0x' + 'ab'.repeat(32), nonce = 123n;
  const data = proofData(challenge, nonce);
  assert.equal(data.length, 64); assert.equal(Buffer.from(data).toString('hex'), challenge.slice(2) + word(nonce));
  const digest = createHash('sha256').update(data).digest();
  assert.equal(await proofValid(challenge, nonce), digest[0] === 0 && digest[1] === 0);
  assert.throws(() => proofData(challenge, -1));
});

test('mining is bounded, yields, and cannot silently submit wallet transactions', async () => {
  let digests = 0, yields = 0;
  const subtle = { async digest() { digests++; return new Uint8Array(32).fill(255); } };
  const result = await mineProof('0x' + word(1), { subtle, maxAttempts: 129, now: () => 0, yieldTask: async () => { yields++; } });
  assert.equal(result.exhausted, true); assert.equal(digests, 129); assert.equal(yields, 2);
  await assert.rejects(mineProof('0x' + word(1), { maxAttempts: MAX_ATTEMPTS + 1 }), /bounds/);
  await assert.rejects(mineProof('0x' + word(1), { maxMs: 60001 }), /bounds/);
});

test('mining immediately stops when hidden, cancelled, or its duration expires, including a late digest', async () => {
  let calls = 0;
  const controller = new AbortController(), subtle = { async digest() { calls++; controller.abort(); return new Uint8Array(32); } };
  assert.equal((await mineProof('0x' + word(1), { subtle, isVisible: () => false })).stopped, true);
  assert.equal(calls, 0);
  assert.equal((await mineProof('0x' + word(1), { subtle, signal: controller.signal })).stopped, true);
  assert.equal(calls, 1);
  let time = 0;
  const result = await mineProof('0x' + word(1), { now: () => time += 60000, subtle });
  assert.equal(result.exhausted, true); assert.equal(result.attempts, 0);
  time = 0;
  const late = await mineProof('0x' + word(1), { now: () => time, subtle: { async digest() { time = 60001; return new Uint8Array(32); } } });
  assert.equal(late.exhausted, true); assert.equal(late.attempts, 1); assert.equal(late.nonce, undefined);
});
