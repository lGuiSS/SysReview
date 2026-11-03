// Regras para gravar o status de um artigo em uma etapa (tratamento ou filtros)
import { nextProcessingRevision } from './scoreZeroHistory.js';

export const STATUS_FIELD_STAGE = {
  filter1Status: 'filter1',
  filter2Status: 'filter2',
  filter3Status: 'filter3',
};

// Etapas seguintes, zeradas quando o artigo sai da etapa atual (excluído ou duplicata)
export const DOWNSTREAM_FIELDS = {
  dataProcessingStatus: ['filter1Status', 'filter2Status', 'filter3Status'],
  filter1Status: ['filter2Status', 'filter3Status'],
  filter2Status: ['filter3Status'],
};

export function applyStatusChange(article, statusType, status, criterion = null, source = 'user', at = new Date().toISOString()) {
  let base = status !== 'extracted'
    ? { ...article, [statusType]: status, lastModified: at } :
    { ...article, lastModified: at };
  if (statusType === 'dataProcessingStatus') base.dataProcessingRevision = nextProcessingRevision(article);

  // Origem da decisão por filtro (manual, sugestão aceita ou aplicada em lote)
  const stage = STATUS_FIELD_STAGE[statusType];
  if (stage) base.aiDecisionRevisions = { ...article.aiDecisionRevisions, [stage]: (article.aiDecisionRevisions?.[stage] || 0) + 1 };
  if (stage && status !== 'extracted') {
    const { [stage]: _previous, ...otherSources } = article.decisionSource ?? {};
    base = {
      ...base,
      decisionSource: status === 'included' || status === 'excluded'
        ? { ...otherSources, [stage]: source }
        : otherSources,
    };
  }

  // Cascade reset — apenas atualiza o campo de status
  if (status === null) return base;

  // Extração
  if (status === 'extracted') {
    return { ...base, extractionCriteria: criterion };
  }

  // Duplicata
  if (status === 'duplicate') {
    return { ...base, isDuplicate: true };
  }

  // included / excluded — processa critérios
  const criteria = (Array.isArray(criterion) ? criterion : [criterion]).filter(Boolean);
  const byCat = (cat) => criteria.filter(c => c.category === cat);

  return {
    ...base,
    isDuplicate: false,
    inclusionCriterion: byCat('inclusion'),
    exclusionCriterion: byCat('exclusion'),
    qualityCriteria: byCat('quality'),
  };
}

// Decisão completa: o status da etapa e, ao excluir ou marcar duplicata, o reset das etapas seguintes
export function applyDecision(article, statusType, status, criterion = null, source = 'user', at = new Date().toISOString()) {
  const decided = applyStatusChange(article, statusType, status, criterion, source, at);
  const resets = status === 'excluded' || status === 'duplicate' ? DOWNSTREAM_FIELDS[statusType] ?? [] : [];
  return resets.reduce((acc, field) => applyStatusChange(acc, field, null, null, 'user', at), decided);
}
