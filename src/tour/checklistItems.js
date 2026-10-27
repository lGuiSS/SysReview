// checklistItems.js - Itens do checklist de primeiros passos, derivados do estado do projeto

const filterDone = (stats) => stats.pending === 0 && stats.included + stats.excluded > 0;

export const buildChecklistItems = ({ protocolReady, articles, statistics, lastSaved }) => {
  const hasArticles = articles.length > 0;
  return [
    { key: 'protocol', section: 'protocol', done: protocolReady },
    { key: 'import', section: 'import', done: hasArticles },
    { key: 'dataprocessing', section: 'dataprocessing', done: hasArticles && statistics.dataProcessing.pending === 0 },
    { key: 'filter1', section: 'filter1', done: hasArticles && filterDone(statistics.filter1) },
    { key: 'filter2', section: 'filter2', done: hasArticles && filterDone(statistics.filter2) },
    { key: 'filter3', section: 'filter3', done: hasArticles && filterDone(statistics.filter3) },
    { key: 'save', done: !!lastSaved },
  ];
};
