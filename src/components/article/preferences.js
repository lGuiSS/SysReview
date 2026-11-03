// Preferências do detalhe do artigo (estilo, confirmação, destaque, texto).
// Ficam no navegador e no projeto (.srp); ao abrir um projeto, as dele prevalecem.

const KEY = 'sysreview-article-view';

export const DEFAULT_ARTICLE_VIEW = {
  layout: 'tabs',      // 'tabs' | 'split' | 'reading' | 'continuous'
  confirm: true,       // incluir/excluir pedem confirmação no rodapé
  highlight: false,    // destacar termos do protocolo
  marker: 'yellow',    // 'yellow' | 'indigo'
  autoAdvance: false,  // depois de decidir, vai para o próximo artigo
  textSize: 'normal',  // 'normal' | 'large' | 'xlarge'
};

const ALLOWED = {
  layout: ['tabs', 'split', 'reading', 'continuous'],
  confirm: [true, false],
  highlight: [true, false],
  marker: ['yellow', 'indigo'],
  autoAdvance: [false, true],
  textSize: ['normal', 'large', 'xlarge'],
};

export function normalizeArticleView(value) {
  const view = { ...DEFAULT_ARTICLE_VIEW };
  // Nome antigo do estilo de página única
  if (value?.layout === 'classic') value = { ...value, layout: 'continuous' };
  if (value && typeof value === 'object') {
    for (const key of Object.keys(ALLOWED)) {
      if (ALLOWED[key].includes(value[key])) view[key] = value[key];
    }
  }
  return view;
}

// O projeto prevalece; sem preferências no projeto, vale o navegador
export const resolveArticleView = (projectView) =>
  (projectView && typeof projectView === 'object' ? normalizeArticleView(projectView) : loadArticleView());

export function loadArticleView() {
  try {
    return normalizeArticleView(JSON.parse(localStorage.getItem(KEY) || 'null'));
  } catch {
    return { ...DEFAULT_ARTICLE_VIEW };
  }
}

export function saveArticleView(view) {
  try {
    localStorage.setItem(KEY, JSON.stringify(normalizeArticleView(view)));
  } catch {
    // sem armazenamento (aba privada, bloqueio): vale só nesta sessão
  }
}
