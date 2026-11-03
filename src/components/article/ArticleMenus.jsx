// ArticleMenus.jsx - Menus do topo do detalhe: últimas decisões (desfazer) e aparência

import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { canUndoDecision } from '../../decisionHistory.js';
import { STATUS_BADGES, STAGE_LABEL } from './articleView.js';

// Painel que abre abaixo do botão; fecha ao clicar fora (o Esc é tratado pelo detalhe)
export function Popover({ open, onClose, label, children, anchorRef, className = '' }) {
  const panelRef = useRef(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e) => {
      if (panelRef.current?.contains(e.target) || anchorRef?.current?.contains(e.target)) return;
      onClose();
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open, onClose, anchorRef]);
  if (!open) return null;
  return (
    <div
      ref={panelRef}
      role="group"
      aria-label={label}
      className={`absolute right-0 top-full mt-2 z-20 w-[min(26rem,calc(100vw-2rem))] max-sm:fixed max-sm:left-4 max-sm:right-4 max-sm:top-28 max-sm:w-auto rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 shadow-2xl p-2 ${className}`}
    >
      {children}
    </div>
  );
}

export function DecisionsMenu({ entries, articlesById, onUndo, onOpen }) {
  const { t } = useTranslation();
  if (!entries.length) {
    return <p className="px-3 py-4 text-sm text-gray-500 dark:text-gray-400">{t('articleView.decisionsEmpty')}</p>;
  }
  return (
    <div>
      <p className="px-3 pt-2 pb-1 text-xs font-semibold uppercase tracking-wide text-gray-700 dark:text-gray-200">{t('articleView.decisionsTitle')}</p>
      <ul className="max-h-80 overflow-y-auto">
        {entries.map(entry => {
          const badge = STATUS_BADGES[entry.status] ?? STATUS_BADGES.pending;
          const article = articlesById.get(entry.articleId);
          const undoable = canUndoDecision(entry, article);
          return (
            <li key={entry.id} className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800">
              <span className={`shrink-0 px-2 py-0.5 rounded-full text-[11px] font-semibold ${badge.cls}`}>{t(badge.label)}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm text-gray-900 dark:text-white" title={entry.title}>{entry.title}</span>
                <span className="block text-xs text-gray-700 dark:text-gray-200">
                  {t(STAGE_LABEL[entry.statusType] ?? 'nav.dataprocessing')}
                  {entry.state === 'undone' && ` · ${t('articleView.decisionUndone')}`}
                  {entry.state === 'available' && !undoable && ` · ${t('articleView.decisionChanged')}`}
                </span>
              </span>
              {undoable && (
                <button type="button" onClick={() => onUndo(entry.id)} className="shrink-0 h-8 px-2.5 rounded-md border-none bg-gray-100 dark:bg-gray-700 text-xs font-medium text-gray-800 dark:text-gray-100 hover:bg-gray-200 dark:hover:bg-gray-600">
                  {t('decisionUndo.undo')}
                </button>
              )}
              {article && (
                <button type="button" onClick={() => onOpen(article)} className="shrink-0 h-8 px-2.5 rounded-md border-none bg-transparent text-xs font-medium text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/40">
                  {t('articleView.open')}
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

const Choice = ({ name, value, current, onChange, title, hint }) => (
  <label className={`flex items-start gap-2.5 px-3 py-2 rounded-lg border cursor-pointer transition-colors ${current === value
    ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/30'
    : 'border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800'}`}>
    <input type="radio" name={name} checked={current === value} onChange={() => onChange(value)} className="mt-1 accent-indigo-600" />
    <span className="min-w-0">
      <span className="block text-sm font-medium text-gray-900 dark:text-gray-100">{title}</span>
      {hint && <span className="block text-xs text-gray-500 dark:text-gray-400">{hint}</span>}
    </span>
  </label>
);

export function AppearanceMenu({ view, onChange }) {
  const { t } = useTranslation();
  const set = (key) => (value) => onChange({ ...view, [key]: value });
  return (
    <div className="p-2 space-y-4">
      <fieldset className="space-y-2">
        <legend className="mb-2 text-sm font-semibold text-gray-900 dark:text-white">{t('articleView.layout')}</legend>
        <div className="grid grid-cols-2 gap-2">
          {['tabs', 'split', 'reading', 'continuous'].map(value => (
            <Choice key={value} name="article-layout" value={value} current={view.layout} onChange={set('layout')}
              title={t(`articleView.layout_${value}`)} hint={t(`articleView.layout_${value}_hint`)} />
          ))}
        </div>
      </fieldset>
      <fieldset className="space-y-2">
        <legend className="mb-2 text-sm font-semibold text-gray-900 dark:text-white">{t('articleView.confirmMode')}</legend>
        <Choice name="article-confirm" value={true} current={view.confirm} onChange={set('confirm')} title={t('articleView.confirmOn')} hint={t('articleView.confirmOnHint')} />
        <Choice name="article-confirm" value={false} current={view.confirm} onChange={set('confirm')} title={t('articleView.confirmOff')} hint={t('articleView.confirmOffHint')} />
      </fieldset>
      <fieldset className="space-y-2">
        <legend className="mb-2 text-sm font-semibold text-gray-900 dark:text-white">{t('articleView.afterDecision')}</legend>
        <div className="grid grid-cols-2 gap-2">
          <Choice name="article-advance" value={false} current={view.autoAdvance} onChange={set('autoAdvance')} title={t('articleView.stayHere')} />
          <Choice name="article-advance" value={true} current={view.autoAdvance} onChange={set('autoAdvance')} title={t('articleView.goNext')} />
        </div>
      </fieldset>
      <fieldset>
        <legend className="mb-2 text-sm font-semibold text-gray-900 dark:text-white">{t('articleView.marker')}</legend>
        <div className="flex gap-2">
          {[['yellow', 'bg-yellow-300'], ['indigo', 'bg-indigo-400']].map(([value, swatch]) => (
            <label key={value} className={`flex items-center gap-2 h-9 px-3 rounded-lg border cursor-pointer text-sm has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-indigo-500 ${view.marker === value
              ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/30 text-gray-900 dark:text-white'
              : 'border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white hover:bg-gray-50 dark:hover:bg-gray-800'}`}>
              <input type="radio" name="article-marker" checked={view.marker === value} onChange={() => set('marker')(value)} className="sr-only" />
              <span aria-hidden="true" className={`w-3.5 h-3.5 rounded ${swatch}`} />
              {t(`articleView.marker_${value}`)}
            </label>
          ))}
        </div>
      </fieldset>
      <p className="text-xs text-gray-500 dark:text-gray-400">{t('articleView.savedBoth')}</p>
    </div>
  );
}
