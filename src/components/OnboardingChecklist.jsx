// OnboardingChecklist.jsx - Checklist compacto de primeiros passos, derivado do estado do projeto

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { X, CheckCircle2, Circle, ChevronDown, ChevronUp, GraduationCap, Map as MapIcon } from 'lucide-react';
import { isChecklistCollapsed, setChecklistCollapsed } from '../tutorialStorage.js';

// Em telas pequenas começa recolhido para não cobrir a lista de artigos
const defaultCollapsed = () => typeof window !== 'undefined' && window.innerWidth < 640;

export const OnboardingChecklist = ({ items, isSectionAvailable, onGoToSection, onStartTour, onClose, forceExpanded = false, forceCollapsed = false }) => {
  const { t } = useTranslation();
  const [collapsed, setCollapsed] = useState(() => isChecklistCollapsed(defaultCollapsed()));
  const doneCount = items.filter(i => i.done).length;
  const allDone = doneCount === items.length;
  const progress = Math.round((doneCount / items.length) * 100);
  const isCollapsed = !forceExpanded && (collapsed || forceCollapsed);

  const toggle = () => {
    setCollapsed(!isCollapsed);
    setChecklistCollapsed(!isCollapsed);
  };

  const progressBar = (
    <div className="h-1.5 w-full rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden">
      <div className="h-full rounded-full bg-indigo-600 dark:bg-indigo-400 transition-all duration-300" style={{ width: `${progress}%` }} />
    </div>
  );

  if (isCollapsed) {
    return (
      <button
        data-tour="checklist"
        onClick={toggle}
        className="fixed bottom-4 right-4 z-40 w-56 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-lg px-3 py-2 flex flex-col gap-1.5 cursor-pointer text-left"
        title={t('checklist.expand')}
        aria-expanded="false"
      >
        <span className="flex items-center justify-between gap-2 w-full text-sm font-medium text-gray-800 dark:text-gray-100">
          <span className="flex items-center gap-2">
            <GraduationCap className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
            {t('checklist.title')}
          </span>
          <span className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
            {doneCount}/{items.length}
            <ChevronUp className="h-4 w-4" />
          </span>
        </span>
        {progressBar}
      </button>
    );
  }

  return (
    <div
      data-tour="checklist"
      role="region"
      aria-label={t('checklist.title')}
      className="fixed bottom-4 right-4 z-40 w-72 max-w-[calc(100vw-2rem)] bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-2xl p-4 text-sm"
    >
      <div className="flex items-center justify-between gap-2 mb-2">
        <h3 className="flex items-center gap-2 font-semibold text-gray-900 dark:text-white">
          <GraduationCap className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
          {t('checklist.title')}
        </h3>
        <div className="flex items-center gap-1">
          <button onClick={toggle} className="p-1 rounded text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 bg-transparent border-none cursor-pointer" title={t('checklist.collapse')} aria-label={t('checklist.collapse')} aria-expanded="true">
            <ChevronDown className="h-4 w-4" />
          </button>
          <button onClick={onClose} className="p-1 rounded text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 bg-transparent border-none cursor-pointer" title={t('checklist.close')} aria-label={t('checklist.close')}>
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="flex items-center gap-2 mb-3">
        {progressBar}
        <span className="text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap">{doneCount}/{items.length}</span>
      </div>

      {allDone && (
        <p className="mb-2 text-green-700 dark:text-green-400">{t('checklist.allDone')}</p>
      )}

      <ul className="space-y-0.5">
        {items.map(item => {
          const available = item.section ? isSectionAvailable(item.section) : false;
          const Icon = item.done ? CheckCircle2 : Circle;
          const content = (
            <>
              <Icon className={`h-4 w-4 shrink-0 ${item.done ? 'text-green-600 dark:text-green-400' : 'text-gray-400 dark:text-gray-500'}`} />
              <span className={item.done ? 'text-gray-500 dark:text-gray-400 line-through' : 'text-gray-700 dark:text-gray-200'}>
                {t(`checklist.items.${item.key}`)}
              </span>
            </>
          );
          return (
            <li key={item.key}>
              {item.section ? (
                <button
                  onClick={() => onGoToSection(item.section)}
                  disabled={!available}
                  title={available ? t('checklist.goTo') : t('nav.importArticlesDisabled')}
                  className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-left bg-transparent border-none cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:bg-transparent"
                >
                  {content}
                </button>
              ) : (
                <div className="flex items-center gap-2 px-2 py-1.5">{content}</div>
              )}
            </li>
          );
        })}
      </ul>

      <button
        onClick={onStartTour}
        className="mt-3 w-full flex items-center justify-center gap-2 px-3 py-2 text-sm font-medium text-indigo-700 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-900/30 hover:bg-indigo-100 dark:hover:bg-indigo-900/50 rounded-lg border-none cursor-pointer transition-colors duration-150"
      >
        <MapIcon className="h-4 w-4" />
        {t('checklist.startTour')}
      </button>
    </div>
  );
};

export default OnboardingChecklist;
