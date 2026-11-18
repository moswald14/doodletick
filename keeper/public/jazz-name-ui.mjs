// SPDX-License-Identifier: GPL-3.0-only
import { JazzNamingClient } from './jazz-name-client.mjs';
import { formatPepeUnits } from './jazz-name-contract.mjs';

export function createJazzNamingUI({ getSnapshot, getPlayback, applyResult }) {
  const $ = id => document.getElementById(id), wallets = new Map();
  let client;
  try { client = new JazzNamingClient(); } catch { client = new JazzNamingClient({ storage: { getItem() { return null; }, setItem() { throw new Error(); } } }); }
  let working = false, disposed = false, timer, sourceSession = null, appliedId = null, playingPartId = null, lastPlaybackState = 'idle';
  const message = (text, bad = false) => { if (disposed) return; $('naming-status').textContent = text; $('naming-status').classList.toggle('error', bad); };
  const provider = () => wallets.get($('naming-wallet').value)?.provider;
  const addWallet = (id, name, wallet) => {
    if (!wallet?.request || wallets.has(id) || wallets.size >= 12) return;
    wallets.set(id, { name, provider: wallet }); $('naming-wallet').add(new Option(String(name).slice(0, 60), id));
  };
  const announced = event => { const d = event.detail; if (d?.info?.uuid && d.provider) addWallet(String(d.info.uuid).slice(0, 80), d.info.name || 'Ethereum wallet', d.provider); };
  window.addEventListener('eip6963:announceProvider', announced);
  window.dispatchEvent(new Event('eip6963:requestProvider'));
  // EIP-6963 is preferred; retain a normal injected-wallet fallback.
  if (!wallets.size && window.ethereum) addWallet('injected', 'Browser wallet', window.ethereum);

  function paint() {
    if (disposed) return;
    const q = client.receipt, playback = getPlayback(), unfinished = q && !q.result && (q.hash || q.status !== 'quoted' || q.expiresAt > Date.now());
    $('name-song').disabled = working || !client.configuration?.ready || !playback.info || !!unfinished;
    const connection = $('naming-connection');
    if (connection) { connection.hidden = !client.configuration?.ready; connection.disabled = working; }
    $('naming-wallet').disabled = working;
    $('naming-review').hidden = !q;
    $('naming-result').hidden = !q?.result;
    $('naming-pay').hidden = !q || q.status !== 'quoted' || !!q.hash || !!q.result;
    $('naming-pay').disabled = working || !client.configuration?.ready || !!q && q.expiresAt - Date.now() < 30000;
    $('naming-resume').hidden = !q || (!q.hash && q.status === 'quoted') || !!q.result;
    $('naming-resume').disabled = working;
    $('naming-retry').hidden = q?.status !== 'retry'; $('naming-retry').disabled = working || !client.configuration?.ready;
    $('naming-recover').hidden = !q || !['sending', 'uncertain'].includes(q.status);
    $('naming-apply').disabled = working || !q?.result || !playback.info;
    if (q) {
      $('naming-amount').textContent = formatPepeUnits(q.amount) + ' PEPE';
      $('naming-recipient').textContent = q.recipient;
      $('naming-payer').textContent = q.payer;
      $('naming-expiry').textContent = q.hash || q.paid ? 'Payment receipt saved in this browser.' : q.expiresAt <= Date.now() ? 'Quote expired. You can request a new quote.' : 'Quote expires at ' + new Date(q.expiresAt).toLocaleTimeString() + '. Confirm promptly so it can be mined before expiry.';
      $('naming-hash').textContent = q.hash || 'No transaction hash yet.';
      if (q.result) { $('naming-title').textContent = q.result.title; $('naming-description').textContent = q.result.description; }
    }
  }
  async function act(fn) {
    if (working || disposed) return;
    working = true; paint();
    try { await fn(); }
    catch (e) { message(e.message || 'Song naming could not finish. Keep your saved receipt and try again.', true); }
    finally { working = false; paint(); schedule(); }
  }
  function maybeApply() {
    const q = client.receipt, p = getPlayback();
    if (q?.result && q.id !== appliedId) {
      if (sourceSession !== null && sourceSession === p.session && p.info?.set === q.context.set && p.info?.seed === q.context.seed) {
        applyResult(q.id, q.result, p.info); appliedId = q.id; message('Your title is ready. The new beat will join on the next bar.');
      } else message('Your title and beat are saved. Choose Apply beat to add it to the set you are playing.');
    }
  }
  function schedule() {
    clearTimeout(timer);
    if (disposed) return;
    const q = client.receipt;
    if (q && ['pending', 'generating'].includes(q.status)) timer = setTimeout(() => void act(async () => {
      await client.check(); message(client.receipt.message); maybeApply();
    }), 6000);
  }
  $('name-song').addEventListener('click', () => void act(async () => {
    const selected = provider(); if (!selected) throw new Error('Open this page in a browser with an Ethereum wallet, then reload.');
    const p = getPlayback(); sourceSession = p.session;
    const context = await getSnapshot();
    message('Connecting your wallet and preparing the two-cent quote…');
    await client.getQuote(selected, context);
    const estimate = await client.walletCheck(selected);
    $('naming-fee').textContent = formatPepeUnits(estimate.feeWei) + ' ETH estimated network fee; your wallet shows the final fee.';
    message('Review the payment below. Confirming opens your wallet to approve the transfer.');
  }));
  $('naming-connection')?.addEventListener('click', () => void act(async () => {
    message('Checking the Keeper’s OpenAI connection…');
    const check = await client.request('checkConnection', {});
    message(check.message, !check.ok);
  }));
  $('naming-pay').addEventListener('click', () => void act(async () => {
    message('Review and confirm the PEPE transfer in your wallet.');
    await client.pay(provider()); message(client.receipt.message); maybeApply();
  }));
  $('naming-resume').addEventListener('click', () => void act(async () => { await client.check(); message(client.receipt.message); maybeApply(); }));
  $('naming-retry').addEventListener('click', () => void act(async () => { await client.retry(); message(client.receipt.message); }));
  $('naming-check-hash').addEventListener('click', () => void act(async () => { await client.check($('naming-recovery-hash').value.trim()); message(client.receipt.message); maybeApply(); }));
  $('naming-apply').addEventListener('click', () => {
    const p = getPlayback(), q = client.receipt;
    if (!q?.result || !p.info) return;
    applyResult(q.id, q.result, p.info); appliedId = q.id; message('The saved beat will join this set on its next bar.');
  });
  $('naming-download').addEventListener('click', () => {
    if (!client.receipt) return;
    const blob = new Blob([JSON.stringify(client.receipt, null, 2)], { type: 'application/json' }), url = URL.createObjectURL(blob), link = document.createElement('a');
    link.href = url; link.download = 'doodle-jazz-naming-receipt.json'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
  $('naming-import').addEventListener('change', event => void act(async () => {
    const file = event.target.files?.[0]; if (!file || file.size > 12000) throw new Error('Choose a Jazz naming receipt smaller than 12 KB.');
    client.importReceipt(JSON.parse(await file.text())); sourceSession = null; appliedId = null;
    await client.check(); message(client.receipt.message); maybeApply(); event.target.value = '';
  }));
  void act(async () => {
    const config = await client.config(); message(config.message);
    if (client.receipt) {
      if (client.receipt.status === 'sending') { client.receipt.status = 'uncertain'; client.save(); }
      await client.check();
      message(client.receipt.result ? 'Your saved title and beat are ready to use.' : client.receipt.message);
    }
  });
  return {
    playbackChanged() {
      const p = getPlayback();
      if (playingPartId && p.state !== lastPlaybackState) {
        if (p.state === 'paused') message('The named set is paused. Resume jazz to continue.');
        else if (p.state === 'playing') message('The new beat is playing.');
        else if (p.state === 'idle') { playingPartId = null; message('Your title and beat remain saved. Play jazz and choose Apply beat to use them again.'); }
      }
      lastPlaybackState = p.state; paint();
    },
    receive(info) {
      if (info.partApplied) { playingPartId = info.partApplied; message('The new beat is playing.'); return true; }
      if (info.partRejected) { appliedId = null; message('The set changed. Your title and beat are saved; choose Apply beat when you are ready.'); return true; }
      if (playingPartId && !info.namedTitle) { playingPartId = null; message('A fresh set is playing. Your title and beat are saved; choose Apply beat to use them again.'); }
      return false;
    },
    dispose() { disposed = true; clearTimeout(timer); window.removeEventListener('eip6963:announceProvider', announced); },
    resume() { if (!disposed) return; disposed = false; window.addEventListener('eip6963:announceProvider', announced); paint(); schedule(); }
  };
}
