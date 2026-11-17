// SPDX-License-Identifier: GPL-3.0-only
// Prove native audio, acknowledged contained worker termination and clean service exit.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { createJazzNodeNativeCanary, createJazzNodeInvitation } from '../keeper/jazz-node-cast.mjs';

if (!process.argv.includes('--service-child')) {
  const child = spawnSync(process.execPath, [fileURLToPath(import.meta.url), '--service-child'], {
    encoding: 'utf8', timeout: 25000, killSignal: 'SIGKILL', windowsHide: true, maxBuffer: 1024 * 1024
  });
  if (child.stdout) process.stdout.write(child.stdout);
  if (child.stderr) process.stderr.write(child.stderr);
  const proof = child.stdout?.split('\n').filter(Boolean).some(line => {
    try { return JSON.parse(line).jazzNativeService === 'passed'; } catch { return false; }
  });
  const passed = child.status === 0 && !child.error && proof;
  console.log(JSON.stringify({ jazzNativeCanary: passed ? 'passed' : 'failed', cleanServiceExit: child.status === 0,
    serviceExitCode: child.status, serviceSignal: child.signal || null, timedOut: child.error?.code === 'ETIMEDOUT' }));
  // This observer has no native binding. Success requires the service child's
  // natural clean exit, not suppression of a crashed native process's exit code.
  process.exit(passed ? 0 : 1);
}

assert(Number(process.versions.node.split('.')[0]) >= 24);
const require = createRequire(import.meta.url);
const nativeLoaded = () => Object.keys(require.cache).some(name => /[/\\]@roamhq[/\\]|wrtc\.node$/.test(name));
assert.equal(nativeLoaded(), false);
const originalDlopen = process.dlopen;
process.dlopen = () => { throw new Error('The service process must never load a native binding.'); };
const cast = createJazzNodeNativeCanary({ invitation: createJazzNodeInvitation(), timeoutMs: 10000 });
let writer, frames = 0, proof, stopped;
try {
  await cast.start();
  writer = setInterval(() => {
    const samples = new Int16Array(960);
    for (let i = 0; i < 480; i++) {
      const phase = (frames * 480 + i) * 2 * Math.PI * 440 / 48000;
      samples[i * 2] = Math.round(Math.sin(phase) * 6000);
      samples[i * 2 + 1] = Math.round(Math.sin(phase * 1.5) * 5000);
    }
    assert.equal(cast.writeFrame(samples), true); frames++;
  }, 10);
  proof = await cast.probeNative();
  assert.equal(proof.sdkSeeded, true);
  assert(proof.stereoSourceSamples > 0 && proof.sourcePeak > 100);
  assert(proof.decodedSamples >= 4800 && proof.decodedPeak > 100 && proof.decodedChannels === 2);
  assert(proof.bytesSent > 0 && proof.packetsSent > 0);
} finally {
  clearInterval(writer); stopped = await cast.stop(); process.dlopen = originalDlopen;
}
assert.equal(stopped.stopAcknowledged, true, 'The worker must acknowledge stopping its native resources.');
assert.equal(stopped.terminationRequested, true, 'The parent must deliberately terminate its owned worker.');
assert.equal(stopped.exited, true);
assert.equal(stopped.expectedTermination, true, 'An unexpected SIGSEGV is not a clean or intended shutdown.');
assert.equal(cast.status().phase, 'idle'); assert.equal(nativeLoaded(), false);
console.log(JSON.stringify({ jazzNativeService: 'passed', nativeFaultIsolated: true, nativeLoadedInService: false,
  platform: process.platform, arch: process.arch, node: process.versions.node, ...proof, containedShutdown: stopped }));
// Let the non-native service process exit naturally. The outer observer verifies it.
