// SPDX-License-Identifier: GPL-3.0-only
import { PEPE_CHAIN_ID, PEPE_CONTRACT, encodePepeTransfer, isAddress, isTransactionHash, validateJazzContext, validateJazzResult } from './jazz-name-contract.mjs';
const RECEIPT_KEY = 'doodle-jazz-naming-receipt-v1';
const addressEqual = (a, b) => typeof a === 'string' && typeof b === 'string' && a.toLowerCase() === b.toLowerCase();
export class JazzNamingClient {
  constructor({ fetcher = (...args) => globalThis.fetch(...args), storage = globalThis.localStorage, now = Date.now } = {}) {
    this.fetcher = fetcher; this.storage = storage; this.now = now; this.receipt = null; this.configuration = null; this.busy = false;
    try { const saved = JSON.parse(storage.getItem(RECEIPT_KEY)); if (saved) this.receipt = this.validReceipt(saved); } catch {}
  }
  validReceipt(q) {
    if (!q || !/^[a-f0-9]{32}$/.test(q.id) || !/^[a-f0-9]{64}$/.test(q.capability) || !isAddress(q.payer) || !isAddress(q.recipient)
      || q.chainId !== PEPE_CHAIN_ID || !addressEqual(q.contract, PEPE_CONTRACT) || !Number.isSafeInteger(q.expiresAt)
      || (q.hash && !isTransactionHash(q.hash)) || !['quoted', 'sending', 'uncertain', 'pending', 'generating', 'retry', 'complete', 'exhausted'].includes(q.status)) throw new Error('Invalid saved naming receipt.');
    encodePepeTransfer(q.recipient, q.amount); validateJazzContext(q.context);
    if (q.result) q.result = validateJazzResult(q.result);
    return q;
  }
  save() {
    const value = JSON.stringify(this.receipt);
    try { this.storage.setItem(RECEIPT_KEY, value); if (this.storage.getItem(RECEIPT_KEY) !== value) throw new Error(); }
    catch { throw new Error('Your browser cannot save the payment receipt. Allow site storage before paying.'); }
  }
  async request(action, body) {
    const response = await this.fetcher('./api/jazz-name/' + action, { method: body ? 'POST' : 'GET', credentials: 'same-origin', cache: 'no-store',
      signal: AbortSignal.timeout(30000), headers: body ? { 'Content-Type': 'application/json', 'X-Keeper-Request': '1' } : {}, ...(body ? { body: JSON.stringify(body) } : {}) });
    const reply = await response.json();
    if (!response.ok) throw new Error(reply.error || 'Song naming is unavailable. Keep your receipt and try again.');
    return reply;
  }
  async config() { this.configuration = await this.request('config'); return this.configuration; }
  async getQuote(provider, context) {
    if (this.busy) throw new Error('A naming request is already running.');
    if (!this.configuration?.ready) throw new Error('Song naming is not connected yet.');
    if (this.receipt && !this.receipt.result && (this.receipt.hash || this.receipt.status !== 'quoted' || this.receipt.expiresAt > this.now())) throw new Error('Resume your saved naming receipt first.');
    this.busy = true;
    try {
      const accounts = await provider.request({ method: 'eth_requestAccounts' });
      if (!isAddress(accounts?.[0])) throw new Error('Choose an Ethereum wallet account.');
      if (await provider.request({ method: 'eth_chainId' }) !== PEPE_CHAIN_ID) throw new Error('Switch your wallet to Ethereum, then try again.');
      const reply = await this.request('quote', { payer: accounts[0], context: validateJazzContext(context) });
      const q = this.validReceipt({ ...reply, status: 'quoted' });
      if (!addressEqual(q.payer, accounts[0]) || !addressEqual(q.recipient, this.configuration.recipient)) throw new Error('The payment quote did not match this Keeper.');
      this.receipt = q; this.save(); return q;
    } finally { this.busy = false; }
  }
  async walletCheck(provider) {
    const q = this.receipt;
    if (!q || !provider) throw new Error('Connect the wallet used for this quote.');
    const [accounts, chainId] = await Promise.all([provider.request({ method: 'eth_accounts' }), provider.request({ method: 'eth_chainId' })]);
    if (chainId !== PEPE_CHAIN_ID) throw new Error('Switch your wallet to Ethereum before paying.');
    if (!addressEqual(accounts?.[0], q.payer)) throw new Error('Switch back to the wallet account shown on this quote.');
    const data = encodePepeTransfer(q.recipient, q.amount), tx = { from: q.payer, to: PEPE_CONTRACT, chainId: PEPE_CHAIN_ID, value: '0x0', data };
    const balance = await provider.request({ method: 'eth_call', params: [{ to: PEPE_CONTRACT, data: '0x70a08231' + q.payer.slice(2).toLowerCase().padStart(64, '0') }, 'latest'] });
    if (typeof balance !== 'string' || !/^0x[0-9a-f]{64}$/i.test(balance) || BigInt(balance) < BigInt(q.amount)) throw new Error('This wallet needs enough PEPE for the quoted payment.');
    const [gas, price, eth] = await Promise.all([provider.request({ method: 'eth_estimateGas', params: [tx] }), provider.request({ method: 'eth_gasPrice' }), provider.request({ method: 'eth_getBalance', params: [q.payer, 'latest'] })]);
    for (const n of [gas, price, eth]) if (typeof n !== 'string' || !/^0x[0-9a-f]{1,64}$/i.test(n)) throw new Error('The Ethereum fee could not be estimated.');
    const fee = BigInt(gas) * BigInt(price);
    if (fee <= 0n || BigInt(eth) < fee) throw new Error('This wallet also needs ETH for the separate Ethereum network fee.');
    return { tx, feeWei: fee.toString() };
  }
  async pay(provider) {
    const q = this.receipt;
    if (this.busy || !q || q.status !== 'quoted' || q.hash) throw new Error('Resume the existing payment; do not pay again.');
    if (q.expiresAt - this.now() < 30000) throw new Error('This quote is too close to expiry. Wait for it to expire, then request a fresh quote.');
    this.busy = true;
    try {
      await this.config();
      if (!this.configuration?.ready || !addressEqual(q.recipient, this.configuration.recipient)) throw new Error('The Keeper is not ready for this payment. Do not pay yet.');
      const { tx } = await this.walletCheck(provider);
      if (q.expiresAt - this.now() < 30000) throw new Error('This quote has expired. Request a fresh quote.');
      const [accounts, chainId] = await Promise.all([provider.request({ method: 'eth_accounts' }), provider.request({ method: 'eth_chainId' })]);
      if (chainId !== PEPE_CHAIN_ID || !addressEqual(accounts?.[0], q.payer)) throw new Error('The wallet account or network changed. Review the quote again.');
      // Persist before opening the wallet: refresh/crash must never resend a transfer.
      q.status = 'sending'; this.save();
      let hash;
      try { hash = await provider.request({ method: 'eth_sendTransaction', params: [tx] }); }
      catch (e) {
        q.status = e.code === 4001 ? 'quoted' : 'uncertain'; this.save();
        throw new Error(e.code === 4001 ? 'Payment canceled in your wallet. No new payment was requested.' : 'Your wallet did not return a receipt. Check its transaction history and enter the hash below. Do not pay again.');
      }
      if (!isTransactionHash(hash)) { q.status = 'uncertain'; this.save(); throw new Error('Check your wallet for the transaction hash. Do not pay again.'); }
      q.hash = hash.toLowerCase(); q.status = 'pending'; this.save();
      return await this.check();
    } finally { this.busy = false; }
  }
  async check(hash) {
    const q = this.receipt;
    if (!q) throw new Error('There is no saved naming receipt.');
    if (hash) { if (!isTransactionHash(hash)) throw new Error('Enter the complete Ethereum transaction hash.'); q.hash = hash.toLowerCase(); q.status = 'pending'; this.save(); }
    const job = await this.request(q.hash && !q.paid ? 'claim' : 'job', { id: q.id, capability: q.capability, ...(q.hash ? { hash: q.hash } : {}) });
    return this.merge(job);
  }
  merge(job) {
    const q = this.receipt;
    if (!job || job.id !== q.id) throw new Error('The naming receipt did not match.');
    const uncertain = !q.hash && ['sending', 'uncertain'].includes(q.status) && job.status === 'quoted';
    q.status = uncertain ? 'uncertain' : job.status; q.paid = job.paid; q.message = uncertain
      ? 'Check your wallet for the transaction hash. Do not pay again.' : job.message;
    q.result = job.result ? validateJazzResult(job.result) : null;
    if (job.hash) q.hash = job.hash;
    this.validReceipt(q); this.save(); return q;
  }
  async retry() {
    const q = this.receipt;
    if (!q?.paid || q.status !== 'retry' || this.busy) throw new Error('Resume your saved receipt first.');
    this.busy = true;
    try { return this.merge(await this.request('retry', { id: q.id, capability: q.capability })); }
    finally { this.busy = false; }
  }
  importReceipt(value) { if (this.busy) throw new Error('Wait for the current request.'); this.receipt = this.validReceipt(value); this.save(); return this.receipt; }
}
