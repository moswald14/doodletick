// SPDX-License-Identifier: GPL-3.0-only
// Disposable fixtures only. No key, account, wallet connection or network call.
import { encodePepeTransfer, PEPE_CONTRACT } from '../public/jazz-name-contract.mjs';
import { PEPE_TRANSFER_TOPIC } from '../jazz-name-network.mjs';
export const payer = '0x' + '11'.repeat(20), recipient = '0x' + '22'.repeat(20);
export const txHash = '0x' + 'ab'.repeat(32), blockHash = '0x' + 'cd'.repeat(32);
export const context = { seed: 47, set: 1, style: 'swing', tempo: 112, swing: 0.64, key: 'B♭ major', bar: 1, chorus: 1,
  phraseRole: 'call', chords: [{ beat: 0, text: 'B♭maj9' }], motif: [74, 77, 72] };
export const result = { title: 'Velvet Frogs at Midnight', description: 'A light brush answer with room around the piano.',
  pattern: [{ instrument: 'kick', step: 0, velocity: 0.2 }, { instrument: 'brush', step: 4, velocity: 0.3 }, { instrument: 'hat', step: 10, velocity: 0.24 }] };
export const config = { enabled: true, network: 'ethereum', recipient, apiKey: 'test-only-key-without-any-credentials', rpcUrl: 'https://rpc.example.invalid', dailyLimit: 30 };
export const testTime = 1_700_000_000_000;
export function paymentFixture(q, hash = txHash, timestamp = testTime) {
  const topicAddress = address => '0x' + address.slice(2).toLowerCase().padStart(64, '0');
  const blockNumber = '0x65';
  const log = { address: PEPE_CONTRACT, transactionHash: hash, blockHash, blockNumber, removed: false,
    topics: [PEPE_TRANSFER_TOPIC, topicAddress(q.payer), topicAddress(q.recipient)], data: '0x' + BigInt(q.amount).toString(16).padStart(64, '0') };
  return { receipt: { transactionHash: hash, status: '0x1', from: q.payer, to: PEPE_CONTRACT, blockHash, blockNumber, logs: [log] },
    tx: { hash, blockNumber, blockHash, from: q.payer, to: PEPE_CONTRACT, value: '0x0', input: encodePepeTransfer(q.recipient, q.amount) },
    block: { number: blockNumber, hash: blockHash, timestamp: '0x' + Math.floor(timestamp / 1000).toString(16) } };
}
export function fakeNetwork() {
  const f = { chainId: '0x1', head: '0x64', payment: null, generates: 0, fail: false, generation: null,
    preflight: async () => {}, price: async () => '0.000004',
    rpc: async method => {
      switch (method) {
        case 'eth_chainId': return f.chainId;
        case 'eth_blockNumber': return f.head;
        case 'eth_getTransactionReceipt': return structuredClone(f.payment?.receipt || null);
        case 'eth_getTransactionByHash': return structuredClone(f.payment?.tx || null);
        case 'eth_getBlockByNumber': return structuredClone(f.payment?.block || null);
        default: throw new Error('Unexpected fixture method ' + method);
      }
    },
    generate: async () => { f.generates++; if (f.generation) await f.generation; if (f.fail) throw new Error('Fixture API failure.'); return structuredClone(result); },
    pay(q, hash = txHash, timestamp = testTime) { f.payment = paymentFixture(q, hash, timestamp); f.head = '0x67'; }
  };
  return f;
}
