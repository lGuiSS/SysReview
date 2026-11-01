import { withCurrentRules, isSuggestionStale, isAutoApplicable, hasActionableDecision } from './screening.js';
import { requiresReevaluation } from './modelCapabilities.js';

// UI grouping is independent of the human decision (pending/included/excluded).
export function aiReviewState(article, protocol, stage) {
  const suggestion = withCurrentRules(article.aiSuggestions?.[stage], protocol, stage);
  const attempt = article.aiEvaluationAttempts?.[stage];
  const error = attempt?.status === 'error' ? attempt : null;
  const reasons = [];
  if (!suggestion) reasons.push(error ? 'error' : 'not-evaluated');
  else if (isSuggestionStale(suggestion, protocol, stage, article.fullText?.sections ? article.fullText : null, article) || requiresReevaluation(suggestion)) reasons.push('outdated');
  else if (suggestion.invalidResponse) reasons.push('invalid');
  else if (suggestion.decision === 'needs-text') reasons.push('needs-text');
  else if (!hasActionableDecision(suggestion)) reasons.push('inconclusive');
  else if (!isAutoApplicable(suggestion, protocol, stage)) reasons.push('below-threshold');
  if (reasons.length) {
    if (error && !reasons.includes('error')) reasons.push('error');
    return { group: 'review', suggestion, reasons, error, warning: null };
  }
  // A failed retry never hides a previous valid suggestion that meets the rules.
  return { group: suggestion.decision, suggestion, reasons: [], error, warning: error ? 'previous-preserved' : null };
}
