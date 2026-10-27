// useGuidedTour.js - Tour guiado com driver.js, trocando de seção entre os passos

import { useCallback, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { driver } from 'driver.js';
import 'driver.js/dist/driver.css';
import { actionSteps, buildTourSteps } from './tourSteps.js';
import { markTourSeen } from '../tutorialStorage.js';

const CHECKLIST_DELAY_MS = 350;

// Visual comum ao tour completo e ao tour curto dos botões de ação
const baseConfig = {
  popoverClass: 'sysreview-tour',
  overlayOpacity: 0.55,
  stagePadding: 6,
  stageRadius: 10,
  smoothScroll: true,
  disableActiveInteraction: true,
};

// Espera o elemento aparecer (a seção pode ainda não ter sido renderizada)
const waitForElement = (selector, callback, frames = 30) => {
  if (!selector || document.querySelector(selector) || frames === 0) {
    callback();
    return;
  }
  requestAnimationFrame(() => waitForElement(selector, callback, frames - 1));
};

export const useGuidedTour = ({ currentSection, setCurrentSection, hasArticles, onStart, onBeforeChecklist, onFinish }) => {
  const { t } = useTranslation();
  const driverRef = useRef(null);
  // Valores atuais lidos pelos callbacks do driver.js, criados uma vez por tour
  const latest = useRef({});
  useEffect(() => {
    latest.current = { currentSection, setCurrentSection, hasArticles, onStart, onBeforeChecklist, onFinish };
  });

  useEffect(() => () => driverRef.current?.destroy(), []);

  // Monta e inicia um tour; `isFullTour` marca o tour como visto ao terminar
  const run = useCallback((defs, { isFullTour, doneBtnText }) => {
    driverRef.current?.destroy();

    const steps = defs.map(def => ({
      element: def.element,
      popover: {
        title: t(`tour.steps.${def.key}.title`),
        description: t(`tour.steps.${def.key}.body`)
          + (def.locked ? `<span class="sysreview-tour-hint">${t('tour.lockedHint')}</span>` : ''),
        side: def.side,
        align: def.align ?? 'start',
      },
    }));

    const go = (index) => {
      const drv = driverRef.current;
      if (!drv || index < 0) return;
      if (index >= steps.length) {
        drv.destroy();
        return;
      }
      const def = defs[index];
      if (def.section && def.section !== latest.current.currentSection) {
        latest.current.setCurrentSection(def.section);
      }
      // Com fallback, espera a seção renderizar e usa o alvo principal só se ele existir
      const highlight = () => waitForElement(def.fallback ?? def.element, () => {
        if (def.fallback) {
          steps[index].element = document.querySelector(def.element) ? def.element : def.fallback;
        }
        drv.moveTo(index);
      });
      if (def.key === 'checklist') {
        // Dá tempo de o checklist abrir e assumir o tamanho final antes do destaque
        latest.current.onBeforeChecklist?.();
        setTimeout(highlight, CHECKLIST_DELAY_MS);
      } else {
        highlight();
      }
    };

    driverRef.current = driver({
      ...baseConfig,
      steps,
      showProgress: true,
      progressText: t('tour.progress'),
      nextBtnText: t('tour.next'),
      prevBtnText: t('tour.previous'),
      doneBtnText,
      onNextClick: () => go(driverRef.current.getActiveIndex() + 1),
      onPrevClick: () => go(driverRef.current.getActiveIndex() - 1),
      onDestroyed: () => {
        driverRef.current = null;
        if (isFullTour) markTourSeen();
        latest.current.onFinish?.();
      },
    });
    // O checklist fica recolhido durante o tour para não cobrir os alvos
    latest.current.onStart?.();
    driverRef.current.drive();
  }, [t]);

  const startTour = useCallback(() => {
    run(buildTourSteps({ hasArticles: latest.current.hasArticles }), { isFullTour: true, doneBtnText: t('tour.done') });
  }, [run, t]);

  // Atalho do checklist: abre o filtro e explica os botões de ação um a um.
  // Sem artigos na lista, só abre a seção.
  const showActions = useCallback((section) => {
    driverRef.current?.destroy();
    latest.current.setCurrentSection(section);
    waitForElement(`[data-tour="section-${section}"]`, () => requestAnimationFrame(() => {
      if (!document.querySelector('[data-tour="article-actions"]')) return;
      run(actionSteps(section), { isFullTour: false, doneBtnText: t('tour.gotIt') });
    }));
  }, [run, t]);

  return { startTour, showActions };
};
