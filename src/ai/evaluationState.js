import { articleText, stageIsPending } from './evaluationController.js';
import { isSuggestionStale, isAutoApplicable, withCurrentRules, hasActionableDecision } from './screening.js';
import { requiresReevaluation } from './modelCapabilities.js';

export function mergeEvaluationEntries(articles, stage, entries) {
  const byId = new Map(entries.map(entry => [entry.id, entry]));
  return articles.map(article => {
    const entry = byId.get(article.id);
    if (!entry) return article;
    const expected = entry.expected;
    const changed = expected && (!stageIsPending(article, stage) ||
      (article.aiDecisionRevisions?.[stage] || 0) !== expected.decisionRevision ||
      (article.dataProcessingRevision || 0) !== expected.processingRevision);
    const attempt = changed ? { ...entry.attempt, status: 'superseded' } : entry.attempt;
    return { ...article,
      ...(entry.suggestion && !changed ? { aiSuggestions: { ...(article.aiSuggestions || {}), [stage]: entry.suggestion } } : {}),
      ...(attempt ? { aiEvaluationAttempts: { ...(article.aiEvaluationAttempts || {}), [stage]: attempt } } : {}),
    };
  });
}

export function applyAiSuggestions(articles, protocol, stage, candidates, mode, at) {
  const byId = new Map(candidates.map(a => [a.id, a]));
  return articles.map(article => {
    const candidate = byId.get(article.id);
    if (!candidate || !stageIsPending(article, stage) ||
      (candidate.aiDecisionRevisions?.[stage] || 0) !== (article.aiDecisionRevisions?.[stage] || 0) ||
      (candidate.dataProcessingRevision || 0) !== (article.dataProcessingRevision || 0) ||
      candidate.aiSuggestions?.[stage] !== article.aiSuggestions?.[stage]) return article;
    const suggestion = withCurrentRules(article.aiSuggestions?.[stage], protocol, stage);
    if (!hasActionableDecision(suggestion) || requiresReevaluation(suggestion) ||
      isSuggestionStale(suggestion, protocol, stage, articleText(article), article) ||
      (mode === 'auto' && !isAutoApplicable(suggestion, protocol, stage))) return article;
    const criteria = suggestion.criteria || [];
    const revisions = { ...article.aiDecisionRevisions, [stage]: (article.aiDecisionRevisions?.[stage] || 0) + 1 };
    const changes = {};
    const decisionSource = { ...article.decisionSource };
    if (suggestion.decision === 'excluded') {
      for (const downstream of ['filter2', 'filter3'].filter(s => s > stage)) {
        changes[`${downstream}Status`] = null;
        revisions[downstream] = (revisions[downstream] || 0) + 1;
        delete decisionSource[downstream];
      }
    }
    return { ...article, ...changes, [`${stage}Status`]: suggestion.decision, lastModified: at, aiDecisionRevisions: revisions,
      inclusionCriterion: criteria.filter(c => c.category === 'inclusion'), exclusionCriterion: criteria.filter(c => c.category === 'exclusion'),
      qualityCriteria: criteria.filter(c => c.category === 'quality'),
      decisionSource: { ...decisionSource, [stage]: `${suggestion.provider || 'jev'}-${mode === 'auto' ? 'auto' : 'accepted'}` } };
  });
}
