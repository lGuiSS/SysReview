import test from 'node:test';
import assert from 'node:assert/strict';
import { highlightSegments, foundTerms, matchOptions } from '../src/components/article/highlight.js';

const marked = (text, terms, options) => highlightSegments(text, terms, options).filter(s => s.match).map(s => s.text);

test('exact match (default): case-insensitive, whole words only', () => {
  assert.deepEqual(marked('CLT panels and clt slabs; ACLT and CLTs are not marked', ['CLT']), ['CLT', 'clt']);
});

test('without exact match, terms are found inside words (like the score)', () => {
  assert.deepEqual(marked('Timber floors and a floor', ['floor'], { wholeWord: false }), ['floor', 'floor']);
  assert.deepEqual(marked('Timber floors and a floor', ['floor'], { wholeWord: true }), ['floor']);
});

test('case sensitivity follows the scoring option', () => {
  assert.deepEqual(marked('CLT and clt', ['CLT'], { caseInsensitive: false }), ['CLT']);
});

test('longer terms win over shorter overlapping ones', () => {
  assert.deepEqual(marked('reinforced with FRP reinforcement', ['reinforced', 'Reinforcement', 'FRP']),
    ['reinforced', 'FRP', 'reinforcement']);
  assert.deepEqual(marked('Cross Laminated Timber (CLT)', ['Cross Laminated Timber', 'Timber', 'CLT']),
    ['Cross Laminated Timber', 'CLT']);
});

test('segments rebuild the original text exactly', () => {
  const text = 'A bending test on CLT, with (special) chars [x] and accents: ação.';
  const segments = highlightSegments(text, ['bending', 'CLT', '(special)', 'ação']);
  assert.equal(segments.map(s => s.text).join(''), text);
  assert.deepEqual(segments.filter(s => s.match).map(s => s.text), ['bending', 'CLT', '(special)', 'ação']);
});

test('empty or missing input is safe', () => {
  assert.deepEqual(highlightSegments('', ['x']), [{ text: '', match: false }]);
  assert.deepEqual(highlightSegments(null, ['x']), [{ text: '', match: false }]);
  assert.deepEqual(highlightSegments('text', ['', '  ']), [{ text: 'text', match: false }]);
  assert.deepEqual(highlightSegments('text', undefined), [{ text: 'text', match: false }]);
});

test('foundTerms lists protocol terms present in any text, in protocol order', () => {
  const terms = ['Cross Laminated Timber', 'CLT', 'FRP', 'bending', 'Slab'];
  assert.deepEqual(foundTerms(['Cross laminated timber panels', 'A bending test on clt'], terms),
    ['Cross Laminated Timber', 'CLT', 'bending']);
  assert.deepEqual(foundTerms(['slabs'], terms, { wholeWord: false }), ['Slab']);
  assert.deepEqual(foundTerms([null, ''], terms), []);
});

test('matchOptions reads the scoring system with safe defaults', () => {
  assert.deepEqual(matchOptions({ exactMatch: false, caseInsensitive: true }), { wholeWord: false, caseInsensitive: true });
  assert.deepEqual(matchOptions(undefined), { wholeWord: true, caseInsensitive: true });
});
