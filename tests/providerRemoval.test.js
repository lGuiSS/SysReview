import test from 'node:test';
import assert from 'node:assert/strict';
import { loadJevSettings } from '../src/ai/jevClient.js';
import { evaluateArticle, hasActionableDecision } from '../src/ai/screening.js';
import { requiresReevaluation } from '../src/ai/modelCapabilities.js';

test('settings for removed providers fall back to JEV while keeping supported settings', t => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  t.after(() => { if (previous) Object.defineProperty(globalThis, 'localStorage', previous); else delete globalThis.localStorage; });
  let saved = { provider: 'gemini', concurrency: 10, apiKey: 'local-test-key' };
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: () => JSON.stringify(saved) } });
  assert.equal(loadJevSettings().provider, 'jev');
  assert.equal(loadJevSettings().concurrency, 10); assert.equal(loadJevSettings().apiKey, 'local-test-key');
  saved = { provider: 'chatgpt', chatgptModel: 'gpt-6-luna', concurrency: 6 };
  assert.equal(loadJevSettings().provider, 'chatgpt'); assert.equal(loadJevSettings().concurrency, 6);
});

test('removed providers cannot infer or masquerade as JEV; historical suggestions require reevaluation', async t => {
  const previous = globalThis.fetch; t.after(() => { globalThis.fetch = previous; });
  globalThis.fetch = () => { throw new Error('Unexpected request'); };
  await assert.rejects(evaluateArticle({ article: { title: 'Study' }, protocol: {}, stage: 'filter1', settings: { provider: 'gemini' } }), e => e.code === 'provider-unsupported');
  const historical = { provider: 'gemini', adapterVersion: 2, decision: 'excluded', exclusion: { E1: .99 } };
  assert.equal(hasActionableDecision(historical), true);
  assert.equal(requiresReevaluation(historical), true);
  assert.equal(requiresReevaluation({ ...historical, provider: 'chatgpt' }), false);
});
