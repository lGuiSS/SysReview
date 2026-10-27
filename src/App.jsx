import React, { useRef, useState, useEffect, useMemo, useCallback } from 'react';
import { Search, Filter, ChartArea, Download, Table, Upload, CheckCircle, Check, XCircle, BookCopy, List, Clock, BarChart3, FileText, Database, RefreshCw, Settings, Sun, Moon, Bell, ArrowUpDown, ArrowUp, ArrowDown, ChevronDown, Eye, PlusCircle, X, CopyX, CopyCheck, HeartHandshake, Languages, Save, ListChecks, Info, GraduationCap } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { SvgIcon } from './icons/SysReviewIcon.jsx';

import ArticleModal from "./components/ArticleModal.jsx"

import StatisticsSection from "./components/StatisticsSection.jsx"
import AboutSection from "./components/AboutSection.jsx"
import { UnsavedWarningModal } from "./components/UnsavedWarningModal.jsx";
import { ReminderSettingsModal } from "./components/ReminderSettingsModal.jsx";
import { SupportModal } from "./components/SupportModal.jsx";
import { OnboardingChecklist } from "./components/OnboardingChecklist.jsx";
import { buildChecklistItems } from "./tour/checklistItems.js";
import { useGuidedTour } from "./tour/useGuidedTour.js";
import { hasSeenTour, isChecklistHidden, setChecklistHidden } from "./tutorialStorage.js";
import { SupportRequestModal } from "./components/SupportRequestModal.jsx";
import { AlertModal } from "./components/AlertModal.jsx";
import { AutoSaveOfferModal } from "./components/AutoSaveOfferModal.jsx";
import { JevSettingsModal } from "./components/JevSettingsModal.jsx";
import { JevBatchModal, JevApplyModal } from "./components/JevBatchModal.jsx";
import { SuggestionBadge } from "./components/SuggestionPanel.jsx";
import { jevErrorMessage, suggestionTooltip } from "./ai/messages.js";
import { loadJevSettings, saveJevSettings } from "./ai/jevClient.js";
import { STAGES, evaluateArticle, getAiConfig, isAutoApplicable, isSuggestionStale, relevanceOf, suggestionProbability, autoRuleSummary, withCurrentRules } from "./ai/screening.js";

import {
  saveProjectToFile,
  loadProjectFromFile,
  setupAutoSave,
  loadAutoSave,
  clearAutoSave,
  autoSaveToFile,
  clearFileHandle,
  isFileSystemAccessSupported,
  requestHandlePermission,
  openProjectFromPicker
} from './fileSystem.js';

import countryPatternsData from './countryPatterns/countryPatterns_v3.json';
import ExcelJS from "exceljs";
import { Analytics } from '@vercel/analytics/react';

// Hook personalizado para gerenciar o tema
const useTheme = () => {
  const [theme, setTheme] = useState(() => {
    const saved = localStorage.getItem('theme');
    if (saved) return saved;
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  });

  useEffect(() => {
    const root = document.documentElement;
    root.classList.remove('light', 'dark');
    root.classList.add(theme);
    localStorage.setItem('theme', theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme(prevTheme => prevTheme === 'light' ? 'dark' : 'light');
  };

  return { theme, toggleTheme };
};

// Componente Toggle
const ThemeToggle = ({ theme, toggleTheme }) => {
  const { t } = useTranslation();
  return (
    <button
      onClick={toggleTheme}
      data-tour="theme"
      className="p-2 rounded-lg flex items-center justify-center transition-colors duration-200 bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600"
      title={t('header.themeToggle', { next: theme === 'light' ? t('header.dark') : t('header.light') })}
    >
      {theme === 'light' ? (
        <Moon className="h-5 w-5 text-gray-600 dark:text-gray-300" />
      ) : (
        <Sun className="h-5 w-5 text-yellow-500" />
      )}
    </button>
  );
};

const LanguageSelector = () => {
  const { i18n } = useTranslation();
  return (
    <button
      data-tour="language"
      onClick={() => i18n.changeLanguage(i18n.language === 'pt' ? 'en' : 'pt')}
      className="px-2 py-2 rounded-lg flex items-center justify-center transition-colors duration-200 bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600"
      title={i18n.language === 'pt' ? 'English' : 'Português'}
    >
      <Languages className="h-5 w-5 text-gray-600 dark:text-gray-300" />
    </button>
  );
};

function getField(bibtex, field) {
  // Localiza "field =" precedido de início de linha, vírgula ou chave de entrada
  const headerRegex = new RegExp(`(?:^|[\\n,{])\\s*${field}\\s*=\\s*`, "i");
  const headerMatch = bibtex.match(headerRegex);
  if (!headerMatch) return null;

  const start = headerMatch.index + headerMatch[0].length;
  let value;

  if (bibtex[start] === '{') {
    // Parser com chaves balanceadas (suporta {} aninhados, ex.: {Lamperti Tornaghi})
    let depth = 0;
    let i = start;
    for (; i < bibtex.length; i++) {
      if (bibtex[i] === '{') depth++;
      else if (bibtex[i] === '}') {
        depth--;
        if (depth === 0) { i++; break; }
      }
    }
    value = bibtex.slice(start + 1, i - 1);
  } else if (bibtex[start] === '"') {
    const end = bibtex.indexOf('"', start + 1);
    value = bibtex.slice(start + 1, end < 0 ? undefined : end);
  } else {
    // Valor sem chaves/aspas (ex.: números) até a vírgula
    const bare = bibtex.slice(start).match(/^[^,\n]+/);
    value = bare ? bare[0] : '';
  }

  const cleaned = value
    .replace(/[{}]/g, '') // Remove chaves extras
    .replace(/\s+/g, ' ')   // Normaliza espaços
    .trim();

  return cleaned || null;
}
function getPubMedField(record, field, multi = false) {
  // Captura a linha da tag + todas as linhas de continuação (6 espaços)
  const regex = new RegExp(
    `^${field}\\s{1,3}-\\s(.+?)(?=\\n[A-Z]{2,4}\\s*-|\\n\\s*$)`,
    //  ^^^^^^^^^^^^^^^^^^          aqui: \s* em vez de \s{1,3} ^^^
    "gms"
  );

  const matches = [];

  for (const match of record.matchAll(regex)) {
    const value = match[1]
      .replace(/\n\s{6}/g, " ") // Une linhas de continuação
      .replace(/\s+/g, " ")     // Normaliza espaços múltiplos
      .trim();

    matches.push(value);
  }

  if (matches.length === 0) return null;

  return multi ? matches : matches[0];
}

// Função melhorada para dividir entradas BibTeX
function splitBibtexEntries(bibtexContent) {
  const entries = [];
  const entryRegex = /@(\w+)\s*\{/g;

  let match;
  let lastIndex = 0;
  const matches = [];

  // Encontra todas as posições de @tipo{
  while ((match = entryRegex.exec(bibtexContent)) !== null) {
    matches.push(match.index);
  }

  // Divide o conteúdo nas posições encontradas
  for (let i = 0; i < matches.length; i++) {
    const start = matches[i];
    const end = matches[i + 1] || bibtexContent.length;
    const entry = bibtexContent.substring(start, end).trim();

    if (entry) {
      entries.push(entry);
    }
  }

  return entries;
}

function splitPubmedEntries(pubmedContent) {
  const entries = [];

  // Registros MEDLINE são separados por linha em branco e sempre iniciam com PMID-
  const entryRegex = /(?=^PMID-\s)/gm;
  const matches = [...pubmedContent.matchAll(entryRegex)];

  for (let i = 0; i < matches.length; i++) {
    const start = matches[i].index;
    const end = matches[i + 1]?.index ?? pubmedContent.length;
    const entry = pubmedContent.substring(start, end).trim();

    if (entry) {
      entries.push(entry);
    }
  }

  return entries;
}



const extractCountriesFromAffiliation = (affiliation) => {
  if (!affiliation) return [];

  const affiliationLines = affiliation.split(/\n|;/).filter(line => line.trim());

  const countryPatterns = countryPatternsData.map(item => ({
    regex: new RegExp(`\\b${item.name}\\b|${item.officialName}|${item.nativeName}`, "i"),
    country: item.name
  }));


  const countries = new Set();
  affiliationLines.forEach(line => {
    countryPatterns.forEach(({ regex, country }) => {
      if (regex.test(line)) {
        countries.add(country);
      }
    });
  });

  return Array.from(countries);
};

const splitKeywords = (value) => {
  if (!value) return [];
  // ScienceDirect usa vírgula; Scopus/WoS usam ponto e vírgula
  return value
    .split(/[;,]+/)
    .map(k => k.trim())
    .filter(k => k && !/type your keywords here/i.test(k));
};

const normalizeDoi = (doi) => {
  if (!doi) return null;
  // ScienceDirect exporta o DOI como URL completa (https://doi.org/...)
  return doi.replace(/^https?:\/\/(dx\.)?doi\.org\//i, '').trim() || null;
};

const importedBibtexArticles = (bibtexContent, source = 'Scopus', numString = 1, articles = []) => {
  // Dividir o conteúdo em entradas individuais
  const entries = splitBibtexEntries(bibtexContent);
  const idPrefix = source.toLowerCase().replace(/\s+/g, '_');
  const existingIds = new Set((articles || []).map(a => a.id).filter(Boolean));
  let nextNumber = (articles || []).reduce((max, a) => {
    const match = a.id && a.id.match(new RegExp(`^${idPrefix}_(\\d+)$`));
    return match ? Math.max(max, parseInt(match[1], 10)) : max;
  }, 0) + 1;

  const importedArticles = entries.map((fullEntry, index) => {
    const affiliations = getField(fullEntry, "affiliations") || getField(fullEntry, "Affiliation") || 'Afiliação não informada';
    const countries = affiliations !== 'Afiliação não informada'
      ? extractCountriesFromAffiliation(affiliations)
      : 'País não informado'
    let id;
    do {
      id = `${idPrefix}_${nextNumber}`;
      nextNumber += 1;
    } while (existingIds.has(id));
    existingIds.add(id);
    return {
      id,
      title: getField(fullEntry, "title") || getField(fullEntry, "Title") || `Título não encontrado ${index + 1}`,
      authors: getField(fullEntry, "author") || getField(fullEntry, "Author") || 'Autor não informado',
      affiliations: affiliations || 'Afiliação não informada',
      countries: countries || 'País não informado',
      journal: getField(fullEntry, "journal") || getField(fullEntry, "booktitle") || getField(fullEntry, "Journal") || getField(fullEntry, "Booktitle") || 'Revista não informada',
      year: parseInt(getField(fullEntry, "year")) || parseInt(getField(fullEntry, "Year")) || 'Ano não informado',
      score: null,
      abstract: getField(fullEntry, "abstract") || getField(fullEntry, "Abstract") || 'Resumo não disponível',
      keywords: splitKeywords(getField(fullEntry, "keywords")) || splitKeywords(getField(fullEntry, "Keywords")) || [],
      studyType: getField(fullEntry, "type") || getField(fullEntry, "Type") || 'Não especificado',
      doi: normalizeDoi(getField(fullEntry, "doi") || getField(fullEntry, "DOI")),
      language: getField(fullEntry, "language") || getField(fullEntry, "Language") || 'Não informado',
      source: source,
      numString: numString,
      isDuplicate: false,
      duplicateOf: null,
      dataProcessingStatus: 'pending',
      filter1Status: 'pending',
      filter2Status: 'pending',
      filter3Status: 'pending',
      inclusionCriterion: [],
      exclusionCriterion: [],
      qualityCriteria: [],
      extractionCriteria: [],
      aiSuggestions: {},
      decisionSource: {},
      fullText: null,
      searchString: null,
      importDate: new Date(),
      lastModified: new Date()
    };
  });

  return importedArticles.filter(article => !article.title.startsWith('Título não encontrado'));


};

const importedPubmedArticles = (pubmedContent, source = 'PubMed', numString = 1, articles = []) => {
  const entries = splitPubmedEntries(pubmedContent);
  const idPrefix = source.toLowerCase().replace(/\s+/g, '_');
  const existingIds = new Set((articles || []).map(a => a.id).filter(Boolean));
  let nextNumber = (articles || []).reduce((max, a) => {
    const match = a.id && a.id.match(new RegExp(`^${idPrefix}_(\\d+)$`));
    return match ? Math.max(max, parseInt(match[1], 10)) : max;
  }, 0) + 1;

  const importedArticles = entries.map((fullEntry, index) => {
    // Autores: FAU = nome completo, AU = abreviado
    const authorsArray = getPubMedField(fullEntry, "FAU", true) ||
      getPubMedField(fullEntry, "AU", true);
    const authors = authorsArray?.join("; ") || 'Autor não informado';

    // Afiliações: AD repete na mesma ordem que FAU
    const affiliationsArray = getPubMedField(fullEntry, "AD", true);
    const affiliations = affiliationsArray?.join(" | ") || 'Afiliação não informada';

    const countries = affiliations !== 'Afiliação não informada'
      ? extractCountriesFromAffiliation(affiliations)
      : 'País não informado';

    // Ano extraído do campo DP (ex: "2020 Jul")
    const dp = getPubMedField(fullEntry, "DP");
    const yearMatch = dp?.match(/\d{4}/);
    const year = yearMatch ? parseInt(yearMatch[0]) : 'Ano não informado';

    // DOI extraído do campo AID (ex: "10.1016/j.x [doi]")
    const aidFields = getPubMedField(fullEntry, "AID", true) || [];
    const doiEntry = aidFields.find(a => a.includes("[doi]"));
    const doi = doiEntry?.replace(/\s*\[doi\]/, "").trim() || null;

    // Keywords: OT = autor, MH = MeSH
    const keywordsArray = getPubMedField(fullEntry, "OT", true) ||
      getPubMedField(fullEntry, "MH", true) || [];

    // Tipo de publicação (ex: "Journal Article", "Review")
    const pubTypeArray = getPubMedField(fullEntry, "PT", true) || [];
    const studyType = pubTypeArray.join("; ") || 'Não especificado';

    let id;
    do {
      id = `${idPrefix}_${nextNumber}`;
      nextNumber += 1;
    } while (existingIds.has(id));
    existingIds.add(id);

    return {
      id,
      title: getPubMedField(fullEntry, "TI") || `Título não encontrado ${index + 1}`,
      authors,
      affiliations,
      countries,
      journal: getPubMedField(fullEntry, "JT") ||
        getPubMedField(fullEntry, "TA") || 'Revista não informada',
      year,
      score: null,
      abstract: getPubMedField(fullEntry, "AB") || 'Resumo não disponível',
      keywords: keywordsArray,
      studyType,
      doi,
      language: getPubMedField(fullEntry, "LA") || 'Não informado',
      pmid: getPubMedField(fullEntry, "PMID") || null,
      source,
      numString,
      isDuplicate: false,
      duplicateOf: null,
      dataProcessingStatus: 'pending',
      filter1Status: 'pending',
      filter2Status: 'pending',
      filter3Status: 'pending',
      inclusionCriterion: [],
      exclusionCriterion: [],
      qualityCriteria: [],
      extractionCriteria: [],
      aiSuggestions: {},
      decisionSource: {},
      fullText: null,
      searchString: null,
      importDate: new Date(),
      lastModified: new Date()
    };
  });

  return importedArticles.filter(article => !article.title.startsWith('Título não encontrado'));
};

const Overlay = ({ children, footer, onClose }) => {
  const [visible, setVisible] = useState(false);
  const [translateY, setTranslateY] = useState(0);
  const [isDragging, setIsDragging] = useState(false);

  const dragStartY = useRef(null);
  const dragActive = useRef(false);

  // ── Entrada ──────────────────────────────────────────────────────────────
  useEffect(() => {
    const t = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(t);
  }, []);

  // ── Fecha com animação de saída ──────────────────────────────────────────
  const closeWithAnimation = useCallback(() => {
    setVisible(false);
    setTranslateY(window.innerHeight);
    setTimeout(onClose, 300);
  }, [onClose]);

  // ── Drag-to-close — apenas no handle ─────���──────────────────────────────
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

  // ── Estilos da sheet ─────────────────────────────────────────────────────
  const sheetStyle = {
    maxHeight: '92dvh',
    transform: `translateY(${translateY}px)`,
    transition: isDragging
      ? 'none'
      : visible
        ? 'transform 0.35s cubic-bezier(0.32,0.72,0,1)'
        : 'transform 0.28s ease-in',
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4"
      onClick={() => closeWithAnimation()}
      style={{
        backgroundColor: 'rgba(0,0,0,0.5)',
        opacity: visible ? 1 : 0,
        transition: 'opacity 0.3s ease',
      }}
    >
      <div
        className="bg-white dark:bg-gray-800 rounded-t-2xl sm:rounded-xl w-full sm:max-w-3xl flex flex-col transition-colors duration-200"
        style={sheetStyle}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Handle — mobile only */}
        <div
          className="sm:hidden flex justify-center items-center py-4 -mx-0 px-4 select-none"
          style={{ cursor: isDragging ? 'grabbing' : 'grab', touchAction: 'none' }}
          onTouchStart={onHandleTouchStart}
          onTouchMove={onHandleTouchMove}
          onTouchEnd={onHandleTouchEnd}
        >
          <div
            className="rounded-full transition-all duration-150"
            style={{
              width: isDragging ? '52px' : '40px',
              height: '4px',
              backgroundColor: isDragging ? '#6366f1' : '#d1d5db',
            }}
          />
        </div>

        {children}
        {footer}
      </div>
    </div>
  );
};
// Modal para seleção de critérios
const MultiSelect = ({ isOpen, onClose, options, onSelect, type, criteria, initialSelected = [], initialValues = [] }) => {
  const { t } = useTranslation();
  const [isOpenDrop, setIsOpenDrop] = useState(false);
  const [selected, setSelected] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const dropdownRef = useRef(null);
  const inputRef = useRef(null);
  const [resultsExtraction, setResultsExtraction] = useState([]);
  const filteredOptions = options.filter(opt =>
    `${opt.id} - ${opt.label}`.toLowerCase().includes(searchTerm.toLowerCase()) &&
    !selected.find(s => s.id === opt.id)
  );

  const groupedOptions = filteredOptions.reduce((acc, opt) => {
    if (!acc[opt.category]) acc[opt.category] = [];
    acc[opt.category].push(opt);
    return acc;
  }, {});

  // Deve ficar ANTES do `if (!isOpen) return null` para o cleanup rodar ao fechar
  useEffect(() => {
    if (isOpen) {
      // document.body.style.overflowY = 'hidden';
      setSelected(initialSelected); // era setSelected([])
      setSearchTerm('');
      setIsOpenDrop(false);
    } else {
      // document.body.styleOverflowY = '';
    }
  }, [isOpen]);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setIsOpenDrop(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    const initialResults = criteria.map(criterion => {
      const saved = initialValues?.find(v => v.id === criterion.id);
      return {
        id: criterion.id,
        label: criterion.value,
        type: criterion.type,
        response: saved?.response ?? (criterion.type === 'text' ? '' : []),
      };
    });
    setResultsExtraction(initialResults);
  }, [initialValues]);

  const toggleOption = (option) => {
    setSelected(prev => {
      const exists = prev.find(s => s.id === option.id);
      return exists ? prev.filter(s => s.id !== option.id) : [...prev, option];
    });
  };

  const removeOption = (id) => setSelected(prev => prev.filter(s => s.id !== id));
  const selectAll = () => setSelected(options);
  const clearAll = () => setSelected([]);

  const handleCriteriaChange = useCallback((index, value, isCheckbox = false) => {
    if (isCheckbox) {
      setResultsExtraction(prev => prev.map((item, i) => {
        if (i !== index) return item;
        const cur = Array.isArray(item.response) ? item.response : [];
        const next = cur.includes(value) ? cur.filter(v => v !== value) : [...cur, value];
        return { ...item, response: next };
      }));
    } else {
      setResultsExtraction(prev =>
        prev.map((item, i) => i === index ? { ...item, response: value } : item)
      );
    }
  }, []);

  if (!isOpen) return null;

  // ── Critérios de inclusão/exclusão ───────────────────────────────────────
  if (type !== 'extraction') {
    return (
      <Overlay
        onClose={onClose}
        footer={
          <div className="flex-shrink-0 flex items-center justify-center gap-3 px-4 sm:px-6 py-4 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 rounded-b-2xl sm:rounded-b-xl">
            <button
              onClick={() => onSelect(selected, 'included')}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium touch-manipulation active:scale-95 transition-all duration-150 disabled:opacity-40 disabled:cursor-not-allowed text-green-700 dark:text-green-300 bg-green-100 dark:bg-green-900/40 hover:bg-green-200 dark:hover:bg-green-800/60"
            >
              <CheckCircle size={16} />
              {t('articles.includeTitle')}
            </button>
            <button
              onClick={() => onSelect(selected, 'excluded')}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium touch-manipulation active:scale-95 transition-all duration-150 disabled:opacity-40 disabled:cursor-not-allowed text-red-700 dark:text-red-300 bg-red-100 dark:bg-red-900/40 hover:bg-red-200 dark:hover:bg-red-800/60"
            >
              <XCircle size={16} />
              {t('articles.excludeTitle')}
            </button>
          </div>
        }
      >
        {/* Header */}
        <div className="flex-shrink-0 flex items-center justify-between px-4 sm:px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-base sm:text-xl font-semibold text-gray-900 dark:text-white mt-2 sm:mt-0">
            {t('multiSelect.selectCriteria')}
          </h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-full text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors touch-manipulation"
          >
            <XCircle size={22} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto overscroll-contain px-4 sm:px-6 py-4" ref={dropdownRef}>

          {/* Search Input */}
          <div
            className={`border-2 rounded-lg p-3 cursor-text transition mb-4 ${isOpenDrop
              ? 'border-blue-500 ring-2 ring-blue-200 dark:ring-blue-900'
              : 'border-gray-300 dark:border-gray-600 hover:border-gray-400'
              } bg-white dark:bg-gray-700`}
            onClick={() => { setIsOpenDrop(true); inputRef.current?.focus(); }}
          >
            {selected.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-3">
                {selected.map(item => (
                  <span
                    key={item.id}
                    className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-sm font-medium ${item.category === 'inclusion' ? 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300' :
                      item.category === 'exclusion' ? 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300' :
                        'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300'
                      }`}
                  >
                    {item.id} - {item.label}
                    <button
                      onClick={(e) => { e.stopPropagation(); removeOption(item.id); }}
                      className="hover:bg-black hover:bg-opacity-10 rounded-full p-0.5 transition-colors touch-manipulation"
                    >
                      <X size={13} />
                    </button>
                  </span>
                ))}
              </div>
            )}
            <div className="flex items-center gap-2">
              <input
                ref={inputRef}
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                onFocus={() => setIsOpenDrop(true)}
                placeholder={selected.length === 0 ? t('multiSelect.searchAdd') : t('multiSelect.searchMore')}
                className="flex-1 outline-none bg-transparent text-sm text-gray-900 dark:text-white placeholder-gray-400"
              />
              <ChevronDown size={18} className={`text-gray-400 transition-transform flex-shrink-0 ${isOpenDrop ? 'rotate-180' : ''}`} />
            </div>
          </div>

          {/* Quick Actions */}
          <div className="flex items-center gap-3 mb-4 text-sm">
            <button onClick={selectAll} className="text-gray-600 dark:text-white font-medium bg-transparent border-none p-0 cursor-pointer">
              {t('multiSelect.selectAll')}
            </button>
            <span className="text-gray-300 dark:text-gray-600">|</span>
            <button onClick={clearAll} className="text-gray-600 dark:text-white font-medium bg-transparent border-none p-0 cursor-pointer">
              {t('multiSelect.clear')}
            </button>
            <span className="ml-auto text-gray-500 dark:text-gray-400 font-medium">
              {t('multiSelect.selectedCount', { count: selected.length })}
            </span>
          </div>

          {/* Dropdown Options */}
          {isOpenDrop && (
            <div className="rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden mb-4">
              {Object.keys(groupedOptions).length === 0 ? (
                <div className="p-6 text-center text-gray-500 dark:text-gray-400">
                  <p className="text-sm">{t('multiSelect.noOptions')}</p>
                </div>
              ) : (
                Object.entries(groupedOptions).map(([category, items], idx) => (
                  <div key={category}>
                    {idx > 0 && <div className="border-t border-gray-200 dark:border-gray-700" />}
                    <div className="px-4 py-2.5 bg-gray-50 dark:bg-gray-900 font-semibold text-sm text-gray-700 dark:text-gray-300">
                      {category === 'inclusion' ? t('articles.inclusionCriteriaMenu') :
                        category === 'exclusion' ? t('articles.exclusionCriteriaMenu') : t('protocol.qualityCriteria')}
                    </div>
                    {items.map((option, optIdx) => {
                      const isSelected = selected.find(s => s.id === option.id);
                      return (
                        <div key={option.id}>
                          {optIdx > 0 && <div className="border-t border-gray-100 dark:border-gray-800" />}
                          <div
                            onClick={() => toggleOption(option)}
                            className={`px-4 py-3 cursor-pointer flex items-center justify-between transition-colors touch-manipulation ${isSelected
                              ? 'bg-blue-50 dark:bg-blue-900/20'
                              : 'bg-white dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700'
                              }`}
                          >
                            <span className="text-sm font-medium text-gray-900 dark:text-white">{option.id} - {option.label}</span>
                            {isSelected && <Check size={16} className="text-blue-600 dark:text-blue-400 flex-shrink-0" />}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ))
              )}
            </div>
          )}

          {/* Selected Summary */}
          {selected.length > 0 && (
            <div className="p-4 rounded-lg bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700">
              <h3 className="font-semibold text-sm text-gray-900 dark:text-white mb-3">
                {t('multiSelect.summary')}
              </h3>
              <div className="space-y-2">
                {selected.map(item => (
                  <div key={item.id} className="flex items-start gap-2 text-sm text-gray-700 dark:text-gray-300">
                    <div className={`mt-1 w-2 h-2 rounded-full flex-shrink-0 ${item.category === 'inclusion' ? 'bg-green-500' :
                      item.category === 'exclusion' ? 'bg-red-500' : 'bg-blue-500'
                      }`} />
                    <span className="font-medium flex-shrink-0">{item.id}</span>
                    <span className="flex-shrink-0">-</span>
                    <span className="flex-1 break-words">{item.label}</span>
                    <span className="text-xs text-gray-500 dark:text-gray-400 flex-shrink-0">
                      ({item.category === 'inclusion' ? t('multiSelect.categoryInclusion') :
                        item.category === 'exclusion' ? t('multiSelect.categoryExclusion') : t('multiSelect.categoryQuality')})
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </Overlay>
    );
  }

  // ── Extração ─────────────────────────────────────────────────────────────
  return (
    <Overlay
      footer={
        <div className="flex-shrink-0 flex items-center justify-end gap-3 px-4 sm:px-6 py-4 border-t border-gray-200 dark:border-gray-700 flex-shrink-0">
          <button
            onClick={onClose}
            className="flex-1 sm:flex-none px-5 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-lg transition-colors text-sm"
          >
            {t('searchString.cancel')}
          </button>
          <button
            onClick={() => onSelect(resultsExtraction, 'extracted')}
            className="flex-1 sm:flex-none px-5 py-2 bg-orange-500 hover:bg-orange-600 text-white rounded-lg transition-colors text-sm"
          >
            {t('multiSelect.confirm')}
          </button>
        </div>
      }
    >
      {/* Header */}
      <div className="flex-shrink-0 flex items-center justify-between px-4 sm:px-6 py-4 border-b border-gray-200 dark:border-gray-700">
        <div className="absolute left-1/2 -translate-x-1/2 top-2 w-10 h-1 bg-gray-300 dark:bg-gray-600 rounded-full sm:hidden" />
        <h3 className="text-base sm:text-xl font-semibold text-gray-900 dark:text-white mt-2 sm:mt-0">
          {t('protocol.extractionCriteria')}
        </h3>
        <button
          onClick={onClose}
          className="p-1.5 rounded-full text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors touch-manipulation"
        >
          <XCircle size={22} />
        </button>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto overscroll-contain px-4 sm:px-6 py-4">
        <div className="space-y-4">
          {criteria.map((criterion, index) =>
            criterion.value !== '' && (
              <div
                key={index}
                className="p-4 border border-gray-200 dark:border-gray-700 rounded-lg"
              >
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
                  {criterion.id} - {criterion.value}
                </label>

                {criterion.type === 'text' && (
                  <textarea
                    rows={3}
                    onChange={(e) => handleCriteriaChange(index, e.target.value)}
                    value={resultsExtraction[index]?.response || ''}
                    placeholder={t('multiSelect.answerPlaceholder')}
                    className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg
                               focus:ring-2 focus:ring-orange-500 focus:border-transparent
                               bg-white dark:bg-gray-700 text-gray-900 dark:text-white
                               transition-colors duration-200 resize-none"
                  />
                )}

                {criterion.type === 'Pick on List' && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                    {criterion.items?.map((item, itemIndex) => (
                      <label
                        key={itemIndex}
                        className="flex items-center gap-2 p-2.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer transition-colors touch-manipulation"
                      >
                        <input
                          type="radio"
                          name={`criterion-${index}`}
                          onChange={() => handleCriteriaChange(index, item)}
                          checked={resultsExtraction[index]?.response === item}
                          value={item}
                          className="w-4 h-4 text-orange-500 border-gray-300 dark:border-gray-600 flex-shrink-0"
                        />
                        <span className="text-sm text-gray-700 dark:text-gray-300">{item}</span>
                      </label>
                    ))}
                  </div>
                )}

                {criterion.type === 'Pick on Many' && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                    {criterion.items?.map((item, itemIndex) => {
                      const isChecked = Array.isArray(resultsExtraction[index]?.response)
                        && resultsExtraction[index].response.includes(item);
                      return (
                        <label
                          key={itemIndex}
                          className="flex items-center gap-2 p-2.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer transition-colors touch-manipulation"
                        >
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={(e) => { e.stopPropagation(); handleCriteriaChange(index, item, true); }}
                            className="w-4 h-4 text-orange-500 border-gray-300 dark:border-gray-600 rounded flex-shrink-0"
                          />
                          <span className="text-sm text-gray-700 dark:text-gray-300">{item}</span>
                        </label>
                      );
                    })}
                  </div>
                )}
              </div>
            )
          )}
        </div>
      </div>
    </Overlay>
  );
};


// Componente para definição do protocolo
const ProtocolSection = ({ protocol, onUpdateProtocol }) => {
  const { t } = useTranslation();
  const [selectedExCriteria, setSelectedExCriteria] = useState(null);
  const [selectedInExCriteria, setSelectedInExCriteria] = useState(null);

  const x = useCallback((field, value) => {


  }, [onUpdateProtocol]);

  const handleProtocolChange = useCallback((field, value) => {
    onUpdateProtocol(prev => ({
      ...prev,
      [field]: value
    }));
  }, [onUpdateProtocol]);

  const handleCriteriaChange = useCallback((type, index, value, atr, subIndex) => {
    if (type === 'extractionCriteria') {
      if (atr === 'items') {
        onUpdateProtocol(prev => ({
          ...prev,
          [type]: prev[type].map((item, i) =>
            i === index
              ? {
                ...item,
                [atr]: item[atr].map((subItem, j) =>
                  j === subIndex ? value : subItem
                )
              }
              : item
          )
        }));
      } else {
        onUpdateProtocol(prev => ({
          ...prev,
          [type]: prev[type].map((item, i) => i === index ?
            { ...item, [atr]: value }
            : item
          )
        }));
      }
    } else if (type === 'inclusionCriteria' || type === 'exclusionCriteria' || type === 'qualityCriteria') {
      onUpdateProtocol(prev => ({
        ...prev,
        [type]: prev[type].map((item, i) => i === index ?
          { ...item, [atr]: value }
          : item
        )
      }));
    }
    else {
      onUpdateProtocol(prev => ({
        ...prev,
        [type]: prev[type].map((item, i) => i === index ? value : item)
      }));
    }

  }, [onUpdateProtocol]);
  const addCriteria = useCallback((type, atr, index, length) => {
    if (type === 'extractionCriteria') {
      if (atr === 'items') {
        onUpdateProtocol(prev => ({
          ...prev,
          [type]: prev[type].map((item, i) =>
            i === index
              ? {
                ...item,
                items: [...item.items, '']  // Adiciona '' no final do array items
              }
              : item
          )
        }));
      } else {
        onUpdateProtocol(prev => ({
          ...prev,
          [type]: [...prev[type], { id: `EX${length + 1}`, value: '', type: 'text', items: [''] }]
        }))
      }
    } else if (type === 'inclusionCriteria' || type === 'exclusionCriteria' || type === 'qualityCriteria') {
      let ind
      ind = type === 'inclusionCriteria' ? 'I' : type === 'exclusionCriteria' ? 'E' : 'Q'
      onUpdateProtocol(prev => ({
        ...prev,
        [type]: [...prev[type], { id: `${ind}${length + 1}`, value: '' }]
      }))
    } else {
      onUpdateProtocol(prev => ({
        ...prev,
        [type]: [...prev[type], '']
      }))
    }
  }, [onUpdateProtocol]);

  const removeCriteria = useCallback(({ type, index, atr, subIndex, length }) => {
    if (type === 'extractionCriteria') {
      if (atr === 'items') {
        onUpdateProtocol(prev => ({
          ...prev,
          [type]: prev[type].map((item, i) =>
            i === index
              ? {
                ...item,
                items: item.items.filter((_, j) => j !== subIndex)  // Remove o item no subIndex
              }
              : item
          )
        }));
      } else {
        onUpdateProtocol(prev => ({
          ...prev,
          [type]: prev[type].filter((_, i) => i !== index)
        }));
      }
    } else {
      onUpdateProtocol(prev => ({
        ...prev,
        [type]: prev[type].filter((_, i) => i !== index)
      }));
    }


  }, [onUpdateProtocol]);


  const handleSeExCriteria = useCallback((criteria, index) => {
    setSelectedExCriteria(criteria)
    setSelectedInExCriteria(index)
  })

  useEffect(() => {
    setSelectedExCriteria
  }, [protocol]);

  useEffect(() => {
    setSelectedExCriteria(protocol['extractionCriteria'][selectedInExCriteria]);
  }, [protocol]);
  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6 mb-6 transition-colors duration-200">
      <h2 className="text-lg sm:text-2xl font-bold text-gray-800 dark:text-white mb-6 flex items-center gap-2">
        <Settings className="h-6 w-6 text-indigo-600 dark:text-indigo-400" />
        {t('protocol.sectionTitle')}
      </h2>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Informações básicas */}
        <div className="space-y-6" data-tour="protocol-basic">
          <div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm sm:text-lg font-medium text-gray-700 dark:text-gray-300 mb-2">
                  {t('protocol.title')}
                </label>
                <input
                  type="text"
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-indigo-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white transition-colors duration-200 text-sm "
                  value={protocol.title}
                  onChange={(e) => handleProtocolChange('title', e.target.value)}
                  placeholder={t('protocol.titlePlaceholder')}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  {t('protocol.researchQuestion')}
                </label>
                <textarea
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-indigo-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white transition-colors duration-200 text-sm"
                  rows={3}
                  value={protocol.researchQuestion}
                  onChange={(e) => handleProtocolChange('researchQuestion', e.target.value)}
                  placeholder={t('protocol.researchQuestionPlaceholder')}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  {t('protocol.publicationPeriod')}
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <input
                    type="number"
                    min="1900"
                    max={new Date().getFullYear()}
                    className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white transition-colors duration-200 text-sm"
                    value={protocol.yearRange.start}
                    onChange={(e) => handleProtocolChange('yearRange', {
                      ...protocol.yearRange,
                      start: parseInt(e.target.value)
                    })}
                  />
                  <input
                    type="number"
                    min="1900"
                    max={new Date().getFullYear()}
                    className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white transition-colors duration-200 text-sm"
                    value={protocol.yearRange.end}
                    onChange={(e) => handleProtocolChange('yearRange', {
                      ...protocol.yearRange,
                      end: parseInt(e.target.value)
                    })}
                  />
                </div>
              </div>

              <div>
                <h3 className="text-sm sm:text-lg font-semibold text-gray-700 dark:text-gray-300 mb-4">
                  {t('protocol.languages')}
                </h3>
                <div className="space-y-2">
                  {['English', 'Portuguese', 'Spanish', 'French', 'German', 'Italian'].map(lang => (
                    <label key={lang} className="flex items-center space-x-3 p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors duration-200">
                      <div className="relative">
                        <input
                          type="checkbox"
                          checked={protocol.languages.includes(lang)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              handleProtocolChange('languages', [...protocol.languages, lang]);
                            } else {
                              handleProtocolChange('languages', protocol.languages.filter(l => l !== lang));
                            }
                          }}
                          className="peer sr-only"
                        />
                        <div className="relative w-5 h-5 border-2 border-gray-300 dark:border-gray-600 rounded peer-checked:bg-indigo-500 peer-checked:border-indigo-500 transition-all duration-200">
                        </div>
                        <Check className="absolute inset-0 m-auto w-3 h-3 text-white hidden peer-checked:block" />
                      </div>
                      <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{lang}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div data-tour="protocol-databases">
                <h3 className="text-sm sm:text-lg font-semibold text-gray-700 dark:text-gray-300 mb-4">
                  {t('protocol.databases')}
                </h3>
                <div className="space-y-2">
                  {['Scopus', 'Web of Science', 'PubMed', 'ScienceDirect'].map(db => (
                    <label key={db} className="flex items-center space-x-3 p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors duration-200">
                      <div className="relative">
                        <input
                          type="checkbox"
                          checked={protocol.databases.includes(db)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              handleProtocolChange('databases', [...protocol.databases, db]);
                            } else {
                              handleProtocolChange('databases', protocol.databases.filter(d => d !== db));
                            }
                          }}
                          className="peer sr-only"
                        />
                        <div className="relative w-5 h-5 border-2 border-gray-300 dark:border-gray-600 rounded peer-checked:bg-indigo-500 peer-checked:border-indigo-500 transition-all duration-200">
                        </div>
                        <Check className="absolute inset-0 m-auto w-3 h-3 text-white hidden peer-checked:block" />
                      </div>
                      <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{db}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Critérios */}
        <div className="space-y-3">
          <div className="space-y-3" data-tour="protocol-criteria">
          <div>
            <h3 className="text-sm sm:text-lg font-semibold text-gray-700 dark:text-gray-300 mb-2">{t('protocol.inclusionCriteria')}</h3>
            <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
              <div className="overflow-hidden h-full">
                <table className="table-fixed min-w-full h-full divide-y divide-gray-200 dark:divide-gray-700">
                  <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                    {protocol.inclusionCriteria.map((criteria, index) => (
                      <tr key={index} className="transition-colors duration-200 h-full">
                        <td className="w-16">
                          <span className="px-4 py-2 text-gray-500 font-bold dark:text-gray-400 text-sm">{`I${index + 1}`}</span>

                        </td>
                        <td className="p-0 h-px w-full max-w-0">
                          <textarea
                            className="w-full h-full px-3 py-2 border border-gray-300 dark:border-gray-600 focus:ring-2 focus:ring-green-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white transition-colors duration-200 resize-none text-sm break-all"
                            value={criteria.value}
                            onChange={(e) => handleCriteriaChange('inclusionCriteria', index, e.target.value, 'value')}
                            placeholder={t('protocol.inclusionPlaceholder')}
                          />
                        </td>
                        <td className="px-4 py-2 text-right whitespace-nowrap">
                          <button
                            disabled={protocol.inclusionCriteria.length === 1}
                            onClick={() => removeCriteria({ type: 'inclusionCriteria', index: index })}
                            className="text-red-600 dark:text-red-400 hover:text-red-800 dark:hover:text-red-300 p-1 rounded-full hover:bg-red-50 dark:hover:bg-red-900/50 transition-colors duration-200 disabled:cursor-not-allowed disabled:text-gray-500 disabled:hover:bg-transparent disabled:hover:text-gray-500"
                          >
                            <XCircle size={16} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className=" bg-gray-50 dark:bg-gray-900/50  rounded-bl-lg rounded-br-lg " >
                <button
                  onClick={() => addCriteria('inclusionCriteria', '', '', protocol.inclusionCriteria.length)}
                  className="w-full px-3 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 text-green-600 dark:text-green-400 hover:text-green-800 dark:hover:text-green-300 text-sm font-medium rounded-bl-lg rounded-br-lg rounded-tl-none rounded-tr-none transition-colors duration-200 flex items-center justify-center gap-2"
                >
                  <PlusCircle size={16} />
                  {t('protocol.addInclusion')}
                </button>
              </div>
            </div>
          </div>
          <div>
            <h3 className="text-sm sm:text-lg font-semibold text-gray-700 dark:text-gray-300 mb-2">{t('protocol.exclusionCriteria')}</h3>
            <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
              <div className="overflow-hidden h-full">
                <table className="table-fixed min-w-full h-full divide-y divide-gray-200 dark:divide-gray-700">

                  <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                    {protocol.exclusionCriteria.map((criteria, index) => (
                      <tr key={index} className="transition-colors duration-200 h-full">
                        <td className="w-16">
                          <span className="px-4 py-2 text-gray-500 font-bold dark:text-gray-400">{`E${index + 1}`}</span>

                        </td>
                        <td className="p-0 h-px w-full max-w-0">
                          <textarea
                            className="w-full h-full px-3 py-2 border border-gray-300 dark:border-gray-600 focus:ring-2 focus:ring-red-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white transition-colors duration-200 resize-none text-sm break-all"
                            value={criteria.value}
                            onChange={(e) => handleCriteriaChange('exclusionCriteria', index, e.target.value, 'value')}
                            placeholder={t('protocol.exclusionPlaceholder')}
                          />
                        </td>
                        <td className="px-4 py-2 text-right whitespace-nowrap">
                          <button
                            disabled={protocol.exclusionCriteria.length === 1}
                            onClick={() => removeCriteria({ type: 'exclusionCriteria', index: index })}
                            className="text-red-600 dark:text-red-400 hover:text-red-800 dark:hover:text-red-300 p-1 rounded-full hover:bg-red-50 dark:hover:bg-red-900/50 transition-colors duration-200 disabled:cursor-not-allowed disabled:text-gray-500 disabled:hover:bg-transparent disabled:hover:text-gray-500"
                          >
                            <XCircle size={16} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className=" bg-gray-50 dark:bg-gray-900/50  rounded-bl-lg rounded-br-lg " >
                <button
                  onClick={() => addCriteria('exclusionCriteria', '', '', protocol.exclusionCriteria.length)}
                  className="w-full px-3 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 text-red-600 dark:text-red-400 hover:text-red-800 dark:hover:text-red-300 text-sm font-medium rounded-bl-lg rounded-br-lg rounded-tl-none rounded-tr-none transition-colors duration-200 flex items-center justify-center gap-2"
                >
                  <PlusCircle size={16} />
                  {t('protocol.addExclusion')}
                </button>
              </div>
            </div>
          </div>
          </div>
          <div>
            <h3 className="text-sm sm:text-lg font-semibold text-gray-700 dark:text-gray-300 mb-2">{t('protocol.qualityCriteria')}</h3>
            <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
              <div className="overflow-hidden h-full">
                <table className="table-fixed min-w-full h-full divide-y divide-gray-200 dark:divide-gray-700">

                  <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                    {protocol.qualityCriteria.map((criteria, index) => (
                      <tr key={index} className="transition-colors duration-200 h-full">
                        <td className="w-16">
                          <span className="px-4 py-2 text-gray-500 font-bold dark:text-gray-400 text-sm">{`Q${index + 1}`}</span>
                        </td>
                        <td className="p-0 h-px w-full max-w-0">
                          <textarea
                            className="w-full h-full px-3 py-2 border border-gray-300 dark:border-gray-600 focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white transition-colors duration-200 resize-none text-sm break-all"
                            value={criteria.value}
                            onChange={(e) => handleCriteriaChange('qualityCriteria', index, e.target.value, 'value')}
                            placeholder={t('protocol.qualityPlaceholder')}
                          />
                        </td>
                        <td className="px-4 py-2 text-right whitespace-nowrap">
                          <button
                            disabled={protocol.qualityCriteria.length === 1}
                            onClick={() => removeCriteria({ type: 'qualityCriteria', index: index })}
                            className="text-red-600 dark:text-red-400 hover:text-red-800 dark:hover:text-red-300 p-1 rounded-full hover:bg-red-50 dark:hover:bg-red-900/50 transition-colors duration-200 disabled:cursor-not-allowed disabled:text-gray-500 disabled:hover:bg-transparent disabled:hover:text-gray-500"
                          >
                            <XCircle size={16} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className=" bg-gray-50 dark:bg-gray-900/50  rounded-bl-lg rounded-br-lg " >
                <button
                  onClick={() => addCriteria('qualityCriteria', '', '', protocol.qualityCriteria.length)}
                  className="w-full px-3 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 text-sm font-medium rounded-bl-lg rounded-br-lg rounded-tl-none rounded-tr-none transition-colors duration-200 flex items-center justify-center gap-2"
                >
                  <PlusCircle size={16} />
                  {t('protocol.addQuality')}
                </button>
              </div>
            </div>
          </div>
          <div>
            <h3 className="text-sm sm:text-lg font-semibold text-gray-700 dark:text-gray-300 mb-2">
              {t('protocol.extractionCriteria')}
            </h3>

            <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">

              {/* ── MOBILE: card list (hidden on sm+) ── */}
              <div className="divide-y divide-gray-200 dark:divide-gray-700 sm:hidden overflow-y-auto">
                {protocol.extractionCriteria.map((criteria, index) => (
                  <div key={index} className="p-3 flex flex-col gap-2">

                    {/* header row: label + action buttons */}
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-bold text-gray-500 dark:text-gray-400">
                        {`EX${index + 1}`}
                      </span>
                      <div className="flex items-center gap-1">
                        <button
                          disabled={
                            (criteria.type !== 'Pick on List' && criteria.type !== 'Pick on Many') ||
                            criteria.value === ''
                          }
                          onClick={() => handleSeExCriteria(criteria, index)}
                          className="p-1.5 rounded-full text-gray-600 dark:text-white hover:bg-gray-100 dark:hover:bg-gray-700 disabled:cursor-not-allowed disabled:text-gray-400 transition-colors"
                        >
                          <List size={15} />
                        </button>
                        <button
                          disabled={protocol.extractionCriteria.length === 1}
                          onClick={() => removeCriteria({ type: 'extractionCriteria', index })}
                          className="p-1.5 rounded-full text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/50 disabled:cursor-not-allowed disabled:text-gray-400 disabled:hover:bg-transparent transition-colors"
                        >
                          <XCircle size={15} />
                        </button>
                      </div>
                    </div>

                    {/* type select */}
                    <select
                      value={criteria.type || 'Text'}
                      onChange={(e) =>
                        handleCriteriaChange('extractionCriteria', index, e.target.value, 'type')
                      }
                      className="w-full text-sm px-3 py-2 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-orange-500 transition-colors"
                    >
                      <option value="Text">{t('protocol.textType')}</option>
                      <option value="Pick on List">{t('protocol.singleChoice')}</option>
                      <option value="Pick on Many">{t('protocol.multipleChoice')}</option>
                    </select>

                    {/* text input */}
                    <input
                      type="text"
                      value={criteria.value}
                      onChange={(e) =>
                        handleCriteriaChange('extractionCriteria', index, e.target.value, 'value')
                      }
                      placeholder={t('protocol.extractionPlaceholder')}
                      className="w-full text-sm px-3 py-2 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-orange-500 transition-colors"
                    />
                  </div>
                ))}
              </div>

              {/* ── DESKTOP: original table (hidden below sm) ── */}
              <div className="hidden sm:block ">
                <table className="table-fixed min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                  <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                    {protocol.extractionCriteria.map((criteria, index) => (
                      <tr key={index} className="transition-colors duration-200">
                        <td className="w-16">
                          <span className="px-4 py-2 text-gray-500 font-bold dark:text-gray-400 text-sm">
                            {`EX${index + 1}`}
                          </span>
                        </td>
                        <td className="w-40 p-0 h-px">
                          <select
                            value={criteria.type || 'Text'}
                            onChange={(e) =>
                              handleCriteriaChange('extractionCriteria', index, e.target.value, 'type')
                            }
                            className="h-full h-full px-3 py-2 border border-gray-300 dark:border-gray-600 focus:ring-2 focus:ring-orange-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white transition-colors duration-200 text-sm"
                          >
                            <option value="Text">{t('protocol.textType')}</option>
                            <option value="Pick on List">{t('protocol.singleChoice')}</option>
                            <option value="Pick on Many">{t('protocol.multipleChoice')}</option>
                          </select>
                        </td>
                        <td className="p-0 h-px w-full max-w-0">
                          <textarea
                            className="w-full h-full px-3 py-2 border border-gray-300 dark:border-gray-600 focus:ring-2 focus:ring-orange-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white transition-colors duration-200 resize-none text-sm break-all"
                            value={criteria.value}
                            onChange={(e) =>
                              handleCriteriaChange('extractionCriteria', index, e.target.value, 'value')
                            }
                            placeholder={t('protocol.extractionPlaceholder')}
                          />
                        </td>

                        {!(criteria.type !== 'Pick on List' && criteria.type !== 'Pick on Many' || criteria.value === '') && (
                          <td className="px-4 py-2 text-right whitespace-nowrap">


                            <button
                              disabled={
                                (criteria.type !== 'Pick on List' && criteria.type !== 'Pick on Many') ||
                                criteria.value === ''
                              }
                              onClick={() => handleSeExCriteria(criteria, index)}
                              className="text-black-600 dark:text-white-400 hover:text-white-800 dark:hover:text-white-300 p-1 rounded-full hover:bg-white-50 dark:hover:bg-white-900/50 transition-colors duration-200 disabled:cursor-not-allowed disabled:text-gray-500"
                            >


                              <List size={16} />
                            </button>

                          </td>
                        )}
                        <td className="px-4 py-2 text-right">
                          <button
                            disabled={protocol.extractionCriteria.length === 1}
                            onClick={() => removeCriteria({ type: 'extractionCriteria', index })}
                            className="text-red-600 dark:text-red-400 hover:text-red-800 dark:hover:text-red-300 p-1 rounded-full hover:bg-red-50 dark:hover:bg-red-900/50 transition-colors duration-200 disabled:cursor-not-allowed disabled:text-gray-500 disabled:hover:bg-transparent disabled:hover:text-gray-500"
                          >
                            <XCircle size={16} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* ── Add button (shared) ── */}
              <button
                onClick={() =>
                  addCriteria('extractionCriteria', '', '', protocol.extractionCriteria.length)
                }
                className="w-full px-3 py-2 bg-white dark:bg-gray-800 border-t border-gray-300 dark:border-gray-600 text-orange-600 dark:text-orange-400 hover:text-orange-800 dark:hover:text-orange-300 text-sm font-medium rounded-bl-lg rounded-br-lg transition-colors duration-200 flex items-center justify-center gap-2"
              >
                <PlusCircle size={16} />
                {t('protocol.addExtraction')}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Modal de detalhes */}
      {selectedExCriteria && (
        // document.body.overflowX = ''
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg max-w-4xl w-full max-h-[90vh] overflow-y-auto transition-colors duration-200">
            <div className="p-6 border-b border-gray-200 dark:border-gray-700">
              <div className="flex justify-between items-start">
                <h3 className="text-sm sm:text-lg font-semibold text-gray-900 dark:text-white">{selectedExCriteria.value}</h3>
                <button
                  onClick={() => handleSeExCriteria(null, null)}
                  className="text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 transition-colors duration-200"
                >
                  <XCircle size={24} />
                </button>
              </div>
            </div>
            <div className="p-6">
              <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
                <div className="overflow-hidden">
                  <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">

                    <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                      {selectedExCriteria.items.map((criteria, index) => (
                        <tr key={index} className="transition-colors duration-200">

                          <td className="w-full p-0 h-px">
                            <input
                              type="text"
                              className={index === 0 ? "w-full h-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-tl-lg focus:ring-2 focus:ring-orange-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white transition-colors duration-200 text-sm" : "w-full px-3 py-2 border border-gray-300 dark:border-gray-600 focus:ring-2 focus:ring-orange-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white transition-colors duration-200 text-sm"}
                              value={criteria}
                              onChange={(e) => handleCriteriaChange('extractionCriteria', selectedInExCriteria, e.target.value, 'items', index)}
                              placeholder={t('protocol.qualityPlaceholder')}
                            />
                          </td>
                          <td className="px-4 py-2 text-right">
                            <button
                              // (type, index, typeEx, subIndex)
                              disabled={selectedExCriteria.items.length === 1}
                              onClick={() => removeCriteria({ type: 'extractionCriteria', index: selectedInExCriteria, atr: 'items', subIndex: index })}
                              className="text-red-600 dark:text-red-400 hover:text-red-800 dark:hover:text-red-300 p-1 rounded-full hover:bg-red-50 dark:hover:bg-red-900/50 transition-colors duration-200 disabled:cursor-not-allowed disabled:text-gray-500 disabled:hover:bg-transparent disabled:hover:text-gray-500"
                            >
                              <XCircle size={16} />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className=" bg-gray-50 dark:bg-gray-900/50  rounded-bl-lg rounded-br-lg " >
                  <button
                    onClick={() => addCriteria('extractionCriteria', 'items', selectedInExCriteria)}
                    className="w-full px-3 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 text-orange-600 dark:text-orange-400 hover:text-orange-800 dark:hover:text-orange-300 text-sm font-medium rounded-bl-lg rounded-br-lg rounded-tl-none rounded-tr-none transition-colors duration-200 flex items-center justify-center gap-2"
                  >
                    <PlusCircle size={16} />
                    {t('protocol.addAnswer')}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Sistema de Pontuação */}



      {/* Coluna direita — Scoring */}
      <div className="mt-8" data-tour="protocol-scoring">
        <ScoringSystemConfig
          scoringSystem={protocol.scoringSystem}
          onUpdate={onUpdateProtocol}
          protocol={protocol}
          addCriteria={addCriteria}
          removeCriteria={removeCriteria}
          handleCriteriaChange={handleCriteriaChange}
        />
      </div>
    </div>
  );
};

// Modal para string de busca
const SearchStringModal = ({ isOpen, onClose, onConfirm, database }) => {
  const { t } = useTranslation();
  const [searchString, setSearchString] = useState('');

  if (!isOpen) return null;

  const handleConfirm = () => {
    if (searchString.trim()) {
      onConfirm(searchString.trim());
      setSearchString('');
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white dark:bg-gray-800 rounded-lg max-w-md w-full transition-colors duration-200">
        <div className="p-6 border-b border-gray-200 dark:border-gray-700">
          <h3 className="text-sm sm:text-lg font-semibold text-gray-900 dark:text-white">
            {t('searchString.title', { database })}
          </h3>
        </div>
        <div className="p-6">
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              {t('searchString.input')}
            </label>
            <textarea
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-indigo-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white transition-colors duration-200"
              rows={4}
              value={searchString}
              onChange={(e) => setSearchString(e.target.value)}
              placeholder={t('searchString.placeholder')}
            />
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              {t('searchString.required')}
            </p>
          </div>
          <div className="flex gap-3 justify-end">
            <button
              onClick={onClose}
              className="px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-lg transition-colors duration-200"
            >
              {t('searchString.cancel')}
            </button>
            <button
              onClick={handleConfirm}
              disabled={!searchString.trim()}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-white rounded-lg transition-colors duration-200"
            >
              {t('searchString.confirm')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// Componente de configuração do sistema de pontuação
const ScoringSystemConfig = ({ scoringSystem, onUpdate, protocol, addCriteria, removeCriteria, handleCriteriaChange }) => {
  const { t } = useTranslation();
  const handleWeightChange = (field, value) => {
    const numValue = Math.max(0, Math.min(10, parseInt(value) || 0));
    onUpdate(prev => ({
      ...prev,
      scoringSystem: {
        ...prev.scoringSystem,
        weights: {
          ...prev.scoringSystem.weights,
          [field]: numValue
        }
      }
    }));
  };

  const handleConfigChange = (field, value) => {
    onUpdate(prev => ({
      ...prev,
      scoringSystem: {
        ...prev.scoringSystem,
        [field]: value
      }
    }));
  };

  return (
    <div className="bg-gray-50 dark:bg-gray-800 border border-blue-200 dark:border-blue-800 rounded-lg overflow-hidden transition-colors duration-200">
      <div className="bg-blue-50 dark:bg-blue-900/30 p-4 border-b border-blue-200 dark:border-blue-800">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5 text-blue-600 dark:text-blue-400" />
            <h4 className="text-sm sm:text-lg font-semibold text-blue-800 dark:text-blue-300">
              {t('scoring.title')}
            </h4>
          </div>
          {/* <div className="relative inline-flex items-center">
            <input
              type="checkbox"
              checked={scoringSystem.enabled}
              onChange={(e) => handleConfigChange('enabled', e.target.checked)}
              className="peer sr-only"
              id="scoring-toggle"
            />
            <label
              htmlFor="scoring-toggle"
              className="relative w-11 h-6 bg-gray-300 peer-checked:bg-blue-500 rounded-full cursor-pointer transition-colors duration-200"
            >
              <span className="absolute left-1 top-1 w-4 h-4 bg-white rounded-full transition-transform duration-200 transform peer-checked:translate-x-5"></span>
            </label>
            <span className="ml-2 text-sm font-medium text-blue-700 dark:text-blue-400">
              {scoringSystem.enabled ? 'Ativado' : 'Desativado'}
            </span>
          </div> */}
        </div>
        <p className="text-xs text-blue-600 dark:text-blue-400 mt-2">
          {t('scoring.description')}
        </p>
      </div>


      <div className="p-4 space-y-6">
        {/* Duas colunas internas */}
        <div className="grid grid-cols-1 sm:grid-cols-2 divide-y sm:divide-y-0 sm:divide-x divide-indigo-100 dark:divide-indigo-800">

          {/* Coluna esquerda — Keywords */}
          <div className="p-4">
            <div>
              <h3 className="font-medium text-blue-700 dark:text-blue-300 mb-4">{t('scoring.keywords')}</h3>
              <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
                <div className="overflow-hidden">
                  <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">

                    <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                      {protocol.keywords.map((criteria, index) => (
                        <tr key={index} className="transition-colors duration-200">

                          <td className="w-full p-0 h-px">
                            <input
                              type="text"
                              // flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white transition-colors duration-20
                              className={index === 0 ? "w-full h-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-tl-lg focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white transition-colors duration-200 text-sm" : "w-full h-full px-3 py-2 border border-gray-300 dark:border-gray-600 focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white transition-colors duration-200 text-sm"}
                              value={criteria}
                              onChange={(e) => handleCriteriaChange('keywords', index, e.target.value)}
                              placeholder={t('scoring.keywordPlaceholder')}
                            />
                          </td>
                          <td className="px-4 py-2 text-right">
                            <button
                              disabled={protocol.keywords.length === 1}
                              onClick={() => removeCriteria({ type: 'keywords', index: index })}
                              className="text-red-600 dark:text-red-400 hover:text-red-800 dark:hover:text-red-300 p-1 rounded-full hover:bg-red-50 dark:hover:bg-red-900/50 transition-colors duration-200 disabled:cursor-not-allowed disabled:text-gray-500 disabled:hover:bg-transparent disabled:hover:text-gray-500"
                            >
                              <XCircle size={16} />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className=" bg-gray-50 dark:bg-gray-900/50  rounded-bl-lg rounded-br-lg " >
                  <button
                    onClick={() => addCriteria('keywords')}
                    className="w-full px-3 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 text-sm font-medium rounded-bl-lg rounded-br-lg rounded-tl-none rounded-tr-none transition-colors duration-200 flex items-center justify-center gap-2"
                  >
                    <PlusCircle size={16} />
                    {t('scoring.addKeywords')}
                  </button>
                </div>
              </div>
            </div>
          </div>
          <div className="p-4">
            <div>
              <h5 className="font-medium text-blue-700 dark:text-blue-300 mb-4">{t('scoring.fieldWeights')}</h5>
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {[
                  { label: t('scoring.titleField'), key: 'title' },
                  { label: t('scoring.abstractField'), key: 'abstract' },
                  { label: t('scoring.keywordsField'), key: 'keywords' }
                ].map(field => (
                  <div key={field.key} className="bg-blue-50 dark:bg-blue-900/30 p-4 rounded-lg">
                    <div className="flex justify-between items-center mb-2">
                      <label className="text-sm font-medium text-blue-600 dark:text-blue-400">
                        {field.label}
                      </label>
                      <span className="text-sm font-bold text-blue-700 dark:text-blue-300">
                        {scoringSystem.weights[field.key]} pts
                      </span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="10"
                      value={scoringSystem.weights[field.key]}
                      onChange={(e) => handleWeightChange(field.key, e.target.value)}
                      className="w-full h-2 bg-blue-200 rounded-lg appearance-none cursor-pointer accent-blue-600 dark:accent-blue-400"
                    />
                  </div>
                ))}
              </div>
            </div>

            <div className="border-t border-blue-200 dark:border-blue-800 pt-6">
              <h5 className="font-medium text-blue-700 dark:text-blue-300 mb-4">{t('scoring.searchSettings')}</h5>
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                {[
                  {
                    key: 'caseInsensitive',
                    label: t('scoring.caseInsensitive'),
                    description: t('scoring.caseInsensitiveDesc')
                  },
                  {
                    key: 'exactMatch',
                    label: t('scoring.exactMatch'),
                    description: t('scoring.exactMatchDesc')
                  },
                  {
                    key: 'multipleOccurrences',
                    label: t('scoring.multipleOccurrences'),
                    description: t('scoring.multipleOccurrencesDesc')
                  }
                ].map(setting => (
                  <div key={setting.key} className="bg-blue-50 dark:bg-blue-900/30 p-4 rounded-lg">
                    <label className="flex items-center gap-3 cursor-pointer overflow-hidden">
                      <div className="relative flex-shrink-0">
                        <input
                          type="checkbox"
                          checked={scoringSystem[setting.key]}
                          onChange={(e) => handleConfigChange(setting.key, e.target.checked)}
                          className="peer sr-only"
                        />
                        <div className="w-10 h-6 bg-gray-300 rounded-full peer-checked:bg-blue-500 transition-colors duration-200" />
                        <div className="absolute left-1 top-1 w-4 h-4 bg-white rounded-full transition-transform duration-200 peer-checked:translate-x-4" />
                      </div>
                      <span className="text-sm font-medium text-blue-700 dark:text-blue-400 leading-tight min-w-0 break-words">
                        {setting.label}
                      </span>
                    </label>
                    <p className="mt-1 text-xs text-blue-600 dark:text-blue-500">{setting.description}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* <div className="pt-3 border-t border-blue-200 dark:border-blue-700">
            <button
              onClick={() => window.recalculateAllScores && window.recalculateAllScores()}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg flex items-center justify-center gap-2 transition-colors duration-200"
            >
              <RefreshCw className="h-4 w-4" />
              Recalcular Pontuações
            </button>
          </div> */}

            <div className="bg-blue-100 dark:bg-blue-800/50 p-3 rounded text-xs text-blue-700 dark:text-blue-300 mt-4">
              <p><strong>{t('scoring.howItWorks')}</strong></p>
              <ul className="list-disc list-inside mt-1 space-y-1">
                <li>{t('scoring.how1')}</li>
                <li>{t('scoring.how2')}</li>
                <li>{t('scoring.how3')}</li>
              </ul>
            </div>
          </div>
        </div>
      </div>

    </div>
  );
};

// Componente para importação de dados
const ImportSection = ({ articles, setArticles, onImport, isLoading, importedData, protocol, setImportedData, detectDuplicates, numStringSc, setNumStringSc, statistics }) => {
  const { t, i18n } = useTranslation();
  const [showSearchStringModal, setShowSearchStringModal] = useState(null);
  const [pendingImport, setPendingImport] = useState(null);
  const [isLoadingState, setIsLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [inputFileSelected, setInputFileSelected] = useState(null);
  const [alertMessage, setAlertMessage] = useState(null);

  const handleImportRequest = (target, database) => {
    const file = target.files[0]
    if (!file) return;
    if (file.name.endsWith('.bib') || file.name.endsWith('.bibtex') || file.name.endsWith('.txt')) {
      setInputFileSelected(target)
      setPendingImport({ file, database });
      setShowSearchStringModal(database);
    } else {
      setAlertMessage({ type: 'error', title: t('modals.alert.errorTitle'), message: t('import.alertError') });
      throw new Error('Formato de arquivo não corresponde à base de dados selecionada.');
    }
  };

  const handleConfirmImport = async (searchString) => {
    if (!pendingImport) return;
    const { file, database } = pendingImport;

    setIsLoading(true);
    setShowSearchStringModal(null);
    try {
      // Ler o conteúdo do arquivo
      const fileContent = await file.text();
      // Determinar o tipo de arquivo e processar
      let importedArticles;
      if (file.name.endsWith('.bib') || file.name.endsWith('.bibtex') || file.name.endsWith('.txt')) {

        if (database === 'Scopus' || database === 'Web of Science' || database === 'ScienceDirect') {
          importedArticles = importedBibtexArticles(fileContent, database, numStringSc, articles);
        } else {
          importedArticles = importedPubmedArticles(fileContent, database, numStringSc, articles);
        }
        // Adicionar string de busca
        importedArticles = importedArticles.map(article => ({
          ...article,
          searchString: searchString
        }));

        // Calcular pontuações se habilitado
        if (protocol.keywords?.length > 0) {
          const validKeywords = protocol.keywords.filter(k => k.trim());
          if (validKeywords.length > 0) {
            importedArticles = importedArticles.map(article => ({
              ...article,
              score: window.calculateArticleScore ?
                window.calculateArticleScore(article, validKeywords, protocol.scoringSystem) : 0
            }));
          }
        }



        const idData = importedData.reduce((max, data) => (data.id > max ? data.id : max), 0) + 1;

        const newImportData = {
          id: idData,
          database,
          searchString,
          articles: importedArticles,
          importDate: new Date(),
          fileName: file.name
        };
        importedArticles = importedArticles.map(article => ({
          ...article,
          idData: idData
        }));
        setImportedData(prev => [...prev, newImportData]);

        onImport(importedArticles, database);
        setNumStringSc(prev => prev + 1);
        // }else{
        //   throw new Error('Formato de arquivo não corresponde à base de dados selecionada.');
        // }
      } else {
        throw new Error('Formato de arquivo não corresponde à base de dados selecionada.');
      }


    } catch (error) {
      console.error('Erro ao processar arquivo:', error);
      setAlertMessage({ type: 'error', title: t('modals.alert.errorTitle'), message: t('import.alertError') });
      setResult(null);

    } finally {
      setPendingImport(null);
      setIsLoading(false);
      inputFileSelected.value = ""

    }
  };
  const handleExcludeData = (data) => {

    setImportedData(prev =>
      prev.filter(prevdata => prevdata.id !== data.id)
    );
    setArticles(prevArticles => {
      // Remove os artigos do import deletado e reseta isDuplicate de todos
      const remainingArticles = prevArticles
        .filter(article => article.idData !== data.id)
        .map(article => ({ ...article, isDuplicate: false, dataProcessingStatus: article.dataProcessingStatus === 'duplicate' ? 'pending' : article.dataProcessingStatus, duplicateOf: null }));

      // Reavalia duplicatas do zero
      const duplicatesByDOI = new Map();
      const duplicatesByTitle = new Map();

      return remainingArticles.map(article => {
        let isDuplicate = false;
        let duplicateOf = null;

        if (article.doi && duplicatesByDOI.has(article.doi)) {
          isDuplicate = true;
          duplicateOf = duplicatesByDOI.get(article.doi);
        } else if (article.doi) {
          duplicatesByDOI.set(article.doi, article.id);
        }

        const normalizedTitle = article.title.toLowerCase().trim();
        if (duplicatesByTitle.has(normalizedTitle)) {
          isDuplicate = true;
          duplicateOf = duplicatesByTitle.get(normalizedTitle);
        } else {
          duplicatesByTitle.set(normalizedTitle, article.id);
        }

        return isDuplicate
          ? { ...article, isDuplicate: true, dataProcessingStatus: 'duplicate', duplicateOf }
          : article;
      });
    });
    // setArticles(prevArticles => 
    //   prevArticles.filter(article => article.idData !== data.id)
    // );
  };

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6 mb-6 transition-colors duration-200">
      <h2 className="text-lg sm:text-2xl font-bold text-gray-800 dark:text-white mb-6 flex items-center gap-2">
        <Upload className="h-6 w-6 text-blue-600 dark:text-blue-400" />
        {t('import.sectionTitle')}
      </h2>

      {protocol.databases.length === 0 && (
        <div className="mb-6 p-4 bg-yellow-50 dark:bg-yellow-900/30 border border-yellow-200 dark:border-yellow-700 rounded-lg transition-colors duration-200" data-tour="import-sources">
          <p className="text-yellow-800 dark:text-yellow-300">
            {t('import.warning')}
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6" data-tour="import-sources">
        {/* Scopus */}
        {protocol.databases.includes('Scopus') && (
          <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-6 bg-white dark:bg-gray-800 transition-colors duration-200">
            <div className="flex items-center mb-4">
              <div className="w-12 h-12 bg-orange-100 dark:bg-orange-900/30 rounded-lg flex items-center justify-center mr-4">
                <Database className="h-6 w-6 text-orange-600 dark:text-orange-400" />
              </div>
              <div>
                <h3 className="text-sm sm:text-lg font-semibold text-gray-800 dark:text-white">Scopus</h3>
                <p className="text-sm text-gray-600 dark:text-gray-400">{t('import.importBibtex')}</p>
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  {t('import.uploadScopus')}
                </label>
                <input
                  type="file"
                  id="file-upload-scopus"
                  accept=".csv,.ris,.bib,.txt"
                  onChange={(e) => handleImportRequest(e.target, 'Scopus')}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white transition-colors duration-200 dark:hover:text-white dark:hover:bg-indigo-500 hover:text-black hover:bg-gray-200 file:hidden"
                  disabled={isLoadingState}
                />
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  {t('import.formatBibtex')}
                </p>
              </div>

              {importedData.filter(data => data.database === 'Scopus').length > 0 && (
                <div className="bg-orange-50 dark:bg-orange-900/30 p-4 rounded-lg transition-colors duration-200">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-medium text-orange-800 dark:text-orange-300">{t('import.status')}</span>
                    <CheckCircle className="h-4 w-4 text-green-600 dark:text-green-400" />
                  </div>
                  {importedData.filter(data => data.database === 'Scopus').map((data, index) => (
                    <div key={index} className="space-y-1 text-sm mb-3 last:mb-0">
                      <div className="flex justify-between">
                        <span className="text-orange-700 dark:text-orange-400">{t('import.string', { index: data.id })}</span>
                        <span className="font-medium text-orange-800 dark:text-orange-300">{t('import.articles', { count: data.articles.length })}</span>
                      </div>
                      <div className="text-xs text-orange-600 dark:text-orange-500 break-all">
                        {data.searchString.length > 80 ? data.searchString.substring(0, 80) + '...' : data.searchString}
                      </div>
                      <div className="flex justify-between text-xs">
                        <span className="text-orange-600 dark:text-orange-400">{t('import.duplicates')}</span>
                        <span className="font-medium text-red-600 dark:text-red-400">
                          {statistics.importSection['duplicate' + data.id]}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {isLoadingState && (
                <div className="flex items-center justify-center py-4">
                  <RefreshCw className="h-5 w-5 animate-spin text-orange-600 dark:text-orange-400 mr-2" />
                  <span className="text-sm text-gray-600 dark:text-gray-400">{t('import.processing')}</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Web of Science */}
        {protocol.databases.includes('Web of Science') && (
          <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-6 bg-white dark:bg-gray-800 transition-colors duration-200">
            <div className="flex items-center mb-4">
              <div className="w-12 h-12 bg-violet-100 dark:bg-violet-900/30 rounded-lg flex items-center justify-center mr-4">
                <Database className="h-6 w-6 text-violet-600 dark:text-violet-400" />
              </div>
              <div>
                <h3 className="text-sm sm:text-lg font-semibold text-gray-800 dark:text-white">Web of Science</h3>
                <p className="text-sm text-gray-600 dark:text-gray-400">{t('import.importBibtex')}</p>
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  {t('import.uploadWoS')}
                </label>
                <input
                  type="file"
                  accept=".csv,.ris,.bib,.txt"
                  onChange={(e) => handleImportRequest(e.target, 'Web of Science')}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white transition-colors duration-200 dark:hover:text-white dark:hover:bg-indigo-500 hover:text-black hover:bg-gray-200 file:hidden"
                  disabled={isLoadingState}
                />
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  {t('import.formatBibtex')}
                </p>
              </div>

              {importedData.filter(data => data.database === 'Web of Science').length > 0 && (
                <div className="bg-blue-50 dark:bg-blue-900/30 p-4 rounded-lg transition-colors duration-200">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-medium text-blue-800 dark:text-blue-300">{t('import.status')}</span>
                    <CheckCircle className="h-4 w-4 text-green-600 dark:text-green-400" />
                  </div>
                  {importedData.filter(data => data.database === 'Web of Science').map((data, index) => (
                    <div key={index} className="space-y-1 text-sm mb-3 last:mb-0">
                      <div className="flex justify-between">
                        <span className="text-blue-700 dark:text-blue-400">{t('import.string', { index: index + 1 })}</span>
                        <span className="font-medium text-blue-800 dark:text-blue-300">{t('import.articles', { count: data.articles.length })}</span>
                      </div>
                      <div className="text-xs text-blue-600 dark:text-blue-500 break-all">
                        {data.searchString.length > 80 ? data.searchString.substring(0, 80) + '...' : data.searchString}
                      </div>
                      <div className="flex justify-between text-xs">
                        <span className="text-blue-600 dark:text-blue-400">{t('import.duplicates')}</span>
                        <span className="font-medium text-red-600 dark:text-red-400">
                          {statistics.importSection['duplicate' + data.id]}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {isLoadingState && (
                <div className="flex items-center justify-center py-4">
                  <RefreshCw className="h-5 w-5 animate-spin text-blue-600 dark:text-blue-400 mr-2" />
                  <span className="text-sm text-gray-600 dark:text-gray-400">{t('import.processing')}</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* PubMed */}
        {protocol.databases.includes('PubMed') && (
          <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-6 bg-white dark:bg-gray-800 transition-colors duration-200">
            <div className="flex items-center mb-4">
              <div className="w-12 h-12  bg-sky-100 dark:bg-sky-900/30 rounded-lg flex items-center justify-center mr-4">
                <Database className="h-6 w-6 text-sky-700  dark:text-sky-600" />
              </div>
              <div>
                <h3 className="text-sm sm:text-lg font-semibold text-gray-800 dark:text-white">PubMed</h3>
                <p className="text-sm text-gray-600 dark:text-gray-400">{t('import.importPubmed')}</p>
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  {t('import.uploadPubmed')}
                </label>
                <input
                  type="file"
                  accept=".csv,.ris,.bib,.txt"
                  onChange={(e) => handleImportRequest(e.target, 'PubMed')}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white transition-colors duration-200 dark:hover:text-white dark:hover:bg-indigo-500 hover:text-black hover:bg-gray-200 file:hidden"
                  disabled={isLoadingState}
                />
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  {t('import.formatPubmed')}
                </p>
              </div>

              {importedData.filter(data => data.database === 'PubMed').length > 0 && (
                <div className="bg-blue-50 dark:bg-blue-900/30 p-4 rounded-lg transition-colors duration-200">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-medium text-blue-800 dark:text-blue-300">{t('import.status')}</span>
                    <CheckCircle className="h-4 w-4 text-green-600 dark:text-green-400" />
                  </div>
                  {importedData.filter(data => data.database === 'PubMed').map((data, index) => (
                    <div key={index} className="space-y-1 text-sm mb-3 last:mb-0">
                      <div className="flex justify-between">
                        <span className="text-blue-700 dark:text-blue-400">{t('import.string', { index: index + 1 })}</span>
                        <span className="font-medium text-blue-800 dark:text-blue-300">{t('import.articles', { count: data.articles.length })}</span>
                      </div>
                      <div className="text-xs text-blue-600 dark:text-blue-500 break-all">
                        {data.searchString.length > 80 ? data.searchString.substring(0, 80) + '...' : data.searchString}
                      </div>
                      <div className="flex justify-between text-xs">
                        <span className="text-blue-600 dark:text-blue-400">{t('import.duplicates')}</span>
                        <span className="font-medium text-red-600 dark:text-red-400">
                          {statistics.importSection['duplicate' + data.id]}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {isLoadingState && (
                <div className="flex items-center justify-center py-4">
                  <RefreshCw className="h-5 w-5 animate-spin text-blue-600 dark:text-blue-400 mr-2" />
                  <span className="text-sm text-gray-600 dark:text-gray-400">{t('import.processing')}</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ScienceDirect */}
        {protocol.databases.includes('ScienceDirect') && (
          <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-6 bg-white dark:bg-gray-800 transition-colors duration-200">
            <div className="flex items-center mb-4">
              <div className="w-12 h-12 bg-orange-100 dark:bg-orange-900/30 rounded-lg flex items-center justify-center mr-4">
                <Database className="h-6 w-6 text-orange-600 dark:text-orange-400" />
              </div>
              <div>
                <h3 className="text-sm sm:text-lg font-semibold text-gray-800 dark:text-white">ScienceDirect</h3>
                <p className="text-sm text-gray-600 dark:text-gray-400">{t('import.importBibtex')}</p>
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  {t('import.uploadScienceDirect')}
                </label>
                <input
                  type="file"
                  accept=".bib,.bibtex,.txt"
                  onChange={(e) => handleImportRequest(e.target, 'ScienceDirect')}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white transition-colors duration-200 dark:hover:text-white dark:hover:bg-indigo-500 hover:text-black hover:bg-gray-200 file:hidden"
                  disabled={isLoadingState}
                />
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  {t('import.formatBibtex')}
                </p>
              </div>

              {importedData.filter(data => data.database === 'ScienceDirect').length > 0 && (
                <div className="bg-orange-50 dark:bg-orange-900/30 p-4 rounded-lg transition-colors duration-200">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-medium text-orange-800 dark:text-orange-300">{t('import.status')}</span>
                    <CheckCircle className="h-4 w-4 text-green-600 dark:text-green-400" />
                  </div>
                  {importedData.filter(data => data.database === 'ScienceDirect').map((data, index) => (
                    <div key={index} className="space-y-1 text-sm mb-3 last:mb-0">
                      <div className="flex justify-between">
                        <span className="text-orange-700 dark:text-orange-400">{t('import.string', { index: index + 1 })}</span>
                        <span className="font-medium text-orange-800 dark:text-orange-300">{t('import.articles', { count: data.articles.length })}</span>
                      </div>
                      <div className="text-xs text-orange-600 dark:text-orange-500 break-all">
                        {data.searchString.length > 80 ? data.searchString.substring(0, 80) + '...' : data.searchString}
                      </div>
                      <div className="flex justify-between text-xs">
                        <span className="text-orange-600 dark:text-orange-400">{t('import.duplicates')}</span>
                        <span className="font-medium text-red-600 dark:text-red-400">
                          {statistics.importSection['duplicate' + data.id]}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {isLoadingState && (
                <div className="flex items-center justify-center py-4">
                  <RefreshCw className="h-5 w-5 animate-spin text-orange-600 dark:text-orange-400 mr-2" />
                  <span className="text-sm text-gray-600 dark:text-gray-400">{t('import.processing')}</span>
                </div>
              )}
            </div>
          </div>
        )}

      </div>

      {/* Tabela de dados importados */}
      {importedData.length > 0 && (
        <div className="mt-8 bg-gray-100 dark:bg-gray-900/50 rounded-xl shadow-lg overflow-hidden transition-colors duration-200">
          <div className="p-6 border-b border-gray-200 dark:border-gray-700">
            <h4 className="font-semibold text-gray-800 dark:text-white mb-2">{t('import.importedTableTitle')}</h4>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              {t('import.importedTableDesc')}
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full ">
              <thead className="bg-gray-50 dark:bg-gray-900">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    {t('import.colDatabase')}
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    {t('import.colSearchString')}
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    {t('import.colTotal')}
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    {t('import.colUnique')}
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    {t('import.colDuplicates')}
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    {t('import.colImportDate')}
                  </th>
                  <th className="py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">

                  </th>
                </tr>
              </thead>
              <tbody className="bg-gray-50 dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                {importedData.map((data, index) => (
                  <tr key={index} className="hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors duration-200">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${data.database === 'Scopus' ? 'bg-orange-100 dark:bg-orange-900/50 text-orange-800 dark:text-orange-300' :
                        data.database === 'Web of Science' ? 'bg-violet-100 dark:bg-violet-900/50 text-violet-800 dark:text-violet-300' :
                          data.database === 'PubMed' ? 'bg-sky-100 dark:bg-sky-900/50 text-sky-800 dark:text-sky-300' :
                            data.database === 'ScienceDirect' ? 'bg-orange-100 dark:bg-orange-900/50 text-orange-800 dark:text-orange-300' :
                              'bg-gray-100 dark:bg-gray-900/50 text-gray-800 dark:text-gray-300'
                        }`}>
                        {data.database}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-sm text-gray-900 dark:text-gray-100 max-w-xs truncate" title={data.searchString}>
                        {data.searchString}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                        {data.articles.length}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-semibold text-green-600 dark:text-green-400">
                        {statistics.importSection['unique' + data.id]}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-semibold text-red-600 dark:text-red-400">
                        {statistics.importSection['duplicate' + data.id]}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                      {new Date(data.importDate).toLocaleDateString(i18n.language === 'pt' ? 'pt-BR' : 'en-US')}
                    </td>
                    <td className="px-1 py-4 text-sm font-medium text-gray-500 dark:text-gray-400">
                      <button
                        onClick={() => {
                          handleExcludeData(data)
                        }}
                        className="text-red-600 dark:text-red-400 hover:text-red-900 dark:hover:text-red-300 p-1 transition-colors duration-200"
                        title={t('import.delete')}
                      >
                        <XCircle size={16} />
                      </button>

                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Resumo geral da importação */}
      <div className="mt-8 bg-gray-100 dark:bg-gray-900/50 p-6 rounded-lg transition-colors duration-200">
        <h4 className="font-semibold text-gray-800 dark:text-white mb-4">{t('import.summaryTitle')}</h4>
        <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
          <div className="text-center">
            <p className="text-lg sm:text-2xl font-bold text-orange-600 dark:text-orange-400">
              {importedData.filter(d => d.database === 'Scopus').reduce((acc, d) => acc + d.articles.length, 0)}
            </p>
            <p className="text-sm text-gray-600 dark:text-gray-400">Scopus</p>
          </div>
          <div className="text-center">
            <p className="text-lg sm:text-2xl font-bold text-violet-600 dark:text-violet-400">
              {importedData.filter(d => d.database === 'Web of Science').reduce((acc, d) => acc + d.articles.length, 0)}
            </p>
            <p className="text-sm text-gray-600 dark:text-gray-400">Web of Science</p>
          </div>
          <div className="text-center">
            <p className="text-lg sm:text-2xl font-bold text-sky-600 dark:text-sky-400">
              {importedData.filter(d => d.database === 'PubMed').reduce((acc, d) => acc + d.articles.length, 0)}
            </p>
            <p className="text-sm text-gray-600 dark:text-gray-400">PubMed</p>
          </div>
          <div className="text-center">
            <p className="text-lg sm:text-2xl font-bold text-orange-600 dark:text-orange-400">
              {importedData.filter(d => d.database === 'ScienceDirect').reduce((acc, d) => acc + d.articles.length, 0)}
            </p>
            <p className="text-sm text-gray-600 dark:text-gray-400">ScienceDirect</p>
          </div>
          <div className="text-center">
            <p className="text-lg sm:text-2xl font-bold text-gray-600 dark:text-gray-400">
              {importedData.filter(d => d.database !== 'Scopus' && d.database !== 'Web of Science' && d.database !== 'PubMed' && d.database !== 'ScienceDirect').reduce((acc, d) => acc + d.articles.length, 0)}
            </p>
            <p className="text-sm text-gray-600 dark:text-gray-400">{t('import.otherBases')}</p>
          </div>
          <div className="text-center">
            <p className="text-lg sm:text-2xl font-bold text-indigo-600 dark:text-indigo-400">
              {importedData.reduce((acc, d) => acc + d.articles.length, 0)}
            </p>
            <p className="text-sm text-gray-600 dark:text-gray-400">{t('import.total')}</p>
          </div>
        </div>
      </div>

      {/* Modal para string de busca */}
      <SearchStringModal
        isOpen={showSearchStringModal !== null}
        onClose={() => {
          setShowSearchStringModal(null);
          setPendingImport(null);
        }}
        onConfirm={handleConfirmImport}
        database={showSearchStringModal}
      />

      <AlertModal
        isOpen={!!alertMessage}
        type={alertMessage?.type}
        title={alertMessage?.title}
        message={alertMessage?.message}
        onClose={() => setAlertMessage(null)}
      />
    </div>
  );
};

// Componente para Tratamento de Dados
const DataProcessingSection = ({ articles, currentFilter, setArticles, onUpdateStatus, detectDuplicates, statistics }) => {
  const { t } = useTranslation();

  const [duplicateDetection, setDuplicateDetection] = useState({
    byTitle: true,
    byDOI: true,
    byAuthors: true,
    similarityThreshold: 1
  });
  const [duplicates, setDuplicates] = useState(0)
  const [removeIncludes, setRemoveIncludes] = useState(false)
  const [alertMessage, setAlertMessage] = useState(null)
  const handleClassifyDuplicates = () => {
    const statusField = 'dataProcessingStatus';

    // Marcar todas as duplicatas como excluídas
    articles.forEach(article => {
      if (article.isDuplicate) {
        handleDuplicate(article.id)
        // onUpdateStatus(article.id, statusField, 'duplicate', null);
      }

    })

    // Mostrar mensagem de confirmação
    setTimeout(() => {
      setAlertMessage({ type: 'info', title: t('modals.alert.infoTitle'), message: t('dataprocessing.alertDuplicates', { count: duplicates.length }) });
    }, 100);
  };

  const handleExcludeScore = (removeIncludes) => {
    const statusField = 'dataProcessingStatus';

    // Marcar todas as duplicatas como excluídas
    const allowedStatuses = removeIncludes
      ? ["pending", "included"]
      : ["pending"];

    const pendingArticles = articles.filter(article =>
      allowedStatuses.includes(article.dataProcessingStatus)
    );

    pendingArticles.forEach(article => {
      if (article.score === 0) {
        onUpdateStatus(article.id, statusField, 'excluded', null);
      }
    });

    const zeroScore = pendingArticles.filter(a => a.score === 0);

    setTimeout(() => {
      setAlertMessage({ type: 'info', title: t('modals.alert.infoTitle'), message: t('dataprocessing.alertScore', { count: zeroScore.length }) });
    }, 100);
  };

  const handleIncludePendents = () => {
    const statusField = 'dataProcessingStatus';

    // Marcar todas as duplicatas como excluídas

    const pendingArticles = articles.filter((article) => article.dataProcessingStatus == "pending")

    pendingArticles.forEach(article => {
      onUpdateStatus(article.id, statusField, 'included', null);
    })

    // Mostrar mensagem de confirmação
    setTimeout(() => {
      setAlertMessage({ type: 'success', title: t('modals.alert.successTitle'), message: t('dataprocessing.alertIncluded', { count: pendingArticles.length }) });
    }, 100);
  };


  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6 mb-6 transition-colors duration-200" data-tour="section-dataprocessing">
      <h2 className="text-lg sm:text-2xl font-bold text-gray-800 dark:text-white mb-6 flex items-center gap-2">
        <Database className="h-6 w-6 text-purple-600 dark:text-purple-400" />
        {t('dataprocessing.sectionTitle')}
      </h2>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 mb-6">
        <div className="bg-blue-50 dark:bg-blue-900/30 p-4 rounded-lg transition-colors duration-200">
          <h3 className="font-semibold text-blue-800 dark:text-blue-300 mb-2">{t('dataprocessing.imported')}</h3>
          <p className="text-lg sm:text-2xl font-bold text-blue-900 dark:text-blue-200">{articles.length}</p>
        </div>
        <div className="bg-red-50 dark:bg-red-900/30 p-4 rounded-lg transition-colors duration-200">
          <h3 className="font-semibold text-red-800 dark:text-red-300 mb-2">{t('dataprocessing.duplicates')}</h3>
          <p className="text-lg sm:text-2xl font-bold text-red-900 dark:text-red-200">{statistics.dataProcessing.duplicate}</p>
        </div>
        <div className="bg-green-50 dark:bg-green-900/30 p-4 rounded-lg transition-colors duration-200">
          <h3 className="font-semibold text-green-800 dark:text-green-300 mb-2">{t('dataprocessing.approved')}</h3>
          <p className="text-lg sm:text-2xl font-bold text-green-900 dark:text-green-200">{statistics.dataProcessing.included}</p>
        </div>
        <div className="bg-red-50 dark:bg-red-900/30 p-4 rounded-lg transition-colors duration-200">
          <h3 className="font-semibold text-red-800 dark:text-red-300 mb-2">{t('filter.excluded')}</h3>
          <p className="text-lg sm:text-2xl font-bold text-red-900 dark:text-red-200">{statistics.dataProcessing.excluded}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="p-4 border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/30 rounded-lg transition-colors duration-200">
          <h4 className="font-semibold text-gray-800 dark:text-gray-300 mb-2">{t('dataprocessing.processTitle')}</h4>
          <ul className="text-sm text-gray-700 dark:text-gray-400 space-y-1">
            <li>{t('dataprocessing.process1')}</li>
            <li>{t('dataprocessing.process2')}</li>
            <li>{t('dataprocessing.process3')}</li>
          </ul>
        </div>

        <div className="space-y-4">
          <div className="p-4 border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/30 rounded-lg transition-colors duration-200">
            <h4 className="font-semibold text-gray-800 dark:text-gray-300 mb-1">{t('dataprocessing.scoreTitle')}</h4>
            <p className="text-sm text-gray-700 dark:text-gray-400 mb-3">{t('dataprocessing.scoreDesc')}</p>

            <div className="grid grid-cols-[2fr_1fr] gap-2">
              <button
                onClick={() => handleExcludeScore(removeIncludes)}
                className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium touch-manipulation active:scale-95 transition-all duration-150 text-red-700 dark:text-red-300 bg-red-100 dark:bg-red-900/40 hover:bg-red-200 dark:hover:bg-red-800/60"
              >
                <CopyX className="h-4 w-4" />
                {t('dataprocessing.scoreButton')}
              </button>
              <button
                key="removeIncludes"
                onClick={() => setRemoveIncludes(!removeIncludes)}
                className={`text-sm px-3 py-2 rounded-xl flex items-center justify-center gap-2 border-none cursor-pointer touch-manipulation active:scale-95 transition-all duration-150
                  ${removeIncludes
                    ? 'bg-indigo-600 text-white dark:bg-indigo-500'
                    : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600'}`}
              >
                {t('dataprocessing.removeIncludes')}
              </button>
            </div>
          </div>

          <div className="p-4 border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/30 rounded-lg transition-colors duration-200">
            <h4 className="font-semibold text-gray-800 dark:text-gray-300 mb-3">{t('dataprocessing.autoAcceptTitle')}</h4>
            <button
              onClick={handleIncludePendents}
              className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium touch-manipulation active:scale-95 transition-all duration-150 text-green-700 dark:text-green-300 bg-green-100 dark:bg-green-900/40 hover:bg-green-200 dark:hover:bg-green-800/60"
            >
              <CopyCheck className="h-4 w-4" />
              {t('dataprocessing.autoAcceptButton')}
            </button>
          </div>
        </div>
      </div>

      <AlertModal
        isOpen={!!alertMessage}
        type={alertMessage?.type}
        title={alertMessage?.title}
        message={alertMessage?.message}
        onClose={() => setAlertMessage(null)}
      />
    </div>
  );
};

// Componente para Filtro 1
const Filter1Section = ({ articles, onUpdateStatus, inclusionCriteria, exclusionCriteria, statistics }) => {
  const { t } = useTranslation();
  const filter1Articles = articles.filter(a =>
    a.dataProcessingStatus === 'included' && !a.isDuplicate && a.dataProcessingStatus !== 'duplicate'
  );

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6 mb-6 transition-colors duration-200" data-tour="section-filter1">
      <h2 className="text-lg sm:text-2xl font-bold text-gray-800 dark:text-white mb-6 flex items-center gap-2">
        <Filter className="h-6 w-6 text-green-600 dark:text-green-400" />
        {t('filter.section1Title')}
      </h2>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 mb-6">
        <div className="bg-blue-50 dark:bg-blue-900/30 p-4 rounded-lg transition-colors duration-200">
          <h3 className="font-semibold text-blue-800 dark:text-blue-300 mb-2">{t('filter.fromProcessing')}</h3>
          <p className="text-lg sm:text-2xl font-bold text-blue-900 dark:text-blue-200">{filter1Articles.length}</p>
        </div>
        <div className="bg-gray-50 dark:bg-gray-900 p-4 rounded-lg transition-colors duration-200">
          <h3 className="font-semibold text-gray-800 dark:text-gray-300 mb-2">{t('filter.pending')}</h3>
          <p className="text-lg sm:text-2xl font-bold text-gray-900 dark:text-gray-200">{statistics.filter1.pending}</p>
        </div>
        <div className="bg-green-50 dark:bg-green-900/30 p-4 rounded-lg transition-colors duration-200">
          <h3 className="font-semibold text-green-800 dark:text-green-300 mb-2">{t('filter.included')}</h3>
          <p className="text-lg sm:text-2xl font-bold text-green-900 dark:text-green-200">{statistics.filter1.included}</p>
        </div>
        <div className="bg-red-50 dark:bg-red-900/30 p-4 rounded-lg transition-colors duration-200">
          <h3 className="font-semibold text-red-800 dark:text-red-300 mb-2">{t('filter.excluded')}</h3>
          <p className="text-lg sm:text-2xl font-bold text-red-900 dark:text-red-200">{statistics.filter1.excluded}</p>
        </div>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <div className="bg-green-50 dark:bg-green-900/30 p-4 rounded-lg transition-colors duration-200">
          <h4 className="font-semibold text-green-800 dark:text-green-300 mb-2">{t('filter.inclusionCriteria')}</h4>
          <ul className="text-sm text-green-700 dark:text-green-400 space-y-1">
            {
              inclusionCriteria.filter(c => c.value.trim()).map((criterion, index) => (
                <li key={index}>• {criterion.id + ' - ' + criterion.value}</li>
              ))}
          </ul>
        </div>
        <div className="bg-red-50 dark:bg-red-900/30 p-4 rounded-lg transition-colors duration-200">
          <h4 className="font-semibold text-red-800 dark:text-red-300 mb-2">{t('filter.exclusionCriteria')}</h4>
          <ul className="text-sm text-red-900 dark:text-red-200 space-y-1">
            {
              exclusionCriteria.filter(c => c.value.trim()).map((criterion, index) => (
                <li key={index}>• {criterion.id + ' - ' + criterion.value}</li>
              ))}
          </ul>
        </div>
      </div>


    </div>
  );
};

// Componente para Filtro 2
const Filter2Section = ({ articles, onUpdateStatus, inclusionCriteria, exclusionCriteria, statistics }) => {
  const { t } = useTranslation();
  const filter2Articles = articles.filter(a => a.filter1Status === 'included');

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6 mb-6 transition-colors duration-200" data-tour="section-filter2">
      <h2 className="text-lg sm:text-2xl font-bold text-gray-800 dark:text-white mb-6 flex items-center gap-2">
        <Filter className="h-6 w-6 text-blue-600 dark:text-blue-400" />
        {t('filter.section2Title')}
      </h2>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 mb-6">
        <div className="bg-blue-50 dark:bg-blue-900/30 p-4 rounded-lg transition-colors duration-200">
          <h3 className="font-semibold text-blue-800 dark:text-blue-300 mb-2">{t('filter.fromFilter1')}</h3>
          <p className="text-lg sm:text-2xl font-bold text-blue-900 dark:text-blue-200">{filter2Articles.length}</p>
        </div>
        <div className="bg-gray-50 dark:bg-gray-900 p-4 rounded-lg transition-colors duration-200">
          <h3 className="font-semibold text-gray-800 dark:text-gray-300 mb-2">{t('filter.pending')}</h3>
          <p className="text-lg sm:text-2xl font-bold text-gray-900 dark:text-gray-200">{statistics.filter2.pending}</p>
        </div>
        <div className="bg-green-50 dark:bg-green-900/30 p-4 rounded-lg transition-colors duration-200">
          <h3 className="font-semibold text-green-800 dark:text-green-300 mb-2">{t('filter.included')}</h3>
          <p className="text-lg sm:text-2xl font-bold text-green-900 dark:text-green-200">{statistics.filter2.included}</p>
        </div>
        <div className="bg-red-50 dark:bg-red-900/30 p-4 rounded-lg transition-colors duration-200">
          <h3 className="font-semibold text-red-800 dark:text-red-300 mb-2">{t('filter.excluded')}</h3>
          <p className="text-lg sm:text-2xl font-bold text-red-900 dark:text-red-200">{statistics.filter2.excluded}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <div className="bg-green-50 dark:bg-green-900/30 p-4 rounded-lg transition-colors duration-200">
          <h4 className="font-semibold text-green-800 dark:text-green-300 mb-2">{t('filter.inclusionCriteria')}</h4>
          <ul className="text-sm text-green-700 dark:text-green-400 space-y-1">
            {
              inclusionCriteria.filter(c => c.value.trim()).map((criterion, index) => (
                <li key={index}>• {criterion.id + ' - ' + criterion.value}</li>
              ))}
          </ul>
        </div>
        <div className="bg-red-50 dark:bg-red-900/30 p-4 rounded-lg transition-colors duration-200">
          <h4 className="font-semibold text-red-800 dark:text-red-300 mb-2">{t('filter.exclusionCriteria')}</h4>
          <ul className="text-sm text-red-900 dark:text-red-200 space-y-1">
            {
              exclusionCriteria.filter(c => c.value.trim()).map((criterion, index) => (
                <li key={index}>• {criterion.id + ' - ' + criterion.value}</li>
              ))}
          </ul>
        </div>
      </div>
    </div>
  );
};

// Componente para Filtro 3
const Filter3Section = ({ articles, onUpdateStatus, inclusionCriteria, exclusionCriteria, extractionCriteria, statistics }) => {
  const { t } = useTranslation();
  const filter3Articles = articles.filter(a => a.filter2Status === 'included');

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6 mb-6 transition-colors duration-200" data-tour="section-filter3">
      <h2 className="text-lg sm:text-2xl font-bold text-gray-800 dark:text-white mb-6 flex items-center gap-2">
        <Filter className="h-6 w-6 text-purple-600 dark:text-purple-400" />
        {t('filter.section3Title')}
      </h2>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 mb-6">
        <div className="bg-blue-50 dark:bg-blue-900/30 p-4 rounded-lg transition-colors duration-200">
          <h3 className="font-semibold text-blue-800 dark:text-blue-300 mb-2">{t('filter.fromFilter2')}</h3>
          <p className="text-lg sm:text-2xl font-bold text-blue-900 dark:text-blue-200">{filter3Articles.length}</p>
        </div>
        <div className="bg-gray-50 dark:bg-gray-900 p-4 rounded-lg transition-colors duration-200">
          <h3 className="font-semibold text-gray-800 dark:text-gray-300 mb-2">{t('filter.pending')}</h3>
          <p className="text-lg sm:text-2xl font-bold text-gray-900 dark:text-gray-200">{statistics.filter3.pending}</p>
        </div>
        <div className="bg-green-50 dark:bg-green-900/30 p-4 rounded-lg transition-colors duration-200">
          <h3 className="font-semibold text-green-800 dark:text-green-300 mb-2">{t('filter.included')}</h3>
          <p className="text-lg sm:text-2xl font-bold text-green-900 dark:text-green-200">{statistics.filter3.included}</p>
        </div>
        <div className="bg-red-50 dark:bg-red-900/30 p-4 rounded-lg transition-colors duration-200">
          <h3 className="font-semibold text-red-800 dark:text-red-300 mb-2">{t('filter.excluded')}</h3>
          <p className="text-lg sm:text-2xl font-bold text-red-900 dark:text-red-200">{statistics.filter3.excluded}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        <div className="bg-green-50 dark:bg-green-900/30 p-4 rounded-lg transition-colors duration-200">
          <h4 className="font-semibold text-green-800 dark:text-green-300 mb-2">{t('filter.inclusionCriteria')}</h4>
          <ul className="text-sm text-green-700 dark:text-green-400 space-y-1">
            {
              inclusionCriteria.filter(c => c.value.trim()).map((criterion, index) => (
                <li key={index}>• {criterion.id + ' - ' + criterion.value}</li>
              ))}
          </ul>
        </div>
        <div className="bg-red-50 dark:bg-red-900/30 p-4 rounded-lg transition-colors duration-200">
          <h4 className="font-semibold text-red-800 dark:text-red-300 mb-2">{t('filter.exclusionCriteria')}</h4>
          <ul className="text-sm text-red-900 dark:text-red-200 space-y-1">
            {
              exclusionCriteria.filter(c => c.value.trim()).map((criterion, index) => (
                <li key={index}>• {criterion.id + ' - ' + criterion.value}</li>
              ))}
          </ul>
        </div>

        <div className="bg-orange-50 dark:bg-orange-900/30 p-4 rounded-lg transition-colors duration-200">
          <h4 className="font-semibold text-orange-800 dark:text-orange-300 mb-2">{t('filter.extractionCriteria')}</h4>
          <ul className="text-sm text-orange-900 dark:text-orange-200 space-y-1">
            {extractionCriteria.filter(c => c.value.trim()).map((criterion, index) => (
              <li key={index}>
                • {criterion.id + ' - ' + criterion.value}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
};

// Componente melhorado para lista de artigos
// Texto completo dos artigos (Filtros 2 e 3) — ainda não disponível
const getArticleFullText = async () => null;

const ArticlesList = ({ articles, currentFilter, onUpdateStatus, protocol, assistSettings = null, onSetSuggestions, onAddUsage, onDetailsOpenChange }) => {
  const { t } = useTranslation();
  // Triagem assistida: só nos filtros 1-3 e com chave configurada
  const assistStage = STAGES.includes(currentFilter) ? currentFilter : null;
  const assistEnabled = !!assistSettings && !!assistStage;
  const [batchSnapshot, setBatchSnapshot] = useState(null);
  const [showApplyModal, setShowApplyModal] = useState(false);
  const [evaluatingId, setEvaluatingId] = useState(null);
  const [evaluationError, setEvaluationError] = useState(null);
  const [pagination, setPagination] = useState({});
  const [searchTerm, setSearchTerm] = useState('');
  // Filtrar artigos baseado no status (pendente, incluído, excluído)
  const [statusFilter, setStatusFilter] = useState('all');
  const [sortConfig, setSortConfig] = useState({ key: null, direction: 'asc' });
  const [selectedArticle, setSelectedArticle] = useState(null);
  const detailsOpen = selectedArticle !== null;
  useEffect(() => {
    onDetailsOpenChange?.(detailsOpen);
    return () => onDetailsOpenChange?.(false);
  }, [detailsOpen, onDetailsOpenChange]);
  const [showCriterionModal, setShowCriterionModal] = useState(null);
  const [itemsPerPage] = useState(50);
  const [contextMenu, setContextMenu] = useState(null);
  const [interval, setInterval] = useState(0);
  const [currentArticle, setCurrentArticle] = useState(null);
  const [criterias, setCriterias] = useState([]);
  const [optionExtraction, setOptionExtraction] = useState(null);
  // Obter página atual para a seção específica
  const currentPage = pagination[currentFilter] || 1;
  const [pageInput, setPageInput] = useState(currentPage);
  useEffect(() => {
    setPageInput(currentPage);
  }, [currentPage]);
  const applyPageInput = () => {
    const page = Math.min(Math.max(parseInt(pageInput, 10) || 1, 1), totalPages);
    setCurrentPage(page);
  };
  const janelaRef = useRef(null);
  useEffect(() => {
    const allEmpty = protocol.extractionCriteria.every(
      criterion => criterion.value === ''
    );
    setOptionExtraction(allEmpty);
  }, [protocol]);

  const getStatusField = (filter) => {
    switch (filter) {
      case 'dataprocessing': return 'dataProcessingStatus';
      case 'filter1': return 'filter1Status';
      case 'filter2': return 'filter2Status';
      case 'filter3': return 'filter3Status';
      default: return 'dataProcessingStatus';
    }
  };


  const setCurrentPage = (page) => {
    setPagination(prev => ({
      ...prev,
      [currentFilter]: page
    }));
  };


  // Artigos da seção atual (antes de busca e filtro de status)
  const sectionArticles = useMemo(() => {
    let filtered = [];

    switch (currentFilter) {
      case 'dataprocessing':
        filtered = [...articles];
        // filtered = articles.filter(a => !a.isDuplicate);
        break;
      case 'filter1':
        filtered = articles.filter(a =>
          a.dataProcessingStatus === 'included' && !a.isDuplicate && a.dataProcessingStatus !== 'duplicate'
        );
        break;
      case 'filter2':
        filtered = articles.filter(a => a.filter1Status === 'included');
        break;
      case 'filter3':
        filtered = articles.filter(a => a.filter2Status === 'included');
        break;
      default:
        filtered = [...articles];
    }

    return filtered;
  }, [articles, currentFilter]);

  // Filtrar artigos baseado na seção atual
  const filteredArticles = useMemo(() => {
    let filtered = [...sectionArticles];

    // Aplicar busca
    if (searchTerm) {
      filtered = filtered.filter(article =>
        article.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
        article.abstract.toLowerCase().includes(searchTerm.toLowerCase()) ||
        article.keywords.some(k => k.toLowerCase().includes(searchTerm.toLowerCase()))
        // article.journal.toLowerCase().includes(searchTerm.toLowerCase())
        // article.authors.toLowerCase().includes(searchTerm.toLowerCase()) 
      );
    }

    // Aplicar filtro de status
    if (statusFilter.startsWith('suggest-')) {
      const wanted = statusFilter.slice('suggest-'.length);
      filtered = filtered.filter(article => {
        const suggestion = withCurrentRules(article.aiSuggestions?.[currentFilter], protocol, currentFilter);
        if (wanted === 'none') return !suggestion;
        if (wanted === 'uncertain') return suggestion?.decision === 'uncertain' || suggestion?.decision === 'needs-text';
        return suggestion?.decision === wanted;
      });
    } else if (statusFilter !== 'all') {
      const statusField = getStatusField(currentFilter);
      filtered = filtered.filter(article => {
        const status = article[statusField];
        return status === statusFilter;
      });
    }

    // Ordenação pela relevância da sugestão (título como desempate)
    if (sortConfig.key === 'relevance') {
      const rel = (a) => relevanceOf(a.aiSuggestions?.[currentFilter]) ?? -1;
      const dir = sortConfig.direction === 'asc' ? 1 : -1;
      filtered.sort((a, b) => (rel(a) - rel(b)) * dir || a.title.toLowerCase().localeCompare(b.title.toLowerCase()));
      return filtered;
    }

    // Aplicar ordenação (score com título como desempate)
    if (sortConfig.key) {
      const sortKeys =
        sortConfig.key === 'score'
          ? ['score', 'title']
          : [sortConfig.key];

      filtered.sort((a, b) => {
        for (const key of sortKeys) {
          let aValue = a[key];
          let bValue = b[key];

          if (typeof aValue === 'string') {
            aValue = aValue.toLowerCase();
            bValue = bValue.toLowerCase();
          }

          if (aValue < bValue) {
            return sortConfig.direction === 'asc' ? -1 : 1;
          }
          if (aValue > bValue) {
            return sortConfig.direction === 'asc' ? 1 : -1;
          }
        }
        return 0;
      });
    }

    return filtered;
  }, [sectionArticles, currentFilter, searchTerm, statusFilter, sortConfig, protocol]);


  const paginatedArticles = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    return filteredArticles.slice(startIndex, startIndex + itemsPerPage);
  }, [filteredArticles, currentPage, itemsPerPage]);

  const totalPages = Math.ceil(filteredArticles.length / itemsPerPage);
  const totalArticles = filteredArticles.length
  // Resetar paginação quando os filtros mudarem
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, statusFilter]);

  const handleSort = (key) => {
    if (sortConfig.key !== key) {
      setSortConfig({ key, direction: 'asc' });
    } else if (sortConfig.direction === 'asc') {
      setSortConfig({ key, direction: 'desc' });
    } else {
      setSortConfig({ key: null, direction: 'asc' });
    }
  };

  const getDownstreamFields = (statusField) => ({
    dataProcessingStatus: ['filter1Status', 'filter2Status', 'filter3Status'],
    filter1Status: ['filter2Status', 'filter3Status'],
    filter2Status: ['filter3Status'],
  }[statusField] ?? []);

  const resetDownstream = (articleId, statusField) => {
    getDownstreamFields(statusField).forEach(field =>
      onUpdateStatus(articleId, field, null, null)
    );
  };

  const handleInclude = (article, criterion = null, source = 'user') => {
    onUpdateStatus(article.id, getStatusField(currentFilter), 'included', criterion, source);
    setShowCriterionModal(null);
  };

  const handleExclude = (article, criterion = null, source = 'user') => {
    const statusField = getStatusField(currentFilter);
    onUpdateStatus(article.id, statusField, 'excluded', criterion, source);
    resetDownstream(article.id, statusField);
    setShowCriterionModal(null);
  };

  const handleExtraction = (article, criterion = null) => {
    onUpdateStatus(article.id, getStatusField(currentFilter), 'extracted', criterion);
    setShowCriterionModal(null);
  };

  const handleDuplicate = (article, criterion = null) => {
    const statusField = getStatusField(currentFilter);
    onUpdateStatus(article.id, statusField, 'duplicate', criterion);
    resetDownstream(article.id, statusField);
    setShowCriterionModal(null);
  };

  const handleContextMenu = (e, article) => {
    e.preventDefault();

    // Não mostrar menu de contexto na seção de tratamento de dados
    if (currentFilter === 'dataprocessing') {
      return;
    }

    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      article: article
    });
  };

  const handleContextMenuAction = (action, criterion, article) => {
    if (action === 'include') {
      handleInclude(article, criterion);
    } else if (action === 'exclude') {
      handleExclude(article, criterion);
    } else if (action === 'accept') {
      acceptSuggestion(article);
    }
    setContextMenu(null);
  };

  // ── Triagem assistida ──────────────────────────────────────────────────────
  // Sugestão do filtro atual, com a decisão recalculada pelas regras vigentes
  const currentSuggestion = (article) =>
    withCurrentRules(article?.aiSuggestions?.[assistStage] ?? null, protocol, assistStage);

  const suggestionIsStale = (article) =>
    isSuggestionStale(currentSuggestion(article), protocol, assistStage, null);

  const canAcceptSuggestion = (article) => {
    const suggestion = currentSuggestion(article);
    return assistEnabled && !!suggestion && !suggestionIsStale(article) &&
      (suggestion.decision === 'included' || suggestion.decision === 'excluded');
  };

  const acceptSuggestion = (article, source = 'jev-accepted') => {
    const suggestion = currentSuggestion(article);
    if (!suggestion) return;
    if (suggestion.decision === 'included') handleInclude(article, suggestion.criteria, source);
    else if (suggestion.decision === 'excluded') handleExclude(article, suggestion.criteria, source);
  };

  const evaluateOne = async (article) => {
    if (!assistEnabled || !article) return;
    setEvaluatingId(article.id);
    setEvaluationError(null);
    try {
      const fullText = assistStage === 'filter1' ? null : await getArticleFullText(article);
      const { suggestion, usage } = await evaluateArticle({
        article,
        protocol,
        stage: assistStage,
        settings: assistSettings,
        fullText,
      });
      onSetSuggestions(assistStage, [{ id: article.id, suggestion }]);
      if (usage) onAddUsage({ inputTokens: usage.input_tokens ?? 0, requests: 1 });
    } catch (error) {
      setEvaluationError(jevErrorMessage(t, error));
    } finally {
      setEvaluatingId(null);
    }
  };

  const pendingInSection = useMemo(() => {
    if (!assistStage) return [];
    const statusField = getStatusField(assistStage);
    return sectionArticles.filter(a => a[statusField] === 'pending');
  }, [sectionArticles, assistStage]);

  const applyPreview = useMemo(() => {
    if (!assistEnabled) return null;
    const suggestionOf = (a) => withCurrentRules(a.aiSuggestions?.[assistStage] ?? null, protocol, assistStage);
    const applicable = pendingInSection.filter(a => {
      const suggestion = suggestionOf(a);
      return !isSuggestionStale(suggestion, protocol, assistStage, null) &&
        isAutoApplicable(suggestion, protocol, assistStage);
    });
    const include = applicable.filter(a => suggestionOf(a).decision === 'included').length;
    return {
      applicable,
      include,
      exclude: applicable.length - include,
      remaining: pendingInSection.length - applicable.length,
    };
  }, [assistEnabled, pendingInSection, protocol, assistStage]);

  const applySuggestions = () => {
    applyPreview?.applicable.forEach(article => acceptSuggestion(article, 'jev-auto'));
    setShowApplyModal(false);
  };

  // Limpa o erro da avaliação individual ao trocar de artigo
  useEffect(() => {
    setEvaluationError(null);
  }, [selectedArticle?.id]);

  // Fechar menu de contexto ao clicar fora
  useEffect(() => {
    const handleClickOutside = () => {
      setContextMenu(null);
    };

    const handleScroll = () => {
      setContextMenu(null);
    };

    if (contextMenu) {
      document.addEventListener('click', handleClickOutside);
      document.addEventListener('scroll', handleScroll, true); // true para capturar em qualquer elemento
      window.addEventListener('scroll', handleScroll);

      return () => {
        document.removeEventListener('click', handleClickOutside);
        document.removeEventListener('scroll', handleScroll, true);
        window.removeEventListener('scroll', handleScroll);
      };
    }
  }, [contextMenu]);

  const getSectionTitle = () => {
    switch (currentFilter) {
      case 'dataprocessing': return t('articles.titleProcessing');
      case 'filter1': return t('articles.titleFilter1');
      case 'filter2': return t('articles.titleFilter2');
      case 'filter3': return t('articles.titleFilter3');
      case 'statistics': return t('articles.titleStatistics');
      default: return t('articles.titleDefault');
    }
  };

  const getCurrentArticle = (article) => {
    setSelectedArticle(article)
    const index = filteredArticles.findIndex(a => a === article);
    if (index !== -1) {
      setCurrentArticle(index);
    }
  }

  useEffect(() => {
    setSelectedArticle(filteredArticles[currentArticle]);
  }, [currentArticle]);

  useEffect(() => {
    if (selectedArticle !== null) {
      if (janelaRef.current) {
        janelaRef.current.scrollTo({
          top: 0,
        });
      }
    }
  }, [currentArticle]);

  useEffect(() => {
    if (selectedArticle !== null) {
      setSelectedArticle(filteredArticles[currentArticle])
    }
  }, [articles]);

  useEffect(() => {
    const scores = articles.map(article => article.score);
    const maxScore = Math.max(...scores);
    const minScore = Math.min(...scores);
    setInterval(maxScore - minScore);
  }, [articles]);

  useEffect(() => {
    const tempCriterias = []
    protocol.inclusionCriteria.filter(c => c.value.trim()).map((criteria) => {
      tempCriterias.push({ id: criteria.id, label: criteria.value, category: 'inclusion' })
    })
    protocol.exclusionCriteria.filter(c => c.value.trim()).map((criteria) => {
      tempCriterias.push({ id: criteria.id, label: criteria.value, category: 'exclusion' })
    })
    protocol.qualityCriteria.filter(c => c.value.trim()).map((criteria) => {
      tempCriterias.push({ id: criteria.id, label: criteria.value, category: 'quality' })
    })
    setCriterias(tempCriterias)
  }, [protocol]);

  const quadrants = (quadrant, score) => {
    const ver = score > quadrant * (interval / 10) ? true : false;
    return ver;
  };

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg overflow-hidden transition-colors duration-200">
      <div className="p-6 border-b border-gray-200 dark:border-gray-700">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-base sm:text-xl font-semibold text-gray-800 dark:text-white">
            {t('articles.title', {
              status: statusFilter === "pending" ? t('articles.statusPending') : statusFilter === "included" ? t('articles.statusIncluded') : statusFilter === "excluded" ? t('articles.statusExcluded') : statusFilter === "duplicate" ? t('articles.statusDuplicate') : '',
              section: getSectionTitle(),
              count: filteredArticles.length
            })}
          </h3>
        </div>

        {/* Barra de busca e filtros */}
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="flex-1">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
              <input
                type="text"
                placeholder={t('articles.searchPlaceholder')}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-indigo-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          </div>

          <div className="min-w-[180px]">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-indigo-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
            >
              <option value="all">{t('articles.allStatus')}</option>
              <option value="pending">{t('articles.pending')}</option>
              <option value="included">{t('articles.included')}</option>
              <option value="excluded">{t('articles.excluded')}</option>
              <option value="duplicate">{t('articles.duplicates')}</option>
              {assistEnabled && (
                <>
                  <option value="suggest-included">{t('assist.filterSuggestInclude')}</option>
                  <option value="suggest-excluded">{t('assist.filterSuggestExclude')}</option>
                  <option value="suggest-uncertain">{t('assist.filterSuggestUncertain')}</option>
                  <option value="suggest-none">{t('assist.filterNoSuggestion')}</option>
                </>
              )}
            </select>
          </div>

          {assistEnabled && (
            <div className="flex gap-2">
              <button
                onClick={() => setBatchSnapshot(pendingInSection)}
                className="flex items-center justify-center gap-1.5 px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors duration-200 whitespace-nowrap"
                title={t('assist.evaluatePendingTitle')}
              >
                <ListChecks className="h-4 w-4" />
                {t('assist.evaluatePending')}
              </button>
              <button
                onClick={() => setShowApplyModal(true)}
                disabled={!applyPreview || applyPreview.applicable.length === 0}
                className="flex items-center justify-center gap-1.5 px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors duration-200 whitespace-nowrap"
                title={t('assist.applySuggestionsTitle')}
              >
                <Check className="h-4 w-4" />
                {t('assist.applySuggestions')}
                {applyPreview?.applicable.length > 0 && ` (${applyPreview.applicable.length})`}
              </button>
            </div>
          )}
        </div>

      </div>

      <div className="overflow-x-auto ">
        <table className="w-full ">
          <thead className="bg-gray-50 dark:bg-gray-900">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                <button
                  onClick={() => handleSort('title')}
                  className={`flex items-center gap-1 ${sortConfig.key === 'title'
                    ? 'text-indigo-600 dark:text-indigo-400 font-semibold'
                    : 'hover:text-gray-700 dark:hover:text-gray-200'}`}
                >
                  {t('articles.colTitle')}
                  {sortConfig.key === 'title'
                    ? (sortConfig.direction === 'asc'
                      ? <ArrowUp className="h-3 w-3" />
                      : <ArrowDown className="h-3 w-3" />)
                    : <ArrowUpDown className="h-3 w-3" />}
                </button>
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                <button
                  onClick={() => handleSort('source')}
                  className={`flex items-center gap-1 ${sortConfig.key === 'source'
                    ? 'text-indigo-600 dark:text-indigo-400 font-semibold'
                    : 'hover:text-gray-700 dark:hover:text-gray-200'}`}
                >
                  {t('articles.colSource')}
                  {sortConfig.key === 'source'
                    ? (sortConfig.direction === 'asc'
                      ? <ArrowUp className="h-3 w-3" />
                      : <ArrowDown className="h-3 w-3" />)
                    : <ArrowUpDown className="h-3 w-3" />}
                </button>
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                <button
                  onClick={() => handleSort('year')}
                  className={`flex items-center gap-1 ${sortConfig.key === 'year'
                    ? 'text-indigo-600 dark:text-indigo-400 font-semibold'
                    : 'hover:text-gray-700 dark:hover:text-gray-200'}`}
                >
                  {t('articles.colYear')}
                  {sortConfig.key === 'year'
                    ? (sortConfig.direction === 'asc'
                      ? <ArrowUp className="h-3 w-3" />
                      : <ArrowDown className="h-3 w-3" />)
                    : <ArrowUpDown className="h-3 w-3" />}
                </button>
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                <button
                  onClick={() => handleSort('score')}
                  className={`flex items-center gap-1 ${sortConfig.key === 'score'
                    ? 'text-indigo-600 dark:text-indigo-400 font-semibold'
                    : 'hover:text-gray-700 dark:hover:text-gray-200'}`}
                >
                  {t('articles.colScore')}
                  {sortConfig.key === 'score'
                    ? (sortConfig.direction === 'asc'
                      ? <ArrowUp className="h-3 w-3" />
                      : <ArrowDown className="h-3 w-3" />)
                    : <ArrowUpDown className="h-3 w-3" />}
                </button>
              </th>
              {assistEnabled && (
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                  <button
                    onClick={() => handleSort('relevance')}
                    className={`flex items-center gap-1 ${sortConfig.key === 'relevance'
                      ? 'text-indigo-600 dark:text-indigo-400 font-semibold'
                      : 'hover:text-gray-700 dark:hover:text-gray-200'}`}
                    title={t('assist.relevanceTitle')}
                  >
                    {t('assist.colRelevance')}
                    {sortConfig.key === 'relevance'
                      ? (sortConfig.direction === 'asc'
                        ? <ArrowUp className="h-3 w-3" />
                        : <ArrowDown className="h-3 w-3" />)
                      : <ArrowUpDown className="h-3 w-3" />}
                  </button>
                </th>
              )}
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">{t('articles.colStatus')}</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">{t('articles.colActions')}</th>
            </tr>
          </thead>
          <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
            {paginatedArticles.map((article, rowIndex) => {
              const statusField = getStatusField(currentFilter);
              const status = article[statusField];

              return (

                <tr
                  key={article.id}
                  className="hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors duration-200"
                  onContextMenu={(e) => handleContextMenu(e, article)}
                >
                  <td className="px-6 py-4 max-w-80">
                    <div className="max-w-md"
                      title={article.abstract}
                    >

                      <div className="text-sm font-medium text-gray-900 dark:text-white break-words">
                        {article.title}
                      </div>

                      <div className="text-xs text-gray-500 dark:text-gray-400 truncate">
                        {article.authors}
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-500 dark:text-gray-400 ">
                    <span className={`px-2 py-1 rounded-full text-xs ${article.source === 'Scopus' ? 'bg-orange-100 dark:bg-orange-900/50 text-orange-800 dark:text-orange-300' :
                      article.source === 'Web of Science' ? 'bg-violet-100 dark:bg-violet-900/50 text-violet-800 dark:text-violet-300' :
                        article.source === 'PubMed' ? 'bg-sky-100 dark:bg-sky-900/50 text-sky-800 dark:text-sky-300' :
                          article.source === 'ScienceDirect' ? 'bg-orange-100 dark:bg-orange-900/50 text-orange-800 dark:text-orange-300' :
                            'bg-gray-100 dark:bg-gray-900/50 text-gray-800 dark:text-gray-300'
                      }`}>
                      {article.source}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-500 dark:text-gray-400 ">
                    {article.year}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-500 dark:text-gray-400 ">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${quadrants(8, article.score || 0) ? 'bg-blue-100 dark:bg-blue-900/50 text-blue-800 dark:text-blue-300' :
                      quadrants(5, article.score || 0) ? 'bg-green-100 dark:bg-green-900/50 text-green-800 dark:text-green-300' :
                        quadrants(2, article.score || 0) ? 'bg-yellow-100 dark:bg-yellow-900/50 text-yellow-800 dark:text-yellow-300' :
                          'bg-gray-100 dark:bg-gray-900/50 text-gray-600 dark:text-gray-400'
                      }`}>
                      {article.score === null ? '-' : article.score}
                    </span>
                  </td>
                  {assistEnabled && (
                    <td className="px-6 py-4 text-sm text-gray-500 dark:text-gray-400 tabular-nums">
                      {relevanceOf(currentSuggestion(article)) === null
                        ? '–'
                        : Math.round(relevanceOf(currentSuggestion(article)) * 100)}
                    </td>
                  )}
                  <td className="px-6 py-4 ">
                    <div className="flex items-center gap-1.5">
                    <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${status === 'included' ? 'bg-green-100 dark:bg-green-900/50 text-green-800 dark:text-green-300' :
                      status === 'excluded' ? 'bg-red-100 dark:bg-red-900/50 text-red-800 dark:text-red-300' :
                        status === 'duplicate' ? 'bg-orange-100 dark:bg-orange-900/50 text-orange-800 dark:text-orange-300' :
                          'bg-yellow-100 dark:bg-yellow-900/50 text-yellow-800 dark:text-yellow-300'
                      }`}>
                      {status === 'included' ? t('articles.statusIncluded') :
                        status === 'excluded' ? t('articles.statusExcluded') :
                          status === 'duplicate' ? t('articles.statusDuplicate') :
                            t('articles.statusPending')}
                    </span>
                    {assistEnabled && (
                      <SuggestionBadge suggestion={currentSuggestion(article)} stale={suggestionIsStale(article)} />
                    )}
                    </div>
                  </td>
                  <td className="px-1 py-4 text-sm font-medium">
                    <div className="flex gap-1 w-fit" data-tour={rowIndex === 0 ? 'article-actions' : undefined}>
                      <button
                        onClick={() => {
                          if (currentFilter === 'dataprocessing') {
                            // incluir direto no filtro 1 sem abrir modal
                            handleInclude(article);
                          } else {
                            setShowCriterionModal({ type: 'include', article });
                          }
                        }}
                        className="text-green-600 dark:text-green-400 hover:text-green-900 dark:hover:text-green-300 p-1 transition-colors duration-200"
                        data-tour={rowIndex === 0 ? 'action-include' : undefined}
                        title={t('articles.includeTitle')}
                      >
                        <CheckCircle size={16} />
                      </button>

                      <button
                        onClick={() => {
                          if (currentFilter === 'dataprocessing') {
                            // incluir direto no filtro 1 sem abrir modal
                            handleExclude(article);
                          } else {
                            setShowCriterionModal({ type: 'exclude', article });
                          }
                        }}
                        className="text-red-600 dark:text-red-400 hover:text-red-900 dark:hover:text-red-300 p-1 transition-colors duration-200"
                        data-tour={rowIndex === 0 ? 'action-exclude' : undefined}
                        title={t('articles.excludeTitle')}
                      >
                        <XCircle size={16} />
                      </button>
                      <button
                        onClick={() => { handleDuplicate(article) }}
                        className="text-red-600 dark:text-red-400 hover:text-red-900 dark:hover:text-red-300 p-1 transition-colors duration-200"

                        data-tour={rowIndex === 0 ? 'action-duplicate' : undefined}
                        title={t('articles.duplicateTitle')}
                      >
                        <BookCopy size={16} />
                      </button>

                      <button
                        onClick={() => getCurrentArticle(article)}
                        className="text-indigo-600 dark:text-indigo-400 hover:text-indigo-900 dark:hover:text-indigo-300 p-1 transition-colors duration-200"
                        data-tour={rowIndex === 0 ? 'action-details' : undefined}
                        title={t('articles.viewDetails')}
                      >
                        <Eye size={16} />
                      </button>

                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Paginação */}
      {totalPages > 1 && (
        <div className="px-6 py-3 border-t border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between">
            <div className="text-sm text-gray-700 dark:text-gray-300">
              {t('articles.page', { current: currentPage, total: totalPages, count: filteredArticles.length })}
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                disabled={currentPage === 1}
                className="px-3 py-1 border border-gray-300 dark:border-gray-600 rounded disabled:opacity-50 hover:bg-gray-100 dark:hover:bg-gray-700 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 transition-colors duration-200"
              >
                {t('articles.previous')}
              </button>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={1}
                  max={totalPages}
                  value={pageInput}
                  onChange={(e) => setPageInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      applyPageInput();
                    }
                  }}
                  onBlur={applyPageInput}
                  className="[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none w-16 px-2 py-1 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-indigo-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm text-center"
                  title={t('articles.pageJump')}
                />
                <span className="text-sm text-gray-700 dark:text-gray-300">
                  / {totalPages}
                </span>
              </div>
              <button
                onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
                disabled={currentPage === totalPages}
                className="px-3 py-1 border border-gray-300 dark:border-gray-600 rounded disabled:opacity-50 hover:bg-gray-100 dark:hover:bg-gray-700 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 transition-colors duration-200"
              >
                {t('articles.next')}
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Modal para seleção de critério */}

      <MultiSelect
        isOpen={showCriterionModal !== null}
        onClose={() => setShowCriterionModal(null)}
        options={criterias}
        onSelect={(criterion, status) => {
          if (status === 'included') {
            handleInclude(showCriterionModal.article, criterion);
          } else if (status === 'excluded') {
            handleExclude(showCriterionModal.article, criterion);
          } else if (status === 'extracted') {
            handleExtraction(showCriterionModal.article, criterion);
          }
        }}
        criteria={showCriterionModal?.type === 'include' ? protocol.inclusionCriteria : showCriterionModal?.type === 'exclude' ? protocol.exclusionCriteria : protocol.extractionCriteria}
        type={showCriterionModal?.type === 'include' ? 'inclusion' : showCriterionModal?.type === 'exclude' ? 'exclusion' : 'extraction'}
        initialSelected={(() => {
          const article = showCriterionModal?.article;
          const selected = [
            ...(article?.inclusionCriterion ?? []),
            ...(article?.exclusionCriterion ?? []),
            ...(article?.qualityCriteria ?? []),
          ];
          // Sem critérios marcados: pré-seleciona os da sugestão correspondente
          const suggestion = canAcceptSuggestion(article) ? currentSuggestion(article) : null;
          const matches = suggestion && (
            (showCriterionModal?.type === 'include' && suggestion.decision === 'included') ||
            (showCriterionModal?.type === 'exclude' && suggestion.decision === 'excluded')
          );
          return selected.length === 0 && matches ? suggestion.criteria : selected;
        })()}
        initialValues={showCriterionModal?.article.extractionCriteria ?? []}
      />
      {/* Modal de detalhes */}
      {selectedArticle && (
        <ArticleModal
          article={selectedArticle}
          onClose={() => setSelectedArticle(null)}
          currentFilter={currentFilter}
          getStatusField={getStatusField}
          currentArticle={currentArticle}
          totalArticles={totalArticles}
          setCurrentArticle={setCurrentArticle}
          handleInclude={handleInclude}
          handleExclude={handleExclude}
          handleDuplicate={handleDuplicate}
          setShowCriterionModal={setShowCriterionModal}
          optionExtraction={optionExtraction}
          janelaRef={janelaRef}
          assist={assistEnabled ? {
            suggestion: currentSuggestion(selectedArticle),
            stale: suggestionIsStale(selectedArticle),
            criteria: criterias,
            evaluating: evaluatingId === selectedArticle.id,
            error: evaluationError,
            onEvaluate: () => evaluateOne(selectedArticle),
            onAccept: () => acceptSuggestion(selectedArticle),
          } : null}
        />
      )}

      {batchSnapshot && (
        <JevBatchModal
          stage={assistStage}
          sectionTitle={getSectionTitle()}
          articles={batchSnapshot}
          protocol={protocol}
          settings={assistSettings}
          getFullText={getArticleFullText}
          onResults={onSetSuggestions}
          onUsage={onAddUsage}
          onClose={() => setBatchSnapshot(null)}
        />
      )}

      {showApplyModal && applyPreview && (
        <JevApplyModal
          sectionTitle={getSectionTitle()}
          rule={autoRuleSummary(protocol, assistStage)}
          preview={applyPreview}
          onConfirm={applySuggestions}
          onClose={() => setShowApplyModal(false)}
        />
      )}

      {/* Menu de contexto */}
      {contextMenu && (
        <div
          className="fixed bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg shadow-lg py-2 z-50 min-w-[120px]"
          style={{
            left: Math.min(contextMenu.x, window.innerWidth - 130),
            top: Math.min(contextMenu.y, window.innerHeight - 120)
          }}
        >
          {canAcceptSuggestion(contextMenu.article) && (
            <>
              <button
                onClick={() => handleContextMenuAction('accept', null, contextMenu.article)}
                className="w-full px-3 py-2 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors duration-150 flex items-center"
                title={suggestionTooltip(t, currentSuggestion(contextMenu.article), false)}
              >
                <ListChecks className="h-4 w-4 text-indigo-600 dark:text-indigo-400 mr-2" />
                <span>{t('assist.accept')}</span>
              </button>
              <div className="border-t border-gray-200 dark:border-gray-600 my-1"></div>
            </>
          )}

          {/* Opção Incluir com submenu */}
          <div className="relative group">
            <div className="px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-green-50 dark:hover:bg-green-900/30 transition-colors duration-150 cursor-pointer flex items-center justify-between">
              <div className="flex items-center">
                <CheckCircle className="h-4 w-4 text-green-600 dark:text-green-400 mr-2" />
                <span>{t('articles.includeTitle')}</span>
              </div>
              <ChevronDown className="h-3 w-3 text-gray-400 transform -rotate-90" />
            </div>

            {/* Submenu de critérios de inclusão */}
            <div
              className={`absolute bottom-0 ml-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg shadow-lg py-2 min-w-[200px] max-w-[250px] max-h-[300px] overflow-y-auto opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-50 ${contextMenu.x > window.innerWidth - 350 ? 'right-full mr-1 ml-0' : 'left-full'
                }`}
            >
              <div className="px-3 py-1 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase border-b border-gray-200 dark:border-gray-600 mb-1 sticky top-0 bg-white dark:bg-gray-800">
                {t('articles.inclusionCriteriaMenu')}
              </div>
              {protocol.inclusionCriteria.filter(c => c.value.trim()).map((criterion, index) => (
                <button
                  key={`inc-${index}`}
                  onClick={() => handleContextMenuAction('include', { id: criterion.id, label: criterion.value, category: 'inclusion' }, contextMenu.article)}
                  className="w-full px-3 py-2 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-green-50 dark:hover:bg-green-900/30 transition-colors duration-150"
                  title={criterion.value}
                >
                  <span className="block truncate">
                    {criterion.value.length > 35 ? criterion.value.substring(0, 35) + '...' : criterion.value}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Separador */}
          <div className="border-t border-gray-200 dark:border-gray-600 my-1"></div>

          {/* Opção Excluir com submenu */}
          <div className="relative group">
            <div className="px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-red-50 dark:hover:bg-red-900/30 transition-colors duration-150 cursor-pointer flex items-center justify-between">
              <div className="flex items-center">
                <XCircle className="h-4 w-4 text-red-600 dark:text-red-400 mr-2" />
                <span>{t('articles.excludeTitle')}</span>
              </div>
              <ChevronDown className="h-3 w-3 text-gray-400 transform -rotate-90" />
            </div>

            {/* Submenu de critérios de exclusão */}
            <div
              className={`absolute bottom-0 ml-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg shadow-lg py-2 min-w-[200px] max-w-[250px] max-h-[300px] overflow-y-auto opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-50 ${contextMenu.x > window.innerWidth - 350 ? 'right-full mr-1 ml-0' : 'left-full'
                }`}
            >
              <div className="px-3 py-1 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase border-b border-gray-200 dark:border-gray-600 mb-1 sticky top-0 bg-white dark:bg-gray-800">
                {t('articles.exclusionCriteriaMenu')}
              </div>
              {protocol.exclusionCriteria.filter(c => c.value.trim()).map((criterion, index) => (
                <button
                  key={`exc-${index}`}
                  onClick={() => handleContextMenuAction('exclude', { id: criterion.id, label: criterion.value, category: 'exclusion' }, contextMenu.article)}
                  className="w-full px-3 py-2 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-red-50 dark:hover:bg-red-900/30 transition-colors duration-150"
                  title={criterion.value}
                >
                  <span className="block truncate">
                    {criterion.value.length > 35 ? criterion.value.substring(0, 35) + '...' : criterion.value}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}


    </div>
  );
};

const STATUS_FIELD_STAGE = {
  filter1Status: 'filter1',
  filter2Status: 'filter2',
  filter3Status: 'filter3',
};

// Componente principal
const SystematicReviewTool = () => {
  const { t } = useTranslation();
  const [articles, setArticles] = useState([]);
  const [numStringSc, setNumStringSc] = useState(0);
  const [loading, setLoading] = useState(false);
  const [currentSection, setCurrentSection] = useState('protocol');
  const { theme, toggleTheme } = useTheme();
  const [importedData, setImportedData] = useState([]);


  // Estado do protocolo
  const [protocol, setProtocol] = useState({
    title: '',
    researchQuestion: '',
    yearRange: { start: 2015, end: new Date().getFullYear() },
    languages: ['English'],
    keywords: [''],
    inclusionCriteria: [{ id: 'I1', value: '' }],
    exclusionCriteria: [{ id: 'E1', value: '' }],
    extractionCriteria: [{ id: 'EX1', value: '', type: 'text', items: [''] }],
    qualityCriteria: [{ id: 'Q1', value: '' }],
    databases: ['Scopus', 'Web of Science'],
    scoringSystem: {
      enabled: true,
      weights: {
        title: 8,      // Peso para keywords no título
        abstract: 3,   // Peso para keywords no resumo
        keywords: 10    // Peso para keywords nas palavras-chave
      },
      caseInsensitive: true,
      exactMatch: true, // false = busca parcial, true = palavra completa
      multipleOccurrences: true // contar múltiplas ocorrências da mesma keyword
    }
  });

  // Estado de salvamento
  const [autoSaveInterval, setAutoSaveInterval] = useState(null);
  const [lastSaved, setLastSaved] = useState(null);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [showFileMenu, setShowFileMenu] = useState(false);
  const fileOpenedAtRef = useRef(Date.now());
  const isRestoringRef = useRef(false);
  const RECALCULATE_DEBOUNCE_MS = 500;

  const [warnAfterMin, setWarnAfterMin] = useState(10);
  const [showReminderSettings, setShowReminderSettings] = useState(false);

  const [autoSaveEnabled, setAutoSaveEnabled] = useState(false);
  const autoSaveHandleRef = useRef(null);
  const [showAutoSaveOffer, setShowAutoSaveOffer] = useState(false);
  const autoSaveOfferShownRef = useRef(false);
  const fileInputRef = useRef(null);

  // Guia de primeiros passos: o tour abre sozinho na primeira visita e, ao terminar,
  // dá lugar ao checklist, que o botão do cabeçalho mostra ou oculta
  const [showChecklist, setShowChecklist] = useState(() => hasSeenTour() && !isChecklistHidden());
  const [articleDetailsOpen, setArticleDetailsOpen] = useState(false);
  // Durante o tour o checklist fica recolhido, exceto no passo que o apresenta
  const [tourStage, setTourStage] = useState(null); // null | 'running' | 'checklist'

  const [showSupport, setShowSupport] = useState(false);
  const [showSupportRequest, setShowSupportRequest] = useState(false);
  const supportInteractedRef = useRef(false);
  const supportFirstSaveDoneRef = useRef(false);
  const pendingSupportRequestRef = useRef(false);
  const SUPPORT_REQUEST_INTERVAL_MS = 60 * 60 * 1000; // 1h

  const [alertMessage, setAlertMessage] = useState(null);

  // Triagem assistida (Jev): configurações locais da máquina
  const [jevSettings, setJevSettings] = useState(loadJevSettings);
  const [showJevSettings, setShowJevSettings] = useState(false);

  // Auto-save setup
  useEffect(() => {
    const getState = () => ({
      protocol,
      articles,
      currentSection,
      importedData
    });

    const interval = setupAutoSave(getState, 5);
    setAutoSaveInterval(interval);

    const autoSaveResult = loadAutoSave();
    if (autoSaveResult.success && autoSaveResult.data.articles?.length > 0) {
      const shouldRestore = window.confirm(
        t('messages.restoreBackup', { date: new Date(autoSaveResult.data.metadata?.autoSavedAt || Date.now()).toLocaleString() })
      );

      if (shouldRestore) {
        restoreState(autoSaveResult.data);
      }
    }

    return () => {
      if (interval) {
        clearInterval(interval);
      }
    };
  }, []);

  // O reload recomeça do zero: limpa qualquer handle/preferência de auto-save persistidos
  useEffect(() => {
    clearFileHandle();
    localStorage.removeItem('sysreview-auto-save');
  }, []);

  // Detectar mudanças
  const prevDataRef = useRef(null);

  useEffect(() => {
    const current = { articles, protocol, currentSection, importedData };

    // Ignora o render inicial (também o double-mount do StrictMode)
    if (prevDataRef.current === null) {
      prevDataRef.current = current;
      return;
    }

    const { articles: pA, protocol: pP, currentSection: pS, importedData: pI } = prevDataRef.current;
    prevDataRef.current = current;

    // Re-render sem mudança de dados (ex: double-mount do StrictMode)
    if (pA === articles && pP === protocol && pS === currentSection && pI === importedData) {
      return;
    }

    // Mudanças vindas de carregar/abrir/novo projeto não contam como não salvas
    if (isRestoringRef.current) {
      isRestoringRef.current = false;
      return;
    }

    setHasUnsavedChanges(true);
  }, [articles, protocol, currentSection, importedData]);

  // Warning antes de fechar
  useEffect(() => {
    const handleBeforeUnload = (e) => {
      if (hasUnsavedChanges) {
        e.preventDefault();
        e.returnValue = '';
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [hasUnsavedChanges]);

  const statistics = useMemo(() => {

    const importSection = {};
    importedData.forEach(data => {

      importSection['unique' + data.id] = articles.filter(
        a => a.idData === data.id && !a.isDuplicate
      ).length;
      importSection['duplicate' + data.id] = articles.filter(
        a => a.idData === data.id && a.isDuplicate
      ).length;
    });

    const dataProcessing = {
      pending: articles.filter(a => a.dataProcessingStatus === 'pending' && !a.isDuplicate).length,
      included: articles.filter(a => a.dataProcessingStatus === 'included' && !a.isDuplicate).length,
      excluded: articles.filter(a => a.dataProcessingStatus === 'excluded').length,
      duplicate: articles.filter(a => a.dataProcessingStatus === 'duplicate' || a.isDuplicate).length
    };

    const filter1 = {
      pending: articles.filter(a =>
        a.dataProcessingStatus === 'included' &&
        !a.isDuplicate &&
        a.filter1Status === 'pending'
      ).length,
      included: articles.filter(a => a.filter1Status === 'included').length,
      excluded: articles.filter(a =>
        a.dataProcessingStatus === 'included' &&
        !a.isDuplicate &&
        a.filter1Status === 'excluded'
      ).length
    };

    const filter2 = {
      pending: articles.filter(a => a.filter1Status === 'included' && a.filter2Status === 'pending').length,
      included: articles.filter(a => a.filter2Status === 'included').length,
      excluded: articles.filter(a => a.filter1Status === 'included' && a.filter2Status === 'excluded').length
    };

    const filter3 = {
      pending: articles.filter(a => a.filter2Status === 'included' && a.filter3Status === 'pending').length,
      included: articles.filter(a => a.filter3Status === 'included').length,
      excluded: articles.filter(a => a.filter2Status === 'included' && a.filter3Status === 'excluded').length
    };

    return { importSection, dataProcessing, filter1, filter2, filter3 };
  }, [articles, importedData]);

  // Protocolo completo: título, pergunta, palavras-chave, bases e critérios de
  // inclusão, exclusão e qualidade com texto (usado no painel e no checklist)
  const protocolReady = useMemo(() => {
    const filled = (list) => (list ?? []).some(c => c.value?.trim());
    return !!protocol.title
      && !!protocol.researchQuestion
      && (protocol.keywords ?? []).some(k => k.trim())
      && filled(protocol.inclusionCriteria)
      && filled(protocol.exclusionCriteria)
      && filled(protocol.qualityCriteria)
      && protocol.databases.length > 0;
  }, [protocol]);

  const checklistItems = useMemo(
    () => buildChecklistItems({ protocolReady, articles, statistics, lastSaved }),
    [protocolReady, articles, statistics, lastSaved]
  );

  const showGuideChecklist = useCallback(() => {
    setShowChecklist(true);
    setChecklistHidden(false);
  }, []);

  const { startTour, showActions } = useGuidedTour({
    currentSection,
    setCurrentSection,
    hasArticles: articles.length > 0,
    onStart: () => setTourStage('running'),
    onBeforeChecklist: () => {
      setTourStage('checklist');
      showGuideChecklist();
    },
    onFinish: () => {
      setTourStage(null);
      showGuideChecklist();
    },
  });

  // Primeira visita: inicia o tour depois que a interface foi montada
  useEffect(() => {
    if (hasSeenTour()) return;
    const timer = setTimeout(startTour, 400);
    return () => clearTimeout(timer);
  }, [startTour]);

  // Salvamento automático com debounce (só quando há alterações não salvas)
  useEffect(() => {
    if (!autoSaveEnabled || !autoSaveHandleRef.current || !hasUnsavedChanges) return;

    const timeout = setTimeout(async () => {
      if (isRestoringRef.current) {
        isRestoringRef.current = false;
        return;
      }
      const state = { protocol, articles, statistics, currentSection, importedData, warnAfterMin };
      const result = await autoSaveToFile(state, autoSaveHandleRef.current);
      if (result.success) {
        setLastSaved(new Date());
        setHasUnsavedChanges(false);
        clearAutoSave();
      } else {
        setAutoSaveEnabled(false);
        localStorage.removeItem('sysreview-auto-save');
        autoSaveHandleRef.current = null;
        clearFileHandle();
        setAlertMessage({ type: 'error', title: t('modals.alert.errorTitle'), message: t('autosave.error', { error: result.error }) });
      }
    }, 4000);

    return () => clearTimeout(timeout);
  }, [autoSaveEnabled, hasUnsavedChanges, articles, protocol, currentSection, importedData, statistics, warnAfterMin]);

  // Flush do auto-save ao ocultar/sair da página
  useEffect(() => {
    if (!autoSaveEnabled || !autoSaveHandleRef.current) return;

    const flush = () => {
      if (!autoSaveHandleRef.current) return;
      const state = { protocol, articles, statistics, currentSection, importedData, warnAfterMin };
      autoSaveToFile(state, autoSaveHandleRef.current);
    };
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') flush();
    };
    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('pagehide', flush);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [autoSaveEnabled, articles, protocol, currentSection, importedData, statistics, warnAfterMin]);

  // Fechar menu ao clicar fora
  useEffect(() => {
    const handleClickOutside = () => setShowFileMenu(false);
    if (showFileMenu) {
      document.addEventListener('click', handleClickOutside);
      return () => document.removeEventListener('click', handleClickOutside);
    }
  }, [showFileMenu]);

  // Repete o pedido de apoio em intervalos longos enquanto o app estiver aberto
  useEffect(() => {
    const interval = setInterval(() => {
      if (!supportInteractedRef.current && !showSupportRequest && !pendingSupportRequestRef.current) {
        setShowSupportRequest(true);
      }
    }, SUPPORT_REQUEST_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [showSupportRequest]);

  // Função para calcular pontuação de um artigo
  const calculateArticleScore = useCallback((article, protocolKeywords, scoringConfig) => {
    if (!protocolKeywords.length) return 0;

    let totalScore = 0;
    const { weights, caseInsensitive, exactMatch, multipleOccurrences } = scoringConfig;

    protocolKeywords.forEach(keyword => {
      if (!keyword.trim()) return;

      const searchKeyword = caseInsensitive ? keyword.toLowerCase() : keyword;
      let keywordScore = 0;

      const countOccurrences = (text, searchTerm) => {
        if (!text) return 0;

        const searchText = caseInsensitive ? text.toLowerCase() : text;

        if (exactMatch) {
          const regex = new RegExp(`\\b${searchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'g');
          const matches = searchText.match(regex);
          return matches ? matches.length : 0;
        } else {
          if (multipleOccurrences) {
            const regex = new RegExp(searchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
            const matches = searchText.match(regex);
            return matches ? matches.length : 0;
          } else {
            return searchText.includes(searchTerm) ? 1 : 0;
          }
        }
      };

      const titleCount = countOccurrences(article.title, searchKeyword);
      const abstractCount = countOccurrences(article.abstract, searchKeyword);
      const keywordsCount = countOccurrences(article.keywords?.join(' '), searchKeyword);

      if (multipleOccurrences) {
        keywordScore += titleCount * weights.title;
        keywordScore += abstractCount * weights.abstract;
        keywordScore += keywordsCount * weights.keywords;
      } else {
        keywordScore += (titleCount > 0 ? 1 : 0) * weights.title;
        keywordScore += (abstractCount > 0 ? 1 : 0) * weights.abstract;
        keywordScore += (keywordsCount > 0 ? 1 : 0) * weights.keywords;
      }

      totalScore += keywordScore;
    });

    return totalScore;
  }, []);

  // Função para remover duplicatas permanentemente
  const removeDuplicateArticles = useCallback((duplicateIds) => {
    setArticles(prev => prev.filter(article => !duplicateIds.includes(article.id)));
  }, []);

  // Disponibilizar função globalmente
  useEffect(() => {
    window.removeDuplicateArticles = removeDuplicateArticles;

    return () => {
      delete window.removeDuplicateArticles;
    };
  }, [removeDuplicateArticles]);


  // Função para recalcular todas as pontuações
  const recalculateAllScores = useCallback(() => {

    const validKeywords = protocol.keywords.filter(k => k.trim());
    if (validKeywords.length === 0) return;

    setArticles(prev => prev.map(article => ({
      ...article,
      score: calculateArticleScore(article, validKeywords, protocol.scoringSystem)
    })));
  }, [protocol.keywords, protocol.scoringSystem, calculateArticleScore]);

  // useEffect para recálculo automático de pontuações
  useEffect(() => {
    // Disponibilizar funções globalmente
    window.recalculateAllScores = recalculateAllScores;
    window.calculateArticleScore = calculateArticleScore;

    // Auto-recalcular quando keywords ou configurações mudarem
    if (articles.length > 0) {
      const timeoutId = setTimeout(() => {
        recalculateAllScores();
      }, RECALCULATE_DEBOUNCE_MS); // Debounce de 500ms

      return () => clearTimeout(timeoutId);
    }

    return () => {
      delete window.recalculateAllScores;
      delete window.calculateArticleScore;
    };
  }, [protocol.keywords, protocol.scoringSystem, articles.length, recalculateAllScores, calculateArticleScore]);

  const handleSaveResult = (result) => {
    if (!result.success) {
      setAlertMessage({ type: 'error', title: t('modals.alert.errorTitle'), message: t('messages.error', { error: result.error }) });
      return;
    }

    if (result.fileHandle) {
      autoSaveHandleRef.current = result.fileHandle;
    }

    setLastSaved(new Date());
    setHasUnsavedChanges(false);
    clearAutoSave();
    setAlertMessage({ type: 'success', title: t('modals.alert.successTitle'), message: t('messages.projectSaved', { filename: result.filename }) });

    // Primeiro salvamento do dia: exibe o pedido de apoio (após o aviso de salvamento)
    const shouldShowSupport = !supportInteractedRef.current && !supportFirstSaveDoneRef.current;
    if (shouldShowSupport) {
      supportFirstSaveDoneRef.current = true;
      pendingSupportRequestRef.current = true;
    }

    // Oferece ativação do auto-save após o primeiro salvamento deste arquivo
    const shouldShowOffer = !autoSaveEnabled && autoSaveHandleRef.current && !autoSaveOfferShownRef.current && isFileSystemAccessSupported();
    if (shouldShowOffer) {
      autoSaveOfferShownRef.current = true;
      setShowAutoSaveOffer(true);
    }
  };

  const handleSaveProject = async () => {
    const state = { protocol, articles, statistics, currentSection, importedData, warnAfterMin };
    const handle = autoSaveHandleRef.current;

    // Se já existe um handle (arquivo conhecido), grava direto sem abrir o picker
    const result = handle
      ? await autoSaveToFile(state, handle)
      : await saveProjectToFile(state);

    handleSaveResult(result);
  };

  // Salvar como: sempre abre o seletor para escolher um novo nome/arquivo
  const handleSaveAs = async () => {
    const state = { protocol, articles, statistics, currentSection, importedData, warnAfterMin };
    const result = await saveProjectToFile(state);
    handleSaveResult(result);
  };

  const handleOpenProjectFile = useCallback((file, fileHandle = null) => {
    if (!file) return;

    if (hasUnsavedChanges) {
      const shouldProceed = window.confirm(t('messages.unsavedChanges'));
      if (!shouldProceed) return;
    }

    loadProjectFromFile(file)
      .then(result => {
        if (result.success) {
          // Novo arquivo: auto-save desligado por padrão e handle trocado
          autoSaveOfferShownRef.current = false;
          autoSaveHandleRef.current = fileHandle || null;
          setAutoSaveEnabled(false);
          localStorage.removeItem('sysreview-auto-save');
          clearFileHandle();

          restoreState(result.data);
          setHasUnsavedChanges(false);
          clearAutoSave();

          const message = result.migrated
            ? t('messages.projectLoadedMigrated', { oldVersion: result.originalVersion, newVersion: result.newVersion })
            : t('messages.projectLoaded');
          setAlertMessage({ type: 'success', title: t('modals.alert.successTitle'), message });
        }
      })
      .catch(error => {
        setAlertMessage({ type: 'error', title: t('modals.alert.errorTitle'), message: t('messages.projectLoadError', { error: error.error }) });
      });
  }, [hasUnsavedChanges, t]);

  const handleLoadProject = (event) => {
    const file = event.target.files[0];
    handleOpenProjectFile(file, null);
    event.target.value = '';
  };

  const handleOpenClick = useCallback(async () => {
    if (!isFileSystemAccessSupported()) {
      fileInputRef.current?.click();
      return;
    }

    const result = await openProjectFromPicker();
    if (result.success) {
      handleOpenProjectFile(result.file, result.fileHandle);
    } else if (result.unsupported) {
      fileInputRef.current?.click();
    } else if (result.error && result.error !== 'Operação cancelada pelo usuário.') {
      setAlertMessage({ type: 'error', title: t('modals.alert.errorTitle'), message: t('messages.projectLoadError', { error: result.error }) });
    }
  }, [handleOpenProjectFile, t]);

  // ── Auto-save: ativação/desativação ───────────────────────────────────────
  const enableAutoSave = useCallback(async () => {
    const handle = autoSaveHandleRef.current;
    if (!handle) return false;

    const perm = await requestHandlePermission(handle);
    if (!perm.granted) {
      setAlertMessage({ type: 'error', title: t('modals.alert.errorTitle'), message: t('autosave.permissionDenied') });
      return false;
    }

    localStorage.setItem('sysreview-auto-save', '1');
    setAutoSaveEnabled(true);
    return true;
  }, [t]);

  const disableAutoSave = useCallback(() => {
    setAutoSaveEnabled(false);
    localStorage.removeItem('sysreview-auto-save');
  }, []);

  const toggleAutoSave = useCallback(async (enabled) => {
    if (enabled) {
      await enableAutoSave();
    } else {
      disableAutoSave();
    }
  }, [enableAutoSave, disableAutoSave]);

  const handleNewProject = () => {
    if (hasUnsavedChanges && !window.confirm(t('messages.unsavedChanges'))) {
      return;
    }

    isRestoringRef.current = true;
    setProtocol({
      title: '',
      researchQuestion: '',
      yearRange: { start: 2015, end: 2024 },
      keywords: [''],
      languages: ['English'],
      inclusionCriteria: [{ id: 'I1', value: '' }],
      exclusionCriteria: [{ id: 'E1', value: '' }],
      extractionCriteria: [{ id: 'EX1', value: '', type: 'text', items: [''] }],
      qualityCriteria: [{ id: 'Q1', value: '' }],
      databases: ['Scopus', 'Web of Science'],
      scoringSystem: {
        enabled: true,
        weights: {
          title: 8,      // Peso para keywords no título
          abstract: 3,   // Peso para keywords no resumo
          keywords: 10    // Peso para keywords nas palavras-chave
        },
        caseInsensitive: true,
        exactMatch: true, // false = busca parcial, true = palavra completa
        multipleOccurrences: true // contar múltiplas ocorrências da mesma keyword
      }
    });
    setArticles([]);
    setCurrentSection('protocol');
    setImportedData([]);
    setHasUnsavedChanges(false);
    setLastSaved(null);
    autoSaveOfferShownRef.current = false;
    autoSaveHandleRef.current = null;
    setAutoSaveEnabled(false);
    localStorage.removeItem('sysreview-auto-save');
    clearFileHandle();
    clearAutoSave();
  };

  const handleExportXLSX = async () => {

    const colorHeader = 'BFBFBF'
    const colors = ['F2F2F2', 'FFFFFF'];

    const copyProtocol = [{
      title: protocol.title,
      researchQuestion: protocol.researchQuestion,
      yearRange: `${protocol.yearRange.start} - ${protocol.yearRange.end}`,
      languages: protocol.languages.join("; "),
    }];

    const headerProtocol = {
      title: "Title",
      researchQuestion: "Research Question",
      yearRange: "Year Range",
      languages: "Languages",
    };

    protocol.inclusionCriteria.forEach((criterion, index) => {
      copyProtocol[0][`I${index + 1}`] = criterion.value || "";
      headerProtocol[`I${index + 1}`] = `Inclusion Criterion ${index + 1}`;
    });

    protocol.exclusionCriteria.forEach((criterion, index) => {
      copyProtocol[0][`E${index + 1}`] = criterion.value || "";
      headerProtocol[`E${index + 1}`] = `Exclusion Criterion ${index + 1}`;
    });

    protocol.qualityCriteria.forEach((criterion, index) => {
      copyProtocol[0][`Q${index + 1}`] = criterion.value || "";
      headerProtocol[`Q${index + 1}`] = `Quality Criterion ${index + 1}`;
    });

    protocol.extractionCriteria.forEach((criterion, index) => {
      copyProtocol[0][`EX${index + 1}`] = criterion.value || "";
      headerProtocol[`EX${index + 1}`] = `Extraction Criterion ${index + 1}`;
    });

    // Modelo e limiares da triagem assistida, para o relato da revisão
    if (articles.some(a => a.aiSuggestions && Object.keys(a.aiSuggestions).length > 0)) {
      const aiConfig = getAiConfig(protocol);
      copyProtocol[0].assistModel = aiConfig.model;
      headerProtocol.assistModel = "Screening Assistant Model";
      copyProtocol[0].assistThresholds = STAGES.map((stage, i) => {
        const rule = aiConfig.rules[stage];
        return rule.mode === 'inclusive'
          ? `F${i + 1} (inclusive): include if p(inclusion) >= ${rule.includeAt} and no exclusion >= 0.5; batch-exclude if p(exclusion) >= ${rule.excludeAt}`
          : `F${i + 1} (strict): batch-apply if p >= ${rule.applyAt}`;
      }).join("; ");
      headerProtocol.assistThresholds = "Screening Assistant Batch Rules";
    }
    const workbook = new ExcelJS.Workbook();
    const wsProtocol = workbook.addWorksheet(t("export.protocolSheet"));
    // Colunas (header + key)
    wsProtocol.columns = Object.keys(headerProtocol).map(key => ({
      header: headerProtocol[key],
      key,
      width: 30,
    }));

    // Linha de dados
    wsProtocol.addRow(copyProtocol[0]);

    const row = wsProtocol.getRow(2);

    row.eachCell({ includeEmpty: true }, cell => {
      cell.alignment = { vertical: "middle" };
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: colors[0] },
      };
      cell.border = {
        left: { style: 'thin' },
        right: { style: 'thin' }
      };
    });

    // Estilo do header
    wsProtocol.getRow(1).eachCell(cell => {
      cell.font = { bold: true };
      cell.alignment = { vertical: "middle", horizontal: "center" };
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: colorHeader },
      };
      cell.border = {
        left: { style: 'thin' },
        right: { style: 'thin' }
      };
    });


    const getArticles = (filter, status) => {
      const copyArticles = status != 'total' ? articles.filter(a => a[filter] === status) : articles

      const filterArticles = copyArticles.map(article => {
        const {
          quality,
          numString,
          duplicateOf,
          extractionCriteria,
          ...resto
        } = article;

        const extractionAttributes = article.extractionCriteria
          ? article.extractionCriteria.reduce((acc, item) => {
            acc[item.id] = item.response ?? "";
            return acc;
          }, {})
          : {};

        // Sugestões da triagem assistida e origem da decisão por filtro
        const assistAttributes = STAGES.reduce((acc, stage, i) => {
          const suggestion = withCurrentRules(article.aiSuggestions?.[stage], protocol, stage);
          const source = article.decisionSource?.[stage];
          acc[`suggestionF${i + 1}`] = suggestion
            ? `${suggestion.decision}${suggestion.criteria?.length ? ` (${suggestion.criteria.map(c => c.id).join("; ")})` : ""}`
            : "";
          const probability = suggestionProbability(suggestion);
          acc[`suggestionProbabilityF${i + 1}`] = probability === null ? "" : Math.round(probability * 1000) / 1000;
          const relevance = relevanceOf(suggestion);
          acc[`relevanceF${i + 1}`] = relevance === null ? "" : Math.round(relevance * 1000) / 1000;
          acc[`decisionSourceF${i + 1}`] = source === 'jev-auto' ? "Suggestion (batch)" : source === 'jev-accepted' ? "Suggestion (accepted)" : source === 'user' ? "Manual" : "";
          return acc;
        }, {});

        const exclusionCriterions = article.exclusionCriterion.map(a => a.id)
        const inclusionCriterions = article.inclusionCriterion.map(a => a.id)
        const qualityCriterias = article.qualityCriteria.map(a => a.id)

        return {
          ...resto,
          isDuplicate: article.isDuplicate ? "Yes" : "No",
          keywords: article.keywords ? article.keywords.join("; ") : "",
          countries: !article.countries.includes('País não informado') ? article.countries.join("; ") : "",
          inclusionCriterion: inclusionCriterions
            ? inclusionCriterions.join("; ")
            : "",
          exclusionCriterion: exclusionCriterions
            ? exclusionCriterions.join("; ")
            : "",
          qualityCriteria: qualityCriterias
            ? qualityCriterias.join("; ")
            : "",
          ...extractionAttributes,
          ...assistAttributes,
        };
      });

      return filterArticles
    }


    const headerArticlesInitial = {
      title: "Title",
      authors: "Authors",
      abstract: "Abstract",
      keywords: "Keywords",
      year: "Year",
      studyType: "Study Type",
      journal: "Journal",
      affiliations: "Affiliations",
      countries: "Countries",
      language: "Language",
      doi: "DOI",
      source: "Source",
      searchString: "Search String",
      score: "Score",
      isDuplicate: "Is Duplicate",
      dataProcessingStatus: "Data Processing Status",
      filter1Status: "Filter 1 Status",
      filter2Status: "Filter 2 Status",
      filter3Status: "Filter 3 Status",
      inclusionCriterion: "Inclusion Criteria",
      exclusionCriterion: "Exclusion Criteria",
      qualityCriteria: "Quality Criteria",
    };
    const usesAssist = articles.some(a => a.aiSuggestions && Object.keys(a.aiSuggestions).length > 0);
    const headerAssist = usesAssist ? STAGES.reduce((acc, stage, i) => {
      acc[`suggestionF${i + 1}`] = `Suggestion Filter ${i + 1}`;
      acc[`suggestionProbabilityF${i + 1}`] = `Suggestion Probability Filter ${i + 1}`;
      acc[`relevanceF${i + 1}`] = `Relevance Filter ${i + 1}`;
      acc[`decisionSourceF${i + 1}`] = `Decision Source Filter ${i + 1}`;
      return acc;
    }, {}) : {};
    const headerArticlesFinal = {
      ...headerAssist,
      importDate: "Imported Date",
      lastModified: "Last Modified",
    };
    const extractions = {};
    protocol.extractionCriteria.forEach((criterion) => {
      // Use o criterion.id em vez de montar a string manualmente se possível
      extractions[criterion.id] = criterion.value;
    });
    const headerArticles = {
      ...headerArticlesInitial,
      ...extractions, // Eles entram aqui, antes do bloco final
      ...headerArticlesFinal
    };
    const tabs = [
      { label: 'Articles', filter: 'total' },
      { label: 'Included-Filter 1', filter: 'filter1Status', status: 'included' },
      { label: 'Excluded-Filter 1', filter: 'filter1Status', status: 'excluded' },
      { label: 'Included-Filter 2', filter: 'filter2Status', status: 'included' },
      { label: 'Excluded-Filter 2', filter: 'filter2Status', status: 'excluded' },
      { label: 'Included-Filter 3', filter: 'filter3Status', status: 'included' },
      { label: 'Excluded-Filter 3', filter: 'filter3Status', status: 'excluded' },
    ]

    tabs.forEach(tab => {
      const wsArticles = workbook.addWorksheet(tab.label);
      wsArticles.columns = Object.keys(headerArticles).map(key => ({
        header: headerArticles[key],
        key,
        width: 30,
      }));

      const copyArticles = getArticles(tab.filter, tab.status)
      // Adiciona linhas
      copyArticles.forEach((article, index) => {
        wsArticles.addRow(article);

        const rowNumber = index + 2; // +1 header, +1 índice base 0
        const row = wsArticles.getRow(rowNumber);

        const currentColor = index % 2 === 0 ? colors[0] : colors[1];

        row.eachCell({ includeEmpty: true }, cell => {
          cell.alignment = { vertical: "middle" };
          cell.fill = {
            type: "pattern",
            pattern: "solid",
            fgColor: { argb: currentColor },
          };
          cell.border = {
            left: { style: 'thin' },
            right: { style: 'thin' }
          };
        });
      });

      // Estilo do header
      wsArticles.getRow(1).eachCell(cell => {
        cell.font = { bold: true };
        cell.alignment = { vertical: "middle", horizontal: "center" };
        cell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: colorHeader },
        };
        cell.border = {
          left: { style: 'thin' },
          right: { style: 'thin' }
        };
      });

    })

    const buffer = await workbook.xlsx.writeBuffer();

    const blob = new Blob([buffer], {
      type:
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });

    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "protocol-and-articles.xlsx";
    a.click();
    URL.revokeObjectURL(url);
  }

  const restoreState = (data) => {
    fileOpenedAtRef.current = Date.now();
    isRestoringRef.current = true;
    setProtocol(data.protocol || {});
    setArticles(data.articles || []);
    setCurrentSection(data.currentSection || 'protocol');
    setImportedData(data.importedData || []);
    setLastSaved(data.metadata?.savedAt ? new Date(data.metadata.savedAt) : null);
    setHasUnsavedChanges(false)
  };

  // Estatísticas calculadas
  // Substituir o cálculo das estatísticas (linha ~1147)
  const handleImport = useCallback((newArticles, source) => {
    setLoading(true);
    // setTimeout(() => {

    // setArticles(prev => [...prev, ...newArticles]);
    setArticles(prev => {
      const allArticles = [...prev, ...newArticles];

      const duplicatesByDOI = new Map();
      const duplicatesByTitle = new Map();

      return allArticles.map(article => {
        let isDuplicate = false;
        let duplicateOf = article.duplicateOf;

        if (article.doi && duplicatesByDOI.has(article.doi)) {
          isDuplicate = true;
          duplicateOf = duplicatesByDOI.get(article.doi);
        } else if (article.doi) {
          duplicatesByDOI.set(article.doi, article.id);
        }

        const normalizedTitle = article.title.toLowerCase().trim();
        if (duplicatesByTitle.has(normalizedTitle)) {
          isDuplicate = true;
          duplicateOf = duplicatesByTitle.get(normalizedTitle);
        } else {
          duplicatesByTitle.set(normalizedTitle, article.id);
        }

        return isDuplicate
          ? { ...article, isDuplicate: true, dataProcessingStatus: 'duplicate', duplicateOf }
          : article;
      });
    });
    setLoading(false);
  }, []);

  const handleUpdateStatus = useCallback((id, statusType, status, criterion = null, source = 'user') => {
    setArticles(prev => prev.map(article => {
      if (article.id !== id) return article;

      let base = status !== 'extracted'
        ? { ...article, [statusType]: status, lastModified: new Date() } :
        { ...article, lastModified: new Date() };

      // Origem da decisão por filtro (manual, sugestão aceita ou aplicada em lote)
      const stage = STATUS_FIELD_STAGE[statusType];
      if (stage && status !== 'extracted') {
        const { [stage]: _previous, ...otherSources } = article.decisionSource ?? {};
        base = {
          ...base,
          decisionSource: status === 'included' || status === 'excluded'
            ? { ...otherSources, [stage]: source }
            : otherSources,
        };
      }

      // Cascade reset — apenas atualiza o campo de status
      if (status === null) return base;

      // Extração
      if (status === 'extracted') {
        return { ...base, extractionCriteria: criterion };
      }

      // Duplicata
      if (status === 'duplicate') {
        return { ...base, isDuplicate: true };
      }

      // included / excluded — processa critérios
      const criteria = (Array.isArray(criterion) ? criterion : [criterion]).filter(Boolean);

      const byCat = (cat) => criteria.filter(c => c.category === cat);
      const newInclusionCriteria = byCat('inclusion');
      const newExclusionCriteria = byCat('exclusion');
      const newQualityCriteria = byCat('quality');

      return {
        ...base,
        isDuplicate: false,
        inclusionCriterion: newInclusionCriteria,
        exclusionCriterion: newExclusionCriteria,
        qualityCriteria: newQualityCriteria,
      };
    }));
  }, []);

  // Salva as sugestões geradas para um filtro: entries = [{ id, suggestion }]
  const handleSetSuggestions = useCallback((stage, entries) => {
    if (!entries.length) return;
    const byId = new Map(entries.map(e => [e.id, e.suggestion]));
    setArticles(prev => prev.map(article => byId.has(article.id)
      ? { ...article, aiSuggestions: { ...(article.aiSuggestions ?? {}), [stage]: byId.get(article.id) } }
      : article
    ));
  }, []);

  // Acumula o consumo de tokens no protocolo do projeto
  const handleAddUsage = useCallback(({ inputTokens = 0, requests = 0 }) => {
    setProtocol(prev => {
      const config = getAiConfig(prev);
      return {
        ...prev,
        aiConfig: {
          ...config,
          usage: {
            inputTokens: config.usage.inputTokens + inputTokens,
            requests: config.usage.requests + requests,
          },
        },
      };
    });
  }, []);

  // Função para detectar duplicatas por diferentes critérios
  const detectDuplicates = useCallback(() => {
    const duplicatesByDOI = new Map();
    const duplicatesByTitle = new Map();

    const updatedArticles = articles.map(article => {
      let isDuplicate = false;
      let duplicateOf = article.duplicateOf;

      if (article.doi && duplicatesByDOI.has(article.doi)) {
        isDuplicate = true;
        duplicateOf = duplicatesByDOI.get(article.doi);
      } else if (article.doi) {
        duplicatesByDOI.set(article.doi, article.id);
      }

      const normalizedTitle = article.title.toLowerCase().trim();
      if (duplicatesByTitle.has(normalizedTitle)) {
        isDuplicate = true;
        duplicateOf = duplicatesByTitle.get(normalizedTitle);
      } else {
        duplicatesByTitle.set(normalizedTitle, article.id);
      }
      if (isDuplicate) {
        return { ...article, isDuplicate: true, dataProcessingStatus: 'duplicate', duplicateOf };
      } else {
        return { ...article, isDuplicate: false, dataProcessingStatus: 'pending' };
      }

      return article;
    });

    setArticles(updatedArticles);
  }, [articles]);

  const ConfigureNotification = () => (
    <button onClick={() => setShowReminderSettings(true)} data-tour="reminder"
      className="p-2 rounded-lg transition-colors duration-200 bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 flex items-center justify-center"
      title={t('header.notification')}
    >
      <Bell className="h-5 w-5 text-gray-600 dark:text-gray-300" />
    </button>
  );

  const AssistSettings = () => (
    <button onClick={() => setShowJevSettings(true)} data-tour="assist"
      className="p-2 rounded-lg transition-colors duration-200 bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 flex items-center justify-center"
      title={t('assist.headerButton')}
    >
      <ListChecks className="h-5 w-5 text-gray-600 dark:text-gray-300" />
    </button>
  );

  // Componente Support
  const Support = () => {
    return (
      <button onClick={() => setShowSupport(true)} data-tour="support"
        className="p-2 rounded-lg transition-colors duration-200 bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 flex items-center justify-center"
        title={t('header.support')}
      >
        <HeartHandshake className="h-5 w-5  dark:text-gray-300" />
      </button>
    );
  };

  const GuideButton = () => (
    <button onClick={() => {
      setShowChecklist(!showChecklist);
      setChecklistHidden(showChecklist);
    }}
      data-tour="guide-button"
      className="p-2 rounded-lg transition-colors duration-200 bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 flex items-center justify-center"
      title={t('header.guide')}
      aria-pressed={showChecklist}
    >
      <GraduationCap className="h-5 w-5 text-gray-600 dark:text-gray-300" />
    </button>
  );

  const FileMenu = () => (
    <div data-tour="file-menu" className="relative col-span-6 min-[520px]:col-auto w-full min-[520px]:w-auto" onClick={e => e.stopPropagation()}>
      <button
        onClick={() => setShowFileMenu(!showFileMenu)}
        className="w-full min-[520px]:w-auto justify-center px-2 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg flex items-center gap-1"
        title={t('file.menu')}
      >
        <FileText className="h-5 w-5" />
        <div className="whitespace-nowrap">
          {t('file.menu')}
        </div>
        <ChevronDown className={`inline-flex h-4 w-4 transition-transform ${showFileMenu ? 'rotate-180' : ''}`} />
        {/* Arquivo */}

      </button>

      {showFileMenu && (
        <div className="absolute right-0 mt-2 w-48 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg shadow-lg py-2 z-50">
          <button
            onClick={handleNewProject}
            className="w-full px-4 py-2 text-left hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2"
          >
            <FileText className="h-4 w-4" />
            {t('file.new')}
          </button>

          <input
            ref={fileInputRef}
            type="file"
            accept=".srp,.json"
            onChange={handleLoadProject}
            className="hidden"
          />
          <button
            onClick={handleOpenClick}
            className="w-full px-4 py-2 text-left hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2"
          >
            <Upload className="h-4 w-4" />
            {t('file.open')}
          </button>

          <button
            onClick={handleSaveProject}
            className="w-full px-4 py-2 text-left hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2"
          >
            <Download className="h-4 w-4" />
            {t('file.save')}
            {hasUnsavedChanges && <span className="text-red-500 text-xs">●</span>}
          </button>

          <button
            onClick={handleSaveAs}
            className="w-full px-4 py-2 text-left hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2"
          >
            <Save className="h-4 w-4" />
            {t('file.saveAs')}
          </button>

          <button
            onClick={handleExportXLSX}
            className="w-full px-4 py-2 text-left hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2"
          >
            <Table className="h-4 w-4" />
            {t('file.export')}
          </button>
        </div>
      )}
    </div>
  );

  const StatusIndicator = () => (
    <div className="flex items-center gap-4 text-sm text-gray-600 dark:text-gray-400">
      {/* {autoSaveHandleRef.current && isFileSystemAccessSupported() && (
        <button
          onClick={() => toggleAutoSave(!autoSaveEnabled)}
          title={autoSaveEnabled ? t('autosave.toggleOff') : t('autosave.toggleOn')}
          className={`flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs font-medium transition-colors duration-150 touch-manipulation cursor-pointer ${autoSaveEnabled
              ? 'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300'
              : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600'
            }`}
        >
          <Save className="h-3.5 w-3.5" />
          {autoSaveEnabled ? t('autosave.indicatorOn') : t('autosave.toggleOn')}
        </button>
      )} */}
      {hasUnsavedChanges && (
        <span className="flex items-center gap-1 text-amber-600 dark:text-amber-400">
          <Clock className="h-4 w-4" />
          {t('app.unsaved')}
        </span>
      )}
      {lastSaved && (
        <span className="flex items-center gap-1">
          <CheckCircle className="h-4 w-4 text-green-600" />
          {t('app.saved') + (autoSaveEnabled && isFileSystemAccessSupported() ? ' (' + t('autosave.indicatorOn') + ')' : ' ')}: {lastSaved.toLocaleTimeString()}
        </span>
      )}
    </div>
  );
  const sectionsToCheck = ['dataprocessing', 'filter1', 'filter2', 'filter3', 'statistics']
  const sections = [
    { id: 'protocol', name: t('nav.protocol'), icon: Settings },
    { id: 'import', name: t('nav.import'), icon: Upload },
    { id: 'dataprocessing', name: t('nav.dataprocessing'), icon: Database },
    { id: 'filter1', name: t('nav.filter1'), icon: Filter },
    { id: 'filter2', name: t('nav.filter2'), icon: Filter },
    { id: 'filter3', name: t('nav.filter3'), icon: Filter },
    { id: 'statistics', name: t('nav.statistics'), icon: ChartArea },
    { id: 'about', name: t('nav.about'), icon: Info }
  ];
  const sectionGroups = [
    [sections[0], sections[1]],  // Protocolo + Tratamento
    [sections[2]],       // Importação (sozinho)
    [sections[3], sections[4], sections[5]], // Filtro 1, 2, 3
    [sections[6]],                    // Estatísticas (sozinho)
    [sections[7]],                    // Sobre (sozinho)
  ];

  return (
    <div className="min-h-screen w-full bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800 text-gray-900 dark:text-gray-100 m-0 p-0 transition-colors duration-200">
      <div className="w-full h-full px-4 py-6">
        {/* Header */}
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6 mb-6 transition-colors duration-200">
          <div className="flex flex-col min-[560px]:flex-row flex-wrap items-start justify-between mb-4 gap-3">
            <div className="min-w-0 shrink-0">
              <div className="flex justify-start items-start gap-3 align-items">
                <div className="w-[32px] shrink-0">
                  <SvgIcon
                    className="w-full h-full"
                    stroke={theme === 'light' ? '#000' : '#fff'}
                    fill={theme === 'light' ? '#fff' : '#000'}
                    strokeWidth={0.4}
                  />
                </div>
                <h1 className="text-xl sm:text-3xl font-bold text-gray-800 dark:text-white leading-tight">
                  SysReview
                </h1>
              </div>
              <StatusIndicator />
            </div>

            <div className="grid min-[520px]:flex min-[520px]:flex-wrap w-full min-[520px]:w-auto max-w-full grid-cols-6 items-center gap-2">
              <FileMenu />
              <ConfigureNotification />
              <AssistSettings />
              <GuideButton />
              <LanguageSelector />
              <Support />
              <ThemeToggle theme={theme} toggleTheme={toggleTheme} />
            </div>
          </div>

          {/* Navegação entre seções */}
          <nav className="flex flex-wrap gap-2" data-tour="nav">
            {sectionGroups.map((group, i) => (
              <div key={i} className="flex flex-nowrap gap-2">
                {group.map((section) => {
                  const Icon = section.icon;
                  const isDisabled = sectionsToCheck.includes(section.id) && articles.length === 0;
                  const isActive = currentSection === section.id;

                  return (
                    <button
                      key={section.id}
                      data-tour={`nav-${section.id}`}
                      onClick={() => setCurrentSection(section.id)}
                      disabled={isDisabled}
                      title={isDisabled ? t('nav.importArticlesDisabled') : section.name}
                      className={
                        isDisabled
                          ? 'text-sm px-3 py-2 rounded-lg flex items-center gap-2 border-none bg-gray-100 dark:bg-gray-900 hover:border-none disabled:cursor-not-allowed disabled:text-gray-400'
                          : `text-sm px-3 py-2 rounded-lg flex items-center gap-2 transition-colors duration-200 ${isActive
                            ? 'bg-indigo-600 text-white dark:bg-indigo-500'
                            : 'bg-gray-300 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                          }`
                      }
                    >
                      <Icon size={16} className="flex-shrink-0" />
                      <span className={isActive ? 'inline whitespace-nowrap' : 'hidden sm:inline whitespace-nowrap'}>
                        {section.name}
                      </span>
                    </button>
                  );
                })}
              </div>
            ))}
          </nav>
        </div>
        <div data-tour="overview" className="bg-white dark:bg-gray-800 p-4 rounded-lg grid grid-cols-3 md:grid-cols-6 gap-3  mb-6 transition-colors duration-200">
          <div className="grid grid-cols-[24px_1fr] gap-2 items-center w-full max-w-[140px] mx-auto ">
            <Settings className="h-6 w-6 flex-shrink-0 text-indigo-600 dark:text-indigo-400" />
            <div className="min-w-0">
              <p className="text-sm sm:text-lg font-semibold text-gray-900 dark:text-gray-100 leading-tight">
                {protocolReady ? '✓' : '○'}
              </p>
              <p className="text-gray-600 dark:text-gray-400 text-xs leading-tight truncate">{t('overview.protocol')}</p>
            </div>
          </div>

          <div className="grid grid-cols-[24px_1fr] gap-2 items-center w-full max-w-[140px] mx-auto">
            <Upload className="h-6 w-6 flex-shrink-0 text-blue-600 dark:text-blue-400" />
            <div className="min-w-0">
              <p className="text-sm sm:text-lg font-semibold text-gray-900 dark:text-gray-100 leading-tight">{articles.length}</p>
              <p className="text-gray-600 dark:text-gray-400 text-xs leading-tight truncate">{t('overview.imported')}</p>
            </div>
          </div>

          <div className="grid grid-cols-[24px_1fr] gap-2 items-center w-full max-w-[140px] mx-auto">
            <Database className="h-6 w-6 flex-shrink-0 text-purple-600 dark:text-purple-400" />
            <div className="min-w-0">
              <p className="text-sm sm:text-lg font-semibold text-gray-900 dark:text-gray-100 leading-tight">{statistics.dataProcessing.included}</p>
              <p className="text-gray-600 dark:text-gray-400 text-xs leading-tight truncate">{t('overview.processed')}</p>
            </div>
          </div>

          <div className="grid grid-cols-[24px_1fr] gap-2 items-center w-full max-w-[140px] mx-auto">
            <Filter className="h-6 w-6 flex-shrink-0 text-green-600 dark:text-green-400" />
            <div className="min-w-0">
              <p className="text-sm sm:text-lg font-semibold text-gray-900 dark:text-gray-100 leading-tight">{statistics.filter1.included}</p>
              <p className="text-gray-600 dark:text-gray-400 text-xs leading-tight truncate">{t('overview.filter1')}</p>
            </div>
          </div>

          <div className="grid grid-cols-[24px_1fr] gap-2 items-center w-full max-w-[140px] mx-auto">
            <Filter className="h-6 w-6 flex-shrink-0 text-blue-600 dark:text-blue-400" />
            <div className="min-w-0">
              <p className="text-sm sm:text-lg font-semibold text-gray-900 dark:text-gray-100 leading-tight">{statistics.filter2.included}</p>
              <p className="text-gray-600 dark:text-gray-400 text-xs leading-tight truncate">{t('overview.filter2')}</p>
            </div>
          </div>

          <div className="grid grid-cols-[24px_1fr] gap-2 items-center w-full max-w-[140px] mx-auto">
            <FileText className="h-6 w-6 flex-shrink-0 text-purple-600 dark:text-purple-400" />
            <div className="min-w-0">
              <p className="text-sm sm:text-lg font-semibold text-gray-900 dark:text-gray-100 leading-tight">{statistics.filter3.included}</p>
              <p className="text-gray-600 dark:text-gray-400 text-xs leading-tight truncate">{t('overview.final')}</p>
            </div>
          </div>
        </div>

        {/* Conteúdo das seções */}
        {currentSection === 'protocol' && (
          <ProtocolSection protocol={protocol} onUpdateProtocol={setProtocol} />
        )}

        {currentSection === 'import' && (
          <ImportSection
            articles={articles}
            setArticles={setArticles}
            onImport={handleImport}
            isLoading={loading}
            protocol={protocol}
            importedData={importedData}
            setImportedData={setImportedData}
            detectDuplicates={detectDuplicates}
            numStringSc={numStringSc}
            setNumStringSc={setNumStringSc}
            statistics={statistics}
          />
        )}

        {currentSection === 'dataprocessing' && (
          <DataProcessingSection
            articles={articles}
            currentFilter={currentSection}
            setArticles={setArticles}
            onUpdateStatus={handleUpdateStatus}
            statistics={statistics}
            detectDuplicates={detectDuplicates}
          // handleExclude={handleUpdateStatus}
          />
        )}

        {currentSection === 'filter1' && (
          <Filter1Section
            articles={articles}
            onUpdateStatus={handleUpdateStatus}
            inclusionCriteria={protocol.inclusionCriteria}
            exclusionCriteria={protocol.exclusionCriteria}
            statistics={statistics}
          />
        )}

        {currentSection === 'filter2' && (
          <Filter2Section
            articles={articles}
            onUpdateStatus={handleUpdateStatus}
            inclusionCriteria={protocol.inclusionCriteria}
            exclusionCriteria={protocol.exclusionCriteria}
            statistics={statistics}
          />
        )}

        {currentSection === 'filter3' && (
          <Filter3Section
            articles={articles}
            onUpdateStatus={handleUpdateStatus}
            inclusionCriteria={protocol.inclusionCriteria}
            exclusionCriteria={protocol.exclusionCriteria}
            extractionCriteria={protocol.extractionCriteria}
            statistics={statistics}
          />
        )}

        {currentSection === 'about' && (
          <AboutSection />
        )}

        {currentSection === 'statistics' && (
          <StatisticsSection
            articles={articles}
            onUpdateStatus={handleUpdateStatus}
            inclusionCriteria={protocol.inclusionCriteria}
            exclusionCriteria={protocol.exclusionCriteria}
            qualityCriteria={protocol.qualityCriteria}
            extractionCriteria={protocol.extractionCriteria}
            statistics={statistics}
            theme={theme}
            importedData={importedData}
          />
        )}

        {/* Lista de artigos para a seção atual */}
        {(currentSection === 'dataprocessing' || currentSection === 'filter1' || currentSection === 'filter2' || currentSection === 'filter3') && (
          <ArticlesList
            articles={articles}
            currentFilter={currentSection}
            onUpdateStatus={handleUpdateStatus}
            protocol={protocol}
            assistSettings={jevSettings.apiKey ? jevSettings : null}
            onSetSuggestions={handleSetSuggestions}
            onAddUsage={handleAddUsage}
            onDetailsOpenChange={setArticleDetailsOpen}
          />
        )}

        {showJevSettings && (
          <JevSettingsModal
            settings={jevSettings}
            aiConfig={protocol.aiConfig}
            onSave={(settings, aiConfig) => {
              setJevSettings(settings);
              saveJevSettings(settings);
              setProtocol(prev => ({ ...prev, aiConfig }));
              setShowJevSettings(false);
            }}
            onClose={() => setShowJevSettings(false)}
          />
        )}

        <UnsavedWarningModal
          lastSaved={lastSaved}
          hasUnsavedChanges={hasUnsavedChanges}
          fileOpenedAt={fileOpenedAtRef.current}
          warnAfterMin={warnAfterMin}
          onSave={handleSaveProject}
          onDismiss={() => console.log("usuário dispensou o aviso")}
          autoSaveAvailable={!!autoSaveHandleRef.current && isFileSystemAccessSupported()}
          autoSaveEnabled={autoSaveEnabled}
          onToggleAutoSave={toggleAutoSave}
        />

        {showAutoSaveOffer && (
          <AutoSaveOfferModal
            onEnable={async () => {
              const ok = await enableAutoSave();
              setShowAutoSaveOffer(false);
              if (ok) {
                setAlertMessage({ type: 'success', title: t('modals.alert.successTitle'), message: t('autosave.enabledNotice') });
              }
            }}
            onClose={() => {
              setShowAutoSaveOffer(false);
              if (pendingSupportRequestRef.current) {
                pendingSupportRequestRef.current = false;
                setShowSupportRequest(true);
              }
            }}
          />
        )}

        {showReminderSettings && (
          <ReminderSettingsModal
            currentMinutes={warnAfterMin}
            onConfirm={(min) => { setWarnAfterMin(min); setShowReminderSettings(false); }}
            onClose={() => setShowReminderSettings(false)}
          />
        )}

        {showSupport && (
          <SupportModal
            currentMinutes={warnAfterMin}
            onConfirm={(min) => { setWarnAfterMin(min); setShowSupport(false); }}
            onClose={() => setShowSupport(false)}
          />
        )}

        {showChecklist && !articleDetailsOpen && (
          <OnboardingChecklist
            items={checklistItems}
            isSectionAvailable={(id) => !(sectionsToCheck.includes(id) && articles.length === 0)}
            onGoToSection={(id) => (id.startsWith('filter') ? showActions(id) : setCurrentSection(id))}
            onStartTour={startTour}
            onClose={() => { setShowChecklist(false); setChecklistHidden(true); }}
            forceExpanded={tourStage === 'checklist'}
            forceCollapsed={tourStage === 'running'}
          />
        )}

        {showSupportRequest && (
          <SupportRequestModal
            autoCloseMs={10000}
            onOpenSupport={() => {
              supportInteractedRef.current = true;
              setShowSupportRequest(false);
              setShowSupport(true);
            }}
            onDismiss={() => {
              supportInteractedRef.current = true;
              setShowSupportRequest(false);
            }}
            onClose={() => setShowSupportRequest(false)}
          />
        )}

        <AlertModal
          isOpen={!!alertMessage}
          type={alertMessage?.type}
          title={alertMessage?.title}
          message={alertMessage?.message}
          onClose={() => {
            setAlertMessage(null);
            if (pendingSupportRequestRef.current && !showAutoSaveOffer) {
              pendingSupportRequestRef.current = false;
              setShowSupportRequest(true);
            }
          }}
        />

        <Analytics />
      </div>
    </div>
  );
};

export default SystematicReviewTool;
