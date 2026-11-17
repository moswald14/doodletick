// SPDX-License-Identifier: GPL-3.0-only
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { webcrypto } from 'node:crypto';
import { fork } from 'node:child_process';
import vm from 'node:vm';
import { JAZZ_CAST_HOST, jazzCastInvitation } from './public/jazz-cast.mjs';

export const JAZZ_NODE_AUDIO = Object.freeze({ sampleRate: 48000, channelCount: 2, bitsPerSample: 16,
  numberOfFrames: 480, samplesPerFrame: 960 });
const nativeRequire = createRequire(new URL('./jazz-stream-deps/package.json', import.meta.url));
const sdkURL = new URL('./public/vdoninja-sdk.js', import.meta.url);
const canceled = () => Object.assign(new Error('The radio cast was stopped.'), { name: 'AbortError' });

export const createJazzNodeInvitation = jazzCastInvitation;
export function validateJazzNodeInvitation(value) {
  if (!value || typeof value.streamID !== 'string' || !/^[A-Za-z0-9_]{1,58}$/.test(value.streamID) ||
      Object.prototype.hasOwnProperty.call(Object.prototype, value.streamID) || typeof value.password !== 'string' ||
      !value.password.trim() || value.password.length > 256 || value.password !== value.password.trim()) {
    throw new TypeError('A persistent radio stream ID, private password and listener URL are required.');
  }
  let url, password;
  try { url = new URL(value.url); password = decodeURIComponent(url.searchParams.get('password') || ''); } catch {}
  if (!url || url.origin !== 'https://vdo.ninja' || !['/', '/alpha/'].includes(url.pathname) ||
      url.username || url.password || url.hash || url.searchParams.get('view') !== value.streamID ||
      url.searchParams.get('wss2') !== 'apibackup.vdo.ninja' || password !== value.password ||
      ['room', 'push', 'api'].some(key => url.searchParams.has(key))) {
    throw new TypeError('The listener URL must match the private VDO.Ninja radio invitation.');
  }
  return Object.freeze({ streamID: value.streamID, password: value.password, url: url.href });
}

/** Adapt the shipped, patched SDK without replacing any process-wide globals.
 * The VM is a compatibility context for trusted vendored code, not a security sandbox.
 * Device capture APIs and Keeper filesystem/account capabilities are not provided.
 */
export async function loadJazzNodePlatform({ wrtc, WebSocketImpl = globalThis.WebSocket,
  fetchImpl = globalThis.fetch } = {}) {
  if (!wrtc) {
    try { wrtc = nativeRequire('@roamhq/wrtc'); }
    catch { throw new Error('Server audio is unavailable. Install the pinned Jazz streaming dependencies.'); }
  }
  if (typeof wrtc.nonstandard?.RTCAudioSource !== 'function' || typeof wrtc.MediaStream !== 'function' ||
      typeof wrtc.RTCPeerConnection !== 'function' || typeof WebSocketImpl !== 'function') {
    throw new Error('Server audio requires the full native WebRTC implementation and Node.js 24.');
  }
  const timers = new Map();
  const timeout = (fn, delay, ...args) => {
    const handle = setTimeout(() => { timers.delete(handle); fn(...args); }, delay);
    timers.set(handle, clearTimeout); return handle;
  };
  const interval = (fn, delay, ...args) => {
    const handle = setInterval(fn, delay, ...args); timers.set(handle, clearInterval); return handle;
  };
  const clearTimer = handle => { timers.get(handle)?.(handle); timers.delete(handle); };
  const sdkModule = { exports: {} };
  const scope = {
    module: sdkModule, exports: sdkModule.exports, global: {},
    console: { log() {}, warn() {}, error() {} },
    crypto: webcrypto, WebSocket: WebSocketImpl, fetch: fetchImpl,
    setTimeout: timeout, clearTimeout: clearTimer, setInterval: interval, clearInterval: clearTimer,
    Event, EventTarget, CustomEvent, AbortController, TextEncoder, TextDecoder, Blob,
    ArrayBuffer, SharedArrayBuffer, Uint8Array, Uint16Array, Uint32Array, Int8Array, Int16Array, Int32Array,
    Float32Array, Float64Array, DataView,
    document: { createElement: () => ({ innerText: '', textContent: '' }) },
    RTCPeerConnection: wrtc.RTCPeerConnection, RTCSessionDescription: wrtc.RTCSessionDescription,
    RTCIceCandidate: wrtc.RTCIceCandidate, MediaStream: wrtc.MediaStream, MediaStreamTrack: wrtc.MediaStreamTrack,
    RTCRtpSender: wrtc.RTCRtpSender, RTCRtpReceiver: wrtc.RTCRtpReceiver
  };
  vm.runInNewContext(await readFile(sdkURL, 'utf8'), scope, {
    filename: 'vdoninja-sdk.js', timeout: 2000, contextCodeGeneration: { strings: false, wasm: false }
  });
  return {
    createSDK: options => new sdkModule.exports(options),
    createAudioSource: () => new wrtc.nonstandard.RTCAudioSource(),
    createMediaStream: track => new wrtc.MediaStream([track]),
    dispose() { for (const [handle, clear] of timers) clear(handle); timers.clear(); }
  };
}

/** Caller owns persistence and the 10 ms synthesis clock. No cast starts on import. */
export function createJazzDirectNodeCast({ invitation, loadPlatform = loadJazzNodePlatform,
  timeoutMs = 25000, statsIntervalMs = 3000 } = {}) {
  const link = validateJazzNodeInvitation(invitation);
  if (typeof loadPlatform !== 'function' || !Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 120000 ||
      !Number.isInteger(statsIntervalMs) || statsIntervalMs < 1 || statsIntervalMs > 60000) {
    throw new TypeError('Invalid radio transport options.');
  }
  let active = null, generation = 0, teardown = null, onstate = () => {};
  let value = { state: 'idle', advertised: false, listeners: 0, bytes: 0, packets: 0,
    frames: 0, lastAudioAt: null, url: '', message: 'The server radio cast is stopped.' };
  const status = () => ({ phase: value.state, advertised: value.advertised, peers: value.listeners,
    bytesSent: value.bytes, packetsSent: value.packets, framesSupplied: value.frames,
    lastAudioAt: value.lastAudioAt, listenerUrl: value.url, message: value.message,
    error: value.state === 'error' ? value.message : null });
  const update = patch => { value = { ...value, ...patch }; try { onstate(status()); } catch {} };
  const current = session => active === session && session.token === generation;
  const release = session => {
    if (session.releasing) return session.releasing;
    clearTimeout(session.statsTimer);
    for (const [name, handler] of session.handlers) session.sdk?.removeEventListener(name, handler);
    try { session.track?.stop(); } catch {}
    session.releasing = (async () => {
      try { session.sdk?.stopPublishing(); } catch {}
      try { await session.sdk?.disconnect(); } finally { session.platform?.dispose?.(); }
    })().catch(() => {});
    return session.releasing;
  };
  const finish = (session, state, message) => {
    if (!current(session)) return session.releasing || Promise.resolve();
    active = null; generation++; session.cancel?.();
    const pending = release(session);
    teardown = pending;
    void pending.finally(() => { if (teardown === pending) teardown = null; });
    update({ state, advertised: false, listeners: 0, bytes: 0, packets: 0, url: '', message });
    return pending;
  };
  const measure = async session => {
    try {
      const reports = await session.sdk.getStats();
      if (!current(session)) return;
      let bytes = 0, packets = 0;
      for (const rows of Object.values(reports)) for (const row of rows) {
        if (row.connectionType === 'publisher' && row.type === 'outbound-rtp' && (row.kind || row.mediaType) === 'audio') {
          if (Number.isFinite(row.bytesSent) && row.bytesSent >= 0) bytes += row.bytesSent;
          if (Number.isFinite(row.packetsSent) && row.packetsSent >= 0) packets += row.packetsSent;
        }
      }
      const sending = bytes > value.bytes && packets > 0;
      const patch = { bytes, packets, listeners: session.listeners.size };
      if (sending) patch.lastAudioAt = Date.now();
      if (value.state !== 'reconnecting') {
        patch.state = sending ? 'live' : 'advertised';
        patch.message = sending ? 'The server is sending Jazz audio to listeners.' :
          'The radio is advertised. A connected peer alone does not confirm audio delivery.';
      }
      update(patch);
    } catch { /* Diagnostics never interrupt the synthesis clock. */ }
    if (current(session)) {
      session.statsTimer = setTimeout(() => void measure(session), statsIntervalMs);
      session.statsTimer.unref?.();
    }
  };
  const start = ({ onstate: listener } = {}) => {
    if (listener !== undefined && typeof listener !== 'function') return Promise.reject(new TypeError('onstate must be a function.'));
    if (listener) onstate = listener;
    if (active) return active.starting.then(status);
    const session = { token: ++generation, sdk: null, platform: null, track: null, source: null,
      handlers: [], listeners: new Set(), statsTimer: null, cancel: null, releasing: null, starting: null };
    active = session;
    const previousTeardown = teardown;
    let timeout;
    const abort = new Promise((_, reject) => {
      session.cancel = () => reject(canceled());
      timeout = setTimeout(() => reject(new Error('The radio service did not connect in time.')), timeoutMs);
    });
    const work = (async () => {
      await previousTeardown;
      if (!current(session)) throw canceled();
      const platform = await loadPlatform();
      if (!current(session)) { platform.dispose?.(); throw canceled(); }
      session.platform = platform;
      session.source = platform.createAudioSource();
      session.track = session.source.createTrack();
      if (session.track.kind !== 'audio') throw new Error('The radio source must contain audio only.');
      const stream = platform.createMediaStream(session.track);
      if (stream.getTracks().length !== 1 || stream.getAudioTracks().length !== 1) throw new Error('The radio source must contain audio only.');
      const sdk = platform.createSDK({ host: JAZZ_CAST_HOST, password: link.password, salt: 'vdo.ninja',
        label: 'Doodle Jazz radio', debug: false, maxReconnectAttempts: 3, autoRecover: true, autoRelay: true,
        info: { allowdrawing: false, allowmidi: false, allowresources: false, allowchunked: false } });
      session.sdk = sdk;
      const on = (name, handler) => {
        const guarded = event => { if (current(session)) handler(event.detail || {}); };
        sdk.addEventListener(name, guarded); session.handlers.push([name, guarded]);
      };
      on('peerConnected', detail => {
        if (detail.connection?.type === 'publisher' && typeof detail.uuid === 'string') {
          session.listeners.add(detail.uuid); update({ listeners: session.listeners.size });
        }
      });
      on('peerDisconnected', detail => {
        session.listeners.delete(detail.uuid);
        update({ listeners: session.listeners.size, ...(session.listeners.size || !value.advertised || value.state === 'reconnecting' ? {} : { state: 'advertised' }) });
      });
      on('disconnected', detail => {
        if (detail.intentional) return;
        if (detail.willReconnect) update({ state: 'reconnecting', message: 'Reconnecting the radio signaling service…' });
        else void finish(session, 'error', 'The radio connection ended. A new server cast is required.');
      });
      on('reconnecting', () => update({ state: 'reconnecting', message: 'Reconnecting the radio signaling service…' }));
      on('reconnected', () => update({ state: 'advertised', message: 'Radio signaling reconnected; checking audio delivery.' }));
      on('reconnectFailed', () => void finish(session, 'error', 'The radio service could not reconnect.'));
      on('connectionFailed', () => update({ message: 'A listener could not connect. The server radio continues.' }));
      await sdk.connect();
      if (!current(session)) throw canceled();
      await sdk.publish(stream, { streamID: link.streamID, label: 'Doodle Jazz radio',
        media: { audio: { codec: 'opus', maxBitrate: 128000 } } });
      if (!current(session)) throw canceled();
      update({ state: 'advertised', advertised: true, url: link.url,
        message: 'The radio is advertised. Waiting for actual outgoing audio.' });
      void measure(session);
      return status();
    })();
    session.starting = (async () => {
      try { return await Promise.race([work, abort]); }
      catch (error) {
        const message = error.message === 'The radio service did not connect in time.' ? error.message :
          'Could not start the server audio cast. Check the streaming dependency and connection.';
        if (current(session)) await finish(session, 'error', message);
        if (error.name === 'AbortError') throw canceled();
        throw new Error(message);
      } finally { clearTimeout(timeout); session.cancel = null; }
    })();
    update({ state: 'starting', advertised: false, listeners: 0, bytes: 0, packets: 0,
      frames: 0, lastAudioAt: null, url: '', message: 'Starting the server radio cast…' });
    return session.starting;
  };
  return {
    start, status,
    writeFrame(samples) {
      if (!(samples instanceof Int16Array) || samples.length !== JAZZ_NODE_AUDIO.samplesPerFrame) {
        throw new TypeError('A radio frame must contain 960 interleaved signed 16-bit stereo samples.');
      }
      const session = active;
      if (!session?.source) return false;
      if (session.track?.readyState === 'ended') {
        void finish(session, 'error', 'The server radio audio track ended.'); return false;
      }
      try {
        session.source.onData({ samples, sampleRate: 48000, bitsPerSample: 16, channelCount: 2, numberOfFrames: 480 });
        value.frames++; return true;
      } catch {
        void finish(session, 'error', 'The server audio source stopped accepting radio frames.'); return false;
      }
    },
    stop() {
      if (!active) return teardown || Promise.resolve();
      return finish(active, 'idle', 'The server radio cast is stopped.');
    }
  };
}

const nativeWorkerURL = new URL('./jazz-node-native.mjs', import.meta.url);
const phases = new Set(['idle', 'starting', 'advertised', 'live', 'reconnecting', 'error']);
const phaseMessages = Object.freeze({ idle: 'The server radio cast is stopped.', starting: 'Starting the server radio cast…',
  advertised: 'The radio is ready for listeners. Audio delivery has not yet been confirmed.',
  live: 'The server is sending Jazz audio to listeners.', reconnecting: 'Reconnecting the radio service…',
  error: 'The isolated radio connection ended. The station needs to reconnect.' });
const count = value => Number.isSafeInteger(value) && value >= 0 ? value : 0;
const blankStatus = () => ({ phase: 'idle', advertised: false, peers: 0, bytesSent: 0, packetsSent: 0,
  framesSupplied: 0, lastAudioAt: null, listenerUrl: '', message: phaseMessages.idle, error: null });
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((done, fail) => { resolve = done; reject = fail; });
  // Cancellation may happen before startup reaches its next await.
  promise.catch(() => {});
  return { promise, resolve, reject };
};
const boundedWait = async (promise, ms, fallback) => {
  let timer;
  try { return await Promise.race([promise, new Promise(resolve => { timer = setTimeout(() => resolve(fallback), ms); })]); }
  finally { clearTimeout(timer); }
};
function workerEnvironment() {
  const env = { LANG: 'C.UTF-8', TZ: 'UTC' };
  // Windows needs these public OS paths. No owner/API credentials, NODE_OPTIONS,
  // application data paths, browser settings or inherited proxy secrets travel.
  if (process.platform === 'win32') for (const name of ['SystemRoot', 'WINDIR']) {
    if (process.env[name]) env[name] = process.env[name];
  }
  return env;
}

/** Production never loads native WebRTC into Keeper. Tests may explicitly inject
 * loadPlatform to exercise the direct controller without launching a process.
 */
export function createJazzNodeCast(options = {}) {
  if (Object.hasOwn(options, 'loadPlatform')) {
    if (typeof options.loadPlatform !== 'function') throw new TypeError('An explicit test platform must be a function.');
    return createJazzDirectNodeCast(options);
  }
  return createIsolatedCast(options);
}

/** Deterministic local-RTP mode used only by the explicit native CI canary. */
export function createJazzNodeNativeCanary(options = {}) { return createIsolatedCast(options, true); }

function createIsolatedCast({ invitation, forkImpl = fork, timeoutMs = 30000, stopGraceMs = 2000,
  exitGraceMs = 1000, heartbeatMs = 10000, frameAckMs = 1500, maxPendingFrames = 8 } = {}, canary = false) {
  const link = validateJazzNodeInvitation(invitation);
  for (const [value, min, max] of [[timeoutMs, 1, 120000], [stopGraceMs, 1, 5000], [exitGraceMs, 1, 5000],
    [heartbeatMs, 10, 60000], [frameAckMs, 10, 10000], [maxPendingFrames, 1, 64]]) {
    if (!Number.isInteger(value) || value < min || value > max) throw new TypeError('Invalid isolated radio options.');
  }
  if (typeof forkImpl !== 'function') throw new TypeError('Invalid radio worker factory.');
  let active = null, generation = 0, teardown = null, onstate = () => {}, value = blankStatus();
  const status = () => ({ ...value });
  const update = patch => { value = { ...value, ...patch }; try { onstate(status()); } catch {} };
  const current = session => active === session && session.token === generation;
  const send = (session, message, onError) => {
    try {
      if (!session.child?.connected) throw new Error('Worker is disconnected.');
      session.child.send(message, error => { if (error) onError(); });
    } catch { onError(); }
  };
  const endWorker = session => {
    if (session.ending) return session.ending;
    session.closing = true; clearInterval(session.watch); session.pendingFrames.clear();
    session.probe?.reject(canceled());
    session.ending = (async () => {
      if (!session.child || session.exited) return { stopAcknowledged: false, terminationRequested: false,
        exited: !session.child || session.exited, expectedTermination: false, signal: session.exitSignal || null };
      const acknowledgement = deferred(); session.stopAck = acknowledgement;
      send(session, { type: 'stop', id: session.token }, () => acknowledgement.resolve(false));
      const stopAcknowledged = await boundedWait(acknowledgement.promise, stopGraceMs, false);
      let terminationRequested = false;
      if (!session.exited) {
        try { terminationRequested = session.child.kill('SIGKILL'); } catch {}
      }
      await boundedWait(session.exit.promise, exitGraceMs, null);
      if (!session.exited) { try { session.child.kill('SIGKILL'); } catch {} }
      const expectedTermination = terminationRequested && session.exited && (session.exitSignal === 'SIGKILL' ||
        (process.platform === 'win32' && session.exitSignal === null && session.exitCode === 1));
      return { stopAcknowledged: stopAcknowledged === true, terminationRequested, exited: session.exited,
        expectedTermination, signal: session.exitSignal || null, code: session.exitCode ?? null };
    })();
    return session.ending;
  };
  const finish = (session, phase, message) => {
    if (!current(session)) return session.ending || Promise.resolve();
    active = null; generation++;
    session.start.reject(phase === 'idle' ? canceled() : new Error(message));
    const pending = endWorker(session); teardown = pending;
    void pending.finally(() => { if (teardown === pending) teardown = null; });
    update({ ...blankStatus(), phase, message, error: phase === 'error' ? message : null });
    return pending;
  };
  const fail = (session, message = phaseMessages.error) => {
    if (current(session)) void finish(session, 'error', message);
  };
  const start = ({ onstate: listener } = {}) => {
    if (listener !== undefined && typeof listener !== 'function') return Promise.reject(new TypeError('onstate must be a function.'));
    if (listener) onstate = listener;
    if (active) return active.starting.then(status);
    const session = { token: ++generation, child: null, start: deferred(), exit: deferred(), stopAck: null,
      started: false, startSent: false, starting: null, closing: false, ending: null, exited: false,
      exitCode: null, exitSignal: null, watch: null, lastSeen: performance.now(), nextFrame: 0,
      pendingFrames: new Map(), framesAcknowledged: 0, probe: null };
    active = session;
    const previousTeardown = teardown;
    let timeout;
    session.starting = (async () => {
      try {
        await previousTeardown;
        if (!current(session)) throw canceled();
        const child = forkImpl(nativeWorkerURL, ['--jazz-native-worker', ...(canary ? ['--canary'] : [])], {
          execPath: process.execPath, execArgv: ['--use-system-ca', '--max-old-space-size=128'],
          env: workerEnvironment(), stdio: ['ignore', 'ignore', 'ignore', 'ipc'], serialization: 'advanced',
          windowsHide: true, detached: false
        });
        session.child = child;
        child.on('error', () => fail(session, 'The isolated audio worker could not run.'));
        child.once('exit', (code, signal) => {
          session.exited = true; session.exitCode = code; session.exitSignal = signal || null; session.exit.resolve();
          fail(session, 'The isolated audio worker exited. The station needs to reconnect.');
        });
        child.on('message', message => {
          if (!message || typeof message !== 'object' || Array.isArray(message)) return;
          if (message.type === 'stopped' && session.closing && message.id === session.token) {
            session.stopAck?.resolve(message.acknowledged === true); return;
          }
          if (!current(session)) return;
          session.lastSeen = performance.now();
          if (message.type === 'ready' && message.version === 1 && !session.startSent) {
            session.startSent = true;
            send(session, { type: 'start', invitation: link, timeoutMs: Math.min(timeoutMs, 25000) }, () => fail(session));
          } else if (message.type === 'started') {
            session.started = true; session.start.resolve();
          } else if (message.type === 'state' && message.value && phases.has(message.value.phase)) {
            const info = message.value;
            if (info.phase === 'error') { fail(session); return; }
            update({ phase: info.phase, advertised: info.advertised === true, peers: Math.min(100000, count(info.peers)),
              bytesSent: count(info.bytesSent), packetsSent: count(info.packetsSent),
              framesSupplied: Math.max(value.framesSupplied, count(info.framesSupplied)),
              lastAudioAt: Number.isSafeInteger(info.lastAudioAt) && info.lastAudioAt >= 0 ? info.lastAudioAt : null,
              listenerUrl: info.advertised === true ? link.url : '', message: phaseMessages[info.phase], error: null });
          } else if (message.type === 'frame-ack' && session.pendingFrames.has(message.sequence)) {
            session.pendingFrames.delete(message.sequence);
            if (message.accepted !== true) fail(session, 'The isolated audio source stopped accepting frames.');
            else { session.framesAcknowledged++; value.framesSupplied = Math.max(value.framesSupplied, session.framesAcknowledged); }
          } else if (message.type === 'probe-result' && canary && session.probe) {
            const result = message.value;
            const keys = ['framesSupplied', 'stereoSourceSamples', 'sourcePeak', 'decodedSamples', 'decodedPeak', 'decodedChannels', 'bytesSent', 'packetsSent'];
            if (!result || result.sdkSeeded !== true || keys.some(key => !Number.isSafeInteger(result[key]) || result[key] < 0)) {
              session.probe.reject(new Error('The native audio proof was invalid.'));
            } else session.probe.resolve(Object.fromEntries([['sdkSeeded', true], ...keys.map(key => [key, result[key]])]));
            session.probe = null;
          } else if (message.type === 'error') fail(session);
        });
        session.watch = setInterval(() => {
          if (!current(session)) return;
          const first = session.pendingFrames.values().next().value;
          if (performance.now() - session.lastSeen > heartbeatMs || (first !== undefined && performance.now() - first > frameAckMs)) {
            fail(session, 'The isolated audio worker stopped responding. The station needs to reconnect.');
          }
        }, Math.max(10, Math.min(250, heartbeatMs / 4, frameAckMs / 4)));
        session.watch.unref?.();
        await session.start.promise;
        return status();
      } catch (error) {
        if (current(session)) await finish(session, 'error', 'Could not start the isolated server audio worker.');
        throw error.name === 'AbortError' ? canceled() : new Error('Could not start the isolated server audio worker.');
      } finally { clearTimeout(timeout); }
    })();
    timeout = setTimeout(() => fail(session, 'The isolated audio worker did not start in time.'), timeoutMs);
    update({ ...blankStatus(), phase: 'starting', message: phaseMessages.starting });
    return session.starting;
  };
  const transport = {
    start, status,
    writeFrame(samples) {
      if (!(samples instanceof Int16Array) || samples.length !== 960) throw new TypeError('A radio frame must contain 960 interleaved signed 16-bit stereo samples.');
      const session = active;
      if (!session?.started || session.closing) return false;
      if (session.pendingFrames.size >= maxPendingFrames) {
        fail(session, 'The isolated audio worker could not keep up. The station needs to reconnect.'); return false;
      }
      const sequence = ++session.nextFrame;
      session.pendingFrames.set(sequence, performance.now());
      send(session, { type: 'frame', sequence, samples: samples.slice() }, () => fail(session));
      return current(session);
    },
    stop() { return active ? finish(active, 'idle', phaseMessages.idle) : teardown || Promise.resolve(); }
  };
  if (canary) transport.probeNative = () => {
    const session = active;
    if (!session?.started || session.probe) return Promise.reject(new Error('The native probe is not ready.'));
    session.probe = deferred(); const result = session.probe.promise;
    send(session, { type: 'probe' }, () => fail(session));
    return boundedWait(result, 8000, null).then(value => { if (!value) throw new Error('The native audio probe timed out.'); return value; });
  };
  return transport;
}
