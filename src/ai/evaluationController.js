import { buildQuestions, criteriaHash, evaluateArticle, hasEnoughText, isAutoApplicable, isSuggestionStale, textHash, withCurrentRules } from './screening.js';
import { providerModel, selectedEffort, requiresReevaluation, validateEffort } from './modelCapabilities.js';
import { chatgptRequest } from './chatgptClient.js';
import { DEFAULT_CONCURRENCY } from './jevClient.js';

export const stageIsPending = (a, stage) => {
  if (a.isDuplicate || a.dataProcessingStatus !== 'included') return false;
  if (stage !== 'filter1' && a.filter1Status !== 'included') return false;
  if (stage === 'filter3' && a.filter2Status !== 'included') return false;
  return a[`${stage}Status`] === 'pending';
};
export const articleText = a => a.fullText?.sections ? a.fullText : null;
export const evaluationDiagnostic = (error, context) => ({
  ...context, at: new Date().toISOString(), code: error.code || (error.name === 'TimeoutError' ? 'timeout' : 'api'),
  criterionId: error.criterionId || null, receivedType: error.receivedType || null, requestId: error.requestId || null,
  httpStatus: error.status || null, reason: error.reason || null,
});
export function applicableSuggestion(a, protocol, stage) {
  const suggestion = withCurrentRules(a.aiSuggestions?.[stage], protocol, stage);
  return stageIsPending(a, stage) && !isSuggestionStale(suggestion, protocol, stage, articleText(a), a) && isAutoApplicable(suggestion, protocol, stage);
}

// Not tied to a modal or list lifecycle. All asynchronous work belongs to one immutable job.
export function createEvaluationController({ onResults, onUsage, evaluate = evaluateArticle,
  connection = async (provider, signal) => chatgptRequest('status', { provider, signal }), flushMs = 1000 } = {}) {
  let current = null, session = 0, snapshot = null;
  const listeners = new Set();
  const live = job => current === job && job.session === session && !job.controller.signal.aborted;
  function publish(job, force = true) {
    if (current !== job) return;
    if (!force && Date.now() - (job.publishedAt || 0) < 500) return;
    job.publishedAt = Date.now();
    const counts = { included: 0, excluded: 0, uncertain: 0, 'needs-text': 0, error: 0, reused: 0, queued: 0, running: 0, cancelled: 0 };
    for (const item of job.items) {
      if (item.status === 'success') counts[item.suggestion.decision]++;
      else counts[item.status]++;
    }
    const durations = job.items.filter(i => i.status === 'success' && i.suggestion?.durationMs != null).map(i => i.suggestion.durationMs).sort((a, b) => a - b);
    snapshot = { id: job.id, phase: job.phase, minimized: job.minimized, stage: job.stage, sectionTitle: job.sectionTitle,
      provider: job.provider, model: job.model, effort: job.effort, total: job.items.length,
      processed: job.items.length - counts.queued - counts.running - counts.cancelled, counts,
      errors: job.items.filter(i => i.status === 'error').map(i => ({ id: i.id, title: i.title, diagnostic: i.diagnostic })),
      error: job.error || null, requests: job.usage.requests, inputTokens: job.usage.inputTokens,
      medianMs: durations.length ? durations[Math.floor(durations.length / 2)] : null,
      p95Ms: durations.length ? durations[Math.min(durations.length - 1, Math.ceil(durations.length * .95) - 1)] : null,
      applicable: job.items.filter(i => i.suggestion && isAutoApplicable(i.suggestion, job.protocol, job.stage)).length,
      connectionId: job.settings.connectionId || null };
    listeners.forEach(fn => fn());
  }
  function flush(job) {
    if (!live(job)) return;
    const entries = job.buffer.splice(0);
    const usage = job.pendingUsage; job.pendingUsage = { inputTokens: 0, outputTokens: 0, reasoningTokens: 0, requests: 0 };
    if (entries.length) onResults?.(job.stage, entries, job.session);
    if (usage.requests) onUsage?.({ ...usage, provider: job.provider, model: job.model }, job.session);
  }
  function stop() {
    const job = current;
    if (!job || !['preparing', 'ready', 'running'].includes(job.phase)) return;
    flush(job); job.controller.abort(); clearInterval(job.timer);
    for (const item of job.items) if (['queued', 'running'].includes(item.status)) item.status = 'cancelled';
    job.phase = 'stopped'; publish(job);
  }
  async function prepare({ articles, protocol, stage, settings, sectionTitle, reevaluate = false }) {
    if (current && ['preparing', 'ready', 'running'].includes(current.phase)) { current.minimized = false; publish(current); return; }
    const job = { id: crypto.randomUUID(), session, controller: new AbortController(), stage, sectionTitle,
      protocol: structuredClone(protocol), settings: structuredClone(settings), phase: 'preparing', minimized: false,
      items: structuredClone(articles.filter(a => stageIsPending(a, stage))).map(a => ({ id: a.id, title: a.title, article: a, status: 'queued' })),
      buffer: [], usage: { requests: 0, inputTokens: 0 }, pendingUsage: { inputTokens: 0, outputTokens: 0, reasoningTokens: 0, requests: 0 } };
    job.provider = settings.provider || 'jev'; job.model = providerModel(job.settings, job.protocol); job.effort = selectedEffort(job.settings, job.model);
    current = job; publish(job);
    try {
      validateEffort(job.provider, job.model, job.effort);
      if (job.provider === 'chatgpt') {
        const status = await connection(job.provider, job.controller.signal);
        if (!live(job)) return;
        if (!status.connected || !status.connectionId) throw Object.assign(new Error('Sign in to AI provider'), { code: 'ai-auth' });
        job.settings.connectionId = status.connectionId;
      }
      for (const item of job.items) {
        const old = item.article.aiSuggestions?.[stage];
        if (!reevaluate && old && !requiresReevaluation(old) && old.decision !== 'needs-text' &&
          !isSuggestionStale(old, job.protocol, stage, articleText(item.article), item.article)) {
          const checked = withCurrentRules(old, job.protocol, stage);
          if (!checked.invalidResponse) { item.status = 'reused'; item.suggestion = checked; }
        }
      }
      if (!Object.keys(buildQuestions(job.protocol, stage).questions).length) throw Object.assign(new Error('No active criteria'), { code: 'no-criteria' });
      job.phase = 'ready'; publish(job); return job.id;
    } catch (error) {
      if (!live(job)) return;
      job.error = evaluationDiagnostic(error, { provider: job.provider, model: job.model }); stop();
    }
  }
  async function start() {
    const job = current;
    if (!job || job.phase !== 'ready') return;
    job.responseFormatFailures = 0; job.phase = 'running'; publish(job);
    job.timer = setInterval(() => { flush(job); publish(job); }, flushMs);
    const queue = job.items.filter(i => i.status === 'queued'); let next = 0;
    const worker = async () => {
      while (live(job) && next < queue.length) {
        const item = queue[next++]; item.status = 'running'; publish(job, false);
        const fullText = articleText(item.article);
        const context = { id: item.id, stage: job.stage, provider: job.provider, model: job.model, requestedEffort: job.effort };
        try {
          const result = await evaluate({ article: item.article, protocol: job.protocol, stage: job.stage, settings: job.settings,
            fullText, signal: job.controller.signal });
          if (!live(job)) return;
          job.responseFormatFailures = 0;
          item.suggestion = result.suggestion;
          item.status = hasEnoughText(item.article, job.stage, fullText) ? 'success' : 'needs-text';
          job.buffer.push({ id: item.id, suggestion: result.suggestion, attempt: { ...context, status: 'success', at: new Date().toISOString() },
            expected: { status: item.article[`${job.stage}Status`], decisionRevision: item.article.aiDecisionRevisions?.[job.stage] || 0,
              processingRevision: item.article.dataProcessingRevision || 0,
              criteriaHash: criteriaHash(job.protocol, job.stage), textHash: textHash(fullText) } });
          if (result.usage) {
            const tokens = result.usage.input_tokens || 0;
            job.usage.inputTokens += tokens; job.usage.requests++;
            job.pendingUsage.inputTokens += tokens; job.pendingUsage.requests++;
            job.pendingUsage.outputTokens += result.usage.output_tokens || 0;
            job.pendingUsage.reasoningTokens += result.usage.reasoning_tokens || result.usage.output_tokens_details?.reasoning_tokens || 0;
          }
        } catch (error) {
          if (!live(job)) return;
          item.status = 'error'; item.diagnostic = evaluationDiagnostic(error, context);
          job.buffer.push({ id: item.id, attempt: { ...item.diagnostic, status: 'error' } });
          if (error.code === 'response-invalid' && (!error.criterionId || error.criterionId === 'answers' || ['empty-output', 'json-syntax', 'stream-format'].includes(error.reason))) {
            job.responseFormatFailures++;
            if (job.responseFormatFailures >= 3) {
              job.error = { ...item.diagnostic, code: 'response-format-repeated' }; stop(); return;
            }
          } else job.responseFormatFailures = 0;
          if (['ai-auth', 'ai-service', 'connection-changed', 'auth', 'no-key', 'quota', 'effort', 'provider-unsupported', 'rate-limit', 'permission'].includes(error.code)) {
            job.error = item.diagnostic; stop(); return;
          }
        }
        publish(job, false);
      }
    };
    try { await Promise.all(Array.from({ length: Math.max(1, Math.min(16, Number(job.settings.concurrency) || DEFAULT_CONCURRENCY, queue.length || 1)) }, worker)); }
    finally {
      clearInterval(job.timer);
      if (live(job)) { flush(job); job.phase = 'done'; publish(job); }
    }
  }
  async function restartItems(status, autoStart = false) {
    const previous = current;
    if (!previous || !['done', 'stopped'].includes(previous.phase) || !previous.items.some(i => i.status === status)) return;
    // A fresh execution identity fences responses from workers cancelled before resume.
    const job = { ...previous, controller: new AbortController(), phase: 'preparing', error: null,
      settings: structuredClone(previous.settings), timer: undefined, buffer: [],
      pendingUsage: { inputTokens: 0, outputTokens: 0, reasoningTokens: 0, requests: 0 },
      usage: { ...previous.usage }, items: previous.items.map(item => item.status === status
        ? { ...item, status: 'queued', diagnostic: undefined } : { ...item }) };
    current = job; publish(job);
    try {
      validateEffort(job.provider, job.model, job.effort);
      if (job.provider === 'chatgpt') {
        const status = await connection(job.provider, job.controller.signal);
        if (!live(job)) return;
        if (!status.connected || !status.connectionId) throw Object.assign(new Error('Sign in to AI provider'), { code: 'ai-auth' });
        job.settings.connectionId = status.connectionId;
      }
      if (!Object.keys(buildQuestions(job.protocol, job.stage).questions).length) throw Object.assign(new Error('No active criteria'), { code: 'no-criteria' });
      job.phase = 'ready'; publish(job);
      if (autoStart) return start();
    } catch (error) {
      if (!live(job)) return;
      job.error = evaluationDiagnostic(error, { provider: job.provider, model: job.model }); stop();
    }
  }
  return {
    subscribe: fn => { listeners.add(fn); return () => listeners.delete(fn); }, getSnapshot: () => snapshot,
    prepare, start, stop, resume: () => restartItems('cancelled', true),
    refreshRules: aiConfig => {
      const job = current;
      if (!job || !['done', 'stopped'].includes(job.phase)) return;
      job.protocol.aiConfig = structuredClone(aiConfig);
      for (const item of job.items) if (item.suggestion) item.suggestion = withCurrentRules(item.suggestion, job.protocol, job.stage);
      publish(job);
    },
    setReevaluate: value => {
      const job = current; if (!job || job.phase !== 'ready') return;
      for (const item of job.items) {
        if (!['queued', 'reused'].includes(item.status)) continue;
        item.status = 'queued'; delete item.suggestion;
        const old = item.article.aiSuggestions?.[job.stage];
        if (!value && old && !requiresReevaluation(old) && old.decision !== 'needs-text' && !isSuggestionStale(old, job.protocol, job.stage, articleText(item.article), item.article)) {
          const checked = withCurrentRules(old, job.protocol, job.stage);
          if (!checked.invalidResponse) { item.status = 'reused'; item.suggestion = checked; }
        }
      }
      publish(job);
    },
    minimize: () => { if (current) { current.minimized = true; publish(current); } },
    expand: () => { if (current) { current.minimized = false; publish(current); } },
    dismiss: () => { if (current && !['preparing', 'ready', 'running'].includes(current.phase)) { current = null; snapshot = null; listeners.forEach(fn => fn()); } },
    resetProject: () => { stop(); session++; current = null; snapshot = null; listeners.forEach(fn => fn()); },
    connectionChanged: (provider, id) => { if (current?.provider === provider && current.settings.connectionId && current.settings.connectionId !== id) stop(); },
    retryErrors: () => restartItems('error'),
    get session() { return session; },
  };
}
