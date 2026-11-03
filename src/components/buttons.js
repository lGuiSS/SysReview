// Botões padrão dos modais e avisos; classes literais para o Tailwind encontrá-las
const base = 'inline-flex items-center justify-center gap-2 h-10 px-4 text-sm font-medium rounded-lg border transition-colors duration-150 disabled:opacity-50 disabled:cursor-not-allowed touch-manipulation';

export const BUTTON = {
  primary: `${base} border-transparent bg-indigo-600 text-white enabled:hover:bg-indigo-700 dark:bg-indigo-500 dark:enabled:hover:bg-indigo-600`,
  secondary: `${base} border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white enabled:hover:bg-gray-100 dark:enabled:hover:bg-gray-700`,
  danger: `${base} border-transparent bg-red-600 text-white enabled:hover:bg-red-700 dark:bg-red-500 dark:enabled:hover:bg-red-600`,
  success: `${base} border-transparent bg-green-600 text-white enabled:hover:bg-green-700 dark:bg-green-500 dark:enabled:hover:bg-green-600`,
};

// Botão só com ícone (fechar, copiar…): 40×40, sem fundo
export const ICON_BUTTON = 'grid place-items-center w-10 h-10 p-0 shrink-0 rounded-lg border-none bg-transparent text-gray-600 dark:text-gray-300 hover:text-gray-900 hover:bg-gray-100 dark:hover:text-white dark:hover:bg-gray-700 transition-colors';
