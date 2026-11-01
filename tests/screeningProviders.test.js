import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateArticle, isAutoApplicable } from '../src/ai/screening.js';

test('JEV and ChatGPT share criteria and decision rules, retain provider, and forward cancellation', async t => {
  const original = globalThis.fetch;
  t.after(() => { globalThis.fetch = original; });
  const requests = [];
  globalThis.fetch = async (url, options) => {
    requests.push({ url, ...options, body: JSON.parse(options.body) });
    return Response.json({ model: 'returned-model', answers: { inc_I1: { status: 'assessed', evidence: 'Study', noul: 0.99 }, exc_E1: { status: 'assessed', evidence: 'Study', noul: 0.01 } }, usage: { input_tokens: 34 } });
  };
  const args = { article: { title: 'Study', abstract: 'Study abstract', keywords: [] },
    protocol: { inclusionCriteria: [{ id: 'I1', value: 'Matches topic' }], exclusionCriteria: [{ id: 'E1', value: 'Review article' }] },
    stage: 'filter1', signal: new AbortController().signal };
  const jev = await evaluateArticle({ ...args, settings: { apiKey: 'jev-only-key' } });
  const chatgpt = await evaluateArticle({ ...args, settings: { provider: 'chatgpt', chatgptModel: 'account-model', apiKey: 'jev-only-key' } });
  assert.equal(jev.suggestion.provider, 'jev'); assert.equal(chatgpt.suggestion.provider, 'chatgpt');
  assert.equal(chatgpt.suggestion.decision, 'included'); assert.equal(isAutoApplicable(chatgpt.suggestion, args.protocol, args.stage), true);
  assert.deepEqual(jev.suggestion.criteria, chatgpt.suggestion.criteria);
  assert.equal(requests[0].headers.Authorization, 'Bearer jev-only-key');
  assert.equal(requests[1].url, '/api/chatgpt/evaluate');
  assert.ok(!JSON.stringify(requests[1]).includes('jev-only-key'));
  assert.equal(requests[1].body.model, 'account-model'); assert.equal(requests[1].signal, args.signal);
  const noText = await evaluateArticle({ ...args, stage: 'filter2', settings: { provider: 'chatgpt', chatgptModel: 'account-model' } });
  assert.equal(noText.suggestion.decision, 'needs-text'); assert.equal(requests.length, 2);
});
