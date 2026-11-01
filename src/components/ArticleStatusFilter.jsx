import { useTranslation } from 'react-i18next';

export function ArticleStatusFilter({ value, onChange, showAi = false }) {
  const { t } = useTranslation();
  return <select value={value} onChange={onChange} aria-label={t('assist.statusFilterLabel')}
    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus-visible:ring-2 focus-visible:ring-indigo-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white">
    <option value="all">{t('articles.allStatus')}</option>
    <option value="pending">{t('articles.pending')}</option>
    <option value="included">{t('articles.included')}</option>
    <option value="excluded">{t('articles.excluded')}</option>
    <option value="duplicate">{t('articles.duplicates')}</option>
    {showAi && <>
      <option value="suggest-included">{t('assist.filterSuggestInclude')}</option>
      <option value="suggest-excluded">{t('assist.filterSuggestExclude')}</option>
      <option value="suggest-review">{t('assist.filterManualReview')}</option>
    </>}
  </select>;
}
