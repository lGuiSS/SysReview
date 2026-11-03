// Classes dos modais compartilhadas entre o Modal e o Overlay do App; literais para o Tailwind encontrá-las

export const SIZES = {
  sm: 'sm:max-w-md',     // 28rem: confirmação, alerta, lembrete, apoio
  md: 'sm:max-w-xl',     // 36rem: configurações e formulários
  lg: 'sm:max-w-3xl',    // 48rem: listas de critérios
  xl: 'sm:max-w-6xl',    // 72rem: detalhe do artigo
};

// Ícone do título: neutro por padrão; tons semânticos só em alertas e confirmações
export const ICON_TONES = {
  neutral: 'text-gray-500 dark:text-gray-400',
  info: 'bg-indigo-100 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-400',
  success: 'bg-green-100 dark:bg-green-900/40 text-green-600 dark:text-green-400',
  danger: 'bg-red-100 dark:bg-red-900/40 text-red-600 dark:text-red-400',
  warning: 'bg-amber-100 dark:bg-amber-900/40 text-amber-600 dark:text-amber-400',
};

// Camadas: modais comuns, os abertos sobre outro modal e os que ficam por cima de tudo
export const LAYERS = { base: 'z-50', over: 'z-[60]', top: 'z-[9999]' };

export const MODAL_BACKDROP = 'fixed inset-0 flex items-end sm:items-center justify-center sm:p-4 bg-black/40 dark:bg-black/60';
export const modalPanelClass = (size = 'sm') =>
  `w-full ${SIZES[size] ?? SIZES.sm} max-h-[92dvh] sm:max-h-[90dvh] flex flex-col bg-white dark:bg-gray-800 rounded-t-2xl sm:rounded-2xl shadow-xl border border-gray-200 dark:border-gray-700`;
export const MODAL_BODY = 'flex-1 min-h-0 overflow-y-auto overscroll-contain px-5 sm:px-6 py-5';
