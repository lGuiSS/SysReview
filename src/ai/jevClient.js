// jevClient.js - Cliente HTTP para o Jev (TypeSafe System One)

export const DEFAULT_MODEL = 'jev-1.13.0';
export const PRICE_PER_MTOK_USD = 0.042;

const SETTINGS_KEY = 'sysreview-jev-settings';

// Em desenvolvimento usa o proxy do Vite (vite.config.js) para evitar CORS
export const defaultBaseUrl = () =>
  import.meta.env?.DEV ? '/typesafe' : 'https://api.typesafe.ai';

// Configurações locais da máquina (nunca vão para o arquivo .srp)
export const loadJevSettings = () => {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return {
      apiKey: '',
      baseUrl: '',
      concurrency: 4,
      longContext: false,
      ...parsed,
    };
  } catch {
    return { apiKey: '', baseUrl: '', concurrency: 4, longContext: false };
  }
};

export const saveJevSettings = (settings) => {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch (error) {
    console.error('Erro ao salvar configurações do Jev:', error);
  }
};

export class JevError extends Error {
  constructor(message, { status = null, code = 'api' } = {}) {
    super(message);
    this.name = 'JevError';
    this.status = status;
    this.code = code;
  }
}

const sleep = (ms, signal) => new Promise((resolve, reject) => {
  if (signal?.aborted) {
    reject(new DOMException('Aborted', 'AbortError'));
    return;
  }
  const timer = setTimeout(() => {
    signal?.removeEventListener('abort', onAbort);
    resolve();
  }, ms);
  const onAbort = () => {
    clearTimeout(timer);
    reject(new DOMException('Aborted', 'AbortError'));
  };
  signal?.addEventListener('abort', onAbort, { once: true });
});

const retryDelay = (res, attempt) => {
  const header = res.headers.get('retry-after');
  const seconds = header ? Number(header) : NaN;
  if (!Number.isNaN(seconds)) return seconds * 1000;
  return Math.min(1000 * 2 ** attempt, 20000);
};

// Envia um state + perguntas ao Jev e devolve { model, answers, usage }
export const evaluate = async ({
  apiKey,
  baseUrl,
  model = DEFAULT_MODEL,
  state,
  questions,
  longContext = false,
  signal,
  maxRetries = 4,
}) => {
  if (!apiKey) throw new JevError('API key ausente', { code: 'no-key' });

  const url = `${(baseUrl || defaultBaseUrl()).replace(/\/+$/, '')}/v1/systemone`;
  const headers = {
    Authorization: `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
  };
  if (longContext) headers['TypeSafe-Danger-Zone-Long-Context'] = 'true';
  const body = JSON.stringify({ model, state, questions });

  for (let attempt = 0; ; attempt++) {
    let res;
    try {
      res = await fetch(url, { method: 'POST', headers, body, signal });
    } catch (error) {
      if (error?.name === 'AbortError') throw error;
      // Falha de rede ou CORS bloqueado pelo navegador
      throw new JevError(error?.message || 'Falha de rede', { code: 'network' });
    }

    if (res.ok) return res.json();

    const retryable = res.status === 429 || res.status >= 500;
    if (retryable && attempt < maxRetries) {
      await sleep(retryDelay(res, attempt), signal);
      continue;
    }

    let detail = '';
    try {
      detail = await res.text();
    } catch {
      // sem corpo
    }
    const code = res.status === 401 || res.status === 403 ? 'auth' : res.status === 429 ? 'rate-limit' : 'api';
    throw new JevError(detail || `HTTP ${res.status}`, { status: res.status, code });
  }
};

// Executa `worker` sobre `items` com concorrência limitada.
// Erros de um item não interrompem os demais; são reportados em onResult.
export const runQueue = async (items, worker, { concurrency = 4, onResult, signal } = {}) => {
  let next = 0;
  const runners = Array.from({ length: Math.max(1, Math.min(concurrency, items.length)) }, async () => {
    while (next < items.length) {
      if (signal?.aborted) return;
      const item = items[next++];
      try {
        const result = await worker(item);
        onResult?.(item, result, null);
      } catch (error) {
        if (error?.name === 'AbortError') return;
        onResult?.(item, null, error);
        // Chave inválida: não adianta continuar
        if (error?.code === 'auth') throw error;
      }
    }
  });
  await Promise.all(runners);
};
