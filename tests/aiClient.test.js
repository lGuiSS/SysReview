import test from 'node:test';
import assert from 'node:assert/strict';
import { chatgptRequest } from '../src/ai/chatgptClient.js';

test('transient retries are bounded and do not retry malformed answers or auth failures', async t => {
  const original = globalThis.fetch; t.after(() => { globalThis.fetch = original; });
  let requests = 0;
  globalThis.fetch = async () => { requests++; return requests < 3 ? Response.json({ error: 'temporary', code: 'rate-limit', retryAfter: '0' }, { status: 429 }) : Response.json({ answers: {} }); };
  await chatgptRequest('evaluate', { body: {} }); assert.equal(requests, 3);
  requests = 0;
  globalThis.fetch = async () => { requests++; return Response.json({ error: 'bad criterion', code: 'response-invalid', criterionId: 'inc_I1', reason: 'answer-value' }, { status: 422 }); };
  await assert.rejects(chatgptRequest('evaluate', { body: {} }), e => e.code === 'response-invalid' && e.criterionId === 'inc_I1' && e.reason === 'answer-value'); assert.equal(requests, 1);
  requests = 0;
  globalThis.fetch = async () => { requests++; return Response.json({ error: 'expired' }, { status: 401 }); };
  await assert.rejects(chatgptRequest('evaluate', { body: {} }), e => e.code === 'ai-auth'); assert.equal(requests, 1);
});

test('cancellation interrupts retry backoff without starting another request', async t => {
  const original = globalThis.fetch; t.after(() => { globalThis.fetch = original; });
  const controller = new AbortController(); let requests = 0;
  globalThis.fetch = async () => { requests++; queueMicrotask(() => controller.abort()); return Response.json({ error: 'temporary', retryAfter: '1' }, { status: 429 }); };
  await assert.rejects(chatgptRequest('evaluate', { body: {}, signal: controller.signal }), e => e.name === 'AbortError'); assert.equal(requests, 1);
});

test('a long Retry-After does not trigger a premature retry', async t => {
  const original = globalThis.fetch; t.after(() => { globalThis.fetch = original; }); let requests = 0;
  globalThis.fetch = async () => { requests++; return Response.json({ error: 'quota' }, { status: 429, headers: { 'retry-after': '120' } }); };
  await assert.rejects(chatgptRequest('evaluate', { body: {} }), e => e.code === 'rate-limit'); assert.equal(requests, 1);
});
