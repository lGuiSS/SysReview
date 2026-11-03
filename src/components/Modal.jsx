// Modal.jsx - Casca visual única dos modais (cabeçalho, corpo com rolagem e rodapé) sobre o DialogPanel

import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import { X } from 'lucide-react';
import { DialogPanel } from './Dialog.jsx';
import { ICON_BUTTON } from './buttons.js';
import { ICON_TONES, LAYERS, MODAL_BACKDROP, MODAL_BODY, modalPanelClass } from './modalStyles.js';


export function ModalHeader({ titleId, title, eyebrow, icon: Icon, iconTone = 'neutral', description, descriptionId, onClose, closeLabel, headerExtra }) {
  const { t } = useTranslation();
  const tone = ICON_TONES[iconTone] ?? ICON_TONES.neutral;
  return (
    <div className="flex-shrink-0 flex items-start gap-3 px-5 sm:px-6 py-4 border-b border-gray-200 dark:border-gray-700">
      {Icon && (
        <span className={`shrink-0 grid place-items-center ${iconTone === 'neutral' ? 'h-6' : 'w-9 h-9 rounded-full'} ${tone}`} aria-hidden="true">
          <Icon className="h-5 w-5" />
        </span>
      )}
      <div className={`min-w-0 flex-1 ${Icon && iconTone !== 'neutral' ? 'self-center' : ''}`}>
        {eyebrow && <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">{eyebrow}</p>}
        <h2 id={titleId} className="text-base sm:text-lg font-semibold leading-snug text-gray-900 dark:text-white break-words">{title}</h2>
        {description && <p id={descriptionId} className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">{description}</p>}
      </div>
      {headerExtra}
      <button type="button" onClick={onClose} aria-label={closeLabel ?? t('modals.close')} className={`${ICON_BUTTON} -mr-2 -mt-1`}>
        <X className="h-5 w-5" aria-hidden="true" />
      </button>
    </div>
  );
}

export const ModalFooter = ({ children }) => (
  <div className="flex-shrink-0 flex flex-col-reverse sm:flex-row sm:justify-end gap-2 px-5 sm:px-6 py-4 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/40 sm:rounded-b-2xl [&>button]:w-full sm:[&>button]:w-auto">
    {children}
  </div>
);

export function Modal({
  size = 'sm', title, eyebrow, icon, iconTone = 'neutral', description, onClose, footer, children,
  role = 'dialog', layer = 'base', closeOnBackdrop = false, closeLabel, describedBy,
  fallbackFocus, bodyClassName = '', headerExtra, notice,
}) {
  const titleId = useId();
  const descriptionId = useId();

  return (
    <div className={`${MODAL_BACKDROP} ${LAYERS[layer] ?? LAYERS.base}`} onClick={closeOnBackdrop ? onClose : undefined}>
      <DialogPanel
        role={role}
        onClose={onClose}
        labelledBy={titleId}
        aria-describedby={describedBy ?? (description ? descriptionId : undefined)}
        fallbackFocus={fallbackFocus}
        onClick={closeOnBackdrop ? (e) => e.stopPropagation() : undefined}
        className={modalPanelClass(size)}
      >
        <ModalHeader
          titleId={titleId} title={title} eyebrow={eyebrow} icon={icon} iconTone={iconTone}
          description={description} descriptionId={descriptionId} onClose={onClose}
          closeLabel={closeLabel} headerExtra={headerExtra}
        />

        <div className={`${MODAL_BODY} ${bodyClassName}`}>
          {children}
        </div>

        {/* Mensagem fixa acima do rodapé (resultado de teste, aviso de validação…) */}
        {notice && <div className="flex-shrink-0 px-5 sm:px-6 pb-4">{notice}</div>}

        {footer && <ModalFooter>{footer}</ModalFooter>}
      </DialogPanel>
    </div>
  );
}

export default Modal;
