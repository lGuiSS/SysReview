// run-benchmark.mjs - Benchmark da triagem assistida (Jev) contra uma revisão manual.
//
// Usa exatamente a mesma lógica do app (src/ai/screening.js) para avaliar cada
// artigo e compara a sugestão com a decisão manual registrada no projeto.
//
// Uso:
//   TYPESAFE_API_KEY=... node benchmark/run-benchmark.mjs --gold <projeto-manual.srp> [opções]
//
// Opções:
//   --stage filter1        Filtro avaliado (somente filter1 por enquanto; F2/F3 dependem do texto completo)
//   --out <pasta>          Pasta dos resultados (padrão: benchmark/results)
//   --limit <n>            Avalia só os n primeiros artigos (teste rápido)
//   --concurrency <n>      Requisições simultâneas (padrão: 4)
//   --model <id>           Modelo Jev (padrão: jev-1.13.0)
//   --report-only          Não chama a API; só recalcula métricas e planilha a partir do bruto salvo
//   --fresh                Ignora resultados brutos anteriores e reavalia tudo
//   --mock                 Simula respostas (sem custo) apenas para testar o pipeline
//
// As respostas brutas ficam em <out>/raw-<stage>.jsonl: a execução pode ser
// interrompida e retomada sem pagar de novo pelos artigos já avaliados.

import fs from 'node:fs';
import path from 'node:path';
import ExcelJS from 'exceljs';
import { evaluateArticle, getAiConfig, activeCriteria, buildQuestions, decide, isAutoApplicable, DEFAULT_RULES } from '../src/ai/screening.js';
import { runQueue, DEFAULT_MODEL, PRICE_PER_MTOK_USD } from '../src/ai/jevClient.js';

// ── Argumentos ────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const opt = (name, fallback = null) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : fallback;
};
const flag = (name) => args.includes(`--${name}`);

const goldPath = opt('gold');
const stage = opt('stage', 'filter1');
const mock = flag('mock');
const outDir = opt('out', mock ? 'benchmark/results-mock' : 'benchmark/results');
const limit = opt('limit') ? Number(opt('limit')) : null;
const concurrency = Number(opt('concurrency', 4));
const model = opt('model', DEFAULT_MODEL);
const reportOnly = flag('report-only');
const fresh = flag('fresh');

if (!goldPath) {
  console.error('Informe o projeto revisado manualmente: --gold <arquivo.srp>');
  process.exit(1);
}
if (stage !== 'filter1') {
  console.error('Por enquanto só o Filtro 1 pode ser avaliado: os Filtros 2 e 3 dependem do texto completo.');
  process.exit(1);
}
const apiKey = process.env.TYPESAFE_API_KEY;
if (!apiKey && !reportOnly && !mock) {
  console.error('Defina a variável de ambiente TYPESAFE_API_KEY.');
  process.exit(1);
}

// ── Gabarito ──────────────────────────────────────────────────────────────────
const gold = JSON.parse(fs.readFileSync(goldPath, 'utf8'));
const protocol = { ...gold.protocol, aiConfig: { ...(gold.protocol.aiConfig ?? {}), model } };
const statusField = { filter1: 'filter1Status', filter2: 'filter2Status', filter3: 'filter3Status' }[stage];

const enteredStage = {
  filter1: (a) => a.dataProcessingStatus === 'included' && !a.isDuplicate,
  filter2: (a) => a.filter1Status === 'included',
  filter3: (a) => a.filter2Status === 'included',
}[stage];

let goldArticles = gold.articles.filter(a => enteredStage(a) && ['included', 'excluded'].includes(a[statusField]));
if (limit) goldArticles = goldArticles.slice(0, limit);
const truthById = new Map(goldArticles.map(a => [a.id, a]));

// Artigo como o Jev o recebe: sem nenhuma decisão manual
const blank = (a) => ({
  ...a,
  filter1Status: 'pending', filter2Status: 'pending', filter3Status: 'pending',
  inclusionCriterion: [], exclusionCriterion: [], qualityCriteria: [], extractionCriteria: [],
  aiSuggestions: {}, decisionSource: {},
});

// ── Respostas brutas (retomáveis) ─────────────────────────────────────────────
fs.mkdirSync(outDir, { recursive: true });
const rawPath = path.join(outDir, `raw-${stage}.jsonl`);
if (fresh && fs.existsSync(rawPath)) fs.unlinkSync(rawPath);

const loadRaw = () => {
  const map = new Map();
  if (!fs.existsSync(rawPath)) return map;
  fs.readFileSync(rawPath, 'utf8').split('\n').filter(Boolean).forEach(line => {
    const row = JSON.parse(line);
    if (row.suggestion) map.set(row.id, row);
  });
  return map;
};

// Simulação determinística para testar o pipeline sem custo
const installMock = () => {
  let seed = 42;
  const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  globalThis.fetch = async (_url, init) => {
    const body = JSON.parse(init.body);
    const answers = {};
    Object.keys(body.questions).forEach(qid => {
      answers[qid] = { type: 'noul', noul: Math.round(rand() * 1000) / 1000 };
    });
    return new Response(JSON.stringify({ model: 'mock', answers, usage: { input_tokens: 400 } }), { status: 200 });
  };
};

const evaluateAll = async () => {
  if (mock) installMock();
  const done = loadRaw();
  const pending = goldArticles.filter(a => !done.has(a.id));
  console.log(`${goldArticles.length} artigos no ${stage}; ${done.size} já avaliados; ${pending.length} a avaliar.`);
  if (!pending.length) return;

  const settings = { apiKey: apiKey || 'mock', baseUrl: process.env.TYPESAFE_BASE_URL || 'https://api.typesafe.ai', longContext: false };
  const stream = fs.createWriteStream(rawPath, { flags: 'a' });
  let count = 0;
  let errors = 0;
  const started = Date.now();

  await runQueue(
    pending,
    (article) => evaluateArticle({ article: blank(article), protocol, stage, settings }),
    {
      concurrency,
      onResult: (article, result, error) => {
        count += 1;
        if (error) {
          errors += 1;
          stream.write(JSON.stringify({ id: article.id, error: `${error.code ?? ''} ${error.message}` }) + '\n');
        } else {
          stream.write(JSON.stringify({ id: article.id, suggestion: result.suggestion, usage: result.usage }) + '\n');
        }
        if (count % 25 === 0 || count === pending.length) {
          const rate = count / ((Date.now() - started) / 1000);
          process.stdout.write(`\r${count}/${pending.length} avaliados · ${errors} erros · ${rate.toFixed(1)} art/s   `);
        }
      },
    }
  );
  await new Promise(resolve => stream.end(resolve));
  console.log('');
  if (errors) console.log(`${errors} artigos com erro: rode de novo para tentar apenas esses.`);
};

// ── Métricas ──────────────────────────────────────────────────────────────────
const ratio = (a, b) => (b ? a / b : null);
const pct = (v) => (v === null || v === undefined ? '-' : `${(v * 100).toFixed(1)}%`);

const relevance = (s) => {
  const inc = Object.values(s.inclusion ?? {});
  const exc = Object.values(s.exclusion ?? {});
  const pInc = inc.length ? Math.min(...inc) : 1;
  const pExc = exc.length ? Math.max(...exc) : 0;
  return pInc * (1 - pExc);
};

// Kappa de Cohen para duas classificações binárias
const kappa = (pairs) => {
  const n = pairs.length;
  if (!n) return null;
  const agree = pairs.filter(([a, b]) => a === b).length / n;
  const pA = pairs.filter(([a]) => a).length / n;
  const pB = pairs.filter(([, b]) => b).length / n;
  const expected = pA * pB + (1 - pA) * (1 - pB);
  return expected === 1 ? null : (agree - expected) / (1 - expected);
};

// AUC (Mann-Whitney) do escore de relevância
const auc = (rows) => {
  const pos = rows.filter(r => r.truthIncluded).map(r => r.score);
  const neg = rows.filter(r => !r.truthIncluded).map(r => r.score);
  if (!pos.length || !neg.length) return null;
  let wins = 0;
  pos.forEach(p => neg.forEach(q => { wins += p > q ? 1 : p === q ? 0.5 : 0; }));
  return wins / (pos.length * neg.length);
};

// Work Saved over Sampling para um recall alvo (ex.: 0.95)
const wss = (rows, target) => {
  const sorted = [...rows].sort((a, b) => b.score - a.score);
  const totalPos = rows.filter(r => r.truthIncluded).length;
  const needed = Math.ceil(target * totalPos);
  let found = 0;
  for (let i = 0; i < sorted.length; i++) {
    if (sorted[i].truthIncluded) found += 1;
    if (found >= needed) return { screened: i + 1, wss: (sorted.length - (i + 1)) / sorted.length - (1 - target) };
  }
  return null;
};

const { index: questionIndex } = buildQuestions(protocol, stage);
const answersFrom = (suggestion) => {
  const answers = {};
  Object.entries(suggestion.inclusion ?? {}).forEach(([id, p]) => { answers[`inc_${id}`] = { noul: p }; });
  Object.entries(suggestion.exclusion ?? {}).forEach(([id, p]) => { answers[`exc_${id}`] = { noul: p }; });
  Object.entries(suggestion.quality ?? {}).forEach(([id, q]) => { answers[`q_${id}`] = q; });
  return answers;
};

const computeMetrics = (raw) => {
  const rows = goldArticles.filter(a => raw.has(a.id)).map(a => {
    // Recalcula a decisão a partir das probabilidades salvas, com a regra atual do app
    const saved = raw.get(a.id).suggestion;
    const s = saved.inclusion || saved.exclusion
      ? { ...saved, ...decide(answersFrom(saved), questionIndex, stage, getAiConfig(protocol)) }
      : saved;
    return {
      article: a,
      saved,
      suggestion: s,
      usage: raw.get(a.id).usage,
      truth: a[statusField],
      truthIncluded: a[statusField] === 'included',
      decision: s.decision,
      score: relevance(s),
    };
  });

  const n = rows.length;
  const P = rows.filter(r => r.truthIncluded).length;
  const N = n - P;
  const count = (fn) => rows.filter(fn).length;

  // Matriz verdade × sugestão (3 classes)
  const matrix = {};
  ['included', 'excluded'].forEach(truth => {
    matrix[truth] = {};
    ['included', 'excluded', 'uncertain', 'needs-text'].forEach(dec => {
      matrix[truth][dec] = count(r => r.truth === truth && r.decision === dec);
    });
  });

  // Classificação estrita: positivo = Jev sugeriu incluir
  const TP = matrix.included.included;
  const FN = P - TP;
  const FP = matrix.excluded.included;
  const TN = N - FP;
  const sensitivity = ratio(TP, P);
  const specificity = ratio(TN, N);
  const precision = ratio(TP, TP + FP);
  const f1 = precision !== null && sensitivity !== null && precision + sensitivity > 0
    ? (2 * precision * sensitivity) / (precision + sensitivity)
    : null;

  // Aplicação em lote com as mesmas funções do app (decide + isAutoApplicable), variando a regra
  const defaultRule = DEFAULT_RULES[stage];
  const ruleVariants = defaultRule.mode === 'inclusive'
    ? [0.1, 0.2, 0.3].flatMap(includeAt => [0.9, 0.925, 0.95, 0.975].map(excludeAt => ({ ...defaultRule, includeAt, excludeAt })))
    : [0.9, 0.925, 0.95, 0.975, 0.99].map(applyAt => ({ ...defaultRule, applyAt }));

  const thresholds = ruleVariants.map(rule => {
    const variantProtocol = { ...protocol, aiConfig: { ...protocol.aiConfig, rules: { [stage]: rule } } };
    const variantConfig = getAiConfig(variantProtocol);
    const decided = rows.map(r => {
      const s = r.saved.inclusion || r.saved.exclusion
        ? { ...r.saved, ...decide(answersFrom(r.saved), questionIndex, stage, variantConfig) }
        : r.saved;
      return { ...r, s, auto: isAutoApplicable(s, variantProtocol, stage) };
    });
    const auto = decided.filter(r => r.auto);
    const autoIn = auto.filter(r => r.s.decision === 'included');
    const autoEx = auto.filter(r => r.s.decision === 'excluded');
    const lost = autoEx.filter(r => r.truthIncluded).length;
    return {
      rule: rule.mode === 'inclusive'
        ? `incluir p ≥ ${rule.includeAt} · excluir p ≥ ${rule.excludeAt}`
        : `aplicar p ≥ ${rule.applyAt}`,
      isDefault: JSON.stringify(rule) === JSON.stringify(defaultRule),
      autoIncluded: autoIn.length,
      autoIncludedCorrect: autoIn.filter(r => r.truthIncluded).length,
      autoExcluded: autoEx.length,
      auto: auto.length,
      coverage: ratio(auto.length, n),
      accuracyAuto: ratio(auto.filter(r => r.s.decision === r.truth).length, auto.length),
      lostIncluded: lost,
      wrongIncluded: autoIn.filter(r => !r.truthIncluded).length,
      recallSafe: ratio(P - lost, P),
      manualLeft: n - auto.length,
    };
  });

  // Concordância por critério de exclusão (artigos excluídos manualmente)
  const { inclusion, exclusion } = activeCriteria(protocol);
  const criteriaRows = [
    ...exclusion.map(c => {
      const subset = rows.filter(r => !r.truthIncluded);
      const manual = (r) => (r.article.exclusionCriterion ?? []).some(e => e.id === c.id);
      const jev = (r) => (r.suggestion.exclusion?.[c.id] ?? 0) >= 0.5;
      const tp = subset.filter(r => manual(r) && jev(r)).length;
      const fp = subset.filter(r => !manual(r) && jev(r)).length;
      const fn = subset.filter(r => manual(r) && !jev(r)).length;
      return {
        id: c.id, label: c.value, base: 'excluídos manualmente',
        manualMarked: tp + fn, jevMarked: tp + fp, both: tp,
        recall: ratio(tp, tp + fn), precision: ratio(tp, tp + fp),
        kappa: kappa(subset.map(r => [manual(r), jev(r)])),
      };
    }),
    ...inclusion.map(c => {
      const subset = rows.filter(r => r.truthIncluded);
      const jev = (r) => (r.suggestion.inclusion?.[c.id] ?? 0) >= 0.5;
      const tp = subset.filter(jev).length;
      return {
        id: c.id, label: c.value, base: 'incluídos manualmente',
        manualMarked: subset.length, jevMarked: tp, both: tp,
        recall: ratio(tp, subset.length), precision: null, kappa: null,
      };
    }),
  ];

  const tokens = rows.reduce((acc, r) => acc + (r.usage?.input_tokens ?? 0), 0);
  const wss95 = wss(rows, 0.95);
  const wss100 = wss(rows, 1);

  return {
    rows, n, P, N, matrix, TP, FN, FP, TN,
    accuracy: ratio(TP + TN, n), sensitivity, specificity, precision, f1,
    kappa: kappa(rows.map(r => [r.truthIncluded, r.decision === 'included'])),
    auc: auc(rows), wss95, wss100, thresholds, criteriaRows, tokens,
    cost: (tokens / 1e6) * PRICE_PER_MTOK_USD,
  };
};

// ── Relatório ─────────────────────────────────────────────────────────────────
const printSummary = (m) => {
  console.log(`\nBenchmark ${stage} · ${m.n} artigos (${m.P} incluídos, ${m.N} excluídos manualmente)${mock ? ' · SIMULAÇÃO' : ''}`);
  console.log('Matriz (linhas = decisão manual; colunas = sugestão Jev):');
  console.table(m.matrix);
  console.log(`Sensibilidade ${pct(m.sensitivity)} · Especificidade ${pct(m.specificity)} · Precisão ${pct(m.precision)} · F1 ${pct(m.f1)} · Acurácia ${pct(m.accuracy)}`);
  console.log(`Kappa ${m.kappa?.toFixed(3) ?? '-'} · AUC ${m.auc?.toFixed(3) ?? '-'} · WSS@95 ${pct(m.wss95?.wss)} · WSS@100 ${pct(m.wss100?.wss)}`);
  console.log('Aplicação em lote por regra (* = padrão do app):');
  console.table(m.thresholds.map(t => ({
    'regra': `${t.isDefault ? '* ' : ''}${t.rule}`,
    'incluídos auto (corretos)': `${t.autoIncluded} (${t.autoIncludedCorrect})`,
    'excluídos auto': t.autoExcluded,
    'cobertura': pct(t.coverage),
    'acerto': pct(t.accuracyAuto),
    'incluídos perdidos': t.lostIncluded,
    'recall preservado': pct(t.recallSafe),
    'p/ revisão manual': t.manualLeft,
  })));
  console.log(`Tokens de entrada: ${m.tokens.toLocaleString()} (~US$ ${m.cost.toFixed(4)})`);
};

const writeWorkbook = async (m, file) => {
  const wb = new ExcelJS.Workbook();
  const header = (ws) => {
    ws.getRow(1).font = { bold: true };
    ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE5E7EB' } };
    ws.views = [{ state: 'frozen', ySplit: 1 }];
  };

  const summary = wb.addWorksheet('Resumo');
  summary.columns = [{ header: 'Métrica', key: 'k', width: 42 }, { header: 'Valor', key: 'v', width: 26 }, { header: 'Interpretação', key: 'i', width: 90 }];
  [
    ['Projeto (gabarito)', path.basename(goldPath), ''],
    ['Filtro', stage, ''],
    ['Modelo', model, mock ? 'SIMULAÇÃO: não representa o Jev' : ''],
    ['Data', new Date().toLocaleString('pt-BR'), ''],
    ['Artigos avaliados', m.n, ''],
    ['Incluídos manualmente (positivos)', m.P, ''],
    ['Excluídos manualmente (negativos)', m.N, ''],
    ['Sensibilidade (recall)', m.sensitivity, 'Dos incluídos manualmente, % que o Jev sugeriu incluir (regra padrão do app). Métrica principal em revisões sistemáticas.'],
    ['Especificidade', m.specificity, 'Dos excluídos manualmente, % que o Jev não sugeriu incluir.'],
    ['Precisão', m.precision, 'Das sugestões de inclusão, % que você de fato incluiu.'],
    ['F1', m.f1, 'Média harmônica entre precisão e sensibilidade.'],
    ['Acurácia', m.accuracy, 'Pouco informativa com classes desbalanceadas (poucos incluídos).'],
    ['Kappa de Cohen', m.kappa, 'Concordância além do acaso (incluir × não incluir). >0,6 substancial; >0,8 quase perfeita.'],
    ['AUC do escore de relevância', m.auc, 'Capacidade de ordenar os incluídos acima dos excluídos (0,5 = acaso; 1 = perfeito).'],
    ['WSS@95', m.wss95?.wss ?? null, `Trabalho economizado ordenando pelo escore e lendo até achar 95% dos incluídos (${m.wss95?.screened ?? '-'} artigos lidos).`],
    ['WSS@100', m.wss100?.wss ?? null, `Idem para 100% dos incluídos (${m.wss100?.screened ?? '-'} artigos lidos).`],
    ['Tokens de entrada', m.tokens, ''],
    ['Custo estimado (US$)', Number(m.cost.toFixed(4)), `US$ ${PRICE_PER_MTOK_USD} por milhão de tokens de entrada`],
  ].forEach(([k, v, i]) => summary.addRow({ k, v, i }));
  [8, 9, 10, 11, 12, 15, 16].forEach(r => { summary.getCell(`B${r + 1}`).numFmt = '0.0%'; });
  [13, 14].forEach(r => { summary.getCell(`B${r + 1}`).numFmt = '0.000'; });
  header(summary);

  summary.addRow({});
  summary.addRow({ k: 'Matriz: decisão manual × sugestão Jev' }).font = { bold: true };
  summary.addRow({ k: 'Manual \\ Jev', v: 'incluir · excluir · revisão manual · sem texto' });
  ['included', 'excluded'].forEach(truth => {
    const row = m.matrix[truth];
    summary.addRow({ k: truth === 'included' ? 'Incluído' : 'Excluído', v: `${row.included} · ${row.excluded} · ${row.uncertain} · ${row['needs-text']}` });
  });

  const th = wb.addWorksheet('Por regra');
  th.columns = [
    { header: 'Regra de lote', key: 'rule', width: 36 },
    { header: 'Padrão do app', key: 'isDefault', width: 14 },
    { header: 'Incluídos automaticamente', key: 'autoIncluded', width: 24 },
    { header: 'Inclusões corretas', key: 'autoIncludedCorrect', width: 18 },
    { header: 'Excluídos automaticamente', key: 'autoExcluded', width: 24 },
    { header: 'Decididos automaticamente', key: 'auto', width: 26 },
    { header: 'Cobertura', key: 'coverage', width: 12, style: { numFmt: '0.0%' } },
    { header: 'Acerto nos automáticos', key: 'accuracyAuto', width: 22, style: { numFmt: '0.0%' } },
    { header: 'Incluídos perdidos', key: 'lostIncluded', width: 18 },
    { header: 'Excluídos sugeridos p/ inclusão', key: 'wrongIncluded', width: 30 },
    { header: 'Recall preservado', key: 'recallSafe', width: 18, style: { numFmt: '0.0%' } },
    { header: 'Restam p/ revisão manual', key: 'manualLeft', width: 24 },
  ];
  m.thresholds.forEach(t => th.addRow({ ...t, isDefault: t.isDefault ? 'sim' : '' }));
  header(th);

  const cr = wb.addWorksheet('Por critério');
  cr.columns = [
    { header: 'Critério', key: 'id', width: 10 },
    { header: 'Texto', key: 'label', width: 70 },
    { header: 'Base', key: 'base', width: 22 },
    { header: 'Marcado manualmente', key: 'manualMarked', width: 20 },
    { header: 'Marcado pelo Jev (p ≥ 0,5)', key: 'jevMarked', width: 24 },
    { header: 'Ambos', key: 'both', width: 10 },
    { header: 'Recall', key: 'recall', width: 10, style: { numFmt: '0.0%' } },
    { header: 'Precisão', key: 'precision', width: 10, style: { numFmt: '0.0%' } },
    { header: 'Kappa', key: 'kappa', width: 10, style: { numFmt: '0.000' } },
  ];
  m.criteriaRows.forEach(r => cr.addRow(r));
  header(cr);

  const { inclusion, exclusion } = activeCriteria(protocol);
  const articleColumns = [
    { header: 'ID', key: 'id', width: 16 },
    { header: 'Título', key: 'title', width: 70 },
    { header: 'Ano', key: 'year', width: 8 },
    { header: 'Decisão manual', key: 'truth', width: 15 },
    { header: 'Critérios manuais', key: 'manualCriteria', width: 20 },
    { header: 'Sugestão Jev', key: 'decision', width: 15 },
    { header: 'Probabilidade', key: 'probability', width: 13, style: { numFmt: '0.00' } },
    { header: 'Critérios Jev', key: 'jevCriteria', width: 16 },
    { header: 'Escore de relevância', key: 'score', width: 18, style: { numFmt: '0.000' } },
    ...inclusion.map(c => ({ header: `p(${c.id})`, key: `p_${c.id}`, width: 9, style: { numFmt: '0.00' } })),
    ...exclusion.map(c => ({ header: `p(${c.id})`, key: `p_${c.id}`, width: 9, style: { numFmt: '0.00' } })),
    { header: 'Acerto', key: 'hit', width: 9 },
    { header: 'Tokens', key: 'tokens', width: 9 },
  ];
  const toRow = (r) => ({
    id: r.article.id,
    title: r.article.title,
    year: r.article.year,
    truth: r.truth,
    manualCriteria: [...(r.article.inclusionCriterion ?? []), ...(r.article.exclusionCriterion ?? [])].map(c => c.id).join('; '),
    decision: r.decision,
    probability: r.suggestion.probability ?? null,
    jevCriteria: (r.suggestion.criteria ?? []).map(c => c.id).join('; '),
    score: r.score,
    ...Object.fromEntries(inclusion.map(c => [`p_${c.id}`, r.suggestion.inclusion?.[c.id] ?? null])),
    ...Object.fromEntries(exclusion.map(c => [`p_${c.id}`, r.suggestion.exclusion?.[c.id] ?? null])),
    hit: r.decision === r.truth ? 'sim' : r.decision === 'uncertain' ? 'revisão' : 'não',
    tokens: r.usage?.input_tokens ?? null,
  });

  const all = wb.addWorksheet('Artigos');
  all.columns = articleColumns;
  [...m.rows].sort((a, b) => b.score - a.score).forEach(r => all.addRow(toRow(r)));
  header(all);
  all.autoFilter = { from: 'A1', to: { row: 1, column: articleColumns.length } };

  const errors = wb.addWorksheet('Divergências');
  errors.columns = articleColumns;
  m.rows
    .filter(r => r.decision !== r.truth && (r.truthIncluded || r.decision === 'included'))
    .sort((a, b) => Number(b.truthIncluded) - Number(a.truthIncluded) || b.score - a.score)
    .forEach(r => errors.addRow(toRow(r)));
  header(errors);

  await wb.xlsx.writeFile(file);
};

// ── Execução ──────────────────────────────────────────────────────────────────
if (!reportOnly) await evaluateAll();
const raw = loadRaw();
if (!raw.size) {
  console.error('Nenhum resultado bruto encontrado.');
  process.exit(1);
}
const metrics = computeMetrics(raw);
printSummary(metrics);

const xlsxPath = path.join(outDir, `benchmark-${stage}.xlsx`);
await writeWorkbook(metrics, xlsxPath);
const { rows: _rows, ...serializable } = metrics;
fs.writeFileSync(path.join(outDir, `metrics-${stage}.json`), JSON.stringify({ model, stage, mock, ...serializable }, null, 2));
console.log(`\nPlanilha: ${xlsxPath}`);
