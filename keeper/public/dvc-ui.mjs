// SPDX-License-Identifier: GPL-3.0-only
import { genesis, MAIN_NETWORK_ID, MAIN_NETWORK_NAME, DVC_RULES, normalizeAddress, parseStrictJSON, createTransferDraft, transferTypedData, verifyTransfer, workPrefix, effectiveTarget, transactionRoot } from './dvc-core.mjs';
import { createDvcWallet } from './dvc-wallet.mjs';
import { DVC_MINING_ALGORITHMS, mineDvcGpu, digestDvcWork } from './dvc-miner.mjs';
import { createDvcConsole } from './dvc-console.mjs';
import { mushroomArt } from './mushroom-art.mjs';

const HASH = /^[0-9a-f]{64}$/, UINT = /^(0|[1-9][0-9]{0,77})$/;
const MAX_BODY = 1024 * 1024, SCALE = 100000000n;
// Only known application errors enter the diagnostic log; driver/provider
// exception text can contain unrelated details and is never retained there.
const CONSOLE_ERRORS = new Set([
  'WebGPU is unavailable. No CPU miner was started.',
  'No WebGPU adapter is available. No CPU miner was started.',
  'Secure Web Crypto is required to verify DVC GPU results.',
  'A hardware WebGPU adapter could not be confirmed. Software fallback mining is disabled.',
  'The DVC GPU shader could not compile. No CPU miner was started.',
  'The DVC GPU device was lost. Restart mining to try again.',
  'DVC GPU work failed a device validation check. No result was accepted.',
  'The mined candidate failed independent verification.',
  'The mining job does not match your account, algorithm or current DVC chain.',
  'The node did not confirm this exact block on its current chain. Refresh to check its state.',
  'The DVC node is unavailable. Restore node storage before mining or sending.',
  'The DVC node did not respond in time. Refresh to check its state.',
  'The node rejected this update. Refresh balances and review again.',
  'The DVC node could not complete this request. Refresh to check its state.',
  'The DVC node connection failed. Refresh to check its state.',
  'The DVC node response exceeded its limit.',
  'The DVC node returned an unreadable response.',
  'This node belongs to a different DVC network. Wallet disconnected.',
  'Connect an account and load this DVC node first.',
  'Enter a valid mining reward address and load this DVC node first.',
  'Choose and connect a wallet first.',
  'The wallet request was declined. No DVC transfer was submitted.',
  'The wallet could not complete this native DVC request. No alternate signing method was attempted.',
  'The wallet request timed out. Its prompt may still be open.',
  'Finish or cancel the open wallet prompt before trying again.',
]);
function consoleError(message) {
  if (message === 'No WebGPU adapter is available. No CPU miner was started.') return message + ' Check graphics acceleration in your browser settings and restart the browser after an update or GPU crash.';
  if (message === 'WebGPU is unavailable. No CPU miner was started.') return message + ' Open this Keeper over HTTPS in a browser with WebGPU support.';
  return CONSOLE_ERRORS.has(message) ? message : 'DVC action could not finish. Check the status message on this page and try again.';
}
function integer(value) { const text = typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? String(value) : value; if (typeof text !== 'string' || !UINT.test(text)) throw Error('The node returned an invalid number.'); return text; }
export function parseDvcAmount(value) {
  if (typeof value !== 'string' || !/^(?:0|[1-9][0-9]{0,7})(?:\.[0-9]{1,8})?$/.test(value.trim())) throw Error('Enter a DVC amount with at most eight decimal places.');
  const [whole, fraction = ''] = value.trim().split('.'), atoms = BigInt(whole) * SCALE + BigInt(fraction.padEnd(8, '0'));
  if (atoms <= 0n || atoms > BigInt(DVC_RULES.maxSupplyAtoms)) throw Error('Enter a positive amount within the DVC supply.'); return atoms.toString();
}
export function formatDvcAmount(value) { const amount = BigInt(integer(value)); return `${amount / SCALE}.${(amount % SCALE).toString().padStart(8, '0')}`; }

export function createDvcUI(container, { fetchImpl = (...args) => fetch(...args), walletFactory = createDvcWallet, mineCandidate = mineDvcGpu,
  consoleFactory = createDvcConsole,
  onActivity = () => {}, getBrowserPeerCount = () => 0, document: doc = container.ownerDocument ?? globalThis.document, window: win = doc?.defaultView ?? globalThis.window,
  pollMs = 15000, requestTimeoutMs = 10000, repeatDelayMs = 1000 } = {}) {
  if (!Number.isSafeInteger(pollMs) || pollMs < 1000 || !Number.isSafeInteger(requestTimeoutMs) || requestTimeoutMs < 1 || requestTimeoutMs > 30000) throw Error('Invalid DVC request timing.');
  if (!Number.isSafeInteger(repeatDelayMs) || repeatDelayMs < 1 || repeatDelayMs > 5000) throw Error('Invalid mining round interval.');
  const network = genesis();
  container.classList.add('native-dvc');
  container.innerHTML = `<header class="native-heading"><div><span class="section-kicker">DOODLEVERSE NATIVE NETWORK</span><h2>Doodleverse Coin</h2><p>21,000,000 DVC maximum · 1,000,000 founder allocation · 20,000,000 mineable.</p></div><span class="native-badge">Experimental</span></header>
    <p class="native-note">Native DVC balances and transfers are stored on this Doodleverse node and its peers. This is not an Ethereum token or a Coinbase wallet balance. Your browser wallet signs DVC messages. Mining rewards become spendable after six blocks; confirmations can change when competing chains arrive.</p>
    <section class="native-node"><strong data-native-field="node">Node not loaded.</strong><span data-native-field="supply"></span><details><summary>Network identity</summary><code data-native-field="network"></code></details><button type="button" data-native-action="refresh">Refresh node & balances</button></section>
    <section class="native-mining"><h3>Mine native DVC</h3>
    <label>Mining reward address<input data-native-field="mining-address" aria-label="Mining reward address" maxlength="42" spellcheck="false" autocomplete="off" placeholder="0x…"></label><button type="button" data-native-action="use-wallet-address">Use connected wallet address</button>
    <p class="native-note">Paste the full receiving address, then press MINE NOW. No wallet connection or signature is needed to mine. Check the address carefully: only its key holder can spend the rewards.</p><p data-native-field="mining-address-status" role="status">Enter a mining reward address.</p>
    <div class="native-balances" aria-label="Mining address balances"><div><span>Available at mining address</span><strong data-native-field="mining-available">Unavailable</strong></div><div><span>Immature mining-address rewards</span><strong data-native-field="mining-immature">Unavailable</strong></div><div><span>Pending outgoing at mining address</span><strong data-native-field="mining-pending">Unavailable</strong></div></div>
    <div class="native-nightcap"><div class="native-nightcap-art" data-native-field="mushroom-art"></div><div><span class="section-kicker">YOUR MINING MUSHROOM</span><h4>Nightcap</h4><p class="native-note">A SHA-256 mushroom with Eco intensity and Keep mining. Press MINE NOW after choosing the preset. Keep this page visible and the computer awake.</p><button type="button" data-native-action="nightcap">Use Nightcap preset</button><p data-native-field="catcher" role="status">Auto catcher ready · 0 blocks accepted this session.</p><p class="native-note">Valid blocks are submitted automatically for the mining reward address above. Rewards appear as immature until six more blocks. Your mushroom marks this mining setup; rewards come from verified work.</p></div></div>
    <div class="native-options"><label>Algorithm<select data-native-field="algorithm" aria-label="DVC mining algorithm"></select></label><label>GPU intensity<select data-native-field="intensity" aria-label="GPU mining intensity"><option value="eco">Eco</option><option value="balanced" selected>Balanced</option><option value="fast">Fast</option></select></label></div>
    <div class="native-mine-actions"><button class="native-mine-now" type="button" data-native-action="mine">MINE NOW</button><button type="button" data-native-action="stop">Stop</button></div>
    <label class="native-repeat"><input type="checkbox" role="switch" data-native-field="repeat" aria-label="Keep mining"><span>Keep mining</span></label>
    <p data-native-field="progress" role="status">Mining is stopped.</p><p class="native-note">Press MINE NOW to start. Each round searches for one block for up to 60 seconds or 4,194,304 candidates. Keep mining repeats rounds while this page stays visible. Stop, turning the switch off, hiding the page or changing accounts stops unfinished work and turns repeat off. It never resumes after leaving the page.</p></section>
    <section data-native-field="console" class="native-console"></section>
    <section class="native-wallet"><h3>Wallet for sending</h3><p class="native-note">Optional for mining. Connect a wallet only when you want to sign a payment or use its address.</p><div class="native-actions"><button type="button" data-native-action="discover">Find browser wallets</button><button type="button" data-native-action="disconnect">Disconnect wallet</button></div>
    <label>Wallet extension<select data-native-field="provider" aria-label="DVC wallet extension"><option value="">Choose an extension</option></select></label><button type="button" data-native-action="connect">Connect selected wallet</button>
    <label>Account<select data-native-field="account" aria-label="DVC wallet account"><option value="">Connect a wallet first</option></select></label><p data-native-field="connection">No wallet connected.</p>
    <p class="native-note">Choose your installed Coinbase Wallet or another compatible extension. Transfers support a recoverable account signature. Smart-account and delegated signatures are not supported. No Ethereum transaction, token approval or network switch is requested.</p>
    <p data-native-field="window-panel" hidden><a data-native-field="window-link" target="_blank" rel="noopener noreferrer">Open Doodle Tick in a wallet window</a> if your extension is unavailable inside Home Assistant.</p>
    <div class="native-balances"><div><span>Available</span><strong data-native-field="available">Unavailable</strong></div><div><span>Immature rewards</span><strong data-native-field="immature">Unavailable</strong></div><div><span>Pending outgoing</span><strong data-native-field="pending">Unavailable</strong></div></div></section>
    <div class="native-transfer-grid"><section><h3>Send DVC</h3><label>Full recipient address<input data-native-field="recipient" aria-label="DVC recipient address" maxlength="42" spellcheck="false" autocomplete="off" placeholder="0x…"></label><label>Amount in DVC<input data-native-field="amount" aria-label="DVC transfer amount" inputmode="decimal" maxlength="18" placeholder="0.00000000" autocomplete="off"></label>
    <p>Network fee: <strong data-native-field="fee"></strong> DVC.</p><button type="button" data-native-action="review">Review transfer</button>
    <section class="native-review" data-native-field="review-panel" hidden><h4>Check this transfer</h4><pre data-native-field="review"></pre><details><summary>Exact wallet message</summary><pre data-native-field="typed"></pre></details><label class="native-consent"><input type="checkbox" data-native-field="consent"> I checked the full recipient, amount and fee.</label><button type="button" data-native-action="send">Sign & submit DVC transfer</button></section></section>
    <section><h3>Receive DVC</h3><label>Your full address<input data-native-field="receive-address" aria-label="Your DVC receive address" readonly spellcheck="false"></label><button type="button" data-native-action="copy-address">Copy address</button><label>Requested amount (optional)<input data-native-field="receive-amount" aria-label="Requested DVC amount" inputmode="decimal" maxlength="18" autocomplete="off"></label><button type="button" data-native-action="request">Make payment request</button><label data-native-field="request-panel" hidden>Native DVC payment request<textarea data-native-field="request" aria-label="DVC payment request" readonly rows="5" spellcheck="false"></textarea></label><button type="button" data-native-action="copy-request">Copy payment request</button></section></div>
    <section><h3>Recent account activity</h3><ul class="native-transactions" data-native-field="transactions"><li>Connect your wallet to load account activity.</li></ul></section>
    <p class="native-status" data-native-field="status" role="status" aria-live="polite">Open this view to check your node. Wallet connections and mining require your clicks.</p>`;
  const field = name => container.querySelector(`[data-native-field="${name}"]`), button = name => container.querySelector(`[data-native-action="${name}"]`);
  const make = (tag, text) => { const element = doc.createElement(tag); if (text !== undefined) element.textContent = text; return element; };
  for (const row of DVC_MINING_ALGORITHMS) { const option = make('option', row.name); option.value = row.id; field('algorithm').append(option); }
  field('algorithm').value = 'sha256'; field('intensity').value = 'balanced'; field('fee').textContent = formatDvcAmount(DVC_RULES.minFeeAtoms);
  field('network').textContent = `${MAIN_NETWORK_NAME}\nGenesis / network ID: ${MAIN_NETWORK_ID}`;
  try { if (win.top !== win.self && win.location?.href) { field('window-link').href = win.location.href; field('window-panel').hidden = false; } } catch {}
  let active = false, destroyed = false, busy = null, generation = 0, actionController = null, pollController = null, pollTimer = null;
  let node = null, account = null, miningAccount = null, draft = null, snapshot = null, miningParent = null, refreshing = false, commandConsole = null, consoleProgress = 'Mining is stopped.';
  let catcherAddress, caughtBlocks = 0, lastCaughtHash = null;
  const miningAddress = () => { try { return normalizeAddress(field('mining-address').value.trim()); } catch { return ''; } };
  const visible = () => active && !destroyed && !doc.hidden;
  const status = (text, level = 'output') => { if (!destroyed) { field('status').textContent = text; commandConsole?.write(level === 'error' ? consoleError(text) : text, level); } };
  function clearDraft() { draft = snapshot = null; field('consent').checked = false; field('review-panel').hidden = true; field('review').textContent = field('typed').textContent = ''; }
  function clearPaymentRequest() { field('request').value = ''; field('request-panel').hidden = true; }
  function stop(message = 'Stopped locally. An already submitted block or transfer may still confirm.', cancelWallet = true, level = 'output') {
    field('repeat').checked = false;
    generation++; actionController?.abort(); actionController = null; busy = null; miningParent = null; clearDraft();
    if (cancelWallet) wallet.cancel(); if (!destroyed) { field('progress').textContent = consoleProgress = 'Mining is stopped.'; status(message, level); render(); }
  }
  function options(select, rows, placeholder, value) {
    const empty = make('option', placeholder); empty.value = ''; select.replaceChildren(empty);
    for (const row of rows) { const option = make('option', row.label); option.value = row.value; select.append(option); }
    select.value = rows.some(row => row.value === value) ? value : '';
  }
  const wallet = walletFactory({ onChange(event) {
    if (destroyed) return;
    if (event.invalidated) { stop(event.reason || 'Wallet changed. Review again.', false); account = null; clearPaymentRequest(); activity(); }
    render();
  } });
  function render() {
    if (destroyed) return;
    commandConsole?.setEnabled(visible());
    const connection = wallet.state(), ready = visible() && !!node, hasAccount = ready && !!connection.address && account?.address === connection.address;
    const payout = miningAddress(), hasMiningAccount = ready && !!payout && miningAccount?.address === payout;
    field('mining-address-status').textContent = payout ? `Mining rewards go to: ${payout}` : field('mining-address').value.trim() ? 'Enter a full, nonzero 0x address with a valid checksum.' : 'Enter a mining reward address.';
    for (const [name, key] of [['mining-available', 'availableAtoms'], ['mining-immature', 'immatureAtoms'], ['mining-pending', 'pendingOutAtoms']]) field(name).textContent = hasMiningAccount ? formatDvcAmount(miningAccount[key]) + ' DVC' : 'Unavailable';
    if (catcherAddress !== payout) { catcherAddress = payout; caughtBlocks = 0; lastCaughtHash = null; field('mushroom-art').innerHTML = mushroomArt('dvc-nightcap:' + (payout || 'preview'), ['lantern'], .9); }
    field('catcher').textContent = `Auto catcher ${busy === 'mining' ? 'watching' : 'ready'} · ${caughtBlocks} ${caughtBlocks === 1 ? 'block' : 'blocks'} accepted this session.`;
    options(field('provider'), (connection.providers || []).map(row => ({ value: row.id, label: row.name })), 'Choose an extension', connection.providerId || field('provider').value);
    options(field('account'), (connection.accounts || []).map(value => ({ value, label: value })), 'Choose an account', connection.address);
    field('connection').textContent = connection.address ? `Native DVC account: ${connection.address} · wallet context ${connection.chainId}.` : 'No wallet connected.';
    field('receive-address').value = connection.address || '';
    for (const [name, key] of [['available', 'availableAtoms'], ['immature', 'immatureAtoms'], ['pending', 'pendingOutAtoms']]) field(name).textContent = hasAccount ? formatDvcAmount(account[key]) + ' DVC' : 'Unavailable';
    if (node) {
      let browserPeers = 0; try { const value = getBrowserPeerCount(); if (Number.isSafeInteger(value) && value >= 0 && value <= 4) browserPeers = value; } catch {}
      field('node').textContent = `Block ${node.tip.height} · ${node.peers.connected + browserPeers} peers connected · ${node.mempoolSize} pending transfers`;
      field('supply').textContent = `${formatDvcAmount(node.supply.issuedAtoms)} DVC issued · ${formatDvcAmount(node.supply.mineableRemainingAtoms)} DVC left to mine`;
    } else { field('node').textContent = visible() ? 'Node unavailable or loading.' : 'Node not loaded.'; field('supply').textContent = ''; }
    button('mine').disabled = !ready || !payout || !!busy;
    button('use-wallet-address').disabled = !visible() || !connection.address || !!busy;
    button('nightcap').disabled = !visible() || !!busy;
    button('stop').disabled = !busy && !draft;
    field('repeat').disabled = !visible() || (!!busy && busy !== 'mining');
    button('review').disabled = !hasAccount || !!busy || BigInt(account?.availableAtoms || '0') <= 0n;
    button('send').disabled = !hasAccount || !!busy || !draft || !snapshot || !field('consent').checked;
    button('connect').disabled = !ready || !!busy || !field('provider').value || connection.promptPending;
    button('discover').disabled = !visible() || !!busy;
    button('disconnect').disabled = !connection.providerId && !busy;
    button('refresh').disabled = !visible() || refreshing;
    for (const name of ['provider', 'account', 'algorithm', 'intensity', 'recipient', 'amount', 'mining-address']) field(name).disabled = !!busy;
    for (const name of ['request', 'copy-address']) button(name).disabled = !visible() || !connection.address;
    button('copy-request').disabled = !visible() || !field('request').value;
  }
  function checkpoint(epoch, signal) { if (!visible() || signal?.aborted || epoch !== generation) throw Error('DVC work canceled. No automatic restart.'); }
  async function api(path, body, signal) {
    if (!/^\/(?:status|job|block|transfer|account\/0x[0-9a-f]{40})$/.test(path)) throw Error('This DVC request is not permitted.');
    const requestBody = body === undefined ? undefined : JSON.stringify(body);
    if (requestBody && new TextEncoder().encode(requestBody).byteLength > MAX_BODY) throw Error('This DVC request is too large.');
    const controller = new AbortController(); let reader, timer;
    const canceled = () => controller.abort(); if (signal?.aborted) throw Error('DVC request canceled.'); signal?.addEventListener('abort', canceled, { once: true });
    let rejectStop;
    const ending = new Promise((_, reject) => { rejectStop = reject; });
    const abort = () => rejectStop(Error('DVC request canceled.'));
    controller.signal.addEventListener('abort', abort, { once: true });
    timer = setTimeout(() => { rejectStop(Error('The DVC node did not respond in time. Refresh to check its state.')); controller.abort(); }, requestTimeoutMs);
    try {
      return await Promise.race([ending, (async () => {
        const response = await fetchImpl('./dvc' + path, { method: body === undefined ? 'GET' : 'POST', credentials: 'same-origin', cache: 'no-store', redirect: 'error', referrerPolicy: 'no-referrer', signal: controller.signal,
          headers: { 'Content-Type': 'application/json', 'X-Keeper-Request': '1' }, ...(requestBody ? { body: requestBody } : {}) });
        if (controller.signal.aborted) throw Error('DVC request canceled.');
        if (!response.ok) throw Error(response.status === 409 ? 'The node rejected this update. Refresh balances and review again.' : 'The DVC node could not complete this request. Refresh to check its state.');
        if (Number(response.headers?.get('content-length')) > MAX_BODY) throw Error('The DVC node response exceeded its limit.');
        let raw = '';
        if (response.body?.getReader) {
          reader = response.body.getReader(); const decoder = new TextDecoder('utf-8', { fatal: true }); let size = 0;
          while (true) { const chunk = await reader.read(); if (controller.signal.aborted) throw Error('DVC request canceled.'); if (chunk.done) break; size += chunk.value.byteLength; if (size > MAX_BODY) throw Error('The DVC node response exceeded its limit.'); raw += decoder.decode(chunk.value, { stream: true }); }
          raw += decoder.decode();
        } else { raw = await response.text(); if (new TextEncoder().encode(raw).byteLength > MAX_BODY) throw Error('The DVC node response exceeded its limit.'); }
        if (controller.signal.aborted) throw Error('DVC request canceled.');
        try { return parseStrictJSON(raw, { maxBytes: MAX_BODY }); } catch { throw Error('The DVC node returned an unreadable response.'); }
      })()]);
    } catch (error) {
      // Remote response/error bodies are never shown or saved.
      const allowed = ['DVC request canceled.', 'The DVC node did not respond in time. Refresh to check its state.', 'The node rejected this update. Refresh balances and review again.', 'The DVC node could not complete this request. Refresh to check its state.', 'The DVC node response exceeded its limit.', 'The DVC node returned an unreadable response.'];
      throw Error(allowed.includes(error?.message) ? error.message : 'The DVC node connection failed. Refresh to check its state.');
    } finally {
      clearTimeout(timer); signal?.removeEventListener('abort', canceled); controller.signal.removeEventListener('abort', abort); controller.abort();
      try { reader?.cancel()?.catch(() => {}); } catch {} try { reader?.releaseLock(); } catch {}
    }
  }
  function checkedStatus(value) {
    if (value?.networkId !== MAIN_NETWORK_ID || (typeof value.genesis === 'string' ? value.genesis : value.genesis?.hash) !== network.hash) {
      node = account = miningAccount = null; wallet.disconnect(); clearPaymentRequest(); activity();
      const message = 'This node belongs to a different DVC network. Wallet disconnected.'; status(message, 'error'); render(); throw Error(message);
    }
    if (!HASH.test(value.tip?.hash || '') || !HASH.test(value.tip?.baseTarget || '') || !value.supply || !value.peers) throw Error('The node status is incomplete.');
    if (value.healthy === false) throw Error('The DVC node is unavailable. Restore node storage before mining or sending.');
    const result = structuredClone(value); result.tip.height = integer(value.tip.height); integer(value.tip.chainWork); integer(value.tip.timestamp);
    for (const key of ['issuedAtoms', 'mineableRemainingAtoms', 'maxSupplyAtoms']) result.supply[key] = integer(value.supply[key]);
    if (result.supply.maxSupplyAtoms !== DVC_RULES.maxSupplyAtoms || BigInt(result.supply.issuedAtoms) > BigInt(DVC_RULES.maxSupplyAtoms) || BigInt(result.supply.mineableRemainingAtoms) > BigInt(DVC_RULES.miningReserveAtoms)) throw Error('The node supply does not match this DVC network.');
    for (const key of ['configured', 'connected']) if (!Number.isSafeInteger(value.peers[key]) || value.peers[key] < 0 || value.peers[key] > 10000) throw Error('Invalid node peer counts.');
    if (!Number.isSafeInteger(value.mempoolSize) || value.mempoolSize < 0) throw Error('Invalid pending transfer count.'); return result;
  }
  function checkedAccount(value, address) {
    if (value?.networkId !== MAIN_NETWORK_ID || value.address !== address || !HASH.test(value.tipHash || '')) throw Error('The account response does not match the selected DVC account.');
    const result = structuredClone(value); result.height = integer(value.height); result.nextNonce = integer(value.nextNonce);
    for (const key of ['availableAtoms', 'immatureAtoms', 'totalAtoms', 'pendingOutAtoms']) { result[key] = integer(value[key]); if (BigInt(result[key]) > BigInt(DVC_RULES.maxSupplyAtoms)) throw Error('The node returned an invalid account balance.'); }
    if (BigInt(result.pendingOutAtoms) > BigInt(result.availableAtoms) || BigInt(result.availableAtoms) + BigInt(result.immatureAtoms) !== BigInt(result.totalAtoms)) throw Error('The node balances need to be reconciled. Refresh before sending.');
    result.confirmedAvailableAtoms = result.availableAtoms;
    result.availableAtoms = (BigInt(result.availableAtoms) - BigInt(result.pendingOutAtoms)).toString();
    if (!Array.isArray(value.recentTransactions) || value.recentTransactions.length > 100 || value.recentTransactions.some(row => !row || typeof row !== 'object' || Array.isArray(row))) throw Error('The node returned invalid account activity.');
    result.transactions = value.recentTransactions; return result;
  }
  function activity() {
    field('transactions').replaceChildren();
    if (!account) { field('transactions').append(make('li', 'Account activity unavailable.')); return; }
    if (!account.transactions.length) { field('transactions').append(make('li', 'No account activity reported by this node.')); return; }
    for (const tx of account.transactions.slice(0, 20)) {
      const id = HASH.test(tx.id || '') ? tx.id : HASH.test(tx.hash || '') ? tx.hash : 'ID unavailable';
      const state = ['pending', 'confirmed', 'immature', 'mature', 'orphaned', 'dropped'].includes(tx.status) ? tx.status : 'unconfirmed';
      let amount = 'Amount unavailable'; try { amount = formatDvcAmount(tx.amountAtoms ?? tx.rewardAtoms) + ' DVC'; } catch {}
      field('transactions').append(make('li', `${state} · ${amount} · ${id}`));
    }
  }
  function schedule() { clearTimeout(pollTimer); pollTimer = null; if (visible()) pollTimer = setTimeout(() => { pollTimer = null; void refresh(); }, pollMs); }
  async function refresh() {
    if (!visible() || refreshing) return;
    refreshing = true; clearTimeout(pollTimer); pollController = new AbortController(); const controller = pollController, address = wallet.state().address, payout = miningAddress(); let epoch = generation; render();
    try {
      const response = await api('/status', undefined, controller.signal); checkpoint(epoch, controller.signal); const next = checkedStatus(response);
      node = next;
      if (miningParent && miningParent !== next.tip.hash) { stop('The node advanced. Press MINE NOW for a fresh block.'); epoch = generation; }
      if (address) {
        const response = await api('/account/' + address, undefined, controller.signal); checkpoint(epoch, controller.signal); const value = checkedAccount(response, address);
        if (wallet.state().address !== address) return; account = value;
        if (draft && (draft.nonce !== value.nextNonce || BigInt(draft.validUntilHeight) <= BigInt(next.tip.height) || BigInt(draft.amountAtoms) + BigInt(draft.feeAtoms) > BigInt(value.availableAtoms))) { clearDraft(); status('Balances or the transfer nonce changed. Review again.'); }
      } else account = null;
      if (payout) {
        const value = account?.address === payout ? account : checkedAccount(await api('/account/' + payout, undefined, controller.signal), payout);
        checkpoint(epoch, controller.signal); if (miningAddress() !== payout) return; miningAccount = value;
      } else miningAccount = null;
      activity();
    } catch (error) {
      if (!visible() || controller.signal.aborted || epoch !== generation) return;
      node = account = miningAccount = null; clearDraft(); activity();
      stop(error.message, false, 'error');
    } finally { if (pollController === controller) { pollController = null; refreshing = false; render(); schedule(); } }
  }
  async function action(kind, operation) {
    if (!visible() || busy) return false;
    const epoch = ++generation, controller = new AbortController(); actionController = controller; busy = kind;
    clearTimeout(pollTimer); pollController?.abort(); pollController = null; refreshing = false; try { onActivity(); } catch {} render();
    try { await operation(epoch, controller.signal); checkpoint(epoch, controller.signal); return true; }
    catch (error) { if (epoch === generation && !destroyed) { field('repeat').checked = false; const message = error?.message || 'DVC action could not finish.'; status(message, 'error'); if (kind === 'mining') { miningParent = null; field('progress').textContent = 'Mining stopped. ' + message; consoleProgress = 'Mining stopped. ' + consoleError(message); } } return false; }
    finally { if (epoch === generation) { busy = null; actionController = null; render(); schedule(); } }
  }
  async function latestAccount(epoch, signal) {
    const address = wallet.state().address; if (!address || !node) throw Error('Connect an account and load this DVC node first.');
    try {
      const response = await api('/status', undefined, signal); checkpoint(epoch, signal); const next = checkedStatus(response);
      const responseAccount = await api('/account/' + address, undefined, signal); checkpoint(epoch, signal); const value = checkedAccount(responseAccount, address);
      if (wallet.state().address !== address) throw Error('Wallet account changed.'); node = next; account = value;
      if (miningAddress() === address) miningAccount = value;
      activity(); return value;
    } catch (error) { if (epoch === generation) { account = null; clearDraft(); activity(); render(); } throw error; }
  }
  async function latestMiningAccount(epoch, signal) {
    const address = miningAddress(); if (!address || !node) throw Error('Enter a valid mining reward address and load this DVC node first.');
    try {
      const response = await api('/status', undefined, signal); checkpoint(epoch, signal); const next = checkedStatus(response);
      const responseAccount = await api('/account/' + address, undefined, signal); checkpoint(epoch, signal); const value = checkedAccount(responseAccount, address);
      if (miningAddress() !== address) throw Error('Mining reward address changed.');
      node = next; miningAccount = value;
      if (wallet.state().address === address) { account = value; activity(); }
      return value;
    } catch (error) { if (epoch === generation) { miningAccount = null; render(); } throw error; }
  }
  async function mineRound(epoch, signal) {
    clearTimeout(pollTimer); pollController?.abort(); pollController = null; refreshing = false;
    clearDraft(); const current = await latestMiningAccount(epoch, signal), algorithm = field('algorithm').value, intensity = field('intensity').value;
    const job = await api('/job', { miner: current.address, algorithm }, signal); checkpoint(epoch, signal);
    const block = job?.block;
    if (job.networkId !== MAIN_NETWORK_ID || job.algorithm !== algorithm || block?.networkId !== MAIN_NETWORK_ID || block.miner !== current.address || block.algorithm !== algorithm ||
        block.parent !== node.tip.hash || BigInt(integer(block.height)) !== BigInt(node.tip.height) + 1n || job.prefixHex !== workPrefix(block) || job.targetHex !== effectiveTarget(block.baseTarget, algorithm) || block.transactionRoot !== transactionRoot(block.transactions)) throw Error('The mining job does not match your account, algorithm or current DVC chain.');
    const prefix = Uint8Array.from(job.prefixHex.match(/../g), part => Number.parseInt(part, 16)); miningParent = block.parent; schedule();
    field('progress').textContent = consoleProgress = 'Preparing your GPU…';
    commandConsole?.write(`Starting one ${algorithm === 'sha256d' ? 'SHA-256d' : 'SHA-256'} GPU attempt at ${intensity} intensity. Limit: 60 seconds.`, 'output');
    let lastPhase = '', lastProgressSeconds = -5;
    const mined = await mineCandidate({ prefix, targetHex: job.targetHex, algorithm, intensity, signal, isVisible: () => visible() && epoch === generation && miningAddress() === current.address,
      onProgress: progress => { if (epoch === generation && visible()) {
        const phase = ['preparing', 'self-testing', 'searching'].includes(progress.phase) ? progress.phase : 'working';
        const attempts = Number.isSafeInteger(progress.attempts) && progress.attempts >= 0 && progress.attempts <= 4194304 ? progress.attempts : 0;
        const seconds = Number.isFinite(progress.elapsedMs) && progress.elapsedMs >= 0 ? Math.min(60, Math.round(progress.elapsedMs / 1000)) : 0;
        const text = `${phase} · ${attempts.toLocaleString()} candidates · ${seconds}s`; field('progress').textContent = consoleProgress = text;
        if (phase !== lastPhase || seconds >= lastProgressSeconds + 5) { commandConsole?.write(text, 'output'); lastPhase = phase; lastProgressSeconds = seconds; }
      } }, maxMs: 60000, maxCandidates: 4194304 });
    checkpoint(epoch, signal); miningParent = null;
    if (!['found', 'stopped', 'exhausted'].includes(mined?.status)) throw Error('The miner returned an invalid result. No new round was started.');
    if (mined.status !== 'found') { field('progress').textContent = consoleProgress = mined.status === 'stopped' ? 'Mining stopped.' : field('repeat').checked ? 'Round finished without a block.' : 'Mining finished without a block. Press MINE NOW to try again.'; commandConsole?.write(consoleProgress, 'output'); return mined.status; }
    if (mined.algorithm !== algorithm || !HASH.test(mined.digest || '') || await digestDvcWork(prefix, mined.nonce, algorithm) !== mined.digest || mined.digest > job.targetHex) throw Error('The mined candidate failed independent verification.');
    checkpoint(epoch, signal); const receipt = await api('/block', { ...block, nonce: mined.nonce, digest: mined.digest }, signal); checkpoint(epoch, signal);
    if (receipt.accepted !== true || receipt.canonical !== true || receipt.hash !== mined.digest || receipt.height !== block.height) throw Error('The node did not confirm this exact block on its current chain. Refresh to check its state.');
    field('progress').textContent = consoleProgress = `Block ${block.height} accepted. Its reward is immature for six blocks.`;
    if (lastCaughtHash !== receipt.hash) { caughtBlocks++; lastCaughtHash = receipt.hash; }
    commandConsole?.write(field('progress').textContent, 'output');
    status(field('repeat').checked ? 'Block accepted. Refreshing balances before the next round.' : 'Mining stopped after one found block. Refreshing your balances.'); await latestMiningAccount(epoch, signal); render(); return 'found';
  }
  function waitForNextRound(signal) {
    return new Promise((resolve, reject) => {
      let timer;
      const abort = () => { clearTimeout(timer); signal.removeEventListener('abort', abort); reject(Error('DVC work canceled. No automatic restart.')); };
      if (signal.aborted) { abort(); return; }
      signal.addEventListener('abort', abort, { once: true });
      timer = setTimeout(() => { signal.removeEventListener('abort', abort); resolve(); }, repeatDelayMs);
    });
  }
  async function mine(epoch, signal) {
    do {
      checkpoint(epoch, signal);
      const result = await mineRound(epoch, signal); checkpoint(epoch, signal);
      if (result === 'stopped') { field('repeat').checked = false; return; }
      if (!field('repeat').checked) return;
      field('progress').textContent = consoleProgress = 'Keep mining is on. Preparing the next round…';
      commandConsole?.write(consoleProgress, 'output');
      await waitForNextRound(signal); checkpoint(epoch, signal);
    } while (field('repeat').checked);
  }
  async function review(epoch, signal) {
    clearDraft(); const current = await latestAccount(epoch, signal), recipient = normalizeAddress(field('recipient').value.trim()), amountAtoms = parseDvcAmount(field('amount').value);
    if (BigInt(amountAtoms) + BigInt(DVC_RULES.minFeeAtoms) > BigInt(current.availableAtoms)) throw Error('Available DVC does not cover this amount and fee.');
    const prepared = createTransferDraft({ sender: current.address, recipient, amountAtoms, feeAtoms: DVC_RULES.minFeeAtoms, nonce: current.nextNonce, validUntilHeight: (BigInt(node.tip.height) + 144n).toString() }, { genesis: network });
    const reviewed = await wallet.review({ signal, guard: () => visible() && epoch === generation }); checkpoint(epoch, signal);
    draft = prepared; snapshot = reviewed; field('review-panel').hidden = false;
    field('review').textContent = `Native network: ${MAIN_NETWORK_NAME}\nGenesis: ${MAIN_NETWORK_ID}\nFrom: ${draft.sender}\nTo: ${draft.recipient}\nAmount: ${formatDvcAmount(draft.amountAtoms)} DVC\nFee: ${formatDvcAmount(draft.feeAtoms)} DVC\nTotal: ${formatDvcAmount((BigInt(draft.amountAtoms) + BigInt(draft.feeAtoms)).toString())} DVC\nNonce: ${draft.nonce}\nValid until block: ${draft.validUntilHeight}`;
    field('typed').textContent = JSON.stringify(transferTypedData(draft, { genesis: network }), null, 2); status('Review the recipient, amount and fee before requesting the wallet signature.');
  }
  async function send(epoch, signal) {
    if (!draft || !snapshot || !field('consent').checked) throw Error('Review and confirm this transfer first.');
    const reference = draft, prepared = structuredClone(draft), reviewed = snapshot; await latestAccount(epoch, signal);
    if (account.nextNonce !== prepared.nonce || BigInt(account.availableAtoms) < BigInt(prepared.amountAtoms) + BigInt(prepared.feeAtoms) || BigInt(node.tip.height) >= BigInt(prepared.validUntilHeight)) { clearDraft(); throw Error('This transfer review is out of date. Review again.'); }
    const signed = await wallet.signTransfer(prepared, { snapshot: reviewed, signal, guard: () => visible() && epoch === generation && field('consent').checked && draft === reference && snapshot === reviewed });
    checkpoint(epoch, signal); const checked = verifyTransfer(signed, { genesis: network, height: (BigInt(node.tip.height) + 1n).toString() });
    if (!checked.valid || checked.sender !== prepared.sender || checked.recipient !== prepared.recipient || checked.amountAtoms !== prepared.amountAtoms || checked.feeAtoms !== prepared.feeAtoms || checked.nonce !== prepared.nonce || checked.validUntilHeight !== prepared.validUntilHeight) throw Error('The signed transfer differs from your review.');
    const accepted = await api('/transfer', signed, signal); checkpoint(epoch, signal);
    if (accepted.accepted !== true || accepted.id !== checked.id) throw Error('The node did not confirm this transfer. Refresh before trying again.');
    clearDraft(); status(`Transfer ${checked.id} is pending. A miner must confirm it in a block.`); await latestAccount(epoch, signal);
  }
  async function copy(value, fallback) { if (!value) return; try { await win.navigator.clipboard.writeText(value); status('Copied.'); } catch { fallback?.select?.(); status('Copy is unavailable. Select and copy the visible field.'); } }
  async function connect(epoch, signal) {
    await wallet.connect(field('provider').value, { signal }); checkpoint(epoch, signal); await latestAccount(epoch, signal);
    if (!field('mining-address').value.trim()) field('mining-address').value = account.address;
    if (miningAddress() === account.address) miningAccount = account;
    status('Wallet connected for signed DVC payments. Check the separate mining reward address before mining.');
  }
  const commandError = text => { commandConsole?.write(text, 'error'); };
  async function runConsoleCommand({ command, args = [] }) {
    if (!visible()) return commandError('Open the Coin page to run a command.');
    if (command === 'stop') { stop(); return; }
    if (command === 'status') return `${field('node').textContent}\n${field('supply').textContent}\n${field('mining-address-status').textContent}\n${consoleProgress}\n${field('catcher').textContent}\nAlgorithm: ${field('algorithm').value} · intensity: ${field('intensity').value} · keep mining: ${field('repeat').checked ? 'on' : 'off'}\nLatest loaded node state; use refresh to check again.`;
    if (command === 'balance') {
      if (!node || !miningAccount || miningAccount.address !== miningAddress()) return commandError('Enter a valid mining reward address and refresh its balances first.');
      return `Mining reward address: ${miningAccount.address}\nAvailable: ${formatDvcAmount(miningAccount.availableAtoms)} DVC\nImmature rewards: ${formatDvcAmount(miningAccount.immatureAtoms)} DVC\nPending outgoing: ${formatDvcAmount(miningAccount.pendingOutAtoms)} DVC\nLatest loaded balances; use refresh to check again.`;
    }
    if (command === 'repeat') {
      if (args.length !== 1 || !['on', 'off'].includes(args[0])) return commandError('Use repeat on or repeat off.');
      if (args[0] === 'off') { field('repeat').checked = false; stop('Keep mining turned off. Mining stopped.'); return; }
      if (busy && busy !== 'mining') return commandError('Finish the current wallet action before enabling Keep mining.');
      field('repeat').checked = true; render(); return busy === 'mining' ? 'Keep mining is on for this attempt and following rounds.' : 'Keep mining is on. Press MINE NOW or type mine to start.';
    }
    if (busy) return commandError('An action is running. Use stop before starting another action.');
    if (command === 'algorithm' || command === 'intensity') {
      const choices = command === 'algorithm' ? ['sha256', 'sha256d'] : ['eco', 'balanced', 'fast'];
      if (args.length !== 1 || !choices.includes(args[0])) return commandError('Choose a value shown in help.');
      field(command).value = args[0]; render(); return `${command === 'algorithm' ? 'Algorithm' : 'GPU intensity'} set to ${args[0]}.`;
    }
    if (args.length) return commandError('This command does not take extra arguments.');
    if (command === 'wallets') { wallet.discover({ includeLegacy: true }); render(); return 'Wallet discovery requested. Choose an extension in the Wallet extension menu, then use connect.'; }
    if (command === 'connect') { if (button('connect').disabled) return commandError('Load the node and select a wallet extension before using connect.'); await action('connecting', connect); return; }
    if (command === 'refresh') { if (refreshing) return commandError('A node refresh is already running.'); await refresh(); if (visible() && node) return `${field('node').textContent}\n${field('supply').textContent}`; return; }
    if (command === 'mine') { if (button('mine').disabled) return commandError('Enter a valid mining reward address and load this DVC node first.'); await action('mining', mine); return; }
    return commandError('Unknown command. Type help for the available commands.');
  }
  commandConsole = consoleFactory(field('console'), { execute: runConsoleCommand, document: doc, window: win });
  const click = event => {
    const control = event.target.closest?.('[data-native-action]'); if (!control || !visible()) return;
    const name = control.dataset.nativeAction;
    if (name === 'stop') { stop(); return; }
    if (name === 'nightcap') { if (busy) return; field('algorithm').value = 'sha256'; field('intensity').value = 'eco'; field('repeat').checked = true; status('Nightcap is ready: SHA-256, Eco, Keep mining and automatic block collection. Press MINE NOW to start.'); render(); return; }
    if (name === 'use-wallet-address') { if (busy || !wallet.state().address) return; field('mining-address').value = wallet.state().address; payoutChanged(); return; }
    if (name === 'disconnect') { stop('Wallet disconnected.'); wallet.disconnect(); account = null; clearPaymentRequest(); activity(); render(); return; }
    if (name === 'discover') { if (!busy) wallet.discover({ includeLegacy: true }); render(); return; }
    if (name === 'refresh') { void refresh(); return; }
    if (name === 'copy-address') { void copy(field('receive-address').value, field('receive-address')); return; }
    if (name === 'copy-request') { void copy(field('request').value, field('request')); return; }
    if (name === 'request') { try { const address = wallet.state().address; if (!address) throw Error('Connect your receiving account.'); field('request').value = JSON.stringify({ format: 'doodleverse-payment-request-v1', networkId: MAIN_NETWORK_ID, genesisHash: network.hash, recipient: address, amountAtoms: field('receive-amount').value.trim() ? parseDvcAmount(field('receive-amount').value) : null }, null, 2); field('request-panel').hidden = false; status('Payment request prepared. Sharing it reveals this public receiving address.'); render(); } catch (error) { status(error.message); } return; }
    if (name === 'connect') void action('connecting', connect);
    if (name === 'mine') void action('mining', mine);
    if (name === 'review') void action('reviewing', review);
    if (name === 'send') void action('signing', send);
  };
  container.addEventListener('click', click);
  const input = () => { if (busy === 'signing' || busy === 'reviewing') stop('Transfer details changed. Review again. A wallet prompt may still be open.'); else { clearDraft(); render(); } };
  field('recipient').addEventListener('input', input); field('amount').addEventListener('input', input);
  const consent = () => { if (!field('consent').checked && busy === 'signing') stop('Transfer consent withdrawn. A wallet prompt may still be open.'); render(); };
  field('consent').addEventListener('change', consent);
  const providerChanged = () => { if (wallet.state().providerId && field('provider').value !== wallet.state().providerId) wallet.disconnect(); clearDraft(); render(); };
  const accountChanged = () => { try { wallet.select(field('account').value); void refresh(); } catch (error) { status(error.message); } };
  field('provider').addEventListener('change', providerChanged); field('account').addEventListener('change', accountChanged);
  function payoutChanged() {
    miningAccount = null;
    stop('Mining reward address changed. Check it, then press MINE NOW when ready.', false);
    pollController?.abort(); pollController = null; refreshing = false; clearTimeout(pollTimer);
    if (visible()) void refresh();
  }
  field('mining-address').addEventListener('input', payoutChanged);
  const receiveChanged = () => { clearPaymentRequest(); render(); }; field('receive-amount').addEventListener('input', receiveChanged);
  const repeatChanged = () => {
    if (!visible() || (busy && busy !== 'mining')) { field('repeat').checked = false; render(); return; }
    if (!field('repeat').checked) stop('Keep mining turned off. Mining stopped.');
    else status(busy === 'mining' ? 'Keep mining is on for this attempt and following rounds.' : 'Keep mining is on. Press MINE NOW to start.');
  };
  field('repeat').addEventListener('change', repeatChanged);
  const visibility = () => { if (!visible()) { stop('Paused while this view is hidden. Mining will not resume automatically.'); pollController?.abort(); clearTimeout(pollTimer); } else void refresh(); };
  const pagehide = () => { stop('Stopped after leaving this page.'); pollController?.abort(); clearTimeout(pollTimer); };
  doc.addEventListener('visibilitychange', visibility); win.addEventListener('pagehide', pagehide);
  render();
  return { setActive(value) { active = Boolean(value); visibility(); }, destroy() { if (destroyed) return; stop('DVC view closed.'); destroyed = true; active = false; commandConsole?.destroy(); pollController?.abort(); clearTimeout(pollTimer); wallet.destroy(); container.removeEventListener('click', click); field('mining-address').removeEventListener('input', payoutChanged); field('repeat').removeEventListener('change', repeatChanged); doc.removeEventListener('visibilitychange', visibility); win.removeEventListener('pagehide', pagehide); container.replaceChildren(); } };
}
