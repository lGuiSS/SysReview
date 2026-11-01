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
    case 'response-invalid': {
      const base = error.criterionId && error.criterionId !== 'answers'
        ? t('assist.errorResponse', { criterion: error.criterionId.replace(/^(inc|exc|q)_/, '') })
        : t('assist.errorResponseGeneral');
      const reason = t(`assist.responseReason.${error.reason}`, { defaultValue: '' });
      return reason ? `${base} ${reason}` : base;
    }
    case 'response-format-repeated': return t('assist.errorRepeatedFormat');
    case 'refusal': return t('assist.errorRefusal');
    case 'response-incomplete': return t('assist.errorIncomplete');
    case 'timeout': return t('assist.errorTimeout');
    case 'permission': return t('assist.errorPermission');
    case 'effort': return t('assist.effortInvalid');
    case 'no-criteria': return t('assist.noCriteria');
    case 'ai-service': return t('assist.chatgptService');
    case 'connection-changed':
    case 'ai-auth': return t('assist.aiSignInAgain');
    case 'chatgpt-service': return t('assist.chatgptService');
    case 'chatgpt-auth': return t('assist.chatgptSignInAgain');
    case 'network': return t('assist.errorNetwork');
    case 'auth': return t('assist.errorAuth');
    case 'rate-limit': return t('assist.errorRateLimit');
    case 'no-key': return t('assist.errorNoKey');
    default: return t('assist.errorApi', { error: error?.message || (error?.httpStatus ? `HTTP ${error.httpStatus}` : error?.code || String(error)) });
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
