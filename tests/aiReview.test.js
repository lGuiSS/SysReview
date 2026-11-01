import test from 'node:test';
import assert from 'node:assert/strict';
import { aiReviewState } from '../src/ai/review.js';
import { criteriaHash, inputHash } from '../src/ai/screening.js';

const protocol = { inclusionCriteria: [{ id: 'I1', value: 'Timber' }], exclusionCriteria: [{ id: 'E1', value: 'Other materials' }] };
const article = { id: 'a', title: 'Timber study', keywords: [], abstract: 'Bending study', dataProcessingStatus: 'included', filter1Status: 'pending' };
const suggestion = extra => ({ provider: 'chatgpt', adapterVersion: 2, criteriaHash: criteriaHash(protocol, 'filter1'), inputHash: inputHash(article, 'filter1'),
  textHash: null, inclusion: { I1: .99 }, exclusion: { E1: .01 }, ...extra });
const record = (s, attempt) => ({ ...article, ...(s ? { aiSuggestions: { filter1: s } } : {}),
  ...(attempt ? { aiEvaluationAttempts: { filter1: attempt } } : {}) });
const state = a => aiReviewState(a, protocol, 'filter1');
const failed = { status: 'error', code: 'response-invalid', reason: 'json-syntax' };

test('manual review combines unassessed articles, missing text, failed attempts and inconclusive assessments', () => {
  for (const [a, reason] of [
    [record(), 'not-evaluated'],
    [record(null, failed), 'error'],
    [record(suggestion({ decision: 'needs-text', inclusion: undefined, exclusion: undefined })), 'needs-text'],
    [record(suggestion({ inclusion: { I1: .1 } })), 'inconclusive'],
  ]) {
    const result = state(a);
    assert.equal(result.group, 'review'); assert.deepEqual(result.reasons, [reason]);
  }
});

test('invalid, outdated and below-threshold suggestions go to manual review with the specific reason', () => {
  const invalid = record(suggestion({ inclusion: { I1: 'bad' } }));
  const outdated = { ...record(suggestion()), title: 'Edited title' };
  const legacy = record(suggestion({ adapterVersion: 1 }));
  const below = record(suggestion({ exclusion: { E1: .54 } }));
  for (const [a, reason] of [[invalid, 'invalid'], [outdated, 'outdated'], [legacy, 'outdated'], [below, 'below-threshold']]) {
    assert.equal(state(a).group, 'review'); assert.ok(state(a).reasons.includes(reason));
  }
});

test('failed retries preserve valid include/exclude groups and show a separate warning', () => {
  for (const extra of [{}, { exclusion: { E1: .99 } }]) {
    const result = state(record(suggestion(extra), failed));
    assert.equal(result.group, extra.exclusion ? 'excluded' : 'included');
    assert.deepEqual(result.reasons, []); assert.equal(result.warning, 'previous-preserved');
    assert.equal(result.error, failed);
  }
});

test('failure with an unusable previous suggestion still belongs in manual review', () => {
  const result = state(record(suggestion({ exclusion: { E1: .54 } }), failed));
  assert.equal(result.group, 'review'); assert.deepEqual(result.reasons, ['below-threshold', 'error']);
  assert.equal(result.warning, null);
});

test('human decisions do not cause valid AI suggestions to be classified as manual review', () => {
  for (const status of ['pending', 'included', 'excluded']) {
    const a = { ...record(suggestion()), filter1Status: status };
    const before = structuredClone(a);
    assert.equal(state(a).group, 'included'); assert.deepEqual(a, before);
  }
});

test('pending exclusion checks alone do not hide an otherwise applicable suggestion', () => {
  const p = { ...protocol, exclusionCriteria: [...protocol.exclusionCriteria, { id: 'E4', value: 'Full text unavailable' }] };
  const a = record(suggestion({ criteriaHash: criteriaHash(p, 'filter1'), exclusion: { E1: .01, E4: null }, unassessed: [{ id: 'E4', category: 'exclusion' }] }));
  assert.equal(aiReviewState(a, p, 'filter1').group, 'included');
  assert.equal(aiReviewState({ ...a, aiSuggestions: { filter1: { ...a.aiSuggestions.filter1, exclusion: { E1: .99, E4: null } } } }, p, 'filter1').group, 'excluded');
});
