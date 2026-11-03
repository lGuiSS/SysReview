// Histórico de decisões da sessão (incluir/excluir/duplicata) para desfazer.
// Guarda os campos de decisão antes e depois; só desfaz se o artigo ainda estiver como a decisão deixou.

export const DECISION_FIELDS = [
  'dataProcessingStatus', 'filter1Status', 'filter2Status', 'filter3Status', 'isDuplicate',
  'inclusionCriterion', 'exclusionCriterion', 'qualityCriteria', 'decisionSource',
];
export const DECISION_HISTORY_LIMIT = 20;

const MISSING = { missing: true };
const pick = (article) => Object.fromEntries(DECISION_FIELDS.map(f => [f, f in article ? article[f] : MISSING]));
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

export const emptyDecisionHistory = () => [];

// Nova entrada no topo; sem mudança nos campos de decisão, nada é registrado
export function recordDecision(history, before, after, meta) {
  if (!before || !after) return history;
  const entry = { ...meta, articleId: after.id, before: pick(before), after: pick(after), state: 'available' };
  if (same(entry.before, entry.after)) return history;
  return [entry, ...history].slice(0, DECISION_HISTORY_LIMIT);
}

export const canUndoDecision = (entry, article) =>
  !!entry && entry.state === 'available' && !!article && same(pick(article), entry.after);

// Artigo com os campos de decisão de antes (os demais campos ficam como estão)
export function restoreDecisionFields(article, entry) {
  const restored = { ...article };
  for (const [field, value] of Object.entries(entry.before)) {
    if (value && value.missing === true) delete restored[field];
    else restored[field] = value;
  }
  return restored;
}

export const markDecision = (history, entryId, state) =>
  history.map(e => (e.id === entryId ? { ...e, state } : e));
