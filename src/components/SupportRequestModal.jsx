import { useState, useEffect, useRef, useCallback } from "react";
import { useTranslation } from 'react-i18next';
import { Heart } from "lucide-react";
import { Toast } from "./Toast.jsx";
import { BUTTON } from "./buttons.js";

export function SupportRequestModal({
  message = null,
  openSupportLabel = null,
  autoCloseMs = 10000,
  onOpenSupport,
  onDismiss,
  onClose,
}) {
  const { t } = useTranslation();
  const [exiting, setExiting] = useState(false);
  const [paused, setPaused] = useState(false);
  const remainingRef = useRef(autoCloseMs);
  const startTimeRef = useRef(null);
  const timerRef = useRef(null);

  const close = useCallback((action) => {
    setExiting(true);
    setTimeout(() => {
      if (action === "dismiss") onDismiss?.();
      onClose?.();
    }, 250);
  }, [onClose, onDismiss]);

  const stopTimer = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (startTimeRef.current != null) {
      remainingRef.current -= Date.now() - startTimeRef.current;
      startTimeRef.current = null;
    }
  }, []);

  const startTimer = useCallback(() => {
    stopTimer();
    startTimeRef.current = Date.now();
    timerRef.current = setTimeout(close, Math.max(remainingRef.current, 0));
  }, [close, stopTimer]);

  useEffect(() => {
    startTimer();
    return () => stopTimer();
  }, [startTimer, stopTimer]);

  const handleMouseEnter = () => {
    setPaused(true);
    stopTimer();
  };

  const handleMouseLeave = () => {
    setPaused(false);
    startTimer();
  };

  return (
    <Toast
      role="alertdialog"
      position="top-right"
      icon={Heart}
      tone="info"
      title={t('modals.supportRequest.title')}
      description={message ?? t('modals.supportRequest.message')}
      onClose={() => close("dismiss")}
      exiting={exiting}
      progress={{ durationMs: autoCloseMs, paused }}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      actions={
        <button type="button" onClick={onOpenSupport} className={BUTTON.primary}>
          <Heart className="h-4 w-4" aria-hidden="true" />
          {openSupportLabel ?? t('modals.supportRequest.openSupportLabel')}
        </button>
      }
    />
  );
}
