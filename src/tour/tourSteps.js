// tourSteps.js - Passos do tour guiado (âncoras em atributos data-tour)

const anchor = (name) => `[data-tour="${name}"]`;

const FILTERS = ['filter1', 'filter2', 'filter3'];

// Um passo por botão de ação do primeiro artigo; sem artigos na lista,
// volta para o topo da seção (`fallback`)
export const actionSteps = (section) => ['include', 'exclude', 'duplicate', 'details'].map(action => ({
  key: `action_${action}`,
  section,
  element: anchor(`action-${action}`),
  fallback: anchor(`section-${section}`),
  side: 'left',
}));

// Seções que só abrem com artigos importados: com artigos, o tour abre a seção;
// sem artigos, destaca o botão correspondente no menu
const articleSteps = (id, hasArticles) => {
  if (!hasArticles) return [{ key: id, element: anchor(`nav-${id}`), side: 'bottom', locked: true }];
  if (!FILTERS.includes(id)) return [{ key: id, section: id, element: anchor(`section-${id}`), side: 'bottom' }];
  const group = { key: id, section: id, element: anchor('article-actions'), fallback: anchor(`section-${id}`), side: 'left' };
  // Os botões são explicados um a um só no Filtro 1; nos demais, o grupo basta
  return id === 'filter1' ? [group, ...actionSteps(id)] : [group];
};

// side/align seguem a API do driver.js
export const buildTourSteps = ({ hasArticles }) => [
  { key: 'welcome' },
  { key: 'nav', element: anchor('nav'), side: 'bottom' },
  { key: 'overview', element: anchor('overview'), side: 'bottom' },
  { key: 'protocolBasic', section: 'protocol', element: anchor('protocol-basic'), side: 'right' },
  { key: 'protocolDatabases', section: 'protocol', element: anchor('protocol-databases'), side: 'right' },
  { key: 'protocolCriteria', section: 'protocol', element: anchor('protocol-criteria'), side: 'left' },
  { key: 'protocolScoring', section: 'protocol', element: anchor('protocol-scoring'), side: 'top' },
  { key: 'import', section: 'import', element: anchor('import-sources'), side: 'bottom' },
  ...['dataprocessing', ...FILTERS, 'statistics'].flatMap(id => articleSteps(id, hasArticles)),
  // Opções do cabeçalho ficam por último, antes do checklist
  { key: 'fileMenu', element: anchor('file-menu'), side: 'bottom' },
  { key: 'reminder', element: anchor('reminder'), side: 'bottom' },
  { key: 'assist', element: anchor('assist'), side: 'bottom' },
  { key: 'language', element: anchor('language'), side: 'bottom' },
  { key: 'support', element: anchor('support'), side: 'bottom' },
  { key: 'theme', element: anchor('theme'), side: 'bottom', align: 'end' },
  { key: 'guide', element: anchor('guide-button'), side: 'bottom' },
  { key: 'checklist', element: anchor('checklist'), side: 'top', align: 'end' },
];
