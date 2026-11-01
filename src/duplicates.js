// Chaves usadas na detecção automática de duplicatas.
// Um registro é duplicata quando coincide com outro já importado pelo DOI
// OU pelo par título + sobrenome do primeiro autor.

const stripAccents = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '');

// DOIs não diferenciam maiúsculas de minúsculas.
// A Web of Science escapa o sublinhado no BibTeX ("\_15" em vez de "_15").
export const duplicateDoiKey = (article) =>
  article?.doi ? String(article.doi).replace(/\\_/g, '_').trim().toLowerCase() || null : null;

// Sobrenome do primeiro autor, sem acentos/pontuação.
// BibTeX (Scopus/WoS/ScienceDirect): "Sobrenome, Nome and ..."; PubMed: "Sobrenome, Nome; ..."
export const firstAuthorSurname = (authors) => {
  if (!authors || /^autor não informado$/i.test(String(authors).trim())) return '';
  const first = String(authors).split(/\s+and\s+|;/i)[0].trim();
  const surname = first.includes(',') ? first.split(',')[0] : first.split(/\s+/).pop();
  return stripAccents(surname || '').toLowerCase().replace(/[^a-z0-9]/g, '');
};

// Título (minúsculas, sem espaços nas pontas) + sobrenome do primeiro autor.
// Sem autor informado, usa apenas o título.
export const duplicateTitleKey = (article) => {
  const title = String(article?.title || '').toLowerCase().trim();
  const surname = firstAuthorSurname(article?.authors);
  return surname ? `${title}|${surname}` : title;
};
