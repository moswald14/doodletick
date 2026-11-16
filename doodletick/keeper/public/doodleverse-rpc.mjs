// SPDX-License-Identifier: GPL-3.0-only
// Optional Ethereum reads only. Construction is inert; the caller must obtain
// explicit selection before sending an address or signature to this service.
const ENDPOINT = 'https://ethereum-rpc.publicnode.com';
const METHODS = new Set(['eth_chainId', 'eth_getBlockByNumber', 'eth_getCode', 'eth_call']);
const QUANTITY = /^0x(?:0|[1-9a-f][0-9a-f]{0,63})$/;
const ADDRESS = /^0x[0-9a-f]{40}$/i, HASH = /^0x[0-9a-f]{64}$/i, BYTES = /^0x(?:[0-9a-f]{2})*$/i;
const MAX_BYTES = 2 * 1024 * 1024, MAX_SIGNATURE_BYTES = 8192, MAX_CODE_BYTES = 65536;
const own = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
const trustedErrors = new WeakSet();
function fail(code, message, method, rpcCode) {
  const error = Object.assign(new Error(message), { code });
  if (METHODS.has(method)) error.rpcMethod = method;
  if (Number.isInteger(rpcCode) && rpcCode >= -2147483648 && rpcCode <= 2147483647) error.rpcCode = rpcCode;
  trustedErrors.add(error); return error;
}
const invalid = method => fail('RPC_INVALID_REQUEST', 'The Ethereum read request is not permitted.', method);
function record(value, keys) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) throw Error();
  const names = Reflect.ownKeys(value);
  if (names.length !== keys.length || !keys.every(key => names.includes(key))) throw Error();
  const result = {};
  for (const key of keys) {
    const property = Object.getOwnPropertyDescriptor(value, key);
    if (!property || !own(property, 'value')) throw Error();
    result[key] = property.value;
  }
  return result;
}
function array(value, length) {
  if (!Array.isArray(value) || value.length !== length || Reflect.ownKeys(value).length !== length + 1) throw Error();
  return Array.from({ length }, (_, index) => {
    const property = Object.getOwnPropertyDescriptor(value, String(index));
    if (!property || !own(property, 'value')) throw Error();
    return property.value;
  });
}
function exactBlock(value) {
  const block = record(value, ['blockHash', 'requireCanonical']);
  if (typeof block.blockHash !== 'string' || !HASH.test(block.blockHash) || block.requireCanonical !== true) throw Error();
  return { blockHash: block.blockHash.toLowerCase(), requireCanonical: true };
}
function contractCall(value) {
  const call = record(value, ['to', 'data', 'gas']);
  if (typeof call.to !== 'string' || !ADDRESS.test(call.to) || call.gas !== '0x7a120' || typeof call.data !== 'string' ||
      call.data.length < 266 || call.data.length > 202 + MAX_SIGNATURE_BYTES * 2 || !BYTES.test(call.data)) throw Error();
  const data = call.data.toLowerCase();
  // Exact ABI for isValidSignature(bytes32,bytes), including the only valid
  // dynamic offset and zero padding. No other selector or trailing data passes.
  if (!data.startsWith('0x1626ba7e') || data.slice(74, 138) !== '0'.repeat(62) + '40') throw Error();
  const size = BigInt('0x' + data.slice(138, 202));
  if (size < 1n || size > BigInt(MAX_SIGNATURE_BYTES)) throw Error();
  const bytes = Number(size), padded = Math.ceil(bytes / 32) * 32;
  if (data.length !== 202 + padded * 2 || !/^0*$/.test(data.slice(202 + bytes * 2))) throw Error();
  return { to: call.to.toLowerCase(), data, gas: '0x7a120' };
}
function checkedRequest(value) {
  let method;
  try {
    const request = record(value, ['method', 'params']); method = request.method;
    if (!METHODS.has(method)) throw Error();
    if (method === 'eth_chainId') return { method, params: array(request.params, 0) };
    const params = array(request.params, 2);
    if (method === 'eth_getBlockByNumber') {
      if (typeof params[0] !== 'string' || !(params[0] === 'latest' || QUANTITY.test(params[0])) || params[1] !== false) throw Error();
      return { method, params: [params[0], false] };
    }
    const block = exactBlock(params[1]);
    if (method === 'eth_getCode') {
      if (typeof params[0] !== 'string' || !ADDRESS.test(params[0])) throw Error();
      return { method, params: [params[0].toLowerCase(), block] };
    }
    return { method, params: [contractCall(params[0]), block] };
  } catch { throw invalid(method); }
}

// JSON.parse accepts duplicate keys. Check them separately (including escaped
// aliases) so an ambiguous id/result/error can never be treated as a reply.
function strictJSON(text) {
  const parsed = JSON.parse(text); let at = 0, nodes = 0;
  const space = () => { while (/[\t\n\r ]/.test(text[at] ?? '\0')) at++; };
  const string = () => {
    const start = at++;
    while (at < text.length) {
      const character = text[at++];
      if (character === '\\') at++;
      else if (character === '"') return JSON.parse(text.slice(start, at));
    }
    throw Error();
  };
  function walk(depth = 0) {
    if (++nodes > 100000 || depth > 32) throw Error();
    space();
    if (text[at] === '"') { string(); return; }
    if (text[at] === '{') {
      at++; space(); const keys = new Set();
      if (text[at] === '}') { at++; return; }
      do {
        space(); const key = string(); if (keys.has(key)) throw Error(); keys.add(key);
        space(); at++; walk(depth + 1); space(); if (text[at++] === '}') return;
      } while (at < text.length);
    } else if (text[at] === '[') {
      at++; space(); if (text[at] === ']') { at++; return; }
      do { walk(depth + 1); space(); if (text[at++] === ']') return; } while (at < text.length);
    } else {
      // JSON.parse already checked scalar grammar. Scan each character once,
      // avoiding repeated suffix copies for a large array of small numbers.
      const start = at;
      while (at < text.length && !/[\t\n\r ,\]}]/.test(text[at])) at++;
      if (at > start) return;
    }
    throw Error();
  }
  walk(); space(); if (at !== text.length) throw Error(); return parsed;
}
function checkedResponse(raw, id, method) {
  let reply;
  const malformed = () => fail('RPC_MALFORMED', `The Ethereum read service returned an invalid ${method} response.`, method);
  try {
    reply = strictJSON(raw);
    if (!reply || typeof reply !== 'object' || Array.isArray(reply) || reply.jsonrpc !== '2.0' || reply.id !== id ||
        own(reply, 'result') === own(reply, 'error') || Object.keys(reply).length !== 3) throw Error();
    if (own(reply, 'error')) {
      const error = reply.error;
      if (!error || typeof error !== 'object' || Array.isArray(error) || !Number.isInteger(error.code) || error.code < -2147483648 || error.code > 2147483647 ||
          typeof error.message !== 'string' || !Object.keys(error).every(key => ['code', 'message', 'data'].includes(key))) throw Error();
      throw fail('RPC_REMOTE_ERROR', `The Ethereum read service rejected ${method} (code ${error.code}).`, method, error.code);
    }
    const result = reply.result;
    if (method === 'eth_chainId') {
      if (typeof result !== 'string' || !QUANTITY.test(result)) throw Error();
      if (result !== '0x1') throw fail('RPC_WRONG_CHAIN', 'The selected read service did not report Ethereum mainnet.', method);
    } else if (method === 'eth_getBlockByNumber') {
      if (!result || typeof result !== 'object' || Array.isArray(result) || typeof result.number !== 'string' || !QUANTITY.test(result.number) ||
          typeof result.hash !== 'string' || !HASH.test(result.hash)) throw Error();
      // This client only consumes the block identity, never transaction lists.
      return { number: result.number, hash: result.hash.toLowerCase() };
    } else if (typeof result !== 'string' || !BYTES.test(result) || result.length > 2 + (method === 'eth_getCode' ? MAX_CODE_BYTES : 32) * 2) throw Error();
    return result.toLowerCase();
  } catch (error) { if (trustedErrors.has(error)) throw error; throw malformed(); }
}

export function createEthereumReadService({ fetchImpl = (...args) => fetch(...args), timeoutMs = 7500, maxBytes = MAX_BYTES } = {}) {
  if (typeof fetchImpl !== 'function' || !Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 30000 ||
      !Number.isSafeInteger(maxBytes) || maxBytes < 1 || maxBytes > MAX_BYTES) throw fail('RPC_CONFIGURATION', 'Invalid Ethereum read-service limits.');
  let sequence = 0;
  async function request(value, options = {}) {
    const { method, params } = checkedRequest(value);
    let signal;
    try {
      const keys = Reflect.ownKeys(options);
      signal = record(options, keys.length ? ['signal'] : []).signal;
      if (signal !== undefined && !(signal instanceof AbortSignal)) throw Error();
    } catch { throw invalid(method); }
    if (signal?.aborted) throw fail('RPC_CANCELED', `The ${method} read was canceled.`, method);
    if (sequence >= Number.MAX_SAFE_INTEGER) throw fail('RPC_LIMIT', 'The Ethereum read-service request limit was reached.', method);
    const id = ++sequence, controller = new AbortController(), deadline = performance.now() + timeoutMs; let reader = null, timer;
    return new Promise((resolve, reject) => {
      let settled = false, terminalError;
      function cancelReader() { try { const cancellation = reader?.cancel(); cancellation?.catch(() => {}); } catch { /* Best effort; deadline does not await body cancellation. */ } }
      function done(error, result) {
        if (settled) return;
        settled = true; clearTimeout(timer); signal?.removeEventListener('abort', aborted);
        if (error) { terminalError = error; controller.abort(); cancelReader(); reject(error); } else resolve(result);
      }
      function active() {
        if (settled || controller.signal.aborted) throw terminalError || fail('RPC_CANCELED', `The ${method} read was canceled.`, method);
        if (performance.now() >= deadline) throw fail('RPC_TIMEOUT', `The ${method} read timed out.`, method);
      }
      function aborted() { done(fail('RPC_CANCELED', `The ${method} read was canceled.`, method)); }
      signal?.addEventListener('abort', aborted, { once: true });
      timer = setTimeout(() => done(fail('RPC_TIMEOUT', `The ${method} read timed out.`, method)), timeoutMs);
      async function run() {
        active();
        const response = await fetchImpl(ENDPOINT, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id, method, params }),
          signal: controller.signal, credentials: 'omit', referrerPolicy: 'no-referrer', redirect: 'error', cache: 'no-store' });
        active();
        if (!response || response.ok !== true || !Number.isInteger(response.status) || response.status < 200 || response.status > 299) throw fail('RPC_HTTP', `The Ethereum read service could not complete ${method}.`, method);
        const length = response.headers?.get('content-length');
        if (length !== null && length !== undefined && (!/^\d+$/.test(length) || Number(length) > maxBytes)) throw fail('RPC_TOO_LARGE', `The ${method} response exceeded its size limit.`, method);
        let raw = '';
        if (response.body?.getReader) {
          reader = response.body.getReader(); const decoder = new TextDecoder('utf-8', { fatal: true }); let bytes = 0;
          try {
            while (true) {
              const chunk = await reader.read(); active();
              if (chunk.done) break;
              if (!(chunk.value instanceof Uint8Array)) throw Error();
              bytes += chunk.value.byteLength;
              if (bytes > maxBytes) throw fail('RPC_TOO_LARGE', `The ${method} response exceeded its size limit.`, method);
              raw += decoder.decode(chunk.value, { stream: true });
            }
            raw += decoder.decode();
          } finally { try { reader.releaseLock(); } catch { /* A pending mocked read may not release yet. */ } }
        } else {
          raw = await response.text(); active();
          if (typeof raw !== 'string') throw Error();
          if (new TextEncoder().encode(raw).byteLength > maxBytes) throw fail('RPC_TOO_LARGE', `The ${method} response exceeded its size limit.`, method);
        }
        active(); const result = checkedResponse(raw, id, method); active(); return result;
      }
      Promise.resolve().then(run).then(result => done(null, result), error => done(trustedErrors.has(error) ? error : fail('RPC_FAILED', `The Ethereum read service could not complete ${method}.`, method)));
      if (signal?.aborted) aborted();
    });
  }
  return Object.freeze({ id: 'publicnode-ethereum', name: 'PublicNode · Ethereum mainnet', chainId: '1', request });
}
