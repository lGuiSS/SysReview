// Read-only analysis of saved suggestions. No API calls or project mutations.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { buildState, getAiConfig, withCurrentRules, isAutoApplicable } from '../src/ai/screening.js';

const names = fs.readdirSync('.');
const locate = suffix => {
  const matches = names.filter(n => n.endsWith(suffix));
  assert.equal(matches.length, 1, `Expected one file ending in ${suffix}`);
  return matches[0];
};
const inputFiles = { gpt: locate('benchmark_r1_gpt.srp'), jev: locate('benchmark_r1_jev.srp'), gold: locate('sistemática_r3.srp') };
const projects = Object.fromEntries(Object.entries(inputFiles).map(([k, name]) => [k, JSON.parse(fs.readFileSync(name, 'utf8').replace(/^\uFEFF/, ''))]));
const byId = Object.fromEntries(Object.entries(projects).map(([k, p]) => [k, new Map(p.articles.map(a => [a.id, a]))]));
const relevantProtocol = p => Object.fromEntries(['inclusionCriteria', 'exclusionCriteria', 'qualityCriteria'].map(k => [k, p.protocol[k]]));
assert.deepEqual(relevantProtocol(projects.gpt), relevantProtocol(projects.jev), 'Provider criteria differ');
assert.deepEqual(getAiConfig(projects.gpt.protocol).rules, getAiConfig(projects.jev.protocol).rules, 'Rules differ');
assert.equal(projects.gpt.articles.length, projects.jev.articles.length);
for (const a of projects.gpt.articles) {
  const b = byId.jev.get(a.id);
  assert.ok(b, `Missing JEV article ${a.id}`);
  assert.deepEqual(buildState(a, 'filter1'), buildState(b, 'filter1'), `Inputs differ for ${a.id}`);
  for (const key of ['dataProcessingStatus', 'filter1Status', 'filter2Status', 'filter3Status']) assert.equal(a[key], b[key], `${key} differs for ${a.id}`);
}
const gptIds = projects.gpt.articles.filter(a => a.aiSuggestions?.filter1).map(a => a.id);
const jevIds = projects.jev.articles.filter(a => a.aiSuggestions?.filter1).map(a => a.id);
assert.deepEqual([...gptIds].sort(), [...jevIds].sort(), 'Evaluated populations differ');
const ids = gptIds;
for (const id of ids) for (const provider of ['gpt', 'jev']) {
  assert.equal(byId[provider].get(id).filter1Status, 'pending', `Suggestion already applied for ${provider}/${id}`);
}
let goldValidated = true;
try {
  assert.deepEqual(relevantProtocol(projects.gpt), relevantProtocol(projects.gold));
  const eligibleGold = projects.gold.articles.filter(a => a.dataProcessingStatus === 'included' && !a.isDuplicate);
  assert.deepEqual(eligibleGold.map(a => a.id).sort(), [...ids].sort());
  for (const id of ids) {
    assert.deepEqual(buildState(byId.gpt.get(id), 'filter1'), buildState(byId.gold.get(id), 'filter1'));
    assert.ok(['included', 'excluded'].includes(byId.gold.get(id).filter1Status));
  }
} catch { goldValidated = false; }
const withoutE4 = p => ({ ...p, exclusionCriteria: p.exclusionCriteria.filter(c => c.id !== 'E4') });
const counter = values => Object.fromEntries([...new Set(values)].sort().map(v => [v, values.filter(x => x === v).length]));
const labels = ['included', 'excluded', 'uncertain', 'needs-text'];
const tally = () => Object.fromEntries(labels.map(k => [k, 0]));
const matrix = {};
const summaries = {};
const rows = [];
for (const id of ids) {
  const a = byId.gpt.get(id);
  const row = { id, title: a.title, doi: a.doi || '', score: a.score, manual: goldValidated ? byId.gold.get(id).filter1Status : null };
  for (const provider of ['gpt', 'jev']) {
    const article = byId[provider].get(id), protocol = projects[provider].protocol;
    const saved = article.aiSuggestions.filter1;
    const suggestion = withCurrentRules(saved, protocol, 'filter1');
    const cf = withCurrentRules(saved, withoutE4(protocol), 'filter1');
    const triggers = Object.entries(suggestion.exclusion || {}).filter(([, p]) => p >= 0.5).map(([key]) => key);
    row[provider] = { model: saved.model, evaluatedAt: saved.evaluatedAt, criteriaHash: saved.criteriaHash,
      decision: suggestion.decision, savedDecision: saved.decision, probability: suggestion.probability, confidence: suggestion.confidence,
      inclusion: saved.inclusion, exclusion: saved.exclusion, triggers,
      autoApplicable: isAutoApplicable(suggestion, protocol, 'filter1'),
      withoutE4: { decision: cf.decision, probability: cf.probability, autoApplicable: isAutoApplicable(cf, withoutE4(protocol), 'filter1') } };
  }
  matrix[row.jev.decision] ||= tally(); matrix[row.jev.decision][row.gpt.decision]++;
  rows.push(row);
}
for (const provider of ['gpt', 'jev']) {
  const s = rows.map(r => r[provider]);
  const manualMatrix = { included: tally(), excluded: tally() };
  if (goldValidated) for (const r of rows) manualMatrix[r.manual][r[provider].decision]++;
  const auto = s.filter(x => x.autoApplicable);
  const cfAuto = s.filter(x => x.withoutE4.autoApplicable);
  const histograms = {};
  for (const key of ['I1', 'E1', 'E2', 'E3', 'E4', 'E5']) {
    const values = s.map(x => key === 'I1' ? x.inclusion?.[key] : x.exclusion?.[key]).filter(Number.isFinite);
    assert.equal(values.length, ids.length, `Missing probabilities in ${provider}/${key}`);
    assert.ok(values.every(v => v >= 0 && v <= 1), `Invalid probabilities in ${provider}/${key}`);
    const sorted = [...values].sort((a, b) => a - b);
    histograms[key] = { count: values.length, min: sorted[0], max: sorted.at(-1), mean: values.reduce((a, b) => a + b, 0) / values.length,
      median: sorted[Math.floor(sorted.length / 2)], exact50: values.filter(p => p === 0.5).length,
      atLeast50: values.filter(p => p >= 0.5).length,
      distribution: counter(values) };
  }
  summaries[provider] = { model: counter(s.map(x => x.model)), decisions: counter(s.map(x => x.decision)),
    savedDecisionMismatches: s.filter(x => x.decision !== x.savedDecision).length,
    criteriaHashes: counter(s.map(x => x.criteriaHash)),
    autoDecisions: counter(auto.map(x => x.decision)), autoCount: auto.length, manualLeftAfterAuto: s.length - auto.length,
    exclusionTriggerCounts: counter(s.flatMap(x => x.triggers)),
    triggerCombinations: counter(s.filter(x => x.decision === 'excluded').map(x => x.triggers.join('+'))),
    solelyE4: s.filter(x => x.triggers.length === 1 && x.triggers[0] === 'E4').length,
    histograms, withoutE4Decisions: counter(s.map(x => x.withoutE4.decision)),
    withoutE4AutoDecisions: counter(cfAuto.map(x => x.withoutE4.decision)),
    inputTokens: projects[provider].protocol.aiConfig?.usage?.inputTokens,
    recordedRequests: projects[provider].protocol.aiConfig?.usage?.requests,
    manualMatrix: goldValidated ? manualMatrix : null,
    autoExcludedManualIncluded: goldValidated ? rows.filter(r => r.manual === 'included' && r[provider].decision === 'excluded' && r[provider].autoApplicable).length : null,
    withoutE4AutoExcludedManualIncluded: goldValidated ? rows.filter(r => r.manual === 'included' && r[provider].withoutE4.decision === 'excluded' && r[provider].withoutE4.autoApplicable).length : null,
    manualIncludedWithoutE4: goldValidated ? counter(rows.filter(r => r.manual === 'included').map(r => r[provider].withoutE4.decision)) : null,
    recordTimes: { first: s.map(x => x.evaluatedAt).sort()[0], last: s.map(x => x.evaluatedAt).sort().at(-1) },
  };
}
const manualIncluded = rows.filter(r => r.manual === 'included');
const details = { inputFiles, stage: 'filter1', population: ids.length, totalArticles: projects.gpt.articles.length,
  goldValidated, manualLabels: goldValidated ? counter(rows.map(r => r.manual)) : null, matrix, summaries,
  disagreements: rows.filter(r => r.gpt.decision !== r.jev.decision).length,
  manualSources: goldValidated ? counter(ids.map(id => JSON.stringify(byId.gold.get(id).decisionSource || {}))) : null,
  rows };
const pct = n => `${(n * 100 / ids.length).toFixed(2).replace('.', ',')}%`;
const n = (p, kind) => summaries[p].decisions[kind] || 0;
const autoN = (p, kind) => summaries[p].autoDecisions[kind] || 0;
const fmtP = v => v == null ? '—' : `${(v * 100).toFixed(1).replace('.', ',')}%`;
const examples = [...manualIncluded].sort((a, b) => b.gpt.inclusion.I1 - a.gpt.inclusion.I1 || b.jev.inclusion.I1 - a.jev.inclusion.I1).slice(0, 12);
const md = `# Comparação das avaliações salvas: GPT e JEV

Data da análise: 28/10/2026. Análise offline, sem novas chamadas às APIs e sem alterar os arquivos de projeto.

## Base comparável

- Arquivos: \`${inputFiles.gpt}\` e \`${inputFiles.jev}\`.
- Ambos contêm ${details.totalArticles} registros e sugestões do Filtro 1 para os mesmos **${ids.length} artigos**.
- IDs, campos efetivamente enviados (título, resumo, palavras-chave, ano, idioma e tipo), critérios e regras de decisão são iguais entre os dois projetos.
- Modelos identificados nas sugestões: GPT \`${Object.keys(summaries.gpt.model).join(', ')}\`; JEV \`${Object.keys(summaries.jev.model).join(', ')}\`. O campo genérico aiConfig.model do projeto GPT ainda identifica o JEV e não é a fonte usada para identificar o modelo da avaliação.
- Recalcular com as regras atuais reproduz as decisões salvas: divergências GPT ${summaries.gpt.savedDecisionMismatches}; JEV ${summaries.jev.savedDecisionMismatches}.
- Status dos artigos são iguais nos dois arquivos. Todos os ${ids.length} artigos avaliados continuam pendentes no Filtro 1; sugestões não representam exclusões aplicadas nem remoção física.
- Comparação suplementar com o arquivo local \`${inputFiles.gold}\`: ${goldValidated ? `validada contra os mesmos IDs, entradas e critérios; ${manualIncluded.length} inclusões e ${ids.length - manualIncluded.length} exclusões registradas no Filtro 1` : 'não validada; não calcular acurácia'}.

## Resultado principal

| Resultado | GPT | JEV |
| --- | ---: | ---: |
| Sugestão de incluir | ${n('gpt', 'included')} | ${n('jev', 'included')} |
| Sugestão de excluir | ${n('gpt', 'excluded')} | ${n('jev', 'excluded')} |
| Revisão manual / inconclusivo | ${n('gpt', 'uncertain')} | ${n('jev', 'uncertain')} |
| Sem texto | ${n('gpt', 'needs-text')} | ${n('jev', 'needs-text')} |
| Inclusões elegíveis à aplicação em lote | ${autoN('gpt', 'included')} | ${autoN('jev', 'included')} |
| Exclusões elegíveis à aplicação em lote | ${autoN('gpt', 'excluded')} | ${autoN('jev', 'excluded')} |
| Permaneceriam pendentes após aplicação em lote | ${summaries.gpt.manualLeftAfterAuto} | ${summaries.jev.manualLeftAfterAuto} |

Há ${details.disagreements} discordâncias (${pct(details.disagreements)}) nas decisões sugeridas. Elegível à aplicação é uma simulação das regras do aplicativo, não evidência de execução da aplicação.

### Matriz entre provedores

| JEV → GPT | Incluir | Excluir | Inconclusivo | Sem texto |
| --- | ---: | ---: | ---: | ---: |
${labels.map(label => `| ${label} | ${labels.map(k => matrix[label]?.[k] || 0).join(' | ')} |`).join('\n')}

## Diagnóstico do E4 e dos limiares

E4: “Pesquisas restritas, em que não foi possível ter acesso ao texto completo”. Os arquivos avaliam apenas título, palavras-chave e resumo, não uma tentativa real de acesso ao texto completo.

| Medida | GPT | JEV |
| --- | ---: | ---: |
| E4 exatamente 50% | ${summaries.gpt.histograms.E4.exact50} | ${summaries.jev.histograms.E4.exact50} |
| E4 >= 50% | ${summaries.gpt.histograms.E4.atLeast50} | ${summaries.jev.histograms.E4.atLeast50} |
| E4 é o único critério que dispara exclusão | ${summaries.gpt.solelyE4} | ${summaries.jev.solelyE4} |

O código sugere excluir se qualquer critério de exclusão tiver p >= 0,5. O prompt ChatGPT pede 0,5 quando faltam evidências. A combinação transforma dúvida em sugestão de exclusão; isso é uma incompatibilidade da integração, não evidência de que o artigo satisfaça o E4.

Para aplicação em lote, o Filtro 1 exige p >= 0,95 para excluir. Portanto, exclusão sugerida por p=0,5 não é automaticamente elegível em lote, embora o botão de aceitação individual permita aceitar a sugestão.

### Frequência de critérios que disparam exclusão (há sobreposição)

| Critério | GPT | JEV |
| --- | ---: | ---: |
${['E1', 'E2', 'E3', 'E4', 'E5'].map(k => `| ${k} | ${summaries.gpt.exclusionTriggerCounts[k] || 0} | ${summaries.jev.exclusionTriggerCounts[k] || 0} |`).join('\n')}

### Distribuição dos valores do GPT

${['I1', 'E1', 'E2', 'E3', 'E4', 'E5'].map(k => `- ${k}: ${Object.entries(summaries.gpt.histograms[k].distribution).sort(([a], [b]) => Number(a) - Number(b)).map(([p, count]) => `${fmtP(Number(p))}: ${count}`).join('; ')}.`).join('\n')}

Valores concentrados em poucos pontos não comprovam calibração. Não comparar probabilidades dos dois provedores como se fossem medidas calibradas equivalentes.

O GPT atribuiu E3 >= 50% a 1418 artigos; para 1238, E3 foi exatamente 99%. Entre os 36 incluídos na referência humana, E3 dispara exclusão em 25 pelo GPT e em 13 pelo JEV. Isso mostra que o E4 não explica sozinho o comportamento. É preciso revisar também a interpretação temática de I1/E3 e a adequação dos limiares às estimativas do GPT.

## Simulação diagnóstica: desconsiderar E4

Recalculada offline com as mesmas probabilidades, removendo apenas E4 da combinação de critérios. Não é nova avaliação do modelo, não altera arquivos e não autoriza dispensar a verificação real de acesso.

| Resultado sem E4 | GPT | JEV |
| --- | ---: | ---: |
${labels.map(k => `| ${k} | ${summaries.gpt.withoutE4Decisions[k] || 0} | ${summaries.jev.withoutE4Decisions[k] || 0} |`).join('\n')}

## Comparação com decisões humanas registradas

O arquivo suplementar fornece decisões humanas existentes; não foi realizada uma nova revisão independente de todos os resumos. Tratar seus rótulos como referência local de comparação, não como verdade clínica ou científica incontroversa. Resultados abaixo dependem da validação dessa referência: ${goldValidated}.

| Referência humana | GPT: incluir | GPT: excluir | GPT: inconclusivo | JEV: incluir | JEV: excluir | JEV: inconclusivo |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
${['included', 'excluded'].map(truth => `| ${truth} | ${['gpt', 'jev'].flatMap(p => ['included', 'excluded', 'uncertain'].map(k => summaries[p].manualMatrix?.[truth]?.[k] ?? '—')).join(' | ')} |`).join('\n')}

- Dos ${manualIncluded.length} artigos incluídos na referência, exclusões elegíveis em lote: GPT ${summaries.gpt.autoExcludedManualIncluded}; JEV ${summaries.jev.autoExcludedManualIncluded}.
- As 9 sugestões de inclusão do JEV correspondem a artigos incluídos na referência. Porém, JEV ainda sugere excluir 22 dos 36 incluídos humanos e deixa 5 inconclusivos; não é infalível. As 22 exclusões sugeridas ficam abaixo do limiar de aplicação em lote e, nesse fluxo, permanecem para decisão humana.
- Sem E4, mantendo todas as outras probabilidades: distribuição das sugestões para os incluídos humanos — GPT ${JSON.stringify(summaries.gpt.manualIncludedWithoutE4)}; JEV ${JSON.stringify(summaries.jev.manualIncludedWithoutE4)}.
- Sem E4, exclusões elegíveis em lote dos incluídos humanos: GPT ${summaries.gpt.withoutE4AutoExcludedManualIncluded}; JEV ${summaries.jev.withoutE4AutoExcludedManualIncluded}.
- Priorizar retenção dos relevantes e risco de exclusão indevida. Uma proporção elevada de exclusões humanas pode fazer “excluir tudo” aparentar boa acurácia global, apesar de perder todos os estudos relevantes.

### Exemplos incluídos na referência humana

| ID / título | GPT I1 | GPT E4 | GPT: critérios de exclusão >= 50% | JEV: decisão / I1 / E4 |
| --- | ---: | ---: | --- | --- |
${examples.map(r => `| ${r.id}: ${r.title.replaceAll('|', '/')} | ${fmtP(r.gpt.inclusion.I1)} | ${fmtP(r.gpt.exclusion.E4)} | ${r.gpt.triggers.join(', ')} | ${r.jev.decision} / ${fmtP(r.jev.inclusion.I1)} / ${fmtP(r.jev.exclusion.E4)} |`).join('\n')}

## Limitações e encaminhamento

- As 1433 sugestões estão presentes nos dois arquivos. Falhas intermediárias e retentativas não têm histórico suficiente nesses arquivos para reconstruir o lote da imagem ou sua ordem de erros.
- Os projetos foram salvos em dias diferentes. Não houve alteração nos campos de entrada comparados, mas condições do serviço não foram controladas.
- evaluatedAt representa o instante capturado antes da requisição, não uma medição da duração completa. Não inferir latência por artigo desses timestamps.
- Consumo de entrada registrado: GPT ${summaries.gpt.inputTokens}; JEV ${summaries.jev.inputTokens}. Não inferir custo total nem raciocínio a partir desses valores: faltam métricas completas e contratos de cobrança equivalentes.
- A comparação caracteriza estas execuções, critérios e integração. Não demonstra superioridade geral de um modelo.
- Corrigir futuramente a distinção entre falta de evidência, resposta inválida e critério atendido; E4 precisa de evidência de acesso, não inferência do resumo.
- Depois, repetir uma amostra controlada com os mesmos dados, esforço explícito e referência humana, antes de aplicar exclusões em massa. O plano de evolução existente cobre abstenção, esforço e revisão manual.

## Reprodução

\`node benchmark/compare-providers.mjs\`

O JSON de mesmo nome contém os resumos e a comparação artigo a artigo. Nenhuma chamada externa é realizada.
`;
const destination = 'benchmark/results/comparacao-gpt-jev';
fs.mkdirSync(path.dirname(destination), { recursive: true });
fs.writeFileSync(`${destination}.json`, JSON.stringify(details, null, 2) + '\n');
fs.writeFileSync(`${destination}.md`, md);
console.log(JSON.stringify({ population: ids.length, goldValidated, manualLabels: details.manualLabels, matrix,
  summaries: Object.fromEntries(Object.entries(summaries).map(([p, s]) => [p, { decisions: s.decisions, autoDecisions: s.autoDecisions,
    solelyE4: s.solelyE4, E4exact50: s.histograms.E4.exact50, withoutE4Decisions: s.withoutE4Decisions,
    manualMatrix: s.manualMatrix, autoExcludedManualIncluded: s.autoExcludedManualIncluded,
    manualIncludedWithoutE4: s.manualIncludedWithoutE4, withoutE4AutoExcludedManualIncluded: s.withoutE4AutoExcludedManualIncluded }])),
  report: `${destination}.md` }, null, 2));
