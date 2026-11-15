// SPDX-License-Identifier: GPL-3.0-only
import { mushroomId } from './mushroom-core.mjs';
import { GardenWallet, address, bytes32, fingerprintHex, uint, words, recipeList, mineProof, walletError } from './public-chain-wallet.mjs';

export function createPublicChainUI(container, { getRecipe, toast = () => {} } = {}) {
  if (!container || typeof getRecipe !== 'function') throw new Error('Public garden needs a container and recipe source.');
  container.classList.add('public-chain');
  container.innerHTML = `
    <h3>Public wallet garden</h3>
    <p>Use your own Ethereum-compatible wallet. Every deployed garden is a separate DGT token, with its own supply and balances. Private Keeper coins never convert into these tokens.</p>
    <p class="public-chain-notice">Experimental, unaudited software. Tokens have no promised cash value. Transactions expose wallet addresses and mushroom fingerprints publicly and charge your network’s gas fee. Start on a test network. Keep an export of your recipe: only its fingerprint goes on-chain.</p>
    <div class="public-chain-row"><button type="button" data-action="connect">Connect wallet</button><button type="button" data-action="disconnect">Disconnect this page</button></div>
    <p data-field="account">Wallet not connected.</p>
    <div class="public-chain-row"><label>Choose wallet chain ID <input data-field="chain" inputmode="numeric" placeholder="For example, your wallet’s test network ID"></label><button type="button" data-action="network">Switch network</button></div>
    <p>Choose any supported EVM network in your wallet, or enter its chain ID above. The page does not add RPC servers or choose a network for you.</p>
    <div class="public-chain-row"><label>Existing garden contract <input data-field="contract" spellcheck="false" autocomplete="off" placeholder="0x…"></label><button type="button" data-action="attach">Connect garden</button></div>
    <label class="public-chain-check"><input type="checkbox" data-field="deploy-consent"> I want a new, independent token garden and will review its deployment fee in my wallet.</label>
    <button type="button" data-action="deploy">Deploy my garden</button>
    <p data-field="garden">No public garden selected.</p>
    <p data-field="balance">Public DGT balance: —</p>
    <p>Fixed rules: 1 token per completed UTC hour per mushroom; 32 mushrooms per account, 4,096 per garden. Hourly pool: 900,000 tokens. Mining pool: 100,000 tokens. Total: 1,000,000 whole tokens. Each claim processes at most 720 hours; repeat claims catch up.</p>
    <div class="public-chain-row"><button type="button" data-action="reserve">1. Reserve current mushroom</button><button type="button" data-action="register">2. Register reserved mushroom</button></div>
    <p data-field="reserved">Reservation requires two wallet transactions in different blocks and expires after 24 hours. First registration is not proof of authorship.</p>
    <div class="public-chain-row"><label>Your registered mushroom <select data-field="recipes"><option value="">Connect a garden to load mushrooms</option></select></label><button type="button" data-action="refresh">Refresh</button><button type="button" data-action="claim">Claim completed hours</button></div>
    <p data-field="claimable">Select a mushroom to see available hourly tokens.</p>
    <div class="public-chain-row"><button type="button" data-action="mine">Start mining</button><button type="button" data-action="stop">Stop mining</button><button type="button" data-action="proof">Submit found proof</button></div>
    <p>Mining runs visibly for at most 60 seconds or 250,000 attempts, then stops. It stops when this page or garden is hidden. A valid proof earns 1 token, limited to 1 per mushroom per UTC hour and 64 per garden per UTC hour. Submitting a proof is a separate wallet transaction with a gas fee.</p>
    <p data-field="mining" role="status">Mining stopped.</p>
    <div class="public-chain-row"><label>Recipient wallet <input data-field="recipient" spellcheck="false" autocomplete="off" placeholder="0x…"></label><label>Whole DGT tokens <input data-field="amount" inputmode="numeric" placeholder="1"></label><button type="button" data-action="transfer">Transfer tokens</button></div>
    <button type="button" data-action="pending">Check pending transaction</button>
    <p data-field="status" class="public-chain-status" role="status" aria-live="polite">Connect only when you are ready to share your wallet address with this page.</p>`;
  const field = name => container.querySelector(`[data-field="${name}"]`);
  const button = name => container.querySelector(`[data-action="${name}"]`);
  let wallet = null, visible = false, destroyed = false, working = false, miner = null, solution = null, reserved = null, refreshVersion = 0;
  const status = text => { if (!destroyed) field('status').textContent = text; };
  const storageKey = () => wallet?.account && wallet?.chain && wallet?.garden ? `doodletick-public-reservation-v1:${wallet.chain}:${wallet.account}:${wallet.garden}` : null;
  function rememberReservation(value) {
    reserved = value;
    try { const key = storageKey(); if (key) value ? localStorage.setItem(key, value) : localStorage.removeItem(key); } catch { /* Wallet state remains recoverable with the same recipe. */ }
    field('reserved').textContent = value ? `Reserved recipe fingerprint: ${value}. Wait for its reservation receipt and a later block before registering.` : 'Reserve the current recipe, then register it in a later block. Reservations expire after 24 hours.';
    render();
  }
  function restoreReservation() {
    let value = null;
    try { value = localStorage.getItem(storageKey()); if (value) bytes32(value); } catch { value = null; }
    rememberReservation(value);
  }
  function stop() {
    miner?.abort(); miner = null; solution = null;
    if (!destroyed) { field('mining').textContent = 'Mining stopped. No proof is submitted automatically.'; render(); }
  }
  function render() {
    if (destroyed) return;
    const connected = !!wallet?.account, garden = connected && !!wallet.garden, selected = !!field('recipes').value;
    field('account').textContent = connected ? `Wallet: ${wallet.account} · chain ID ${BigInt(wallet.chain)}` : 'Wallet not connected.';
    field('garden').textContent = garden ? `Garden: ${wallet.garden} · chain ID ${BigInt(wallet.chain)}` : 'No public garden selected.';
    for (const name of ['network', 'attach', 'deploy']) button(name).disabled = working || !connected;
    button('connect').disabled = working; button('disconnect').disabled = working || !wallet;
    button('deploy').disabled ||= !field('deploy-consent').checked;
    for (const name of ['reserve', 'refresh', 'transfer']) button(name).disabled = working || !garden;
    button('register').disabled = working || !garden || !reserved;
    button('claim').disabled = working || !garden || !selected;
    button('mine').disabled = working || !garden || !selected || !!miner || !visible || document.hidden;
    button('stop').disabled = !miner;
    button('proof').disabled = working || !solution || !!miner;
    button('pending').disabled = working || !wallet?.pending;
    field('recipes').disabled = working || !garden;
  }
  function changed() {
    refreshVersion++; stop();
    field('balance').textContent = 'Public DGT balance: —';
    field('claimable').textContent = 'Select a mushroom to see available hourly tokens.';
    field('recipes').replaceChildren(new Option('Refresh to load your public mushrooms', ''));
    reserved = null;
    if (wallet?.garden) { field('contract').value = wallet.garden; restoreReservation(); }
    else field('reserved').textContent = 'Reservations belong to one wallet, network, and garden.';
    render();
  }
  async function refresh() {
    if (!wallet?.garden) return;
    const version = ++refreshVersion, selected = field('recipes').value;
    const [balance, list, hourly, mining] = await Promise.all([
      wallet.call('balanceOf(address)', [wallet.account]), wallet.call('recipesOf(address)', [wallet.account]),
      wallet.call('hourlyMinted()'), wallet.call('miningMinted()'),
    ]);
    if (destroyed || version !== refreshVersion) return;
    field('balance').textContent = `Public DGT balance: ${uint(balance)} · Hourly pool left: ${900000n - uint(hourly)} · Mining pool left: ${100000n - uint(mining)}`;
    const recipes = recipeList(list);
    field('recipes').replaceChildren(...(recipes.length ? recipes.map(value => new Option(value, value)) : [new Option('No mushrooms registered for this wallet', '')]));
    if (recipes.includes(selected)) field('recipes').value = selected;
    await refreshClaimable(); render();
  }
  async function refreshClaimable() {
    const selected = field('recipes').value;
    if (!selected || !wallet?.garden) return;
    const amount = uint(await wallet.call('claimable(bytes32)', [selected]));
    if (field('recipes').value === selected) field('claimable').textContent = `${amount} whole hourly tokens available for this claim. New mushrooms start with their next full UTC hour; there is no backdating.`;
  }
  async function run(action) {
    if (working || destroyed) return;
    working = true; render();
    try { await action(); }
    catch (error) { status(walletError(error)); toast(walletError(error)); }
    finally { working = false; render(); }
  }
  const handlers = {
    connect: async () => {
      if (!window.isSecureContext || !crypto?.subtle) throw new Error('Public wallets need HTTPS or localhost. Open the secure Doodle Tick address in a wallet-capable browser.');
      if (!wallet) wallet = new GardenWallet(window.ethereum, { onChange: changed, onStatus: status });
      await wallet.connect(); status('Wallet connected. Choose a garden contract, or deploy your own separate garden.');
    },
    disconnect: async () => { stop(); wallet?.destroy(); wallet = null; changed(); status('This page is disconnected. Manage website permissions separately in your wallet.'); },
    network: async () => {
      if (!/^[1-9][0-9]{0,19}$/.test(field('chain').value.trim())) throw new Error('Enter the positive chain ID shown by your wallet.');
      stop(); await wallet.switchChain(field('chain').value.trim());
    },
    attach: async () => { stop(); await wallet.attach(field('contract').value.trim()); await refresh(); status('Exact supported garden code verified on this wallet network.'); },
    deploy: async () => {
      if (!field('deploy-consent').checked) throw new Error('Confirm that you want a separate garden before deployment.');
      stop(); await wallet.deploy(); if (wallet.garden) await refresh();
    },
    reserve: async () => {
      stop(); const fingerprint = fingerprintHex(await mushroomId(getRecipe()));
      const commitment = await wallet.call('registrationCommitment(bytes32,address)', [fingerprint, wallet.account]);
      bytes32(commitment); await wallet.send('reserve(bytes32)', [commitment]); rememberReservation(fingerprint);
    },
    register: async () => {
      if (!reserved) throw new Error('Reserve the current recipe first.');
      stop(); const receipt = await wallet.send('register(bytes32)', [reserved]);
      if (receipt) rememberReservation(null); await refresh();
    },
    refresh: refresh,
    claim: async () => { stop(); await wallet.send('claim(bytes32)', [field('recipes').value]); await refresh(); },
    mine: async () => {
      if (!visible || document.hidden) throw new Error('Keep the public garden visible while mining.');
      stop(); const selected = field('recipes').value, snapshot = wallet.snapshot();
      const controller = new AbortController(); miner = controller; render();
      field('mining').textContent = 'Loading a mining challenge. Stop cancels this attempt.';
      let state;
      try {
        state = words(await wallet.call('miningState(bytes32)', [selected]));
        if (miner !== controller || controller.signal.aborted || !visible || document.hidden || destroyed) {
          if (miner === controller) stop();
          return;
        }
        wallet.unchanged(snapshot);
        if (state.length !== 4 || state[3] !== '0'.repeat(63) + '1') throw new Error('No mining reward is available now. This mushroom may already have mined this hour, or a garden limit was reached.');
      } catch (error) { if (miner === controller) { miner = null; render(); } throw error; }
      const challenge = '0x' + state[0], hour = BigInt('0x' + state[1]), counter = BigInt('0x' + state[2]);
      field('mining').textContent = 'Mining visibly. You can stop at any time.';
      // Deliberately not awaited by the button action: Stop remains available.
      const entropy = crypto.getRandomValues(new Uint32Array(2));
      const start = (BigInt(entropy[0]) << 32n) | BigInt(entropy[1]);
      mineProof(challenge, { signal: controller.signal, start, isVisible: () => visible && !document.hidden && !destroyed,
        onProgress: count => { if (miner === controller) field('mining').textContent = `Mining: ${count.toLocaleString()} attempts. Stops at 60 seconds or 250,000 attempts.`; },
      }).then(result => {
        if (miner !== controller || destroyed) return;
        miner = null; wallet.unchanged(snapshot);
        if (result.nonce !== undefined) {
          solution = { recipe: selected, nonce: result.nonce, hour, counter, snapshot };
          field('mining').textContent = `Proof found after ${result.attempts.toLocaleString()} attempts. Submit found proof to review its gas fee; it expires at the next UTC hour.`;
        } else field('mining').textContent = result.stopped ? 'Mining stopped.' : `Mining stopped at its limit after ${result.attempts.toLocaleString()} attempts. No proof found; start again if you want.`;
        render();
      }).catch(error => { if (miner === controller) miner = null; if (!destroyed) { status(walletError(error)); render(); } });
    },
    stop: async () => stop(),
    proof: async () => {
      if (!solution) throw new Error('Start mining to find a proof first.');
      const found = solution; wallet.unchanged(found.snapshot);
      const receipt = await wallet.send('mine(bytes32,uint256,uint256,uint256)', [found.recipe, found.hour, found.counter, found.nonce]);
      if (receipt) stop(); await refresh();
    },
    transfer: async () => {
      const to = address(field('recipient').value.trim()), amount = field('amount').value.trim();
      if (!/^[1-9][0-9]{0,6}$/.test(amount) || BigInt(amount) > 1000000n) throw new Error('Enter 1–1,000,000 whole tokens.');
      stop(); status(`Review transfer of ${amount} DGT to ${to} in your wallet.`);
      await wallet.send('transfer(address,uint256)', [to, BigInt(amount)]); await refresh();
    },
    pending: async () => { await wallet.waitReceipt(); if (wallet.garden) await refresh(); },
  };
  const click = event => {
    const action = event.target.closest('[data-action]')?.dataset.action;
    if (!action || !handlers[action]) return;
    if (action === 'stop') { stop(); return; }
    void run(handlers[action]);
  };
  const selection = () => { stop(); void run(refreshClaimable); };
  const visibility = () => { if (document.hidden) stop(); else render(); };
  const pagehide = () => stop();
  container.addEventListener('click', click); field('recipes').addEventListener('change', selection);
  field('deploy-consent').addEventListener('change', render);
  document.addEventListener('visibilitychange', visibility); window.addEventListener('pagehide', pagehide);
  render();
  return {
    stop,
    setVisible(value) { visible = !!value; if (!visible) stop(); render(); },
    destroy() {
      stop(); destroyed = true; refreshVersion++; wallet?.destroy();
      container.removeEventListener('click', click); field('recipes').removeEventListener('change', selection);
      field('deploy-consent').removeEventListener('change', render);
      document.removeEventListener('visibilitychange', visibility); window.removeEventListener('pagehide', pagehide);
    },
  };
}
