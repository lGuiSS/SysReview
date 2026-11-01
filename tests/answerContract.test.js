import test from 'node:test';
import assert from 'node:assert/strict';
import { validateAnswers, answerSchema } from '../src/ai/answerContract.js';

const q = { exc_E5: { type: 'noul' } };
const validate = (answer, state = { title: 'Actual study' }) => validateAnswers({ exc_E5: answer }, q, { generative: true, state });

test('structured schema separates assessed values from null abstentions for probability and quality', () => {
  const schema = answerSchema({ ...q, q_Q1: { type: 'score' } });
  for (const [id, key, type, maximum] of [['exc_E5', 'noul', 'number', 1], ['q_Q1', 'score', 'integer', 2]]) {
    const [assessed, abstained] = schema.properties.answers.properties[id].anyOf;
    for (const branch of [assessed, abstained]) {
      assert.equal(branch.additionalProperties, false);
      assert.deepEqual(branch.required, ['status', key, 'evidence']);
    }
    assert.deepEqual(assessed.properties.status.enum, ['assessed']);
    assert.deepEqual(assessed.properties[key], { type, minimum: 0, maximum });
    assert.equal(assessed.properties.evidence.type, 'string');
    assert.deepEqual(abstained.properties.status.enum, ['insufficient-evidence']);
    assert.equal(abstained.properties[key].type, 'null');
    assert.equal(abstained.properties.evidence.type, 'null');
  }
});

test('unsupported quotes produce explicit idempotent abstention, never an invented probability', () => {
  const answers = validate({ status: 'assessed', noul: .99, evidence: 'Invented study' });
  assert.deepEqual(answers.exc_E5, { status: 'insufficient-evidence', noul: null, evidence: null, reason: 'evidence-not-found' });
  assert.deepEqual(validate(answers.exc_E5), answers);
  // A quote may not be manufactured by joining separate supplied fields.
  assert.equal(validate({ status: 'assessed', noul: .99, evidence: 'Actual study' }, { title: 'Actual', abstract: 'study' }).exc_E5.reason, 'evidence-not-found');
});

test('only typographic equivalents are accepted; paraphrases and omitted words require manual review', () => {
  const a = { status: 'assessed', noul: .9, evidence: 'The "study" investigates cafe\u0301 beams' };
  assert.equal(validate(a, { abstract: 'The “study” investigates café\nbeams.' }).exc_E5.noul, .9);
  for (const evidence of ['The study examines beams', 'The “study” ... beams']) {
    assert.equal(validate({ ...a, evidence }, { abstract: 'The “study” investigates café beams.' }).exc_E5.reason, 'evidence-not-found');
  }
});

test('malformed values still fail with actionable diagnostic reasons and no raw content', () => {
  const a = { status: 'assessed', noul: .9, evidence: 'Actual study' };
  for (const [answer, reason] of [[null, 'answer-shape'], [{ ...a, status: undefined }, 'answer-status'],
    [{ ...a, noul: '0.9' }, 'answer-value'], [{ ...a, noul: 2 }, 'answer-value'],
    [{ ...a, noul: null }, 'answer-value'], [{ ...a, evidence: '' }, 'evidence-shape'],
    [{ ...a, status: 'insufficient-evidence' }, 'abstention-shape']]) {
    assert.throws(() => validate(answer), error => error.code === 'response-invalid' && error.criterionId === 'exc_E5' && error.reason === reason && !error.message.includes('Actual study'));
  }
});
