// reset-project.mjs - Gera uma cópia do projeto com os Filtros 1-3 zerados,
// para que a triagem possa ser refeita (pelo Jev ou manualmente) a partir do zero.
//
// Uso: node benchmark/reset-project.mjs <projeto.srp> [saida.srp]
//
// Mantém: protocolo (critérios idênticos), importações e o Tratamento de dados
// (duplicatas e artigos que seguiram para o Filtro 1).
// Zera: status dos Filtros 1, 2 e 3, critérios marcados, extração, sugestões
// e origem das decisões.

import fs from 'node:fs';
import path from 'node:path';

const [input, outputArg] = process.argv.slice(2);
if (!input) {
  console.error('Uso: node benchmark/reset-project.mjs <projeto.srp> [saida.srp]');
  process.exit(1);
}

const output = outputArg ?? path.join(
  path.dirname(input),
  `${path.basename(input, path.extname(input))}-benchmark.srp`
);

const data = JSON.parse(fs.readFileSync(input, 'utf8'));
const enteredFilter1 = (a) => a.dataProcessingStatus === 'included' && !a.isDuplicate;

let reset = 0;
const articles = data.articles.map(article => {
  if (!enteredFilter1(article)) return article;
  reset += 1;
  return {
    ...article,
    filter1Status: 'pending',
    filter2Status: 'pending',
    filter3Status: 'pending',
    inclusionCriterion: [],
    exclusionCriterion: [],
    qualityCriteria: [],
    extractionCriteria: [],
    aiSuggestions: {},
    decisionSource: {},
  };
});

const result = {
  ...data,
  articles,
  currentSection: 'filter1',
  metadata: {
    ...data.metadata,
    savedAt: new Date().toISOString(),
    resetFrom: path.basename(input),
  },
};

fs.writeFileSync(output, JSON.stringify(result, null, 2));
console.log(`${reset} artigos do Filtro 1 voltaram para "pendente".`);
console.log(`Arquivo gerado: ${output}`);
