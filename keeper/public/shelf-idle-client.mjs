// SPDX-License-Identifier: GPL-3.0-only
export function createShelfIdleClient({ fetcher = fetch, onState = () => {}, requestId = () => crypto.randomUUID(), timeoutMs = 8000 } = {}) {
  let state = null, queue = Promise.resolve(), closed = false;
  const controllers = new Set();
  const serial = work => { const job = queue.then(work); queue = job.catch(() => {}); return job; };
  function accept(value) {
    if (value?.available !== true || !Number.isSafeInteger(value.revision) || value.revision < 0 || value.game?.schema !== 'shelfdefense_idle.v1' || !Number.isFinite(value.game.last_update) || !Array.isArray(value.game.shelves)) throw Error('The Keeper returned an unreadable game. Your saved shelf was not replaced.');
    if (!state || value.revision > state.revision || value.revision === state.revision && value.game.last_update >= state.game.last_update) {
      state = value; onState(value);
    }
    return value;
  }
  async function request(url, body) {
    if (closed) throw Error('This shelf page is closed.');
    const controller = new AbortController(); controllers.add(controller);
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetcher(url, { method: body ? 'POST' : 'GET', credentials: 'same-origin', cache: 'no-store', signal: controller.signal, headers: body ? { 'Content-Type': 'application/json', 'X-Keeper-Request': '1' } : { Accept: 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
      const value = await response.json().catch(() => { throw Object.assign(Error('Reopen the Keeper Web UI to reconnect to your shelf.'), { status: response.status }); });
      if (!response.ok) throw Object.assign(Error(typeof value.error === 'string' ? value.error : 'The Keeper could not complete that action.'), { status: response.status });
      if (closed) throw Error('This shelf page is closed.');
      return accept(value);
    } finally { clearTimeout(timer); controllers.delete(controller); }
  }
  const refresh = () => request('./api/shelf-idle/status');
  return {
    refresh() { return serial(refresh); },
    action(action, data = {}) {
      return serial(async () => {
        if (!state) await refresh();
        const envelope = { ...data, requestId: requestId(), expectedRevision: state.revision, action };
        try {
          try { return await request('./api/shelf-idle/action', envelope); }
          catch (error) {
            // A dropped response may follow a committed write. Retry only that
            // exact envelope; the Keeper deduplicates it before any action.
            if (closed || error.status) throw error;
            return await request('./api/shelf-idle/action', envelope);
          }
        } catch (error) {
          if (!closed) await refresh().catch(() => {});
          throw error;
        }
      });
    },
    close() { closed = true; for (const controller of controllers) controller.abort(); controllers.clear(); },
  };
}
