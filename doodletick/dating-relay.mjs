// SPDX-License-Identifier: GPL-3.0-only
import { createHash } from 'node:crypto';

const ORIGIN = 'https://mozcorp-telephone-dating.pages.dev';
const API = '/dating-api/';
const TOKEN = /^[A-Za-z0-9_-]{43}$/;
const PEER = '[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}';
const SESSION_AGE = 14 * 24 * 60 * 60;
const REQUEST_BYTES = 8192;
const RESPONSE_BYTES = 1024 * 1024;
const INTENTS = new Set(['long-term', 'short-term', 'open']);
const ROUTES = new Map([
  ['status', ['GET']], ['session', ['GET']], ['discover', ['GET']], ['matches', ['GET']],
  ['register', ['POST']], ['sign-in', ['POST']], ['sign-out', ['POST']],
  ['profile', ['PUT']], ['choose', ['POST']], ['block', ['POST']], ['report', ['POST']],
  ['account', ['DELETE']]
]);
const FIELDS = {
  register: ['adult'], 'sign-in': ['key'], 'sign-out': [], account: [],
  profile: ['alias', 'age', 'region', 'intent', 'intro', 'icebreaker', 'listed'],
  choose: ['profileId', 'choice'], block: ['profileId'], report: ['profileId', 'reason'],
  conversation: ['message', 'clientId']
};
class RelayError extends Error {
  constructor(status, code, message) { super(message); this.status = status; this.code = code; }
}
const invalid = (message, status = 400, code = 'DATING_REQUEST') => new RelayError(status, code, message);
const unavailable = () => invalid('The live dating service is temporarily unavailable. No automatic retry was made.', 502, 'DATING_UPSTREAM');

function routeFor(req) {
  if (typeof req.url !== 'string' || req.url.length > 256 || /[\\#\r\n]/.test(req.url) || !req.url.startsWith(API)) throw invalid('This dating route does not exist.', 404);
  const url = new URL(req.url, ORIGIN), route = url.pathname.slice(API.length);
  if (url.origin !== ORIGIN || url.pathname !== req.url.split('?')[0]) throw invalid('This dating route does not exist.', 404);
  const conversation = new RegExp('^conversation/' + PEER + '$').test(route);
  const methods = conversation ? ['GET', 'POST'] : ROUTES.get(route);
  if (!methods) throw invalid('This dating route does not exist.', 404);
  if (!methods.includes(req.method)) throw invalid('This method is not available for this dating route.', 405);
  const entries = [...url.searchParams];
  if (entries.length && (route !== 'discover' || entries.length !== 1 || entries[0][0] !== 'intent' || !INTENTS.has(entries[0][1]))) throw invalid('This dating query is not supported.');
  return { route, kind: conversation ? 'conversation' : route, target: ORIGIN + API + route + (entries.length ? '?intent=' + entries[0][1] : '') };
}

function ingressScope(req) {
  // The gateway checks the connected Supervisor address before calling us.
  // Core overwrites this path; Supervisor strips/replaces the remote user ID.
  const prefix = req.headers['x-ingress-path'], user = req.headers['x-remote-user-id'];
  if (req.headers['x-hass-source'] !== 'core.ingress' || typeof prefix !== 'string' || !/^\/api\/hassio_ingress\/[A-Za-z0-9_-]{1,256}$/.test(prefix) || typeof user !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(user)) throw invalid('Open dating through your signed-in Home Assistant app.', 403, 'DATING_INGRESS');
  if (req.headers['x-keeper-request'] !== '1') throw invalid('Missing dating request protection.', 403, 'DATING_ORIGIN');
  const site = req.headers['sec-fetch-site'];
  if (site !== undefined && site !== 'same-origin') throw invalid('Open dating through this Home Assistant app.', 403, 'DATING_ORIGIN');
  const forwardedHost = req.headers['x-forwarded-host'] || req.headers.host;
  let expected;
  try {
    if (typeof forwardedHost !== 'string' || forwardedHost.length > 255 || /[\s,/@\\?#]/.test(forwardedHost)) throw Error();
    expected = new URL('https://' + forwardedHost);
    if (!expected.hostname || expected.username || expected.password || expected.pathname !== '/') throw Error();
  } catch { throw invalid('The secure Home Assistant address is unavailable.', 403, 'DATING_HTTPS'); }
  const origin = req.headers.origin;
  if (origin !== undefined) {
    let supplied;
    try { supplied = new URL(origin); } catch {}
    if (!supplied || supplied.origin !== origin || supplied.protocol !== 'https:' || supplied.origin !== expected.origin) throw invalid('Open dating through the secure Home Assistant address.', 403, 'DATING_HTTPS');
  } else if (req.method !== 'GET' || site !== 'same-origin' || req.headers['x-forwarded-proto'] !== 'https') {
    // Same-origin GET fetches normally omit Origin. HTTPS comes from Core's
    // ingress metadata, including its native TLS connection for Nabu Casa.
    throw invalid('Open dating through the secure Home Assistant address.', 403, 'DATING_HTTPS');
  }
  const digest = createHash('sha256').update(prefix + '\0' + user).digest('hex');
  return { path: prefix + API, name: '__Secure-keeper_dating_' + digest };
}

function sessionFor(req, scope) {
  const entries = String(req.headers.cookie || '').split(';').map(part => part.trim()).filter(part => part.startsWith(scope.name + '='));
  if (entries.length > 1 || entries.length === 1 && !TOKEN.test(entries[0].slice(scope.name.length + 1))) throw invalid('The dating session could not be read. Sign in again.', 401, 'DATING_SESSION');
  return entries.length ? entries[0].slice(scope.name.length + 1) : null;
}
function cookie(scope, token, age) {
  return `${scope.name}=${token}; Path=${scope.path}; HttpOnly; Secure; SameSite=Strict; Max-Age=${age}`;
}
function changedSession(response, route, method, scope) {
  const start = method === 'POST' && ['register', 'sign-in'].includes(route);
  const end = method === 'POST' && route === 'sign-out' || method === 'DELETE' && route === 'account';
  if ((!start && !end) || response.status < 200 || response.status >= 300) return undefined;
  const all = response.headers.getSetCookie?.() || (response.headers.get('set-cookie') ? [response.headers.get('set-cookie')] : []);
  if (all.length > 16) throw unavailable();
  const sessions = all.filter(value => typeof value === 'string' && value.trim().startsWith('__Host-btw_session='));
  if (sessions.length !== 1 || sessions[0].length > 2048) throw unavailable();
  const [pair, ...parts] = sessions[0].trim().split(';').map(value => value.trim());
  const token = pair.slice('__Host-btw_session='.length), attributes = new Map();
  for (const part of parts) {
    const at = part.indexOf('='), name = (at < 0 ? part : part.slice(0, at)).toLowerCase(), value = at < 0 ? '' : part.slice(at + 1);
    if (attributes.has(name)) throw unavailable();
    attributes.set(name, value);
  }
  const rawAge = attributes.get('max-age'), age = Number(rawAge);
  if (!attributes.has('httponly') || !attributes.has('secure') || attributes.get('path') !== '/' || attributes.get('samesite')?.toLowerCase() !== 'strict' || attributes.has('domain') || !/^\d+$/.test(rawAge || '') || !Number.isSafeInteger(age) || age > SESSION_AGE || (end ? age !== 0 || token !== '' : age < 1 || !TOKEN.test(token))) throw unavailable();
  return cookie(scope, token, age);
}

function parseJSON(bytes, upstream = false) {
  try {
    const result = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes), (name, value) => {
      if (['__proto__', 'constructor', 'prototype'].includes(name)) throw Error();
      return value;
    });
    if (!result || typeof result !== 'object' || Array.isArray(result)) throw Error();
    return result;
  } catch { throw upstream ? unavailable() : invalid('Send a valid dating JSON object.'); }
}
async function requestBody(req, kind, timeoutMs) {
  if (req.headers['content-encoding'] && req.headers['content-encoding'] !== 'identity') throw invalid('Send uncompressed dating JSON.', 415);
  const length = req.headers['content-length'];
  if (length !== undefined && (!/^\d+$/.test(length) || Number(length) > REQUEST_BYTES)) throw invalid('This dating entry is too large.', 413);
  if (req.method === 'GET') {
    if (req.headers['transfer-encoding'] || length !== undefined && Number(length) !== 0) throw invalid('Dating reads cannot include a body.');
    return undefined;
  }
  if (req.headers['content-type'] && req.headers['content-type'].split(';')[0].trim().toLowerCase() !== 'application/json') throw invalid('Send dating JSON.', 415);
  const bytes = await new Promise((resolve, reject) => {
    let size = 0, done = false; const chunks = [];
    const cleanup = () => { clearTimeout(timer); req.off('data', data); req.off('end', end); req.off('aborted', abort); req.off('error', abort); };
    const finish = (fn, value) => { if (done) return; done = true; cleanup(); fn(value); };
    const data = chunk => { size += chunk.length; if (size > REQUEST_BYTES) { req.pause(); finish(reject, invalid('This dating entry is too large.', 413)); } else chunks.push(chunk); };
    const end = () => finish(resolve, Buffer.concat(chunks));
    const abort = () => finish(reject, invalid('The dating request was interrupted.'));
    const timer = setTimeout(() => { req.pause(); finish(reject, invalid('The dating request timed out.', 408)); }, timeoutMs); timer.unref?.();
    req.on('data', data); req.once('end', end); req.once('aborted', abort); req.once('error', abort);
    if (req.aborted || req.destroyed) abort();
  });
  if (!bytes.length && ['sign-out', 'account'].includes(kind)) return undefined;
  if (req.headers['content-type']?.split(';')[0].trim().toLowerCase() !== 'application/json') throw invalid('Send dating JSON.', 415);
  const value = parseJSON(bytes), allowed = FIELDS[kind];
  if (Object.keys(value).some(key => !allowed.includes(key))) throw invalid('This dating form contains an unsupported field.');
  return bytes;
}

function discard(response) { try { response.body?.cancel().catch(() => {}); } catch {} }
async function responseBody(response, signal) {
  const declared = Number(response.headers.get('content-length'));
  if (response.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/json' || Number.isFinite(declared) && declared > RESPONSE_BYTES) { discard(response); throw unavailable(); }
  const reader = response.body?.getReader();
  if (!reader) throw unavailable();
  const cancel = () => { try { reader.cancel().catch(() => {}); } catch {} };
  signal.addEventListener('abort', cancel, { once: true });
  let size = 0; const chunks = [];
  try {
    for (;;) {
      if (signal.aborted) throw unavailable();
      const { value, done } = await reader.read(); if (done) break;
      size += value.byteLength;
      if (size > RESPONSE_BYTES) { cancel(); throw unavailable(); }
      chunks.push(Buffer.from(value));
    }
    return parseJSON(Buffer.concat(chunks), true);
  } finally { signal.removeEventListener('abort', cancel); try { reader.releaseLock(); } catch {} }
}

function closeRejected(req, res) {
  let left = 65536, done = false;
  const cleanup = () => { clearTimeout(timer); req.off('readable', drain); req.off('end', finish); req.off('error', finish); req.off('aborted', finish); res.off('close', finish); };
  const finish = () => { if (done) return; done = true; cleanup(); req.pause(); if (!res.destroyed && !res.writableEnded) res.end(); };
  const drain = () => { while (left > 0) { const chunk = req.read(Math.min(left, req.readableLength || left)); if (chunk === null) break; left -= chunk.length; } if (left === 0 || req.complete) finish(); };
  const timer = setTimeout(finish, 250); timer.unref?.();
  req.on('readable', drain); req.once('end', finish); req.once('error', finish); req.once('aborted', finish); res.once('close', finish);
  if (req.destroyed) finish(); else drain();
}
function send(req, res, status, value, sessionCookie) {
  if (res.destroyed || res.writableEnded) return;
  const body = JSON.stringify(value), close = status >= 400 && !req.complete;
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': Buffer.byteLength(body), 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff', 'Cross-Origin-Resource-Policy': 'same-origin', ...(sessionCookie ? { 'Set-Cookie': sessionCookie } : {}), ...(close ? { Connection: 'close' } : {}) });
  if (close) { res.write(body); closeRejected(req, res); } else res.end(body);
}

/** Called only after the gateway verifies its connected Supervisor ingress IP. */
export function createDatingRelay({ fetchImpl = globalThis.fetch, bodyTimeoutMs = 5000, upstreamTimeoutMs = 12000 } = {}) {
  return async (req, res) => {
    let scope;
    try {
      const route = routeFor(req); scope = ingressScope(req);
      const token = sessionFor(req, scope), body = await requestBody(req, route.kind, bodyTimeoutMs);
      const controller = new AbortController(); let timedOut = false, stop;
      const disconnected = () => { if (!res.writableEnded) controller.abort(); };
      const timer = setTimeout(() => { timedOut = true; controller.abort(); }, upstreamTimeoutMs); timer.unref?.();
      req.once('aborted', disconnected); res.once('close', disconnected);
      const stopped = new Promise((_, reject) => { stop = () => reject(invalid(timedOut ? 'The live dating service did not respond in time. No automatic retry was made.' : 'The dating request was interrupted.', timedOut ? 504 : 400, timedOut ? 'DATING_TIMEOUT' : 'DATING_REQUEST')); controller.signal.addEventListener('abort', stop, { once: true }); });
      const run = async () => {
        const headers = { Accept: 'application/json' };
        if (body) headers['Content-Type'] = 'application/json';
        if (req.method !== 'GET') headers.Origin = ORIGIN;
        if (token) headers.Cookie = '__Host-btw_session=' + token;
        const response = await fetchImpl(route.target, { method: req.method, headers, body, signal: controller.signal, redirect: 'error', credentials: 'omit', referrerPolicy: 'no-referrer', cache: 'no-store' });
        if (controller.signal.aborted) { discard(response); throw unavailable(); }
        if (response.redirected || ![200, 201].includes(response.status) && !(response.status >= 400 && response.status <= 599)) { discard(response); throw unavailable(); }
        const value = await responseBody(response, controller.signal), sessionCookie = changedSession(response, route.route, req.method, scope);
        return { status: response.status, value, sessionCookie };
      };
      let result;
      try { result = await Promise.race([run(), stopped]); }
      finally { clearTimeout(timer); req.off('aborted', disconnected); res.off('close', disconnected); controller.signal.removeEventListener('abort', stop); }
      send(req, res, result.status, result.value, result.sessionCookie);
    } catch (error) {
      const local = error instanceof RelayError ? error : unavailable();
      send(req, res, local.status, { error: local.message, code: local.code }, local.code === 'DATING_SESSION' && scope ? cookie(scope, '', 0) : undefined);
    }
  };
}
