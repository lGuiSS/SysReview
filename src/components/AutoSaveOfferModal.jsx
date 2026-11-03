import { useTranslation } from 'react-i18next';
import { Save } from 'lucide-react';
import { Modal } from './Modal.jsx';
import { BUTTON } from './buttons.js';

export function AutoSaveOfferModal({ onEnable, onClose }) {
  const { t } = useTranslation();

  return (
    <Modal
      size="sm"
      title={t('autosave.title')}
      icon={Save}
      onClose={onClose}
      footer={<>
        <button type="button" onClick={onClose} className={BUTTON.secondary}>
          {t('autosave.later')}
        </button>
        <button type="button" onClick={onEnable} className={BUTTON.primary}>
          {t('autosave.enable')}
        </button>
      </>}
    >
      <p className="text-sm text-gray-600 dark:text-gray-300 leading-relaxed">
        {t('autosave.body')}
      </p>
    </Modal>
  );
}

export default AutoSaveOfferModal;
