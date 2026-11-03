import { useState, useEffect, useRef, useCallback } from "react";
import { useTranslation } from 'react-i18next';
import { Clock, Download } from "lucide-react";
import { Toast } from "./Toast.jsx";
import { BUTTON } from "./buttons.js";

const CHECK_INTERVAL_MS = 30 * 1000;

function formatTimeSince(date, t) {
  if (!date) return t("modals.unsaved.neverSaved");
  const diffMin = Math.floor((Date.now() - new Date(date).getTime()) / 60000);
  if (diffMin < 1) return t("modals.unsaved.lessThanMinute");
  return t("modals.unsaved.minutes", { count: diffMin });
}

export function UnsavedWarningModal({ lastSaved, hasUnsavedChanges = false, fileOpenedAt = null, warnAfterMin=10,  onSave, onDismiss, autoSaveAvailable = false, autoSaveEnabled = false, onToggleAutoSave }) {
  const { t } = useTranslation();
  const [visible, setVisible] = useState(false);
  const [exiting, setExiting] = useState(false);
  const dismissedAtRef = useRef(null);

  const warnAfterMs = warnAfterMin * 60 * 1000;


  const close = useCallback((action) => {
    setExiting(true);
    setTimeout(() => {
      setExiting(false);
      setVisible(false);
      if (action === "dismiss") {
        dismissedAtRef.current = Date.now();
        onDismiss?.();
      }
    }, 250);
  }, [onDismiss]);

  const handleSave = useCallback(() => {
    close("save");
    onSave?.();
  }, [close, onSave]);

  useEffect(() => {
    if (!hasUnsavedChanges) {
      dismissedAtRef.current = null;
    }
  }, [hasUnsavedChanges]);

  useEffect(() => {
    const check = () => {
      if (!hasUnsavedChanges) { setVisible(false); return; }

      // Não exibe se o arquivo foi aberto há menos de 10 minutos
      if (fileOpenedAt && Date.now() - fileOpenedAt < warnAfterMs) { setVisible(false); return; }

      // Nunca salvou: considera tempo infinito, então avisa assim que passar a carência
      const elapsed = lastSaved
        ? Date.now() - new Date(lastSaved).getTime()
        : Infinity;

      const dismissedRecently = dismissedAtRef.current &&
        Date.now() - dismissedAtRef.current < warnAfterMs;

      if (elapsed >= warnAfterMs && !dismissedRecently) setVisible(true);
      else setVisible(false);
    };
    check();
    const id = setInterval(check, CHECK_INTERVAL_MS);
    return () => clearInterval(id);
  }, [hasUnsavedChanges, lastSaved, fileOpenedAt, warnAfterMs]);

  if (!visible) return null;

  return (
    <Toast
      role="alertdialog"
      position="bottom-right"
      icon={Clock}
      tone="warning"
      title={t('modals.unsaved.title')}
      description={lastSaved ? (
        <>
          {t('modals.unsaved.lastSave')}{' '}
          <span className="font-medium text-amber-700 dark:text-amber-400">
            {formatTimeSince(lastSaved, t)}
          </span>
          . {t('modals.unsaved.savePrompt')}
        </>
      ) : (
        <>
          {t('modals.unsaved.projectStillNotSaved')}{' '}
          <span className="font-medium text-amber-700 dark:text-amber-400">
            {t('modals.unsaved.neverSaved')}
          </span>
          . {t('modals.unsaved.savePrompt')}
        </>
      )}
      onClose={() => close("dismiss")}
      exiting={exiting}
      actions={<>
        <button type="button" onClick={() => close("dismiss")} className={BUTTON.secondary}>
          {t('modals.unsaved.remindLater')}
        </button>
        <button type="button" onClick={handleSave} className={BUTTON.primary}>
          <Download className="h-4 w-4" aria-hidden="true" />
          {t('modals.unsaved.saveNow')}
        </button>
      </>}
    >
      {autoSaveAvailable && (
        <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={autoSaveEnabled}
            onChange={(e) => onToggleAutoSave?.(e.target.checked)}
            className="accent-indigo-500 w-4 h-4"
          />
          {t('autosave.unsavedCheckbox')}
        </label>
      )}
    </Toast>
  );
}
