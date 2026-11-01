// Local-only companion: OAuth credentials stay in memory, never in .srp/browser storage.
import { createServer } from 'node:http';
import process from 'node:process';
import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { ISSUER, RESOURCE, SCOPES, hasPlanPermission, validateIdentity, validateAnswers, readCompletedResponse, parseScreeningResponse } from './chatgptProtocol.js';
import { answerSchema, SCREENING_INSTRUCTIONS } from '../src/ai/answerContract.js';
import { reasoningParameters } from '../src/ai/modelCapabilities.js';

export function createChatgptServer({ port = 1455, registration = { hostId: `urn:uuid:${randomUUID()}` }, saveRegistration = async () => {}, fetchImpl = globalThis.fetch } = {}) {
  const origin = `http://127.0.0.1:${port}`;
  const redirectUri = `${origin}/auth/callback`;
  const allowedOrigins = new Set([origin, 'http://localhost:5173', 'http://127.0.0.1:5173']);
  const random = () => randomBytes(32).toString('base64url');
  const sessions = new Map();
  const transactions = new Map();
  const send = (res, status, data) => {
    res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
    res.end(JSON.stringify(data));
  };
  async function jsonBody(req) {
    let text = '';
    for await (const chunk of req) {
      text += chunk;
      if (text.length > 2_000_000) throw new Error('Request too large');
    }
    return JSON.parse(text || '{}');
  }
  async function jsonFetch(url, options) {
    const res = await fetchImpl(url, { ...options, signal: options?.signal || AbortSignal.timeout(30_000) });
    const data = await res.json();
    if (!res.ok) {
      const error = new Error(data.error?.message || data.error_description || data.detail || `HTTP ${res.status}`);
      error.status = res.status;
      throw error;
    }
    return data;
  }
  const exchange = params => jsonFetch(`${ISSUER}/api/accounts/oauth/token`, {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ ...params, resource: RESOURCE }),
  });
  async function accessToken(session) {
    if (!session.tokens || !hasPlanPermission(session.tokens)) {
      const error = new Error('Sign in and authorize ChatGPT plan usage.'); error.status = 401; throw error;
    }
    const selectedConnection = session.connectionId;
    if (session.expiresAt < Date.now() + 60_000) {
      session.refresh ||= (async () => {
        try {
          const tokens = await exchange({ grant_type: 'refresh_token', client_id: session.clientId, refresh_token: session.tokens.refresh_token });
          if (session.connectionId !== selectedConnection) throw Object.assign(new Error('ChatGPT connection changed'), { code: 'connection-changed' });
          session.tokens = { ...session.tokens, ...tokens, scope: tokens.scope ?? session.tokens.scope };
          session.expiresAt = Date.now() + tokens.expires_in * 1000;
        } catch (error) { if (session.connectionId === selectedConnection) session.tokens = null; error.status = 401; throw error; }
        finally { session.refresh = null; }
      })();
      await session.refresh;
    }
    if (session.connectionId !== selectedConnection) throw Object.assign(new Error('ChatGPT connection changed'), { code: 'connection-changed', status: 401 });
    if (!hasPlanPermission(session.tokens)) throw new Error('ChatGPT plan usage permission is missing.');
    return session.tokens.access_token;
  }

  return createServer(async (req, res) => {
    try {
      // Exact Host validation prevents DNS rebinding. No CORS access is offered.
      if (![ `127.0.0.1:${port}`, 'localhost:5173', '127.0.0.1:5173' ].includes(req.headers.host)) return send(res, 403, { error: 'Invalid host' });
      const url = new URL(req.url, origin);
      let sid = /(?:^|; )sysreview_session=([a-zA-Z0-9_-]+)/.exec(req.headers.cookie || '')?.[1];
      if (url.pathname === '/auth/callback') {
        const state = url.searchParams.get('state');
        const tx = transactions.get(state);
        transactions.delete(state);
        if (!tx || tx.sid !== sid || tx.expiresAt < Date.now()) return send(res, 400, { error: 'Invalid or expired OAuth state. Start sign-in again.' });
        const session = sessions.get(sid);
        if (!session) return send(res, 400, { error: 'Session expired' });
        if (url.searchParams.has('error')) {
          session.error = url.searchParams.get('error');
        } else {
          try {
            const clientId = url.searchParams.get('client_id') || tx.clientId;
            if (!clientId || clientId === 'dynamic_agent_client' || (tx.clientId !== 'dynamic_agent_client' && clientId !== tx.clientId)) throw new Error('Invalid issued client ID');
            const code = url.searchParams.get('code');
            if (!code) throw new Error('Missing authorization code');
            const tokens = await exchange({ grant_type: 'authorization_code', client_id: clientId, code, code_verifier: tx.verifier, redirect_uri: redirectUri });
            const jwks = await jsonFetch(`${ISSUER}/.well-known/jwks.json`);
            const identity = validateIdentity(tokens.id_token, jwks.keys, { clientId, nonce: tx.nonce });
            if (sessions.get(sid) !== session) throw new Error('ChatGPT session was disconnected');
            if (tx.expectedSubject && tx.expectedSubject !== identity.sub) throw new Error('Account changed; disconnect before choosing another account.');
            registration.clientId = clientId; registration.subject = identity.sub;
            await saveRegistration();
            for (const controller of session.controllers || []) controller.abort();
            session.controllers = new Set(); session.connectionId = randomUUID();
            session.clientId = clientId; session.identity = identity; session.tokens = tokens;
            session.expiresAt = Date.now() + tokens.expires_in * 1000;
            session.error = hasPlanPermission(tokens) ? null : 'ChatGPT plan usage was not authorized. Continue with ChatGPT to grant permission.';
          } catch (error) { session.error = error.message; }
        }
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'Content-Security-Policy': "default-src 'none'" });
        return res.end('<p>Return to SysReview / Volte ao SysReview. You can close this tab / Pode fechar esta aba.</p>');
      }
      if (url.pathname.startsWith('/api/chatgpt/')) {
        if (req.headers['x-sysreview-client'] !== '1' || (req.headers.origin && !allowedOrigins.has(req.headers.origin))) return send(res, 403, { error: 'Invalid request origin' });
        if (!sid || !sessions.has(sid)) {
          sid = random(); sessions.set(sid, {});
          res.setHeader('Set-Cookie', `sysreview_session=${sid}; HttpOnly; SameSite=Lax; Path=/`);
        }
        const session = sessions.get(sid);
        if (req.method === 'GET' && url.pathname.endsWith('/status')) return send(res, 200, {
          configured: true, connected: !!session.tokens && hasPlanPermission(session.tokens), connectionId: session.connectionId || null,
          email: session.identity?.email || null, error: session.error || null,
        });
        if (req.method === 'POST' && url.pathname.endsWith('/start')) {
          if (req.headers.origin === 'http://localhost:5173') return send(res, 400, { error: 'Open SysReview at http://127.0.0.1:5173 to use the OAuth loopback callback.' });
          for (const [key, tx] of transactions) if (tx.sid === sid || tx.expiresAt < Date.now()) transactions.delete(key);
          const tx = { sid, state: random(), nonce: random(), verifier: random(), expiresAt: Date.now() + 600_000, clientId: session.clientId || registration.clientId || 'dynamic_agent_client', expectedSubject: session.identity?.sub || registration.subject };
          transactions.set(tx.state, tx); session.error = null;
          const params = new URLSearchParams({ client_id: tx.clientId, ext_agent_host_id: registration.hostId,
            redirect_uri: redirectUri, response_type: 'code', scope: SCOPES, resource: RESOURCE,
            state: tx.state, nonce: tx.nonce, code_challenge_method: 'S256',
            code_challenge: createHash('sha256').update(tx.verifier).digest('base64url') });
          if (tx.clientId === 'dynamic_agent_client') params.set('agent_name_hint', 'SysReview');
          else if (session.tokens?.id_token) params.set('id_token_hint', session.tokens.id_token);
          return send(res, 200, { url: `${ISSUER}/api/accounts/authorize?${params}` });
        }
        if (req.method === 'POST' && url.pathname.endsWith('/logout')) {
          for (const controller of session.controllers || []) controller.abort();
          session.tokens = null; session.connectionId = null;
          sessions.set(sid, {});
          delete registration.clientId; delete registration.subject;
          await saveRegistration();
          for (const [key, tx] of transactions) if (tx.sid === sid) transactions.delete(key);
          return send(res, 200, { connected: false });
        }
        if (req.method === 'GET' && url.pathname.endsWith('/models')) {
          const token = await accessToken(session);
          const catalog = await jsonFetch(`${RESOURCE}/models`, { headers: { Authorization: `Bearer ${token}` } });
          return send(res, 200, { models: (catalog.models || []).filter(m => m.visibility === 'list').map(m => ({ slug: m.slug, display_name: m.display_name })) });
        }
        if (req.method === 'POST' && url.pathname.endsWith('/evaluate')) {
          const { state, questions, model, effort = 'default', connectionId } = await jsonBody(req);
          if (!model || !questions || !Object.keys(questions).length || !state) return send(res, 400, { error: 'Missing model, text or criteria' });
          const token = await accessToken(session);
          if (!connectionId || connectionId !== session.connectionId) return send(res, 401, { error: 'ChatGPT connection changed', code: 'connection-changed' });
          const controller = new AbortController();
          session.controllers ||= new Set(); session.controllers.add(controller);
          res.on('close', () => { if (!res.writableEnded) controller.abort(); });
          try {
          const upstream = await fetchImpl(`${RESOURCE}/responses`, { method: 'POST', signal: AbortSignal.any([controller.signal, AbortSignal.timeout(180_000)]),
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ model, store: false, stream: true, ...reasoningParameters('chatgpt', model, effort),
              ...(/^gpt-[456]/.test(model) ? { text: { format: { type: 'json_schema', name: 'screening', strict: true, schema: answerSchema(questions) } } } : {}), input: [
              { role: 'developer', content: SCREENING_INSTRUCTIONS + `\nRequired JSON Schema: ${JSON.stringify(answerSchema(questions))}` },
              { role: 'user', content: JSON.stringify({ study: state, questions }) },
            ] }) });
          if (!upstream.ok) {
            const detail = await upstream.text();
            return send(res, upstream.status, { error: detail.slice(0, 2000), retryAfter: upstream.headers.get('retry-after'), requestId: upstream.headers.get('x-request-id'), code: upstream.status === 429 ? 'rate-limit' : upstream.status === 401 ? 'ai-auth' : upstream.status === 403 ? 'permission' : 'api' });
          }
          const result = await readCompletedResponse(upstream.body);
          const parsed = parseScreeningResponse(result.text);
          return send(res, 200, { answers: validateAnswers(parsed?.answers, questions, { generative: true, state }), model: result.model, usage: result.usage, effectiveEffort: result.effectiveEffort });
          } finally { session.controllers.delete(controller); }
        }
        return send(res, 404, { error: 'Unknown route' });
      }
      if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/auth/')) return send(res, 404, { error: 'Unknown route' });
      if (req.method !== 'GET') return send(res, 405, { error: 'Method not allowed' });
      const root = resolve('dist');
      let path = resolve(root, `.${decodeURIComponent(url.pathname)}`);
      if (!path.startsWith(root + sep) && path !== root) return send(res, 403, { error: 'Invalid path' });
      if (!extname(path)) path = resolve(root, 'index.html');
      const content = await readFile(path);
      const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg' };
      res.writeHead(200, { 'Content-Type': mime[extname(path)] || 'application/octet-stream', 'X-Content-Type-Options': 'nosniff' }); res.end(content);
    } catch (error) {
      const code = error.name === 'TimeoutError' ? 'timeout' : typeof error.code === 'string' ? error.code : 'api';
      if (!res.destroyed) send(res, error.status || (code === 'timeout' ? 504 : 500), { error: error.message, code,
        criterionId: error.criterionId, receivedType: error.receivedType, reason: error.reason, requestId: error.requestId, retryAfter: error.retryAfter });
    }
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const localDir = resolve('.local');
  await mkdir(localDir, { recursive: true });
  let registration;
  try { registration = JSON.parse(await readFile(resolve(localDir, 'chatgpt-host.json'), 'utf8')); }
  catch { registration = { hostId: `urn:uuid:${randomUUID()}` }; }
  const saveRegistration = async () => {
    const path = resolve(localDir, 'chatgpt-host.json');
    await writeFile(path, JSON.stringify(registration), { mode: 0o600 });
  };
  await saveRegistration();
  const port = Number(process.env.CHATGPT_PORT || 1455);
  createChatgptServer({ port, registration, saveRegistration }).listen(port, '127.0.0.1', () => console.log(`SysReview + AI OAuth: http://127.0.0.1:${port}`));
}

