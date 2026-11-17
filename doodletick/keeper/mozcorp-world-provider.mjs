import { fail, MozCorpWorldError, MODULES, normalizeProposal } from './mozcorp-world-validation.mjs';

const ENDPOINT = 'https://api.openai.com/v1/responses';
const SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['title', 'summary', 'proposedChanges', 'privacyImpact', 'reviewChecklist', 'rollbackPlan', 'riskLevel'],
  properties: {
    title: { type: 'string' }, summary: { type: 'string' }, privacyImpact: { type: 'string' }, rollbackPlan: { type: 'string' },
    riskLevel: { type: 'string', enum: ['LOW', 'MEDIUM', 'HIGH'] }, reviewChecklist: { type: 'array', items: { type: 'string' } },
    proposedChanges: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['area', 'change', 'rationale'], properties: { area: { type: 'string' }, change: { type: 'string' }, rationale: { type: 'string' } } } }
  }
};

async function boundedResponse(response) {
  const declared = Number(response.headers?.get('content-length'));
  if (Number.isFinite(declared) && declared > 65536) fail(502, 'PROVIDER_OUTPUT_TOO_LARGE', 'The proposal service returned too much data.');
  if (!response.body?.getReader) fail(502, 'PROVIDER_RESPONSE_INVALID', 'The proposal service response could not be read.');
  const reader = response.body.getReader(), chunks = []; let size = 0;
  try {
    for (;;) { const { value, done } = await reader.read(); if (done) break; size += value.byteLength; if (size > 65536) { await reader.cancel().catch(() => {}); fail(502, 'PROVIDER_OUTPUT_TOO_LARGE', 'The proposal service returned too much data.'); } chunks.push(Buffer.from(value)); }
  } finally { reader.releaseLock(); }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { fail(502, 'PROVIDER_RESPONSE_INVALID', 'The proposal service returned unreadable data.'); }
}

export async function requestUpgrade({ provider, fetchImpl, input, signal, timeoutMs = 15000 }) {
  if (signal?.aborted) fail(409, 'REQUEST_CANCELLED', 'The external proposal request was cancelled before sending.');
  const controller = new AbortController(); let timer, onAbort;
  const aborted = new Promise((_, reject) => {
    onAbort = () => { controller.abort(); reject(new MozCorpWorldError(409, 'REQUEST_CANCELLED', 'The external proposal request was cancelled.')); };
    if (signal?.aborted) onAbort(); else signal?.addEventListener('abort', onAbort, { once: true });
    timer = setTimeout(() => { controller.abort(); reject(new MozCorpWorldError(504, 'PROVIDER_TIMEOUT', 'The proposal service did not answer in time. No proposal was applied.')); }, timeoutMs);
  });
  const run = async () => {
    const selected = MODULES.find(m => m.id === input.moduleId);
    const response = await fetchImpl(ENDPOINT, {
      method: 'POST', redirect: 'error', signal: controller.signal,
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + provider.apiKey },
      body: JSON.stringify({ model: provider.model, store: false, max_output_tokens: 2200,
        input: [
          { role: 'developer', content: [{ type: 'input_text', text: 'Write a narrow human-reviewed upgrade proposal. You have no source code, private user data, files, tools or deployment access. Never claim implementation, testing or deployment. Do not request personal desk, profile, receipt, vault, uploaded-file or credential content. Return a structured proposal, not executable code.' }] },
          { role: 'user', content: [{ type: 'input_text', text: JSON.stringify({ requestedArea: selected.label, permittedBoundary: selected.boundary, baseRelease: input.baseRelease, operatorInstruction: input.instruction }) }] }
        ], text: { format: { type: 'json_schema', name: 'keeper_upgrade_proposal', strict: true, schema: SCHEMA } } })
    });
    if (!response.ok || response.redirected) fail(502, 'PROVIDER_FAILED', 'The proposal service could not complete this request. No automatic retry was made.');
    const value = await boundedResponse(response);
    if (value?.error || value?.status !== 'completed' || value.incomplete_details) fail(502, 'PROVIDER_INCOMPLETE', 'The proposal service did not complete a proposal.');
    const parts = [];
    if (Array.isArray(value.output)) for (const item of value.output) if (Array.isArray(item?.content)) for (const part of item.content) {
      if (part?.type === 'refusal') fail(502, 'PROVIDER_REFUSED', 'The proposal service declined the request.');
      if (part?.type === 'output_text' && typeof part.text === 'string') parts.push(part.text);
    }
    const raw = parts.length ? parts.join('') : typeof value.output_text === 'string' ? value.output_text : '';
    let proposal;
    try { proposal = normalizeProposal(JSON.parse(raw)); } catch { fail(502, 'MODEL_OUTPUT_INVALID', 'The service returned an invalid proposal. Nothing was applied.'); }
    const providerRequestId = typeof value.id === 'string' && /^[A-Za-z0-9_-]{1,160}$/.test(value.id) ? value.id : null;
    return { proposal, model: provider.model, providerRequestId };
  };
  try { return await Promise.race([run(), aborted]); }
  catch (error) { if (error instanceof MozCorpWorldError) throw error; fail(502, 'PROVIDER_FAILED', 'The proposal service could not complete this request. No automatic retry was made.'); }
  finally { clearTimeout(timer); signal?.removeEventListener('abort', onAbort); }
}
