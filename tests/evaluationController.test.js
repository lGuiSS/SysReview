import test from 'node:test';
import assert from 'node:assert/strict';
import { createEvaluationController } from '../src/ai/evaluationController.js';
import { criteriaHash, inputHash, isAutoApplicable, isSuggestionStale, withCurrentRules, evaluateArticle, buildQuestions, decide, getAiConfig, hasActionableDecision } from '../src/ai/screening.js';
import { mergeEvaluationEntries, applyAiSuggestions } from '../src/ai/evaluationState.js';
import { validateAnswers, answerSchema } from '../src/ai/answerContract.js';
import { effortOptions, reasoningParameters } from '../src/ai/modelCapabilities.js';
import fs from 'node:fs';
import { setImmediate } from 'node:timers';

const protocol = { inclusionCriteria: [{ id: 'I1', value: 'CLT with FRP' }], exclusionCriteria: [{ id: 'E1', value: 'Other materials' }] };
const article = id => ({ id, title: 'CLT with FRP', abstract: 'Bending study', keywords: [], dataProcessingStatus: 'included', filter1Status: 'pending', filter2Status: 'pending', filter3Status: 'pending' });
const suggestion = (decision = 'included') => ({ provider: 'jev', model: 'jev-1.13.0', criteriaHash: criteriaHash(protocol, 'filter1'), textHash: null,
  decision, probability: .99, confidence: .98, inclusion: { I1: .99 }, exclusion: { E1: .01 }, criteria: [] });
const result = () => ({ suggestion: suggestion(), usage: { input_tokens: 20 } });
const prepare = (controller, articles = [article('a')], extra = {}) => controller.prepare({ articles, protocol, stage: 'filter1', sectionTitle: 'Filter 1', settings: { provider: 'jev', concurrency: 1 }, ...extra });
const turn = () => new Promise(resolve => setImmediate(resolve));

test('minimize/expand and double start share one immutable queue and commit once', async () => {
  let complete, calls = 0; const entries = [], usage = [];
  const settings = { provider: 'jev', concurrency: 1 }, copy = structuredClone(protocol);
  const controller = createEvaluationController({ onResults: (...args) => entries.push(args), onUsage: u => usage.push(u), flushMs: 100_000,
    evaluate: async args => { calls++; assert.equal(args.protocol.inclusionCriteria[0].value, 'CLT with FRP'); assert.equal(args.settings.concurrency, 1); return new Promise(resolve => { complete = resolve; }); } });
  await prepare(controller, [article('a')], { settings, protocol: copy });
  const id = controller.getSnapshot().id;
  copy.inclusionCriteria[0].value = 'Changed'; settings.concurrency = 16;
  const running = controller.start(); const second = controller.start();
  controller.minimize(); assert.equal(controller.getSnapshot().minimized, true);
  controller.expand(); controller.minimize();
  await prepare(controller, [article('other')]);
  assert.equal(controller.getSnapshot().id, id);
  complete(result()); await Promise.all([running, second]);
  assert.equal(calls, 1); assert.equal(entries.length, 1); assert.equal(usage.length, 1);
  assert.equal(controller.getSnapshot().phase, 'done'); assert.equal(controller.getSnapshot().counts.included, 1);
  assert.equal(controller.getSnapshot().processed, 1); assert.equal(controller.getSnapshot().inputTokens, 20);
});

test('changing project or connection fences late results and usage, including equal article IDs', async () => {
  let complete, writes = 0;
  const controller = createEvaluationController({ onResults: () => writes++, onUsage: () => writes++,
    connection: async () => ({ connected: true, connectionId: 'connection-a' }),
    evaluate: () => new Promise(resolve => { complete = resolve; }) });
  await prepare(controller, [article('same')], { settings: { provider: 'chatgpt', chatgptModel: 'gpt-6-luna' } });
  const running = controller.start(); controller.connectionChanged('chatgpt', 'connection-b');
  complete(result()); await running; assert.equal(writes, 0); assert.equal(controller.getSnapshot().phase, 'stopped');
  await prepare(controller); const second = controller.start();
  controller.resetProject(); complete(result()); await second;
  assert.equal(writes, 0); assert.equal(controller.getSnapshot(), null); assert.equal(controller.session, 1);
});

test('errors stay distinct, counts conserve population, retries select only failures', async () => {
  const writes = []; let failing = true; const visited = [];
  const controller = createEvaluationController({ onResults: (stage, entries) => writes.push(...entries), evaluate: async ({ article: a }) => {
    visited.push(a.id);
    if (a.id === 'bad' && failing) throw Object.assign(new Error('invalid'), { code: 'response-invalid', criterionId: 'inc_I1', reason: 'answer-value' });
    return result();
  } });
  await prepare(controller, [article('good'), article('bad')]); await controller.start();
  const job = controller.getSnapshot();
  assert.equal(job.counts.error, 1); assert.equal(job.counts.included, 1); assert.equal(job.processed, 2);
  assert.equal(Object.values(job.counts).reduce((a, b) => a + b), job.total);
  assert.equal(writes.find(e => e.id === 'bad').suggestion, undefined);
  assert.equal(writes.find(e => e.id === 'bad').attempt.reason, 'answer-value');
  failing = false; await controller.retryErrors(); await controller.start();
  assert.deepEqual(visited, ['good', 'bad', 'bad']); assert.equal(controller.getSnapshot().counts.error, 0);
});

test('stop flushes completed items once and discards unfinished responses', async () => {
  let complete; const entries = [], usage = [];
  const controller = createEvaluationController({ onResults: (s, e) => entries.push(...e), onUsage: u => usage.push(u), flushMs: 100_000,
    evaluate: async ({ article: a }) => a.id === 'a' ? result() : new Promise(resolve => { complete = resolve; }) });
  await prepare(controller, [article('a'), article('b'), article('c')]); const run = controller.start();
  await turn(); controller.stop(); complete(result()); await run;
  assert.deepEqual(entries.map(e => e.id), ['a']); assert.equal(usage.length, 1);
  assert.equal(controller.getSnapshot().counts.cancelled, 2); assert.equal(controller.getSnapshot().counts.included, 1);
});

test('exhausted quota stops new work instead of flooding the rest of the batch', async () => {
  let calls = 0;
  const controller = createEvaluationController({ evaluate: async () => { calls++; throw Object.assign(new Error('Quota'), { code: 'rate-limit', status: 429 }); } });
  await prepare(controller, [article('a'), article('b'), article('c')]); await controller.start();
  assert.equal(calls, 1); assert.equal(controller.getSnapshot().phase, 'stopped'); assert.equal(controller.getSnapshot().counts.error, 1); assert.equal(controller.getSnapshot().counts.cancelled, 2);
});

test('resume keeps completed work and metrics, ignores late cancelled workers and double clicks', async () => {
  let oldComplete, newComplete; const writes = [], usage = [], visited = [];
  const controller = createEvaluationController({ onResults: (s, e) => writes.push(...e), onUsage: u => usage.push(u), flushMs: 100_000,
    evaluate: async ({ article: a }) => {
      visited.push(a.id);
      if (a.id === 'b' && visited.filter(id => id === 'b').length === 1) return new Promise(resolve => { oldComplete = resolve; });
      if (a.id === 'b') return new Promise(resolve => { newComplete = resolve; });
      return result();
    } });
  await prepare(controller, [article('a'), article('b'), article('c')]);
  const firstRun = controller.start(); await turn(); controller.stop();
  assert.equal(writes.length, 1); assert.equal(controller.getSnapshot().counts.cancelled, 2);
  const resume = controller.resume(); controller.resume();
  await turn();
  oldComplete({ suggestion: suggestion('excluded'), usage: { input_tokens: 999 } }); await firstRun;
  assert.equal(controller.getSnapshot().phase, 'running');
  newComplete(result()); await resume;
  assert.deepEqual(visited, ['a', 'b', 'b', 'c']);
  assert.deepEqual(writes.map(e => e.id), ['a', 'b', 'c']);
  assert.equal(controller.getSnapshot().counts.included, 3);
  assert.equal(controller.getSnapshot().counts.cancelled, 0);
  assert.equal(controller.getSnapshot().processed, 3);
  assert.equal(controller.getSnapshot().requests, 3); assert.equal(controller.getSnapshot().inputTokens, 60);
  assert.equal(usage.reduce((n, u) => n + u.requests, 0), 3);
});

test('retrying errors preserves interrupted items for later resume and never requeues completed work', async () => {
  let interrupted, fail = true; const visited = [];
  const controller = createEvaluationController({ evaluate: async ({ article: a }) => {
    visited.push(a.id);
    if (a.id === 'bad' && fail) throw Object.assign(new Error('Invalid'), { code: 'response-invalid' });
    if (a.id === 'unfinished' && fail) return new Promise(resolve => { interrupted = resolve; });
    return result();
  } });
  await prepare(controller, [article('good'), article('bad'), article('unfinished')]);
  const first = controller.start(); await turn(); controller.stop();
  fail = false; await controller.retryErrors(); controller.setReevaluate(true); await controller.start();
  assert.equal(controller.getSnapshot().total, 3); assert.equal(controller.getSnapshot().counts.cancelled, 1);
  await controller.resume(); interrupted(result()); await first;
  assert.deepEqual(visited, ['good', 'bad', 'unfinished', 'bad', 'unfinished']);
  assert.equal(controller.getSnapshot().processed, 3);
  assert.equal(controller.getSnapshot().counts.included, 3);
});

test('resume rechecks OAuth connection and project reset fences pending authentication', async () => {
  let connected = true, selectedId = 'first', pending, calls = 0; const connections = [];
  const controller = createEvaluationController({ connection: async () => {
    if (pending) return pending;
    return { connected, connectionId: selectedId };
  }, evaluate: async ({ settings }) => { calls++; connections.push(settings.connectionId); return result(); } });
  await prepare(controller, [article('a')], { settings: { provider: 'chatgpt', chatgptModel: 'gpt-6-luna' } });
  controller.stop(); connected = false; await controller.resume();
  assert.equal(calls, 0); assert.equal(controller.getSnapshot().error.code, 'ai-auth');
  assert.equal(controller.getSnapshot().counts.cancelled, 1);
  connected = true; selectedId = 'new'; await controller.resume();
  assert.deepEqual(connections, ['new']);
  await prepare(controller, [article('b')], { settings: { provider: 'chatgpt' } }); controller.stop();
  let authenticate; pending = new Promise(resolve => { authenticate = resolve; });
  const resumed = controller.resume(); controller.resetProject(); authenticate({ connected: true, connectionId: 'late' }); await resumed;
  assert.equal(controller.getSnapshot(), null); assert.equal(calls, 1);
});

test('failed reevaluation preserves previous suggestion; later manual decisions prevent replacement and application', () => {
  const original = { ...article('a'), aiSuggestions: { filter1: suggestion() }, inclusionCriterion: ['human-criterion'] };
  const failed = mergeEvaluationEntries([original], 'filter1', [{ id: 'a', attempt: { status: 'error', code: 'response-invalid' } }])[0];
  assert.equal(failed.aiSuggestions.filter1, original.aiSuggestions.filter1);
  const human = { ...original, aiDecisionRevisions: { filter1: 2 } };
  const merged = mergeEvaluationEntries([human], 'filter1', [{ id: 'a', suggestion: { ...suggestion(), probability: .3 },
    attempt: { status: 'success' }, expected: { decisionRevision: 0, processingRevision: 0 } }])[0];
  assert.equal(merged.aiSuggestions.filter1, original.aiSuggestions.filter1); assert.equal(merged.aiEvaluationAttempts.filter1.status, 'superseded');
  assert.equal(applyAiSuggestions([human], protocol, 'filter1', [original], 'auto', 'now')[0], human);
  const edited = { ...original, title: 'Edited title', aiSuggestions: { filter1: { ...suggestion() } } };
  assert.equal(applyAiSuggestions([edited], protocol, 'filter1', [original], 'auto', 'now')[0], edited);
  const applied = applyAiSuggestions([original], protocol, 'filter1', [original], 'auto', 'now')[0];
  assert.equal(applied.filter1Status, 'included'); assert.equal(applied.decisionSource.filter1, 'jev-auto');
  assert.equal(applyAiSuggestions([applied], protocol, 'filter1', [original], 'auto', 'now')[0], applied);
});

test('F1 inclusion with pending E4 qualifies for confirmed batch application; null is not 50%', async t => {
  const previous = globalThis.fetch; t.after(() => { globalThis.fetch = previous; });
  const p = { ...protocol, exclusionCriteria: [{ id: 'E4', value: 'Unable to access full text' }] };
  globalThis.fetch = async () => Response.json({ model: 'gpt-6-luna', answers: {
    inc_I1: { status: 'assessed', noul: .99, evidence: 'CLT with FRP' },
    exc_E4: { status: 'insufficient-evidence', noul: null, evidence: null },
  }, usage: { input_tokens: 20 } });
  const { suggestion: s } = await evaluateArticle({ article: article('a'), protocol: p, stage: 'filter1', settings: { provider: 'chatgpt', chatgptModel: 'gpt-6-luna' } });
  assert.equal(s.decision, 'included'); assert.equal(s.provisionalInclusion, true); assert.equal(s.exclusion.E4, null); assert.equal(s.unassessed[0].id, 'E4');
  assert.equal(withCurrentRules(s, p, 'filter1').decision, 'included'); assert.equal(isAutoApplicable(s, p, 'filter1'), true);
  const a = { ...article('a'), aiSuggestions: { filter1: s } };
  assert.equal(applyAiSuggestions([a], p, 'filter1', [a], 'accepted', 'now')[0].filter1Status, 'included');
  assert.equal(applyAiSuggestions([a], p, 'filter1', [a], 'auto', 'now')[0].filter1Status, 'included');
  const human = { ...a, filter1Status: 'excluded' };
  assert.equal(applyAiSuggestions([human], p, 'filter1', [human], 'accepted', 'now')[0], human);
  const raw = { inc_I1: { noul: .99 } };
  const { index } = buildQuestions(p, 'filter1');
  assert.throws(() => decide(raw, index, 'filter1', getAiConfig(p)), /Invalid answer/);
});

test('schema requires every criterion; no silent numeric coercion or invented evidence', () => {
  const q = { inc_I1: { type: 'noul' } }, state = { title: 'Actual study' };
  assert.deepEqual(answerSchema(q).properties.answers.required, ['inc_I1']);
  for (const a of [null, {}, { status: 'assessed', noul: '0.99', evidence: 'Actual study' },
    { status: 'assessed', noul: .99, evidence: null },
    { status: 'insufficient-evidence', noul: .5, evidence: null }]) assert.throws(() => validateAnswers({ inc_I1: a }, q, { generative: true, state }));
});

test('assessed exclusion outweighs unknown E4/E5; acceptance is explicit and records only assessed criteria', () => {
  const p = { ...protocol, exclusionCriteria: ['E1', 'E4', 'E5'].map(id => ({ id, value: id })) };
  for (const stage of ['filter1', 'filter2', 'filter3']) {
    const { index } = buildQuestions(p, stage);
    const result = decide({ inc_I1: { noul: 0 }, exc_E1: { noul: .99 },
      exc_E4: { status: 'insufficient-evidence', noul: null }, exc_E5: { status: 'insufficient-evidence', noul: null } }, index, stage, getAiConfig(p));
    assert.equal(result.decision, 'excluded'); assert.equal(result.probability, .99);
    assert.deepEqual(result.criteria.map(c => c.id), ['E1']);
    assert.deepEqual(result.unassessed.map(c => c.id), ['E4', 'E5']);
    assert.equal(result.exclusion.E4, null); assert.equal(result.relevance, null);
    const s = { ...result, provider: 'chatgpt', adapterVersion: 2, criteriaHash: criteriaHash(p, stage), textHash: null };
    assert.equal(withCurrentRules(s, p, stage).decision, 'excluded');
    assert.equal(hasActionableDecision(s), true); assert.equal(isAutoApplicable(s, p, stage), true);
    const a = { ...article('a'), filter1Status: stage === 'filter1' ? 'pending' : 'included', filter2Status: stage === 'filter3' ? 'included' : 'pending', aiSuggestions: { [stage]: s } };
    assert.equal(applyAiSuggestions([a], p, stage, [a], 'auto', 'now')[0][`${stage}Status`], 'excluded');
    const accepted = applyAiSuggestions([a], p, stage, [a], 'accepted', 'now')[0];
    assert.equal(accepted[`${stage}Status`], 'excluded');
    assert.deepEqual(accepted.exclusionCriterion.map(c => c.id), ['E1']);
    const human = { ...a, [stage + 'Status']: 'included' };
    assert.equal(applyAiSuggestions([human], p, stage, [human], 'accepted', 'now')[0], human);
  }
});

test('unknown criteria remain unknown; later stages, missing inclusion and low inclusion stay manual', () => {
  const p = { ...protocol, exclusionCriteria: [{ id: 'E4', value: 'Access to full text' }] };
  const { index } = buildQuestions(p, 'filter1');
  for (const [stage, inc] of [['filter1', 0], ['filter2', .99], ['filter3', .99]]) {
    const result = decide({ inc_I1: { noul: inc }, exc_E4: { status: 'insufficient-evidence', noul: null } }, index, stage, getAiConfig(p));
    assert.equal(result.decision, 'uncertain'); assert.equal(result.probability, null);
    assert.equal(hasActionableDecision(result), false); assert.deepEqual(result.criteria, []);
  }
  assert.equal(hasActionableDecision({ decision: 'excluded', exclusion: { E4: null }, unassessed: [{ id: 'E4' }] }), false);
  assert.equal(hasActionableDecision({ decision: 'included', unassessed: [{ id: 'E4' }] }), false);
  const missingInclusion = decide({ inc_I1: { status: 'insufficient-evidence', noul: null }, exc_E4: { noul: .01 } }, index, 'filter1', getAiConfig(p));
  assert.equal(missingInclusion.decision, 'uncertain'); assert.equal(hasActionableDecision(missingInclusion), false);
});

test('F1 screenshot case suggests inclusion at 96% with E4 still unverified and respects thresholds', () => {
  const p = { ...protocol, exclusionCriteria: ['E1', 'E2', 'E3', 'E4', 'E5'].map(id => ({ id, value: id })) };
  const { index } = buildQuestions(p, 'filter1');
  const answers = { inc_I1: { noul: .96 }, exc_E1: { noul: .01 }, exc_E2: { noul: .01 }, exc_E3: { noul: .02 },
    exc_E4: { status: 'insufficient-evidence', noul: null }, exc_E5: { noul: .01 } };
  const s = decide(answers, index, 'filter1', getAiConfig(p));
  assert.equal(s.decision, 'included'); assert.equal(s.probability, .96); assert.equal(s.exclusion.E4, null);
  assert.equal(s.provisionalInclusion, true); assert.equal(hasActionableDecision(s), true);
  assert.deepEqual(s.criteria.map(c => c.id), ['I1']); assert.equal(isAutoApplicable(s, p, 'filter1'), true);
  const changedRule = getAiConfig({ ...p, aiConfig: { rules: { filter1: { includeAt: .98 } } } });
  assert.equal(decide(answers, index, 'filter1', changedRule).decision, 'uncertain');
  const excluded = decide({ ...answers, exc_E3: { noul: .99 } }, index, 'filter1', getAiConfig(p));
  assert.equal(excluded.decision, 'excluded'); assert.equal(excluded.provisionalInclusion, false);
});

test('unverifiable E5 quote discards its probability and requires manual review through recalculation', async t => {
  const previous = globalThis.fetch; t.after(() => { globalThis.fetch = previous; });
  const p = { ...protocol, exclusionCriteria: [{ id: 'E5', value: 'Conference proceedings' }] };
  globalThis.fetch = async () => Response.json({ model: 'gpt-6-luna', answers: {
    inc_I1: { status: 'assessed', noul: .99, evidence: 'CLT with FRP' },
    exc_E5: { status: 'assessed', noul: .99, evidence: 'This study is conference proceedings' },
  } });
  const { suggestion: s } = await evaluateArticle({ article: article('a'), protocol: p, stage: 'filter1', settings: { provider: 'chatgpt', chatgptModel: 'gpt-6-luna' } });
  assert.equal(s.decision, 'uncertain'); assert.equal(s.probability, null); assert.equal(s.exclusion.E5, null);
  assert.equal(s.inclusion.I1, .99); assert.equal(s.unassessed[0].reason, 'evidence-not-found');
  const recalculated = withCurrentRules(s, p, 'filter1');
  assert.equal(recalculated.unassessed[0].reason, 'evidence-not-found');
  assert.equal(isAutoApplicable(recalculated, p, 'filter1'), false);
  const a = { ...article('a'), aiSuggestions: { filter1: s } };
  assert.equal(applyAiSuggestions([a], p, 'filter1', [a], 'accepted', 'now')[0], a);
});

test('bibliographic edits during a job make its suggestion stale without overwriting the edit', () => {
  const a = article('a'), s = { ...suggestion(), inputHash: inputHash(a, 'filter1') };
  const edited = { ...a, abstract: 'New evidence added by the researcher' };
  const [merged] = mergeEvaluationEntries([edited], 'filter1', [{ id: 'a', suggestion: s, expected: { decisionRevision: 0, processingRevision: 0 } }]);
  assert.equal(merged.abstract, edited.abstract);
  assert.equal(isSuggestionStale(s, protocol, 'filter1', null, merged), true);
  assert.equal(applyAiSuggestions([merged], protocol, 'filter1', [merged], 'auto', 'now')[0], merged);
});

test('F2/F3 missing text does not make an API request; reuse is explicit and effort/model are frozen', async () => {
  const writes = [];
  const controller = createEvaluationController({ onResults: (s, e) => writes.push(...e) });
  const a = { ...article('a'), filter1Status: 'included', filter2Status: 'pending' };
  await controller.prepare({ articles: [a], protocol, stage: 'filter2', sectionTitle: 'Filter 2', settings: { provider: 'jev' } });
  await controller.start(); assert.equal(controller.getSnapshot().counts['needs-text'], 1);
  assert.equal(writes[0].suggestion.decision, 'needs-text'); assert.equal(controller.getSnapshot().requests, 0);
  let observed;
  const reuse = createEvaluationController({ evaluate: async args => { observed = args.settings; return result(); } });
  const saved = { ...article('old'), aiSuggestions: { filter1: suggestion() } };
  await prepare(reuse, [saved]); assert.equal(reuse.getSnapshot().counts.reused, 1);
  reuse.setReevaluate(true); assert.equal(reuse.getSnapshot().counts.queued, 1); await reuse.start(); assert.equal(observed.provider, 'jev');
});

test('effort is model-specific, default omits parameter and unsupported choices fail', () => {
  assert.ok(effortOptions('chatgpt', 'gpt-6-luna').includes('none'));
  assert.ok(!effortOptions('chatgpt', 'gpt-6.1-sol').includes('none'));
  assert.deepEqual(effortOptions('chatgpt', 'unknown'), ['default']);
  assert.deepEqual(reasoningParameters('chatgpt', 'gpt-6-luna'), {});
  assert.deepEqual(reasoningParameters('chatgpt', 'gpt-6-luna', 'low'), { reasoning: { effort: 'low' } });
  assert.throws(() => reasoningParameters('jev', 'jev-1.13.0', 'low'));
});

test('saved benchmark suggestions are not reclassified; historical GPT cannot be applied without reevaluation', () => {
  const files = fs.readdirSync('.');
  for (const suffix of ['benchmark_r1_gpt.srp', 'benchmark_r1_jev.srp']) {
    const file = files.find(n => n.endsWith(suffix)); assert.ok(file);
    const data = JSON.parse(fs.readFileSync(file, 'utf8'));
    let count = 0;
    for (const a of data.articles) {
      const s = a.aiSuggestions?.filter1; if (!s) continue;
      const current = withCurrentRules(s, data.protocol, 'filter1');
      assert.equal(current.decision, s.decision); count++;
      if (s.provider === 'chatgpt') assert.equal(isAutoApplicable(current, data.protocol, 'filter1'), false);
    }
    assert.equal(count, 1433);
  }
});

test('three consecutive response format errors stop the queue without failing every article', async () => {
  for (const reason of ['json-syntax', undefined]) {
  let calls = 0;
  const controller = createEvaluationController({ evaluate: async () => {
    calls++; throw Object.assign(new Error('Invalid JSON'), { code: 'response-invalid', reason });
  } });
  await prepare(controller, ['a', 'b', 'c', 'd', 'e'].map(article)); await controller.start();
  assert.equal(calls, 3); assert.equal(controller.getSnapshot().phase, 'stopped');
  assert.equal(controller.getSnapshot().error.code, 'response-format-repeated');
  assert.equal(controller.getSnapshot().counts.error, 3); assert.equal(controller.getSnapshot().counts.cancelled, 2);
  }
});

test('editing completed job rules refreshes eligibility without AI requests or decisions; active job stays frozen', async () => {
  let calls = 0, writes = 0;
  const controller = createEvaluationController({ evaluate: async () => { calls++; return { suggestion: { ...suggestion('excluded'), probability: .8, exclusion: { E1: .8 } } }; },
    onResults: (stage, entries) => { writes += entries.length; } });
  await prepare(controller);
  controller.refreshRules({ rules: { filter1: { excludeAt: .95 } } });
  await controller.start();
  assert.equal(controller.getSnapshot().applicable, 1);
  controller.refreshRules({ rules: { filter1: { excludeAt: .95 } } });
  assert.equal(controller.getSnapshot().applicable, 0);
  controller.refreshRules({ rules: { filter1: { excludeAt: .55 } } });
  assert.equal(controller.getSnapshot().applicable, 1);
  assert.equal(calls, 1); assert.equal(writes, 1); assert.equal(controller.getSnapshot().phase, 'done');
});

test('partial batch suggestions still respect thresholds, invalid responses and historical adapters', () => {
  const partial = { provider: 'chatgpt', adapterVersion: 2, decision: 'excluded', probability: .54,
    exclusion: { E1: .54, E4: null }, unassessed: [{ id: 'E4', category: 'exclusion' }] };
  assert.equal(isAutoApplicable(partial, protocol, 'filter1'), false);
  const eligible = { ...partial, probability: .55, exclusion: { E1: .55, E4: null } };
  assert.equal(isAutoApplicable(eligible, protocol, 'filter1'), true);
  assert.equal(isAutoApplicable({ ...eligible, invalidResponse: true }, protocol, 'filter1'), false);
  assert.equal(isAutoApplicable({ ...eligible, adapterVersion: 1 }, protocol, 'filter1'), false);
  assert.equal(isAutoApplicable({ ...eligible, decision: 'uncertain' }, protocol, 'filter1'), false);
  assert.equal(isAutoApplicable({ ...eligible, probability: .96 }, protocol, 'filter2'), true);
  assert.equal(isAutoApplicable({ ...eligible, probability: .96 }, protocol, 'filter3'), false);
});
