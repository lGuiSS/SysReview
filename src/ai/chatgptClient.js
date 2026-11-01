export async function chatgptRequest(path, { body, signal, provider = 'chatgpt', attempt = 0 } = {}) {
  let res;
  try {
    res = await fetch(`/api/${provider}/${path}`, { method: body ? 'POST' : 'GET', signal,
      headers: { 'Content-Type': 'application/json', 'X-Sysreview-Client': '1' },
      ...(body ? { body: JSON.stringify(body) } : {}) });
  } catch (error) {
    if (error.name === 'AbortError') throw error;
    throw Object.assign(new Error('Local AI service unavailable'), { code: 'ai-service', provider });
  }
  let data;
  try { data = await res.json(); }
  catch { throw Object.assign(new Error('Local AI service unavailable'), { code: 'ai-service', provider }); }
  const retryValue = data.retryAfter ?? res.headers.get('retry-after');
  const retrySeconds = retryValue == null || retryValue === '' ? NaN : Number(retryValue);
  const dateDelay = retryValue && !Number.isFinite(retrySeconds) ? Date.parse(retryValue) - Date.now() : NaN;
  const delay = Number.isFinite(retrySeconds) && retrySeconds >= 0 ? retrySeconds * 1000 :
    Number.isFinite(dateDelay) ? Math.max(0, dateDelay) : 1000 * 2 ** attempt;
  // Long server-directed waits return control to the user, never retry earlier than Retry-After.
  if (!res.ok && path === 'evaluate' && (res.status === 429 || res.status >= 500) && attempt < 2 && delay <= 30_000) {
    await new Promise((resolve, reject) => {
      if (signal?.aborted) { reject(new DOMException('Aborted', 'AbortError')); return; }
      const timer = setTimeout(() => { signal?.removeEventListener('abort', aborted); resolve(); }, delay);
      const aborted = () => { clearTimeout(timer); reject(new DOMException('Aborted', 'AbortError')); };
      signal?.addEventListener('abort', aborted, { once: true });
    });
    return chatgptRequest(path, { body, signal, provider, attempt: attempt + 1 });
  }
  if (!res.ok) throw Object.assign(new Error(data.error || `HTTP ${res.status}`), { status: res.status,
    code: data.code || (res.status === 401 ? 'ai-auth' : res.status === 429 ? 'rate-limit' : 'api'),
    provider, criterionId: data.criterionId, receivedType: data.receivedType, reason: data.reason, requestId: data.requestId });
  return data;
}
export const evaluateChatgpt = ({ state, questions, model, signal, effort = 'default', connectionId }) =>
  chatgptRequest('evaluate', { body: { state, questions, model, effort, connectionId }, signal });
