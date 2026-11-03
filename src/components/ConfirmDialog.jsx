import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertTriangle } from 'lucide-react';
import { Modal } from './Modal.jsx';
import { BUTTON } from './buttons.js';

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
      className="mt-3 grid gap-2 p-3 rounded-lg border border-amber-300 dark:border-amber-700/60 bg-amber-50 dark:bg-amber-900/30"
    >
      <p className="flex items-start gap-2 text-sm text-gray-800 dark:text-gray-100">
        <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0 text-amber-600 dark:text-amber-400" aria-hidden="true" />
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
    <Modal
      size="sm"
      role="alertdialog"
      layer="top"
      closeOnBackdrop
      title={title || t('modals.confirm.title')}
      icon={AlertTriangle}
      iconTone="warning"
      onClose={() => onClose(false)}
      describedBy="confirm-dialog-message"
      footer={<>
        <button type="button" onClick={() => onClose(false)} className={BUTTON.secondary}>
          {cancelLabel || t('modals.confirm.cancel')}
        </button>
        <button type="button" onClick={() => onClose(true)} className={BUTTON[tone] ?? BUTTON.primary}>
          {confirmLabel || t('modals.confirm.ok')}
        </button>
      </>}
    >
      <p id="confirm-dialog-message" className="text-sm text-gray-600 dark:text-gray-300">{message}</p>
    </Modal>
  );
};

export default ConfirmDialog;
