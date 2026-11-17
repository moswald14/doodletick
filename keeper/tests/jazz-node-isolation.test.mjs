// SPDX-License-Identifier: GPL-3.0-only
import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter, once } from 'node:events';
import { fork } from 'node:child_process';
import { createJazzNodeCast, createJazzNodeInvitation } from '../jazz-node-cast.mjs';

const invitation = createJazzNodeInvitation(), frame = () => new Int16Array(960).fill(2000);
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(predicate) {
  for (let i = 0; i < 100; i++) { if (predicate()) return; await delay(5); }
  assert.fail('Expected isolated worker activity did not occur.');
}
class Worker extends EventEmitter {
  connected = true; sent = []; kills = []; holdExit = false;
  constructor(options = {}) { super(); this.options = options; }
  send(message, callback) {
    this.sent.push(message);
    if (this.options.sendFailure === message.type) { callback?.(new Error('fixture-private-send-error')); return false; }
    callback?.(null);
    queueMicrotask(() => {
      if (!this.connected) return;
      if (message.type === 'start' && !this.options.holdStart) {
        this.emit('message', { type: 'state', value: { phase: 'advertised', advertised: true } });
        this.emit('message', { type: 'started' });
      } else if (message.type === 'frame' && !this.options.holdFrames) {
        this.emit('message', { type: 'frame-ack', sequence: message.sequence, accepted: true });
      } else if (message.type === 'stop' && !this.options.holdStop) {
        this.emit('message', { type: 'stopped', id: message.id, acknowledged: true });
      }
    });
    return true;
  }
  kill(signal) {
    this.kills.push(signal);
    if (!this.holdExit) queueMicrotask(() => this.exit(null, signal));
    return true;
  }
  exit(code, signal) { this.connected = false; this.emit('exit', code, signal); }
}
function fixture(workerOptions = {}, castOptions = {}) {
  const workers = [], calls = [];
  const forkImpl = (url, args, options) => {
    calls.push({ url, args, options }); const worker = new Worker(workerOptions); workers.push(worker);
    if (!workerOptions.holdReady) queueMicrotask(() => worker.emit('message', { type: 'ready', version: 1 }));
    return worker;
  };
  return { workers, calls, cast: createJazzNodeCast({ invitation, forkImpl, timeoutMs: 1000,
    stopGraceMs: 30, exitGraceMs: 100, ...castOptions }) };
}

test('production controller forks only the fixed module with private IPC and a minimal environment', async () => {
  const { cast, workers, calls } = fixture();
  try {
    assert.throws(() => createJazzNodeCast({ invitation, loadPlatform: null }), TypeError);
    assert.equal(calls.length, 0); await cast.start();
    assert(calls[0].url.href.endsWith('/keeper/jazz-node-native.mjs'));
    assert.deepEqual(calls[0].args, ['--jazz-native-worker']);
    assert(!JSON.stringify(calls[0].args).includes(invitation.password));
    const options = calls[0].options;
    assert.deepEqual(options.stdio, ['ignore', 'ignore', 'ignore', 'ipc']);
    assert.equal(options.serialization, 'advanced'); assert.equal(options.windowsHide, true);
    assert(!options.shell); assert(options.execArgv.includes('--max-old-space-size=128'));
    assert(Object.keys(options.env).every(name => ['LANG','TZ','SystemRoot','WINDIR'].includes(name)));
    assert(!Object.hasOwn(options.env, 'NODE_OPTIONS')); assert(!Object.hasOwn(options.env, 'PATH'));
    assert.deepEqual(workers[0].sent.find(message => message.type === 'start').invitation, invitation);
    assert.equal(cast.status().phase, 'advertised');
  } finally { await cast.stop(); }
});

test('worker state is copied through an explicit safe schema and never trusts its URL, IDs or error text', async () => {
  const { cast, workers } = fixture();
  try {
    await cast.start();
    workers[0].emit('message', { type: 'state', value: { phase: 'live', advertised: true, peers: 1,
      bytesSent: 2048, packetsSent: 20, framesSupplied: 10, lastAudioAt: 1000,
      listenerUrl: 'https://example.invalid/private', message: 'fixture-private-message', password: 'fixture-secret',
      peerUUID: 'fixture-peer', arbitrary: 'fixture-extra' } });
    const status = cast.status();
    assert.equal(status.phase, 'live'); assert.equal(status.bytesSent, 2048); assert.equal(status.listenerUrl, invitation.url);
    assert(!JSON.stringify(status).includes('fixture-'));
    assert.equal(cast.writeFrame(frame()), true); await delay(0);
    assert.equal(cast.status().framesSupplied, 10, 'A delayed frame ACK cannot double-count an authoritative worker total.');
  } finally { await cast.stop(); }
});

test('frames have exact copied PCM payloads and an acknowledged bounded in-flight queue', async () => {
  const { cast, workers } = fixture({ holdFrames: true }, { maxPendingFrames: 2 });
  await cast.start(); const input = frame();
  assert.equal(cast.writeFrame(input), true); input.fill(0);
  assert.equal(workers[0].sent.find(message => message.type === 'frame').samples[0], 2000);
  assert.equal(cast.writeFrame(frame()), true);
  assert.equal(cast.writeFrame(frame()), false);
  assert.equal(cast.status().phase, 'error');
  assert.equal(workers[0].sent.filter(message => message.type === 'frame').length, 2);
  await until(() => workers[0].kills.length === 1); await cast.stop();
});

test('Stop receives its native-resource ACK then deliberately terminates only its owned worker', async () => {
  const { cast, workers } = fixture(); await cast.start();
  const stopping = cast.stop(); assert.equal(cast.stop(), stopping);
  const result = await stopping;
  assert.equal(result.stopAcknowledged, true); assert.equal(result.terminationRequested, true);
  assert.equal(result.expectedTermination, true); assert.equal(result.exited, true);
  assert.deepEqual(workers[0].kills, ['SIGKILL']); assert.equal(cast.status().phase, 'idle');
  workers[0].emit('message', { type: 'state', value: { phase: 'error', error: 'late-private-error' } });
  assert.equal(cast.status().phase, 'idle'); assert.equal(cast.status().error, null);
});

test('an unresponsive Stop is contained within the grace period and is not labeled acknowledged', async () => {
  const { cast, workers } = fixture({ holdStop: true }, { stopGraceMs: 10 }); await cast.start();
  const result = await cast.stop();
  assert.equal(result.stopAcknowledged, false); assert.equal(result.exited, true);
  assert.equal(result.terminationRequested, true); assert.deepEqual(workers[0].kills, ['SIGKILL']);
});

for (const option of ['holdReady', 'holdStart']) test(`Stop cancels ${option} startup without a later revival`, async () => {
  const { cast, workers } = fixture({ [option]: true });
  const starting = cast.start().catch(error => error); await until(() => workers.length > 0);
  await cast.stop(); assert.equal((await starting).name, 'AbortError');
  workers[0].emit('message', { type: 'ready', version: 1 }); workers[0].emit('message', { type: 'started' });
  assert.equal(cast.status().phase, 'idle'); assert.equal(cast.writeFrame(frame()), false);
  if (option === 'holdReady') assert.equal(workers[0].sent.filter(message => message.type === 'start').length, 0);
});

test('an unexpected native SIGSEGV is reported for recovery and a new worker can use the persistent invitation', async () => {
  const { cast, workers } = fixture(); await cast.start();
  workers[0].exit(null, 'SIGSEGV');
  assert.equal(cast.status().phase, 'error'); assert.equal(cast.status().listenerUrl, '');
  await cast.start(); assert.equal(workers.length, 2);
  assert.deepEqual(workers[1].sent.find(message => message.type === 'start').invitation, invitation);
  assert.equal(cast.status().phase, 'advertised'); await cast.stop();
});

test('a replacement worker waits until its predecessor has actually exited', async () => {
  const { cast, workers } = fixture({}, { exitGraceMs: 1000 }); await cast.start(); workers[0].holdExit = true;
  const stopping = cast.stop(), starting = cast.start();
  await until(() => workers[0].kills.length === 1); assert.equal(workers.length, 1);
  workers[0].exit(null, 'SIGKILL'); await stopping; await starting;
  assert.equal(workers.length, 2); await cast.stop();
});

test('startup and worker heartbeat deadlines cannot leave a native worker running indefinitely', async () => {
  const startup = fixture({ holdReady: true }, { timeoutMs: 10 });
  await assert.rejects(startup.cast.start(), /Could not start/);
  await until(() => startup.workers[0].kills.length === 1); await startup.cast.stop();
  const running = fixture({}, { heartbeatMs: 20 }); await running.cast.start();
  await until(() => running.cast.status().phase === 'error');
  await until(() => running.workers[0].kills.length === 1); await running.cast.stop();
});

test('frame delivery failure and missing ACKs become fixed recoverable errors', async () => {
  for (const workerOptions of [{ sendFailure: 'frame' }, { holdFrames: true }]) {
    const { cast, workers } = fixture(workerOptions, { frameAckMs: 20 }); await cast.start();
    cast.writeFrame(frame()); await until(() => cast.status().phase === 'error');
    assert(!JSON.stringify(cast.status()).includes('fixture-private'));
    await until(() => workers[0].kills.length === 1); await cast.stop();
  }
});

test('real IPC worker rejects unknown commands and self-terminates if its parent disconnects', { timeout: 5000 }, async () => {
  const env = { LANG: 'C.UTF-8', TZ: 'UTC' };
  if (process.env.SystemRoot) env.SystemRoot = process.env.SystemRoot;
  const child = fork(new URL('../jazz-node-native.mjs', import.meta.url), ['--jazz-native-worker'], {
    execArgv: [], env, stdio: ['ignore','ignore','ignore','ipc'], serialization: 'advanced', windowsHide: true
  });
  const exited = once(child, 'exit');
  try {
    const [ready] = await once(child, 'message'); assert.equal(ready.type, 'ready');
    const reply = once(child, 'message'); child.send({ type: 'evaluate-code', source: 'must-not-run' });
    assert.deepEqual((await reply)[0], { type: 'error' });
    child.disconnect(); const [code, signal] = await exited;
    assert(signal === 'SIGKILL' || (process.platform === 'win32' && code === 1));
  } finally { if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL'); }
});
