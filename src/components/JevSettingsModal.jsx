import { ChatgptConnection } from "./ChatgptConnection.jsx";
import { chatgptRequest, isLocalAiHost } from "../ai/chatgptClient.js";
import { useEffect, useState } from "react";
import { DialogPanel } from "./Dialog.jsx";
import { OpenAiIcon, TypesafeIcon } from "./AiProviderIcons.jsx";
import { useFormat } from "../i18n/format.js";
import { useTranslation } from 'react-i18next';
import { X, ListChecks, Link } from "lucide-react";
import { evaluate, DEFAULT_MODEL, DEFAULT_CONCURRENCY, PRICE_PER_MTOK_USD } from "../ai/jevClient.js";
import { getAiConfig } from "../ai/screening.js";
import { jevErrorMessage } from "../ai/messages.js";
import { effortOptions, selectedEffort } from '../ai/modelCapabilities.js';
import { evaluateOpenai, listOpenaiModels } from "../ai/openaiClient.js";

const inputCls = `w-full px-3 py-2 text-sm rounded-lg border transition-colors
  bg-white dark:bg-gray-700 text-gray-800 dark:text-white
  placeholder-gray-400 dark:placeholder-gray-500 border-gray-300 dark:border-gray-600
  focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500`;

const labelCls = "text-sm font-medium text-gray-700 dark:text-gray-200 mb-1.5 block";
const hintCls = "text-xs text-gray-500 dark:text-gray-400";
const sectionTitleCls = "text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400";

const PROVIDERS = [
  { id: 'jev', name: 'JEV', detail: 'TypeSafe', icon: <TypesafeIcon className="h-5 w-5 shrink-0" /> },
  { id: 'openai', name: 'OpenAI', detail: 'API', icon: <OpenAiIcon className="h-5 w-5 shrink-0" /> },
  { id: 'chatgpt', name: 'ChatGPT', detail: 'OAuth', icon: <OpenAiIcon className="h-5 w-5 shrink-0" /> },
];

// Botões agrupados (rádios nativos: setas do teclado alternam o provedor)
// Classes literais para o Tailwind gerar: uma coluna por provedor a partir de sm
const PICKER_COLS = { 2: 'sm:grid-cols-2', 3: 'sm:grid-cols-3' };

function ProviderPicker({ label, value, onChange, providers }) {
  return (
    <fieldset>
      <legend className={labelCls}>{label}</legend>
      <div className={`grid grid-cols-1 ${PICKER_COLS[providers.length] || ''} gap-1 p-1 rounded-xl bg-gray-100 dark:bg-gray-900/60`}>
        {providers.map(({ id, name, detail, icon }) => {
          const active = value === id;
          return (
            <label key={id} translate="no"
              className={`relative flex items-center gap-2.5 px-3 py-2 rounded-lg cursor-pointer select-none transition-colors
                has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-indigo-500
                ${active
                  ? 'bg-white dark:bg-gray-700 shadow-sm text-gray-900 dark:text-white'
                  : 'text-gray-600 dark:text-gray-400 hover:bg-white/60 hover:text-gray-900 dark:hover:bg-gray-700/50 dark:hover:text-gray-200'}`}>
              <input type="radio" name="ai-provider" value={id} checked={active} onChange={() => onChange(id)} className="sr-only" />
              {icon}
              <span className="flex flex-col leading-tight min-w-0">
                <span className="text-sm font-semibold">{name}</span>
                <span className="text-xs text-gray-500 dark:text-gray-400">{detail}</span>
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

// Controle deslizante + campo numérico ligados ao mesmo valor
function RangeField({ id, label, hint, min, max, step, value, onChange, onBlur, prefix, suffix, autoFocus }) {
  const numeric = Math.min(max, Math.max(min, Number(value) || min));
  return (
    <div>
      <label htmlFor={id} className={labelCls}>{label}</label>
      <div className="flex items-center gap-3">
        <input
          type="range"
          aria-label={label}
          min={min}
          max={max}
          step={step}
          value={numeric}
          onChange={(e) => onChange(e.target.value)}
          className="flex-1 min-w-0 h-2 cursor-pointer accent-indigo-600 dark:accent-indigo-400"
        />
        <div className="flex items-center gap-1 shrink-0">
          {/* prefixo e sufixo sempre ocupam espaço para os campos ficarem alinhados */}
          <span className="w-4 shrink-0 text-center text-sm text-gray-500 dark:text-gray-400">{prefix}</span>
          <input
            type="number"
            id={id}
            inputMode="decimal"
            autoFocus={autoFocus}
            min={min}
            max={max}
            step={step}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onBlur={onBlur}
            className={`${inputCls} w-20 text-right tabular-nums`}
          />
          <span className="w-4 shrink-0 text-sm text-gray-500 dark:text-gray-400">{suffix}</span>
        </div>
      </div>
      {hint && <p className={`${hintCls} mt-1.5`}>{hint}</p>}
    </div>
  );
}

function Section({ title, children }) {
  return (
    <section className="space-y-4 pt-5 first:pt-0">
      {title && <h3 className={sectionTitleCls}>{title}</h3>}
      {children}
    </section>
  );
}

export function JevSettingsModal({ settings, aiConfig, onSave, onSaveRules, onClose, rulesOnly = false }) {
  const { t } = useTranslation();
  const fmt = useFormat();
  const config = getAiConfig({ aiConfig });
  // O login do ChatGPT (OAuth) depende do serviço local: fora do computador do usuário a opção nem aparece
  const chatgptHere = isLocalAiHost();
  const providers = chatgptHere ? PROVIDERS : PROVIDERS.filter(p => p.id !== 'chatgpt');
  const [provider, setProvider] = useState(providers.some(p => p.id === settings.provider) ? settings.provider : 'jev');
  const [chatgptModel, setChatgptModel] = useState(settings.chatgptModel || '');
  const [effortByModel, setEffortByModel] = useState(settings.effortByModel || {});
  const [chatgptConnected, setChatgptConnected] = useState(false);
  const [apiKey, setApiKey] = useState(settings.apiKey || '');
  const [openaiKey, setOpenaiKey] = useState(settings.openaiKey || '');
  const [openaiModel, setOpenaiModel] = useState(settings.openaiModel || '');
  const [openaiModels, setOpenaiModels] = useState({ status: 'idle', list: [], error: '' }); // status: idle | loading | ok | error
  const [baseUrl, setBaseUrl] = useState(settings.baseUrl || '');
  const [concurrency, setConcurrency] = useState(settings.concurrency || DEFAULT_CONCURRENCY);
  const [longContext, setLongContext] = useState(!!settings.longContext);
  const [model, setModel] = useState(config.model || DEFAULT_MODEL);
  const activeModel = provider === 'chatgpt' ? chatgptModel : provider === 'openai' ? openaiModel : model;
  const effort = selectedEffort({ provider, effortByModel }, activeModel);
  const efforts = effortOptions(provider, activeModel);
  const effortValid = efforts.includes(effort);
  const connected = chatgptConnected;
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
  const clampConcurrency = (v) => Math.min(16, Math.max(1, Math.round(Number(v)) || DEFAULT_CONCURRENCY));
  const clampQuality = (v) => Math.min(2, Math.max(0, Number(v) || 0));

  // Lista os modelos da conta OpenAI quando a chave muda (com espera para não consultar a cada tecla)
  const trimmedOpenaiKey = openaiKey.trim();
  useEffect(() => {
    if (provider !== 'openai' || !trimmedOpenaiKey) { setOpenaiModels({ status: 'idle', list: [], error: '' }); return; }
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setOpenaiModels(prev => ({ ...prev, status: 'loading', error: '' }));
      try {
        const list = await listOpenaiModels({ apiKey: trimmedOpenaiKey, signal: controller.signal });
        setOpenaiModels({ status: 'ok', list, error: '' });
      } catch (error) {
        if (error?.name !== 'AbortError') setOpenaiModels({ status: 'error', list: [], error: jevErrorMessage(t, error) });
      }
    }, 500);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [provider, trimmedOpenaiKey, t]);

  const pingQuestion = { ping: { type: 'noul', instructions: 'Is the title nonempty?' } };
  const testDisabled = provider === 'chatgpt' ? !connected || !activeModel || !effortValid
    : provider === 'openai' ? !trimmedOpenaiKey || !openaiModel || !effortValid : !apiKey.trim();
  const saveDisabled = provider === 'chatgpt' ? !connected || !activeModel || !effortValid
    : provider === 'openai' ? !trimmedOpenaiKey || !openaiModel || !effortValid : false;

  const handleTest = async () => {
    setTestState({ status: 'testing' });
    try {
      const status = provider === 'chatgpt' ? await chatgptRequest('status', { provider }) : null;
      const response = provider === 'chatgpt' ? await chatgptRequest('evaluate', { provider, body: { model: activeModel, effort, connectionId: status.connectionId,
        state: { title: 'Connection test' }, questions: pingQuestion } })
        : provider === 'openai' ? await evaluateOpenai({ apiKey: trimmedOpenaiKey, model: openaiModel, effort, state: { title: 'Connection test' }, questions: pingQuestion })
        : await evaluate({
        apiKey: apiKey.trim(),
        baseUrl: baseUrl.trim(),
        model: model.trim() || DEFAULT_MODEL,
        state: { title: 'Connection test' },
        questions: { ping: { type: 'noul', instructions: 'Is `title` a non-empty text?' } },
        maxRetries: 0,
      });
      setTestState({ status: 'ok', message: t('assist.testOk', { model: response.model || activeModel }) });
    } catch (error) {
      setTestState({ status: 'error', message: jevErrorMessage(t, error) });
    }
  };

  const handleSave = () => {
    const nextConfig = {
      ...config,
      rules: {
        filter1: { ...config.rules.filter1, includeAt: clampRule('f1Include', rules.f1Include) / 100, excludeAt: clampRule('f1Exclude', rules.f1Exclude) / 100 },
        filter2: { ...config.rules.filter2, applyAt: clampRule('f2Apply', rules.f2Apply) / 100 },
        filter3: { ...config.rules.filter3, applyAt: clampRule('f3Apply', rules.f3Apply) / 100 },
      },
      minQuality: clampQuality(minQuality),
    };
    if (rulesOnly) { onSaveRules(nextConfig); return; }
    onSave({ provider, chatgptModel, effortByModel, apiKey: apiKey.trim(), baseUrl: baseUrl.trim(),
      openaiKey: trimmedOpenaiKey, openaiModel,
      concurrency: clampConcurrency(concurrency), longContext },
    { ...nextConfig, model: model.trim() || DEFAULT_MODEL });
  };

  const usageTokens = config.usage.byProvider?.jev?.inputTokens ?? (config.usage.byProvider ? 0 : config.usage.inputTokens);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 dark:bg-black/50 p-4">
      <DialogPanel onClose={onClose} labelledBy="jev-settings-title" className="w-full max-w-[34rem] max-h-[92dvh] flex flex-col bg-white dark:bg-gray-800 rounded-xl sm:rounded-2xl shadow-xl border border-gray-200 dark:border-gray-700">

        {/* Header */}
        <div className="flex items-center justify-between px-4 sm:px-6 py-3 sm:py-4 border-b border-gray-100 dark:border-gray-700">
          <div className="flex items-center gap-2 sm:gap-3">
            <ListChecks className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
            <h2 id="jev-settings-title" className="text-base font-semibold text-gray-900 dark:text-white">
              {t(rulesOnly ? 'assist.editRules' : 'assist.settingsTitle')}
            </h2>
          </div>
          <button
            onClick={onClose}
            aria-label={t('modals.close')}
            className="p-1.5 rounded-md border-none bg-transparent text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:text-gray-300 dark:hover:bg-gray-700 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-4 sm:p-6 overflow-y-auto overscroll-contain divide-y divide-gray-100 dark:divide-gray-700 [&>section+section]:mt-5">
          {rulesOnly && <p className="pb-5 text-sm text-gray-600 dark:text-gray-300">{t('assist.rulesNoReevaluation')}</p>}
          {!rulesOnly && <>
          <Section>
            <p className="text-sm text-gray-600 dark:text-gray-300">{t(chatgptHere ? 'assist.intro' : 'assist.introWeb')}</p>
            <ProviderPicker label={t('assist.provider')} value={provider} providers={providers} onChange={(id) => { setProvider(id); setTestState(null); }} />
            {provider === 'chatgpt' && <ChatgptConnection model={chatgptModel} onModelChange={setChatgptModel} onConnectedChange={setChatgptConnected} />}
            {provider === 'openai' && <>
            <div>
              <label htmlFor="openai-api-key" className={labelCls}>{t('assist.openaiKey')}</label>
              <div className="flex gap-2">
                <input id="openai-api-key"
                  type="password"
                  autoComplete="off"
                  spellCheck={false}
                  value={openaiKey}
                  onChange={(e) => { setOpenaiKey(e.target.value); setTestState(null); }}
                  placeholder={t('assist.apiKeyPlaceholder')}
                  className={inputCls}
                />
                {openaiKey && (
                  <button
                    onClick={() => { setOpenaiKey(''); setTestState(null); }}
                    className="px-3 text-sm rounded-lg border-none bg-gray-100 hover:bg-gray-200 text-gray-700 dark:bg-gray-700 dark:hover:bg-gray-600 dark:text-gray-200 whitespace-nowrap transition-colors"
                  >
                    {t('assist.removeKey')}
                  </button>
                )}
              </div>
              <div className="flex flex-wrap justify-between gap-2 mt-1.5">
                <p className={hintCls}>{t('assist.openaiKeyHint')}</p>
                <a
                  href="https://platform.openai.com/api-keys"
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-1 text-xs font-medium text-indigo-600 dark:text-indigo-400 hover:underline"
                >
                  <Link size={12} aria-hidden="true" />
                  {t('assist.getKey')}
                </a>
              </div>
            </div>
            <div>
              <label htmlFor="openai-model" className={labelCls}>{t('assist.model')}</label>
              <select id="openai-model" value={openaiModel} disabled={!trimmedOpenaiKey}
                onChange={(e) => { setOpenaiModel(e.target.value); setTestState(null); }}
                className={`${inputCls} disabled:opacity-50`}>
                <option value="">{t('assist.chatgptChooseModel')}</option>
                {openaiModel && !openaiModels.list.includes(openaiModel) && <option value={openaiModel}>{openaiModel}</option>}
                {openaiModels.list.map(id => <option key={id} value={id}>{id}</option>)}
              </select>
              {openaiModels.status === 'error'
                ? <p role="alert" className="mt-1.5 text-sm text-red-600 dark:text-red-400">{openaiModels.error}</p>
                : <p role="status" className={`${hintCls} mt-1.5`}>
                  {openaiModels.status === 'loading' ? t('assist.openaiModelsLoading') : !trimmedOpenaiKey ? t('assist.openaiModelsHint') : null}
                </p>}
            </div>
            </>}
            {provider === 'jev' && <>
            <div>
              <label htmlFor="jev-api-key" className={labelCls}>{t('assist.apiKey')}</label>
              <div className="flex gap-2">
                <input id="jev-api-key"
                  type="password"
                  autoComplete="off"
                  spellCheck={false}
                  value={apiKey}
                  onChange={(e) => { setApiKey(e.target.value); setTestState(null); }}
                  placeholder={t('assist.apiKeyPlaceholder')}
                  className={inputCls}
                />
                {apiKey && (
                  <button
                    onClick={() => { setApiKey(''); setTestState(null); }}
                    className="px-3 text-sm rounded-lg border-none bg-gray-100 hover:bg-gray-200 text-gray-700 dark:bg-gray-700 dark:hover:bg-gray-600 dark:text-gray-200 whitespace-nowrap transition-colors"
                  >
                    {t('assist.removeKey')}
                  </button>
                )}
              </div>
              <div className="flex flex-wrap justify-between gap-2 mt-1.5">
                <p className={hintCls}>{t('assist.apiKeyHint')}</p>
                <a
                  href="https://console.typesafe.ai/keys"
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-1 text-xs font-medium text-indigo-600 dark:text-indigo-400 hover:underline"
                >
                  <Link size={12} aria-hidden="true" />
                  {t('assist.getKey')}
                </a>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)] gap-3">
              <div>
                <label htmlFor="jev-model" className={labelCls}>{t('assist.model')}</label>
                <input id="jev-model" value={model} spellCheck={false} autoComplete="off" onChange={(e) => setModel(e.target.value)} className={`${inputCls} font-mono`} />
              </div>
              <div>
                <label htmlFor="jev-base-url" className={labelCls}>{t('assist.baseUrl')}</label>
                <input id="jev-base-url"
                  type="url"
                  spellCheck={false}
                  autoComplete="off"
                  value={baseUrl}
                  onChange={(e) => { setBaseUrl(e.target.value); setTestState(null); }}
                  placeholder="https://api.typesafe.ai"
                  className={inputCls}
                />
              </div>
            </div>
            <p className={`${hintCls} -mt-2`}>{t('assist.baseUrlHint')}</p>
            </>}
          </Section>

          <Section title={t('assist.sectionPerformance')}>
            <RangeField
              id="jev-concurrency"
              label={t('assist.concurrency')}
              min={1}
              max={16}
              step={1}
              value={concurrency}
              onChange={setConcurrency}
              onBlur={() => setConcurrency(clampConcurrency(concurrency))}
            />
            {provider !== 'jev' && <div>
              <label htmlFor="ai-effort" className={labelCls}>{t('assist.effortLabel')}</label>
              <select id="ai-effort" value={effort} onChange={e => { setEffortByModel(prev => ({ ...prev, [`${provider}:${activeModel}`]: e.target.value })); setTestState(null); }} className={inputCls}>
                {!effortValid && <option value={effort} disabled>{t('assist.effortInvalid')}</option>}
                {efforts.map(value => <option key={value} value={value}>{t(`assist.effort.${value}`, { defaultValue: value })}</option>)}
              </select>
              <p className={`${hintCls} mt-1.5`}>{t('assist.effortHint')}</p>
              {!effortValid && <p role="alert" className="mt-1.5 text-sm text-red-600 dark:text-red-400">{t('assist.effortInvalid')}</p>}
            </div>}
            {provider === 'jev' && <label className="flex items-center gap-2.5 text-sm text-gray-700 dark:text-gray-200 cursor-pointer">
              <input
                type="checkbox"
                checked={longContext}
                onChange={(e) => setLongContext(e.target.checked)}
                className="h-4 w-4 rounded border-gray-300 dark:border-gray-600 accent-indigo-600 focus-visible:ring-indigo-500"
              />
              {t('assist.longContext')}
            </label>}
          </Section>
          </>}

          <Section title={rulesOnly ? null : t('assist.rulesTitle')}>
            {[
              { key: 'f1Include', label: t('assist.ruleF1Include') },
              { key: 'f1Exclude', label: t('assist.ruleF1Exclude') },
              { key: 'f2Apply', label: t('assist.ruleApply', { n: 2 }) },
              { key: 'f3Apply', label: t('assist.ruleApply', { n: 3 }) },
            ].map(({ key, label }) => (
              <RangeField
                key={key}
                id={`ai-rule-${key}`}
                label={label}
                autoFocus={rulesOnly && key === 'f1Include'}
                min={RULE_LIMITS[key][0]}
                max={RULE_LIMITS[key][1]}
                step={0.5}
                prefix="≥"
                suffix="%"
                value={rules[key]}
                onChange={(v) => setRules(prev => ({ ...prev, [key]: v }))}
                onBlur={() => setRules(prev => ({ ...prev, [key]: clampRule(key, prev[key]) }))}
              />
            ))}
            <p className={hintCls}>{t('assist.rulesHint')}</p>

            <RangeField
              id="jev-min-quality"
              label={t('assist.minQuality')}
              hint={t('assist.minQualityLevels')}
              min={0}
              max={2}
              step={0.5}
              prefix="≥"
              value={minQuality}
              onChange={setMinQuality}
              onBlur={() => setMinQuality(clampQuality(minQuality))}
            />
          </Section>

          {!rulesOnly && usageTokens > 0 && provider === 'jev' && (
            <p className={`${hintCls} pt-5`}>
              {t('assist.usage', {
                tokens: fmt.num(usageTokens),
                cost: fmt.num((usageTokens / 1e6) * PRICE_PER_MTOK_USD, 4),
              })}
            </p>
          )}
        </div>

        {testState && testState.status !== 'testing' && (
          <p role="status" className={`mx-4 sm:mx-6 mb-3 text-sm rounded-lg px-3 sm:px-4 py-2 sm:py-2.5 ${testState.status === 'ok'
            ? 'text-green-700 dark:text-green-300 bg-green-50 dark:bg-green-900/30'
            : 'text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-900/30'
            }`}>
            {testState.message}
          </p>
        )}

        {/* Footer */}
        <div className="flex gap-2 sm:gap-3 px-4 sm:px-6 py-4 border-t border-gray-100 dark:border-gray-700">
          {!rulesOnly && <button
            onClick={handleTest}
            disabled={testDisabled || testState?.status === 'testing'}
            className="flex-1 px-3 py-2 text-sm font-medium rounded-lg border-none
              bg-gray-100 hover:bg-gray-200 text-gray-700
              dark:bg-gray-700 dark:hover:bg-gray-600 dark:text-gray-200
              disabled:opacity-40 disabled:cursor-not-allowed
              transition-colors duration-150"
          >
            {testState?.status === 'testing' ? t('assist.testing') : t('assist.test')}
          </button>}
          <button
            onClick={onClose}
            className="flex-1 px-3 py-2 text-sm font-medium rounded-lg border-none
              bg-gray-100 hover:bg-gray-200 text-gray-700
              dark:bg-gray-700 dark:hover:bg-gray-600 dark:text-gray-200
              transition-colors duration-150"
          >
            {t('assist.cancel')}
          </button>
          <button
            onClick={handleSave}
            disabled={!rulesOnly && saveDisabled}
            className="flex-1 px-3 py-2 text-sm font-medium rounded-lg border-none
              bg-indigo-600 hover:bg-indigo-700 text-white
              dark:bg-indigo-500 dark:hover:bg-indigo-600
              disabled:opacity-40 disabled:cursor-not-allowed
              transition-colors duration-150"
          >
            {t('assist.save')}
          </button>
        </div>
      </DialogPanel>
    </div>
  );
}
