// SPDX-License-Identifier: GPL-3.0-only
import { COIN_RULES, createFounderProposal, createFounderProof, verifyFounderProposal, verifyFounderProof, parseFounderFile, founderAddressFor, hexBytes } from './doodleverse-coin.mjs';
import { mineDoodleverseGpu } from './doodleverse-gpu.mjs';

const STORAGE = 'doodleverse-prelaunch-founder-proof-v1';
export function createDoodleverseCoinUI(container, { onUnlockRequest = () => {}, toast = () => {}, onActivity = () => {}, mineCandidate = mineDoodleverseGpu } = {}) {
  if (!container) throw new Error('A founder-proof container is required.');
  container.classList.add('doodleverse-coin');
  container.innerHTML = `
    <h2>Doodleverse Coin · founder proof</h2>
    <p>A Bitcoin-inspired project in prelaunch development. This page makes a signed allocation proposal and a checkable work proof. It does not launch a blockchain or create spendable coins.</p>
    <div class="dvc-facts"><p><strong>Certificate allocation</strong><span>1,000,000 DVC</span></p><p><strong>Founder share of this allocation</strong><span>100%</span></p><p><strong>Spendable here</strong><span>0 DVC</span></p></div>
    <p class="dvc-notice">This certificate proposes 1,000,000 DVC for one founder address. A live genesis, total network supply, and future issuance rules have not been adopted. A successful proof meets a hash target; it does not prove GPU ownership, a million independent coin discoveries, decentralized consensus, Bitcoin compatibility, or monetary value. Multiple proofs do not create extra coins. Private Doodle Coins and public DGT tokens do not convert into this proposal.</p>
    <p>Anyone can make a self-signed proposal for their own key. Compare the full founder address and proposal hash below with the project’s published certificate. Local verification does not establish the official DVC founder or a canonical genesis, and this page does not pin an official founder key.</p>
    <p data-dvc-field="identity">Unlock your existing creator vault to sign. No key or password is created by this page.</p>
    <button type="button" data-dvc-action="unlock">Open creator vault</button>
    <label>Work difficulty for a new proposal <select data-dvc-field="difficulty"><option value="16">16 bits · shorter test</option><option value="20" selected>20 bits · standard test</option><option value="24">24 bits · longer test</option></select></label>
    <label class="dvc-consent"><input type="checkbox" data-dvc-field="consent"> I understand that all 1,000,000 DVC in this prelaunch certificate are proposed for its founder, future network issuance remains unadopted, and the address and signature become public if I share it.</label>
    <button type="button" data-dvc-action="create">Create signed allocation proposal</button>
    <p data-dvc-field="founder">No founder proposal selected.</p>
    <p data-dvc-field="proposal">No signed proposal yet.</p>
    <p data-dvc-field="gpu"></p>
    <div class="dvc-actions"><button type="button" data-dvc-action="start">Start GPU proof</button><button type="button" data-dvc-action="stop">Stop</button></div>
    <p>Start runs only while this view is visible, for at most 60 seconds or 4,194,304 candidates. Stop ends new work; a small already-submitted GPU batch may finish. Leaving this view, hiding the page, or locking the vault cancels the attempt. It never resumes automatically.</p>
    <p data-dvc-field="progress" role="status">GPU proof stopped.</p>
    <p data-dvc-field="proof">No verified work proof.</p>
    <div class="dvc-actions"><button type="button" data-dvc-action="export">Export selected proposal</button><button type="button" data-dvc-action="copy">Copy selected proposal</button><button type="button" data-dvc-action="import">Import & verify proposal or proof</button><button type="button" data-dvc-action="verify">Verify selected file again</button></div>
    <label data-dvc-field="copy-panel" hidden>Public record — copy or save as a JSON file <textarea data-dvc-field="copy-text" aria-label="Public proposal or proof JSON" readonly rows="10" spellcheck="false"></textarea></label>
    <input type="file" data-dvc-field="file" accept="application/json,.json" hidden>
    <p>Only a public proposal or proof is exported. Verification needs no password or private key. A future launch must select one published genesis and add independently validating nodes, signed transfers, and double-spend handling.</p>
    <p data-dvc-field="status" class="dvc-status" role="status" aria-live="polite">Nothing is uploaded, published, or transferred by this page.</p>`;
  const field = name => container.querySelector(`[data-dvc-field="${name}"]`);
  const button = name => container.querySelector(`[data-dvc-action="${name}"]`);
  let identity = null, ownAddress = null, proposal = null, bundle = null, verification = null;
  let visible = false, generation = 0, busy = false, active = null, destroyed = false, restoreAllowed = true;
  const gpuAvailable = () => typeof mineCandidate === 'function' && (mineCandidate !== mineDoodleverseGpu || !!globalThis.navigator?.gpu);
  function status(message) { if (!destroyed) field('status').textContent = message; }
  function render() {
    if (destroyed) return;
    const owns = !!identity && ownAddress && proposal?.manifest.founderAddress === ownAddress;
    field('identity').textContent = identity ? `Creator vault unlocked. Signing address: ${ownAddress ?? 'checking…'}` : 'Unlock your existing creator vault to sign. No key or password is created by this page.';
    field('founder').textContent = proposal ? `Public founder address: ${proposal.manifest.founderAddress}` : 'No founder proposal selected.';
    field('proposal').textContent = proposal ? `Signed proposal · ${proposal.manifest.network} · genesis proposal format ${proposal.manifest.genesisVersion}, live genesis unadopted · ${proposal.manifest.pow.difficulty}-bit target · ${verification?.proposalHash ?? 'checking…'}` : 'No signed proposal yet.';
    field('gpu').textContent = gpuAvailable() ? 'WebGPU backend available to request on Start. Browser and adapter checks run then; no CPU mining fallback.' : 'WebGPU is unavailable here. You can still create, export, and verify proposals. Use a compatible secure browser for GPU proof work.';
    field('proof').textContent = bundle && verification?.valid ? `Verified prelaunch proof: ${verification.proofId}. Its signed proposal allocates 1,000,000 DVC to the address above. Spendable coins here: 0.` : 'No verified work proof. A signed proposal alone does not demonstrate proof of work.';
    button('create').disabled = busy || !!active || !identity || !ownAddress || !field('consent').checked;
    button('start').disabled = busy || !!active || !proposal || !owns || !field('consent').checked || !visible || document.hidden || !gpuAvailable();
    button('stop').disabled = !active && !busy;
    button('export').disabled = !proposal || busy;
    button('copy').disabled = !proposal || busy;
    button('verify').disabled = !proposal || busy;
    button('import').disabled = busy;
    button('unlock').disabled = busy;
    field('difficulty').disabled = busy || !!active;
    button('export').textContent = bundle ? 'Export verified proof' : 'Export selected proposal';
    button('copy').textContent = bundle ? 'Copy public proof' : 'Copy selected proposal';
  }
  function stop(reason = 'GPU proof stopped. Start is always a separate click.') {
    generation++; active?.controller.abort(); if (active?.timer) clearTimeout(active.timer); active = null; busy = false;
    if (!destroyed) { field('progress').textContent = reason; render(); }
  }
  function savePublicFile() {
    try { localStorage.setItem(STORAGE, JSON.stringify(bundle ?? proposal)); }
    catch { status('This public proposal is only in this tab. Export it to keep a copy.'); }
  }
  function selected(value, verified, kind) {
    proposal = kind === 'proof' ? value.proposal : value; bundle = kind === 'proof' ? value : null; verification = verified;
    field('copy-text').value = ''; field('copy-panel').hidden = true;
    field('consent').checked = false; render();
  }
  async function task(operation) {
    if (busy || destroyed) return;
    const ticket = ++generation; busy = true; render();
    try { onActivity(); await operation(ticket); }
    catch (error) { if (ticket === generation && !destroyed) { const message = String(error?.message || error).slice(0, 400); status(message); toast(message); } }
    finally { if (ticket === generation && !destroyed) { busy = false; render(); } }
  }
  const current = ticket => ticket === generation && !destroyed;
  async function create(ticket) {
    if (!identity || !field('consent').checked) throw new Error('Unlock your vault and acknowledge the full founder allocation first.');
    restoreAllowed = false;
    const signer = identity;
    const next = await createFounderProposal(signer, { difficulty: Number(field('difficulty').value) });
    const verified = await verifyFounderProposal(next);
    if (!current(ticket) || signer !== identity) return;
    selected(next, verified, 'proposal'); field('consent').checked = true; render(); savePublicFile();
    status('Signed founder-allocation proposal created locally. Review its address, then click Start GPU proof if you want to work on it.');
  }
  async function start(ticket) {
    if (!proposal || !identity || ownAddress !== proposal.manifest.founderAddress || !field('consent').checked) throw new Error('Unlock the matching creator vault and acknowledge this proposal’s founder allocation.');
    if (!visible || document.hidden || !gpuAvailable()) throw new Error('GPU proof work needs this visible view and a compatible secure browser.');
    const selectedProposal = proposal, signer = identity, controller = new AbortController();
    const session = { controller, timer: setTimeout(() => { if (active === session) stop('Stopped at the 60-second session limit. No automatic restart.'); }, COIN_RULES.maxMiningMs) };
    active = session; field('progress').textContent = 'Preparing this signed proposal’s work challenge. Stop is available.'; render();
    try {
      const verified = await verifyFounderProposal(selectedProposal);
      if (!current(ticket) || active !== session || controller.signal.aborted || !visible || document.hidden || identity !== signer) return;
      const entropy = crypto.getRandomValues(new Uint32Array(2)), startNonce = ((BigInt(entropy[0]) << 32n) | BigInt(entropy[1])).toString();
      const result = await mineCandidate({ prefix: hexBytes(verified.challengeHex), difficultyBits: verified.difficulty,
        startNonce, signal: controller.signal, isVisible: () => current(ticket) && visible && !document.hidden && identity === signer,
        maxMs: COIN_RULES.maxMiningMs, maxCandidates: COIN_RULES.maxCandidates,
        onProgress(progress) {
          if (!current(ticket) || active !== session) return;
          const count = typeof progress === 'number' ? progress : progress?.attempts;
          if (Number.isSafeInteger(count) && count >= 0 && count <= COIN_RULES.maxCandidates) field('progress').textContent = `GPU proof running: ${count.toLocaleString()} candidates reported this session. This count is not part of the cryptographic proof.`;
        },
      });
      if (!current(ticket) || active !== session || controller.signal.aborted || !visible || document.hidden || identity !== signer) return;
      if (result?.nonce !== undefined) {
        const found = await createFounderProof(selectedProposal, result.nonce), checked = await verifyFounderProof(found);
        if (result.digest !== found.proof.digest) throw new Error('GPU result disagreed with independent CPU verification. No proof was accepted.');
        if (!current(ticket) || active !== session || controller.signal.aborted || !visible || document.hidden || identity !== signer) return;
        bundle = found; verification = checked; field('copy-text').value = ''; field('copy-panel').hidden = true; savePublicFile();
        field('progress').textContent = 'GPU candidate independently verified. Work has stopped.';
        status('Proof complete for this prelaunch allocation proposal. You can export it for independent verification. No blockchain was launched and no spendable coin was issued.');
      } else if (result?.stopped) field('progress').textContent = 'GPU proof stopped. No new proof was accepted.';
      else if (result?.exhausted) field('progress').textContent = 'GPU proof stopped at its bounded limit without a result. Start another session only if you choose.';
      else throw new Error('GPU backend returned an invalid result. No proof was accepted.');
    } finally { if (active === session) { clearTimeout(session.timer); active = null; render(); } }
  }
  async function verify(ticket) {
    const target = bundle ?? proposal;
    const checked = bundle ? await verifyFounderProof(bundle) : await verifyFounderProposal(proposal);
    if (!current(ticket) || target !== (bundle ?? proposal)) return;
    verification = checked; render();
    status(bundle ? 'Signature, allocation rules, work digest, and target all verify locally. This verifies a self-signed prelaunch proposal, not official project authority.' : 'Founder signature and fixed allocation rules verify. This self-signed proposal does not yet contain a valid work proof or establish project authority.');
  }
  const publicFileText = () => JSON.stringify(bundle ?? proposal, null, 2) + '\n';
  function exportFile() {
    if (!proposal) return;
    const id = (bundle ? verification?.proofId : verification?.proposalHash) ?? 'proposal';
    const url = URL.createObjectURL(new Blob([publicFileText()], { type: 'application/json' }));
    const link = document.createElement('a'); link.href = url; link.download = `doodleverse-prelaunch-${bundle ? 'proof' : 'proposal'}-${id.slice(0, 12)}.json`; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    status('Public-file download requested. It contains no vault private key or password. If it does not arrive, use Copy to save the public record.');
  }
  async function copyPublicFile() {
    if (!proposal) return;
    const text = publicFileText(), record = bundle ?? proposal, ticket = generation;
    field('copy-text').value = text; field('copy-panel').hidden = false;
    try {
      if (!globalThis.navigator?.clipboard?.writeText) throw new Error('Clipboard unavailable.');
      await navigator.clipboard.writeText(text);
      if (current(ticket) && record === (bundle ?? proposal)) status('Public record copied. The same JSON is shown below for saving or independent verification. It contains no private key or password.');
    } catch {
      if (current(ticket) && record === (bundle ?? proposal)) {
        status('Clipboard unavailable. Select the public JSON below and copy or save it manually. It contains no private key or password.');
        field('copy-text').focus(); field('copy-text').select();
      }
    }
  }
  const click = event => {
    const action = event.target.closest('[data-dvc-action]')?.dataset.dvcAction;
    if (action === 'stop') { stop(); return; }
    if (action === 'unlock') { onUnlockRequest(); return; }
    if (action === 'create') void task(create);
    if (action === 'start') void task(start);
    if (action === 'verify') void task(verify);
    if (action === 'export' && !busy) exportFile();
    if (action === 'copy' && !busy) void copyPublicFile();
    if (action === 'import' && !busy) field('file').click();
  };
  const importFile = async () => {
    const file = field('file').files?.[0]; field('file').value = ''; if (!file) return;
    restoreAllowed = false;
    stop('Stopped before importing a proposal.');
    await task(async ticket => {
      if (file.size > COIN_RULES.maxBundleBytes) throw new Error('Choose a proposal or proof smaller than 32 KB.');
      const parsed = await parseFounderFile(await file.text());
      if (!current(ticket)) return;
      selected(parsed.value, parsed.verified, parsed.kind); savePublicFile();
      status(parsed.kind === 'proof' ? 'Imported proof verified locally. Its allocation is a prelaunch proposal; spendable coins here remain zero.' : 'Imported founder signature verified. This proposal still needs a work proof.');
    });
  };
  const visibility = () => { if (document.hidden) stop('Stopped because the page was hidden. No automatic restart.'); else render(); };
  const pagehide = () => stop('Stopped when leaving the page.');
  const consent = () => { if (!field('consent').checked && (active || busy)) stop('Stopped because the allocation acknowledgement was removed.'); render(); };
  container.addEventListener('click', click); field('file').addEventListener('change', importFile); field('consent').addEventListener('change', consent);
  document.addEventListener('visibilitychange', visibility); window.addEventListener('pagehide', pagehide);
  render();
  // Only public verification runs on restore. There is no automatic signing, key creation, or mining.
  try {
    const saved = localStorage.getItem(STORAGE);
    if (saved) void parseFounderFile(saved).then(parsed => { if (!destroyed && restoreAllowed && !proposal) { selected(parsed.value, parsed.verified, parsed.kind); status('Restored a verified public prelaunch file from this browser. Mining remains stopped.'); } }).catch(() => { if (!destroyed && restoreAllowed && !proposal) status('Saved prelaunch data did not verify. Import a known-good exported copy.'); });
  } catch { /* Public export remains available without browser storage. */ }
  return {
    unlock(who) {
      stop('Vault identity changed. Mining remains stopped.'); identity = who; ownAddress = null; field('consent').checked = false;
      void founderAddressFor(who.publicKey).then(value => { if (!destroyed && identity === who) { ownAddress = value; render(); } }).catch(error => { if (!destroyed && identity === who) status(error.message); });
      render();
    },
    lock() { stop('Stopped because the vault locked. Public proofs remain available to verify.'); identity = null; ownAddress = null; field('consent').checked = false; render(); },
    setVisible(value) { visible = !!value; if (!visible) stop('Stopped because you left the founder-proof view. No automatic restart.'); render(); },
    stop,
    destroy() {
      stop(); destroyed = true; identity = null; ownAddress = null;
      container.removeEventListener('click', click); field('file').removeEventListener('change', importFile); field('consent').removeEventListener('change', consent);
      document.removeEventListener('visibilitychange', visibility); window.removeEventListener('pagehide', pagehide);
    },
  };
}
