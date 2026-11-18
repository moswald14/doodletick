// SPDX-License-Identifier: GPL-3.0-only
const failure = (message, status = 400, code = 'MOZCORP_INVALID') => Object.assign(new Error(message), { status, code });
const LIMITS = { cloud: 6200000, hope: 20000, upgrades: 128000 };
const REJECT_DISCARD_BYTES = 64 * 1024;
const REJECT_DISCARD_TIMEOUT_MS = 250;
function finishRejected(req, res) {
  // A close immediately after an early rejection can reset an uploading peer
  // before it receives the response. Discard a bounded tail without retaining it.
  let remaining = REJECT_DISCARD_BYTES, done = false;
  const cleanup = () => { clearTimeout(timer); req.off('readable', drain); req.off('end', finish); req.off('error', finish); req.off('aborted', finish); res.off('close', finish); };
  const finish = () => {
    if (done) return;
    done = true; cleanup(); req.pause();
    if (!res.destroyed && !res.writableEnded) res.end();
  };
  const drain = () => {
    while (remaining > 0) {
      const chunk = req.read(Math.min(remaining, req.readableLength || remaining));
      if (chunk === null) break;
      remaining -= chunk.length;
    }
    if (remaining === 0 || req.complete) finish();
  };
  const timer = setTimeout(finish, REJECT_DISCARD_TIMEOUT_MS); timer.unref?.();
  req.on('readable', drain); req.once('end', finish); req.once('error', finish); req.once('aborted', finish); res.once('close', finish);
  if (req.destroyed) finish(); else drain();
}
function sameOrigin(req) {
  if (req.headers['sec-fetch-site'] && !['same-origin', 'none'].includes(req.headers['sec-fetch-site'])) return false;
  if (!req.headers.origin) return true;
  try {
    const origin = new URL(req.headers.origin);
    return origin.origin === req.headers.origin && origin.host === req.headers.host && origin.protocol === (req.socket?.encrypted ? 'https:' : 'http:');
  } catch { return false; }
}
async function readJSON(req, maximum, timeoutMs) {
  if (String(req.headers['content-type'] || '').split(';')[0].trim().toLowerCase() !== 'application/json' || req.headers['content-encoding'] && req.headers['content-encoding'] !== 'identity') throw failure('Use an uncompressed JSON request.', 415);
  if (req.headers['content-length'] !== undefined && (!/^\d+$/.test(req.headers['content-length']) || Number(req.headers['content-length']) > maximum)) throw failure('This MozCorp request is too large.', 413);
  const bytes = await new Promise((resolve, reject) => {
    let size = 0, done = false; const chunks = [];
    const cleanup = () => { clearTimeout(timer); req.off('data', data); req.off('end', end); req.off('aborted', abort); req.off('error', abort); };
    const finish = (fn, value) => { if (done) return; done = true; cleanup(); fn(value); };
    const data = chunk => { size += chunk.length; if (size > maximum) { req.pause(); finish(reject, failure('This MozCorp request is too large.', 413)); } else chunks.push(chunk); };
    const end = () => finish(resolve, Buffer.concat(chunks));
    const abort = () => finish(reject, failure('This MozCorp request was interrupted.'));
    const timer = setTimeout(() => { req.pause(); finish(reject, failure('This MozCorp request timed out.', 408)); }, timeoutMs); timer.unref?.();
    req.on('data', data); req.once('end', end); req.once('aborted', abort); req.once('error', abort);
    if (req.aborted || req.destroyed) abort();
  });
  try {
    const value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes), (key, item) => {
      if (['__proto__', 'prototype', 'constructor'].includes(key)) throw Error('Unsafe field');
      return item;
    });
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error('Object required');
    return value;
  } catch { throw failure('This MozCorp request is not valid JSON.'); }
}

/** The caller retains the existing local-host / authenticated HA ingress boundary. */
export function createMozCorpWorldHttpHandler({ store, now = Date.now, bodyTimeoutMs = 5000 } = {}) {
  let windowAt = 0, requests = 0, activeWrites = 0;
  return async (req, res, url) => {
    const match = /^\/api\/mozcorp\/(cloud|hope|upgrades)$/.exec(url.pathname);
    if (!match) return false;
    const send = (status, value) => {
      if (res.destroyed || res.writableEnded) return;
      const close = status >= 400 && !req.complete;
      const body = JSON.stringify(value);
      res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...(close ? { Connection: 'close', 'Content-Length': Buffer.byteLength(body) } : {}) });
      if (close) { res.write(body); finishRejected(req, res); }
      else res.end(body);
    };
    let writing = false;
    try {
      if (!sameOrigin(req)) throw failure('Open MozCorp through this Keeper.', 403, 'MOZCORP_ORIGIN');
      if (url.search || req.url.length > 128) throw failure('Unexpected MozCorp query.');
      const area = match[1], name = area === 'upgrades' ? 'upgrade' : area;
      if (req.method === 'GET') send(200, await store[name + 'Read']());
      else if (req.method === 'POST') {
        if (req.headers['x-keeper-request'] !== '1') throw failure('A Keeper request header is required.', 403, 'MOZCORP_ORIGIN');
        const time = now();
        if (time - windowAt >= 60000 || time < windowAt) { windowAt = time; requests = 0; }
        if (++requests > 180 || activeWrites >= 12) throw failure('The shared MozCorp workspace is busy. Try again shortly.', 429, 'MOZCORP_RATE');
        writing = true; activeWrites++;
        send(200, await store[name + 'Write'](await readJSON(req, LIMITS[area], bodyTimeoutMs)));
      } else throw failure('Use GET or POST for this MozCorp service.', 405);
    } catch (error) {
      const status = Number.isInteger(error.status) && error.status >= 400 && error.status <= 599 ? error.status : 503;
      send(status, { error: error.status ? error.message : 'MozCorp shared services are unavailable. Saved data has not been replaced.', code: error.code || 'MOZCORP_UNAVAILABLE' });
    } finally { if (writing) activeWrites--; }
    return true;
  };
}
