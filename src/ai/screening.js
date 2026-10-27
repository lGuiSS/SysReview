// screening.js - Converte critérios do protocolo em perguntas do Jev e
// combina as respostas em uma sugestão de decisão (funções puras)

import { evaluate, DEFAULT_MODEL } from './jevClient.js';

export const STAGES = ['filter1', 'filter2', 'filter3'];

// Regras de decisão por filtro (probabilidades de 0 a 1):
// - inclusive (Filtro 1): inclui com p(inclusão) >= includeAt e nenhuma exclusão >= 0,5;
//   aplica exclusões em lote só com p(exclusão) >= excludeAt
// - strict (Filtros 2 e 3): exige p >= 0,5 em todos os critérios e aplica em lote com p >= applyAt
export const DEFAULT_RULES = {
  filter1: { mode: 'inclusive', includeAt: 0.2, excludeAt: 0.95 },
  filter2: { mode: 'strict', applyAt: 0.95 },
  filter3: { mode: 'strict', applyAt: 0.975 },
};

export const DEFAULT_AI_CONFIG = {
  model: DEFAULT_MODEL,
  rules: DEFAULT_RULES,
  minQuality: 1, // média mínima dos níveis de qualidade (0-2) para sugerir inclusão no Filtro 3
  usage: { inputTokens: 0, requests: 0 },
};

const QUALITY_LEVELS = [
  'Not met / no evidence in the text',
  'Partially met',
  'Fully met',
];

const MISSING_ABSTRACT = 'Resumo não disponível';

// Campos do state citados nas perguntas de cada filtro
const STAGE_FIELDS = {
  filter1: ['title', 'keywords', 'abstract'],
  filter2: ['title', 'keywords', 'abstract', 'introduction', 'conclusion'],
  filter3: ['title', 'keywords', 'abstract', 'sections'],
};

// Converte o formato antigo (autoThreshold em confiança |2p-1|) para probabilidade
const legacyRules = (autoThreshold) => {
  if (!autoThreshold) return {};
  const toP = (c) => Math.round(((1 + c) / 2) * 1000) / 1000;
  const rules = {};
  if (autoThreshold.filter1 != null) rules.filter1 = { excludeAt: toP(autoThreshold.filter1) };
  if (autoThreshold.filter2 != null) rules.filter2 = { applyAt: toP(autoThreshold.filter2) };
  if (autoThreshold.filter3 != null) rules.filter3 = { applyAt: toP(autoThreshold.filter3) };
  return rules;
};

export const getAiConfig = (protocol) => {
  const { autoThreshold, rules: savedRules, ...saved } = protocol?.aiConfig ?? {};
  const source = savedRules ?? legacyRules(autoThreshold);
  const rules = Object.fromEntries(
    STAGES.map(stage => [stage, { ...DEFAULT_RULES[stage], ...(source[stage] ?? {}) }])
  );
  return {
    ...DEFAULT_AI_CONFIG,
    ...saved,
    rules,
    usage: {
      ...DEFAULT_AI_CONFIG.usage,
      ...(saved.usage ?? {}),
    },
  };
};

export const activeCriteria = (protocol) => ({
  inclusion: (protocol.inclusionCriteria ?? []).filter(c => c.value?.trim()),
  exclusion: (protocol.exclusionCriteria ?? []).filter(c => c.value?.trim()),
  quality: (protocol.qualityCriteria ?? []).filter(c => c.value?.trim()),
});

// Hash simples (djb2) para detectar sugestões desatualizadas
const hashString = (str) => {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash + str.charCodeAt(i)) | 0;
  }
  return (hash >>> 0).toString(36);
};

export const criteriaHash = (protocol, stage) => {
  const { inclusion, exclusion, quality } = activeCriteria(protocol);
  const parts = [
    stage,
    ...inclusion.map(c => `I:${c.id}:${c.value.trim()}`),
    ...exclusion.map(c => `E:${c.id}:${c.value.trim()}`),
    ...(stage === 'filter3' ? quality.map(c => `Q:${c.id}:${c.value.trim()}`) : []),
  ];
  return hashString(parts.join('|'));
};

export const textHash = (fullText) =>
  fullText?.sections ? hashString(JSON.stringify(fullText.sections)) : null;

const hasAbstract = (article) =>
  !!article.abstract && article.abstract.trim() !== '' && article.abstract !== MISSING_ABSTRACT;

// fullText: { sections: { introduction, methods, results, discussion, conclusion } } (Filtros 2 e 3)
export const hasEnoughText = (article, stage, fullText = null) => {
  if (stage === 'filter1') return hasAbstract(article) || !!article.title;
  const sections = fullText?.sections;
  if (!sections) return false;
  if (stage === 'filter2') return !!(sections.introduction?.trim() || sections.conclusion?.trim());
  return Object.values(sections).some(s => s?.trim());
};

export const buildState = (article, stage, fullText = null) => {
  const base = {
    title: article.title,
    keywords: (article.keywords ?? []).join('; '),
    abstract: hasAbstract(article) ? article.abstract : '',
    year: article.year,
    language: article.language,
    studyType: article.studyType,
  };
  const sections = fullText?.sections ?? {};

  if (stage === 'filter2') {
    return {
      ...base,
      introduction: sections.introduction ?? '',
      conclusion: sections.conclusion ?? '',
    };
  }
  if (stage === 'filter3') {
    return {
      ...base,
      sections: {
        introduction: sections.introduction ?? '',
        methods: sections.methods ?? '',
        results: sections.results ?? '',
        discussion: sections.discussion ?? '',
        conclusion: sections.conclusion ?? '',
      },
    };
  }
  return base;
};

const fieldList = (stage) => {
  const fields = STAGE_FIELDS[stage].map(f => `\`${f}\``);
  return fields.length > 1
    ? `${fields.slice(0, -1).join(', ')} and ${fields[fields.length - 1]}`
    : fields[0];
};

// Devolve { questions, index } onde index mapeia o id da pergunta ao critério
export const buildQuestions = (protocol, stage) => {
  const { inclusion, exclusion, quality } = activeCriteria(protocol);
  const fields = fieldList(stage);
  const questions = {};
  const index = {};

  inclusion.forEach(c => {
    const qid = `inc_${c.id}`;
    questions[qid] = {
      type: 'noul',
      instructions: `Based on ${fields} of the study, does the study satisfy this inclusion criterion of a systematic review: "${c.value.trim()}"?`,
    };
    index[qid] = { id: c.id, label: c.value, category: 'inclusion' };
  });

  exclusion.forEach(c => {
    const qid = `exc_${c.id}`;
    questions[qid] = {
      type: 'noul',
      instructions: `Based on ${fields} of the study, does the study match this exclusion criterion of a systematic review: "${c.value.trim()}"?`,
    };
    index[qid] = { id: c.id, label: c.value, category: 'exclusion' };
  });

  // Qualidade só é avaliada com o texto completo
  if (stage === 'filter3') {
    quality.forEach(c => {
      const qid = `q_${c.id}`;
      questions[qid] = {
        type: 'score',
        instructions: `Based on ${fields} of the study, to what extent does the study meet this quality criterion: "${c.value.trim()}"?`,
        criteria: QUALITY_LEVELS,
      };
      index[qid] = { id: c.id, label: c.value, category: 'quality' };
    });
  }

  return { questions, index };
};

// Estimativa grosseira: ~4 caracteres por token
const estimate = (value) => Math.ceil(JSON.stringify(value ?? '').length / 4);

export const estimateTokens = (state, questions) => {
  const stateTokens = estimate(state);
  const qTokens = Object.values(questions).map(estimate);
  const totalQ = qTokens.reduce((a, b) => a + b, 0);
  return {
    once: stateTokens + totalQ,
    perQuestion: qTokens.reduce((acc, q) => acc + stateTokens + q, 0),
  };
};

// Arredondado para evitar que p = 0,95 vire 0,8999999… e fique abaixo do limiar 0,9
const nounConfidence = (p) => Math.round(Math.abs(2 * p - 1) * 1e6) / 1e6;

// Combina as respostas em { decision, confidence, criteria, ... }
export const decide = (answers, index, stage, aiConfig) => {
  const inclusion = {};
  const exclusion = {};
  const quality = {};

  Object.entries(index).forEach(([qid, criterion]) => {
    const answer = answers?.[qid];
    if (!answer) return;
    if (criterion.category === 'inclusion') inclusion[criterion.id] = answer.noul;
    else if (criterion.category === 'exclusion') exclusion[criterion.id] = answer.noul;
    else quality[criterion.id] = { score: answer.score, confidence: answer.confidence ?? null };
  });

  const criterionById = (category, id) =>
    Object.values(index).find(c => c.category === category && c.id === id);

  const incValues = Object.values(inclusion);
  const excEntries = Object.entries(exclusion);
  const pExcMax = excEntries.length ? Math.max(...excEntries.map(([, p]) => p)) : 0;
  const pIncMin = incValues.length ? Math.min(...incValues) : 1;

  const rule = aiConfig.rules?.[stage] ?? DEFAULT_RULES[stage];
  const inclusive = rule.mode === 'inclusive';

  let decision = 'uncertain';
  let confidence = 0;
  let probability = null;
  let criteria = [];

  const inclusionCriteria = () => Object.entries(inclusion)
    .filter(([, p]) => p >= (inclusive ? rule.includeAt : 0.5))
    .map(([id]) => criterionById('inclusion', id));

  if (inclusive && incValues.length && pIncMin >= rule.includeAt && pExcMax < 0.5) {
    // Filtro 1 inclusivo: basta indício de atender à inclusão sem nenhum critério de exclusão
    decision = 'included';
    probability = pIncMin;
    confidence = nounConfidence(pIncMin);
    criteria = inclusionCriteria();
  } else if (pExcMax >= 0.5) {
    decision = 'excluded';
    probability = pExcMax;
    confidence = nounConfidence(pExcMax);
    criteria = excEntries
      .filter(([, p]) => p >= 0.5)
      .sort((a, b) => b[1] - a[1])
      .map(([id]) => criterionById('exclusion', id));
  } else if (!inclusive && pIncMin >= 0.5) {
    const qualityScores = Object.values(quality).map(q => q.score);
    const meanQuality = qualityScores.length
      ? qualityScores.reduce((a, b) => a + b, 0) / qualityScores.length
      : null;
    const qualityOk = stage !== 'filter3' || meanQuality === null || meanQuality >= aiConfig.minQuality;

    if (qualityOk) {
      decision = 'included';
      probability = Math.min(pIncMin, 1 - pExcMax);
      const confidences = [
        ...incValues.map(nounConfidence),
        ...excEntries.map(([, p]) => nounConfidence(p)),
      ];
      confidence = confidences.length ? Math.min(...confidences) : 0;
      criteria = [
        ...inclusionCriteria(),
        ...Object.entries(quality)
          .filter(([, q]) => q.score >= 1)
          .map(([id]) => criterionById('quality', id)),
      ];
    }
  }

  return {
    decision,
    confidence,
    probability,
    relevance: Math.round(pIncMin * (1 - pExcMax) * 1e6) / 1e6,
    criteria: criteria.filter(Boolean),
    inclusion,
    exclusion,
    quality,
    unmetInclusion: Object.entries(inclusion).filter(([, p]) => p < 0.5).map(([id]) => id),
  };
};

// Avalia um artigo em um filtro e devolve a sugestão a ser salva no artigo
export const evaluateArticle = async ({ article, protocol, stage, settings, fullText = null, signal }) => {
  const aiConfig = getAiConfig(protocol);
  const base = {
    model: aiConfig.model,
    evaluatedAt: new Date().toISOString(),
    criteriaHash: criteriaHash(protocol, stage),
    textHash: textHash(fullText),
    fieldsUsed: STAGE_FIELDS[stage],
  };

  if (!hasEnoughText(article, stage, fullText)) {
    return { suggestion: { ...base, decision: 'needs-text', confidence: 0, criteria: [] }, usage: null };
  }

  const { questions, index } = buildQuestions(protocol, stage);
  if (Object.keys(questions).length === 0) {
    return { suggestion: { ...base, decision: 'uncertain', confidence: 0, criteria: [] }, usage: null };
  }

  const state = buildState(article, stage, fullText);
  const response = await evaluate({
    apiKey: settings.apiKey,
    baseUrl: settings.baseUrl,
    model: aiConfig.model,
    state,
    questions,
    longContext: settings.longContext,
    signal,
  });

  const result = decide(response.answers, index, stage, aiConfig);
  return {
    suggestion: { ...base, model: response.model || aiConfig.model, ...result },
    usage: response.usage ?? null,
  };
};

// Sugestão ainda válida para os critérios (e texto) atuais?
export const isSuggestionStale = (suggestion, protocol, stage, fullText = null) => {
  if (!suggestion) return false;
  if (suggestion.criteriaHash !== criteriaHash(protocol, stage)) return true;
  if (stage !== 'filter1' && suggestion.textHash !== textHash(fullText)) return true;
  return false;
};

// Recalcula a decisão de uma sugestão salva com as regras atuais do protocolo,
// a partir das probabilidades guardadas (sem nova chamada à API)
export const withCurrentRules = (suggestion, protocol, stage) => {
  if (!suggestion || (!suggestion.inclusion && !suggestion.exclusion)) return suggestion;
  const answers = {};
  Object.entries(suggestion.inclusion ?? {}).forEach(([id, p]) => { answers[`inc_${id}`] = { noul: p }; });
  Object.entries(suggestion.exclusion ?? {}).forEach(([id, p]) => { answers[`exc_${id}`] = { noul: p }; });
  Object.entries(suggestion.quality ?? {}).forEach(([id, q]) => { answers[`q_${id}`] = q; });
  const { index } = buildQuestions(protocol, stage);
  return { ...suggestion, ...decide(answers, index, stage, getAiConfig(protocol)) };
};

// Probabilidade que determinou a decisão (sugestões antigas guardavam só a confiança)
export const suggestionProbability = (suggestion) => {
  if (!suggestion) return null;
  if (typeof suggestion.probability === 'number') return suggestion.probability;
  if (suggestion.decision !== 'included' && suggestion.decision !== 'excluded') return null;
  return (1 + (suggestion.confidence ?? 0)) / 2;
};

// Escore de relevância: min p(inclusão) × (1 − max p(exclusão))
export const relevanceOf = (suggestion) => {
  if (!suggestion) return null;
  if (typeof suggestion.relevance === 'number') return suggestion.relevance;
  const inc = Object.values(suggestion.inclusion ?? {});
  const exc = Object.values(suggestion.exclusion ?? {});
  if (!inc.length && !exc.length) return null;
  return (inc.length ? Math.min(...inc) : 1) * (1 - (exc.length ? Math.max(...exc) : 0));
};

// Pode ser aplicada automaticamente no lote?
export const isAutoApplicable = (suggestion, protocol, stage) => {
  if (!suggestion) return false;
  if (suggestion.decision !== 'included' && suggestion.decision !== 'excluded') return false;
  const rule = getAiConfig(protocol).rules[stage];
  const p = suggestionProbability(suggestion);
  if (p === null) return false;
  const eps = 1e-9;
  if (rule.mode === 'inclusive') {
    return suggestion.decision === 'included' ? p >= rule.includeAt - eps : p >= rule.excludeAt - eps;
  }
  return p >= rule.applyAt - eps;
};

// Descrição curta da regra de lote de um filtro (para textos de interface)
export const autoRuleSummary = (protocol, stage) => {
  const rule = getAiConfig(protocol).rules[stage];
  const pct = (v) => Math.round(v * 1000) / 10;
  return rule.mode === 'inclusive'
    ? { mode: 'inclusive', includeAt: pct(rule.includeAt), excludeAt: pct(rule.excludeAt) }
    : { mode: 'strict', applyAt: pct(rule.applyAt) };
};
