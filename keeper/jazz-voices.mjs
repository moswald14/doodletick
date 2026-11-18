// SPDX-License-Identifier: GPL-3.0-only
import { createHash } from 'node:crypto';
import { mkdir, lstat, readFile } from 'node:fs/promises';
import path from 'node:path';
import { atomicJazzJson } from './jazz-library.mjs';
import { parseJazzDotVoice, JAZZ_DOT_PARTS } from './public/jazz-dot-voices.mjs';
import { buildJazzDotBankInWorker } from './jazz-dot-bank.mjs';

const FORMAT = 'doodle-jazz-player-voices-v1';
const originalVoices = () => ({ piano: null, bass: null, drums: null });
const digest = voice => createHash('sha256').update(JSON.stringify(voice)).digest('hex');
const failure = (message, status = 503) => Object.assign(new Error(message), { status });

function voiceLabels(voices) {
  return Object.fromEntries(JAZZ_DOT_PARTS.map(part => {
    const voice = voices[part];
    return [part, voice ? { name: voice.name, digest: digest(voice) } : null];
  }));
}

export async function createJazzVoices({ dataDir, buildBank = buildJazzDotBankInWorker, signal } = {}) {
  const directory = path.join(dataDir, 'jazz-radio');
  const filename = path.join(directory, 'voices.json');
  let assignments = originalVoices();
  let damaged = false, lastError = null, closing = false;
  try {
    await mkdir(directory, { recursive: true, mode: 0o700 });
    const directoryInfo = await lstat(directory);
    if (!directoryInfo.isDirectory() || directoryInfo.isSymbolicLink()) throw new Error('Invalid voices directory.');
    const info = await lstat(filename).catch(error => {
      if (error.code !== 'ENOENT') throw error;
      return null;
    });
    if (info) {
      if (!info.isFile() || info.isSymbolicLink() || info.size > 128 * 1024) throw new Error('Invalid player voices.');
      const stored = JSON.parse(await readFile(filename, 'utf8'));
      if (stored?.format !== FORMAT || !stored.assignments
        || Object.keys(stored.assignments).length !== JAZZ_DOT_PARTS.length) throw new Error('Invalid player voices.');
      for (const part of JAZZ_DOT_PARTS) {
        if (!Object.hasOwn(stored.assignments, part)) throw new Error('Missing player voice.');
        const voice = stored.assignments[part];
        assignments[part] = voice === null ? null : parseJazzDotVoice(voice);
      }
    }
  } catch {
    damaged = true;
    assignments = originalVoices();
    lastError = 'Saved player voices need recovery. The original trio is available and your recipes have been preserved.';
  }
  let parts = voiceLabels(assignments);
  function status() {
    return { available: !damaged && !closing, error: lastError, parts: structuredClone(parts) };
  }
  return {
    status,
    recipes() { return { ...status(), assignments: structuredClone(assignments) }; },
    async initialBank() {
      if (damaged || !Object.values(assignments).some(Boolean)) return null;
      return buildBank(assignments, { rate: 24000, signal });
    },
    async assign(part, value) {
      if (damaged || closing) throw failure(lastError || 'Player voices are unavailable.');
      if (!JAZZ_DOT_PARTS.includes(part)) throw failure('Choose piano, bass or drums.', 400);
      let voice;
      try { voice = value === null ? null : parseJazzDotVoice(value); }
      catch (error) { throw failure(error.message, 400); }
      const next = { ...assignments, [part]: voice };
      const bank = await buildBank(next, { rate: 24000, signal });
      if (closing) throw failure('Keeper is closing.');
      try {
        await atomicJazzJson(filename, { format: FORMAT, assignments: next });
      } catch {
        lastError = 'Keeper could not save this voice. Your earlier voices are safe.';
        throw failure(lastError);
      }
      assignments = next;
      parts = voiceLabels(assignments);
      lastError = null;
      return { bank, ...status() };
    },
    close() { closing = true; }
  };
}
