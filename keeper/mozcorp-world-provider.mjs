import { fail, MozCorpWorldError, MODULES, normalizeProposal } from './mozcorp-world-validation.mjs';

const ENDPOINT = 'https://api.openai.com/v1/responses';
const FAILURE = Object.freeze({
  generic: ['PROVIDER_FAILED', 'The proposal service could not complete this request. No automatic retry was made.'],
  service: ['PROVIDER_FAILED', 'The AI provider reported a service failure. No automatic retry was made.'],
  authentication: ['PROVIDER_AUTH_FAILED', 'The AI provider rejected the server credentials or access settings. Check the server-side API key and project access. No automatic retry was made.'],
  permission: ['PROVIDER_PERMISSION_DENIED', 'The AI provider does not allow this request. Check project permissions, model access and supported regions. No automatic retry was made.'],
  quota: ['PROVIDER_QUOTA_EXHAUSTED', 'The AI provider reports exhausted credits or a spending or usage limit. Check the API account billing and limits before requesting another draft.'],
  rate: ['PROVIDER_RATE_LIMITED', 'The AI provider is temporarily rate limiting requests. Wait before choosing to request another draft. No automatic retry was made.'],
  model: ['PROVIDER_MODEL_UNAVAILABLE', 'The configured AI model is unavailable to this API project. Check the server model setting and project access. No automatic retry was made.'],
  request: ['PROVIDER_REQUEST_REJECTED', 'The AI provider rejected the draft request. Check whether the configured model supports its request format. No automatic retry was made.']
});
const QUOTA_CODES = new Set(['insufficient_quota', 'credit_balance_exhausted', 'organization_spend_limit_exceeded', 'project_spend_limit_exceeded', 'organization_usage_limit_exceeded']);
const RATE_CODES = new Set(['rate_limit_exceeded', 'slow_down']);

function discardBody(response) {
  try { response.body?.cancel().catch(() => {}); } catch {}
}

async function fetchProvider(fetchImpl, url, options) {
  try { return await fetchImpl(url, options); }
  catch { const [code, message] = FAILURE.generic; fail(502, code, message); }
}

async function failureCategory(response, signal) {
  // Parse only the small diagnostic fields needed to select our own fixed text.
  // Provider messages, parameters, IDs and raw codes never leave this function.
  if (signal.aborted) { discardBody(response); return {}; }
  const declared = Number(response.headers?.get('content-length'));
  if (Number.isFinite(declared) && declared > 8192) { discardBody(response); return {}; }
  let reader, onAbort;
  try {
    if (!response.body?.getReader) return {};
    reader = response.body.getReader();
    onAbort = () => { try { reader.cancel().catch(() => {}); } catch {} };
    signal.addEventListener('abort', onAbort, { once: true });
    const chunks = []; let size = 0;
    for (;;) {
      const { value, done } = await reader.read(); if (done) break;
      if (!ArrayBuffer.isView(value) || !Number.isSafeInteger(value.byteLength) || (size += value.byteLength) > 8192) { onAbort(); return {}; }
      chunks.push(Buffer.from(value.buffer, value.byteOffset, value.byteLength));
    }
    const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8')), error = parsed?.error;
    if (!error || typeof error !== 'object' || Array.isArray(error)) return {};
    const hasCode = error.code !== undefined && error.code !== null;
    const code = typeof error.code === 'string' && error.code.length <= 64 ? error.code : '';
    const type = typeof error.type === 'string' && error.type.length <= 64 ? error.type : '';
    if (QUOTA_CODES.has(code) || !hasCode && type === 'insufficient_quota') return { quota: true };
    if (RATE_CODES.has(code) || !hasCode && type === 'rate_limit_error') return { rate: true };
    return { model: code === 'model_not_found' };
  } catch { return {}; }
  finally { if (onAbort) signal.removeEventListener('abort', onAbort); try { reader?.releaseLock(); } catch {} }
}

async function rejectProvider(response, signal) {
  let category = 'generic';
  if (response.redirected || response.status >= 300 && response.status < 400) discardBody(response);
  else if (response.status === 401) { category = 'authentication'; discardBody(response); }
  else if (response.status === 403) { category = 'permission'; discardBody(response); }
  else if (response.status === 400) { category = 'request'; discardBody(response); }
  else if (response.status >= 500 && response.status < 600) { category = 'service'; discardBody(response); }
  else if (response.status === 429 || response.status === 404) {
    const diagnostic = await failureCategory(response, signal);
    if (response.status === 429) category = diagnostic.quota ? 'quota' : diagnostic.rate ? 'rate' : 'generic';
    else if (diagnostic.model) category = 'model';
  } else discardBody(response);
  const [code, message] = FAILURE[category];
  // These describe an upstream failure, not the browser's authentication state.
  fail(502, code, message);
}
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
    const response = await fetchProvider(fetchImpl, ENDPOINT, {
      method: 'POST', redirect: 'error', signal: controller.signal,
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + provider.apiKey },
      body: JSON.stringify({ model: provider.model, store: false, max_output_tokens: 2200,
        input: [
          { role: 'developer', content: [{ type: 'input_text', text: 'Write a narrow human-reviewed upgrade proposal. You have no source code, private user data, files, tools or deployment access. Never claim implementation, testing or deployment. Do not request personal desk, profile, receipt, vault, uploaded-file or credential content. Return a structured proposal, not executable code.' }] },
          { role: 'user', content: [{ type: 'input_text', text: JSON.stringify({ requestedArea: selected.label, permittedBoundary: selected.boundary, baseRelease: input.baseRelease, operatorInstruction: input.instruction }) }] }
        ], text: { format: { type: 'json_schema', name: 'keeper_upgrade_proposal', strict: true, schema: SCHEMA } } })
    });
    if (!response.ok || response.redirected) await rejectProvider(response, controller.signal);
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
