// A small, pure domain reducer keeps articles and the undo record atomic.
export const emptyScoreZeroHistory = () => ({ version: 1, operation: null });
export const eligibleForScoreZero = (a, includeApproved) => a.score === 0 && !a.isDuplicate &&
  (a.dataProcessingStatus === 'pending' || (includeApproved && a.dataProcessingStatus === 'included'));
export const nextProcessingRevision = a => (Number.isSafeInteger(a.dataProcessingRevision) ? a.dataProcessingRevision : 0) + 1;

export const canRestoreScoreZero = (article, entry) => entry.state === 'available' && !!article &&
  article.dataProcessingStatus === 'excluded' && !article.isDuplicate &&
  article.dataProcessingRevision === entry.revision;

export function normalizeScoreZeroHistory(history) {
  const op = history?.version === 1 && history.operation;
  if (!op || typeof op.id !== 'string' || !Array.isArray(op.entries)) return emptyScoreZeroHistory();
  const seen = new Set();
  return { version: 1, operation: { ...op, entries: op.entries.filter(e => {
    if (!e || e.id == null || seen.has(e.id) || !['pending', 'included'].includes(e.previousStatus) ||
        e.appliedStatus !== 'excluded' || !Number.isSafeInteger(e.revision) || e.revision < 1 ||
        !['available', 'restored', 'invalidated'].includes(e.state)) return false;
    seen.add(e.id);
    return true;
  }) } };
}

export const initialArticleState = () => ({ articles: [], scoreZeroHistory: emptyScoreZeroHistory(), result: null });
export function articleReducer(state, action) {
  if (action.type === 'restore') return {
    articles: action.articles || [], scoreZeroHistory: normalizeScoreZeroHistory(action.history), result: null,
  };
  if (action.type === 'update') {
    const next = typeof action.update === 'function' ? action.update(state.articles) : action.update;
    const previous = new Map(state.articles.map(a => [a.id, a]));
    const articles = next.map(a => {
      const old = previous.get(a.id);
      if (!old || a === old) return a;
      const changed = ['dataProcessingStatus', 'isDuplicate', 'duplicateOf'].some(k => a[k] !== old[k]);
      return changed && a.dataProcessingRevision === old.dataProcessingRevision
        ? { ...a, dataProcessingRevision: nextProcessingRevision(old) } : a;
    });
    const byId = new Map(articles.map(a => [a.id, a]));
    const op = state.scoreZeroHistory.operation;
    const history = op ? { version: 1, operation: { ...op, entries: op.entries.map(e =>
      e.state === 'available' && !canRestoreScoreZero(byId.get(e.id), e)
        ? { ...e, state: 'invalidated', reason: byId.has(e.id) ? 'changed' : 'missing' } : e) } } : state.scoreZeroHistory;
    return { ...state, articles, scoreZeroHistory: history };
  }
  if (action.type === 'exclude-zero') {
    const entries = [];
    const articles = state.articles.map(a => {
      if (!eligibleForScoreZero(a, action.includeApproved)) return a;
      const revision = nextProcessingRevision(a);
      entries.push({ id: a.id, previousStatus: a.dataProcessingStatus, appliedStatus: 'excluded', revision, state: 'available' });
      return { ...a, dataProcessingStatus: 'excluded', dataProcessingRevision: revision, lastModified: action.at };
    });
    if (!entries.length) return state;
    return { articles, scoreZeroHistory: { version: 1, operation: {
      id: action.id, at: action.at, includeApproved: action.includeApproved, entries,
    } }, result: { type: 'excluded', count: entries.length } };
  }
  if (action.type === 'undo-zero') {
    const op = state.scoreZeroHistory.operation;
    if (!op || !op.entries.some(e => e.state === 'available')) return state;
    const byId = new Map(state.articles.map(a => [a.id, a]));
    const restored = new Map();
    const result = { type: 'restored', pending: 0, included: 0, skipped: 0 };
    const entries = op.entries.map(e => {
      if (e.state === 'restored') return e;
      const a = byId.get(e.id);
      if (!canRestoreScoreZero(a, e)) {
        result.skipped++;
        return { ...e, state: 'invalidated', reason: a ? 'changed' : 'missing' };
      }
      result[e.previousStatus]++;
      restored.set(e.id, { ...a, dataProcessingStatus: e.previousStatus,
        dataProcessingRevision: nextProcessingRevision(a), lastModified: action.at });
      return { ...e, state: 'restored' };
    });
    return { articles: state.articles.map(a => restored.get(a.id) || a),
      scoreZeroHistory: { version: 1, operation: { ...op, entries } }, result };
  }
  return state;
}
