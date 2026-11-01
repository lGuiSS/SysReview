import { useTranslation } from 'react-i18next';
import { X, CheckCircle, XCircle, Info } from 'lucide-react';
import { DialogPanel } from './Dialog.jsx';

const ICONS = {
  success: {
    Icon: CheckCircle,
    bg: 'bg-green-100 dark:bg-green-900/40',
    color: 'text-green-600 dark:text-green-400'
  },
  error: {
    Icon: XCircle,
    bg: 'bg-red-100 dark:bg-red-900/40',
    color: 'text-red-600 dark:text-red-400'
  },
  info: {
    Icon: Info,
    bg: 'bg-indigo-100 dark:bg-indigo-900/40',
    color: 'text-indigo-600 dark:text-indigo-400'
  }
};

export const AlertModal = ({ isOpen, type = 'info', title, message, onClose }) => {
  const { t } = useTranslation();
  if (!isOpen) return null;

  const { Icon, bg, color } = ICONS[type] || ICONS.info;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <DialogPanel role="alertdialog" onClose={onClose} labelledBy="alert-modal-title" aria-describedby="alert-modal-message" className="bg-white dark:bg-gray-800 rounded-2xl sm:rounded-xl shadow-2xl w-full max-w-md mx-4 p-6" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2">
            <div className={`w-9 h-9 rounded-full ${bg} flex items-center justify-center`}>
              <Icon className={`h-5 w-5 ${color}`} />
            </div>
            <h3 id="alert-modal-title" className="text-base text-gray-900 dark:text-white font-semibold leading-tight">{title}</h3>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors bg-transparent border-none cursor-pointer p-1 rounded" aria-label={t('modals.closeNotice')}>
            <X size={18} />
          </button>
        </div>
        <div className="text-sm text-gray-600 dark:text-gray-300">
          <p id="alert-modal-message">{message}</p>
        </div>
        <div className="flex justify-end gap-2 mt-5">
          <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-600 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-lg transition-colors duration-150 cursor-pointer border-none">
            {t('modals.alert.ok')}
          </button>
        </div>
      </DialogPanel>
    </div>
  );
};

export default AlertModal;
