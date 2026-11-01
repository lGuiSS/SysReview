import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

// Locale completo para o Intl: 'pt' → pt-BR, 'en' → en-US
export const intlLocale = (language) => (language?.startsWith('pt') ? 'pt-BR' : 'en-US');

/**
 * Formatadores de número e data no idioma ativo.
 * num(valor, casas) fixa as casas decimais; sem `casas`, usa o padrão do Intl.
 */
export const useFormat = () => {
  const { i18n } = useTranslation();
  const locale = intlLocale(i18n.language);

  return useMemo(() => {
    const cache = new Map();
    const formatter = (key, options) => {
      if (!cache.has(key)) cache.set(key, new Intl.NumberFormat(locale, options));
      return cache.get(key);
    };
    return {
      locale,
      num: (value, digits) => formatter(`n${digits}`, digits == null ? undefined : { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(value ?? 0),
      pct: (ratio, digits = 0) => formatter(`p${digits}`, { style: 'percent', minimumFractionDigits: digits, maximumFractionDigits: digits }).format(ratio ?? 0),
      date: (value) => new Date(value).toLocaleDateString(locale),
      time: (value) => new Date(value).toLocaleTimeString(locale),
      dateTime: (value) => new Date(value).toLocaleString(locale),
    };
  }, [locale]);
};
