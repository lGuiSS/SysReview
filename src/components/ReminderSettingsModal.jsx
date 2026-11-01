import { useState } from "react";
import { useTranslation } from 'react-i18next';
import { X, Bell } from "lucide-react";
import { DialogPanel } from "./Dialog.jsx";

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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 dark:bg-black/50 p-4">
      <DialogPanel onClose={onClose} labelledBy="reminder-settings-title" className="w-80 sm:w-[26rem] md:w-[30rem] bg-white dark:bg-gray-800 rounded-xl sm:rounded-2xl shadow-xl border border-gray-200 dark:border-gray-700">

        {/* Header */}
        <div className="flex items-center justify-between px-4 sm:px-6 py-3 sm:py-4 border-b border-gray-100 dark:border-gray-700">
          <div className="flex items-center gap-2 sm:gap-3">
            <Bell className="h-4 w-4 sm:h-5 sm:w-5 text-indigo-600 dark:text-indigo-400" />
            <h2 id="reminder-settings-title" className="text-sm sm:text-base font-semibold text-gray-800 dark:text-white">
              {t('modals.reminder.title')}
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
        <div className="p-4 sm:p-6 space-y-4 sm:space-y-5">
          <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400">
            {t('modals.reminder.askAfter')}
          </p>

          {/* Presets */}
          <div className="grid grid-cols-4 gap-2 sm:gap-3">
            {PRESET_OPTIONS.map((min) => (
              <button
                key={min}
                onClick={() => handlePreset(min)}
                className={`py-2 sm:py-2.5 rounded-lg text-xs sm:text-sm font-medium border transition-colors duration-150
                  ${selected === min
                    ? "bg-indigo-600 dark:bg-indigo-500 text-white border-indigo-600 dark:border-indigo-500"
                    : "bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 border-gray-200 dark:border-gray-600 hover:bg-gray-200 dark:hover:bg-gray-600"
                  }`}
              >
                {t('modals.reminder.min', { count: min })}
              </button>
            ))}
          </div>

          {/* Custom input */}
          <div>
            <label htmlFor="reminder-custom" className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 mb-1.5 sm:mb-2 block">
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
                className={`flex-1 px-3 py-1.5 sm:py-2 text-xs sm:text-sm rounded-lg border transition-colors
                  bg-white dark:bg-gray-700 text-gray-800 dark:text-white
                  placeholder-gray-400 dark:placeholder-gray-500
                  focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500
                  ${custom && !isValid
                    ? "border-red-400 dark:border-red-500"
                    : "border-gray-200 dark:border-gray-600"
                  }`}
              />
              <span className="text-xs sm:text-sm text-gray-500 dark:text-gray-400">{t('modals.reminder.minUnit')}</span>
            </div>
            {custom && !isValid && (
              <p className="text-xs sm:text-sm text-red-500 dark:text-red-400 mt-1">
                {t('modals.reminder.invalid')}
              </p>
            )}
          </div>

          {/* Preview */}
          {isValid && (
            <p className="text-xs sm:text-sm text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/30 rounded-lg px-3 sm:px-4 py-2 sm:py-2.5">
              {t('modals.reminder.preview', { count: effectiveValue })}
            </p>
          )}
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
            {t('searchString.cancel')}
          </button>
          <button
            disabled={!isValid}
            onClick={() => isValid && onConfirm(effectiveValue)}
            className="flex-1 px-3 py-1.5 sm:py-2 text-xs sm:text-sm font-medium rounded-lg
              bg-indigo-600 hover:bg-indigo-700 text-white
              dark:bg-indigo-500 dark:hover:bg-indigo-600
              disabled:opacity-40 disabled:cursor-not-allowed
              transition-colors duration-150"
          >
            {t('multiSelect.confirm')}
          </button>
        </div>
      </DialogPanel>
    </div>
  );
}