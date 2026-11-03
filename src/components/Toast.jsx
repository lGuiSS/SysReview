// Toast.jsx - Casca visual única dos avisos flutuantes (pedido de apoio, alterações não salvas, desfazer)

import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import { X } from 'lucide-react';
import { ICON_BUTTON } from './buttons.js';

const TONES = {
  neutral: 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300',
  info: 'bg-indigo-100 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-400',
  success: 'bg-green-100 dark:bg-green-900/40 text-green-600 dark:text-green-400',
  warning: 'bg-amber-100 dark:bg-amber-900/40 text-amber-600 dark:text-amber-400',
};
const BARS = { neutral: 'bg-gray-400', info: 'bg-indigo-500 dark:bg-indigo-400', success: 'bg-green-500', warning: 'bg-amber-500' };

// No celular ocupa a largura toda (com margem); nas telas maiores fica no canto ou no centro
const POSITIONS = {
  'top-right': 'top-4 left-4 right-4 sm:top-6 sm:left-auto sm:right-6 sm:w-96',
  'bottom-right': 'bottom-4 left-4 right-4 sm:bottom-6 sm:left-auto sm:right-6 sm:w-96',
  'top-center': 'top-4 left-4 right-4 sm:left-1/2 sm:right-auto sm:-translate-x-1/2 sm:w-[28rem]',
  'bottom-center': 'bottom-4 left-4 right-4 sm:left-1/2 sm:right-auto sm:-translate-x-1/2 sm:w-auto sm:max-w-[32rem]',
};

export function Toast({
  icon: Icon, tone = 'info', title, description, actions, children, onClose, closeLabel,
  position = 'top-right', exiting = false, progress, role = 'status', z = 'z-50', compact = false, iconClassName, style, ...props
}) {
  const { t } = useTranslation();
  const titleId = useId();
  const descriptionId = useId();

  // Entra a partir do lado em que fica (de cima ou de baixo)
  const enterFrom = { '--toast-dy': position.startsWith('bottom') ? '8px' : '-8px', ...style };

  if (compact) {
    return (
      <div
        role={role}
        aria-live={role === 'status' ? 'polite' : undefined}
        style={enterFrom}
        className={`fixed ${z} ${POSITIONS[position] ?? POSITIONS['top-right']} flex items-center gap-2.5 pl-3 pr-1.5 py-1.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white/95 dark:bg-gray-800/95 backdrop-blur shadow-lg ${exiting ? 'toast-exit' : 'toast-enter'}`}
        {...props}
      >
        {Icon && <Icon className={`h-4 w-4 shrink-0 ${iconClassName ?? ''}`} aria-hidden="true" />}
        <p className="min-w-0 flex-1 truncate text-sm text-gray-800 dark:text-gray-100">{title}</p>
        {actions}
        {onClose && (
          <button type="button" onClick={onClose} aria-label={closeLabel ?? t('modals.closeNotice')} className={`${ICON_BUTTON} !w-8 !h-8`}>
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        )}
      </div>
    );
  }

  return (
    <div
      role={role}
      style={enterFrom}
      aria-live={role === 'status' ? 'polite' : undefined}
      aria-labelledby={titleId}
      aria-describedby={description ? descriptionId : undefined}
      className={`fixed ${z} ${POSITIONS[position] ?? POSITIONS['top-right']} overflow-hidden rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-xl ${exiting ? 'toast-exit' : 'toast-enter'}`}
      {...props}
    >
      <div className="flex items-start gap-3 p-4">
        {Icon && (
          <span className={`shrink-0 grid place-items-center w-9 h-9 rounded-lg ${TONES[tone] ?? TONES.info}`} aria-hidden="true">
            <Icon className="h-5 w-5" />
          </span>
        )}
        <div className="min-w-0 flex-1 self-center">
          <p id={titleId} className="text-sm font-semibold leading-snug text-gray-900 dark:text-white">{title}</p>
          {description && <p id={descriptionId} className="mt-0.5 text-sm leading-relaxed text-gray-600 dark:text-gray-300">{description}</p>}
        </div>
        {onClose && (
          <button type="button" onClick={onClose} aria-label={closeLabel ?? t('modals.closeNotice')} className={`${ICON_BUTTON} -mr-2 -mt-2`}>
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        )}
      </div>

      {children && <div className="px-4 pb-3">{children}</div>}

      {actions && (
        <div className="flex flex-wrap justify-end gap-2 px-4 pb-4 [&>button]:flex-1 sm:[&>button]:flex-none">
          {actions}
        </div>
      )}

      {/* Tempo restante até sumir sozinho */}
      {progress && (
        <div className="h-1 bg-gray-100 dark:bg-gray-700">
          <div
            className={`h-full ${BARS[tone] ?? BARS.info} toast-progress`}
            style={{ animationDuration: `${progress.durationMs}ms`, animationPlayState: progress.paused ? 'paused' : 'running' }}
          />
        </div>
      )}
    </div>
  );
}

export default Toast;
