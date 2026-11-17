// SPDX-License-Identifier: GPL-3.0-only
import { WALLET_NETWORKS, generatePrivateKey, privateKeyIdentity, encryptWallet, decryptWallet, validateEncryptedWallet,
  validateWalletBalance, createTransactionPlan, signTransactionPlan, verifyPlanStillSpendable, formatAtoms,
  createFounderRecipientRecord, verifyFounderRecipientRecord } from './scrypt-wallet-core.mjs';
const $ = id => document.getElementById(id), founderMode = location.hash === '#founder';
const PREFIX = 'doodleverse.native-wallet.v1.', LOCK_MS = 5 * 60 * 1000;
let network = founderMode ? 'main' : 'regtest', record = null, secret = null, node = null, plan = null, networkChosen = founderMode;
let busy = false, generation = 0, idleTimer = null, request = null, backupDownloaded = false, pendingBroadcast = null;
$('wallet-network').value = network;
$('founder-intro').hidden = !founderMode;
if (founderMode) $('wallet-network').disabled = true;
function say(id, message) { $(id).textContent = message; }
function matchingNode() { return !!node?.connected && node.network === network && node.genesis === WALLET_NETWORKS[network].genesis; }
function spendEnabled() { return matchingNode() && (network !== 'main' || node.mainnetEnabled === true); }
function clearPasswords() { for (const id of ['new-password', 'repeat-password', 'unlock-password']) $(id).value = ''; }
function clearPlan() { plan = null; $('payment-review').hidden = true; }
function controls() {
  $('create-section').hidden = !!record; $('unlock-wallet-form').hidden = !record || !!secret;
  $('receive-section').hidden = !record; $('send-section').hidden = !record || founderMode;
  $('founder-section').hidden = !record || network !== 'main' || !founderMode;
  for (const id of ['new-password','repeat-password','create-wallet','unlock-password','unlock-wallet','restore-wallet','copy-address','backup-wallet','send-address','send-amount']) $(id).disabled = busy;
  $('wallet-network').disabled = busy || founderMode;
  $('lock-wallet').disabled = !secret && !busy;
  $('refresh-balance').disabled = busy || !record || !spendEnabled();
  $('review-payment').disabled = busy || !secret || !spendEnabled();
  $('send-payment').disabled = busy || !secret || !plan || !spendEnabled();
  $('cancel-payment').disabled = busy;
  $('export-founder').disabled = busy || !secret || !backupDownloaded || !$('backup-confirmed').checked;
  if (record) {
    $('receiving-address').value = record.address;
    $('mine-link').href = './scrypt.html#address=' + encodeURIComponent(record.address);
    $('mine-link').setAttribute('aria-disabled', matchingNode() ? 'false' : 'true');
  }
}
function activity() { clearTimeout(idleTimer); if (secret) idleTimer = setTimeout(() => lock('Wallet locked after five minutes without activity.'), LOCK_MS); }
function lock(message = 'Wallet locked. Your encrypted backup and receiving address are preserved.') {
  if (pendingBroadcast) say('payment-status','Wallet locked. A payment was submitted and its result may be pending. Keep the transaction ID and refresh before retrying.');
  generation++; request?.abort(); request = null; busy = false; secret?.fill(0); secret = null;
  clearTimeout(idleTimer); idleTimer = null; clearPasswords(); clearPlan();
  say('wallet-status', message); controls();
}
function storageKey() { return PREFIX + network; }
function load() {
  lock(); record = null; backupDownloaded = false; $('backup-confirmed').checked = false;
  try { const value = localStorage.getItem(storageKey()); if (value) record = validateEncryptedWallet(value, network); }
  catch { say('wallet-status', 'The saved wallet could not be opened. It has not been changed. Restore a valid encrypted backup on a separate browser if needed.'); controls(); return; }
  say('wallet-status', record ? 'Encrypted wallet found. Unlock to send coins or sign a founder message.' : 'Create a wallet or restore its encrypted backup.');
  say('confirmed-balance', '—'); say('immature-balance', '—'); say('balance-status', 'Balance has not been checked.');
  say('payment-status', 'No payment submitted in this session.'); say('last-transaction', '');
  try { const last = JSON.parse(localStorage.getItem(storageKey() + '.last-payment') || 'null'); if (last && /^[0-9a-f]{64}$/.test(last.txid || '') && last.address === record?.address) say('last-transaction', 'Last submitted transaction: ' + last.txid + '. Refresh your balance before making another payment.'); } catch {}
  controls();
}
function persist(value) {
  const checked = validateEncryptedWallet(value, network), previous = localStorage.getItem(storageKey());
  if (previous) { const existing = validateEncryptedWallet(previous, network); if (existing.address !== checked.address || existing.cipher.data !== checked.cipher.data) throw Error('This browser already holds a different encrypted wallet for this network. Restore on a separate browser to preserve both.'); }
  const serialized = JSON.stringify(checked); localStorage.setItem(storageKey(), serialized);
  if (localStorage.getItem(storageKey()) !== serialized) throw Error('The browser did not save the encrypted wallet.');
  record = checked;
}
async function api(path, body, signal) {
  const response = await fetch('./scrypt/' + path, { method: body ? 'POST' : 'GET', headers: body ? { 'Content-Type':'application/json','X-Keeper-Request':'1' } : {}, ...(body ? { body: JSON.stringify(body) } : {}), cache:'no-store', signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(30000)]) : AbortSignal.timeout(15000) });
  if (!response.body) throw Error('The node returned an empty reply.');
  const reader = response.body.getReader(), parts = []; let length = 0;
  try { for (;;) { const part = await reader.read(); if (part.done) break; length += part.value.length; if (length > 5242880) throw Error('The node reply exceeded the wallet limit.'); parts.push(part.value); } }
  finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
  const bytes = new Uint8Array(length); let at = 0; for (const part of parts) { bytes.set(part,at); at += part.length; }
  const text = new TextDecoder().decode(bytes);
  let result; try { result = JSON.parse(text); } catch { throw Error('The node returned an unreadable reply.'); }
  if (!response.ok) throw Error(typeof result.error === 'string' ? result.error : 'The node could not complete that request.'); return result;
}
async function refreshNode() {
  try {
    node = await api('status');
    if (!node?.connected || !Object.hasOwn(WALLET_NETWORKS,node.network) || node.genesis !== WALLET_NETWORKS[node.network].genesis) { node = null; say('node-status','No matching Doodleverse node is connected. Wallet creation, backup and founder setup still work.'); }
    else {
      if (!networkChosen && !record && !secret && !busy && !$('new-password').value && !$('repeat-password').value) { networkChosen = true; network = node.network; $('wallet-network').value = network; load(); }
      say('node-status', `${node.network} network · block ${node.height} · ${network === node.network ? (spendEnabled() ? 'Ready for wallet requests.' : 'Main network spending is not enabled.') : 'Choose the matching network to mine or spend.'}`);
    }
  } catch { node = null; say('node-status','Node connection unavailable. Encrypted wallet setup and backups remain local.'); }
  controls();
}
async function balance(signal) {
  if (!record || !spendEnabled()) throw Error('Connect a matching enabled Doodleverse node to check or spend coins.');
  return validateWalletBalance(await api('wallet/balance', { address:record.address }, signal), record.address, network);
}
function displayBalance(value) { say('confirmed-balance',formatAtoms(value.confirmedAtoms) + ' DVC'); say('immature-balance',formatAtoms(value.immatureAtoms) + ' DVC'); say('balance-status',`${network} network · checked at block ${value.height}. Pending or immature coins cannot be spent.`); }
async function operation(action, statusId = 'wallet-status') {
  if (busy) return; const ownGeneration = ++generation, controller = new AbortController(); request = controller; busy = true; controls();
  try { await action(() => generation === ownGeneration && !controller.signal.aborted, controller.signal); }
  catch (error) { if (generation === ownGeneration) say(statusId, error.message || 'The wallet operation could not complete.'); }
  finally { if (generation === ownGeneration) { busy = false; request = null; controls(); activity(); } }
}
$('create-wallet-form').addEventListener('submit', event => {
  event.preventDefault(); if (record || busy) return;
  const password = $('new-password').value, repeat = $('repeat-password').value; clearPasswords();
  if (password !== repeat) { say('wallet-status','The two passwords do not match.'); return; }
  operation(async current => {
    say('wallet-status','Creating and encrypting your native wallet…'); const key = generatePrivateKey();
    try { const saved = await encryptWallet(key,network,password); if (!current()) return; persist(saved); secret = key.slice(); say('wallet-status','Wallet created and unlocked. Download its encrypted backup.'); }
    finally { key.fill(0); }
  });
});
$('unlock-wallet-form').addEventListener('submit', event => {
  event.preventDefault(); if (!record || secret || busy) return; const password = $('unlock-password').value; clearPasswords();
  operation(async current => { say('wallet-status','Unlocking locally…'); const key = await decryptWallet(record,password,network); if (!current()) { key.fill(0); return; } secret = key; say('wallet-status','Wallet unlocked in this page. It will lock when hidden or after five idle minutes.'); });
});
$('lock-wallet').addEventListener('click', () => lock());
$('wallet-network').addEventListener('change', () => { if (busy || founderMode) { $('wallet-network').value = network; return; } if (!Object.hasOwn(WALLET_NETWORKS,$('wallet-network').value)) return; networkChosen = true; network = $('wallet-network').value; load(); refreshNode(); });
$('restore-wallet').addEventListener('change', () => {
  const file = $('restore-wallet').files?.[0]; $('restore-wallet').value = ''; if (!file || busy) return;
  operation(async current => { if (file.size > 4096) throw Error('Choose an encrypted native DVC wallet backup smaller than 4 KB.'); const value = validateEncryptedWallet(await file.text(),network); if (!current()) return; persist(value); secret?.fill(0); secret = null; clearPlan(); backupDownloaded = false; $('backup-confirmed').checked = false; say('wallet-status','Encrypted backup restored. Unlock it privately with its password.'); });
});
function download(value, filename) { const blob = new Blob([JSON.stringify(value,null,2) + '\n'], { type:'application/json' }), url = URL.createObjectURL(blob), link = document.createElement('a'); link.href = url; link.download = filename; link.click(); setTimeout(() => URL.revokeObjectURL(url),1000); }
$('backup-wallet').addEventListener('click', () => { if (!record || busy) return; download(record,`Doodleverse-${network}-${record.address}-encrypted-wallet.json`); backupDownloaded = true; say('wallet-status','Encrypted backup download requested. Keep the file and its password safe.'); controls(); });
$('copy-address').addEventListener('click', async () => { if (!record || busy) return; try { await navigator.clipboard.writeText(record.address); say('wallet-status','Receiving address copied.'); } catch { say('wallet-status','Select and copy the receiving address shown above.'); } });
$('mine-link').addEventListener('click', event => { if (!record || !matchingNode()) { event.preventDefault(); say('wallet-status','Connect a matching Doodleverse node before opening the miner.'); } });
$('refresh-balance').addEventListener('click', () => operation(async (current,signal) => { const value = await balance(signal); if (current()) displayBalance(value); },'balance-status'));
for (const id of ['send-address','send-amount']) $(id).addEventListener('input', () => { clearPlan(); controls(); });
$('send-form').addEventListener('submit', event => {
  event.preventDefault(); if (busy || !secret || !spendEnabled()) return;
  const recipient = $('send-address').value.trim(), amount = $('send-amount').value.trim(); clearPlan();
  operation(async (current,signal) => {
    const value = await balance(signal); if (!current()) return; displayBalance(value);
    plan = createTransactionPlan({ network,address:record.address,recipient,amount,balance:value });
    say('review-network',network); say('review-recipient',plan.recipient); say('review-amount',formatAtoms(plan.amountAtoms) + ' DVC'); say('review-fee',formatAtoms(plan.feeAtoms) + ' DVC'); say('review-total',formatAtoms(plan.totalDebitAtoms) + ' DVC'); say('review-change',formatAtoms(plan.changeAtoms) + ' DVC');
    $('payment-review').hidden = false; say('payment-status','Review the recipient, amount and fee. Nothing has been signed or sent.');
  },'payment-status');
});
$('cancel-payment').addEventListener('click', () => { if (!busy) { clearPlan(); controls(); say('payment-status','Payment review cancelled. Nothing was sent.'); } });
$('send-payment').addEventListener('click', () => {
  if (busy || !secret || !plan || !spendEnabled()) return; const reviewed = plan;
  operation(async (current,signal) => {
    const currentBalance = await balance(signal); if (!current()) return; verifyPlanStillSpendable(reviewed,currentBalance);
    const payment = signTransactionPlan(reviewed,secret); clearPlan();
    localStorage.setItem(storageKey() + '.last-payment',JSON.stringify({ address:record.address,txid:payment.expectedTxid }));
    say('last-transaction','Transaction: ' + payment.expectedTxid); say('payment-status','Submitting the reviewed signed payment…');
    let submitted; const ownBroadcast = { txid:payment.expectedTxid }; pendingBroadcast = ownBroadcast;
    try { submitted = await api('wallet/broadcast',{ rawTransaction:payment.rawTransaction,expectedTxid:payment.expectedTxid },signal); }
    catch { if (current()) say('payment-status','Submission result is unknown. Keep the transaction ID and refresh your balance before retrying. No automatic retry was made.'); return; }
    finally { if (pendingBroadcast === ownBroadcast) pendingBroadcast = null; }
    if (!current()) return;
    if (submitted.accepted !== true || submitted.txid !== payment.expectedTxid || submitted.network !== network) throw Error('The node did not confirm the reviewed transaction. Check its ID before retrying.');
    say('payment-status','Payment accepted by the node. It is pending until included in a block.');
    try { const updated = await balance(signal); if (current()) displayBalance(updated); } catch {}
  },'payment-status');
});
$('backup-confirmed').addEventListener('change',controls);
$('export-founder').addEventListener('click', () => {
  if (busy || !secret || network !== 'main' || !founderMode || !backupDownloaded || !$('backup-confirmed').checked) return;
  try { const enrollment = createFounderRecipientRecord(secret); verifyFounderRecipientRecord(enrollment); download(enrollment,`Doodleverse-founder-recipient-${record.address}.json`); say('founder-status','Public recipient record signed and download requested. It approves this address for the disclosed allocation; no payment was sent.'); activity(); }
  catch (error) { say('founder-status',error.message); }
});
for (const type of ['pointerdown','keydown']) document.addEventListener(type,activity,{ passive:true });
document.addEventListener('visibilitychange', () => { if (document.hidden) lock('Wallet locked because this page was hidden.'); });
window.addEventListener('pagehide', () => lock());
window.addEventListener('storage', event => { if (event.key === null || (event.key === storageKey() && event.newValue !== JSON.stringify(record))) { load(); say('wallet-status','Wallet storage changed in another tab. Reopen it before signing.'); } });
load(); refreshNode();
