// messages.js - Textos de interface derivados das sugestões e erros do Jev

import { suggestionProbability } from './screening.js';

export const DECISION_LABEL_KEY = {
  included: 'assist.suggestInclude',
  excluded: 'assist.suggestExclude',
  uncertain: 'assist.suggestUncertain',
  'needs-text': 'assist.needsText',
};

export const jevErrorMessage = (t, error) => {
  switch (error?.code) {
    case 'network': return t('assist.errorNetwork');
    case 'auth': return t('assist.errorAuth');
    case 'rate-limit': return t('assist.errorRateLimit');
    case 'no-key': return t('assist.errorNoKey');
    default: return t('assist.errorApi', { error: error?.message || String(error) });
  }
};

export const suggestionTooltip = (t, suggestion, stale) => {
  const parts = [t(DECISION_LABEL_KEY[suggestion.decision] ?? DECISION_LABEL_KEY.uncertain)];
  const probability = suggestionProbability(suggestion);
  if (probability !== null) {
    parts.push(t('assist.probability', { value: Math.round(probability * 100) }));
  }
  if (suggestion.criteria?.length) parts.push(suggestion.criteria.map(c => c.id).join(', '));
  if (stale) parts.push(t('assist.stale'));
  return parts.join(' · ');
};
