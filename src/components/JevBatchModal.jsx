import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from 'react-i18next';
import { X, ListChecks } from "lucide-react";
import { runQueue, PRICE_PER_MTOK_USD } from "../ai/jevClient.js";
import {
  buildQuestions,
  buildState,
  estimateTokens,
  evaluateArticle,
  hasEnoughText,
  isSuggestionStale,
  getAiConfig,
} from "../ai/screening.js";
import { jevErrorMessage } from "../ai/messages.js";

const FLUSH_INTERVAL_MS = 1000;

const ModalShell = ({ title, onClose, children, footer }) => (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 dark:bg-black/50 p-4">
    <div className="w-80 sm:w-[26rem] md:w-[30rem] bg-white dark:bg-gray-800 rounded-xl sm:rounded-2xl shadow-xl border border-gray-200 dark:border-gray-700">
      <div className="flex items-center justify-between px-4 sm:px-6 py-3 sm:py-4 border-b border-gray-100 dark:border-gray-700">
        <div className="flex items-center gap-2 sm:gap-3">
          <ListChecks className="h-4 w-4 sm:h-5 sm:w-5 text-indigo-600 dark:text-indigo-400" />
          <p className="text-sm sm:text-base font-semibold text-gray-800 dark:text-white">{title}</p>
        </div>
        <button
          onClick={onClose}
          className="p-1 sm:p-1.5 rounded-md text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:text-gray-300 dark:hover:bg-gray-700 transition-colors"
        >
          <X className="h-4 w-4 sm:h-5 sm:w-5" />
        </button>
      </div>
      <div className="p-4 sm:p-6 space-y-3 sm:space-y-4 text-xs sm:text-sm text-gray-600 dark:text-gray-300">
        {children}
      </div>
      <div className="flex gap-2 sm:gap-3 px-4 sm:px-6 pb-4 sm:pb-6">
        {footer}
      </div>
    </div>
  </div>
);

const secondaryBtn = `flex-1 px-3 py-1.5 sm:py-2 text-xs sm:text-sm font-medium rounded-lg
  bg-gray-100 hover:bg-gray-200 text-gray-700
  dark:bg-gray-700 dark:hover:bg-gray-600 dark:text-gray-300
  disabled:opacity-40 disabled:cursor-not-allowed transition-colors duration-150`;

const primaryBtn = `flex-1 px-3 py-1.5 sm:py-2 text-xs sm:text-sm font-medium rounded-lg
  bg-indigo-600 hover:bg-indigo-700 text-white
  dark:bg-indigo-500 dark:hover:bg-indigo-600
  disabled:opacity-40 disabled:cursor-not-allowed transition-colors duration-150`;

const CountRow = ({ items }) => (
  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
    {items.map(({ label, value, cls }) => (
      <div key={label} className={`rounded-lg px-3 py-2 ${cls}`}>
        <p className="text-xs">{label}</p>
        <p className="text-base sm:text-lg font-bold">{value}</p>
      </div>
    ))}
  </div>
);

// Avaliação em lote dos artigos pendentes de um filtro
export function JevBatchModal({ stage, sectionTitle, articles, protocol, settings, getFullText, onResults, onUsage, onClose }) {
  const { t } = useTranslation();
  const [fullTexts, setFullTexts] = useState(null); // Map id -> fullText | null
  const [reevaluate, setReevaluate] = useState(false);
  const [phase, setPhase] = useState('idle'); // idle | running | done | stopped
  const [progress, setProgress] = useState({ done: 0, errors: 0 });
  const [counts, setCounts] = useState({ included: 0, excluded: 0, uncertain: 0, 'needs-text': 0 });
  const [lastError, setLastError] = useState(null);
  const [sessionUsage, setSessionUsage] = useState({ tokens: 0, requests: 0 });
  const controllerRef = useRef(null);

  // Carrega os textos completos (Filtros 2 e 3) antes de montar o resumo
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const map = new Map();
      for (const article of articles) {
        map.set(article.id, stage === 'filter1' ? null : await getFullText(article));
      }
      if (!cancelled) setFullTexts(map);
    })();
    return () => { cancelled = true; };
  }, [articles, stage, getFullText]);

  useEffect(() => () => controllerRef.current?.abort(), []);

  const summary = useMemo(() => {
    if (!fullTexts) return null;
    const alreadyValid = [];
    const needsText = [];
    const toSend = [];
    articles.forEach(article => {
      const fullText = fullTexts.get(article.id);
      const suggestion = article.aiSuggestions?.[stage];
      const valid = suggestion && suggestion.decision !== 'needs-text' && !isSuggestionStale(suggestion, protocol, stage, fullText);
      if (valid && !reevaluate) alreadyValid.push(article);
      else if (!hasEnoughText(article, stage, fullText)) needsText.push(article);
      else toSend.push(article);
    });

    const { questions } = buildQuestions(protocol, stage);
    const estimate = toSend.reduce((acc, article) => {
      const e = estimateTokens(buildState(article, stage, fullTexts.get(article.id)), questions);
      return { once: acc.once + e.once, perQuestion: acc.perQuestion + e.perQuestion };
    }, { once: 0, perQuestion: 0 });

    return { alreadyValid, needsText, toSend, estimate, hasQuestions: Object.keys(questions).length > 0 };
  }, [articles, fullTexts, protocol, stage, reevaluate]);

  const handleStart = async () => {
    if (!summary) return;
    const controller = new AbortController();
    controllerRef.current = controller;
    setPhase('running');
    setProgress({ done: 0, errors: 0 });
    setLastError(null);
    setSessionUsage({ tokens: 0, requests: 0 });

    const localCounts = { included: 0, excluded: 0, uncertain: 0, 'needs-text': 0 };
    let buffer = [];
    let usageTokens = 0;
    let requests = 0;

    const flush = () => {
      if (buffer.length) {
        onResults(stage, buffer);
        buffer = [];
      }
      if (requests) {
        onUsage({ inputTokens: usageTokens, requests });
        usageTokens = 0;
        requests = 0;
      }
    };
    const timer = setInterval(flush, FLUSH_INTERVAL_MS);

    // Artigos sem texto suficiente são marcados sem chamar a API
    const sendable = [...summary.toSend];
    summary.needsText.forEach(article => {
      buffer.push({
        id: article.id,
        suggestion: {
          model: null,
          evaluatedAt: new Date().toISOString(),
          decision: 'needs-text',
          confidence: 0,
          criteria: [],
        },
      });
      localCounts['needs-text'] += 1;
    });
    setCounts({ ...localCounts });

    try {
      await runQueue(
        sendable,
        (article) => evaluateArticle({
          article,
          protocol,
          stage,
          settings,
          fullText: fullTexts.get(article.id),
          signal: controller.signal,
        }),
        {
          concurrency: settings.concurrency || 4,
          signal: controller.signal,
          onResult: (article, result, error) => {
            if (error) {
              setLastError(jevErrorMessage(t, error));
              setProgress(prev => ({ done: prev.done + 1, errors: prev.errors + 1 }));
              return;
            }
            buffer.push({ id: article.id, suggestion: result.suggestion });
            const tokens = result.usage?.input_tokens ?? 0;
            usageTokens += tokens;
            requests += 1;
            setSessionUsage(prev => ({ tokens: prev.tokens + tokens, requests: prev.requests + 1 }));
            localCounts[result.suggestion.decision] = (localCounts[result.suggestion.decision] ?? 0) + 1;
            setCounts({ ...localCounts });
            setProgress(prev => ({ ...prev, done: prev.done + 1 }));
          },
        }
      );
      setPhase(controller.signal.aborted ? 'stopped' : 'done');
    } catch (error) {
      controller.abort();
      setLastError(jevErrorMessage(t, error));
      setPhase('stopped');
    } finally {
      clearInterval(timer);
      flush();
    }
  };

  const handleStop = () => controllerRef.current?.abort();

  const fmtTokens = (n) => n.toLocaleString();
  const fmtCost = (n) => ((n / 1e6) * PRICE_PER_MTOK_USD).toFixed(n > 1e6 ? 2 : 4);
  const total = summary?.toSend.length ?? 0;
  const projectTokens = getAiConfig(protocol).usage.inputTokens;

  const footer = phase === 'running' ? (
    <button onClick={handleStop} className={secondaryBtn}>{t('assist.batchStop')}</button>
  ) : phase === 'idle' ? (
    <>
      <button onClick={onClose} className={secondaryBtn}>{t('assist.cancel')}</button>
      <button
        onClick={handleStart}
        disabled={!summary || !summary.hasQuestions || (summary.toSend.length === 0 && summary.needsText.length === 0)}
        className={primaryBtn}
      >
        {t('assist.batchStart')}
      </button>
    </>
  ) : (
    <button onClick={onClose} className={primaryBtn}>{t('assist.batchClose')}</button>
  );

  return (
    <ModalShell
      title={t('assist.batchTitle', { section: sectionTitle })}
      onClose={phase === 'running' ? handleStop : onClose}
      footer={footer}
    >
      {!summary && <p>{t('assist.evaluating')}</p>}

      {summary && phase === 'idle' && (
        <>
          <p>{t('assist.batchPending', { count: articles.length })}</p>
          {articles.length === 0 ? (
            <p>{t('assist.batchNothing')}</p>
          ) : (
            <ul className="space-y-1 list-disc pl-5">
              <li>{t('assist.batchToSend', { count: summary.toSend.length })}</li>
              {summary.alreadyValid.length > 0 && <li>{t('assist.batchAlready', { count: summary.alreadyValid.length })}</li>}
              {summary.needsText.length > 0 && <li>{t('assist.batchNeedsText', { count: summary.needsText.length })}</li>}
            </ul>
          )}
          {(summary.alreadyValid.length > 0 || reevaluate) && (
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={reevaluate}
                onChange={(e) => setReevaluate(e.target.checked)}
                className="rounded border-gray-300 dark:border-gray-600 text-indigo-600 focus:ring-indigo-500"
              />
              {t('assist.batchReevaluate')}
            </label>
          )}
          {summary.toSend.length > 0 && (
            <p className="text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/30 rounded-lg px-3 sm:px-4 py-2 sm:py-2.5">
              {t('assist.batchEstimate', {
                min: fmtTokens(summary.estimate.once),
                max: fmtTokens(summary.estimate.perQuestion),
                costMin: fmtCost(summary.estimate.once),
                costMax: fmtCost(summary.estimate.perQuestion),
              })}
            </p>
          )}
        </>
      )}

      {phase !== 'idle' && (
        <>
          <p className="font-medium text-gray-800 dark:text-gray-100">
            {phase === 'running'
              ? t('assist.batchProgress', { done: progress.done, total })
              : phase === 'done' ? t('assist.batchDone') : t('assist.batchStopped')}
            {progress.errors > 0 && ` · ${t('assist.batchErrors', { count: progress.errors })}`}
          </p>
          <div className="w-full h-2 rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden">
            <div
              className="h-full bg-indigo-600 dark:bg-indigo-500 transition-all duration-300"
              style={{ width: `${total ? (progress.done / total) * 100 : 100}%` }}
            />
          </div>
          <CountRow items={[
            { label: t('assist.batchResultInclude'), value: counts.included, cls: 'bg-green-50 dark:bg-green-900/30 text-green-800 dark:text-green-300' },
            { label: t('assist.batchResultExclude'), value: counts.excluded, cls: 'bg-red-50 dark:bg-red-900/30 text-red-800 dark:text-red-300' },
            { label: t('assist.batchResultUncertain'), value: counts.uncertain, cls: 'bg-gray-50 dark:bg-gray-700/50 text-gray-800 dark:text-gray-200' },
            { label: t('assist.batchResultNeedsText'), value: counts['needs-text'], cls: 'bg-yellow-50 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-300' },
          ]} />
          {lastError && (
            <p className="text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-900/30 rounded-lg px-3 py-2">{lastError}</p>
          )}
          {phase !== 'running' && sessionUsage.requests > 0 && (
            <div className="text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/30 rounded-lg px-3 sm:px-4 py-2 sm:py-2.5 space-y-1">
              {sessionUsage.tokens > 0 ? (
                <p>
                  {t('assist.batchUsage', {
                    tokens: fmtTokens(sessionUsage.tokens),
                    requests: sessionUsage.requests,
                    cost: fmtCost(sessionUsage.tokens),
                  })}
                </p>
              ) : (
                <p>{t('assist.batchUsageUnavailable', { requests: sessionUsage.requests })}</p>
              )}
              {projectTokens > 0 && (
                <p className="text-xs">
                  {t('assist.batchUsageProject', { tokens: fmtTokens(projectTokens), cost: fmtCost(projectTokens) })}
                </p>
              )}
            </div>
          )}
        </>
      )}
    </ModalShell>
  );
}

// Confirmação antes de aplicar as sugestões em lote
export function JevApplyModal({ sectionTitle, rule, preview, onConfirm, onClose }) {
  const { t } = useTranslation();
  const nothing = preview.include + preview.exclude === 0;

  return (
    <ModalShell
      title={t('assist.applyTitle', { section: sectionTitle })}
      onClose={onClose}
      footer={
        <>
          <button onClick={onClose} className={secondaryBtn}>{t('assist.cancel')}</button>
          <button onClick={onConfirm} disabled={nothing} className={primaryBtn}>{t('assist.applyConfirm')}</button>
        </>
      }
    >
      <p>
        {rule.mode === 'inclusive'
          ? t('assist.applyBodyInclusive', { includeAt: rule.includeAt, excludeAt: rule.excludeAt })
          : t('assist.applyBody', { applyAt: rule.applyAt })}
      </p>
      {nothing ? (
        <p className="font-medium">{t('assist.applyNothing')}</p>
      ) : (
        <ul className="space-y-1 list-disc pl-5">
          <li className="text-green-700 dark:text-green-300">{t('assist.applyInclude', { count: preview.include })}</li>
          <li className="text-red-700 dark:text-red-300">{t('assist.applyExclude', { count: preview.exclude })}</li>
          <li>{t('assist.applyRemaining', { count: preview.remaining })}</li>
        </ul>
      )}
    </ModalShell>
  );
}
