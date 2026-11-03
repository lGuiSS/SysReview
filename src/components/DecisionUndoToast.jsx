// DecisionUndoToast.jsx - Aviso após incluir/excluir/duplicata, com Desfazer (botão ou Ctrl+Z)

import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CheckCircle, XCircle, BookCopy, Info, Undo2 } from 'lucide-react';
import { Toast } from './Toast.jsx';

const VISIBLE_MS = 8000;
const RESULT_MS = 4000;

const STAGE_LABEL = {
  dataProcessingStatus: 'nav.dataprocessing',
  filter1Status: 'nav.filter1',
  filter2Status: 'nav.filter2',
  filter3Status: 'nav.filter3',
};
const STATUS_LABEL = {
  included: 'articles.statusIncluded',
  excluded: 'articles.statusExcluded',
  duplicate: 'articles.statusDuplicate',
};

// Ícone e cor da opção realizada
const DECISION_TONES = {
  included: { icon: CheckCircle, cls: 'text-green-600 dark:text-green-400' },
  excluded: { icon: XCircle, cls: 'text-red-600 dark:text-red-400' },
  duplicate: { icon: BookCopy, cls: 'text-slate-500 dark:text-slate-300' },
};

const isEditable = (el) => el instanceof HTMLElement &&
  (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName));

export const DecisionUndoToast = ({ entry, onUndo, onDismiss }) => {
  const { t } = useTranslation();
  const [paused, setPaused] = useState(false);
  const latest = useRef({ entry, onUndo, onDismiss });
  useEffect(() => { latest.current = { entry, onUndo, onDismiss }; });

  const available = entry?.state === 'available';

  // Some sozinho; mais rápido depois de desfazer. Pausa com o mouse ou o foco no aviso.
  useEffect(() => {
    if (!entry || paused) return;
    const timer = setTimeout(() => latest.current.onDismiss(), available ? VISIBLE_MS : RESULT_MS);
    return () => clearTimeout(timer);
  }, [entry, paused, available]);

  // Ctrl+Z / Cmd+Z desfaz enquanto o aviso está visível, fora de campos de texto
  useEffect(() => {
    if (!available) return;
    const onKeyDown = (event) => {
      if (!(event.ctrlKey || event.metaKey) || event.shiftKey || event.altKey || event.key.toLowerCase() !== 'z') return;
      if (isEditable(event.target)) return;
      event.preventDefault();
      latest.current.onUndo(latest.current.entry.id);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [available]);

  if (!entry) return null;

  const message = entry.state === 'available'
    ? t('decisionUndo.message', { status: t(STATUS_LABEL[entry.status] ?? 'articles.statusIncluded'), stage: t(STAGE_LABEL[entry.statusType] ?? 'nav.dataprocessing') })
    : t(`decisionUndo.${entry.state}`);
  const blocked = entry.state === 'changed' || entry.state === 'missing';
  const tone = available ? DECISION_TONES[entry.status] ?? DECISION_TONES.included : null;
  const Icon = tone?.icon ?? (blocked ? Info : Undo2);

  return (
    <Toast
      compact
      position="bottom-center"
      z="z-[70]"
      icon={Icon}
      iconClassName={tone?.cls ?? (blocked ? 'text-amber-600 dark:text-amber-400' : 'text-gray-500 dark:text-gray-400')}
      title={message}
      onClose={onDismiss}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      actions={available && (
        <button type="button" onClick={() => onUndo(entry.id)} title={t('decisionUndo.shortcut')}
          className="shrink-0 inline-flex items-center gap-1 h-8 px-2.5 rounded-lg border-none bg-transparent text-sm font-semibold text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/40">
          <Undo2 aria-hidden="true" className="h-4 w-4" />
          {t('decisionUndo.undo')}
        </button>
      )}
    />
  );
};

export default DecisionUndoToast;
