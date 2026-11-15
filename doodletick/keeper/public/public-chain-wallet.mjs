// SPDX-License-Identifier: GPL-3.0-only
import { GARDEN_ARTIFACT } from './public-chain-artifact.mjs';

export { GARDEN_ARTIFACT };
export const ZERO_ADDRESS = '0x' + '0'.repeat(40);
export const MAX_ATTEMPTS = 250000;
export const MAX_MINING_MS = 60000;
export const word = value => {
  if (typeof value !== 'bigint' && !/^(0x[0-9a-f]+|[0-9]+)$/i.test(String(value))) throw new Error('Expected a whole non-negative number.');
  const number = BigInt(value);
  if (number < 0n || number >= 1n << 256n) throw new Error('Number outside uint256 range.');
  return number.toString(16).padStart(64, '0');
};
export function address(value) {
  if (typeof value !== 'string' || !/^0x[0-9a-fA-F]{40}$/.test(value) || value.toLowerCase() === ZERO_ADDRESS) throw new Error('Enter a nonzero 0x wallet or garden address.');
  return value.toLowerCase();
}
export function bytes32(value) {
  if (typeof value !== 'string' || !/^0x[0-9a-fA-F]{64}$/.test(value)) throw new Error('Invalid 32-byte fingerprint.');
  return value.slice(2).toLowerCase();
}
export function encode(method, args = []) {
  const selector = GARDEN_ARTIFACT.selectors[method];
  if (!selector) throw new Error('Unsupported garden method.');
  const types = method.slice(method.indexOf('(') + 1, -1).split(',').filter(Boolean);
  if (args.length !== types.length) throw new Error('Wrong number of garden arguments.');
  return '0x' + selector + types.map((type, i) => type === 'bytes32' ? bytes32(args[i]) : type === 'address' ? address(args[i]).slice(2).padStart(64, '0') : type === 'uint256' ? word(args[i]) : (() => { throw new Error('Unsupported ABI type.'); })()).join('');
}
export function words(data) {
  if (typeof data !== 'string' || !/^0x(?:[0-9a-fA-F]{64})*$/.test(data) || data.length > 65538) throw new Error('Invalid garden response.');
  return data.slice(2).match(/.{64}/g) ?? [];
}
export function uint(data) {
  const values = words(data);
  if (values.length !== 1) throw new Error('Invalid number response.');
  return BigInt('0x' + values[0]);
}
export function recipeList(data) {
  const values = words(data);
  if (values[0] !== word(32) || values.length < 2) throw new Error('Invalid generator list.');
  const length = Number(BigInt('0x' + values[1]));
  if (length > 32 || values.length !== length + 2) throw new Error('Invalid generator count.');
  return values.slice(2).map(value => '0x' + value);
}
export function fingerprintHex(base64url) {
  if (typeof base64url !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(base64url)) throw new Error('Invalid mushroom fingerprint.');
  const decoded = atob(base64url.replace(/-/g, '+').replace(/_/g, '/') + '=');
  if (decoded.length !== 32) throw new Error('Invalid mushroom fingerprint length.');
  return '0x' + Array.from(decoded, c => c.charCodeAt(0).toString(16).padStart(2, '0')).join('');
}
export function hexBytes(hex) {
  if (!/^0x(?:[0-9a-fA-F]{2})*$/.test(hex)) throw new Error('Invalid hexadecimal bytes.');
  return Uint8Array.from(hex.slice(2).match(/../g) ?? [], byte => parseInt(byte, 16));
}
export function proofData(challenge, nonce) { return hexBytes('0x' + bytes32(challenge) + word(nonce)); }
export async function proofValid(challenge, nonce, subtle = globalThis.crypto?.subtle) {
  if (!subtle) throw new Error('Mining needs HTTPS or localhost with browser cryptography.');
  const hash = new Uint8Array(await subtle.digest('SHA-256', proofData(challenge, nonce)));
  return hash[0] === 0 && hash[1] === 0;
}
export async function mineProof(challenge, { signal, onProgress = () => {}, isVisible = () => !globalThis.document?.hidden,
  maxAttempts = MAX_ATTEMPTS, maxMs = MAX_MINING_MS, start = 0n, now = () => performance.now(), yieldTask = () => new Promise(resolve => setTimeout(resolve, 0)), subtle = globalThis.crypto?.subtle } = {}) {
  if (!Number.isInteger(maxAttempts) || maxAttempts < 1 || maxAttempts > MAX_ATTEMPTS || !Number.isFinite(maxMs) || maxMs < 1 || maxMs > MAX_MINING_MS) throw new Error('Mining bounds exceeded.');
  if (!subtle) throw new Error('Mining needs HTTPS or localhost with browser cryptography.');
  const began = now();
  let attempts = 0;
  while (attempts < maxAttempts && now() - began < maxMs) {
    if (signal?.aborted || !isVisible()) return { stopped: true, attempts };
    const nonce = BigInt(start) + BigInt(attempts);
    const valid = await proofValid(challenge, nonce, subtle);
    attempts++;
    if (signal?.aborted || !isVisible()) return { stopped: true, attempts };
    if (now() - began >= maxMs) return { exhausted: true, attempts };
    if (valid) { onProgress(attempts); return { nonce, attempts }; }
    if (attempts % 64 === 0) { onProgress(attempts); await yieldTask(); }
  }
  onProgress(attempts);
  return { exhausted: true, attempts };
}

const chainNumber = value => {
  if (typeof value !== 'string' || !/^0x[0-9a-f]+$/i.test(value) || BigInt(value) <= 0n) throw new Error('Invalid wallet network.');
  return '0x' + BigInt(value).toString(16);
};
export function walletError(error) {
  if (error?.code === 4001) return 'Cancelled in your wallet. Check wallet activity if a transaction had already been submitted.';
  if (error?.code === 4902) return 'Add this network in your wallet first, then choose it there and reconnect.';
  if (error?.code === 4900 || error?.code === 4901) return 'The wallet is disconnected from this network. Reconnect in your wallet.';
  return String(error?.message || error || 'Wallet request failed.').slice(0, 400);
}

export class GardenWallet {
  constructor(provider, { onChange = () => {}, onStatus = () => {}, pollMs = 2000, timeoutMs = 120000, sleep = ms => new Promise(resolve => setTimeout(resolve, ms)) } = {}) {
    if (!provider?.request) throw new Error('Open this page in a browser with an injected Ethereum wallet.');
    this.provider = provider; this.onChange = onChange; this.onStatus = onStatus;
    this.pollMs = pollMs; this.timeoutMs = timeoutMs; this.sleep = sleep;
    this.account = null; this.chain = null; this.garden = null; this.generation = 0;
    this.pending = null; this.busy = false;
    this.handleChange = () => this.reset('Wallet account or network changed. Connect again; each network has separate gardens.');
    this.handleDisconnect = () => this.reset('Wallet disconnected.');
    provider.on?.('accountsChanged', this.handleChange);
    provider.on?.('chainChanged', this.handleChange);
    provider.on?.('disconnect', this.handleDisconnect);
  }
  reset(reason) {
    this.generation++; this.account = null; this.chain = null; this.garden = null;
    this.onChange(); this.onStatus(reason);
  }
  destroy() {
    this.reset('Disconnected from this page.');
    this.provider.removeListener?.('accountsChanged', this.handleChange);
    this.provider.removeListener?.('chainChanged', this.handleChange);
    this.provider.removeListener?.('disconnect', this.handleDisconnect);
  }
  async connect() {
    const accounts = await this.provider.request({ method: 'eth_requestAccounts' });
    // Initial authorization may emit accountsChanged before this request resolves.
    const generation = this.generation;
    const chain = await this.provider.request({ method: 'eth_chainId' });
    if (generation !== this.generation) throw new Error('Wallet changed while connecting. Try again.');
    if (!Array.isArray(accounts) || !accounts.length) throw new Error('No wallet account was shared.');
    this.account = address(accounts[0]); this.chain = chainNumber(chain); this.garden = null;
    await this.assertContext();
    this.onChange(); return { account: this.account, chain: this.chain };
  }
  async switchChain(chain) {
    const requested = typeof chain === 'string' && chain.startsWith('0x') ? chain : '0x' + BigInt(chain).toString(16);
    const normalized = chainNumber(requested);
    this.reset('Changing network. Connect after choosing the account in your wallet.');
    await this.provider.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: normalized }] });
  }
  snapshot() {
    if (!this.account || !this.chain) throw new Error('Connect your wallet first.');
    return { account: this.account, chain: this.chain, garden: this.garden, generation: this.generation };
  }
  unchanged(snapshot) {
    if (snapshot.generation !== this.generation || snapshot.account !== this.account || snapshot.chain !== this.chain || snapshot.garden !== this.garden) throw new Error('Wallet or garden changed. Reconnect and check the transaction in your wallet.');
  }
  async assertContext(snapshot = this.snapshot()) {
    const [chain, accounts] = await Promise.all([this.provider.request({ method: 'eth_chainId' }), this.provider.request({ method: 'eth_accounts' })]);
    this.unchanged(snapshot);
    if (chainNumber(chain) !== snapshot.chain || !Array.isArray(accounts) || !accounts.length || address(accounts[0]) !== snapshot.account) {
      this.reset('Wallet account or network changed. Connect again.'); throw new Error('Wallet context changed.');
    }
    return snapshot;
  }
  async attach(value) {
    if (this.busy) throw new Error('Wait for the current wallet request.');
    const target = address(value), snapshot = await this.assertContext();
    const code = await this.provider.request({ method: 'eth_getCode', params: [target, 'latest'] });
    this.unchanged(snapshot);
    if (typeof code !== 'string' || code.toLowerCase() !== GARDEN_ARTIFACT.deployedBytecode.toLowerCase()) throw new Error('This address is not the exact supported DoodleGarden contract on this network.');
    this.garden = target; this.onChange(); return target;
  }
  async call(method, args = []) {
    const snapshot = await this.assertContext();
    if (!snapshot.garden) throw new Error('Connect a garden contract first.');
    const result = await this.provider.request({ method: 'eth_call', params: [{ from: snapshot.account, to: snapshot.garden, data: encode(method, args) }, 'latest'] });
    this.unchanged(snapshot); return result;
  }
  async send(method, args = []) {
    return this.transact(encode(method, args), false);
  }
  async deploy() { return this.transact(GARDEN_ARTIFACT.bytecode, true); }
  async transact(data, deployment) {
    if (this.busy) throw new Error('A wallet request is already in progress.');
    if (this.pending) throw new Error('Check the pending transaction before sending another.');
    this.busy = true;
    try {
      const snapshot = await this.assertContext();
      if (!deployment && !snapshot.garden) throw new Error('Connect a garden contract first.');
      const tx = { from: snapshot.account, data, value: '0x0', ...(deployment ? {} : { to: snapshot.garden }) };
      // Simulate first. The wallet still displays and approves the actual gas fee.
      const gas = await this.provider.request({ method: 'eth_estimateGas', params: [tx] });
      if (!/^0x[0-9a-f]+$/i.test(gas)) throw new Error('Wallet returned an invalid gas estimate.');
      await this.assertContext(snapshot);
      this.onStatus('Review this transaction and its network fee in your wallet.');
      const hash = await this.provider.request({ method: 'eth_sendTransaction', params: [tx] });
      if (!/^0x[0-9a-fA-F]{64}$/.test(hash)) throw new Error('Wallet returned no valid transaction hash. Check its activity before retrying.');
      // Preserve the hash even if the wallet changed while the confirmation was open.
      this.pending = { hash, chain: snapshot.chain, account: snapshot.account, deployment };
      this.onStatus(`Submitted on chain ${BigInt(snapshot.chain)}: ${hash}. Waiting for a receipt.`);
      this.unchanged(snapshot);
      return await this.waitReceipt();
    } finally { this.busy = false; }
  }
  async waitReceipt() {
    if (!this.pending) throw new Error('No transaction is pending on this page.');
    const pending = this.pending, started = Date.now();
    do {
      const chain = chainNumber(await this.provider.request({ method: 'eth_chainId' }));
      if (chain !== pending.chain) throw new Error(`Transaction ${pending.hash} is pending on chain ${BigInt(pending.chain)}. Switch back to check it.`);
      const receipt = await this.provider.request({ method: 'eth_getTransactionReceipt', params: [pending.hash] });
      if (receipt) {
        if (typeof receipt.transactionHash !== 'string' || receipt.transactionHash.toLowerCase() !== pending.hash.toLowerCase()) throw new Error('Unexpected transaction receipt.');
        if (receipt.status !== '0x1' && receipt.status !== '0x0') throw new Error('Wallet returned an unsupported receipt status.');
        this.pending = null;
        if (receipt.status === '0x0') throw new Error(`Transaction failed on-chain: ${pending.hash}. Network fees may still have been charged.`);
        this.onStatus(`Mined successfully: ${pending.hash}. This first receipt may still be affected by a chain reorganization.`);
        if (pending.deployment && this.account === pending.account && this.chain === pending.chain) {
          const context = this.snapshot();
          const target = address(receipt.contractAddress);
          const code = await this.provider.request({ method: 'eth_getCode', params: [target, 'latest'] });
          this.unchanged(context);
          if (typeof code !== 'string' || code.toLowerCase() !== GARDEN_ARTIFACT.deployedBytecode.toLowerCase()) throw new Error(`Deployment mined at ${target}, but its runtime did not match. Do not send funds to it.`);
          this.garden = target; this.onChange();
        }
        return receipt;
      }
      if (Date.now() - started >= this.timeoutMs) break;
      await this.sleep(this.pollMs);
    } while (true);
    this.onStatus(`Still pending: ${pending.hash}. Use Check pending or your wallet activity; do not resend blindly.`);
    return null;
  }
}
