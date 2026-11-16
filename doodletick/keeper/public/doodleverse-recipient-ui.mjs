// SPDX-License-Identifier: GPL-3.0-only
import { COIN_RULES, founderAddressFor, verifyFounderProof, hexBytes } from './doodleverse-coin.mjs';
import { createRecipientProposal, recipientTypedData, recipientContext, verifyRecipientAuthorization, createRecipientProof, verifyRecipientProof, parseRecipientFile } from './doodleverse-recipient.mjs';
import { createDoodleverseWallet } from './doodleverse-wallet.mjs';
import { createEthereumReadService } from './doodleverse-rpc.mjs';
import { mineDoodleverseGpu } from './doodleverse-gpu.mjs';

const STORAGE = 'doodleverse-founder-recipient-v2';
const MAX_FILE_BYTES = 65536;
export function createDoodleverseRecipientUI(container, { onUnlockRequest = () => {}, onActivity = () => {}, toast = () => {}, walletFactory = createDoodleverseWallet, readServiceFactory = createEthereumReadService, mineCandidate = mineDoodleverseGpu } = {}) {
  container.classList.add('doodleverse-recipient');
  container.innerHTML = `
    <h2>Link your wallet recipient</h2>
    <p>Keep the creator proof above and add your self-custody wallet as its proposed recipient. Both your creator vault and wallet must approve. Then fresh GPU work binds their signatures.</p>
    <p>Proposed allocation: <strong>1,000,000 DVC</strong>. Spendable DVC: <strong>0</strong>. This does not create a token in Coinbase Wallet or authorize any payment, token allowance, delegation or wallet deployment.</p>
    <p data-dvr-field="source">Finish or import a verified creator proof above first.</p>
    <p data-dvr-field="identity">Unlock the same creator vault to link its proof.</p>
    <button type="button" data-dvr-action="unlock">Open creator vault</button>
    <div class="dvc-actions"><button type="button" data-dvr-action="discover">Find browser wallets</button><button type="button" data-dvr-action="disconnect">Disconnect recipient wallet</button></div>
    <label>Wallet extension <select data-dvr-field="provider" aria-label="Wallet extension"><option value="">Choose a browser wallet</option></select></label>
    <button type="button" data-dvr-action="connect">Connect selected wallet</button>
    <p>Wallet names are supplied by extensions. Choose the extension you installed. Connect reveals its selected public address; no balance or transaction history is requested.</p>
    <p data-dvr-field="window-panel" hidden><a data-dvr-field="window-link" target="_blank" rel="noopener noreferrer">Open this Keeper in a wallet window</a> if your extension is unavailable inside Home Assistant. Keep the same HTTPS address for your saved vault.</p>
    <label>Recipient account <select data-dvr-field="account" aria-label="Recipient account"><option value="">Connect a wallet first</option></select></label>
    <p data-dvr-field="connection">No recipient wallet connected.</p>
    <details><summary>Blockchain read service</summary>
      <p>If your wallet connects but cannot check Ethereum blocks, choose PublicNode for those reads. Your selected wallet still connects your account and signs the message.</p>
      <label>Blockchain read service <select data-dvr-field="read-service" aria-label="Blockchain read service"><option value="wallet" selected>Connected wallet (default)</option><option value="publicnode">PublicNode · Ethereum only</option></select></label>
      <p>PublicNode is an optional service operated by Allnodes at <a href="https://ethereum.publicnode.com/" target="_blank" rel="noopener noreferrer">ethereum-rpc.publicnode.com</a>. When you choose it and review or verify a record, it receives your IP address, public wallet address and block queries. Smart-wallet verification also sends the public message digest and signature. It receives no vault password or private key.</p>
      <p>This choice lasts only in this page. It makes no request by itself and never changes automatically. You rely on the selected service for blockchain data; both routes keep the exact-block checks.</p>
    </details>
    <label>Linked proof difficulty <select data-dvr-field="difficulty"><option value="16">16 bits · shorter test</option><option value="20" selected>20 bits · standard test</option><option value="24">24 bits · longer test</option></select></label>
    <button type="button" data-dvr-action="review">Review wallet recipient</button>
    <p data-dvr-field="review">Review prepares a new creator-signed proposal. Your original proof stays unchanged.</p>
    <details data-dvr-field="message-panel" hidden><summary>Exact wallet message</summary><pre data-dvr-field="message"></pre></details>
    <label class="dvc-consent"><input type="checkbox" data-dvr-field="consent"> I have checked the full recipient address and network. I understand this is a prelaunch proposal with zero spendable DVC, and sharing it makes the address and signatures public.</label>
    <button type="button" data-dvr-action="sign">Sign recipient message in wallet</button>
    <div class="dvc-actions"><button type="button" data-dvr-action="start">Start wallet-linked GPU proof</button><button type="button" data-dvr-action="stop">Cancel wallet work</button></div>
    <p>Each GPU run stops after 60 seconds or 4,194,304 candidates. Leaving this view, hiding the page, locking your vault, changing wallets or withdrawing consent cancels unfinished work. Cancel discards late replies but cannot close a wallet’s own prompt.</p>
    <p data-dvr-field="progress" role="status">Wallet proof stopped.</p>
    <p data-dvr-field="record">No verified recipient record selected.</p>
    <div class="dvc-actions"><button type="button" data-dvr-action="export">Export recipient record</button><button type="button" data-dvr-action="copy">Copy recipient record</button><button type="button" data-dvr-action="import">Import recipient record</button><button type="button" data-dvr-action="verify">Verify recipient record again</button></div>
    <label data-dvr-field="copy-panel" hidden>Public recipient record <textarea data-dvr-field="copy-text" aria-label="Public wallet recipient JSON" readonly rows="10" spellcheck="false"></textarea></label>
    <input type="file" data-dvr-field="file" accept="application/json,.json" hidden>
    <p data-dvr-field="status" class="dvc-status" role="status" aria-live="polite">Nothing is uploaded or published by this flow. Your existing creator proof and vault are preserved.</p>`;
  const field = name => container.querySelector(`[data-dvr-field="${name}"]`);
  const button = name => container.querySelector(`[data-dvr-action="${name}"]`);
  field('read-service').value = 'wallet';
  let identity = null, ownAddress = null, source = null, sourceCheck = null, sourceEpoch = 0;
  let prepared = null, authorization = null, snapshot = null, record = null, verified = null, pendingImport = null;
  let visible = false, destroyed = false, busy = false, generation = 0, controller = null, timer = null, restoreAllowed = true;
  const gpuAvailable = () => mineCandidate !== mineDoodleverseGpu || !!globalThis.navigator?.gpu;
  function status(text) { if (!destroyed) field('status').textContent = text; }
  function options(select, entries, placeholder, current) {
    const fragment = document.createDocumentFragment();
    const empty = document.createElement('option'); empty.value = ''; empty.textContent = placeholder; fragment.append(empty);
    for (const entry of entries) { const option = document.createElement('option'); option.value = entry.value; option.textContent = entry.label; fragment.append(option); }
    select.replaceChildren(fragment); select.value = entries.some(entry => entry.value === current) ? current : '';
  }
  function renderWallet() {
    if (destroyed) return;
    const state = wallet.state(), current = field('provider').value;
    options(field('provider'), (state.providers ?? []).map(item => ({ value: item.id, label: item.name + (item.kind === 'legacy' ? ' · legacy connection' : '') })), 'Choose a browser wallet', state.providerId || current);
    options(field('account'), (state.accounts ?? []).map(address => ({ value: address, label: address })), state.accounts?.length ? 'Choose a recipient account' : 'Connect a wallet first', state.address);
    field('connection').textContent = state.address ? `Selected recipient: ${state.address} · EVM chain ID ${state.chainId}. Change the network in your wallet if needed; Doodle Tick does not switch it.` : 'No recipient selected. Connect your extension and choose an account.';
    render();
  }
  const wallet = walletFactory({ onChange(event) {
    if (destroyed) return;
    if (event.invalidated) stop('Wallet account, network or connection changed. Review the recipient again.', true);
    renderWallet();
  } });
  function render() {
    if (destroyed) return;
    const connected = wallet.state(), owns = !!source && !!identity && ownAddress === sourceCheck?.founderAddress;
    field('source').textContent = sourceCheck ? `Original creator proof: ${sourceCheck.proofId}. This proof is preserved unchanged.` : 'Finish or import a verified creator proof above first.';
    field('identity').textContent = identity ? `Unlocked creator: ${ownAddress ?? 'checking…'}` : 'Unlock the same creator vault to link its proof.';
    button('review').disabled = busy || !owns || !connected.address || !visible || document.hidden;
    button('sign').disabled = busy || !prepared || !!authorization || !field('consent').checked || !owns || !visible || document.hidden;
    button('start').disabled = busy || !authorization || !field('consent').checked || !owns || !visible || document.hidden || !gpuAvailable();
    button('stop').disabled = !busy && !prepared && !authorization;
    button('connect').disabled = busy || !field('provider').value;
    button('disconnect').disabled = !connected.providerId && !busy;
    button('discover').disabled = busy;
    button('unlock').disabled = busy;
    for (const name of ['provider', 'account', 'difficulty', 'read-service']) field(name).disabled = busy;
    for (const name of ['export', 'copy']) button(name).disabled = busy || !record || !verified;
    button('verify').disabled = busy || (!record && !pendingImport);
    button('import').disabled = busy;
    if (record && verified) {
      const context = recipientContext(record.proposal ?? record);
      field('record').textContent = `${record.proof ? 'Proposed recipient and fresh work verified' : verified.walletAuthorized ? 'Recipient signatures verified; fresh work still required' : 'Creator approval verified; wallet signature missing'}: ${context.address} · chain ${context.chainId} · ${verified.method ?? 'creator signature only'}. ${verified.proofId ?? verified.sourceProofId}. ${verified.expired ? 'Authorization expired: archived integrity only, new approval required for adoption.' : verified.notYetValid ? 'Authorization is not yet valid; new adoption is unavailable.' : 'Authorization is time-limited; signed times are not trusted timestamps.'} Spendable DVC: 0.`;
    } else field('record').textContent = pendingImport ? 'Imported recipient record is unverified. Connect the matching wallet/network for its chain-state check, then verify again.' : 'No verified recipient record selected.';
  }
  function clearDraft() {
    prepared = authorization = snapshot = null;
    field('consent').checked = false;
    field('message-panel').hidden = true; field('message').textContent = '';
    field('review').textContent = 'Review prepares a new creator-signed proposal. Your original proof stays unchanged.';
  }
  function stop(reason = 'Wallet work cancelled. No automatic restart.', discard = false) {
    generation++; controller?.abort(); controller = null; if (timer) clearTimeout(timer); timer = null; busy = false;
    if (discard) { wallet.cancel(); clearDraft(); }
    if (!destroyed) { field('progress').textContent = reason; render(); }
  }
  const current = ticket => !destroyed && ticket === generation;
  function guard(ticket, signer = null) {
    if (!current(ticket) || (signer && signer !== identity) || !visible || document.hidden) throw new Error('This recipient attempt was cancelled. Review it again.');
  }
  async function task(operation) {
    if (busy || destroyed) return;
    const ticket = ++generation; busy = true; controller = new AbortController(); const signal = controller.signal; render();
    try { onActivity(); await operation(ticket, signal); }
    catch (error) { if (current(ticket)) { const text = String(error?.message || error).slice(0, 400); status(text); toast(text); } }
    finally { if (current(ticket)) { busy = false; controller = null; if (timer) clearTimeout(timer); timer = null; render(); } }
  }
  function save(value, checked) {
    record = value; verified = checked; pendingImport = null; field('copy-text').value = ''; field('copy-panel').hidden = true;
    try { localStorage.setItem(STORAGE, JSON.stringify(value)); } catch { status('The public recipient record is only in this tab. Copy or export it to keep a copy.'); }
    render();
  }
  async function review(ticket, signal) {
    if (!identity || !source || ownAddress !== sourceCheck?.founderAddress) throw new Error('Unlock the creator vault that signed the original proof.');
    clearDraft(); const signer = identity, proof = source, proofId = '0x' + sourceCheck.proofId;
    const check = () => { guard(ticket, signer); if (source !== proof) throw new Error('The original proof changed. Review it again.'); };
    const nextSnapshot = await wallet.readRecipientContext({ sourceProofId: proofId, signal, guard: check }); check(); wallet.assertCurrent(nextSnapshot);
    const next = await createRecipientProposal(signer, proof, { ...nextSnapshot, difficulty: Number(field('difficulty').value), signal }); check(); wallet.assertCurrent(nextSnapshot);
    const typed = await recipientTypedData(next, { signal }); check(); wallet.assertCurrent(nextSnapshot);
    prepared = next; snapshot = nextSnapshot;
    const context = recipientContext(next);
    field('review').textContent = `Review: 1,000,000 proposed DVC to ${context.address} on EVM chain ${context.chainId}. Verification: ${context.accountType}, block ${context.verificationBlock.number}. Blockchain reads: ${nextSnapshot.readServiceId === 'publicnode-ethereum' ? 'PublicNode (Allnodes)' : 'connected wallet'}. Original creator: ${sourceCheck.founderAddress}. Approval expires ${new Date(next.manifest.expiresAt).toLocaleString()}. No coins or spending permissions are issued.`;
    field('message').textContent = JSON.stringify(typed, null, 2); field('message-panel').hidden = false;
    status('The creator vault signed this recipient proposal locally. Check its address and network, acknowledge, then choose Sign to open your wallet.'); render();
  }
  async function signRecipient(ticket, signal) {
    if (!prepared || !snapshot || !field('consent').checked || !identity) throw new Error('Review and acknowledge the recipient first.');
    const selected = prepared, selectedSnapshot = snapshot, signer = identity;
    const check = () => { guard(ticket, signer); wallet.assertCurrent(selectedSnapshot); if (prepared !== selected || !field('consent').checked) throw new Error('Recipient approval was cancelled.'); };
    check(); status('Review the Doodleverse Founder Recipient message in your wallet. This request has no payment or spending permission.');
    const signed = await wallet.signRecipient(selected, { snapshot: selectedSnapshot, signal, guard: check }); check();
    const checked = await verifyRecipientAuthorization(signed, { signal, requireFresh: true, verifyContractSignature: wallet.verifier({ snapshot: selectedSnapshot, signal, guard: check }) }); check();
    authorization = signed; restoreAllowed = false; save(signed, checked);
    status('Creator and wallet signatures verified. Click Start wallet-linked GPU proof to bind fresh work to both approvals. Nothing was published.');
  }
  async function mine(ticket, signal) {
    if (!authorization || !snapshot || !identity || !field('consent').checked || !gpuAvailable()) throw new Error('Approve the matching recipient and use a browser with WebGPU first.');
    const selected = authorization, selectedSnapshot = snapshot, signer = identity;
    const check = () => { guard(ticket, signer); wallet.assertCurrent(selectedSnapshot); if (authorization !== selected || !field('consent').checked) throw new Error('Recipient work was cancelled.'); };
    check(); const opts = { signal, requireFresh: true, verifyContractSignature: wallet.verifier({ snapshot: selectedSnapshot, signal, guard: check }) };
    const checked = await verifyRecipientAuthorization(selected, opts); check();
    timer = setTimeout(() => { if (current(ticket)) stop('Stopped at the 60-second session limit.'); }, COIN_RULES.maxMiningMs);
    const entropy = crypto.getRandomValues(new Uint32Array(2));
    const result = await mineCandidate({ prefix: hexBytes(checked.challengeHex), difficultyBits: checked.difficulty, startNonce: ((BigInt(entropy[0]) << 32n) | BigInt(entropy[1])).toString(), signal,
      isVisible: () => current(ticket) && visible && !document.hidden && identity === signer,
      maxMs: COIN_RULES.maxMiningMs, maxCandidates: COIN_RULES.maxCandidates,
      onProgress(progress) { if (current(ticket)) { const count = typeof progress === 'number' ? progress : progress?.attempts; if (Number.isSafeInteger(count) && count >= 0 && count <= COIN_RULES.maxCandidates) field('progress').textContent = `Wallet-linked GPU proof: ${count.toLocaleString()} candidates this session.`; } },
    }); check();
    if (result?.nonce !== undefined) {
      const found = await createRecipientProof(selected, result.nonce, opts); check();
      if (found.proof.digest !== result.digest) throw new Error('GPU result disagreed with independent verification. No proof was accepted.');
      const checkedProof = await verifyRecipientProof(found, opts); check(); save(found, checkedProof);
      field('progress').textContent = 'Fresh wallet-linked GPU proof independently verified. Work has stopped.';
      status('The proposed recipient, both signatures and fresh work verify. Copy or export the public record; spendable DVC remains zero.');
    } else if (result?.stopped || result?.exhausted) field('progress').textContent = 'Wallet-linked GPU work stopped without a new proof. Start again only if you choose.';
    else throw new Error('GPU backend returned an invalid result.');
  }
  async function checkRecord(value, ticket, signal) {
    const proposal = value.proposal ?? value, context = recipientContext(proposal);
    let verifyContractSignature;
    if (context.accountType === 'erc1271') {
      const selectedSnapshot = await wallet.readRecipientContext({ sourceProofId: context.sourceProofId, verificationBlock: context.verificationBlock, signal, guard: () => guard(ticket) }); guard(ticket);
      if (selectedSnapshot.address !== context.address || selectedSnapshot.chainId !== context.chainId) throw new Error('Connect the recipient’s wallet account and declared chain to verify its contract signature.');
      verifyContractSignature = wallet.verifier({ snapshot: selectedSnapshot, signal, guard: () => guard(ticket) });
    }
    const parsed = await parseRecipientFile(JSON.stringify(value), { signal, verifyContractSignature });
    if (!current(ticket)) return;
    save(parsed.value, parsed.verified); status(parsed.verified.expired ? 'Archived signatures and work verify, but this approval has expired. It cannot authorize new adoption.' : 'Recipient record verified. This proves the stated approvals and any included work, not project authority or spendable issuance.');
  }
  async function importRecord() {
    const file = field('file').files?.[0]; field('file').value = ''; if (!file) return;
    restoreAllowed = false; stop('Stopped before importing a recipient record.', true);
    await task(async (ticket, signal) => {
      if (file.size > MAX_FILE_BYTES) throw new Error('Choose a recipient file smaller than 64 KB.');
      const text = await file.text(); if (!current(ticket)) return;
      if (new TextEncoder().encode(text).length > MAX_FILE_BYTES) throw new Error('Recipient record is too large.');
      // The protocol parser still verifies the original text, including duplicate-key rejection.
      let parsed;
      try { parsed = await parseRecipientFile(text, { signal }); }
      catch (error) {
        // Hold only structurally recognized smart-wallet records for explicit online verification.
        const candidate = JSON.parse(text), context = recipientContext(candidate.proposal ?? candidate);
        if (context.accountType !== 'erc1271') throw error;
        // Do not bypass the parser's structural/duplicate checks for an unverified import.
        if (error?.code !== 'RECIPIENT_ONLINE_REQUIRED') throw error;
        if (!current(ticket)) return;
        pendingImport = { text, value: candidate }; record = verified = null; render();
        status('Smart-wallet import needs its exact-chain verification. Connect the matching recipient account, then Verify recipient record again.'); return;
      }
      if (!current(ticket)) return; clearDraft(); save(parsed.value, parsed.verified); status(parsed.verified.walletAuthorized ? 'Public recipient record imported and verified. Wallet signing and GPU work remain stopped.' : 'Creator approval imported and verified. This file has no wallet signature or fresh work.');
    });
  }
  function publicText() { return JSON.stringify(record, null, 2) + '\n'; }
  function exportRecord() {
    if (!record || !verified) return;
    const url = URL.createObjectURL(new Blob([publicText()], { type: 'application/json' })), link = document.createElement('a');
    link.href = url; link.download = `doodleverse-recipient-${(verified.proofId ?? verified.sourceProofId).replace(/^0x/, '').slice(0, 12)}.json`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    status('Public recipient download requested. Copy is also available. No private key, vault password or Home Assistant address is included.');
  }
  async function copyRecord() {
    if (!record || !verified) return;
    const text = publicText(), chosen = record; field('copy-text').value = text; field('copy-panel').hidden = false;
    try { if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable'); await navigator.clipboard.writeText(text); if (record === chosen && !destroyed) status('Public recipient record copied. Sharing it reveals its wallet address and signatures.'); }
    catch { if (record === chosen && !destroyed) { field('copy-text').focus(); field('copy-text').select(); status('Select and copy the public JSON shown below.'); } }
  }
  const click = event => {
    const action = event.target.closest('[data-dvr-action]')?.dataset.dvrAction;
    if (action === 'stop') { stop('Wallet work cancelled. A wallet prompt may still need to be dismissed.', true); return; }
    if (action === 'disconnect') { stop('Recipient wallet disconnected locally.', true); wallet.disconnect(); renderWallet(); return; }
    if (busy) return;
    if (action === 'unlock') onUnlockRequest();
    if (action === 'discover') { wallet.discover({ includeLegacy: true }); renderWallet(); }
    if (action === 'connect') void task(async (ticket, signal) => { clearDraft(); await wallet.connect(field('provider').value, { signal }); if (!current(ticket)) return; renderWallet(); status('Wallet connected. Select the intended account and review its full address and network.'); });
    if (action === 'review') void task(review);
    if (action === 'sign') void task(signRecipient);
    if (action === 'start') void task(mine);
    if (action === 'export') exportRecord();
    if (action === 'copy') void copyRecord();
    if (action === 'import') field('file').click();
    if (action === 'verify') void task(async (ticket, signal) => {
      if (pendingImport) {
        // Preserve the original imported text so duplicate keys cannot disappear on reserialization.
        const value = pendingImport.value, context = recipientContext(value.proposal ?? value);
        const snap = await wallet.readRecipientContext({ sourceProofId: context.sourceProofId, verificationBlock: context.verificationBlock, signal, guard: () => guard(ticket) }); guard(ticket);
        const parsed = await parseRecipientFile(pendingImport.text, { signal, verifyContractSignature: wallet.verifier({ snapshot: snap, signal, guard: () => guard(ticket) }) }); guard(ticket);
        save(parsed.value, parsed.verified); status('Smart-wallet record verified against its declared chain state. Spendable DVC: 0.');
      } else await checkRecord(record, ticket, signal);
    });
  };
  const changeProvider = () => { stop('Wallet selection changed. Connect and review again.', true); wallet.disconnect(); render(); };
  const changeAccount = () => {
    const address = field('account').value;
    // Selecting one of a wallet's exposed accounts must retain that connection.
    // The adapter advances its generation and invalidates the old review itself.
    stop('Recipient account changed. Review again.'); clearDraft();
    try { if (address) wallet.select(address); else wallet.disconnect(); }
    catch (error) { status(String(error?.message || error).slice(0, 400)); }
    renderWallet();
  };
  const consent = () => { if (!field('consent').checked) stop('Recipient acknowledgement removed.', true); render(); };
  const changeReadService = () => {
    stop('Blockchain read service changed. Review the recipient again.'); clearDraft();
    try {
      const choice = field('read-service').value;
      if (!['wallet', 'publicnode'].includes(choice)) throw new Error('Choose a listed blockchain read service.');
      wallet.setReadService(choice === 'publicnode' ? readServiceFactory() : null);
      status(choice === 'publicnode' ? 'PublicNode selected for Ethereum reads. Review or verify to send the disclosed public queries; the wallet still signs.' : 'The connected wallet will handle blockchain reads. No outside read service selected.');
    } catch (error) { field('read-service').value = 'wallet'; wallet.setReadService(null); status(String(error?.message || error).slice(0, 400)); }
    render();
  };
  const visibility = () => { if (document.hidden) stop('Stopped because the page was hidden.', true); else render(); };
  const pagehide = () => stop('Stopped when leaving the page.', true);
  container.addEventListener('click', click); field('provider').addEventListener('change', changeProvider); field('account').addEventListener('change', changeAccount);
  field('read-service').addEventListener('change', changeReadService);
  field('consent').addEventListener('change', consent); field('file').addEventListener('change', importRecord);
  document.addEventListener('visibilitychange', visibility); window.addEventListener('pagehide', pagehide);
  if (window.top !== window.self) { field('window-panel').hidden = false; field('window-link').href = window.location.href; }
  renderWallet();
  try {
    const saved = localStorage.getItem(STORAGE);
    if (saved) void parseRecipientFile(saved).then(parsed => { if (!destroyed && restoreAllowed && !record) { record = parsed.value; verified = parsed.verified; render(); status('Restored a public recipient record. No wallet connection, signature request or GPU work started.'); } }).catch(() => {
      if (destroyed || !restoreAllowed || record) return;
      try { if (saved.length > MAX_FILE_BYTES) throw new Error(); const value = JSON.parse(saved); if (recipientContext(value.proposal ?? value).accountType === 'erc1271') { pendingImport = { text: saved, value }; render(); } } catch { /* Invalid saved data never replaces a verified record. */ }
      status('Saved recipient data needs verification. Import a known-good public copy, or connect for its smart-wallet check.');
    });
  } catch { /* Copy/export still work when browser storage is unavailable. */ }
  return {
    setSourceProof(value) {
      const epoch = ++sourceEpoch; stop('Original creator proof changed. Review the recipient again.', true); source = sourceCheck = null; render();
      if (value) { const copy = structuredClone(value); void verifyFounderProof(copy).then(check => { if (!destroyed && sourceEpoch === epoch) { source = copy; sourceCheck = check; render(); } }).catch(error => { if (!destroyed && sourceEpoch === epoch) status(error.message); }); }
    },
    unlock(who) { stop('Creator identity changed. Review the recipient again.', true); identity = who; ownAddress = null; void founderAddressFor(who.publicKey).then(address => { if (!destroyed && identity === who) { ownAddress = address; render(); } }); render(); },
    lock() { stop('Vault locked. Public recipient records are retained.', true); identity = null; ownAddress = null; render(); },
    setVisible(value) { visible = !!value; if (!visible) stop('Recipient work stopped because you left this view.', true); render(); },
    stop: () => stop('Recipient work stopped.', true),
    destroy() { stop('Recipient work stopped.', true); destroyed = true; identity = null; wallet.destroy();
      container.removeEventListener('click', click); field('provider').removeEventListener('change', changeProvider); field('account').removeEventListener('change', changeAccount); field('consent').removeEventListener('change', consent); field('file').removeEventListener('change', importRecord);
      field('read-service').removeEventListener('change', changeReadService);
      document.removeEventListener('visibilitychange', visibility); window.removeEventListener('pagehide', pagehide);
    },
  };
}
