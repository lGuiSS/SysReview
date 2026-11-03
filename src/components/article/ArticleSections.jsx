// ArticleSections.jsx - Conteúdo do detalhe do artigo, compartilhado pelos estilos Abas e Clássico

import { useTranslation } from 'react-i18next';
import { Check, Highlighter, Link, FileText, Tag } from 'lucide-react';
import { highlightSegments, foundTerms } from './highlight.js';
import { STATUS_BADGES, TEXT_SIZES, isExtractionAnswered } from './articleView.js';

const MARKS = {
  yellow: 'bg-yellow-200 text-gray-900 dark:bg-yellow-400/30 dark:text-yellow-50',
  indigo: 'bg-indigo-200 text-indigo-950 dark:bg-indigo-500/40 dark:text-indigo-50',
};

export const StatusBadge = ({ status }) => {
  const { t } = useTranslation();
  const badge = STATUS_BADGES[status] ?? STATUS_BADGES.pending;
  return <span className={`inline-flex px-2.5 py-0.5 text-xs leading-5 font-semibold rounded-full whitespace-nowrap ${badge.cls}`}>{t(badge.label)}</span>;
};

export const HighlightedText = ({ text, terms, enabled, marker, options }) => {
  if (!enabled) return text ?? '';
  return highlightSegments(text, terms, options).map((s, i) => (s.match
    ? <mark key={i} className={`rounded px-0.5 ${MARKS[marker] ?? MARKS.yellow}`}>{s.text}</mark>
    : <span key={i}>{s.text}</span>));
};

export const HighlightButton = ({ enabled, count, onToggle, compact = false }) => {
  const { t } = useTranslation();
  return (
    <button
      type="button"
      aria-pressed={enabled}
      onClick={onToggle}
      title={t('articleView.highlight')}
      className={`inline-flex items-center gap-1.5 h-9 px-3 rounded-lg border text-sm font-medium whitespace-nowrap transition-colors ${enabled
        ? 'border-indigo-500 bg-indigo-50 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-200'
        : 'border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700'}`}
    >
      <Highlighter className="h-4 w-4" aria-hidden="true" />
      <span className={compact ? 'sr-only sm:not-sr-only' : ''}>{t('articleView.highlight')}</span>
      {enabled && <span className="min-w-[1.25rem] px-1.5 rounded-full bg-indigo-600 text-white text-xs tabular-nums">{count}</span>}
    </button>
  );
};

export const TextSizeControl = ({ value, onChange }) => {
  const { t } = useTranslation();
  const options = [['normal', 'text-xs'], ['large', 'text-sm'], ['xlarge', 'text-base']];
  return (
    <div role="radiogroup" aria-label={t('articleView.textSize')} title={t('articleView.textSize')} className="inline-flex h-9 p-0.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800">
      {options.map(([size, cls]) => (
        <button
          key={size}
          type="button"
          role="radio"
          aria-checked={value === size}
          aria-label={t(`articleView.textSize_${size}`)}
          onClick={() => onChange(size)}
          className={`w-8 h-full p-0 rounded-md border-none font-semibold leading-none transition-colors ${cls} ${value === size
            ? 'bg-indigo-600 text-white'
            : 'bg-transparent text-gray-800 dark:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-700'}`}
        >
          A
        </button>
      ))}
    </div>
  );
};

const DoiLink = ({ doi }) => {
  const { t } = useTranslation();
  if (!doi) return <span>{t('modals.article.notIdentified')}</span>;
  return (
    <a href={`https://doi.org/${doi}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-indigo-600 dark:text-indigo-400 hover:underline break-all">
      <Link size={12} aria-hidden="true" />{doi}
    </a>
  );
};

const SectionTitle = ({ icon: Icon, children }) => (
  <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-gray-700 dark:text-gray-200">
    {Icon && <Icon className="h-3.5 w-3.5" aria-hidden="true" />}
    {children}
  </h3>
);

// ── Resumo ───────────────────────────────────────────────────────────────────
export function SummaryPanel({ article, terms, match, view, onToggleHighlight, onTextSize, classic = false, reading = false }) {
  const { t } = useTranslation();
  const highlight = view.highlight;
  const count = foundTerms([article.title, article.abstract, ...(article.keywords ?? [])], terms, match).length;
  const hl = (text) => <HighlightedText text={text} terms={terms} enabled={highlight} marker={view.marker} options={match} />;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        {classic ? (
          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-2 text-sm text-gray-900 dark:text-white flex-1 basis-full sm:basis-0 min-w-0">
            <div><dt className="inline font-semibold">{t('modals.article.authors')}</dt> <dd className="inline break-words">{article.authors}</dd></div>
            <div><dt className="inline font-semibold">{t('modals.article.source')}</dt> <dd className="inline">{article.source}</dd></div>
            <div><dt className="inline font-semibold">{t('modals.article.journal')}</dt> <dd className="inline break-words">{article.journal}</dd></div>
            <div><dt className="inline font-semibold">{t('modals.article.year')}</dt> <dd className="inline">{article.year}</dd></div>
            <div><dt className="inline font-semibold">{t('modals.article.doi')}</dt> <dd className="inline"><DoiLink doi={article.doi} /></dd></div>
            <div><dt className="inline font-semibold">{t('modals.article.score')}</dt> <dd className="inline tabular-nums">{article.score}</dd></div>
          </dl>
        ) : (
          <p className="text-sm text-gray-700 dark:text-gray-200 flex-1 basis-full sm:basis-0 min-w-0">
            <span className="text-gray-900 dark:text-white">{article.authors}</span>
            {article.journal && <> · {article.journal}</>}
            {article.year && <> · {article.year}</>}
            {article.source && <> · {article.source}</>}
            <> · {t('modals.article.score')} <span className="tabular-nums">{article.score}</span></>
          </p>
        )}
        <div className="flex items-center gap-2">
          <TextSizeControl value={view.textSize} onChange={onTextSize} />
          <HighlightButton enabled={highlight} count={count} onToggle={onToggleHighlight} />
        </div>
      </div>

      <div className="space-y-2">
        <SectionTitle icon={FileText}>{t('modals.article.abstract').replace(/:$/, '')}</SectionTitle>
        <p className={`${(TEXT_SIZES[view.textSize] ?? TEXT_SIZES.normal).body} text-gray-900 dark:text-white ${reading ? 'font-serif leading-[1.85]' : 'leading-relaxed'}`}>
          {article.abstract ? hl(article.abstract) : <span className="text-gray-500">{t('modals.article.notIdentified')}</span>}
        </p>
      </div>

      {article.keywords?.length > 0 && (
        <div className="space-y-2">
          <SectionTitle icon={Tag}>{t('modals.article.keywords').replace(/:$/, '')}</SectionTitle>
          <ul className="flex flex-wrap gap-1.5">
            {article.keywords.map((kw, i) => (
              <li key={i} className="px-2.5 py-0.5 bg-indigo-50 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 text-sm rounded-full">{hl(kw)}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

// ── Detalhes ─────────────────────────────────────────────────────────────────
const TRAIL = [
  { field: 'dataProcessingStatus', stage: null, label: 'nav.dataprocessing' },
  { field: 'filter1Status', stage: 'filter1', label: 'nav.filter1' },
  { field: 'filter2Status', stage: 'filter2', label: 'nav.filter2' },
  { field: 'filter3Status', stage: 'filter3', label: 'nav.filter3' },
];
const DOTS = { included: 'bg-green-500', excluded: 'bg-red-500', duplicate: 'bg-slate-400', pending: 'bg-amber-500' };

const sourceLabel = (t, source) => {
  if (!source) return null;
  if (source === 'user') return t('articleView.sourceManual');
  if (source.endsWith('-auto')) return t('articleView.sourceAiBatch');
  if (source.endsWith('-accepted')) return t('articleView.sourceAiAccepted');
  return null;
};

export function DetailsPanel({ article, allArticles, terms, match, stacked = false }) {
  const { t, i18n } = useTranslation();
  const found = foundTerms([article.title, article.abstract, ...(article.keywords ?? [])], terms, match);
  const missing = [...new Set(terms.map(x => x.trim()).filter(Boolean))].filter(x => !found.includes(x));
  const linkedDuplicates = (allArticles ?? []).filter(a => a.duplicateOf === article.id && a.id !== article.id);
  const original = article.duplicateOf ? (allArticles ?? []).find(a => a.id === article.duplicateOf) : null;
  const imported = article.importDate ? new Date(article.importDate) : null;
  const criteriaIds = [...(article.inclusionCriterion ?? []), ...(article.exclusionCriterion ?? []), ...(article.qualityCriteria ?? [])]
    .map(c => c?.id).filter(Boolean);

  const row = (label, value) => value ? <><dt className="text-gray-700 dark:text-gray-200">{label}</dt><dd className="m-0 text-gray-900 dark:text-white break-words">{value}</dd></> : null;
  const dl = 'grid grid-cols-[7.5rem_minmax(0,1fr)] gap-x-3 gap-y-2 text-sm';

  return (
    <div className={`grid grid-cols-1 gap-x-10 gap-y-6 ${stacked ? '' : 'lg:grid-cols-2'}`}>
      <div className="space-y-6">
        <section className="space-y-2">
          <SectionTitle>{t('articleView.publication')}</SectionTitle>
          <dl className={dl}>
            {row(t('articleView.authors'), article.authors)}
            {row(t('articleView.affiliations'), article.affiliations)}
            {row(t('articleView.journal'), article.journal)}
            {row(t('articleView.yearType'), [article.year, article.studyType, article.language].filter(Boolean).join(' · '))}
            {row('DOI', <DoiLink doi={article.doi} />)}
          </dl>
        </section>
        <section className="space-y-2">
          <SectionTitle>{t('articleView.origin')}</SectionTitle>
          <dl className={dl}>
            {row(t('articleView.database'), article.source)}
            {row(t('articleView.searchString'), (article.numString || article.searchString) && (
              <span className="font-mono text-xs leading-relaxed">{article.numString ? `#${article.numString}` : ''}{article.numString && article.searchString ? ' · ' : ''}{article.searchString}</span>
            ))}
            {row(t('articleView.imported'), imported && !Number.isNaN(imported.getTime()) ? imported.toLocaleDateString(i18n.language) : null)}
            {row(t('articleView.duplicates'), original
              ? t('articleView.duplicateOf', { source: original.source })
              : linkedDuplicates.length > 0 ? t('articleView.duplicatesLinked', { count: linkedDuplicates.length, sources: [...new Set(linkedDuplicates.map(a => a.source))].join(', ') }) : null)}
          </dl>
        </section>
      </div>

      <div className="space-y-6">
        <section className="space-y-2">
          <SectionTitle>{t('articleView.trail')}</SectionTitle>
          <ol className="space-y-2 text-sm">
            {TRAIL.map(({ field, stage, label }) => {
              const status = article[field];
              if (stage && !status) return null;
              const source = stage ? sourceLabel(t, article.decisionSource?.[stage]) : null;
              return (
                <li key={field} className="flex items-baseline gap-3">
                  <span aria-hidden="true" className={`w-2 h-2 rounded-full shrink-0 ${DOTS[status] ?? DOTS.pending}`} />
                  <span className="w-24 shrink-0 text-gray-900 dark:text-white">{t(label)}</span>
                  <span className="text-gray-700 dark:text-gray-200">
                    {t((STATUS_BADGES[status] ?? STATUS_BADGES.pending).label)}{source && ` · ${source}`}
                  </span>
                </li>
              );
            })}
          </ol>
          {criteriaIds.length > 0 && <p className="text-sm text-gray-700 dark:text-gray-200">{t('articleView.savedCriteria', { list: criteriaIds.join(', ') })}</p>}
        </section>
        <section className="space-y-2">
          <SectionTitle>{t('articleView.scoreTerms', { score: article.score ?? 0 })}</SectionTitle>
          {found.length + missing.length === 0 ? <p className="text-sm text-gray-500 dark:text-gray-400">{t('articleView.noTerms')}</p> : <>
            <ul className="flex flex-wrap gap-1.5">
              {found.map(term => <li key={term} className="px-2 py-0.5 rounded-md text-xs bg-indigo-100 text-indigo-800 dark:bg-indigo-900/60 dark:text-indigo-100">{term}</li>)}
              {missing.map(term => <li key={term} className="px-2 py-0.5 rounded-md text-xs border border-dashed border-gray-300 dark:border-gray-600 text-gray-500 dark:text-gray-400">{term}</li>)}
            </ul>
          </>}
        </section>
      </div>
    </div>
  );
}

// ── Critérios (inclusão, exclusão ou qualidade) ──────────────────────────────
const CRITERIA_STYLES = {
  inclusion: {
    code: 'bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-200',
    checked: 'has-[:checked]:border-green-500 has-[:checked]:bg-green-50/70 dark:has-[:checked]:border-green-600 dark:has-[:checked]:bg-green-900/20',
    box: 'checked:bg-green-600 checked:border-green-600 dark:checked:bg-green-500 dark:checked:border-green-500',
  },
  exclusion: {
    code: 'bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-200',
    checked: 'has-[:checked]:border-red-500 has-[:checked]:bg-red-50/70 dark:has-[:checked]:border-red-600 dark:has-[:checked]:bg-red-900/20',
    box: 'checked:bg-red-600 checked:border-red-600 dark:checked:bg-red-500 dark:checked:border-red-500',
  },
  quality: {
    code: 'bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-200',
    checked: 'has-[:checked]:border-blue-500 has-[:checked]:bg-blue-50/70 dark:has-[:checked]:border-blue-600 dark:has-[:checked]:bg-blue-900/20',
    box: 'checked:bg-blue-600 checked:border-blue-600 dark:checked:bg-blue-500 dark:checked:border-blue-500',
  },
};

// Caixa de seleção própria: quadrado arredondado com ✓ branco na cor da categoria
const CheckBox = ({ checked, onChange, tone }) => (
  <span className="relative grid place-items-center shrink-0 h-5 w-5 mt-0.5">
    <input
      type="checkbox"
      checked={checked}
      onChange={onChange}
      className={`peer appearance-none m-0 p-0 h-5 w-5 rounded-md border-2 border-gray-300 dark:border-gray-500 bg-white dark:bg-gray-800 cursor-pointer transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-gray-800 ${tone}`}
    />
    <Check aria-hidden="true" strokeWidth={3} className="pointer-events-none absolute h-3.5 w-3.5 text-white opacity-0 scale-75 transition peer-checked:opacity-100 peer-checked:scale-100 motion-reduce:transition-none" />
  </span>
);

// Marcador das opções de extração: quadrado com ✓ (várias) ou círculo com ponto (uma)
const ChoiceMark = ({ many, checked, onChange, name, value }) => (
  <span className="relative grid place-items-center shrink-0 h-4 w-4">
    <input
      type={many ? 'checkbox' : 'radio'}
      name={name}
      value={value}
      checked={checked}
      onChange={onChange}
      className={`peer appearance-none m-0 p-0 h-4 w-4 border-2 border-gray-300 dark:border-gray-500 bg-white dark:bg-gray-800 cursor-pointer transition-colors focus:outline-none checked:border-indigo-600 dark:checked:border-indigo-400 ${many ? 'rounded checked:bg-indigo-600 dark:checked:bg-indigo-500' : 'rounded-full'}`}
    />
    {many
      ? <Check aria-hidden="true" strokeWidth={3.5} className="pointer-events-none absolute h-3 w-3 text-white opacity-0 peer-checked:opacity-100" />
      : <span aria-hidden="true" className="pointer-events-none absolute h-2 w-2 rounded-full bg-indigo-600 dark:bg-indigo-400 opacity-0 peer-checked:opacity-100" />}
  </span>
);

export function CriteriaPanel({ category, options, selected, onToggle, showHint = true, textSize = 'normal' }) {
  const { t } = useTranslation();
  const style = CRITERIA_STYLES[category] ?? CRITERIA_STYLES.inclusion;
  return (
    <div className="space-y-2">
      {showHint && <p className="text-sm text-gray-500 dark:text-gray-400">{t('articleView.criteriaHint')}</p>}
      <ul className="space-y-2">
        {options.map(option => (
          <li key={option.id}>
            <label className={`flex items-start gap-3 px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 cursor-pointer transition-colors hover:bg-gray-50 dark:hover:bg-gray-700/40 ${style.checked}`}>
              <CheckBox checked={selected.some(s => s.id === option.id)} onChange={() => onToggle(option)} tone={style.box} />
              <span className={`shrink-0 min-w-[2.25rem] px-1.5 py-0.5 rounded-md text-center text-xs font-bold tabular-nums ${style.code}`}>{option.id}</span>
              <span className={`flex-1 leading-relaxed text-gray-900 dark:text-white ${(TEXT_SIZES[textSize] ?? TEXT_SIZES.normal).item}`}>{option.label}</span>
            </label>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ── Extração ─────────────────────────────────────────────────────────────────
const optionTile = 'inline-flex items-center gap-2 h-8 px-3 rounded-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 cursor-pointer select-none transition-colors touch-manipulation hover:border-indigo-400 hover:bg-indigo-50/60 dark:hover:border-indigo-500 dark:hover:bg-indigo-900/20 has-[:checked]:border-indigo-500 has-[:checked]:bg-indigo-50 dark:has-[:checked]:border-indigo-400 dark:has-[:checked]:bg-indigo-900/30 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-indigo-500';

// Navegadores sem field-sizing (Firefox, Safari): ajusta a altura ao conteúdo
const supportsFieldSizing = typeof CSS !== 'undefined' && CSS.supports?.('field-sizing', 'content');
const fitHeight = (el) => {
  if (!el || supportsFieldSizing) return;
  el.style.height = 'auto';
  el.style.height = `${el.scrollHeight + el.offsetHeight - el.clientHeight}px`;
};

export function ExtractionPanel({ criteria, values, onChange, onCommit, idPrefix = 'article-ex', textSize = 'normal' }) {
  const { t } = useTranslation();
  const visible = criteria.map((criterion, index) => ({ criterion, index })).filter(({ criterion }) => criterion.value !== '');
  const size = (TEXT_SIZES[textSize] ?? TEXT_SIZES.normal).item;
  return (
    <div className="space-y-3">
      <p className="text-sm text-gray-500 dark:text-gray-400">{t('articleView.extractionHint')}</p>
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
        {visible.map(({ criterion, index }) => (
          <div key={index} className="p-4 border border-gray-200 dark:border-gray-700 rounded-xl">
            <label
              id={`${idPrefix}-label-${index}`}
              htmlFor={criterion.type === 'text' ? `${idPrefix}-input-${index}` : undefined}
              className={`flex items-start gap-2.5 mb-3 font-medium text-gray-900 dark:text-white ${size}`}
            >
              <span className="shrink-0 px-1.5 py-0.5 rounded-md text-xs font-semibold tabular-nums bg-orange-100 text-orange-700 dark:bg-orange-900/50 dark:text-orange-300">{criterion.id}</span>
              <span className="flex-1 min-w-0 break-words pt-px">{criterion.value}</span>
              {isExtractionAnswered(values[index]) && <Check size={16} className="shrink-0 mt-0.5 text-green-600 dark:text-green-400" aria-label={t('articleView.answered')} />}
            </label>

            {criterion.type === 'text' && (
              // Cresce com o texto: sem barra de rolagem nem alça de redimensionar
              <textarea
                id={`${idPrefix}-input-${index}`}
                rows={1}
                value={values[index]?.response || ''}
                ref={fitHeight}
                onChange={(e) => { onChange(index, e.target.value); fitHeight(e.target); }}
                onBlur={onCommit}
                placeholder={t('multiSelect.answerPlaceholder')}
                className={`auto-grow block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:border-transparent bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 resize-none overflow-hidden break-words ${size}`}
              />
            )}

            {(criterion.type === 'Pick on List' || criterion.type === 'Pick on Many') && (
              <div role={criterion.type === 'Pick on List' ? 'radiogroup' : 'group'} aria-labelledby={`${idPrefix}-label-${index}`} className="flex flex-wrap gap-2">
                {criterion.items?.map((item, itemIndex) => {
                  const many = criterion.type === 'Pick on Many';
                  const checked = many
                    ? Array.isArray(values[index]?.response) && values[index].response.includes(item)
                    : values[index]?.response === item;
                  return (
                    <label key={itemIndex} className={optionTile}>
                      <ChoiceMark many={many} checked={checked} name={`${idPrefix}-${index}`} value={item} onChange={() => onChange(index, item, many, true)} />
                      <span className={`${checked ? 'text-indigo-700 dark:text-indigo-200 font-medium' : 'text-gray-900 dark:text-white'} ${(TEXT_SIZES[textSize] ?? TEXT_SIZES.normal).option}`}>{item}</span>
                    </label>
                  );
                })}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
