// openaiClient.js - Avaliação direta na API da OpenAI com a chave do usuário.
// Funciona no site estático: a API aceita chamadas do navegador (CORS). A chave fica só neste navegador.
import { answerSchema, parseScreeningResponse, SCREENING_INSTRUCTIONS } from './answerContract.js';
import { reasoningParameters } from './modelCapabilities.js';

const OPENAI_BASE = 'https://api.openai.com/v1';
const TIMEOUT_MS = 180_000;
const MAX_RETRIES = 2;

const openaiError = (message, { status = null, code = 'api', requestId = null, reason = null } = {}) =>
  Object.assign(new Error(message), { status, code, requestId, reason, provider: 'openai' });

const sleep = (ms, signal) => new Promise((resolve, reject) => {
  if (signal?.aborted) { reject(new DOMException('Aborted', 'AbortError')); return; }
  const timer = setTimeout(() => { signal?.removeEventListener('abort', onAbort); resolve(); }, ms);
  const onAbort = () => { clearTimeout(timer); reject(new DOMException('Aborted', 'AbortError')); };
  signal?.addEventListener('abort', onAbort, { once: true });
});

const withTimeout = signal => {
  if (typeof AbortSignal.timeout !== 'function') return signal;
  const timeout = AbortSignal.timeout(TIMEOUT_MS);
  return signal && typeof AbortSignal.any === 'function' ? AbortSignal.any([signal, timeout]) : signal || timeout;
};

async function openaiFetch(path, { apiKey, body, signal }) {
  if (!apiKey) throw openaiError('API key missing', { code: 'no-key' });
  for (let attempt = 0; ; attempt++) {
    let res;
    try {
      res = await fetch(`${OPENAI_BASE}${path}`, {
        method: body ? 'POST' : 'GET', signal: withTimeout(signal),
        headers: { Authorization: `Bearer ${apiKey}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
    } catch (error) {
      if (error?.name === 'AbortError' && signal?.aborted) throw error;
      if (error?.name === 'TimeoutError') throw openaiError('Request timed out', { code: 'timeout' });
      throw openaiError(error?.message || 'Network error', { code: 'network' });
    }
    let data = null;
    try { data = await res.json(); } catch { /* resposta sem JSON */ }
    if (res.ok) return data;

    const quota = data?.error?.code === 'insufficient_quota';
    if (!quota && (res.status === 429 || res.status >= 500) && attempt < MAX_RETRIES) {
      const retryAfter = Number(res.headers.get('retry-after'));
      await sleep(Number.isFinite(retryAfter) && retryAfter > 0 ? Math.min(retryAfter, 30) * 1000 : 1000 * 2 ** attempt, signal);
      continue;
    }
    const code = res.status === 401 ? 'auth' : res.status === 403 ? 'permission' : quota ? 'quota' : res.status === 429 ? 'rate-limit' : 'api';
    throw openaiError(data?.error?.message || `HTTP ${res.status}`, { status: res.status, code, requestId: res.headers.get('x-request-id') });
  }
}

// Modelos de texto da conta (exclui áudio, imagem, embeddings etc.)
export const listOpenaiModels = async ({ apiKey, signal }) => {
  const data = await openaiFetch('/models', { apiKey, signal });
  return (data?.data || []).map(m => m.id)
    .filter(id => /^(gpt-|o\d)/.test(id) && !/(audio|realtime|transcribe|tts|image|search|embedding|instruct)/.test(id))
    .sort();
};

// Saída estruturada (JSON Schema estrito) nos modelos que a suportam; nos demais vale a instrução
const supportsStrictSchema = model => /^(gpt-[4-9]|o\d)/.test(model);

export const evaluateOpenai = async ({ apiKey, model, state, questions, effort = 'default', signal }) => {
  if (!model) throw openaiError('Model missing', { code: 'api' });
  const schema = answerSchema(questions);
  const data = await openaiFetch('/responses', { apiKey, signal, body: {
    model, store: false, ...reasoningParameters('openai', model, effort),
    ...(supportsStrictSchema(model) ? { text: { format: { type: 'json_schema', name: 'screening', strict: true, schema } } } : {}),
    input: [
      { role: 'developer', content: SCREENING_INSTRUCTIONS + `\nRequired JSON Schema: ${JSON.stringify(schema)}` },
      { role: 'user', content: JSON.stringify({ study: state, questions }) },
    ],
  } });
  if (data?.status === 'incomplete') throw openaiError('Inference response incomplete', { code: 'response-incomplete', reason: 'incomplete' });
  if (data?.status && data.status !== 'completed') throw openaiError(data.error?.message || 'Inference failed', { code: 'api', reason: 'failed' });
  const messages = (data?.output || []).filter(item => item.type === 'message');
  if (messages.some(m => m.content?.some(c => c.type === 'refusal'))) throw openaiError('Model refused the evaluation', { code: 'refusal', reason: 'refusal' });
  // Comentários e raciocínio nunca entram no JSON final
  const final = messages.filter(m => m.phase === 'final_answer').at(-1) || messages.filter(m => m.phase !== 'commentary').at(-1);
  const text = (final?.content || []).filter(c => c.type === 'output_text').map(c => c.text || '').join('');
  const parsed = parseScreeningResponse(text);
  return { answers: parsed?.answers, model: data.model, usage: data.usage, effectiveEffort: data.reasoning?.effort };
};
