import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertTriangle } from 'lucide-react';
import { DialogPanel } from './Dialog.jsx';

const TONES = {
  danger: 'bg-red-600 hover:bg-red-700 dark:bg-red-500 dark:hover:bg-red-600',
  primary: 'bg-indigo-600 hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-600',
  success: 'bg-green-600 hover:bg-green-700 dark:bg-green-500 dark:hover:bg-green-600',
};

const cancelCls = 'px-3 py-1.5 text-sm font-medium rounded-lg border-none bg-white/70 hover:bg-white text-gray-700 dark:bg-gray-800 dark:hover:bg-gray-700 dark:text-gray-200 transition-colors duration-150';

/**
 * Confirmação dentro do próprio cartão, no lugar de window.confirm.
 * Foca o botão de confirmar ao aparecer; Esc cancela.
 */
export const InlineConfirm = ({ message, confirmLabel, cancelLabel, tone = 'danger', onConfirm, onCancel }) => {
  const { t } = useTranslation();
  const confirmRef = useRef(null);
  useEffect(() => { confirmRef.current?.focus(); }, []);

  return (
    <div
      role="alertdialog"
      aria-label={message}
      onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); onCancel(); } }}
      className="mt-3 grid gap-2 p-3 rounded-lg border border-yellow-300 dark:border-yellow-700/60 bg-yellow-50 dark:bg-yellow-900/30"
    >
      <p className="flex items-start gap-2 text-sm text-gray-800 dark:text-gray-100">
        <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0 text-yellow-600 dark:text-yellow-400" aria-hidden="true" />
        <span>{message}</span>
      </p>
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onCancel} className={cancelCls}>
          {cancelLabel || t('modals.confirm.cancel')}
        </button>
        <button type="button" ref={confirmRef} onClick={onConfirm} className={`px-3 py-1.5 text-sm font-medium rounded-lg border-none text-white transition-colors duration-150 ${TONES[tone]}`}>
          {confirmLabel}
        </button>
      </div>
    </div>
  );
};

/** Diálogo modal de confirmação para fluxos sem cartão próprio (abrir arquivo, restaurar backup…). */
export const ConfirmDialog = ({ request, onClose }) => {
  const { t } = useTranslation();
  if (!request) return null;
  const { title, message, confirmLabel, cancelLabel, tone = 'primary' } = request;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 p-4" onClick={() => onClose(false)}>
      <DialogPanel
        role="alertdialog"
        onClose={() => onClose(false)}
        labelledBy="confirm-dialog-title"
        aria-describedby="confirm-dialog-message"
        className="w-full max-w-md bg-white dark:bg-gray-800 rounded-xl shadow-2xl border border-gray-200 dark:border-gray-700 p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 mb-3">
          <div className="w-9 h-9 rounded-full bg-yellow-100 dark:bg-yellow-900/40 flex items-center justify-center">
            <AlertTriangle className="h-5 w-5 text-yellow-600 dark:text-yellow-400" aria-hidden="true" />
          </div>
          <h2 id="confirm-dialog-title" className="text-base font-semibold text-gray-900 dark:text-white">
            {title || t('modals.confirm.title')}
          </h2>
        </div>
        <p id="confirm-dialog-message" className="text-sm text-gray-600 dark:text-gray-300">{message}</p>
        <div className="flex justify-end gap-2 mt-5">
          <button
            type="button"
            onClick={() => onClose(false)}
            className="px-4 py-2 text-sm font-medium rounded-lg border-none bg-gray-100 hover:bg-gray-200 text-gray-700 dark:bg-gray-700 dark:hover:bg-gray-600 dark:text-gray-200 transition-colors duration-150"
          >
            {cancelLabel || t('modals.confirm.cancel')}
          </button>
          <button
            type="button"
            onClick={() => onClose(true)}
            className={`px-4 py-2 text-sm font-medium rounded-lg border-none text-white transition-colors duration-150 ${TONES[tone]}`}
          >
            {confirmLabel || t('modals.confirm.ok')}
          </button>
        </div>
      </DialogPanel>
    </div>
  );
};

export default ConfirmDialog;
