import test from 'node:test';
import assert from 'node:assert/strict';
import { articleReducer as reduce, initialArticleState, normalizeScoreZeroHistory, nextProcessingRevision } from '../src/scoreZeroHistory.js';
import { autoSaveToFile, loadProjectFromFile, setupAutoSave, loadAutoSave } from '../src/fileSystem.js';

const article = (id, status = 'pending', score = 0) => ({ id, score, dataProcessingStatus: status,
  isDuplicate: false, duplicateOf: null, inclusionCriterion: ['I1'], exclusionCriterion: ['E1'],
  qualityCriteria: ['Q1'], filter1Status: 'included', aiSuggestions: { filter1: {} },
  fullText: { sections: { methods: 'Current methods' } }, extractionCriteria: { data: 'value' } });
const state = articles => reduce(initialArticleState(), { type: 'restore', articles });
const exclude = (s, includeApproved = false) => reduce(s, { type: 'exclude-zero', id: 'batch1', at: '2026-10-28', includeApproved });
const undo = s => reduce(s, { type: 'undo-zero', at: '2026-10-29' });
const update = (s, fn) => reduce(s, { type: 'update', update: fn });

test('strict numeric eligibility; preexisting exclusions and duplicates remain identical', () => {
  const input = [article('pending'), article('approved', 'included'), article('excluded', 'excluded'),
    article('duplicate', 'duplicate'), { ...article('flagged'), isDuplicate: true },
    ...[undefined, null, '0', 1, 0.001].map((score, i) => article(`score${i}`, 'pending', score))];
  input[5].score = undefined;
  const output = exclude(state(input));
  assert.equal(output.scoreZeroHistory.operation.entries.length, 1);
  assert.equal(output.articles[0].dataProcessingStatus, 'excluded');
  input.slice(1).forEach((a, i) => assert.equal(output.articles[i + 1], a));
});
test('mixed statuses restore individually and preserve all unrelated fields and references', () => {
  const input = [article('a'), article('b', 'included'), article('c', 'excluded')];
  const output = undo(exclude(state(input), true));
  assert.deepEqual(output.result, { type: 'restored', pending: 1, included: 1, skipped: 0 });
  for (let i = 0; i < 2; i++) {
    const { lastModified, dataProcessingRevision, ...rest } = output.articles[i];
    assert.equal(lastModified, '2026-10-29'); assert.equal(dataProcessingRevision, 2);
    assert.deepEqual(rest, input[i]);
  }
  assert.equal(output.articles[2], input[2]);
  assert.equal(undo(output), output);
});
test('later bibliographic, filter and score edits survive undo; imports remain', () => {
  let s = exclude(state([article('a')]));
  s = update(s, articles => [...articles.map(a => ({ ...a, title: 'Edited', score: 10, filter2Status: 'included' })), article('new')]);
  const output = undo(s);
  assert.equal(output.articles[0].title, 'Edited'); assert.equal(output.articles[0].score, 10);
  assert.equal(output.articles[0].filter2Status, 'included'); assert.equal(output.articles[0].dataProcessingStatus, 'pending');
  assert.equal(output.articles[1], s.articles[1]);
});
test('manual repeat, include/exclude cycle, duplication and missing records do not get overwritten', () => {
  let s = exclude(state(['repeat', 'cycle', 'duplicate', 'missing', 'valid'].map(id => article(id))));
  s = update(s, list => list.filter(a => a.id !== 'missing').map(a =>
    a.id === 'repeat' ? { ...a, dataProcessingRevision: nextProcessingRevision(a) } :
      a.id === 'cycle' ? { ...a, dataProcessingStatus: 'included' } :
        a.id === 'duplicate' ? { ...a, dataProcessingStatus: 'duplicate', isDuplicate: true } : a));
  s = update(s, list => list.map(a => a.id === 'cycle' ? { ...a, dataProcessingStatus: 'excluded' } : a));
  const output = undo(s);
  assert.deepEqual(output.result, { type: 'restored', pending: 1, included: 0, skipped: 4 });
  assert.equal(output.articles[0], s.articles[0]); assert.equal(output.articles[1], s.articles[1]);
  assert.equal(output.articles[2], s.articles[2]);
});
test('no-op exclusion preserves undo, repeated actions are pure and new effective batch replaces it', () => {
  const original = state([article('a')]); const first = exclude(original);
  assert.deepEqual(exclude(original), first); assert.equal(exclude(first), first);
  const added = update(first, list => [...list, article('b', 'included')]);
  assert.equal(exclude(added), added);
  const second = exclude(added, true);
  assert.deepEqual(second.scoreZeroHistory.operation.entries.map(e => e.id), ['b']);
});
test('old projects, malformed history and replacing a project never invent undo', () => {
  assert.equal(normalizeScoreZeroHistory({ version: 999 }).operation, null);
  const s = exclude(state([article('same-id')]));
  const other = reduce(s, { type: 'restore', articles: [article('same-id', 'excluded')] });
  assert.equal(undo(other), other);
  assert.equal(normalizeScoreZeroHistory({ version: 1, operation: { id: 'x', entries: [null, {}, { id: 'x', revision: -1 }] } }).operation.entries.length, 0);
});
test('file autosave serializes history and articles together; reopen retains undo', async t => {
  const original = globalThis.FileReader;
  t.after(() => { globalThis.FileReader = original; });
  globalThis.FileReader = class {
    async readAsText(file) {
      this.onload({ target: { result: await file.text() } });
    }
  };
  const s = exclude(state([article('a'), article('b', 'included')]), true);
  s.articles[0].aiSuggestions = { filter1: { provider: 'gemini', adapterVersion: 2, requestedEffort: 'low', decision: 'uncertain', exclusion: { E4: null }, unassessed: [{ id: 'E4', category: 'exclusion', reason: 'evidence-not-found' }] } };
  s.articles[0].aiEvaluationAttempts = { filter1: { status: 'error', code: 'response-invalid', criterionId: 'inc_I1', reason: 'answer-value' } };
  s.articles[0].aiDecisionRevisions = { filter1: 3 };
  let serialized;
  const handle = { createWritable: async () => ({ write: async text => { serialized = text; }, close: async () => {} }) };
  const result = await autoSaveToFile({ ...s, protocol: { title: 'Test' }, statistics: {} }, handle);
  assert.equal(result.success, true);
  const file = { name: 'test.srp', text: async () => serialized };
  const opened = await loadProjectFromFile(file);
  assert.equal(opened.success, true);
  assert.equal(opened.data.version, '1.5.0');
  assert.deepEqual(opened.data.articles[0].aiSuggestions, s.articles[0].aiSuggestions);
  assert.deepEqual(opened.data.articles[0].aiEvaluationAttempts, s.articles[0].aiEvaluationAttempts);
  assert.deepEqual(opened.data.articles[0].aiDecisionRevisions, s.articles[0].aiDecisionRevisions);
  const restored = reduce(s, { type: 'restore', articles: opened.data.articles, history: opened.data.scoreZeroHistory });
  assert.equal(undo(restored).result.included, 1);
  const legacy = JSON.parse(serialized); legacy.version = '1.3.0'; delete legacy.scoreZeroHistory;
  const old = await loadProjectFromFile({ name: 'old.srp', text: async () => JSON.stringify(legacy) });
  assert.equal(old.success, true); assert.equal(old.data.scoreZeroHistory.operation, null);
});

test('local autosave recovery keeps the latest articles and history together', t => {
  const originalInterval = globalThis.setInterval, originalStorage = globalThis.localStorage;
  t.after(() => { globalThis.setInterval = originalInterval; globalThis.localStorage = originalStorage; });
  let tick, stored;
  globalThis.setInterval = callback => { tick = callback; return 123; };
  globalThis.localStorage = { setItem: (key, value) => { stored = value; }, getItem: () => stored };
  let current = { ...state([article('a')]), protocol: { title: 'Local backup' } };
  setupAutoSave(() => current);
  current = { ...current, ...exclude(current) };
  tick();
  const recovered = loadAutoSave();
  assert.equal(recovered.success, true);
  const restored = reduce(initialArticleState(), { type: 'restore', articles: recovered.data.articles, history: recovered.data.scoreZeroHistory });
  assert.equal(undo(restored).result.pending, 1);
});
