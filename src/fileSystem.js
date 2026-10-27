// fileSystem.js - Sistema de salvamento e abertura de arquivos

// Versão atual do schema do arquivo
const CURRENT_SCHEMA_VERSION = "1.3.0";
export const APP_VERSION = CURRENT_SCHEMA_VERSION;

// Schemas de versões para compatibilidade retroativa
const SCHEMA_VERSIONS = {
  "1.0.0": {
    requiredFields: ["version", "protocol", "articles", "statistics", "metadata"],
    migrations: []
  },
  "1.1.0": {
    requiredFields: ["version", "protocol", "articles", "statistics", "metadata"],
    migrations: [migrateFrom1_0_0to1_1_0]
  },
  "1.2.0": {
    requiredFields: ["version", "protocol", "articles", "statistics", "metadata"],
    migrations: [migrateFrom1_1_0to1_2_0]
  },
  "1.3.0": {
    requiredFields: ["version", "protocol", "articles", "statistics", "metadata"],
    migrations: [migrateFrom1_2_0to1_3_0]
  }
};
// Remove exclusionReason dos artigos, movendo seu valor para exclusionCriterion
function migrateFrom1_0_0to1_1_0(data) {
  const { protocol } = data;

  // Mapas id → label para lookup eficiente
  const exclusionMap = Object.fromEntries(
    (protocol.exclusionCriteria ?? []).map(c => [c.id, c.value])
  );
  const inclusionMap = Object.fromEntries(
    (protocol.inclusionCriteria ?? []).map(c => [c.id, c.value])
  );

  const toObject = (id, map, category) =>
    id && typeof id === "string"
      ? { id, label: map[id] ?? id, category }
      : id; // já é objeto (idempotência) ou inválido

  return {
    ...data,
    version: "1.1.0",
    articles: data.articles.map(article => {
      const { exclusionReason, exclusionCriterion, inclusionCriterion, qualityCriteria = [], ...rest } = article;
      // --- exclusionCriterion ---
      const existingExclusion = Array.isArray(exclusionCriterion) ? exclusionCriterion : [];
      const incoming = Array.isArray(exclusionReason)
        ? exclusionReason
        : exclusionReason != null ? [exclusionReason] : [];

      const mergedExclusionIds = [...new Set([...existingExclusion, ...incoming])].filter(Boolean);
      const newExclusionCriterion = mergedExclusionIds
        .map(id => toObject(id, exclusionMap, "exclusion"))
        .filter(Boolean);

      // --- inclusionCriterion ---
      const inclusionIds = Array.isArray(inclusionCriterion)
        ? inclusionCriterion
        : inclusionCriterion != null ? [inclusionCriterion] : [];

      const newInclusionCriterion = inclusionIds
        .filter(Boolean)
        .map(id => toObject(id, inclusionMap, "inclusion"))
        .filter(Boolean);

      // --- qualityCriterion ---
      const newQualityCriterion = Array.isArray(qualityCriteria) ? qualityCriteria : [];

      return {
        ...rest,
        exclusionCriterion: newExclusionCriterion,
        inclusionCriterion: newInclusionCriterion,
        qualityCriteria: newQualityCriterion,
      };
    }),
  };
}
// Reatribui IDs únicos a artigos com IDs duplicados ou ausentes (bug de IDs
// colidindo). Referências `duplicateOf` apontam para o id da primeira
// ocorrência, que é sempre mantido — portanto não precisam ser alteradas.
function migrateFrom1_1_0to1_2_0(data) {
  const { articles = [] } = data;

  const allIds = new Set(articles.map(a => a.id).filter(Boolean));
  const usedIds = new Set();

  const newArticles = articles.map(article => {
    const oldId = article.id;
    if (oldId && !usedIds.has(oldId)) {
      usedIds.add(oldId);
      return article;
    }

    // Colisão ou id ausente: gera um novo id garantidamente único
    let newId;
    do {
      newId = `${oldId || 'article'}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    } while (usedIds.has(newId) || allIds.has(newId));

    usedIds.add(newId);
    return { ...article, id: newId };
  });

  return {
    ...data,
    version: "1.2.0",
    articles: newArticles,
  };
}
// Adiciona os campos da triagem assistida (sugestões por filtro e origem da decisão)
function migrateFrom1_2_0to1_3_0(data) {
  const { articles = [], protocol = {} } = data;
  return {
    ...data,
    version: "1.3.0",
    protocol: {
      ...protocol,
      aiConfig: protocol.aiConfig ?? null,
    },
    articles: articles.map(article => ({
      ...article,
      aiSuggestions: article.aiSuggestions ?? {},
      decisionSource: article.decisionSource ?? {},
      fullText: article.fullText ?? null,
    })),
  };
}
// Função para criar o estado padrão
const createDefaultState = () => ({
  protocol: {
    title: '',
    researchQuestion: '',
    yearRange: { start: 2015, end: 2024 },
    languages: ['English'],
    inclusionCriteria: [''],
    exclusionCriteria: [''],
    qualityCriteria: [''],
    databases: [],
    aiConfig: null
  },
  articles: [],
  statistics: {},
  currentSection: 'protocol',
  importedData: []
});

// Função para validar se um objeto tem todas as propriedades necessárias
const validateSchema = (data, version) => {
  const schema = SCHEMA_VERSIONS[version];
  if (!schema) {
    throw new Error(`Versão do schema não suportada: ${version}`);
  }

  const missingFields = schema.requiredFields.filter(field => !(field in data));
  if (missingFields.length > 0) {
    throw new Error(`Campos obrigatórios ausentes: ${missingFields.join(', ')}`);
  }

  return true;
};

// Função para migrar dados de versões antigas
const migrateData = (data) => {
  let currentData = { ...data };
  const fromVersion = currentData.version || "1.0.0";

  // Se já está na versão atual, não precisa migrar
  if (fromVersion === CURRENT_SCHEMA_VERSION) {
    return currentData;
  }

  // Aplicar migrações sequencialmente
  const versions = Object.keys(SCHEMA_VERSIONS).sort();
  const currentVersionIndex = versions.indexOf(CURRENT_SCHEMA_VERSION);
  const fromVersionIndex = versions.indexOf(fromVersion);

  if (fromVersionIndex === -1) {
    throw new Error(`Versão de origem desconhecida: ${fromVersion}`);
  }

  // Aplicar migrações da versão antiga até a atual
  for (let i = fromVersionIndex; i < currentVersionIndex; i++) {
    const nextVersion = versions[i + 1];
    const migrations = SCHEMA_VERSIONS[nextVersion].migrations;

    for (const migration of migrations) {
      currentData = migration(currentData);
    }
  }

  // Atualizar versão
  currentData.version = CURRENT_SCHEMA_VERSION;

  return currentData;
};

// Função para adicionar campos ausentes com valores padrão
const addMissingFields = (data) => {
  const defaultState = createDefaultState();

  return {
    ...defaultState, // valores padrão primeiro
    ...data, // dados carregados sobrescrevem os padrão
    protocol: {
      ...defaultState.protocol,
      ...data.protocol
    }
  };
};

// Suporte à File System Access API (Chromium)
export const isFileSystemAccessSupported = () =>
  typeof window !== 'undefined' &&
  typeof window.showSaveFilePicker === 'function' &&
  typeof window.showOpenFilePicker === 'function';

// Serializa o estado no formato de arquivo do projeto
const buildSaveData = (state) => ({
  version: CURRENT_SCHEMA_VERSION,
  protocol: state.protocol,
  articles: state.articles,
  statistics: state.statistics,
  metadata: {
    savedAt: new Date().toISOString(),
    totalArticles: state.articles.length,
    duplicates: state.articles.filter(a => a.isDuplicate).length,
    appVersion: CURRENT_SCHEMA_VERSION,
  },
  currentSection: state.currentSection,
  importedData: state.importedData || [],
  warnAfterMin: state.warnAfterMin
});

// Escreve conteúdo em um FileSystemFileHandle
const writeToHandle = async (handle, content) => {
  const writable = await handle.createWritable();
  await writable.write(content);
  await writable.close();
};

// Função principal de salvamento (abre o picker quando não há handle)
export const saveProjectToFile = async (state, existingHandle = null) => {
  try {
    const jsonData = JSON.stringify(buildSaveData(state), null, 2);
    const timestamp = new Date().toISOString().slice(0, 19).replace(/[:.]/g, '-');
    const suggestedName = `systematic-review-${timestamp}.srp`;

    let fileHandle = existingHandle;

    if (!fileHandle) {
      // Verificar suporte à API
      if (!isFileSystemAccessSupported()) {
        console.warn('showSaveFilePicker não suportado, usando download padrão.');
        return fallbackDownload(jsonData, suggestedName);
      }

      fileHandle = await window.showSaveFilePicker({
        suggestedName,
        types: [
          {
            description: 'Systematic Review Project',
            accept: { 'application/json': ['.srp'] },
          },
        ],
      });
    }

    await writeToHandle(fileHandle, jsonData);

    return { success: true, filename: fileHandle.name, fileHandle };

  } catch (error) {
    // Log completo para diagnóstico
    console.error('Erro ao salvar:', error, '| name:', error?.name, '| message:', error?.message);

    if (error?.name === 'AbortError') {
      return { success: false, error: 'Operação cancelada pelo usuário.' };
    }

    return { success: false, error: error?.message || `Erro desconhecido: ${error}` };
  }
};

// Salvamento automático: grava direto no handle sem abrir o picker
export const autoSaveToFile = async (state, fileHandle) => {
  try {
    if (!fileHandle || typeof fileHandle.createWritable !== 'function') {
      return { success: false, error: 'Handle inválido para salvamento automático.' };
    }

    const jsonData = JSON.stringify(buildSaveData(state), null, 2);
    await writeToHandle(fileHandle, jsonData);

    return { success: true, filename: fileHandle.name };
  } catch (error) {
    console.error('Erro no salvamento automático:', error);
    return { success: false, error: error?.message || 'Falha no salvamento automático.' };
  }
};

// Abre o picker de arquivo e devolve o handle (permite auto-save do arquivo aberto)
export const openProjectFromPicker = async () => {
  try {
    if (!isFileSystemAccessSupported()) {
      return { success: false, error: 'API não suportada neste navegador.', unsupported: true };
    }

    const [fileHandle] = await window.showOpenFilePicker({
      types: [
        {
          description: 'Systematic Review Project',
          accept: { 'application/json': ['.srp', '.json'] },
        },
      ],
      multiple: false,
    });

    const file = await fileHandle.getFile();
    const content = await file.text();

    return { success: true, file, content, fileHandle, filename: fileHandle.name };
  } catch (error) {
    if (error?.name === 'AbortError') {
      return { success: false, error: 'Operação cancelada pelo usuário.' };
    }
    console.error('Erro ao abrir via picker:', error);
    return { success: false, error: error?.message || 'Falha ao abrir o arquivo.' };
  }
};

// Consulta a permissão de escrita do handle (sem pedir, para reabertura)
export const queryHandlePermission = async (fileHandle) => {
  try {
    if (!fileHandle || typeof fileHandle.queryPermission !== 'function') {
      return { granted: true, state: 'granted' };
    }
    const state = await fileHandle.queryPermission({ mode: 'readwrite' });
    return { granted: state === 'granted', state };
  } catch {
    return { granted: false, state: 'denied' };
  }
};

// Solicita permissão de escrita (requer gesto do usuário quando em 'prompt')
export const requestHandlePermission = async (fileHandle) => {
  try {
    if (!fileHandle || typeof fileHandle.requestPermission !== 'function') {
      return { granted: true, state: 'granted' };
    }
    const state = await fileHandle.requestPermission({ mode: 'readwrite' });
    return { granted: state === 'granted', state };
  } catch {
    return { granted: false, state: 'denied' };
  }
};

// ── Persistência do handle em IndexedDB (sobrevive ao reload) ───────────────
const HANDLE_DB_NAME = 'sysreview-fs';
const HANDLE_DB_STORE = 'handles';
const HANDLE_DB_KEY = 'autoSaveFileHandle';

const openHandleDb = () => new Promise((resolve, reject) => {
  const req = indexedDB.open(HANDLE_DB_NAME, 1);
  req.onupgradeneeded = () => {
    if (!req.result.objectStoreNames.contains(HANDLE_DB_STORE)) {
      req.result.createObjectStore(HANDLE_DB_STORE);
    }
  };
  req.onsuccess = () => resolve(req.result);
  req.onerror = () => reject(req.error);
});

export const saveFileHandle = async (fileHandle) => {
  try {
    if (!fileHandle) return { success: false, error: 'Handle ausente.' };
    const db = await openHandleDb();
    const tx = db.transaction(HANDLE_DB_STORE, 'readwrite');
    tx.objectStore(HANDLE_DB_STORE).put(fileHandle, HANDLE_DB_KEY);
    await new Promise((resolve, reject) => {
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
    db.close();
    return { success: true };
  } catch (error) {
    console.warn('Falha ao persistir handle:', error);
    return { success: false, error: error?.message || 'Falha ao persistir handle.' };
  }
};

export const loadFileHandle = async () => {
  try {
    const db = await openHandleDb();
    const tx = db.transaction(HANDLE_DB_STORE, 'readonly');
    const req = tx.objectStore(HANDLE_DB_STORE).get(HANDLE_DB_KEY);
    const handle = await new Promise((resolve, reject) => {
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    db.close();
    return handle || null;
  } catch {
    return null;
  }
};

export const clearFileHandle = async () => {
  try {
    const db = await openHandleDb();
    const tx = db.transaction(HANDLE_DB_STORE, 'readwrite');
    tx.objectStore(HANDLE_DB_STORE).delete(HANDLE_DB_KEY);
    await new Promise((resolve, reject) => {
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
    db.close();
    return { success: true };
  } catch (error) {
    return { success: false, error: error?.message || 'Falha ao limpar handle.' };
  }
};

// Fallback para browsers sem suporte
const fallbackDownload = (jsonData, filename) => {
  try {
    const blob = new Blob([jsonData], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    return { success: true, filename };
  } catch (error) {
    return { success: false, error: error?.message || 'Falha no download de fallback.' };
  }
};

// Função principal de abertura
export const loadProjectFromFile = (file) => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = (event) => {
      try {
        // Parse do JSON
        const rawData = JSON.parse(event.target.result);

        // Determinar versão do arquivo
        const fileVersion = rawData.version || "1.0.0";
        console.log(`Carregando arquivo versão: ${fileVersion}`);

        // Validar schema básico
        try {
          validateSchema(rawData, fileVersion);
        } catch (validationError) {
          console.warn('Falha na validação do schema, tentando recuperar:', validationError.message);
        }

        // Migrar dados se necessário
        let migratedData = migrateData(rawData);

        // Adicionar campos ausentes com valores padrão
        const completeData = addMissingFields(migratedData);

        // Validar dados migrados
        validateSchema(completeData, CURRENT_SCHEMA_VERSION);

        // Log de sucesso
        console.log(`Arquivo carregado com sucesso. Versão original: ${fileVersion}, Versão atual: ${CURRENT_SCHEMA_VERSION}`);
        console.log(`Total de artigos: ${completeData.articles.length}`);

        resolve({
          success: true,
          data: completeData,
          originalVersion: fileVersion,
          newVersion: CURRENT_SCHEMA_VERSION,
          migrated: fileVersion !== CURRENT_SCHEMA_VERSION
        });

      } catch (error) {
        console.error('Erro ao carregar arquivo:', error);
        reject({
          success: false,
          error: error.message,
          details: error
        });
      }
    };

    reader.onerror = () => {
      reject({
        success: false,
        error: 'Erro ao ler o arquivo'
      });
    };

    reader.readAsText(file);
  });
};

// Função para auto-save (salvamento automático periódico)
export const setupAutoSave = (getState, intervalMinutes = 5) => {
  const interval = intervalMinutes * 60 * 1000; // converter para ms

  return setInterval(() => {
    try {
      const state = getState();

      // Só fazer auto-save se houver dados relevantes
      if (state.articles.length > 0 || state.protocol.title.trim()) {
        const autoSaveData = {
          ...state,
          metadata: {
            ...state.metadata,
            autoSavedAt: new Date().toISOString(),
            isAutoSave: true
          }
        };

        // Salvar no localStorage como backup
        localStorage.setItem('systematic-review-autosave', JSON.stringify(autoSaveData));
        console.log('Auto-save realizado:', new Date().toLocaleTimeString());
      }
    } catch (error) {
      console.error('Erro no auto-save:', error);
    }
  }, interval);
};

// Função para recuperar auto-save
export const loadAutoSave = () => {
  try {
    const autoSaveData = localStorage.getItem('systematic-review-autosave');
    if (autoSaveData) {
      const parsedData = JSON.parse(autoSaveData);
      // Aplica migrações (incluindo correção de IDs duplicados) antes de restaurar
      const migratedData = migrateData(parsedData);
      return {
        success: true,
        data: migratedData,
        isAutoSave: true
      };
    }
    return { success: false, error: 'Nenhum auto-save encontrado' };
  } catch (error) {
    console.error('Erro ao carregar auto-save:', error);
    return { success: false, error: error.message };
  }
};

// Função para limpar auto-save
export const clearAutoSave = () => {
  try {
    localStorage.removeItem('systematic-review-autosave');
    return { success: true };
  } catch (error) {
    console.error('Erro ao limpar auto-save:', error);
    return { success: false, error: error.message };
  }
};

// Exemplo de migração para futura versão 1.1.0
// const migrateFrom1_0_0to1_1_0 = (data) => {
//   return {
//     ...data,
//     // Adicionar novos campos com valores padrão
//     newField: 'defaultValue',
//     protocol: {
//       ...data.protocol,
//       newProtocolField: []
//     },
//     // Migrar artigos se necessário
//     articles: data.articles.map(article => ({
//       ...article,
//       newArticleField: 'defaultValue'
//     }))
//   };
// };