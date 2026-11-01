import { useTranslation } from 'react-i18next';
import { X, Save } from 'lucide-react';
import { DialogPanel } from './Dialog.jsx';

export function AutoSaveOfferModal({ onEnable, onClose }) {
  const { t } = useTranslation();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 dark:bg-black/50 p-4">
      <DialogPanel onClose={onClose} labelledBy="autosave-offer-title" className="w-full sm:w-[26rem] md:w-[30rem] bg-white dark:bg-gray-800 rounded-xl shadow-xl border border-gray-200 dark:border-gray-700">

        {/* Header */}
        <div className="flex items-center justify-between px-4 sm:px-6 py-3 sm:py-4 border-b border-gray-100 dark:border-gray-700">
          <div className="flex items-center gap-2 sm:gap-3">
            <Save className="h-4 w-4 sm:h-5 sm:w-5 text-indigo-600 dark:text-indigo-400" />
            <h2 id="autosave-offer-title" className="text-sm sm:text-base font-semibold text-gray-800 dark:text-white">
              {t('autosave.title')}
            </h2>
          </div>
          <button
            onClick={onClose}
            aria-label={t('modals.close')}
            className="p-1 sm:p-1.5 rounded-md text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:text-gray-300 dark:hover:bg-gray-700 transition-colors"
          >
            <X className="h-4 w-4 sm:h-5 sm:w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-4 sm:p-6">
          <p className="text-xs sm:text-sm text-gray-600 dark:text-gray-400 leading-relaxed">
            {t('autosave.body')}
          </p>
        </div>

        {/* Footer */}
        <div className="flex gap-2 sm:gap-3 px-4 sm:px-6 pb-4 sm:pb-6">
          <button
            onClick={onClose}
            className="flex-1 px-3 py-1.5 sm:py-2 text-xs sm:text-sm font-medium rounded-lg
              bg-gray-100 hover:bg-gray-200 text-gray-700
              dark:bg-gray-700 dark:hover:bg-gray-600 dark:text-gray-300
              transition-colors duration-150"
          >
            {t('autosave.later')}
          </button>
          <button
            onClick={onEnable}
            className="flex-1 px-3 py-1.5 sm:py-2 text-xs sm:text-sm font-medium rounded-lg
              bg-indigo-600 hover:bg-indigo-700 text-white
              dark:bg-indigo-500 dark:hover:bg-indigo-600
              transition-colors duration-150"
          >
            {t('autosave.enable')}
          </button>
        </div>
      </DialogPanel>
    </div>
  );
}

export default AutoSaveOfferModal;
