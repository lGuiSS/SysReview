import { useTranslation } from 'react-i18next';
import { CheckCircle, XCircle, Info } from 'lucide-react';
import { Modal } from './Modal.jsx';
import { BUTTON } from './buttons.js';

const ICONS = {
  success: { Icon: CheckCircle, tone: 'success' },
  error: { Icon: XCircle, tone: 'danger' },
  info: { Icon: Info, tone: 'info' },
};

export const AlertModal = ({ isOpen, type = 'info', title, message, onClose }) => {
  const { t } = useTranslation();
  if (!isOpen) return null;

  const { Icon, tone } = ICONS[type] || ICONS.info;

  return (
    <Modal
      size="sm"
      role="alertdialog"
      layer="top"
      closeOnBackdrop
      title={title}
      icon={Icon}
      iconTone={tone}
      onClose={onClose}
      closeLabel={t('modals.closeNotice')}
      describedBy="alert-modal-message"
      footer={
        <button type="button" onClick={onClose} className={BUTTON.secondary}>
          {t('modals.alert.ok')}
        </button>
      }
    >
      <p id="alert-modal-message" className="text-sm text-gray-600 dark:text-gray-300">{message}</p>
    </Modal>
  );
};

export default AlertModal;
