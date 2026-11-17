// SPDX-License-Identifier: GPL-3.0-only
import { mineScryptGpu } from './dvc-scrypt-miner.mjs';
const $ = id => document.getElementById(id);
let connected = false, controller = null, count = 0;
const lines = [];
function log(kind, message) {
  lines.push(`${new Date().toLocaleTimeString()} ${kind} ${message}`);
  if (lines.length > 80) lines.shift();
  $('console').textContent = lines.join('\n'); $('console').scrollTop = $('console').scrollHeight;
}
function controls() {
  $('mine').disabled = !!controller || !connected;
  $('stop').disabled = !controller;
  for (const id of ['address', 'intensity', 'check-gpu', 'refresh']) $(id).disabled = !!controller;
  document.body.classList.toggle('mining', !!controller);
}
async function api(path, body, signal) {
  const response = await fetch('./scrypt/' + path, { method: body ? 'POST' : 'GET', headers: body ? { 'Content-Type': 'application/json', 'X-Keeper-Request': '1' } : {}, ...(body ? { body: JSON.stringify(body) } : {}), cache: 'no-store', signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(12000)]) : AbortSignal.timeout(12000) });
  const result = await response.json();
  if (!response.ok) throw Object.assign(Error(result.error || 'Node connection failed.'), { status: response.status });
  return result;
}
async function refresh() {
  try {
    const status = await api('status'); connected = status.connected;
    $('network').textContent = connected ? `${status.network} · block ${status.height} · ${status.peers} peer(s) · test coins only` : status.message;
    log('GODDIT', connected ? 'Pinned Doodleverse test node connected.' : status.message);
  } catch (error) { connected = false; $('network').textContent = error.message; log('ERROR', error.message); }
  controls();
}
function stop(reason = 'Stopped by you.') { controller?.abort(); $('mining-status').textContent = reason; log('GITTIT', reason); }
$('stop').addEventListener('click', () => stop());
$('refresh').addEventListener('click', refresh);
$('keep-mining').addEventListener('change', () => { if (controller && !$('keep-mining').checked) stop('Keep mining turned off.'); });
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
  const current = new AbortController(); controller = current; controls();
  const address = $('address').value.trim(), intensity = $('intensity').value;
  log('GITTIT', checkOnly ? 'CHECK GPU — disposable self-test; no block submission.' : `MINE NOW — Scrypt, ${intensity}, receiving address ${address}`);
  try {
    do {
      let job;
      if (checkOnly) job = { header: '00'.repeat(80), target: '7f' + 'ff'.repeat(31) };
      else job = await api('job', { address }, current.signal);
      if (current.signal.aborted) break;
      $('mining-status').textContent = checkOnly ? 'Checking Scrypt on your GPU…' : `Mining test block ${job.height}…`;
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
        try { accepted = await api('submit', { id: job.id, nonce: result.nonce }, current.signal); }
        catch (error) {
          if (error.status === 409 && $('keep-mining').checked && !current.signal.aborted) {
            log('GODDIT', 'Chain changed before acceptance; getting fresh work.');
            await delay(current.signal, 2500); continue;
          }
          throw error;
        }
        count++; $('accepted').textContent = String(count);
        $('mining-status').textContent = `Test block ${accepted.height} accepted. Reward matures after ${accepted.maturity} confirmations.`;
        log('GODDIT', `Node accepted block ${accepted.hash}; reward ${(accepted.rewardAtoms / 1e8).toFixed(8)} test DVC to ${accepted.address}.`);
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
refresh();
