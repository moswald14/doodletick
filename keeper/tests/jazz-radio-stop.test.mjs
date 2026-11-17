// SPDX-License-Identifier: GPL-3.0-only
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createJazzRadio } from '../jazz-radio.mjs';
import { JAZZ_DEFAULT_SETTINGS } from '../public/jazz-radio-contract.mjs';
import { newIdentity, sign } from '../public/core.mjs';

const owner = await newIdentity('jazz_stop_fixture');
const signer = { publicKey: owner.publicKey, sign: record => sign(record, owner.privateKey) };
const outcome = promise => promise.then(value => ({ value }), error => ({ error }));

async function fixture(t) {
  const dataDir = await mkdtemp(path.join(tmpdir(), 'doodletick-jazz-stop-'));
  const radios = [], transports = [], monitors = [];
  const station = path.join(dataDir, 'jazz-radio', 'station.json');
  t.after(async () => {
    for (const radio of radios) await radio.close();
    const absolute = path.resolve(dataDir);
    assert.equal(path.dirname(absolute), path.resolve(tmpdir()));
    assert(path.basename(absolute).startsWith('doodletick-jazz-stop-'));
    await rm(absolute, { recursive: true, force: true });
  });
  const open = async ({ failMonitorDuringStart = false } = {}) => {
    let monitorFailure;
    const radio = await createJazzRadio({ dataDir, signer, enabled: true, automatic: false,
      // These tests never render. The fixture has no native audio, process or network dependency.
      bankFactory: () => ({ piano: [], bass: [], drums: {} }),
      transportFactory: () => {
        const transport = { stops: 0, async start({ onstate }) { if (failMonitorDuringStart) monitorFailure(); onstate({ phase: 'advertised' }); },
          writeFrame: () => true, async stop() { this.stops++; } };
        transports.push(transport); return transport;
      },
      monitorFactory: async ({ onFailure }) => {
        monitorFailure = onFailure;
        const monitor = { closes: 0, writeFrame: () => true, async close() { this.closes++; } };
        monitors.push(monitor); return monitor;
      },
      voice: { close() {}, status: () => ({ available: false }) }, world: { close() {} }
    });
    radios.push(radio); return radio;
  };
  const failStationWrites = async () => {
    // A directory at the exact disposable fixture target makes atomic rename fail
    // on Windows and Linux, including privileged CI containers.
    await unlink(station); await mkdir(station);
  };
  return { dataDir, station, open, failStationWrites, transports, monitors };
}

test('Stop silences this run even when persisting the stopped state fails', async t => {
  const env = await fixture(t), radio = await env.open();
  await radio.start(); await env.failStationWrites();
  await outcome(radio.stop());
  assert.equal(radio.status().running, false);
  assert.equal(env.transports[0].stops, 1); assert.equal(env.monitors[0].closes, 1);
  assert.match(radio.status().error || '', /save|stopped|restart/i);
  await outcome(radio.stop());
  assert.equal(radio.status().running, false);
  assert.equal(env.transports[0].stops, 1); assert.equal(env.monitors[0].closes, 1);
});

test('Never stop can be unlocked after a station write failure and Stop still closes both outputs', async t => {
  const env = await fixture(t), radio = await env.open();
  await radio.neverStop(true); assert.equal(radio.status().running, true);
  await env.failStationWrites();
  const failedSetting = await outcome(radio.settings({ ...JAZZ_DEFAULT_SETTINGS, tempo: 113 }));
  assert(failedSetting.error, 'The fixture must exercise the station write-failure guard.');
  assert.equal(radio.status().neverStop, true);
  const locked = await outcome(radio.stop());
  assert.equal(locked.error?.status, 423); assert.equal(radio.status().running, true);
  await outcome(radio.neverStop(false));
  assert.equal(radio.status().neverStop, false, 'Write failure cannot trap the station in its stop lock.');
  await outcome(radio.stop());
  assert.equal(radio.status().running, false);
  assert.equal(env.transports[0].stops, 1); assert.equal(env.monitors[0].closes, 1);
});

test('a station that was unreadable at startup is preserved by Stop and unlock attempts', async t => {
  const env = await fixture(t), original = '{damaged-fixture-station';
  await mkdir(path.dirname(env.station)); await writeFile(env.station, original);
  const radio = await env.open();
  assert.match(radio.status().error || '', /recovery/i);
  await assert.rejects(radio.start(), error => error.status === 503);
  await outcome(radio.stop()); await outcome(radio.neverStop(false));
  assert.equal(await readFile(env.station, 'utf8'), original);
  assert.equal(env.transports.length, 0); assert.equal(env.monitors.length, 0);
  assert.equal(radio.status().running, false);
});

test('an encoder failure during pending signaling cannot declare a working broadcast', async t => {
  const env = await fixture(t), radio = await env.open({ failMonitorDuringStart: true });
  await assert.rejects(radio.start(), error => error.status === 503);
  assert.equal(radio.status().running, false);
  assert.equal(env.transports[0].stops, 1); assert.equal(env.monitors[0].closes, 1);
});
