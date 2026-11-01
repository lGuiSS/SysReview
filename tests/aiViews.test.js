import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import i18next from 'i18next';
import { I18nextProvider } from 'react-i18next';
import { createServer } from 'vite';
import react from '@vitejs/plugin-react';

test('PT/EN progress views and suggestion panels distinguish manual review, errors, missing evidence and legacy output', async t => {
  const vite = await createServer({ configFile: false, plugins: [react()], server: { middlewareMode: true, watch: null }, appType: 'custom', logLevel: 'silent' });
  t.after(() => vite.close());
  const { JevBatchModal, JevApplyModal } = await vite.ssrLoadModule('/src/components/JevBatchModal.jsx');
  const { JevSettingsModal } = await vite.ssrLoadModule('/src/components/JevSettingsModal.jsx');
  const { ArticleStatusFilter } = await vite.ssrLoadModule('/src/components/ArticleStatusFilter.jsx');
  const { SuggestionPanel, AiReviewNotice } = await vite.ssrLoadModule('/src/components/SuggestionPanel.jsx');
  const controller = Object.fromEntries(['expand', 'minimize', 'stop', 'start', 'resume', 'dismiss', 'retryErrors', 'setReevaluate'].map(k => [k, () => {}]));
  const base = { id: 'job', phase: 'running', minimized: false, stage: 'filter1', sectionTitle: 'Filter 1', provider: 'chatgpt', model: 'gpt-6-luna', effort: 'low', total: 4, processed: 2,
    counts: { included: 0, excluded: 0, uncertain: 1, 'needs-text': 0, error: 1, reused: 0, queued: 1, running: 1, cancelled: 0 },
    errors: [{ id: 'bad', title: 'Study', diagnostic: { code: 'response-invalid', criterionId: 'inc_I1', reason: 'answer-value' } }], requests: 1, inputTokens: 20 };
  for (const language of ['pt', 'en']) {
    const resources = JSON.parse(fs.readFileSync(`src/i18n/locales/${language}.json`, 'utf8'));
    const i18n = i18next.createInstance(); await i18n.init({ lng: language, resources: { [language]: { translation: resources } }, interpolation: { escapeValue: false } });
    const render = (component, props) => renderToStaticMarkup(React.createElement(I18nextProvider, { i18n }, React.createElement(component, props)));
    const statusSelect = render(ArticleStatusFilter, { value: 'suggest-review', onChange: () => {}, showAi: true });
    assert.equal((statusSelect.match(/<option /g) || []).length, 8);
    assert.ok(statusSelect.includes(resources.assist.filterManualReview));
    for (const oldValue of ['suggest-uncertain', 'suggest-needs-text', 'suggest-error', 'suggest-none']) assert.ok(!statusSelect.includes(`value="${oldValue}"`));
    assert.equal((render(ArticleStatusFilter, { value: 'all', onChange: () => {} }).match(/<option /g) || []).length, 5);
    const reviewNote = render(AiReviewNotice, { state: { group: 'review', reasons: ['needs-text'] } });
    assert.ok(reviewNote.includes(resources.assist.reviewReason['needs-text']));
    const preservedNote = render(AiReviewNotice, { state: { group: 'included', reasons: [], warning: 'previous-preserved' } });
    assert.ok(preservedNote.includes(resources.assist.reviewReason['previous-preserved']));
    assert.ok(!preservedNote.includes(resources.assist.filterManualReview));
    assert.equal(render(AiReviewNotice, { state: { group: 'excluded', reasons: [], warning: null } }), '');
    const full = render(JevBatchModal, { job: base, controller });
    assert.ok(full.includes(resources.assist.jobCount.uncertain)); assert.ok(full.includes(resources.assist.jobCount.error));
    assert.ok(full.includes(resources.assist.responseReason['answer-value']));
    assert.ok(full.includes('role="dialog"')); assert.ok(full.includes('aria-modal="true"'));
    assert.ok(full.includes(resources.assist.minimize)); assert.ok(full.includes(resources.assist.batchStop));
    assert.ok(full.includes('role="progressbar"')); assert.ok(full.includes('aria-valuenow="2"'));
    assert.ok(full.includes('aria-valuemax="4"')); assert.ok(full.includes('rounded-full overflow-hidden'));
    assert.ok(full.includes('width:50%')); assert.ok(full.includes('dark:bg-gray-700'));
    assert.ok(!full.includes(resources.assist.batchResume));
    const rule = { mode: 'inclusive', includeAt: 20, excludeAt: 55 };
    const editProps = { rule, onEditRules: () => {} };
    const completed = render(JevBatchModal, { job: { ...base, phase: 'done' }, controller, ...editProps });
    assert.ok(completed.includes(resources.assist.editRules));
    assert.ok(completed.includes(resources.assist.summaryInclude.replace('{{value}}', '20')));
    assert.ok(completed.includes(resources.assist.summaryExclude.replace('{{value}}', '55')));
    assert.ok(!render(JevBatchModal, { job: base, controller, ...editProps }).includes(resources.assist.editRules));
    const compactDone = render(JevBatchModal, { job: { ...base, phase: 'done', minimized: true }, controller, ...editProps });
    assert.ok(compactDone.includes(resources.assist.editRules));
    const preview = render(JevApplyModal, { sectionTitle: 'Filter 1', preview: { include: 0, exclude: 0, remaining: 4 }, onClose: () => {}, ...editProps });
    assert.ok(preview.includes(resources.assist.editRules));
    const rulesOnly = render(JevSettingsModal, { settings: { provider: 'chatgpt' }, aiConfig: {}, rulesOnly: true, onSaveRules: () => {}, onClose: () => {} });
    assert.ok(rulesOnly.includes(resources.assist.rulesNoReevaluation));
    assert.ok(rulesOnly.includes('value="55"')); assert.ok(rulesOnly.includes('for="ai-rule-f1Exclude"'));
    assert.ok(rulesOnly.includes('role="dialog"'));
    assert.ok(!rulesOnly.includes('disabled=""'));
    assert.ok(!rulesOnly.includes(resources.assist.chatgptContinue));
    assert.ok(!rulesOnly.includes(resources.assist.test));

    const stopped = { ...base, phase: 'stopped', counts: { ...base.counts, cancelled: 2, queued: 0, running: 0 } };
    for (const minimized of [false, true]) {
      assert.ok(render(JevBatchModal, { job: { ...stopped, minimized }, controller }).includes(resources.assist.batchResume));
    }
    assert.ok(!render(JevBatchModal, { job: { ...base, phase: 'done' }, controller }).includes(resources.assist.batchResume));
    const minimized = render(JevBatchModal, { job: { ...base, minimized: true }, controller });
    assert.ok(!minimized.includes('role="dialog"')); assert.ok(minimized.includes(resources.assist.expand));
    const uncertain = render(SuggestionPanel, { suggestion: { provider: 'chatgpt', adapterVersion: 2, decision: 'uncertain', exclusion: { E4: null }, unassessed: [{ id: 'E4', reason: 'evidence-not-found' }] },
      criteria: [], onAccept: () => {}, onEvaluate: () => {} });
    assert.ok(uncertain.includes(resources.assist.notVerified)); assert.ok(!uncertain.includes(resources.assist.accept));
    assert.ok(uncertain.includes(resources.assist.evidenceNotFound.replace('{{criteria}}', 'E4')));
    const partiallyAssessed = render(SuggestionPanel, { suggestion: { provider: 'chatgpt', adapterVersion: 2, decision: 'excluded', probability: .99,
      exclusion: { E1: .99, E4: null }, unassessed: [{ id: 'E4' }] }, criteria: [], onAccept: () => {}, onEvaluate: () => {} });
    assert.ok(partiallyAssessed.includes(resources.assist.suggestExclude)); assert.ok(partiallyAssessed.includes(resources.assist.accept));
    assert.ok(partiallyAssessed.includes(resources.assist.unassessedExcluded.replace('{{criteria}}', 'E4')));
    assert.ok(!partiallyAssessed.includes(resources.assist.unassessed.replace('{{criteria}}', 'E4')));
    const provisional = render(SuggestionPanel, { suggestion: { provider: 'chatgpt', adapterVersion: 2, decision: 'included', probability: .96, provisionalInclusion: true,
      inclusion: { I1: .96 }, exclusion: { E4: null }, unassessed: [{ id: 'E4', category: 'exclusion' }] }, criteria: [], onAccept: () => {}, onEvaluate: () => {} });
    assert.ok(provisional.includes(resources.assist.suggestInclude)); assert.ok(provisional.includes(resources.assist.accept));
    assert.ok(provisional.includes(resources.assist.unassessedIncluded.replace('{{criteria}}', 'E4')));
    assert.ok(provisional.includes(resources.assist.notVerified));
    const legacy = render(SuggestionPanel, { suggestion: { provider: 'chatgpt', decision: 'excluded', probability: .99 }, criteria: [], onAccept: () => {}, onEvaluate: () => {} });
    assert.ok(legacy.includes(resources.assist.legacySuggestion)); assert.ok(!legacy.includes(resources.assist.accept));
  }
});
