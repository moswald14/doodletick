// SPDX-License-Identifier: GPL-3.0-only
// This frame receives game snapshots, never vault keys or signing authority.
(() => {
  'use strict';
  const CHANNEL = 'doodleverse-dotlands-frame-v1';
  const pending = new Map();
  let paused = false, closed = false, context = null, latest = null, lastActivity = 0;
  const fail = (message, status) => Object.assign(new Error(message), { status });
  const plain = value => value && typeof value === 'object' && !Array.isArray(value);
  function send(operation, args = {}) {
    if (closed || parent === window) return Promise.reject(fail('Open Dotlands from your unlocked Keeper.', 401));
    if (paused && operation !== 'context') return Promise.reject(fail('Return to Dotlands to continue.', 409));
    if (pending.size >= 8) return Promise.reject(fail('Wait for the current room request.', 429));
    const id = Array.from(crypto.getRandomValues(new Uint8Array(16)), byte => byte.toString(16).padStart(2, '0')).join('');
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { pending.delete(id); reject(fail('The Keeper has not replied. Use Retry the same request above the game.', 503)); }, 25000);
      pending.set(id, { resolve, reject, timer });
      parent.postMessage({ channel: CHANNEL, type: 'request', id, operation, args }, location.origin);
    });
  }
  window.addEventListener('message', event => {
    const p = event.data;
    if (event.source !== parent || event.origin !== location.origin || !plain(p) || p.channel !== CHANNEL) return;
    if (p.type === 'visibility' && typeof p.visible === 'boolean') {
      paused = !p.visible;
      window.dispatchEvent(new CustomEvent('dotlands-visibility'));
      return;
    }
    if (p.type !== 'reply' || !/^[a-f0-9]{32}$/.test(p.id || '') || !pending.has(p.id) || typeof p.ok !== 'boolean') return;
    const job = pending.get(p.id); pending.delete(p.id); clearTimeout(job.timer);
    if (p.ok) job.resolve(p.data);
    else job.reject(fail(typeof p.error === 'string' ? p.error.slice(0, 1000) : 'The Keeper declined this request.', Number.isInteger(p.status) ? p.status : 503));
  });
  window.addEventListener('pagehide', () => {
    closed = true;
    for (const job of pending.values()) { clearTimeout(job.timer); job.reject(fail('This game view was closed.', 409)); }
    pending.clear();
  });
  function activity(event) {
    if (!event.isTrusted || closed || paused || parent === window || Date.now() - lastActivity < 1000) return;
    lastActivity = Date.now();
    parent.postMessage({ channel: CHANNEL, type: 'activity' }, location.origin);
  }
  window.addEventListener('pointerdown', activity, { passive: true });
  window.addEventListener('keydown', activity);
  const ready = send('context').then(data => {
    if (!plain(data) || typeof data.name !== 'string' || (data.invite !== null && typeof data.invite !== 'string') || (data.snapshot !== null && (!plain(data.snapshot) || !/^[A-Z2-9]{6}$/.test(data.snapshot.code)))) throw fail('The Keeper game context was invalid.');
    if (data.invite !== null && new URL(data.invite).origin !== location.origin) throw fail('The room invitation belongs to another Keeper.');
    context = data; latest = data.snapshot; return structuredClone(data);
  });
  // The interface can be loaded directly; keep its rejected startup promise handled.
  ready.catch(() => {});
  async function reconnect(options = {}) {
    await ready;
    if (!latest) throw fail('Choose a saved room above the game first.');
    if (options.code && options.code !== latest.code) throw fail('Choose this room from your saved room list.', 403);
    let stopped = false;
    const code = latest.code;
    const accept = data => {
      if (data?.unchanged) {
        if (data.code !== code || data.revision !== latest.revision || data.seat !== latest.seat) throw fail('The Keeper returned an invalid room revision.');
        return structuredClone(latest);
      }
      if (!plain(data) || data.code !== code || !Number.isInteger(data.revision) || data.revision < 1) throw fail('The Keeper returned an invalid room.');
      if (data.revision >= latest.revision) latest = data;
      return structuredClone(latest);
    };
    async function snapshot() {
      if (stopped) throw fail('Return to your saved room to continue.', 409);
      return accept(await send('snapshot', { code, knownRevision: latest.revision }));
    }
    options.onStatus?.({ state: 'connected', transport: 'keeper' });
    return {
      eventDriven: false,
      initial: structuredClone(latest),
      credentials: { code, seat: latest.seat, role: latest.seat === 0 ? 'host' : 'guest', invite: context.invite },
      snapshot,
      async request(path, body) {
        if (stopped) throw fail('Return to your saved room to continue.', 409);
        if (path === '/rooms/' + code && body === undefined) return snapshot();
        if (!plain(body)) throw fail('Unsupported game request.');
        const args = { code, expectedRevision: body.expectedRevision };
        if (path === '/rooms/' + code + '/start') return accept(await send('start', { ...args, fillBots: body.fillBots === true }));
        if (path === '/rooms/' + code + '/action' && ['move', 'endTurn'].includes(body.type)) {
          args.type = body.type;
          if (body.type === 'move') { args.from = body.from; args.to = body.to; }
          return accept(await send('action', args));
        }
        throw fail('Unsupported game request.');
      },
      close() { stopped = true; },
    };
  }
  const enter = () => Promise.reject(fail('Create or join a room above the game. Entry costs 1 Doodle Coin per player; returning is free.'));
  globalThis.DotlandsRoom = Object.freeze({ create: enter, join: enter, reconnect });
  globalThis.DotlandsKeeper = Object.freeze({ ready, get paused() { return paused; } });
})();
