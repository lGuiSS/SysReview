import { useState } from "react";
import { useTranslation } from 'react-i18next';
import { Check, X, HelpCircle, FileText, ChevronDown, RefreshCw } from "lucide-react";
import { suggestionTooltip } from "../ai/messages.js";
import { suggestionProbability } from "../ai/screening.js";

const DECISION_STYLE = {
  included: { Icon: Check, cls: 'bg-green-100 dark:bg-green-900/50 text-green-800 dark:text-green-300', key: 'assist.suggestInclude' },
  excluded: { Icon: X, cls: 'bg-red-100 dark:bg-red-900/50 text-red-800 dark:text-red-300', key: 'assist.suggestExclude' },
  uncertain: { Icon: HelpCircle, cls: 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300', key: 'assist.suggestUncertain' },
  'needs-text': { Icon: FileText, cls: 'bg-yellow-100 dark:bg-yellow-900/50 text-yellow-800 dark:text-yellow-300', key: 'assist.needsText' },
};

const percent = (v) => Math.round((v ?? 0) * 100);

// Indicador discreto ao lado do status na lista de artigos
export const SuggestionBadge = ({ suggestion, stale }) => {
  const { t } = useTranslation();
  if (!suggestion) return null;
  const { Icon, cls } = DECISION_STYLE[suggestion.decision] ?? DECISION_STYLE.uncertain;

  return (
    <span
      className={`inline-flex items-center justify-center h-5 w-5 rounded-full ${cls} ${stale ? 'opacity-40' : ''}`}
      title={suggestionTooltip(t, suggestion, stale)}
    >
      <Icon size={12} strokeWidth={2.5} />
    </span>
  );
};

const ProbabilityRow = ({ id, label, value, tone }) => (
  <div className="grid grid-cols-[3rem_1fr_3rem] items-center gap-2 text-sm">
    <span className="font-medium text-gray-700 dark:text-gray-300">{id}</span>
    <div className="min-w-0">
      <p className="text-xs text-gray-500 dark:text-gray-400 truncate" title={label}>{label}</p>
      <div className="w-full h-1.5 rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden mt-0.5">
        <div className={`h-full ${tone}`} style={{ width: `${percent(value)}%` }} />
      </div>
    </div>
    <span className="text-xs text-right tabular-nums text-gray-600 dark:text-gray-400">{percent(value)}%</span>
  </div>
);

// Bloco recolhível "Sugestão" do modal de detalhes do artigo
export const SuggestionPanel = ({ suggestion, stale, criteria, evaluating, error, onEvaluate, onAccept }) => {
  const { t } = useTranslation();
  const [open, setOpen] = useState(true);
  const style = suggestion ? (DECISION_STYLE[suggestion.decision] ?? DECISION_STYLE.uncertain) : null;
  const labelOf = (category, id) => criteria.find(c => c.category === category && c.id === id)?.label ?? id;
  const canAccept = suggestion && !stale && (suggestion.decision === 'included' || suggestion.decision === 'excluded');

  const groups = suggestion ? [
    { key: 'inclusion', heading: t('assist.inclusionHeading'), values: suggestion.inclusion, tone: 'bg-green-500 dark:bg-green-400' },
    { key: 'exclusion', heading: t('assist.exclusionHeading'), values: suggestion.exclusion, tone: 'bg-red-500 dark:bg-red-400' },
  ].filter(g => g.values && Object.keys(g.values).length) : [];
  const quality = suggestion?.quality && Object.keys(suggestion.quality).length ? suggestion.quality : null;

  return (
    <div className="mt-4 border border-gray-200 dark:border-gray-700 rounded-xl">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between gap-2 px-4 py-3 text-left"
      >
        <div className="flex items-center gap-2 flex-wrap">
          <strong className="text-base text-gray-700 dark:text-gray-300">{t('assist.suggestionTitle')}</strong>
          {style && (
            <span className={`px-2 inline-flex items-center gap-1 text-xs leading-5 font-semibold rounded-full ${style.cls} ${stale ? 'opacity-60' : ''}`}>
              <style.Icon size={12} strokeWidth={2.5} />
              {t(style.key)}
              {suggestionProbability(suggestion) !== null &&
                ` · p ${percent(suggestionProbability(suggestion))}%`}
            </span>
          )}
          {stale && <span className="text-xs text-yellow-700 dark:text-yellow-400">{t('assist.stale')}</span>}
        </div>
        <ChevronDown size={16} className={`text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="px-4 pb-4 space-y-3">
          {suggestion?.fieldsUsed && (
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {t('assist.basedOn', { fields: suggestion.fieldsUsed.map(f => t(`assist.field.${f}`)).join(', ') })}
            </p>
          )}

          {groups.map(group => (
            <div key={group.key} className="space-y-1.5">
              <p className="text-xs font-semibold uppercase text-gray-500 dark:text-gray-400">{group.heading}</p>
              {Object.entries(group.values).map(([id, p]) => (
                <ProbabilityRow key={id} id={id} label={labelOf(group.key, id)} value={p} tone={group.tone} />
              ))}
            </div>
          ))}

          {quality && (
            <div className="space-y-1.5">
              <p className="text-xs font-semibold uppercase text-gray-500 dark:text-gray-400">{t('assist.qualityHeading')}</p>
              {Object.entries(quality).map(([id, q]) => (
                <div key={id} className="grid grid-cols-[3rem_1fr_auto] items-center gap-2 text-sm">
                  <span className="font-medium text-gray-700 dark:text-gray-300">{id}</span>
                  <span className="text-xs text-gray-500 dark:text-gray-400 truncate" title={labelOf('quality', id)}>{labelOf('quality', id)}</span>
                  <span className="text-xs text-gray-600 dark:text-gray-400">{t(`assist.qualityLevel${q.score}`)}</span>
                </div>
              ))}
            </div>
          )}

          {suggestion?.evaluatedAt && suggestion.model && (
            <p className="text-xs text-gray-400 dark:text-gray-500">
              {t('assist.evaluatedAt', { date: new Date(suggestion.evaluatedAt).toLocaleString(), model: suggestion.model })}
            </p>
          )}

          {error && (
            <p className="text-sm text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-900/30 rounded-lg px-3 py-2">{error}</p>
          )}

          <div className="flex flex-wrap gap-2">
            {canAccept && (
              <button
                onClick={onAccept}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium active:scale-95 transition-all duration-150 ${suggestion.decision === 'included'
                  ? 'text-green-700 dark:text-green-300 bg-green-100 dark:bg-green-900/40 hover:bg-green-200 dark:hover:bg-green-800/60'
                  : 'text-red-700 dark:text-red-300 bg-red-100 dark:bg-red-900/40 hover:bg-red-200 dark:hover:bg-red-800/60'
                  }`}
              >
                {suggestion.decision === 'included' ? <Check size={16} /> : <X size={16} />}
                {t('assist.accept')}
              </button>
            )}
            <button
              onClick={onEvaluate}
              disabled={evaluating}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium active:scale-95 transition-all duration-150
                text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600
                disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <RefreshCw size={16} className={evaluating ? 'animate-spin' : ''} />
              {evaluating ? t('assist.evaluating') : suggestion ? t('assist.reevaluate') : t('assist.evaluate')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
