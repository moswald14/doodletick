// SPDX-License-Identifier: GPL-3.0-only
import { hash } from './core.mjs';
import { dotlandsRequest, verifyDotlandsRequest, verifyDotlandsResponse } from './dotlands-protocol.mjs';
const CHANNEL = 'doodleverse-dotlands-frame-v1';
const CODE = /^[A-Z2-9]{6}$/;
const copy = value => structuredClone(value);
const failure = (message, status) => Object.assign(new Error(message), { status });
const plain = value => value && typeof value === 'object' && !Array.isArray(value);

export function dotlandsInvitation(href, code) {
  const url = new URL(href);
  // Ingress paths may contain a session credential; loopback addresses refer
  // to each friend's own device. Share only the room code in either case.
  if (['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) || /(?:^|\/)hassio(?:_|\/)|ingress/i.test(url.pathname)) return null;
  url.search = ''; url.username = ''; url.password = '';
  url.searchParams.set('dotlands', code); url.hash = 'dotlands'; return url.href;
}

// Signed pending requests contain no private keys. Retaining the exact request
// before transmission makes an interrupted paid admission safe to retry.
export function createDotlandsClient({ clock, fetchImpl = (...args) => fetch(...args), storage } = {}) {
  if (storage === undefined) { try { storage = globalThis.localStorage; } catch { storage = null; } }
  let identity = null, issuer = null, quote = null, generation = 0, pending = null, writing = false, initialized = false;
  const controllers = new Set();
  const storageKey = () => 'doodletick.dotlands.pending.v1:' + issuer + ':' + identity.fingerprint;
  function check(ticket) { if (!identity || ticket !== generation) throw failure('Unlock your Keeper identity to continue.', 401); }
  function persist(value) {
    if (!storage) throw failure('Browser storage is required to protect a paid entry. Enable it before joining.', 503);
    if (value) storage.setItem(storageKey(), JSON.stringify(value)); else storage.removeItem(storageKey());
  }
  async function read(url, body, ticket) {
    check(ticket);
    const controller = new AbortController(); controllers.add(controller);
    const timer = setTimeout(() => controller.abort(), 20000);
    try {
      const response = await fetchImpl(url, { method: body === undefined ? 'GET' : 'POST',
        headers: { 'X-Keeper-Request': '1', ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
        body: body === undefined ? undefined : JSON.stringify(body), signal: controller.signal, cache: 'no-store', credentials: 'same-origin' });
      const text = await response.text();
      if (text.length > 2000000) throw failure('The saved-room reply was too large.');
      let data; try { data = JSON.parse(text); } catch { throw failure('The Keeper did not return a saved-room reply. Try again.'); }
      check(ticket); return { response, data };
    } finally { clearTimeout(timer); controllers.delete(controller); }
  }
  async function info() {
    const ticket = generation; check(ticket); initialized = false;
    if (!clock) throw failure('The Keeper clock is unavailable. Reopen Keeper.');
    try { clock.requestNow(); } catch { await clock.sync(); }
    check(ticket); clock.requestNow();
    const expected = clock.snapshot().issuer;
    const { response, data } = await read('./api/dotlands/info', undefined, ticket);
    if (!response.ok || !await verifyDotlandsResponse(data, expected) || data.record.kind !== 'info' || data.record.price !== 1 || typeof data.record.currency !== 'string') throw failure('The saved-room price or Keeper signature could not be verified.');
    check(ticket); issuer = expected; quote = data.record;
    try {
      const raw = storage?.getItem(storageKey());
      if (raw) {
        if (raw.length > 20000) throw Error();
        const saved = JSON.parse(raw);
        if (!await verifyDotlandsRequest(saved, issuer) || saved.record.owner !== identity.fingerprint || !['create', 'join', 'start', 'action'].includes(saved.record.operation)) throw Error();
        check(ticket);
        // A concurrent verified reply may have cleared this stored proof while
        // its signature was being checked. Never resurrect a completed write.
        if (storage?.getItem(storageKey()) === raw) pending = saved;
      }
    } catch { throw failure('A pending room request could not be verified. Keep this browser data and restore its matching identity before trying again.'); }
    check(ticket); initialized = true; return copy(quote);
  }
  async function submit(proof, ticket, write) {
    const requestId = await hash(proof.record);
    const { response, data } = await read('./api/dotlands/request', proof, ticket);
    if (!await verifyDotlandsResponse(data, issuer, requestId) || data.record.kind !== 'response' || data.record.owner !== identity.fingerprint) throw failure('The Keeper reply did not verify. Retry the same request.');
    check(ticket);
    const status = data.record.status || response.status;
    // Server/storage failure can follow a committed garden debit. Keep the
    // exact proof until success or a definitive, verified rejection arrives.
    const rejected = !response.ok || Boolean(data.record.error);
    const definitive = rejected && status >= 400 && status < 500 && ![408, 429].includes(status);
    if (write && (!rejected || definitive)) { persist(null); pending = null; }
    if (rejected) throw failure(typeof data.record.error === 'string' ? data.record.error : 'The Keeper declined this request.', status);
    return copy(data.record.data);
  }
  async function request(operation, args = {}) {
    const ticket = generation; check(ticket);
    if (!initialized) await info(); check(ticket);
    const write = ['create', 'join', 'start', 'action'].includes(operation);
    if (write && (writing || pending)) throw failure('Retry your pending request before starting another paid entry or move.', 409);
    if (write) writing = true;
    try {
      try { clock.requestNow(); } catch { await clock.sync(); }
      check(ticket);
      const proof = await dotlandsRequest(identity, issuer, operation, args, clock.requestNow());
      check(ticket);
      if (write) { persist(proof); pending = proof; }
      return await submit(proof, ticket, write);
    } finally { if (ticket === generation && write) writing = false; }
  }
  return {
    unlock(value) { this.lock(); identity = value; },
    lock() { generation++; identity = issuer = quote = pending = null; writing = initialized = false; for (const controller of controllers) controller.abort(); controllers.clear(); },
    info, request,
    get pending() { return pending ? { operation: pending.record.operation, args: copy(pending.record.args) } : null; },
    async retry() {
      const ticket = generation; check(ticket);
      if (!pending || writing) throw failure('No saved request is ready to retry.');
      writing = true;
      try { return await submit(pending, ticket, true); } finally { if (ticket === generation) writing = false; }
    },
  };
}

export function createDotlandsUI({ container = document.getElementById('view-dotlands'), toast = () => {}, clock, onUnlockRequest = () => {}, onGardenRequest = () => {}, onActivity = () => {} } = {}) {
  if (!container) throw Error('The saved Dotlands view is missing.');
  container.innerHTML = `<style>
    #view-dotlands .dl-top{display:flex;gap:16px;align-items:center;justify-content:space-between;flex-wrap:wrap}
    #view-dotlands .dl-panel{border:1px solid var(--line,#ccd4c8);border-radius:18px;padding:22px;margin:18px 0}
    #view-dotlands .dl-entry{display:flex;gap:12px;align-items:end;flex-wrap:wrap}#view-dotlands .dl-entry label{display:grid;gap:6px}
    #view-dotlands input{font:inherit;padding:12px;border-radius:10px;border:1px solid var(--line,#ccd4c8);max-width:210px;text-transform:uppercase}
    #view-dotlands .dl-list{list-style:none;padding:0;display:grid;gap:12px}#view-dotlands .dl-list li{display:flex;gap:12px;justify-content:space-between;align-items:center;flex-wrap:wrap;border-top:1px solid var(--line,#ccd4c8);padding-top:14px}
    #view-dotlands .dl-room-details{display:grid;gap:5px}#view-dotlands iframe{width:100%;height:85dvh;min-height:560px;border:1px solid #ccd4c8;border-radius:18px;background:#edf1e9}#view-dotlands .dl-note{font-size:.9em;line-height:1.55}
    @media(max-width:600px){#view-dotlands .dl-panel{padding:14px}#view-dotlands .dl-entry>*{flex:1 1 100%}#view-dotlands iframe{height:86dvh;min-height:620px}}
  </style><div class="dl-top"><div><span class="eyebrow">THE DOODLEVERSE / SAVED STRATEGY</span><h1>Dotlands</h1></div><button class="button quiet" data-dl="refresh">Refresh rooms</button></div>
  <p>Close the game. Come back to the same continent.</p>
  <p class="dl-note">Each player pays <strong>1 Doodle Coin once per room</strong>, including the creator. Returning is free. Solo and pass & play stay free.</p>
  <p data-dl="status" role="status">Unlock your Keeper identity to see your saved rooms.</p>
  <button class="button primary" data-dl="unlock">Unlock my vault ↗</button>
  <button class="button quiet" data-dl="retry" hidden>Retry the same request</button><button class="button quiet" data-dl="garden" hidden>Open Mushroom garden ↗</button>
  <div data-dl="room-list" hidden><div class="dl-panel"><p data-dl="price"></p><div class="dl-entry"><button class="button primary" data-dl="create">Create room · 1 Doodle Coin</button><label>Room code<input data-dl="code" maxlength="6" autocomplete="off" inputmode="text" aria-label="Saved Dotlands room code"></label><button class="button quiet" data-dl="join">Join · 1 Doodle Coin</button></div><p class="dl-note">Use coins earned in this Keeper’s Mushroom garden. Matured earnings are collected when you enter. Share the room code with friends using this same Keeper. Computers are free.</p><button class="button quiet" data-dl="solo">Solo / pass & play · free</button></div>
  <h2>Your saved rooms</h2><ul class="dl-list" data-dl="rooms"></ul><p class="dl-note">The Keeper saves every accepted move before confirming it. The Keeper needs to be running to take turns, but players can all leave. Keep the Keeper’s data backup and your identity backup.</p></div>
  <div data-dl="play" hidden><div class="dl-top"><p data-dl="playing"></p><button class="button quiet" data-dl="back">Back to saved rooms</button></div><div data-dl="frame"></div></div>`;
  const $ = name => container.querySelector(`[data-dl="${name}"]`);
  const client = createDotlandsClient({ clock });
  let identity = null, visible = false, busy = false, generation = 0, frame = null, launched = null, quote = null, framesBusy = 0, lastActivity = 0;
  const frameJobs = new Map();
  function status(text) { $('status').textContent = text; }
  function showError(error) {
    $('garden').hidden = error.status !== 402;
    status(error.status === 402 ? 'Not enough Doodle Coins. Grow or collect coins in this Keeper’s Mushroom garden.' : error.message);
  }
  function controls() {
    for (const name of ['create', 'join', 'refresh']) $(name).disabled = !identity || busy || Boolean(client.pending);
    $('solo').disabled = !identity || busy;
    $('retry').hidden = !client.pending; $('retry').disabled = busy;
    $('unlock').hidden = Boolean(identity); $('room-list').hidden = !identity || Boolean(frame); $('play').hidden = !frame;
  }
  async function run(fn) {
    if (busy) return; const ticket = generation; busy = true; controls();
    try { await fn(); } catch (error) { if (ticket === generation) showError(error); }
    finally { if (ticket === generation) { busy = false; controls(); } }
  }
  function clearFrame() { launched = null; frame?.remove(); frame = null; framesBusy = 0; frameJobs.clear(); controls(); }
  function open(data) {
    clearFrame(); launched = data ? copy(data) : { code: null }; frame = document.createElement('iframe'); frame.title = 'Dotlands game';
    frame.src = './dotlands.html'; frame.referrerPolicy = 'same-origin'; $('frame').append(frame);
    $('playing').textContent = data ? `Room ${data.code} · your seat is saved` : 'Solo and pass & play · free';
    status(data ? 'Room saved on this Keeper. Returning to this seat is free.' : 'Local games save in this browser.'); $('garden').hidden = true; controls();
  }
  function roomRows(rooms) {
    $('rooms').replaceChildren();
    if (!Array.isArray(rooms) || rooms.length > 1000) throw failure('The saved room list was invalid.');
    for (const room of rooms) {
      if (!CODE.test(room?.code) || !Array.isArray(room.players)) throw failure('The saved room list was invalid.');
      const li = document.createElement('li'), detail = document.createElement('div'), title = document.createElement('strong'), text = document.createElement('span'), button = document.createElement('button');
      detail.className = 'dl-room-details'; title.textContent = `Room ${room.code}`;
      text.textContent = room.paymentPending ? 'Entry is pending. Retry without paying twice.' : room.phase === 'lobby' ? `Waiting room · ${room.players.length} players` : `Round ${room.round || 1} · ${room.winner !== null && room.winner !== undefined ? 'Finished' : room.currentPlayer === room.seat ? 'Your turn' : 'Waiting for a turn'}`;
      detail.append(title, text); button.className = 'button quiet'; button.textContent = room.paymentPending ? 'Finish entry · 1 Doodle Coin total' : 'Return · free';
      button.onclick = () => run(async () => open(await client.request(room.paymentPending ? 'join' : 'snapshot', { code: room.code, ...(room.paymentPending ? { name: identity.username.slice(0,22), acceptPrice: 1 } : {}) })));
      li.append(detail, button); $('rooms').append(li);
    }
    if (!rooms.length) { const empty = document.createElement('li'); empty.textContent = 'Your first saved continent is waiting.'; $('rooms').append(empty); }
  }
  async function refresh() {
    const ticket = generation;
    quote = await client.info(); if (ticket !== generation) return;
    $('price').textContent = `Entry: 1 Doodle Coin per player, once. Returning is free.`;
    const result = await client.request('list'); if (ticket !== generation) return;
    roomRows(result.rooms); status(client.pending ? 'An earlier request needs a retry. Its exact signed request is saved, so retrying cannot charge twice.' : 'Your rooms are saved on this Keeper.'); controls();
  }
  $('unlock').onclick = onUnlockRequest;
  $('garden').onclick = onGardenRequest;
  $('solo').onclick = () => open(null);
  $('refresh').onclick = () => run(refresh);
  $('create').onclick = () => run(async () => open(await client.request('create', { name: identity.username.slice(0,22), acceptPrice: 1 })));
  $('join').onclick = () => run(async () => {
    const code = $('code').value.trim().toUpperCase(); if (!CODE.test(code)) throw failure('Enter a six-character room code.');
    open(await client.request('join', { code, name: identity.username.slice(0,22), acceptPrice: 1 }));
  });
  $('retry').onclick = () => run(async () => { const data = await client.retry(); if (data?.code) open(data); else await refresh(); });
  $('back').onclick = () => { clearFrame(); run(refresh); };
  try { const code = new URL(location.href).searchParams.get('dotlands'); if (CODE.test(code || '')) $('code').value = code; } catch {}
  function reply(target, id, payload) { if (frame?.contentWindow === target) target.postMessage({ channel: CHANNEL, type: 'reply', id, ...payload }, location.origin); }
  async function receive(event) {
    const p = event.data;
    if (!frame || event.source !== frame.contentWindow || event.origin !== location.origin || !plain(p) || p.channel !== CHANNEL) return;
    if (p.type === 'activity' && Object.keys(p).length === 2) {
      if (identity && visible && Date.now() - lastActivity >= 1000) { lastActivity = Date.now(); onActivity(); }
      return;
    }
    if (p.type !== 'request' || !/^[a-f0-9]{32}$/.test(p.id || '')) return;
    if (JSON.stringify(p).length > 10000 || !['context', 'snapshot', 'start', 'action'].includes(p.operation) || !plain(p.args)) return;
    if (!identity || !launched || !visible) { reply(event.source, p.id, { ok: false, error: 'Return to Dotlands in your unlocked Keeper to continue.', status: 401 }); return; }
    if (frameJobs.has(p.id)) { reply(event.source, p.id, await frameJobs.get(p.id)); return; }
    if (framesBusy >= 4) { reply(event.source, p.id, { ok: false, error: 'Wait for the current room request.', status: 429 }); return; }
    const ticket = generation, target = event.source, activeRoom = launched.code;
    const job = (async () => {
      framesBusy++;
      try {
        if (p.operation === 'context') {
          return { ok: true, data: { snapshot: activeRoom ? copy(launched) : null, name: identity.username, invite: activeRoom ? dotlandsInvitation(location.href, activeRoom) : null } };
        }
        if (!activeRoom || p.args.code !== activeRoom) throw failure('That request belongs to another room.', 403);
        const allowed = p.operation === 'snapshot' ? ['code','knownRevision'] : p.operation === 'start' ? ['code','expectedRevision','fillBots'] : ['code','expectedRevision','type','from','to'];
        if (Object.keys(p.args).some(key => !allowed.includes(key))) throw failure('Unsupported game request.');
        const data = await client.request(p.operation, p.args);
        if (ticket !== generation || activeRoom !== launched?.code) throw failure('This game view was closed.', 409);
        if (!data.unchanged) launched = copy(data);
        return { ok: true, data };
      } catch (error) { if (ticket === generation) { showError(error); controls(); } return { ok: false, error: error.message, status: error.status || 503 }; }
      finally { framesBusy = Math.max(0, framesBusy - 1); }
    })();
    frameJobs.set(p.id, job); if (frameJobs.size > 128) frameJobs.delete(frameJobs.keys().next().value);
    reply(target, p.id, await job);
  }
  window.addEventListener('message', receive);
  controls();
  return {
    async unlock(value) { this.lock(); identity = value; client.unlock(value); controls(); if (visible) await run(refresh); },
    lock() { generation++; identity = quote = null; busy = false; client.lock(); clearFrame(); $('rooms').replaceChildren(); $('garden').hidden = true; status('Unlock your Keeper identity to see your saved rooms.'); controls(); },
    setVisible(value) {
      const changed = visible !== Boolean(value); visible = Boolean(value);
      if (frame) frame.contentWindow?.postMessage({ channel: CHANNEL, type: 'visibility', visible }, location.origin);
      if (changed && visible && identity && !frame) run(refresh);
    },
  };
}
