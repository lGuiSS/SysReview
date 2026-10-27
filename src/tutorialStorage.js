// tutorialStorage.js - Preferências do guia de primeiros passos (tour e checklist)

const TOUR_SEEN_KEY = 'sysreview-tour-seen';
const CHECKLIST_HIDDEN_KEY = 'sysreview-checklist-hidden';
const CHECKLIST_COLLAPSED_KEY = 'sysreview-checklist-collapsed';

// `unavailable` é devolvido quando o localStorage não pode ser lido
const read = (key, fallback, unavailable = fallback) => {
  try {
    const value = localStorage.getItem(key);
    return value === null ? fallback : value === '1';
  } catch {
    return unavailable;
  }
};

const write = (key, value) => {
  try {
    localStorage.setItem(key, value ? '1' : '0');
  } catch {
    // sem localStorage: a preferência vale só até recarregar a página
  }
};

// Sem localStorage, considera visto para não abrir o tour a cada visita
export const hasSeenTour = () => read(TOUR_SEEN_KEY, false, true);
export const markTourSeen = () => write(TOUR_SEEN_KEY, true);

export const isChecklistHidden = () => read(CHECKLIST_HIDDEN_KEY, false);
export const setChecklistHidden = (hidden) => write(CHECKLIST_HIDDEN_KEY, hidden);

export const isChecklistCollapsed = (fallback) => read(CHECKLIST_COLLAPSED_KEY, fallback);
export const setChecklistCollapsed = (collapsed) => write(CHECKLIST_COLLAPSED_KEY, collapsed);
