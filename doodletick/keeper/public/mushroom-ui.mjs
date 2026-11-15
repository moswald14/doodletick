import { recipe, newRecipe, mushroomId, renderMushroom, gardenRequest, verifyGardenResponse, playerAddress, parseAddress, DECORATIONS, pendingCoins, HOUR } from './mushroom-core.mjs';
import { mushroomArt } from './mushroom-art.mjs';
import { hash, tickAt, EPOCH } from './core.mjs';
import { request, vpnStatus } from './vpn-transport.mjs';
import { MINING_RULES, validMiningChallenge } from './mushroom-mining.mjs';
import { createPublicChainUI } from './public-chain.mjs';

export function createMushroomUI({ toast, onUnlockRequest, onActivity }) {
  const root = document.getElementById('view-garden');
  root.innerHTML = `<div class="garden">
    <div class="garden-top"><div><div class="eyebrow">DOT WAVE STUDIO × DOODLE TICK</div><h1>A little garden.<br><em>A growing economy.</em></h1><p class="garden-lead">Your sound has a life of its own. Plant a unique mushroom, collect its hourly coins, and trade with your people.</p><p class="garden-clock" id="garden-clock"></p></div><div class="garden-mascot">${mushroomArt('doodle-dot-wave-garden', ['lantern', 'ring'])}</div></div>
    <div class="garden-mode"><label>YOUR COIN MODE<select id="garden-mode"><option value="private">Private garden · Doodle Coins</option><option value="public">Public chain · my wallet</option></select></label><p>Choose for yourself. Private Keeper coins and public wallet tokens are separate balances; switching does not move or convert them.</p></div>
    <section id="garden-public-wallet" aria-label="Public wallet" hidden></section>
    <div id="garden-private-account">
    <div class="garden-keeper"><label>SHARED GARDEN KEEPER<select id="garden-host"><option value="self">This Keeper</option></select></label><button class="button quiet" id="garden-refresh">Refresh garden</button><button class="button quiet" id="garden-discover">Find private Keepers</button><small id="garden-host-info">Connecting to this Keeper…</small></div>
    <p id="garden-status" class="garden-status" role="status" aria-live="polite"></p>
    <div id="garden-locked" class="utility-card"><h2>A garden for your creator identity.</h2><p>Unlock your vault to plant, earn and trade. You can try the recipe maker below while your vault is locked.</p><button class="button primary" id="garden-unlock">Unlock my vault ↗</button></div>
    <div id="garden-wallet" class="garden-wallet" hidden><div><small>PRIVATE DOODLE COINS</small><strong class="garden-number" id="garden-balance">0</strong></div><div><small>HOURS READY TO MINT</small><strong class="garden-number" id="garden-pending">0</strong></div><div><small>GENERATOR RATE</small><strong class="garden-number" id="garden-rate">0 / hr</strong></div><div class="wallet-actions"><button class="button" id="garden-join">Join this garden</button><button class="button" id="garden-harvest">Mint completed hours</button><button class="button" id="garden-send">Send coins</button><button class="button" id="garden-address">Copy my address</button></div></div>
    <section id="garden-mining" class="garden-mining" aria-labelledby="garden-mining-title"><h2 id="garden-mining-title">Mine a private bonus</h2><p>Optional proof of work uses this device’s processor and power. One successful attempt adds 1 private Doodle Coin, at most once per player and mushroom each UTC hour. It stops after one result, when you leave this garden or hide the page, or when your vault locks.</p><div class="garden-row"><label>YOUR MUSHROOM<select id="garden-mine-mushroom" aria-label="Mushroom for private mining"></select></label><button class="button primary" id="garden-mine-start">Start mining</button><button class="button quiet" id="garden-mine-stop" disabled>Stop mining</button></div><p id="garden-mine-status" class="garden-hint" role="status" aria-live="polite">Stopped. Mining never starts automatically.</p><p class="garden-hint">Work runs in short slices with longer rests, for at most five minutes. Hourly mushroom earnings need no mining and continue while you’re away.</p></section>
    <button id="garden-retry" class="button primary" hidden>Retry the pending action safely</button>
    </div>
    <details class="garden-editor" id="garden-editor" open><summary>Recipe maker · Grow a little glitch</summary><div class="garden-credit">THE ORIGINAL DOT WAVE MUSHROOM RECIPE</div><div class="garden-editor-layout"><div id="garden-preview" class="garden-preview"></div><div><div class="garden-row"><label>MUSHROOM NAME<input id="garden-name" maxlength="60" value="New spore"></label><button class="button quiet" id="garden-new">✦ New spore</button><button class="button quiet" id="garden-import">Open Dot Wave recipe</button></div><div class="garden-knobs">${[['growth','Growth'],['static','Static'],['glitch','Glitch'],['mix','Strength']].map(([id, title]) => `<label>${title}<output id="garden-${id}-value"></output><input type="range" id="garden-${id}" aria-label="Mushroom ${title.toLowerCase()}" min="0" max="100" value="50"></label>`).join('')}</div><p id="garden-seed" class="garden-hint"></p><div class="garden-row"><button class="button quiet" id="garden-listen">▶ Listen</button><button class="button quiet" id="garden-stop">■ Stop</button><button class="button quiet" id="garden-export">Save Dot Wave recipe</button></div><p class="garden-hint">Four seconds of the original sound, looped quietly. Opening a recipe stays silent. Save it to reopen in Dot Wave Studio.</p></div></div><div class="garden-row"><label>CREATOR CREDIT<input id="garden-credit" maxlength="200" placeholder="Who made this recipe?"></label></div><label class="garden-check"><input type="checkbox" id="garden-rights"><span>I made this recipe or have permission to use it here. I’ve kept its creator credit. Listing a mushroom shares its recipe with this garden.</span></label><button class="button primary" id="garden-plant">Plant this mushroom · 1 coin / hour</button><p class="garden-hint">A name change or a copied file doesn’t create a second generator. First coin follows the first full UTC hour you own it.</p><input type="file" id="garden-file" accept=".json,application/json" hidden></details>
    <div id="garden-private-browse"><div class="garden-tabs" role="tablist" aria-label="Garden views"><button role="tab" aria-selected="true" class="button quiet" data-garden-tab="mine">My mushrooms</button><button role="tab" aria-selected="false" class="button quiet" data-garden-tab="market">Mushroom market</button><button role="tab" aria-selected="false" class="button quiet" data-garden-tab="activity">Coin activity</button></div>
    <div id="garden-cards" class="garden-cards"></div><ul id="garden-activity" class="garden-activity" hidden></ul>
    <details class="garden-notes"><summary>How the garden keeps score</summary><p>Each recipe has one generator per shared Keeper. Every complete UTC hour earns one Doodle Coin, including time spent away. Collecting or spending settles earned hours using the Keeper’s clock. Buying a mushroom moves its future earning rights and decorations; the seller keeps earlier earnings. Coins buy decorations or other mushrooms, or can be sent to players in this same garden.</p><p>Choose the same Keeper as your friends. Different Keepers have separate balances. This is a small, private game economy administered by that Keeper, not a cryptocurrency or a cash balance. The Keeper must be reachable to trade. Its owner controls the ledger, clock and backups.</p><p>Buying a generator does not buy copyright or an exclusive claim to the sound. Credit stays attached. Recipes imported from Dot Wave do not prove authorship. Use Files & peers for licensed distribution; its Creative Commons checks remain separate. Keep your encrypted identity backup and back up the Keeper’s data to preserve the garden.</p><p>100 mushrooms per player, 1,000 players and 2,000 mushrooms per Keeper. The market shows up to 200 listings; recent activity is retained for the last 2,000 actions. Signed actions are limited to 100,000 per garden in this edition.</p></details>
    </div><dialog class="garden-dialog" id="garden-dialog"><form id="garden-form"><h2 id="garden-dialog-title"></h2><p id="garden-dialog-copy"></p><div id="garden-dialog-fields"></div><p id="garden-dialog-error" role="alert"></p><div class="dialog-actions"><button type="button" class="button quiet" id="garden-cancel">Cancel</button><button type="submit" class="button primary" id="garden-confirm">Confirm</button></div></form></dialog>
  </div>`;
  const $ = id => document.getElementById('garden-' + id);
  const canVerify = Boolean(globalThis.crypto?.subtle);
  let identity = null, issuer = null, state = null, host = 'self', current = newRecipe(), visible = false, busy = false, pending = null;
  let refreshSerial = 0, fileSerial = 0;
  let generation = 0, previewSerial = 0, tab = 'mine', context = null, source = null, audioSerial = 0, dialogAction = null;
  let mode = 'private', miningWorker = null, miningSerial = 0, miningPhase = 'idle', miningMushroom = null;
  const publicWallet = createPublicChainUI($('public-wallet'), { getRecipe: () => recipe(current), toast });
  try { if (localStorage.getItem('doodletick-garden-mode') === 'public') mode = 'public'; } catch {}
  $('mode').value = mode;
  try { host = localStorage.getItem('doodletick-garden-host') || 'self'; } catch {}
  if (!/^(self|100\.[\d.]+)$/.test(host)) host = 'self';
  if (host !== 'self') $('host').add(new Option(host, host)); $('host').value = host;
  const status = (text, error = false) => { $('status').textContent = text; $('status').dataset.error = String(error); };
  const pinKey = () => 'doodletick-garden-issuer:' + host;
  function stop() { audioSerial++; try { source?.stop(); } catch {} source?.disconnect(); source = null; context?.close().catch(() => {}); context = null; $('listen').textContent = '▶ Listen'; }
  function stopMining(message = 'Stopped. Press Start mining when you want to try again.') {
    miningSerial++; miningWorker?.terminate(); miningWorker = null; miningPhase = 'idle'; miningMushroom = null;
    $('mine-status').textContent = message; controls();
  }
  function miningMayContinue(ticket, serial) { return ticket === miningSerial && serial === generation && visible && !document.hidden && mode === 'private' && Boolean(identity); }
  async function startMining() {
    if (busy || pending || miningPhase !== 'idle' || !state?.joined || !visible || document.hidden || mode !== 'private') return;
    if (!globalThis.Worker) { $('mine-status').textContent = 'This browser cannot run a mining worker. Hourly minting still works.'; return; }
    const mushroom = $('mine-mushroom').value;
    if (!mushroom) return;
    const ticket = ++miningSerial, serial = generation;
    miningPhase = 'starting'; $('mine-status').textContent = 'Requesting your signed, expiring challenge…'; controls();
    try {
      const answer = await act('mining-challenge', { id: mushroom }, { guard: () => miningMayContinue(ticket, serial) });
      if (!miningMayContinue(ticket, serial)) return;
      const envelope = answer?.record.result.challenge, challenge = envelope?.record;
      if (!envelope) { stopMining('No mining started. Resolve any pending action, then press Start mining.'); return; }
      if (!await verifyGardenResponse(envelope, issuer) || !validMiningChallenge(challenge) || challenge.owner !== identity.fingerprint || challenge.mushroom !== mushroom) throw Error('The mining challenge signature or terms did not verify.');
      if (!miningMayContinue(ticket, serial)) return;
      const remainingMs = challenge.expiresAt - (state?.time || answer.record.time);
      if (remainingMs <= 0 || remainingMs > MINING_RULES.lifetimeMs) throw Error('The mining challenge expired. Press Start mining to try again.');
      const worker = new Worker(new URL('./mushroom-miner.mjs', import.meta.url), { type: 'module' });
      miningWorker = worker; miningMushroom = mushroom; miningPhase = 'working'; controls();
      $('mine-status').textContent = 'Mining with rest breaks. Keep this garden visible; Stop mining is always available.';
      worker.onerror = () => { if (miningMayContinue(ticket, serial)) stopMining('The mining worker stopped. Your saved coins are unchanged.'); };
      worker.onmessage = async ({ data }) => {
        if (!miningMayContinue(ticket, serial) || miningWorker !== worker) return;
        if (data?.type === 'progress') $('mine-status').textContent = 'Mining · ' + Number(data.attempts).toLocaleString() + ' hashes checked · rest breaks enabled';
        else if (data?.type === 'error') stopMining(data.message);
        else if (data?.type === 'solved') {
          worker.terminate(); miningWorker = null; miningPhase = 'claiming'; controls();
          $('mine-status').textContent = 'Work found. Asking this Keeper to verify and save the bonus…';
          const receipt = await act('mining-claim', { challengeId: challenge.challengeId, nonce: data.nonce }, { guard: () => miningMayContinue(ticket, serial) });
          if (miningMayContinue(ticket, serial)) stopMining(receipt?.record.result.mined ? 'Stopped. Your Keeper saved 1 private mining bonus coin.' : 'Stopped. Check the garden status for the claim outcome.');
        }
      };
      worker.postMessage({ type: 'start', challenge, remainingMs });
    } catch (error) { if (miningMayContinue(ticket, serial)) stopMining(error.message); }
  }
  async function preview() {
    // A decorative preview is available on HTTP; only the verified hash can identify a generator.
    const serial = ++previewSerial, id = canVerify ? await mushroomId(current) : 'preview-' + current.settings.seed;
    if (serial !== previewSerial) return;
    $('preview').innerHTML = mushroomArt(id, [], current.settings.growth);
    $('seed').textContent = `Spore ${current.settings.seed} · ${current.patch ? 'Captured collision' : 'Pure static'} · ${canVerify ? id.slice(0, 12) : 'Recipe preview · verify over HTTPS'}`;
  }
  function edit(r) {
    fileSerial++; stop(); current = recipe(r); $('name').value = current.name;
    for (const k of ['growth','static','glitch','mix']) { $(k).value = Math.round(current.settings[k] * 100); $(k + '-value').textContent = Math.round(current.settings[k] * 100) + '%'; }
    $('rights').checked = false; preview().catch(e => status(e.message, true));
  }
  function controls() {
    const privateMode = mode === 'private', mining = miningPhase !== 'idle';
    $('private-account').hidden = !privateMode; $('private-browse').hidden = !privateMode; $('public-wallet').hidden = privateMode;
    $('plant').hidden = !privateMode; $('rights').closest('label').hidden = !privateMode;
    $('credit').closest('.garden-row').hidden = !privateMode; $('plant').nextElementSibling.hidden = !privateMode;
    $('locked').hidden = Boolean(identity); $('wallet').hidden = !identity;
    $('join').hidden = Boolean(state?.joined); $('join').disabled = busy || mining || !issuer || !identity || Boolean(pending);
    for (const name of ['plant','harvest','send','address']) $(name).disabled = !privateMode || busy || mining || !state?.joined || Boolean(pending);
    $('harvest').disabled ||= !state?.pending;
    $('retry').hidden = !pending; $('retry').disabled = busy;
    $('host').disabled = busy || Boolean(pending);
    for (const b of $('cards').querySelectorAll('button')) b.disabled = busy || mining || Boolean(pending);
    $('balance').textContent = (state?.balance || 0).toLocaleString(); $('pending').textContent = (state?.pending || 0).toLocaleString();
    $('rate').textContent = (state?.mushrooms.length || 0) + ' / hr';
    const hour = Math.floor(((state?.time || 0) - EPOCH) / HOUR), selected = $('mine-mushroom').value;
    const eligible = (state?.mushrooms || []).filter(m => !(m.lastMiningHour >= hour));
    $('mine-mushroom').replaceChildren(...eligible.map(m => new Option(m.recipe.name, m.id)));
    if (eligible.some(m => m.id === selected)) $('mine-mushroom').value = selected;
    if (!eligible.length) $('mine-mushroom').add(new Option('Plant a mushroom, or wait for its next UTC hour', ''));
    $('mine-mushroom').disabled = mining || busy || Boolean(pending);
    $('mine-start').disabled = !privateMode || mining || busy || Boolean(pending) || !state?.joined || !state?.mining || !eligible.length || (state?.mining?.lastClaimedHour ?? -1) >= hour;
    $('mine-stop').disabled = !mining;
    if (!mining && state && (state.mining?.lastClaimedHour ?? -1) >= hour) $('mine-status').textContent = 'This player already mined its bonus this UTC hour. The next hour starts ' + new Date(EPOCH + (hour + 1) * HOUR).toLocaleTimeString() + '. Press Start mining then if you choose.';
    if (!mining && state?.joined && !state.mining) $('mine-status').textContent = 'This Keeper needs a mining-capable update. Hourly minting still works.';
  }
  async function refresh(silent = false) {
    const ticket = ++refreshSerial, serial = generation, selectedHost = host, who = identity;
    if (!canVerify) {
      state = null; issuer = null;
      $('host-info').textContent = 'Open this app over HTTPS to connect your garden.';
      controls(); render();
      status('Planting, coins and trading need HTTPS. You can still make, listen to and save mushroom recipes here.');
      return;
    }
    try {
      const info = await request('garden/' + selectedHost + '/info');
      const fp = info.record?.issuer;
      if (!await verifyGardenResponse(info, fp) || info.record.kind !== 'info') throw Error('The garden Keeper signature did not verify.');
      if (serial !== generation || ticket !== refreshSerial) return;
      let pin; try { pin = localStorage.getItem(pinKey()); } catch {}
      if (pin && pin !== fp) throw Error('This Keeper identity changed. Its old coins are not interchangeable. Restore the original Keeper before continuing.');
      try { localStorage.setItem(pinKey(), fp); } catch { throw Error('Enable browser storage so this garden Keeper identity can be remembered.'); }
      issuer = fp;
      $('host-info').textContent = 'Garden Keeper: ' + fp + ' · Coins stay in this garden.';
      if (who) {
        const proof = await gardenRequest(who, issuer, 'account');
        const answer = await request('garden/' + selectedHost + '/account', { method: 'POST', body: proof, retry: true });
        if (!await verifyGardenResponse(answer, issuer, await hash(proof.record)) || answer.record.owner !== who.fingerprint || answer.record.kind !== 'account') throw Error('Garden balance signature did not verify.');
        if (serial !== generation || ticket !== refreshSerial) return;
        state = answer.record;
        if (pending && state.history.some(e => e.record.requestId === pending.id)) pending = null;
        if (miningWorker && (!state.mushrooms.some(m => m.id === miningMushroom) || (state.mining?.lastClaimedHour ?? -1) >= Math.floor((state.time - EPOCH) / HOUR))) stopMining('Stopped because ownership or the mining allowance changed.');
      } else state = null;
      if (!silent) status(state?.joined ? 'Garden synced. Your Keeper keeps time, even while you’re away.' : (identity ? 'Join this garden to start planting.' : 'Unlock your vault, then join this garden to start planting.'));
      render(); controls();
    } catch (error) { if (serial === generation && ticket === refreshSerial) { state = null; issuer = null; if (miningWorker) stopMining('Stopped because this Keeper could not be verified or reached.'); controls(); render(); status(error.message, true); } }
  }
  async function act(action, args = {}, { guard = () => true } = {}) {
    if (busy) return;
    if (mode !== 'private' || !guard()) return;
    if (!identity || !issuer || !state) { onUnlockRequest(); return; }
    if (pending) { status('Retry the pending action before making another.', true); return; }
    busy = true; refreshSerial++; controls(); onActivity();
    const serial = generation, who = identity;
    try {
      const proof = await gardenRequest(who, issuer, action, args, state.sequence + 1);
      const id = await hash(proof.record);
      if (serial !== generation || !guard()) return;
      pending = { proof, id, host, issuer };
      return await submitPending(serial);
    } catch (e) { if (serial === generation) status(e.message, true); }
    finally { if (serial === generation) { busy = false; controls(); } }
  }
  async function submitPending(serial) {
    const transaction = pending;
    try {
      const answer = await request('garden/' + transaction.host + '/action', { method: 'POST', body: transaction.proof, retry: true });
      if (!await verifyGardenResponse(answer, transaction.issuer, transaction.id) || answer.record.kind !== 'receipt') throw Error('The payment receipt did not verify. Retry to check its outcome.');
      if (serial !== generation) return;
      pending = null; if (answer.record.result.action === 'plant') { $('editor').open = false; tab = 'mine'; for (const t of root.querySelectorAll('[data-garden-tab]')) t.setAttribute('aria-selected', String(t.dataset.gardenTab === tab)); } await refresh(true);
      const earned = answer.record.result.earned;
      status(`Saved by the garden Keeper.${earned ? ' Collected ' + earned + ' coins.' : ''}`);
      toast('Garden action saved.');
      return answer;
    } catch (e) {
      if (serial !== generation) return;
      if ([400,403,409,413].includes(e.status)) { pending = null; await refresh(true); }
      status(e.message + (pending ? ' The outcome is uncertain; retry uses the same signed action and cannot charge twice.' : ''), true);
    }
  }
  function download(value, name) {
    const url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' }));
    const a = document.createElement('a'); a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  function dialog(title, copy, fields, action) {
    $('dialog-title').textContent = title; $('dialog-copy').textContent = copy; $('dialog-fields').replaceChildren(...fields);
    $('dialog-error').textContent = ''; dialogAction = action; $('dialog').showModal();
  }
  function input(label, type = 'text', value = '') {
    const field = document.createElement('label'), element = document.createElement('input'); field.textContent = label; element.type = type; element.value = value; element.required = true;
    if (type === 'number') { element.min = '1'; element.max = '1000000000'; element.step = '1'; }
    field.append(element); return { field, element };
  }
  function button(label, fn) { const b = document.createElement('button'); b.className = 'button quiet'; b.textContent = label; b.disabled = busy || miningPhase !== 'idle' || Boolean(pending); b.onclick = fn; return b; }
  function render() {
    $('cards').replaceChildren(); $('activity').replaceChildren(); $('cards').hidden = tab === 'activity'; $('activity').hidden = tab !== 'activity';
    if (tab === 'activity') {
      for (const receipt of state?.history || []) {
        const event = receipt.record;
        const li = document.createElement('li'), when = document.createElement('time');
        const r = event.result, mine = event.owner === identity?.fingerprint;
        li.textContent = `${r.action === 'send' ? (mine ? 'Sent' : 'Received') : r.action === 'buy' ? (mine ? 'Bought mushroom' : 'Sold mushroom') : r.action === 'harvest' ? 'Minted completed hours' : r.action === 'mining-challenge' ? 'Requested mining challenge' : r.action === 'mining-claim' ? 'Mined private bonus' : r.action === 'decorate' ? 'Bought ' + DECORATIONS[r.item].name : r.action === 'plant' ? 'Planted mushroom' : r.action === 'list' ? (r.amount === null ? 'Removed listing' : 'Listed mushroom') : 'Joined garden'}${r.amount ? ' · ' + r.amount + ' coins' : r.earned || r.mined ? ' · ' + ((r.earned || 0) + (r.mined || 0)) + ' coins' : ''}`;
        when.textContent = new Date(event.time).toLocaleString(); li.append(when, button('Save receipt', () => download(receipt, 'garden-receipt.json'))); $('activity').append(li);
      }
      if (!$('activity').children.length) $('activity').textContent = 'Your coin activity will appear here.';
      return;
    }
    const items = tab === 'mine' ? state?.mushrooms : state?.market;
    if (!items?.length) { const div = document.createElement('div'); div.className = 'garden-empty'; div.textContent = !state?.joined ? 'Unlock and join a garden to see its mushrooms.' : tab === 'mine' ? 'Your first spore is waiting. Make a recipe above, or bring one from Dot Wave Studio.' : 'No mushrooms for sale yet. List one from My mushrooms.'; $('cards').append(div); return; }
    for (const m of items) {
      const card = document.createElement('article'); card.className = 'garden-card';
      const art = document.createElement('div'); art.className = 'garden-card-art'; art.innerHTML = mushroomArt(m.id, m.decorations, m.recipe.settings.growth);
      const body = document.createElement('div'); body.className = 'garden-card-body'; const h = document.createElement('h3'); h.textContent = m.recipe.name;
      const credit = document.createElement('p'); credit.textContent = 'Recipe credit · ' + m.credit;
      const caption = document.createElement('p'); caption.textContent = tab === 'market' ? m.price + ' coins · 1 coin / hour' : `1 coin / hour · ${pendingCoins(m, state.time)} ready`;
      const next = document.createElement('p'); next.textContent = 'Next earning hour completes ' + new Date(EPOCH + (Math.max(m.paidThrough, tickAt(state.time).index) + 1) * HOUR).toLocaleString();
      const code = document.createElement('p'); code.className = 'garden-id'; code.textContent = m.id;
      const actions = document.createElement('div'); actions.className = 'garden-row';
      actions.append(button('Open recipe', () => { $('editor').open = true; edit(m.recipe); $('credit').value = m.credit; status('Recipe opened. Its existing generator stays unchanged.'); $('name').focus(); }));
      if (m.owner === identity?.fingerprint) {
        actions.append(button(m.price === null ? 'Sell' : 'Price: ' + m.price, () => {
          const price = input('PRICE IN DOODLE COINS', 'number', m.price || 5);
          dialog('List ' + m.recipe.name, 'This lists the generator and its recipe in this garden. A buyer gets future hourly coins and decorations. Your creator credit stays attached.', [price.field], () => act('list', { id: m.id, price: Number(price.element.value) }));
        }));
        if (m.price !== null) actions.append(button('Unlist', () => act('list', { id: m.id, price: null })));
        actions.append(button('Decorate', () => {
          const field = document.createElement('label'); field.textContent = 'DECORATION'; const select = document.createElement('select');
          for (const [id, d] of Object.entries(DECORATIONS)) if (!m.decorations.includes(id)) select.add(new Option(d.name + ' · ' + d.price + ' coins', id));
          if (!select.options.length) { status('This mushroom has all three decorations.'); return; }
          field.append(select); dialog('A little extra character.', 'Coins are spent permanently. Decorations stay with this mushroom if it is sold; its earning rate stays one per hour.', [field], () => act('decorate', { id: m.id, item: select.value }));
        }));
      } else if (tab === 'market') actions.append(button('Buy · ' + m.price, () => dialog('Buy ' + m.recipe.name, `Pay ${m.price} Doodle Coins to ${m.owner}. You receive this generator’s future hourly coins and decorations. This does not transfer copyright.`, [], () => act('buy', { id: m.id, price: m.price, seller: m.owner }))));
      body.append(h, credit, caption, next, code, actions); card.append(art, body); $('cards').append(card);
    }
  }
  $('form').onsubmit = async e => { e.preventDefault(); try { const action = dialogAction; $('dialog').close(); await action?.(); } catch (error) { status(error.message, true); } };
  $('cancel').onclick = () => $('dialog').close();
  $('refresh').onclick = () => { if (!busy) refresh(); };
  $('discover').onclick = async () => { try { const vpn = await vpnStatus(); if (!vpn.ready) throw Error(vpn.message); for (const p of vpn.peers) if (![...$('host').options].some(o => o.value === p.ip)) $('host').add(new Option(p.name + ' · ' + p.ip, p.ip)); status('Choose the same garden Keeper as your friends.'); } catch (e) { status(e.message, true); } };
  $('host').onchange = () => { if (busy || pending) return; stopMining(); generation++; stop(); host = $('host').value; issuer = null; state = null; try { localStorage.setItem('doodletick-garden-host', host); } catch {} refresh(); };
  $('mode').onchange = () => { stopMining(); stop(); $('dialog').close(); mode = $('mode').value; try { localStorage.setItem('doodletick-garden-mode', mode); } catch {} publicWallet.setVisible(visible && mode === 'public'); controls(); if (mode === 'private' && visible && !busy && !pending) refresh(); };
  $('mine-start').onclick = startMining;
  $('mine-stop').onclick = () => stopMining();
  $('unlock').onclick = onUnlockRequest;
  $('join').onclick = () => act('join'); $('harvest').onclick = () => act('harvest');
  $('retry').onclick = async () => { if (busy || !pending) return; busy = true; const serial = generation; controls(); try { await submitPending(serial); } finally { if (serial === generation) { busy = false; controls(); } } };
  $('address').onclick = async () => { try { await navigator.clipboard.writeText(playerAddress(issuer, identity.fingerprint)); status('Player address copied. Send it to a friend in this same garden.'); } catch { status('Clipboard unavailable: ' + playerAddress(issuer, identity.fingerprint)); } };
  $('send').onclick = () => {
    const recipient = input('RECIPIENT’S GARDEN ADDRESS'), coins = input('COINS TO SEND', 'number', 1);
    dialog('Send Doodle Coins', 'Paste your friend’s address. They must have joined this same garden. The payment is recorded when you confirm.', [recipient.field, coins.field], () => act('send', { to: parseAddress(recipient.element.value, issuer), amount: Number(coins.element.value) }));
  };
  $('new').onclick = () => { edit(newRecipe()); $('credit').value = identity?.username || ''; };
  $('name').oninput = () => { current.name = $('name').value.trim().slice(0,60) || 'My mushroom'; onActivity(); };
  for (const k of ['growth','static','glitch','mix']) $(k).oninput = () => { stop(); current.settings[k] = Number($(k).value) / 100; $(k + '-value').textContent = $(k).value + '%'; onActivity(); preview(); };
  $('import').onclick = () => $('file').click();
  $('file').onchange = async () => { const file = $('file').files[0]; $('file').value = ''; if (!file) return; stop(); const ticket = ++fileSerial; try { if (file.size > 32000) throw Error('Choose a mushroom recipe smaller than 32 KB.'); const parsed = JSON.parse(await file.text()); if (ticket !== fileSerial) return; edit(parsed); $('credit').value = ''; status('Dot Wave recipe opened. Keep its original credit when planting.'); } catch (e) { status(e.message, true); } };
  $('export').onclick = () => download(current, current.name.replace(/[^\w-]/g, '-').slice(0,50) + '.mushroom.json');
  $('plant').onclick = () => { if (!$('rights').checked || !$('credit').value.trim()) { status('Add the creator credit and confirm your right to use this recipe.', true); return; } act('plant', { recipe: current, credit: $('credit').value.trim(), rightsConfirmed: true }); };
  $('listen').onclick = async () => {
    stop(); const serial = audioSerial; onActivity();
    try {
      context = new AudioContext(); const ctx = context; await ctx.resume(); if (serial !== audioSerial) return;
      const sound = renderMushroom(current); if (serial !== audioSerial) return;
      const buffer = ctx.createBuffer(1, sound.samples.length, sound.rate); buffer.copyToChannel(sound.samples, 0);
      const gain = ctx.createGain(); gain.gain.value = .15; gain.connect(ctx.destination);
      source = ctx.createBufferSource(); source.buffer = buffer; source.loop = true; source.connect(gain); source.start(); $('listen').textContent = '♫ Listening';
    } catch (e) { if (serial === audioSerial) { stop(); status(e.message, true); } }
  };
  $('stop').onclick = stop;
  for (const b of root.querySelectorAll('[data-garden-tab]')) b.onclick = () => { tab = b.dataset.gardenTab; for (const t of root.querySelectorAll('[data-garden-tab]')) t.setAttribute('aria-selected', String(t === b)); render(); };
  const timer = setInterval(() => { if (!visible || document.hidden) return; const tick = tickAt(); $('clock').textContent = `${tick.color} · Tick ${tick.index.toLocaleString()} · One new color, every hour`; if (mode === 'private' && !busy && !pending) refresh(true); }, 30000);
  document.addEventListener('visibilitychange', () => { if (document.hidden) { stop(); stopMining('Stopped because the page was hidden. Mining will not resume automatically.'); publicWallet.stop(); } });
  window.addEventListener('pagehide', () => { clearInterval(timer); stop(); stopMining(); publicWallet.stop(); });
  edit(current); controls(); render();
  return {
    unlock(who) { stopMining(); publicWallet.stop(); generation++; identity = who; issuer = null; state = null; pending = null; busy = false; $('credit').value ||= who.username; controls(); if (visible && mode === 'private') refresh(); },
    lock() { stopMining('Stopped because the vault locked. Mining will not resume automatically.'); publicWallet.stop(); generation++; identity = null; state = null; issuer = null; pending = null; busy = false; stop(); $('dialog').close(); edit(newRecipe()); $('credit').value = ''; controls(); render(); status('Vault locked. Your garden stays with its Keeper.'); },
    setVisible(value) { const opened = value && !visible; visible = value; publicWallet.setVisible(value && mode === 'public'); if (!value) { stop(); stopMining('Stopped because you left the garden. Mining will not resume automatically.'); } if (opened) { const tick = tickAt(); $('clock').textContent = `${tick.color} · Tick ${tick.index.toLocaleString()} · One new color, every hour`; if (mode === 'private') refresh(); } }
  };
}
