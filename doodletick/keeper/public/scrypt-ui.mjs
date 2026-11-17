// SPDX-License-Identifier: GPL-3.0-only
import { mineScryptGpu } from './dvc-scrypt-miner.mjs';
const $ = id => document.getElementById(id);
let connected = false, controller = null, checkingNode = false, count = 0, nodeStatus = null;
const lines = [];
const COMMANDS = new Set(['help', 'status', 'check node', 'check gpu', 'mine', 'stop', 'keep on', 'keep off', 'intensity eco', 'intensity balanced', 'clear']);
// Wallet links transfer a public receiving address only. They never start work.
if (typeof location !== 'undefined') {
  const match = location.hash.match(/^#address=([1-9A-HJ-NP-Za-km-z]{26,35})$/);
  if (match) $('address').value = match[1];
}
const coinName = () => nodeStatus?.network === 'main' ? 'DVC' : 'test DVC';
function showNode() {
  if (!nodeStatus?.connected) return;
  $('network').textContent = `${nodeStatus.network} · block ${nodeStatus.height} · ${nodeStatus.peers} peer(s) · ${coinName()}`;
  $('network-tag').textContent = nodeStatus.network === 'main' ? 'DVC MAIN NETWORK · BETA' : 'SCRYPT TEST NETWORK';
  $('network-description').textContent = nodeStatus.network === 'main'
    ? 'Mine native Doodleverse coins and send matured rewards from your encrypted wallet. This new network is experimental; connected nodes determine its accepted history.'
    : 'This node uses disposable test coins. Test rewards and wallets stay separate from the main Doodleverse network.';
}
function log(kind, message) {
  const text = String(message).replace(/[\u0000-\u0008\u000b-\u001f\u007f\u202a-\u202e\u2066-\u2069]/g, '').slice(0, 1024);
  lines.push(`${new Date().toLocaleTimeString()} ${kind} ${text}`);
  if (lines.length > 80) lines.shift();
  $('console').textContent = lines.join('\n'); $('console').scrollTop = $('console').scrollHeight;
}
function controls() {
  $('mine').disabled = !!controller || !connected;
  $('stop').disabled = !controller;
  for (const id of ['address', 'intensity', 'check-gpu', 'refresh']) $(id).disabled = !!controller;
  $('refresh').disabled = !!controller || checkingNode;
  document.body.classList.toggle('mining', !!controller);
}
async function api(path, body, signal) {
  const response = await fetch('./scrypt/' + path, { method: body ? 'POST' : 'GET', headers: body ? { 'Content-Type': 'application/json', 'X-Keeper-Request': '1' } : {}, ...(body ? { body: JSON.stringify(body) } : {}), cache: 'no-store', signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(12000)]) : AbortSignal.timeout(12000) });
  const result = await response.json();
  if (!response.ok) throw Object.assign(Error(result.error || 'Node connection failed.'), { status: response.status });
  return result;
}
async function refresh() {
  if (controller || checkingNode) return;
  checkingNode = true; controls();
  try {
    const status = await api('status'); connected = status.connected; nodeStatus = status;
    if (connected) showNode(); else $('network').textContent = status.message;
    log('GODDIT', connected ? 'Pinned Doodleverse node connected.' : status.message);
  } catch (error) { connected = false; $('network').textContent = error.message; log('ERROR', error.message); }
  checkingNode = false; controls();
}
function stop(reason = 'Stopped by you.') { controller?.abort(); $('mining-status').textContent = reason; log('GITTIT', reason); }
function setKeepMining(enabled) {
  $('keep-mining').checked = enabled;
  if (controller && !enabled) stop('Keep mining turned off.');
  else log('GODDIT', enabled ? (controller ? 'Keep mining is on for this session.' : 'Keep mining is on. Press MINE NOW or run mine to start.') : 'Keep mining is off.');
}
$('stop').addEventListener('click', () => stop());
$('refresh').addEventListener('click', refresh);
$('keep-mining').addEventListener('change', () => setKeepMining($('keep-mining').checked));
document.addEventListener('visibilitychange', () => { if (document.hidden && controller) stop('Tab hidden. Press MINE NOW to resume.'); });
window.addEventListener('pagehide', () => controller?.abort());
const delay = (signal, ms) => new Promise((resolve, reject) => {
  if (signal.aborted) { reject(new DOMException('Stopped', 'AbortError')); return; }
  const abort = () => { clearTimeout(timer); reject(new DOMException('Stopped', 'AbortError')); };
  const timer = setTimeout(() => { signal.removeEventListener('abort', abort); resolve(); }, ms);
  signal.addEventListener('abort', abort, { once: true });
});
async function run(checkOnly) {
  if (controller || document.hidden || (!checkOnly && !connected)) return;
  const address = $('address').value.trim(), intensity = $('intensity').value;
  if (!checkOnly && !/^[1-9A-HJ-NP-Za-km-z]{26,35}$/.test(address)) { log('ERROR', 'Enter a Doodleverse receiving address in the field above before mining.'); return; }
  const current = new AbortController(); controller = current; controls();
  log('GITTIT', checkOnly ? 'CHECK GPU — disposable self-test; no block submission.' : `MINE NOW — Scrypt, ${intensity}, receiving address ${address}`);
  try {
    do {
      let job;
      if (checkOnly) job = { header: '00'.repeat(80), target: '7f' + 'ff'.repeat(31) };
      else job = await api('job', { address }, current.signal);
      if (current.signal.aborted) break;
      $('mining-status').textContent = checkOnly ? 'Checking Scrypt on your GPU…' : `Mining ${coinName()} block ${job.height}…`;
      const result = await mineScryptGpu({ header: Uint8Array.from(job.header.match(/../g), byte => parseInt(byte, 16)), target: job.target,
        signal: current.signal, isVisible: () => !document.hidden, intensity, maxSeconds: 60, ...(checkOnly ? { maxCandidates: intensity === 'eco' ? 64 : 128 } : {}),
        onProgress: progress => { $('hashrate').textContent = Math.round(progress.attempts / Math.max(.001, progress.elapsedMs / 1000)).toLocaleString(); } });
      if (current.signal.aborted) break;
      if (result.status === 'stopped') { $('mining-status').textContent = 'Mining stopped before the round completed. Press again to retry.'; log('GODDIT', 'GPU round stopped without a submission.'); break; }
      $('hashrate').textContent = Math.round(result.attempts / Math.max(.001, result.elapsedMs / 1000)).toLocaleString();
      if (checkOnly) {
        if (!['found', 'exhausted'].includes(result.status) || result.attempts !== (intensity === 'eco' ? 64 : 128)) throw Error('The GPU check did not finish. No successful check was recorded.');
        $('mining-status').textContent = 'GPU Scrypt self-tests passed. Your GPU can run this miner.'; log('GODDIT', `GPU Scrypt self-tests passed; ${result.attempts} disposable candidates checked.`); break;
      }
      if (!result.attempts) throw Error('The GPU round ended before any mining work was completed.');
      if (result.status === 'found') {
        let accepted;
        // Once a valid block is sent, stopping GPU work cannot revoke its node
        // acceptance. Keep the bounded receipt request alive so Stop never hides
        // an already accepted reward; no further job starts after cancellation.
        try { accepted = await api('submit', { id: job.id, nonce: result.nonce }); }
        catch (error) {
          if (error.status === 409 && $('keep-mining').checked && !current.signal.aborted) {
            log('GODDIT', 'Chain changed before acceptance; getting fresh work.');
            await delay(current.signal, 2500); continue;
          }
          throw error;
        }
        count++; $('accepted').textContent = String(count);
        if (nodeStatus) {
          nodeStatus.height = accepted.height;
          showNode();
        }
        $('mining-status').textContent = `${current.signal.aborted ? 'Mining stopped. Last submitted b' : 'B'}lock ${accepted.height} accepted. Reward matures after ${accepted.maturity} confirmations.`;
        log('GODDIT', `Node accepted block ${accepted.hash}; reward ${(accepted.rewardAtoms / 1e8).toFixed(8)} ${coinName()} to ${accepted.address}.`);
      } else { $('mining-status').textContent = 'Round finished without a block.'; log('GODDIT', `Round finished: ${result.attempts} hashes.`); }
      if (!$('keep-mining').checked) break;
      await delay(current.signal, 2500);
    } while (!current.signal.aborted && !document.hidden);
  } catch (error) {
    if (!current.signal.aborted) { $('mining-status').textContent = 'Mining stopped. ' + error.message; log('ERROR', error.message); }
  } finally { controller = null; controls(); }
}
$('mining-form').addEventListener('submit', event => { event.preventDefault(); run(false); });
$('check-gpu').addEventListener('click', () => run(true));
function submitCommand() {
  const raw = $('command-input').value; $('command-input').value = '';
  // No shell, arbitrary RPC, address or key arguments. Never echo rejected text.
  const command = /^[a-z \t]{1,80}$/i.test(raw) ? raw.trim().toLowerCase().replace(/[ \t]+/g, ' ') : '';
  if (!COMMANDS.has(command)) { log('ERROR', 'Unknown command. Type help for the command list.'); return; }
  if (command === 'clear') { lines.length = 0; log('GODDIT', 'Console cleared.'); return; }
  log('GITTIT', command);
  if (document.hidden && !['help', 'status', 'stop', 'keep off'].includes(command)) { log('ERROR', 'Return to this tab before running that command.'); return; }
  if (controller && (command === 'mine' || command.startsWith('check ') || command.startsWith('intensity '))) { log('ERROR', 'Mining is busy. Stop the current round before running that command.'); return; }
  if (command === 'help') {
    log('GODDIT', 'Commands: help · status · check node · check gpu · mine · stop · keep on · keep off · intensity eco · intensity balanced · clear.\nMine uses the receiving address above. Keep on never starts mining by itself.');
  } else if (command === 'status') {
    log('GODDIT', `${$('network').textContent}\nMining: ${controller ? 'running' : 'stopped'} · Scrypt · ${$('intensity').value} · Keep mining: ${$('keep-mining').checked ? 'on' : 'off'}.`);
  } else if (command === 'check node') {
    if (checkingNode) log('ERROR', 'A node check is already running.'); else refresh();
  } else if (command === 'check gpu') run(true);
  else if (command === 'mine') {
    if (!connected) log('ERROR', 'Connect your Doodleverse test node before mining. Use check node to check its connection.'); else run(false);
  } else if (command === 'stop') stop();
  else if (command === 'keep on' || command === 'keep off') setKeepMining(command === 'keep on');
  else if (command === 'intensity eco' || command === 'intensity balanced') {
    $('intensity').value = command.slice('intensity '.length); log('GODDIT', `GPU intensity is ${$('intensity').value}.`);
  }
}
$('command-form').addEventListener('submit', event => { event.preventDefault(); submitCommand(); });
refresh();
