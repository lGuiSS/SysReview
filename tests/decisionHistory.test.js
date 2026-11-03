import test from 'node:test';
import assert from 'node:assert/strict';
import { articleReducer as reduce, initialArticleState } from '../src/scoreZeroHistory.js';
import { applyDecision, applyStatusChange } from '../src/articleStatus.js';
import { DECISION_HISTORY_LIMIT } from '../src/decisionHistory.js';

const I1 = { id: 'I1', category: 'inclusion' };
const E2 = { id: 'E2', category: 'exclusion' };
const article = (id, extra = {}) => ({
  id, title: `Artigo ${id}`, score: 5, dataProcessingStatus: 'included', isDuplicate: false,
  filter1Status: 'included', filter2Status: 'included', filter3Status: 'included',
  inclusionCriterion: [I1], exclusionCriterion: [], qualityCriteria: [],
  decisionSource: { filter1: 'user', filter2: 'ai', filter3: 'user' },
  aiDecisionRevisions: { filter1: 1, filter2: 1, filter3: 1 },
  aiSuggestions: { filter2: { decision: 'included' } }, extractionCriteria: [{ id: 'EX1', response: 'Sim' }],
  ...extra,
});
const state = articles => reduce(initialArticleState(), { type: 'restore', articles });
let n = 0;
const decide = (s, id, statusType, status, criterion = null) => reduce(s, {
  type: 'decision', id, entryId: `e${++n}`, at: `2026-11-03T10:00:${String(n).padStart(2, '0')}Z`,
  meta: { statusType, status },
  apply: a => applyDecision(a, statusType, status, criterion, 'user', '2026-11-03T10:00:00Z'),
});
const undo = (s, entryId) => reduce(s, { type: 'undo-decision', entryId, at: '2026-11-03T11:00:00Z' });
const decisionFields = a => {
  const { filter1Status, filter2Status, filter3Status, dataProcessingStatus, isDuplicate,
    inclusionCriterion, exclusionCriterion, qualityCriteria, decisionSource } = a;
  return { filter1Status, filter2Status, filter3Status, dataProcessingStatus, isDuplicate,
    inclusionCriterion, exclusionCriterion, qualityCriteria, decisionSource };
};

test('applyDecision equals the previous sequence of status updates (decision + downstream resets)', () => {
  const at = '2026-11-03T10:00:00Z';
  const a = article('a');
  const sequential = ['filter3Status'].reduce((acc, f) => applyStatusChange(acc, f, null, null, 'user', at),
    applyStatusChange(a, 'filter2Status', 'excluded', [E2], 'user', at));
  assert.deepEqual(applyDecision(a, 'filter2Status', 'excluded', [E2], 'user', at), sequential);
  assert.deepEqual(applyDecision(a, 'filter1Status', 'included', [I1], 'user', at),
    applyStatusChange(a, 'filter1Status', 'included', [I1], 'user', at));
});

test('excluding in filter 2 with filter 3 filled: undo restores filter 2, filter 3, criteria and sources', () => {
  const s0 = state([article('a'), article('b')]);
  const s1 = decide(s0, 'a', 'filter2Status', 'excluded', [E2]);
  const decided = s1.articles[0];
  assert.equal(decided.filter2Status, 'excluded');
  assert.equal(decided.filter3Status, null);
  assert.deepEqual(decided.exclusionCriterion, [E2]);
  assert.equal(s1.decisionHistory.length, 1);

  const s2 = undo(s1, s1.decisionHistory[0].id);
  assert.deepEqual(decisionFields(s2.articles[0]), decisionFields(s0.articles[0]));
  assert.equal(s2.decisionHistory[0].state, 'undone');
  assert.equal(s2.articles[1], s0.articles[1], 'other articles keep their references');
  // Fields outside the decision stay as they are
  assert.deepEqual(s2.articles[0].aiSuggestions, s0.articles[0].aiSuggestions);
  assert.deepEqual(s2.articles[0].extractionCriteria, s0.articles[0].extractionCriteria);
});

test('undo is blocked when the article changed after the decision (manual edit or AI batch)', () => {
  const s1 = decide(state([article('a')]), 'a', 'filter2Status', 'excluded', [E2]);
  const changed = reduce(s1, { type: 'update', update: list => list.map(a => ({ ...a, filter2Status: 'included' })) });
  const s2 = undo(changed, s1.decisionHistory[0].id);
  assert.equal(s2.articles[0], changed.articles[0], 'article is not touched');
  assert.equal(s2.decisionHistory[0].state, 'changed');
  assert.equal(undo(s2, s1.decisionHistory[0].id), s2, 'a blocked entry stays blocked');
});

test('changes outside the decision fields do not block undo and are preserved', () => {
  const s1 = decide(state([article('a')]), 'a', 'filter1Status', 'included', [I1]);
  const withSuggestion = reduce(s1, { type: 'update', update: list => list.map(a => ({ ...a, aiSuggestions: { filter1: { decision: 'excluded' } } })) });
  const s2 = undo(withSuggestion, s1.decisionHistory[0].id);
  assert.equal(s2.decisionHistory[0].state, 'undone');
  assert.deepEqual(s2.articles[0].aiSuggestions, { filter1: { decision: 'excluded' } });
});

test('sequential decisions undo independently, newest first in the list', () => {
  let s = state([article('a'), article('b', { filter1Status: 'pending' })]);
  s = decide(s, 'b', 'filter1Status', 'included', [I1]);
  s = decide(s, 'a', 'filter1Status', 'duplicate');
  assert.deepEqual(s.decisionHistory.map(e => e.articleId), ['a', 'b']);
  assert.equal(s.articles[0].isDuplicate, true);
  assert.equal(s.articles[0].filter2Status, null);

  s = undo(s, s.decisionHistory[0].id);
  assert.equal(s.articles[0].isDuplicate, false);
  assert.equal(s.articles[0].filter2Status, 'included');
  assert.equal(s.articles[1].filter1Status, 'included');

  s = undo(s, s.decisionHistory[1].id);
  assert.equal(s.articles[1].filter1Status, 'pending');
  assert.deepEqual(s.decisionHistory.map(e => e.state), ['undone', 'undone']);
});

test('the same article decided twice: undoing the older entry is blocked, the newer one works', () => {
  let s = state([article('a', { filter1Status: 'pending' })]);
  s = decide(s, 'a', 'filter1Status', 'included', [I1]);
  s = decide(s, 'a', 'filter1Status', 'excluded', [E2]);
  const [newer, older] = s.decisionHistory;
  const blocked = undo(s, older.id);
  assert.equal(blocked.articles[0].filter1Status, 'excluded');
  assert.equal(blocked.decisionHistory[1].state, 'changed');
  const back = undo(s, newer.id);
  assert.equal(back.articles[0].filter1Status, 'included');
});

test('undo bumps AI decision revisions of changed stages and the processing revision', () => {
  let s = state([article('a', { dataProcessingRevision: 3 })]);
  s = decide(s, 'a', 'dataProcessingStatus', 'excluded');
  const decided = s.articles[0];
  s = undo(s, s.decisionHistory[0].id);
  const restored = s.articles[0];
  assert.equal(restored.dataProcessingStatus, 'included');
  assert.ok(restored.dataProcessingRevision > decided.dataProcessingRevision);
  for (const stage of ['filter1', 'filter2', 'filter3']) {
    assert.ok(restored.aiDecisionRevisions[stage] > decided.aiDecisionRevisions[stage]);
  }
});

test('opening another project clears the history; missing articles cannot be undone', () => {
  const s1 = decide(state([article('a')]), 'a', 'filter1Status', 'excluded', [E2]);
  assert.deepEqual(reduce(s1, { type: 'restore', articles: [article('a')] }).decisionHistory, []);
  const removed = reduce(s1, { type: 'update', update: () => [] });
  assert.equal(undo(removed, s1.decisionHistory[0].id).decisionHistory[0].state, 'missing');
});

test('history keeps the latest entries only and ignores decisions that change nothing', () => {
  let s = state([article('a', { filter1Status: 'pending' })]);
  for (let i = 0; i < DECISION_HISTORY_LIMIT + 5; i++) {
    s = decide(s, 'a', 'filter1Status', i % 2 ? 'excluded' : 'included', i % 2 ? [E2] : [I1]);
  }
  assert.equal(s.decisionHistory.length, DECISION_HISTORY_LIMIT);
  const same = decide(s, 'a', 'filter1Status', s.articles[0].filter1Status, s.articles[0].filter1Status === 'excluded' ? [E2] : [I1]);
  assert.equal(same.decisionHistory.length, DECISION_HISTORY_LIMIT);
  assert.equal(same.decisionHistory[0], s.decisionHistory[0]);
});

test('score zero actions keep the decision history', () => {
  let s = state([article('a'), article('z', { score: 0, dataProcessingStatus: 'pending' })]);
  s = decide(s, 'a', 'filter1Status', 'excluded', [E2]);
  s = reduce(s, { type: 'exclude-zero', id: 'batch', at: '2026-11-03', includeApproved: false });
  assert.equal(s.decisionHistory.length, 1);
  s = reduce(s, { type: 'undo-zero', at: '2026-11-03' });
  assert.equal(s.decisionHistory.length, 1);
});
