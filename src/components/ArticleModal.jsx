// ArticleModal.jsx - Detalhe do artigo: estilos Abas, Lado a lado, Leitura e Contínuo; critérios e extração no próprio modal,
// confirmação no rodapé, atalhos de teclado e lista de decisões para desfazer

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useTranslation } from 'react-i18next';
import { CheckCircle, XCircle, BookCopy, ChevronLeft, ChevronRight, ArrowLeft, ArrowRight, Undo2, LayoutTemplate, X, ChevronDown, Info, FileText, Award, ClipboardList, Sparkles, ListChecks } from "lucide-react";
import { SuggestionPanel } from "./SuggestionPanel.jsx";
import { DialogPanel } from "./Dialog.jsx";
import { BUTTON, ICON_BUTTON } from "./buttons.js";
import { MODAL_BACKDROP, modalPanelClass } from "./modalStyles.js";
import { StatusBadge, HighlightedText, SummaryPanel, DetailsPanel, CriteriaPanel, ExtractionPanel } from "./article/ArticleSections.jsx";
import { Popover, DecisionsMenu, AppearanceMenu } from "./article/ArticleMenus.jsx";
import { resolveArticleView, saveArticleView } from "./article/preferences.js";
import { matchOptions } from "./article/highlight.js";
import { canUndoDecision } from "../decisionHistory.js";
import { STAGE_LABEL, initialExtractionValues, isExtractionAnswered, isEditableTarget } from "./article/articleView.js";

const DECISION_BUTTONS = {
  included: { icon: CheckCircle, label: 'articles.includeTitle', key: 'I', cls: 'text-green-800 dark:text-green-200 bg-green-100 dark:bg-green-900/40 hover:bg-green-200 dark:hover:bg-green-800/60' },
  excluded: { icon: XCircle, label: 'articles.excludeTitle', key: 'E', cls: 'text-red-800 dark:text-red-200 bg-red-100 dark:bg-red-900/40 hover:bg-red-200 dark:hover:bg-red-800/60' },
  duplicate: { icon: BookCopy, label: 'articles.duplicateTitle', key: 'D', cls: 'text-slate-800 dark:text-slate-100 bg-slate-100 dark:bg-slate-700/60 hover:bg-slate-200 dark:hover:bg-slate-700' },
};
const CATEGORY_TABS = [
  { id: 'inclusion', label: 'articleView.tabInclusion', icon: CheckCircle, iconCls: 'text-green-600 dark:text-green-400', badge: 'bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-200' },
  { id: 'exclusion', label: 'articleView.tabExclusion', icon: XCircle, iconCls: 'text-red-600 dark:text-red-400', badge: 'bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-200' },
  { id: 'quality', label: 'articleView.tabQuality', icon: Award, iconCls: 'text-blue-600 dark:text-blue-400', badge: 'bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-200' },
];

const Kbd = ({ children }) => (
  <kbd className="hidden lg:inline-block ml-1 px-1.5 rounded border border-current font-sans text-[11px] leading-4 opacity-60">{children}</kbd>
);

// Cor e ícone do aviso de decisão, conforme a opção escolhida
const DECISION_FEEDBACK = {
  included: { icon: CheckCircle, cls: 'border-green-200 bg-green-50 text-green-800 dark:border-green-800 dark:bg-green-900/30 dark:text-green-200' },
  excluded: { icon: XCircle, cls: 'border-red-200 bg-red-50 text-red-800 dark:border-red-800 dark:bg-red-900/30 dark:text-red-200' },
  duplicate: { icon: BookCopy, cls: 'border-slate-200 bg-slate-50 text-slate-800 dark:border-slate-600 dark:bg-slate-700/40 dark:text-slate-100' },
};

const useMediaQuery = (query) => {
  const [matches, setMatches] = useState(() => typeof window !== 'undefined' && window.matchMedia(query).matches);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const onChange = () => setMatches(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [query]);
  return matches;
};

// Seção recolhível do estilo Contínuo (fora do componente para manter aberta entre renders)
const ClassicSection = ({ title, icon: Icon, iconCls = 'text-gray-600 dark:text-gray-300', badge, children, defaultOpen = false }) => (
  <details open={defaultOpen} className="group rounded-xl border border-gray-200 dark:border-gray-700">
    <summary className="flex items-center gap-2 px-4 h-12 cursor-pointer select-none list-none [&::-webkit-details-marker]:hidden text-sm font-medium text-gray-900 dark:text-white">
      {Icon && <Icon className={`h-4 w-4 shrink-0 ${iconCls}`} aria-hidden="true" />}
      {title}
      {badge}
      <ChevronDown className="ml-auto h-4 w-4 text-gray-400 transition-transform group-open:rotate-180" aria-hidden="true" />
    </summary>
    <div className="px-4 pb-4">{children}</div>
  </details>
);

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
  handleExtraction,
  criteriaOptions = [],
  extractionCriteria = [],
  initialCriteria = [],
  protocolTerms = [],
  scoring,
  projectView,
  onProjectViewChange,
  allArticles = [],
  decisionHistory = [],
  onUndoDecision,
  onOpenArticle,
  janelaRef,
  assist = null,
}) => {
  const { t } = useTranslation();
  const [visible,    setVisible]    = useState(false);
  const [translateY, setTranslateY] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const dragStartY = useRef(null);
  const dragActive = useRef(false);
  const panelRef = useRef(null);
  const decisionsRef = useRef(null);
  const appearanceRef = useRef(null);
  const confirmRef = useRef(null);

  // Preferências: as do projeto prevalecem; cada mudança vai para o navegador e para o projeto
  const [view, setViewState] = useState(() => resolveArticleView(projectView));
  const setView = useCallback((next) => {
    setViewState(next);
    saveArticleView(next);
    onProjectViewChange?.(next);
  }, [onProjectViewChange]);
  const projectViewKey = JSON.stringify(projectView ?? null);
  useEffect(() => {
    // Outro projeto aberto (ou preferências alteradas fora daqui): segue o projeto
    if (projectView) setViewState(resolveArticleView(projectView));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectViewKey]);
  const [tab, setTab] = useState('summary');
  const [openMenu, setOpenMenu] = useState(null); // null | 'decisions' | 'appearance'
  const [confirming, setConfirming] = useState(null); // null | 'included' | 'excluded'

  const isProcessing = currentFilter === 'dataprocessing';
  const statusField = getStatusField(currentFilter);
  const status = article[statusField];
  const stageLabel = t(STAGE_LABEL[statusField] ?? 'nav.dataprocessing');

  // ── Rascunho dos critérios e respostas de extração, por artigo ────────────
  const [selected, setSelected] = useState(initialCriteria);
  const [extraction, setExtraction] = useState(() => initialExtractionValues(extractionCriteria, article.extractionCriteria));
  const extractionRef = useRef(extraction);
  const savedExtractionRef = useRef(JSON.stringify(extraction));
  useEffect(() => {
    // Ao trocar de artigo, recomeça a partir do que está gravado nele
    setSelected(initialCriteria);
    const values = initialExtractionValues(extractionCriteria, article.extractionCriteria);
    setExtraction(values);
    extractionRef.current = values;
    savedExtractionRef.current = JSON.stringify(values);
    setConfirming(null);
    setOpenMenu(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [article.id]);

  const toggleCriterion = (option) => setSelected(prev => (prev.some(s => s.id === option.id)
    ? prev.filter(s => s.id !== option.id)
    : [...prev, option]));

  const commitExtraction = useCallback((values = extractionRef.current) => {
    const serialized = JSON.stringify(values);
    if (serialized === savedExtractionRef.current) return;
    savedExtractionRef.current = serialized;
    handleExtraction?.(article, values);
  }, [article, handleExtraction]);

  // Escolhas gravam na hora; texto grava ao sair do campo
  const changeExtraction = (index, value, isCheckbox = false, immediate = false) => {
    const next = extractionRef.current.map((item, i) => {
      if (i !== index) return item;
      if (!isCheckbox) return { ...item, response: value };
      const current = Array.isArray(item.response) ? item.response : [];
      return { ...item, response: current.includes(value) ? current.filter(v => v !== value) : [...current, value] };
    });
    extractionRef.current = next;
    setExtraction(next);
    if (immediate) commitExtraction(next);
  };

  // ── Abas disponíveis nesta etapa ──────────────────────────────────────────
  const groups = useMemo(() => Object.fromEntries(CATEGORY_TABS.map(c => [c.id, criteriaOptions.filter(o => o.category === c.id)])), [criteriaOptions]);
  const hasExtraction = currentFilter === 'filter3' && extractionCriteria.some(c => c.value !== '');
  const visibleExtraction = extractionCriteria.map((c, i) => ({ c, i })).filter(({ c }) => c.value !== '');
  const answered = visibleExtraction.filter(({ i }) => isExtractionAnswered(extraction[i])).length;
  const tabs = [
    { id: 'summary', label: t('articleView.tabSummary'), icon: FileText },
    { id: 'details', label: t('articleView.tabDetails'), icon: Info },
    ...(!isProcessing ? CATEGORY_TABS.filter(c => groups[c.id].length).map(c => {
      const count = selected.filter(s => s.category === c.id).length;
      return { id: c.id, label: t(c.label), icon: c.icon, iconCls: c.iconCls, badge: count ? { text: count, cls: c.badge } : null };
    }) : []),
    ...(hasExtraction ? [{ id: 'extraction', label: t('articleView.tabExtraction'), icon: ClipboardList, iconCls: 'text-orange-600 dark:text-orange-400', badge: { text: `${answered}/${visibleExtraction.length}`, cls: 'bg-orange-100 text-orange-800 dark:bg-orange-900/50 dark:text-orange-200' } }] : []),
    ...(assist && !isProcessing ? [{ id: 'ai', label: t('articleView.tabAi'), icon: Sparkles, iconCls: 'text-indigo-500 dark:text-indigo-400' }] : []),
  ];
  // Estilo: Lado a lado vira Abas em telas estreitas
  const isWide = useMediaQuery('(min-width: 1024px)');
  const layout = view.layout === 'split' && !isWide ? 'tabs' : view.layout;
  const usesTabs = layout !== 'continuous';
  const visibleTabs = layout === 'split' ? tabs.filter(x => x.id !== 'summary') : tabs;
  const activeTab = visibleTabs.some(x => x.id === tab) ? tab : visibleTabs[0]?.id;
  const selectTab = (id) => { setTab(id); janelaRef?.current?.scrollTo({ top: 0 }); };

  // ── Navegação e decisões ──────────────────────────────────────────────────
  const goPrevious = () => setCurrentArticle(Math.max(0, currentArticle - 1));
  const goNext = () => setCurrentArticle(Math.min(totalArticles - 1, currentArticle + 1));

  // Depois de decidir, vai para o próximo só se o artigo continuar na lista
  // (com o filtro "Pendentes" ele já sai da lista e o próximo aparece sozinho)
  const advanceFrom = useRef(null);
  const scheduleAdvance = () => {
    if (!view.autoAdvance) return;
    advanceFrom.current = article.id;
    setTimeout(() => { if (advanceFrom.current === article.id) advanceFrom.current = null; }, 1500);
  };
  useEffect(() => {
    if (!advanceFrom.current) return;
    const stillHere = advanceFrom.current === article.id;
    advanceFrom.current = null;
    if (stillHere && currentArticle < totalArticles - 1) setCurrentArticle(currentArticle + 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [article]);

  const commit = useCallback((decision) => {
    setConfirming(null);
    scheduleAdvance();
    if (decision === 'included') handleInclude(article, isProcessing ? null : selected);
    else handleExclude(article, isProcessing ? null : selected);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [article, handleInclude, handleExclude, isProcessing, selected, view.autoAdvance]);

  const decide = (decision) => {
    setOpenMenu(null);
    if (decision === 'duplicate') { setConfirming(null); scheduleAdvance(); handleDuplicate(article); return; }
    // No tratamento a decisão é direta (como antes); nos filtros respeita o modo de confirmação
    if (isProcessing || !view.confirm) { commit(decision); return; }
    setConfirming(decision);
  };

  useEffect(() => { if (confirming) confirmRef.current?.focus(); }, [confirming]);

  // ── Atalhos de teclado (só com o detalhe no topo e fora de campos de texto) ─
  const latest = useRef({});
  const onUndoDecisionRef = useRef(onUndoDecision);
  useEffect(() => { onUndoDecisionRef.current = onUndoDecision; }, [onUndoDecision]);
  useEffect(() => { latest.current = { decide, commit, confirming, openMenu, goPrevious, goNext, tabs: usesTabs ? visibleTabs : [], activeTab, selectTab, undoable }; });
  useEffect(() => {
    const onKeyDown = (e) => {
      const panel = panelRef.current;
      const active = document.activeElement;
      if (!panel || !(panel.contains(active) || active === document.body)) return;
      const s = latest.current;
      if (e.key === 'Escape') {
        if (s.openMenu) { e.preventDefault(); e.stopPropagation(); setOpenMenu(null); return; }
        if (s.confirming) { e.preventDefault(); e.stopPropagation(); setConfirming(null); return; }
        return; // o DialogPanel fecha o detalhe
      }
      // Ctrl+Z desfaz a decisão mais recente que ainda pode ser desfeita
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'z' && !isEditableTarget(e.target)) {
        if (s.undoable) { e.preventDefault(); onUndoDecisionRef.current?.(s.undoable.id); }
        return;
      }
      if (e.ctrlKey || e.metaKey || e.altKey || e.repeat) return;
      if (s.confirming) {
        if (e.key === 'Enter' && e.target?.tagName !== 'BUTTON') { e.preventDefault(); s.commit(s.confirming); }
        return;
      }
      if (s.openMenu || isEditableTarget(e.target)) return;
      const inInput = ['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target?.tagName);
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        if (inInput) return;
        e.preventDefault();
        if (e.target?.getAttribute?.('role') === 'tab') {
          const index = s.tabs.findIndex(x => x.id === s.activeTab);
          const next = s.tabs[(index + (e.key === 'ArrowRight' ? 1 : s.tabs.length - 1)) % s.tabs.length];
          s.selectTab(next.id);
          document.getElementById(`article-tab-${next.id}`)?.focus();
          return;
        }
        releaseButtonFocus();
        if (e.key === 'ArrowLeft') s.goPrevious(); else s.goNext();
        return;
      }
      const key = e.key.toLowerCase();
      const shortcut = key === 'i' ? () => s.decide('included')
        : key === 'e' ? () => s.decide('excluded')
          : key === 'd' ? () => s.decide('duplicate')
            : /^[1-9]$/.test(e.key) && s.tabs[Number(e.key) - 1] ? () => s.selectTab(s.tabs[Number(e.key) - 1].id)
              : null;
      if (!shortcut) return;
      e.preventDefault();
      releaseButtonFocus();
      shortcut();
    };
    // Atalho usado com o foco num botão clicado (ex.: ">"): devolve o foco ao painel
    // para o navegador não desenhar o contorno de foco nesse botão
    const releaseButtonFocus = () => {
      const active = document.activeElement;
      if (active?.tagName === 'BUTTON' && active.getAttribute('role') !== 'tab') panelRef.current?.focus({ preventScroll: true });
    };
    // Captura na janela: roda antes do Esc do DialogPanel (que escuta no documento)
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, []);

  // ── Entrada, saída e arrastar para fechar (celular) ───────────────────────
  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const frame = requestAnimationFrame(() => setVisible(true));
    return () => {
      cancelAnimationFrame(frame);
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  const closeWithAnimation = useCallback(() => {
    commitExtraction();
    setVisible(false);
    setTranslateY(window.innerHeight);
    setTimeout(onClose, 300);
  }, [onClose, commitExtraction]);

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
    if (translateY > 80) closeWithAnimation();
    else setTranslateY(0);
    dragStartY.current = null;
    dragActive.current = false;
  };

  const sheetStyle = {
    transform:  `translateY(${translateY}px)`,
    transition: isDragging
      ? 'none'
      : visible
        ? 'transform 0.35s cubic-bezier(0.32,0.72,0,1)'
        : 'transform 0.28s ease-in',
  };

  const articlesById = useMemo(() => new Map(allArticles.map(a => [a.id, a])), [allArticles]);
  const pendingUndo = decisionHistory.filter(e => e.state === 'available').length;
  const undoable = decisionHistory.find(e => canUndoDecision(e, articlesById.get(e.articleId))) ?? null;
  const latestEntryId = decisionHistory[0]?.id;
  const seenEntry = useRef(latestEntryId);
  const [feedbackId, setFeedbackId] = useState(null);
  useEffect(() => {
    if (latestEntryId && latestEntryId !== seenEntry.current) setFeedbackId(latestEntryId);
    seenEntry.current = latestEntryId;
  }, [latestEntryId]);
  const feedback = feedbackId ? decisionHistory.find(e => e.id === feedbackId) : null;
  useEffect(() => {
    if (!feedback) return;
    const timer = setTimeout(() => setFeedbackId(null), feedback.state === 'available' ? 8000 : 3000);
    return () => clearTimeout(timer);
  }, [feedbackId, feedback?.state]); // eslint-disable-line react-hooks/exhaustive-deps
  const progress = totalArticles ? ((currentArticle + 1) / totalArticles) * 100 : 0;
  const selectedIds = selected.map(s => s.id);

  // ── Conteúdo das abas / seções ────────────────────────────────────────────
  const match = useMemo(() => matchOptions(scoring), [scoring]);
  const summary = <SummaryPanel article={article} terms={protocolTerms} match={match} view={view} classic={layout === 'continuous'} reading={layout === 'reading'} onToggleHighlight={() => setView({ ...view, highlight: !view.highlight })} onTextSize={(textSize) => setView({ ...view, textSize })} />;
  const details = <DetailsPanel article={article} allArticles={allArticles} terms={protocolTerms} match={match} stacked={layout === 'split'} />;
  const criteriaPanel = (category, showHint = true) => (
    <CriteriaPanel category={category} options={groups[category]} selected={selected} onToggle={toggleCriterion} showHint={showHint} textSize={view.textSize} />
  );
  const extractionPanel = <ExtractionPanel criteria={extractionCriteria} values={extraction} onChange={changeExtraction} onCommit={() => commitExtraction()} textSize={view.textSize} />;
  const aiPanel = assist ? <SuggestionPanel {...assist} /> : null;

  const tabContent = {
    summary, details,
    inclusion: criteriaPanel('inclusion'), exclusion: criteriaPanel('exclusion'), quality: criteriaPanel('quality'),
    extraction: extractionPanel, ai: aiPanel,
  };


  const tabList = (
    <div role="tablist" aria-label={t('articleView.sections')} className={`flex-shrink-0 flex gap-x-1 px-2 sm:px-4 border-b border-gray-200 dark:border-gray-700 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden ${layout === 'split' ? 'flex-wrap' : 'mt-3 overflow-x-auto overflow-y-hidden overscroll-x-contain'} ${layout === 'reading' ? 'justify-center' : ''}`}>
      {visibleTabs.map((x, index) => {
        const selectedTab = x.id === activeTab;
        return (
          <button
            key={x.id}
            id={`article-tab-${x.id}`}
            type="button"
            role="tab"
            aria-selected={selectedTab}
            aria-controls="article-tabpanel"
            tabIndex={selectedTab ? 0 : -1}
            onClick={() => selectTab(x.id)}
            title={`${x.label} (${index + 1})`}
            className={`shrink-0 inline-flex items-center gap-1.5 h-11 px-3 -mb-px border-0 border-b-2 rounded-none bg-transparent text-sm whitespace-nowrap transition-colors ${selectedTab
              ? 'border-indigo-500 text-gray-900 dark:text-white font-semibold'
              : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:border-gray-300 dark:hover:border-gray-500'}`}
          >
            {x.icon && <x.icon className={`h-4 w-4 shrink-0 ${x.iconCls ?? (selectedTab ? 'text-indigo-600 dark:text-indigo-300' : 'text-gray-400 dark:text-gray-500')}`} aria-hidden="true" />}
            {x.label}
            {x.badge && <span className={`px-1.5 rounded-full text-[11px] font-semibold tabular-nums ${x.badge.cls}`}>{x.badge.text}</span>}
            <Kbd>{index + 1}</Kbd>
          </button>
        );
      })}
    </div>
  );
  const tabPanelProps = { role: 'tabpanel', id: 'article-tabpanel', 'aria-labelledby': `article-tab-${activeTab}` };

  const confirmTone = confirming === 'included'
    ? { bar: 'border-green-500 bg-green-50 dark:bg-green-900/25', icon: CheckCircle, iconCls: 'text-green-600 dark:text-green-400', btn: BUTTON.success }
    : { bar: 'border-red-500 bg-red-50 dark:bg-red-900/25', icon: XCircle, iconCls: 'text-red-600 dark:text-red-400', btn: BUTTON.danger };

  return (
    <div
      className={`${MODAL_BACKDROP} z-50`}
      onClick={() => closeWithAnimation()}
      style={{ opacity: visible ? 1 : 0, transition: 'opacity 0.3s ease' }}
    >
      <DialogPanel
        ref={panelRef}
        onClose={closeWithAnimation}
        labelledBy="article-modal-title"
        focusPanel
        className={`${modalPanelClass('xl')} sm:h-[90dvh]`}
        style={sheetStyle}
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── Topo: etapa, navegação, status e ferramentas ───────────────────── */}
        <div className="flex-shrink-0 border-b border-gray-200 dark:border-gray-700">
          <div
            className="sm:hidden flex justify-center items-center pt-3 pb-1 px-4 select-none"
            style={{ cursor: isDragging ? 'grabbing' : 'grab', touchAction: 'none' }}
            onTouchStart={onHandleTouchStart}
            onTouchMove={onHandleTouchMove}
            onTouchEnd={onHandleTouchEnd}
          >
            <div className={`h-1 rounded-full transition-[width,background-color] duration-150 motion-reduce:transition-none ${isDragging ? 'w-[52px] bg-indigo-500' : 'w-10 bg-gray-300 dark:bg-gray-600'}`} />
          </div>

          <div className="flex items-center gap-1 sm:gap-2 px-3 sm:px-5 py-2">
            <span className="hidden md:inline text-sm font-semibold text-gray-900 dark:text-white">{stageLabel}</span>
            <span aria-hidden="true" className="hidden md:inline text-gray-400">/</span>
            <button type="button" onClick={goPrevious} disabled={currentArticle === 0} aria-label={t('modals.article.previous')} title={t('modals.article.previous')} className={`${ICON_BUTTON} disabled:opacity-30 disabled:hover:bg-transparent`}>
              <ChevronLeft className="h-5 w-5" aria-hidden="true" />
            </button>
            <span className="text-sm text-gray-900 dark:text-white tabular-nums whitespace-nowrap">
              <span className="sm:hidden" aria-hidden="true">{currentArticle + 1}/{totalArticles}</span>
              <span className="max-sm:sr-only">{t('articleView.position', { n: currentArticle + 1, total: totalArticles })}</span>
            </span>
            <button type="button" onClick={goNext} disabled={currentArticle >= totalArticles - 1} aria-label={t('modals.article.next')} title={t('modals.article.next')} className={`${ICON_BUTTON} disabled:opacity-30 disabled:hover:bg-transparent`}>
              <ChevronRight className="h-5 w-5" aria-hidden="true" />
            </button>

            <div className="flex-1" />
            <StatusBadge status={status} />

            <div className="relative" ref={decisionsRef}>
              <button type="button" onClick={() => setOpenMenu(openMenu === 'decisions' ? null : 'decisions')} aria-expanded={openMenu === 'decisions'} title={t('articleView.decisions')}
                className={`inline-flex items-center gap-1.5 h-10 px-2.5 rounded-lg border-none text-sm transition-colors ${openMenu === 'decisions' ? 'bg-indigo-50 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-200' : 'bg-transparent text-gray-800 dark:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-700'}`}>
                <Undo2 className="h-4 w-4" aria-hidden="true" />
                <span className="hidden sm:inline">{t('articleView.decisions')}</span>
                {pendingUndo > 0 && <span className="min-w-[1.25rem] px-1.5 rounded-full bg-indigo-600 text-white text-xs tabular-nums">{pendingUndo}</span>}
              </button>
              <Popover open={openMenu === 'decisions'} onClose={() => setOpenMenu(null)} label={t('articleView.decisions')} anchorRef={decisionsRef}>
                <DecisionsMenu entries={decisionHistory} articlesById={articlesById} onUndo={onUndoDecision} onOpen={(a) => { setOpenMenu(null); onOpenArticle?.(a); }} />
              </Popover>
            </div>

            <div className="relative" ref={appearanceRef}>
              <button type="button" onClick={() => setOpenMenu(openMenu === 'appearance' ? null : 'appearance')} aria-expanded={openMenu === 'appearance'} aria-label={t('articleView.appearance')} title={t('articleView.appearance')}
                className={`${ICON_BUTTON} ${openMenu === 'appearance' ? '!bg-indigo-50 !text-indigo-700 dark:!bg-indigo-900/40 dark:!text-indigo-200' : ''}`}>
                <LayoutTemplate className="h-5 w-5" aria-hidden="true" />
              </button>
              <Popover open={openMenu === 'appearance'} onClose={() => setOpenMenu(null)} label={t('articleView.appearance')} anchorRef={appearanceRef}>
                <AppearanceMenu view={view} onChange={setView} />
              </Popover>
            </div>

            <button type="button" onClick={() => closeWithAnimation()} aria-label={t('modals.close')} className={ICON_BUTTON}>
              <X className="h-5 w-5" aria-hidden="true" />
            </button>
          </div>
          <div className="h-0.5 bg-gray-100 dark:bg-gray-700" aria-hidden="true">
            <div className="h-full bg-indigo-500 transition-[width] duration-300 motion-reduce:transition-none" style={{ width: `${progress}%` }} />
          </div>
        </div>

        <div className={`flex-shrink-0 px-4 sm:px-6 pt-4 ${layout === 'reading' ? 'text-center' : ''}`}>
          <h2 id="article-modal-title" className={`text-base sm:text-xl font-semibold leading-snug text-gray-900 dark:text-white line-clamp-3 ${layout === 'reading' ? 'font-serif sm:text-2xl max-w-3xl mx-auto' : ''}`}>
            <HighlightedText text={article.title} terms={protocolTerms} enabled={view.highlight} marker={view.marker} options={match} />
          </h2>
        </div>

        {usesTabs && layout !== 'split' && tabList}

        {/* ── Corpo ──────────────────────────────────────────────────────────── */}
        {layout === 'split' ? (
          <div className="flex-1 min-h-0 mt-3 grid grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] border-t border-gray-200 dark:border-gray-700">
            <div ref={janelaRef} className="min-h-0 overflow-y-auto overscroll-contain px-6 py-5 border-r border-gray-200 dark:border-gray-700">
              {summary}
            </div>
            <div className="min-h-0 flex flex-col">
              {tabList}
              <div {...tabPanelProps} className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-5 py-5">
                {tabContent[activeTab]}
              </div>
            </div>
          </div>
        ) : (
          <div
            ref={janelaRef}
            {...(usesTabs ? tabPanelProps : {})}
            className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-4 sm:px-6 py-5"
          >
            {usesTabs ? (
              <div className={layout === 'reading' ? 'max-w-3xl mx-auto' : ''}>{tabContent[activeTab]}</div>
            ) : (
              <div className="space-y-4">
                {summary}
                {!isProcessing && CATEGORY_TABS.some(c => groups[c.id].length) && (
                  <ClassicSection
                    title={t('articleView.criteria')}
                    icon={ListChecks}
                    badge={selected.length > 0 && <span className="px-1.5 rounded-full text-[11px] font-semibold bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200">{selectedIds.join(', ')}</span>}
                  >
                    <div className="space-y-4">
                      <p className="text-sm text-gray-500 dark:text-gray-400">{t('articleView.criteriaHint')}</p>
                      {CATEGORY_TABS.filter(c => groups[c.id].length).map(c => (
                        <div key={c.id} className="space-y-2">
                          <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-gray-700 dark:text-gray-200"><c.icon className={`h-3.5 w-3.5 ${c.iconCls}`} aria-hidden="true" />{t(c.label)}</h3>
                          {criteriaPanel(c.id, false)}
                        </div>
                      ))}
                    </div>
                  </ClassicSection>
                )}
                {hasExtraction && (
                  <ClassicSection title={t('articleView.tabExtraction')} icon={ClipboardList} iconCls="text-orange-600 dark:text-orange-400" badge={<span className="px-1.5 rounded-full text-[11px] font-semibold bg-orange-100 text-orange-800 dark:bg-orange-900/50 dark:text-orange-200 tabular-nums">{answered}/{visibleExtraction.length}</span>}>
                    {extractionPanel}
                  </ClassicSection>
                )}
                {aiPanel}
                <ClassicSection title={t('articleView.tabDetails')} icon={Info}>{details}</ClassicSection>
              </div>
            )}
          </div>
        )}

        {/* ── Rodapé: decisões ou confirmação ───────────────────────────────── */}
        {confirming ? (
          <div role="alertdialog" aria-labelledby="article-confirm-title" className={`flex-shrink-0 flex flex-col sm:flex-row sm:items-center gap-3 px-4 sm:px-6 py-4 border-t-2 sm:rounded-b-2xl ${confirmTone.bar}`}>
            <confirmTone.icon className={`hidden sm:block h-6 w-6 shrink-0 ${confirmTone.iconCls}`} aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <p id="article-confirm-title" className="text-sm sm:text-base font-semibold text-gray-900 dark:text-white">
                {t(`articleView.confirmTitle_${confirming}`, { stage: stageLabel })}
              </p>
              <p className="text-sm text-gray-700 dark:text-gray-200">
                {selected.length ? t('articleView.confirmCriteria', { list: selectedIds.join(', ') }) : t('articleView.confirmNoCriteria')}
              </p>
            </div>
            <div className="flex flex-col-reverse sm:flex-row gap-2 [&>button]:w-full sm:[&>button]:w-auto">
              <button type="button" onClick={() => setConfirming(null)} className={BUTTON.secondary}>
                {t('modals.confirm.cancel')}<Kbd>Esc</Kbd>
              </button>
              <button type="button" ref={confirmRef} onClick={() => commit(confirming)} className={confirmTone.btn}>
                {t(`articleView.confirmAction_${confirming}`)}<Kbd>Enter</Kbd>
              </button>
            </div>
          </div>
        ) : (
          <div className="flex-shrink-0 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 px-4 sm:px-6 py-3 sm:py-4 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/40 sm:rounded-b-2xl">
            <div className="grid grid-cols-3 sm:flex gap-2">
              {Object.entries(DECISION_BUTTONS).map(([decision, cfg]) => (
                <button
                  key={decision}
                  type="button"
                  onClick={() => decide(decision)}
                  aria-keyshortcuts={cfg.key}
                  className={`inline-flex items-center justify-center gap-1.5 h-11 px-3 sm:px-4 rounded-xl border-none text-sm font-semibold touch-manipulation active:scale-95 transition duration-150 ${cfg.cls}`}
                >
                  <cfg.icon size={16} aria-hidden="true" />
                  {t(cfg.label)}
                  <Kbd>{cfg.key}</Kbd>
                </button>
              ))}
            </div>
            {feedback ? (() => {
              const blocked = feedback.state === 'changed' || feedback.state === 'missing';
              const tone = feedback.state === 'available' ? DECISION_FEEDBACK[feedback.status] ?? DECISION_FEEDBACK.included : null;
              const Icon = tone?.icon ?? (blocked ? Info : Undo2);
              return (
                <div role="status" className={`inline-flex items-center gap-2 min-h-9 pl-2.5 pr-1 py-1 rounded-lg border text-sm ${tone?.cls ?? (blocked
                  ? 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-900/30 dark:text-amber-200'
                  : 'border-gray-200 bg-white text-gray-700 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200')}`}>
                  <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                  <span className="min-w-0 truncate">
                    {feedback.state === 'available'
                      ? t('decisionUndo.message', { status: t(`modals.article.status${{ included: 'Included', excluded: 'Excluded', duplicate: 'Duplicate' }[feedback.status] ?? 'Included'}`), stage: t(STAGE_LABEL[feedback.statusType] ?? 'nav.dataprocessing') })
                      : t(`decisionUndo.${feedback.state}`)}
                  </span>
                  {feedback.state === 'available' && canUndoDecision(feedback, articlesById.get(feedback.articleId)) && (
                    <button type="button" onClick={() => onUndoDecision?.(feedback.id)} title={t('decisionUndo.shortcut')}
                      className="shrink-0 inline-flex items-center gap-1 h-7 px-2 rounded-md border-none bg-transparent font-semibold underline-offset-2 hover:underline hover:bg-black/5 dark:hover:bg-white/10">
                      <Undo2 className="h-3.5 w-3.5" aria-hidden="true" />
                      {t('decisionUndo.undo')}
                    </button>
                  )}
                </div>
              );
            })() : !isProcessing && selected.length > 0 && (
              <p className="text-xs text-gray-700 dark:text-gray-200 sm:ml-1">{t('articleView.selectedCriteria', { count: selected.length, list: selectedIds.join(', ') })}</p>
            )}
            <div className="hidden sm:flex flex-1" />
            <div className="grid grid-cols-2 sm:flex gap-2">
              <button type="button" onClick={goPrevious} disabled={currentArticle === 0} aria-keyshortcuts="ArrowLeft" title={`${t('articleView.previous')} (←)`} className={BUTTON.secondary}>
                <ArrowLeft className="h-4 w-4" strokeWidth={2.5} aria-hidden="true" />
                {t('articleView.previous')}
              </button>
              <button type="button" onClick={goNext} disabled={currentArticle >= totalArticles - 1} aria-keyshortcuts="ArrowRight" title={`${t('articleView.next')} (→)`} className={BUTTON.secondary}>
                {t('articleView.next')}
                <ArrowRight className="h-4 w-4" strokeWidth={2.5} aria-hidden="true" />
              </button>
            </div>
          </div>
        )}
      </DialogPanel>
    </div>
  );
};

export default ArticleModal;
