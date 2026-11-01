import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateArticle } from '../src/ai/screening.js';
import { listOpenaiModels } from '../src/ai/openaiClient.js';
import { loadJevSettings } from '../src/ai/jevClient.js';
import { effortOptions, requiresReevaluation } from '../src/ai/modelCapabilities.js';
import { createEvaluationController } from '../src/ai/evaluationController.js';

const args = { article: { title: 'Study', abstract: 'Study abstract', keywords: [] },
  protocol: { inclusionCriteria: [{ id: 'I1', value: 'Matches topic' }], exclusionCriteria: [{ id: 'E1', value: 'Review article' }] },
  stage: 'filter1' };
const answers = { inc_I1: { status: 'assessed', evidence: 'Study', noul: 0.99 }, exc_E1: { status: 'assessed', evidence: 'Study', noul: 0.01 } };
const completed = (extra = {}) => ({ status: 'completed', model: 'gpt-5-mini-2025', usage: { input_tokens: 40, output_tokens: 9 }, output: [
  { type: 'reasoning', summary: [] },
  { type: 'message', role: 'assistant', content: [{ type: 'output_text', text: JSON.stringify({ answers }) }] },
], ...extra });
const mockFetch = (t, respond) => {
  const original = globalThis.fetch, requests = [];
  t.after(() => { globalThis.fetch = original; });
  globalThis.fetch = async (url, options) => { requests.push({ url, ...options, body: options.body && JSON.parse(options.body) }); return respond(url, options); };
  return requests;
};

test('OpenAI API key provider calls the Responses API directly with the shared screening contract', async t => {
  const requests = mockFetch(t, () => Response.json(completed()));
  const { suggestion, usage } = await evaluateArticle({ ...args, settings: { provider: 'openai', openaiKey: 'sk-test', openaiModel: 'gpt-5-mini', apiKey: 'jev-only-key',
    effortByModel: { 'openai:gpt-5-mini': 'low' } } });
  assert.equal(requests.length, 1);
  assert.equal(requests[0].url, 'https://api.openai.com/v1/responses');
  assert.equal(requests[0].headers.Authorization, 'Bearer sk-test');
  assert.ok(!JSON.stringify(requests[0]).includes('jev-only-key'));
  assert.equal(requests[0].body.model, 'gpt-5-mini'); assert.equal(requests[0].body.store, false);
  assert.deepEqual(requests[0].body.reasoning, { effort: 'low' });
  assert.equal(requests[0].body.text.format.type, 'json_schema'); assert.equal(requests[0].body.text.format.strict, true);
  assert.equal(suggestion.provider, 'openai'); assert.equal(suggestion.model, 'gpt-5-mini-2025');
  assert.equal(suggestion.decision, 'included'); assert.equal(usage.input_tokens, 40);
  assert.equal(requiresReevaluation(suggestion), false);
});

test('OpenAI errors map to actionable codes without retrying auth or quota failures', async t => {
  const settings = { provider: 'openai', openaiModel: 'gpt-5-mini' };
  await assert.rejects(evaluateArticle({ ...args, settings }), e => e.code === 'no-key');
  let status = 401, body = { error: { message: 'Incorrect API key' } };
  const requests = mockFetch(t, () => Response.json(body, { status }));
  await assert.rejects(evaluateArticle({ ...args, settings: { ...settings, openaiKey: 'sk-bad' } }), e => e.code === 'auth' && e.provider === 'openai');
  status = 429; body = { error: { code: 'insufficient_quota', message: 'No credits' } };
  await assert.rejects(evaluateArticle({ ...args, settings: { ...settings, openaiKey: 'sk-test' } }), e => e.code === 'quota');
  assert.equal(requests.length, 2);
});

test('OpenAI refusals and incomplete responses are reported, never parsed as answers', async t => {
  let payload = completed({ status: 'incomplete' });
  mockFetch(t, () => Response.json(payload));
  const settings = { provider: 'openai', openaiKey: 'sk-test', openaiModel: 'gpt-5-mini' };
  await assert.rejects(evaluateArticle({ ...args, settings }), e => e.code === 'response-incomplete');
  payload = completed({ output: [{ type: 'message', content: [{ type: 'refusal', refusal: 'No' }] }] });
  await assert.rejects(evaluateArticle({ ...args, settings }), e => e.code === 'refusal');
});

test('OpenAI model list keeps text models only; settings and efforts recognise the provider', async t => {
  mockFetch(t, () => Response.json({ data: [{ id: 'gpt-5-mini' }, { id: 'text-embedding-3-small' }, { id: 'gpt-4o-audio-preview' }, { id: 'o4-mini' }, { id: 'dall-e-3' }] }));
  assert.deepEqual(await listOpenaiModels({ apiKey: 'sk-test' }), ['gpt-5-mini', 'o4-mini']);
  assert.deepEqual(effortOptions('openai', 'gpt-5-mini'), ['default', 'low', 'medium', 'high']);
  assert.deepEqual(effortOptions('openai', 'gpt-4.1'), ['default']);
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  t.after(() => { if (previous) Object.defineProperty(globalThis, 'localStorage', previous); else delete globalThis.localStorage; });
  Object.defineProperty(globalThis, 'localStorage', { configurable: true,
    value: { getItem: () => JSON.stringify({ provider: 'openai', openaiKey: 'sk-test', openaiModel: 'gpt-5-mini' }) } });
  const loaded = loadJevSettings();
  assert.equal(loaded.provider, 'openai'); assert.equal(loaded.openaiModel, 'gpt-5-mini');
});

test('OpenAI batches do not require the local ChatGPT connection', async () => {
  let connectionChecks = 0;
  const controller = createEvaluationController({ connection: async () => { connectionChecks++; return { connected: true, connectionId: 'x' }; },
    evaluate: async () => { throw new Error('not started'); } });
  const article = { id: 'a', title: 'Study', abstract: 'Study abstract', dataProcessingStatus: 'included', filter1Status: 'pending' };
  await controller.prepare({ articles: [article], protocol: args.protocol, stage: 'filter1', sectionTitle: 'Filter 1',
    settings: { provider: 'openai', openaiKey: 'sk-test', openaiModel: 'gpt-5-mini', concurrency: 1 } });
  assert.equal(connectionChecks, 0);
  assert.equal(controller.getSnapshot().phase, 'ready'); assert.equal(controller.getSnapshot().provider, 'openai');
});
