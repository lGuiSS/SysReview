// Destaque dos termos do protocolo no texto do artigo (função pura, sem React).
// Segue as mesmas regras da pontuação: palavra exata e maiúsculas conforme o sistema de pontuação.

const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const buildRegex = (terms, { wholeWord = true, caseInsensitive = true } = {}) => {
  const parts = [...new Set(terms.map(t => t?.trim()).filter(Boolean))]
    .sort((a, b) => b.length - a.length)
    .map(escape);
  if (!parts.length) return null;
  const body = `(?:${parts.join('|')})`;
  // Palavra exata: "CLT" não marca dentro de "CLTs" nem de "ACLT"
  const pattern = wholeWord ? `(?<![\\p{L}\\p{N}_])${body}(?![\\p{L}\\p{N}_])` : body;
  return new RegExp(pattern, `g${caseInsensitive ? 'i' : ''}u`);
};

// Trechos do texto: [{ text, match }]
export function highlightSegments(text, terms, options) {
  const source = text ?? '';
  const regex = buildRegex(terms ?? [], options);
  if (!regex || !source) return [{ text: source, match: false }];
  const segments = [];
  let last = 0;
  for (const m of source.matchAll(regex)) {
    if (m.index > last) segments.push({ text: source.slice(last, m.index), match: false });
    segments.push({ text: m[0], match: true });
    last = m.index + m[0].length;
  }
  if (last < source.length) segments.push({ text: source.slice(last), match: false });
  return segments;
}

// Termos do protocolo presentes em algum dos textos (na ordem do protocolo)
export function foundTerms(texts, terms, options) {
  const joined = texts.filter(Boolean).join('\n');
  return [...new Set((terms ?? []).map(t => t?.trim()).filter(Boolean))]
    .filter(term => buildRegex([term], options).test(joined));
}

// Opções a partir do sistema de pontuação do protocolo
export const matchOptions = (scoring) => ({
  wholeWord: scoring?.exactMatch ?? true,
  caseInsensitive: scoring?.caseInsensitive ?? true,
});
