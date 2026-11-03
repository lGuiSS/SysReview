// Constantes e funções do detalhe do artigo (fora dos componentes para o Fast Refresh)

export const STATUS_BADGES = {
  included: { label: 'modals.article.statusIncluded', cls: 'bg-green-100 dark:bg-green-900/50 text-green-800 dark:text-green-300' },
  excluded: { label: 'modals.article.statusExcluded', cls: 'bg-red-100 dark:bg-red-900/50 text-red-800 dark:text-red-300' },
  duplicate: { label: 'modals.article.statusDuplicate', cls: 'bg-slate-200 dark:bg-slate-700 text-slate-800 dark:text-slate-200' },
  pending: { label: 'modals.article.statusPending', cls: 'bg-amber-100 dark:bg-amber-900/50 text-amber-800 dark:text-amber-300' },
};

// Tamanho do texto de leitura (resumo, critérios, respostas)
export const TEXT_SIZES = {
  normal: { body: 'text-[15px]', item: 'text-sm', option: 'text-[13px]' },
  large: { body: 'text-[17px]', item: 'text-base', option: 'text-sm' },
  xlarge: { body: 'text-[19px]', item: 'text-lg', option: 'text-base' },
};

export const STAGE_LABEL = {
  dataProcessingStatus: 'nav.dataprocessing',
  filter1Status: 'nav.filter1',
  filter2Status: 'nav.filter2',
  filter3Status: 'nav.filter3',
};

export const isExtractionAnswered = (item) => {
  const response = item?.response;
  return Array.isArray(response) ? response.length > 0 : !!String(response ?? '').trim();
};

// Respostas de extração alinhadas aos critérios do protocolo (mesmo formato do modal de extração)
export const initialExtractionValues = (criteria, saved) => criteria.map(criterion => {
  const previous = saved?.find(v => v.id === criterion.id);
  return {
    id: criterion.id,
    label: criterion.value,
    type: criterion.type,
    response: previous?.response ?? (criterion.type === 'text' ? '' : []),
  };
});

// Teclas de atalho só valem fora de campos de texto
export const isEditableTarget = (el) => el instanceof HTMLElement &&
  (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName) && !['checkbox', 'radio'].includes(el.type));
