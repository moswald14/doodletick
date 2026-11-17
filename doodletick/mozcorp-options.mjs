// SPDX-License-Identifier: GPL-3.0-only
import { readFile } from 'node:fs/promises';

/** Provider secrets stay on the server; this never returns them through an API. */
export async function readMozCorpProviderOptions(file = '/data/options.json') {
  let value;
  try {
    const raw = await readFile(file, 'utf8');
    if (Buffer.byteLength(raw) > 32000) throw Error('Invalid options');
    value = JSON.parse(raw);
  } catch (error) {
    if (error.code === 'ENOENT') return { apiKey: '', model: 'gpt-5-mini' };
    throw Error('MozCorp AI options could not be read. Review the app configuration.');
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error('Invalid MozCorp AI options.');
  const model = value.mozcorp_openai_model ?? 'gpt-5-mini';
  if (typeof model !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,79}$/.test(model)) throw Error('Choose a valid MozCorp AI model in app configuration.');
  if (value.mozcorp_ai_enabled !== true) return { apiKey: '', model };
  const key = value.mozcorp_openai_api_key ?? '';
  if (typeof key !== 'string' || key.length > 512 || /[\r\n\s]/.test(key)) throw Error('Review the MozCorp AI key in app configuration.');
  return { apiKey: key, model };
}
