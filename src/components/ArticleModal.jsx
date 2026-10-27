import { useState, useEffect, useRef, useCallback } from "react";
import { useTranslation } from 'react-i18next';
import { XCircle, CheckCircle, BookCopy, ListCollapse, Link  } from "lucide-react";
import { SuggestionPanel } from "./SuggestionPanel.jsx";

const ArticleModal = ({
  article,
  onClose,
  currentFilter,
  getStatusField,
  currentArticle,
  totalArticles,
  setCurrentArticle,
  handleInclude,
  handleExclude,
  handleDuplicate,
  setShowCriterionModal,
  optionExtraction,
  janelaRef,
  assist = null,
}) => {
  const { t } = useTranslation();
  const [visible,    setVisible]    = useState(false);
  const [translateY, setTranslateY] = useState(0);
  const [isDragging, setIsDragging] = useState(false);

  const dragStartY = useRef(null);
  const dragActive = useRef(false);

  // ── Entrada ────────────────────────────────────────────────────────────────
  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    // setTranslateY(0);
    const t = requestAnimationFrame(() => setVisible(true));
    return () => {
      cancelAnimationFrame(t);
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  // ── Fecha com animação de saída ────────────────────────────────────────────
  const closeWithAnimation = useCallback(() => {
    setVisible(false);
    setTranslateY(window.innerHeight);
    setTimeout(onClose, 300);
  }, [onClose]);

  // ── Drag-to-close — APENAS no handle ──────────────────────────────────────
  const onHandleTouchStart = (e) => {
    dragStartY.current = e.touches[0].clientY;
    dragActive.current = false;
    setIsDragging(false);
  };

  const onHandleTouchMove = (e) => {
    if (dragStartY.current === null) return;
    const delta = e.touches[0].clientY - dragStartY.current;
    if (!dragActive.current && delta < 8) return;
    dragActive.current = true;
    e.preventDefault();
    if (delta > 0) {
      setIsDragging(true);
      setTranslateY(delta);
    }
  };

  const onHandleTouchEnd = () => {
    setIsDragging(false);
    if (translateY > 80) {
      closeWithAnimation();
    } else {
      setTranslateY(0);
    }
    dragStartY.current = null;
    dragActive.current = false;
  };

  // ── Status badge ───────────────────────────────────────────────────────────
  const status = article[getStatusField(currentFilter)];
  const statusConfig = {
    included:  { label: t('modals.article.statusIncluded'), cls: 'bg-green-100  dark:bg-green-900/50  text-green-800  dark:text-green-300'  },
    excluded:  { label: t('modals.article.statusExcluded'), cls: 'bg-red-100    dark:bg-red-900/50    text-red-800    dark:text-red-300'    },
    duplicate: { label: t('modals.article.statusDuplicate'), cls: 'bg-orange-100 dark:bg-orange-900/50 text-orange-800 dark:text-orange-300' },
  };
  const { label: statusLabel, cls: statusCls } = statusConfig[status] ?? {
    label: t('modals.article.statusPending'),
    cls:   'bg-yellow-100 dark:bg-yellow-900/50 text-yellow-800 dark:text-yellow-300',
  };

  // ── Estilos da sheet ───────────────────────────────────────────────────────
  const sheetStyle = {
    maxHeight:  '92dvh',
    transform:  `translateY(${translateY}px)`,
    transition: isDragging
      ? 'none'
      : visible
        ? 'transform 0.35s cubic-bezier(0.32,0.72,0,1)'
        : 'transform 0.28s ease-in',
  };

  return (
    <div
      className="fixed inset-0 z-49 flex items-end sm:items-center justify-center sm:p-4"
      onClick={() => closeWithAnimation()}
      style={{
        backgroundColor: 'rgba(0,0,0,0.5)',
        opacity:    visible ? 1 : 0,
        transition: 'opacity 0.3s ease',
      }}
    >
      <div
        className="bg-white dark:bg-gray-800 rounded-t-2xl sm:rounded-2xl w-full sm:max-w-6xl flex flex-col"
        style={sheetStyle}
        onClick={(e) => e.stopPropagation()}
      >

        {/* ── Header ─────────────────────────────────────────────────────── */}
        <div className="flex-shrink-0 px-4 pt-2 pb-4 sm:px-6 sm:pt-6 border-b border-gray-200 dark:border-gray-700">

          {/* Handle */}
          <div
            className="sm:hidden flex justify-center items-center py-2 mb-1 -mx-4 px-4 select-none"
            style={{ cursor: isDragging ? 'grabbing' : 'grab', touchAction: 'none' }}
            onTouchStart={onHandleTouchStart}
            onTouchMove={onHandleTouchMove}
            onTouchEnd={onHandleTouchEnd}
          >
            <div
              className="rounded-full transition-all duration-150"
              style={{
                width:           isDragging ? '52px' : '40px',
                height:          '4px',
                backgroundColor: isDragging ? '#6366f1' : '#d1d5db',
              }}
            />
          </div>

          <div className="flex justify-between items-start gap-3">
            <h3 className="text-base sm:text-lg font-semibold text-gray-900 dark:text-white leading-snug line-clamp-3 flex-1">
              {article.title}
            </h3>
            <button
              onClick={() => closeWithAnimation()}
              className="flex-shrink-0 -mt-1 -mr-1 p-2 rounded-full
                         text-gray-400 dark:text-gray-500
                         hover:text-gray-700 dark:hover:text-gray-200
                         hover:bg-gray-100 dark:hover:bg-gray-700
                         active:bg-gray-200 dark:active:bg-gray-600
                         transition-colors duration-150 touch-manipulation"
              aria-label={t('modals.close')}
            >
              <XCircle size={22} />
            </button>
          </div>

          <span className={`mt-2 inline-flex px-2 py-0.5 text-xs leading-5 font-semibold rounded-full ${statusCls}`}>
            {statusLabel}
          </span>
        </div>

        {/* ── Body ───────────────────────────────────────────────────────── */}
        <div
          className="flex-1 overflow-y-auto overscroll-contain px-4 py-4 sm:px-6"
          ref={janelaRef}
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-3 mb-4 text-sm">
            <div className="text-gray-700 text-base dark:text-gray-300">
              <span className="font-semibold text-base">{t('modals.article.authors')}</span>{' '}
              <span className="break-words">{article.authors}</span>
            </div>
            <div className="text-gray-700 text-base dark:text-gray-300">
              <span className="font-semibold ">{t('modals.article.source')}</span> {article.source}
            </div>
            <div className="text-gray-700 text-base dark:text-gray-300">
              <span className="font-semibold ">{t('modals.article.journal')}</span>{' '}
              <span className="break-words">{article.journal}</span>
            </div>
            <div className="text-gray-700 text-base dark:text-gray-300">
              <span className="font-semibold ">{t('modals.article.year')}</span> {article.year}
            </div>
            <div className="flex flex-row text-gray-700 text-base dark:text-gray-300">
              <span className="font-semibold ">{t('modals.article.doi')}</span>{' '}
              {article.doi?
                    <div
                      onClick={() => window.open(`https://doi.org/${article.doi}`, '_blank')}
                      className="flex flex-row justify-start items-center gap-1 hover:text-blue-600 dark:hover:text-blue-400 hover:underline ml-1 cursor-pointer break-all"
                    >
                      <Link size={12}/>
                      {article.doi}
                    </div>
                    :<span  className="ml-1"> {t('modals.article.notIdentified')}</span>
              }
            </div>
            <div className="text-gray-700 text-base dark:text-gray-300">
              <span className="font-semibold">{t('modals.article.score')}</span> {article.score}
            </div>
          </div>

          <div className="mb-3">
            <strong className="text-base text-gray-700 dark:text-gray-300">{t('modals.article.keywords')}</strong>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {article.keywords.map((kw, i) => (
                <span key={i} className="px-2 py-0.5 bg-blue-100 dark:bg-blue-900/50 text-blue-800 dark:text-blue-300 text-sm rounded-full">
                  {kw}
                </span>
              ))}
            </div>
          </div>

          <div className="mb-2">
            <strong className="text-base text-gray-700 dark:text-gray-300">{t('modals.article.abstract')}</strong>
            <p className="mt-2 text-base text-gray-700 dark:text-gray-300 leading-relaxed ">
              {article.abstract}
            </p>
          </div>

          {assist && currentFilter !== 'dataprocessing' && (
            <SuggestionPanel {...assist} />
          )}
        </div>

        {/* ── Footer ─────────────────────────────────────────────────────── */}
        <div className="flex-shrink-0 border-t border-gray-200 dark:border-gray-700 px-4 sm:px-6 py-3 flex flex-col sm:flex-row items-center justify-between gap-3">

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 gap-2 w-full sm:w-auto justify-center sm:justify-start">
            {[
              {
                label: t('articles.includeTitle'),
                icon:  <CheckCircle size={16} />,
                cls:   'text-green-700 dark:text-green-300 bg-green-100 dark:bg-green-900/40 hover:bg-green-200 dark:hover:bg-green-800/60',
                onClick: () => currentFilter === 'dataprocessing'
                  ? handleInclude(article)
                  : setShowCriterionModal({ type: 'include', article }),
              },
              {
                label: t('articles.excludeTitle'),
                icon:  <XCircle size={16} />,
                cls:   'text-red-700 dark:text-red-300 bg-red-100 dark:bg-red-900/40 hover:bg-red-200 dark:hover:bg-red-800/60',
                onClick: () => currentFilter === 'dataprocessing'
                  ? handleExclude(article)
                  : setShowCriterionModal({ type: 'exclude', article }),
              },
              {
                label: t('articles.duplicateTitle'),
                icon:  <BookCopy size={16} />,
                cls:   'text-orange-700 dark:text-orange-300 bg-orange-100 dark:bg-orange-900/40 hover:bg-orange-200 dark:hover:bg-orange-800/60',
                onClick: () => handleDuplicate(article),
              },
              ...(currentFilter === 'filter3' ? [{
                label:    t('modals.article.extraction'),
                icon:     <ListCollapse size={16} />,
                cls:      'text-indigo-700 dark:text-indigo-300 bg-indigo-100 dark:bg-indigo-900/40 hover:bg-indigo-200 dark:hover:bg-indigo-800/60',
                disabled: optionExtraction,
                onClick:  () => setShowCriterionModal({ type: 'extraction', article: article }),
              }] : []),
            ].map(({ label, icon, cls, onClick, disabled }) => (
              <button
                key={label}
                onClick={onClick}
                disabled={disabled}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium touch-manipulation
                            active:scale-95 transition-all duration-150 disabled:opacity-40 disabled:cursor-not-allowed ${cls}`}
              >
                {icon}
                <span>{label}</span>
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto justify-center sm:justify-end">
            <button
              onClick={() => setCurrentArticle(Math.max(0, currentArticle - 1))}
              disabled={currentArticle === 0}
              className="flex-1 sm:flex-none px-4 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-xl touch-manipulation
                         disabled:opacity-40 hover:bg-gray-100 dark:hover:bg-gray-700 active:scale-95
                         bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 transition-all duration-150"
            >
              {t('modals.article.previous')}
            </button>
            <span className="text-sm text-gray-500 dark:text-gray-400 min-w-[70px] text-center tabular-nums flex-shrink-0">
              {currentArticle + 1} / {totalArticles}
            </span>
            <button
              onClick={() => setCurrentArticle(Math.min(totalArticles - 1, currentArticle + 1))}
              disabled={currentArticle === totalArticles - 1}
              className="flex-1 sm:flex-none px-4 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-xl touch-manipulation
                         disabled:opacity-40 hover:bg-gray-100 dark:hover:bg-gray-700 active:scale-95
                         bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 transition-all duration-150"
            >
              {t('modals.article.next')}
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};

export default ArticleModal;
