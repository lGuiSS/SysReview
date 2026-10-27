import { useState } from "react";
import { useTranslation } from 'react-i18next';
import { X, ListChecks, Link } from "lucide-react";
import { evaluate, DEFAULT_MODEL, PRICE_PER_MTOK_USD } from "../ai/jevClient.js";
import { getAiConfig } from "../ai/screening.js";
import { jevErrorMessage } from "../ai/messages.js";

const inputCls = `w-full px-3 py-1.5 sm:py-2 text-xs sm:text-sm rounded-lg border transition-colors
  bg-white dark:bg-gray-700 text-gray-800 dark:text-white
  placeholder-gray-400 dark:placeholder-gray-500 border-gray-200 dark:border-gray-600
  focus:outline-none focus:ring-2 focus:ring-indigo-500`;

const labelCls = "text-xs sm:text-sm text-gray-500 dark:text-gray-400 mb-1.5 block";

export function JevSettingsModal({ settings, aiConfig, onSave, onClose }) {
  const { t } = useTranslation();
  const config = getAiConfig({ aiConfig });
  const [apiKey, setApiKey] = useState(settings.apiKey || '');
  const [baseUrl, setBaseUrl] = useState(settings.baseUrl || '');
  const [concurrency, setConcurrency] = useState(settings.concurrency || 4);
  const [longContext, setLongContext] = useState(!!settings.longContext);
  const [model, setModel] = useState(config.model || DEFAULT_MODEL);
  const toPct = (v) => Math.round(v * 1000) / 10;
  const [rules, setRules] = useState({
    f1Include: toPct(config.rules.filter1.includeAt),
    f1Exclude: toPct(config.rules.filter1.excludeAt),
    f2Apply: toPct(config.rules.filter2.applyAt),
    f3Apply: toPct(config.rules.filter3.applyAt),
  });
  const [minQuality, setMinQuality] = useState(config.minQuality);
  const [testState, setTestState] = useState(null); // { status: 'testing' | 'ok' | 'error', message }

  // Limites de cada campo (em %): a inclusão do Filtro 1 aceita valores baixos (modo inclusivo)
  const RULE_LIMITS = { f1Include: [5, 100], f1Exclude: [50, 100], f2Apply: [50, 100], f3Apply: [50, 100] };
  const clampRule = (key, v) => {
    const [min, max] = RULE_LIMITS[key];
    return Math.min(max, Math.max(min, Number(v) || min));
  };

  const handleTest = async () => {
    setTestState({ status: 'testing' });
    try {
      const response = await evaluate({
        apiKey: apiKey.trim(),
        baseUrl: baseUrl.trim(),
        model: model.trim() || DEFAULT_MODEL,
        state: { title: 'Connection test' },
        questions: { ping: { type: 'noul', instructions: 'Is `title` a non-empty text?' } },
        maxRetries: 0,
      });
      setTestState({ status: 'ok', message: t('assist.testOk', { model: response.model || model }) });
    } catch (error) {
      setTestState({ status: 'error', message: jevErrorMessage(t, error) });
    }
  };

  const handleSave = () => {
    onSave(
      {
        apiKey: apiKey.trim(),
        baseUrl: baseUrl.trim(),
        concurrency: Math.min(16, Math.max(1, Number(concurrency) || 4)),
        longContext,
      },
      {
        ...config,
        model: model.trim() || DEFAULT_MODEL,
        rules: {
          filter1: {
            ...config.rules.filter1,
            includeAt: clampRule('f1Include', rules.f1Include) / 100,
            excludeAt: clampRule('f1Exclude', rules.f1Exclude) / 100,
          },
          filter2: { ...config.rules.filter2, applyAt: clampRule('f2Apply', rules.f2Apply) / 100 },
          filter3: { ...config.rules.filter3, applyAt: clampRule('f3Apply', rules.f3Apply) / 100 },
        },
        minQuality: Math.min(2, Math.max(0, Number(minQuality) || 0)),
      }
    );
  };

  const usageTokens = config.usage.inputTokens || 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 dark:bg-black/50 p-4">
      <div className="w-80 sm:w-[26rem] md:w-[32rem] max-h-[92dvh] flex flex-col bg-white dark:bg-gray-800 rounded-xl sm:rounded-2xl shadow-xl border border-gray-200 dark:border-gray-700">

        {/* Header */}
        <div className="flex items-center justify-between px-4 sm:px-6 py-3 sm:py-4 border-b border-gray-100 dark:border-gray-700">
          <div className="flex items-center gap-2 sm:gap-3">
            <ListChecks className="h-4 w-4 sm:h-5 sm:w-5 text-indigo-600 dark:text-indigo-400" />
            <p className="text-sm sm:text-base font-semibold text-gray-800 dark:text-white">
              {t('assist.settingsTitle')}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1 sm:p-1.5 rounded-md text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:text-gray-300 dark:hover:bg-gray-700 transition-colors"
          >
            <X className="h-4 w-4 sm:h-5 sm:w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-4 sm:p-6 space-y-4 sm:space-y-5 overflow-y-auto">
          <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400">
            {t('assist.intro')}
          </p>

          <div>
            <label className={labelCls}>{t('assist.apiKey')}</label>
            <div className="flex gap-2">
              <input
                type="password"
                autoComplete="off"
                value={apiKey}
                onChange={(e) => { setApiKey(e.target.value); setTestState(null); }}
                placeholder={t('assist.apiKeyPlaceholder')}
                className={inputCls}
              />
              {apiKey && (
                <button
                  onClick={() => { setApiKey(''); setTestState(null); }}
                  className="px-3 text-xs sm:text-sm rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 dark:bg-gray-700 dark:hover:bg-gray-600 dark:text-gray-300 whitespace-nowrap transition-colors"
                >
                  {t('assist.removeKey')}
                </button>
              )}
            </div>
            <div className="flex flex-wrap justify-between gap-2 mt-1">
              <p className="text-xs text-gray-400 dark:text-gray-500">{t('assist.apiKeyHint')}</p>
              <a
                href="https://console.typesafe.ai/keys"
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-1 text-xs text-indigo-600 dark:text-indigo-400 hover:underline"
              >
                <Link size={12} />
                {t('assist.getKey')}
              </a>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>{t('assist.model')}</label>
              <input value={model} onChange={(e) => setModel(e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>{t('assist.concurrency')}</label>
              <input
                type="number"
                min={1}
                max={16}
                value={concurrency}
                onChange={(e) => setConcurrency(e.target.value)}
                className={inputCls}
              />
            </div>
          </div>

          <div>
            <label className={labelCls}>{t('assist.baseUrl')}</label>
            <input
              value={baseUrl}
              onChange={(e) => { setBaseUrl(e.target.value); setTestState(null); }}
              placeholder="https://api.typesafe.ai"
              className={inputCls}
            />
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">{t('assist.baseUrlHint')}</p>
          </div>

          <label className="flex items-center gap-2 text-xs sm:text-sm text-gray-700 dark:text-gray-300 cursor-pointer">
            <input
              type="checkbox"
              checked={longContext}
              onChange={(e) => setLongContext(e.target.checked)}
              className="rounded border-gray-300 dark:border-gray-600 text-indigo-600 focus:ring-indigo-500"
            />
            {t('assist.longContext')}
          </label>

          <div className="space-y-3">
            <label className={labelCls}>{t('assist.rulesTitle')}</label>
            {[
              { key: 'f1Include', label: t('assist.ruleF1Include') },
              { key: 'f1Exclude', label: t('assist.ruleF1Exclude') },
              { key: 'f2Apply', label: t('assist.ruleApply', { n: 2 }) },
              { key: 'f3Apply', label: t('assist.ruleApply', { n: 3 }) },
            ].map(({ key, label }) => (
              <div key={key} className="flex items-center justify-between gap-3">
                <span className="text-xs sm:text-sm text-gray-700 dark:text-gray-300">{label}</span>
                <div className="flex items-center gap-1 shrink-0">
                  <span className="text-xs text-gray-500 dark:text-gray-400">≥</span>
                  <input
                    type="number"
                    min={RULE_LIMITS[key][0]}
                    max={RULE_LIMITS[key][1]}
                    step={0.5}
                    value={rules[key]}
                    onChange={(e) => setRules(prev => ({ ...prev, [key]: e.target.value }))}
                    onBlur={() => setRules(prev => ({ ...prev, [key]: clampRule(key, prev[key]) }))}
                    className={`${inputCls} w-20`}
                  />
                  <span className="text-xs text-gray-500 dark:text-gray-400">%</span>
                </div>
              </div>
            ))}
            <p className="text-xs text-gray-400 dark:text-gray-500">{t('assist.rulesHint')}</p>
          </div>

          <div>
            <label className={labelCls}>{t('assist.minQuality')}</label>
            <input
              type="number"
              min={0}
              max={2}
              step={0.5}
              value={minQuality}
              onChange={(e) => setMinQuality(e.target.value)}
              className={`${inputCls} max-w-[6rem]`}
            />
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">{t('assist.minQualityLevels')}</p>
          </div>

          {usageTokens > 0 && (
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {t('assist.usage', {
                tokens: usageTokens.toLocaleString(),
                cost: ((usageTokens / 1e6) * PRICE_PER_MTOK_USD).toFixed(4),
              })}
            </p>
          )}

          {testState && testState.status !== 'testing' && (
            <p className={`text-xs sm:text-sm rounded-lg px-3 sm:px-4 py-2 sm:py-2.5 ${testState.status === 'ok'
              ? 'text-green-700 dark:text-green-300 bg-green-50 dark:bg-green-900/30'
              : 'text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-900/30'
              }`}>
              {testState.message}
            </p>
          )}
        </div>

        {/* Footer */}
        <div className="flex gap-2 sm:gap-3 px-4 sm:px-6 py-4 sm:py-5 border-t border-gray-100 dark:border-gray-700">
          <button
            onClick={handleTest}
            disabled={!apiKey.trim() || testState?.status === 'testing'}
            className="flex-1 px-3 py-1.5 sm:py-2 text-xs sm:text-sm font-medium rounded-lg
              bg-gray-100 hover:bg-gray-200 text-gray-700
              dark:bg-gray-700 dark:hover:bg-gray-600 dark:text-gray-300
              disabled:opacity-40 disabled:cursor-not-allowed
              transition-colors duration-150"
          >
            {testState?.status === 'testing' ? t('assist.testing') : t('assist.test')}
          </button>
          <button
            onClick={onClose}
            className="flex-1 px-3 py-1.5 sm:py-2 text-xs sm:text-sm font-medium rounded-lg
              bg-gray-100 hover:bg-gray-200 text-gray-700
              dark:bg-gray-700 dark:hover:bg-gray-600 dark:text-gray-300
              transition-colors duration-150"
          >
            {t('assist.cancel')}
          </button>
          <button
            onClick={handleSave}
            className="flex-1 px-3 py-1.5 sm:py-2 text-xs sm:text-sm font-medium rounded-lg
              bg-indigo-600 hover:bg-indigo-700 text-white
              dark:bg-indigo-500 dark:hover:bg-indigo-600
              transition-colors duration-150"
          >
            {t('assist.save')}
          </button>
        </div>
      </div>
    </div>
  );
}
