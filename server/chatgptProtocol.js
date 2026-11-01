import { createPublicKey, verify } from 'node:crypto';
import { Buffer } from 'node:buffer';

export const ISSUER = 'https://auth.openai.com';
export const RESOURCE = 'https://api.openai.com/v1';
export const SCOPES = 'openid profile email offline_access resource.invoke chatgpt.tokens.use.direct';
export const hasPlanPermission = tokens => tokens.scope?.split(/\s+/).includes('chatgpt.tokens.use.direct');

export function validateIdentity(token, keys, { clientId, nonce, now = Date.now() / 1000 }) {
  const parts = token?.split('.') || [];
  if (parts.length !== 3) throw new Error('Invalid ID token');
  const header = JSON.parse(Buffer.from(parts[0], 'base64url'));
  const claims = JSON.parse(Buffer.from(parts[1], 'base64url'));
  const jwk = keys.find(k => k.kid === header.kid && k.kty === 'RSA');
  if (header.alg !== 'RS256' || !jwk || !verify('RSA-SHA256', Buffer.from(`${parts[0]}.${parts[1]}`),
    createPublicKey({ key: jwk, format: 'jwk' }), Buffer.from(parts[2], 'base64url'))) throw new Error('Invalid ID token signature');
  const audience = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (claims.iss !== ISSUER || !audience.includes(clientId) || !Number.isFinite(claims.exp) ||
    claims.exp <= now || claims.nonce !== nonce || !claims.sub ||
    (claims.nbf != null && claims.nbf > now + 30) ||
    (audience.length > 1 && claims.azp !== clientId)) throw new Error('Invalid ID token claims');
  return claims;
}

export { validateAnswers, parseScreeningResponse } from '../src/ai/answerContract.js';

const responseError = (message, reason, code = 'response-invalid') =>
  Object.assign(new Error(message), { code, status: 422, reason });

// SSE chunks can split UTF-8 characters, lines, and event boundaries.
export async function readCompletedResponse(body) {
  const decoder = new TextDecoder();
  let buffer = '', completed = null, refused = false;
  const items = new Map(), parts = new Map();
  const consume = block => {
    const data = block.split('\n').filter(l => l.startsWith('data:')).map(l => l.slice(5).trimStart()).join('\n');
    if (!data || data === '[DONE]') return;
    let event;
    try { event = JSON.parse(data); }
    catch { throw responseError('Malformed response stream event', 'stream-format'); }
    if (event.type === 'response.completed') completed = event.response;
    if (['response.output_item.added', 'response.output_item.done'].includes(event.type) && event.item) items.set(event.output_index, event.item);
    if (['response.output_text.delta', 'response.output_text.done'].includes(event.type)) {
      const index = event.output_index ?? 0, content = event.content_index ?? 0;
      const key = `${index}:${content}`;
      if (event.type.endsWith('.done')) parts.set(key, { index, content, text: event.text || '' });
      else parts.set(key, { index, content, text: (parts.get(key)?.text || '') + (event.delta || '') });
    }
    if (event.type === 'response.refusal.done') refused = true;
    if (event.type === 'response.incomplete') throw responseError('Inference response incomplete', 'incomplete', 'response-incomplete');
    if (['response.failed', 'error'].includes(event.type)) {
      throw responseError(event.response?.error?.code || event.error?.message || event.message || event.type, 'failed', 'response-failed');
    }
  };
  for await (const chunk of body) {
    buffer += decoder.decode(chunk, { stream: true });
    buffer = buffer.replace(/\r\n/g, '\n');
    let end;
    while ((end = buffer.indexOf('\n\n')) >= 0) {
      consume(buffer.slice(0, end)); buffer = buffer.slice(end + 2);
    }
    if (buffer.length > 8_000_000) throw responseError('Response event too large', 'stream-format');
  }
  buffer += decoder.decode();
  if (buffer.trim()) consume(buffer);
  if (!completed || completed.status !== 'completed') throw responseError('Inference stream ended without completion', 'incomplete', 'response-incomplete');
  // Reconstruct from streamed items when the terminal event carries only metadata.
  const outputs = completed.output?.length ? completed.output.map((item, index) => ({ item, index })) :
    [...new Set([...items.keys(), ...[...parts.values()].map(p => p.index)])].sort((a, b) => a - b)
      .map(index => ({ item: items.get(index) || { type: 'message', role: 'assistant' }, index }));
  if (refused || outputs.some(({ item }) => item.content?.some(c => c.type === 'refusal'))) throw responseError('Model refused the evaluation', 'refusal', 'refusal');
  const messages = outputs.filter(({ item }) => (!item.type || item.type === 'message') && (!item.role || item.role === 'assistant'));
  // Commentary and reasoning must never be concatenated with the final JSON.
  const final = messages.filter(({ item }) => item.phase === 'final_answer').at(-1) || messages.filter(({ item }) => item.phase !== 'commentary').at(-1);
  let text = (final?.item.content || []).filter(c => c.type === 'output_text').map(c => c.text || '').join('');
  if (!text && final) text = [...parts.values()].filter(p => p.index === final.index).sort((a, b) => a.content - b.content).map(p => p.text).join('');
  return { text, model: completed.model, usage: completed.usage, effectiveEffort: completed.reasoning?.effort };
}
