import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { readMozCorpProviderOptions } from '../mozcorp-options.mjs';

test('legacy app options leave AI off; enabled provider settings remain server-only and errors omit secrets', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'mozcorp-options-test-')), file = path.join(dir, 'options.json');
  try {
    assert.deepEqual(await readMozCorpProviderOptions(file), { apiKey: '', model: 'gpt-5-mini' });
    await writeFile(file, JSON.stringify({ hostname: 'fixture-keeper' }));
    assert.equal((await readMozCorpProviderOptions(file)).apiKey, '');
    await writeFile(file, JSON.stringify({ mozcorp_ai_enabled: false, mozcorp_openai_api_key: 'disposable-test-only', mozcorp_openai_model: 'gpt-5-mini' }));
    assert.equal((await readMozCorpProviderOptions(file)).apiKey, '');
    await writeFile(file, JSON.stringify({ mozcorp_ai_enabled: true, mozcorp_openai_api_key: 'disposable-test-only', mozcorp_openai_model: 'gpt-5-mini' }));
    assert.equal((await readMozCorpProviderOptions(file)).apiKey, 'disposable-test-only');
    await writeFile(file, JSON.stringify({ mozcorp_ai_enabled: true, mozcorp_openai_api_key: 'disposable-test-only\ninvalid' }));
    await assert.rejects(readMozCorpProviderOptions(file), error => !error.message.includes('disposable-test-only'));
  } finally { assert.equal(path.dirname(dir), os.tmpdir()); assert(path.basename(dir).startsWith('mozcorp-options-test-')); await rm(dir, { recursive: true, force: true }); }
});
