import { useState } from "react";
import { useTranslation } from 'react-i18next';
import { Bell } from "lucide-react";
import { Modal } from "./Modal.jsx";
import { BUTTON } from "./buttons.js";

const PRESET_OPTIONS = [5, 10, 15, 30];

export function ReminderSettingsModal({ currentMinutes = 10, onConfirm, onClose }) {
  const { t } = useTranslation();
  const isPreset = PRESET_OPTIONS.includes(currentMinutes);
  const [selected, setSelected] = useState(isPreset ? currentMinutes : null);
  const [custom, setCustom] = useState(isPreset ? "" : String(currentMinutes));

  const effectiveValue = custom ? Number(custom) : selected;
  const isValid = effectiveValue >= 1 && effectiveValue <= 60;

  const handlePreset = (min) => {
    setSelected(min);
    setCustom("");
  };

  const handleCustomChange = (e) => {
    const val = e.target.value.replace(/\D/g, "");
    setCustom(val);
    setSelected(null);
  };

  return (
    <Modal
      size="sm"
      title={t('modals.reminder.title')}
      icon={Bell}
      onClose={onClose}
      footer={<>
        <button type="button" onClick={onClose} className={BUTTON.secondary}>
          {t('searchString.cancel')}
        </button>
        <button type="button" disabled={!isValid} onClick={() => isValid && onConfirm(effectiveValue)} className={BUTTON.primary}>
          {t('multiSelect.confirm')}
        </button>
      </>}
    >
      <div className="space-y-5">
        <p className="text-sm text-gray-600 dark:text-gray-300">
          {t('modals.reminder.askAfter')}
        </p>

        {/* Presets */}
        <div className="grid grid-cols-4 gap-2 sm:gap-3">
          {PRESET_OPTIONS.map((min) => (
            <button
              key={min}
              type="button"
              aria-pressed={selected === min}
              onClick={() => handlePreset(min)}
              className={`h-10 rounded-lg text-sm font-medium border transition-colors duration-150
                ${selected === min
                  ? "bg-indigo-600 dark:bg-indigo-500 text-white border-indigo-600 dark:border-indigo-500"
                  : "bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700"
                }`}
            >
              {t('modals.reminder.min', { count: min })}
            </button>
          ))}
        </div>

        {/* Custom input */}
        <div>
          <label htmlFor="reminder-custom" className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5 block">
            {t('modals.reminder.custom')}
          </label>
          <div className="flex items-center gap-2">
            <input id="reminder-custom"
              type="number"
              min={1}
              max={60}
              value={custom}
              onChange={handleCustomChange}
              placeholder={t('modals.reminder.example')}
              className={`flex-1 h-10 px-3 text-sm rounded-lg border transition-colors
                bg-white dark:bg-gray-700 text-gray-800 dark:text-white
                placeholder-gray-400 dark:placeholder-gray-500
                focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500
                ${custom && !isValid
                  ? "border-red-400 dark:border-red-500"
                  : "border-gray-300 dark:border-gray-600"
                }`}
            />
            <span className="text-sm text-gray-500 dark:text-gray-400">{t('modals.reminder.minUnit')}</span>
          </div>
          {custom && !isValid && (
            <p className="text-sm text-red-600 dark:text-red-400 mt-1">
              {t('modals.reminder.invalid')}
            </p>
          )}
        </div>

        {/* Preview */}
        {isValid && (
          <p className="text-sm text-indigo-700 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-900/30 rounded-lg px-4 py-2.5">
            {t('modals.reminder.preview', { count: effectiveValue })}
          </p>
        )}
      </div>
    </Modal>
  );
}
