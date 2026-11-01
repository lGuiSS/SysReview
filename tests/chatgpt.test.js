import test from 'node:test';
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { request } from 'node:http';
import { generateKeyPairSync, sign, createHash } from 'node:crypto';
import { createChatgptServer } from '../server/chatgptServer.js';
import { ISSUER, SCOPES, validateIdentity, validateAnswers, readCompletedResponse, parseScreeningResponse } from '../server/chatgptProtocol.js';

const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const jwk = { ...publicKey.export({ format: 'jwk' }), kid: 'test' };
const jwt = claims => {
  const unsigned = [ { alg: 'RS256', kid: 'test' }, { iss: ISSUER, aud: 'oaiapp_test', sub: 'subject', exp: Date.now() / 1000 + 300, nonce: 'nonce', ...claims } ]
    .map(v => Buffer.from(JSON.stringify(v)).toString('base64url')).join('.');
  return `${unsigned}.${sign('RSA-SHA256', Buffer.from(unsigned), privateKey).toString('base64url')}`;
};
const stream = events => new Response(events.map(e => `data: ${JSON.stringify(e)}\n\n`).join(''));
const completed = { type: 'response.completed', response: { status: 'completed', model: 'account-model', usage: { input_tokens: 21 },
  output: [{ content: [{ type: 'output_text', text: '{"answers":{"inc_I1":{"status":"assessed","noul":0.9,"evidence":"Study"}}}' }] }] } };

test('ID tokens require valid signature, nonce, issuer, audience and expiration', () => {
  const options = { clientId: 'oaiapp_test', nonce: 'nonce' };
  assert.equal(validateIdentity(jwt({}), [jwk], options).sub, 'subject');
  for (const claims of [{ nonce: 'wrong' }, { iss: 'bad' }, { aud: 'wrong' }, { exp: 0 }]) {
    assert.throws(() => validateIdentity(jwt(claims), [jwk], options));
  }
  assert.throws(() => validateIdentity(jwt({}).slice(0, -8) + 'bad', [jwk], options));
});
test('reject malformed or missing probabilities rather than applying an invented decision', () => {
  const q = { a: { type: 'noul' }, b: { type: 'score' } };
  assert.deepEqual(validateAnswers({ a: { noul: 0.5 }, b: { score: 1 } }, q), { a: { noul: 0.5 }, b: { score: 1 } });
  for (const answers of [{}, { a: { noul: 2 }, b: { score: 1 } }, { a: { noul: '1' }, b: { score: 1 } }, { a: { noul: 1 }, b: { score: 3 } }]) assert.throws(() => validateAnswers(answers, q));
});
test('SSE must complete; late failures and incomplete streams fail', async () => {
  assert.equal((await readCompletedResponse(stream([completed]).body)).usage.input_tokens, 21);
  await assert.rejects(readCompletedResponse(stream([{ type: 'response.output_text.delta', delta: 'text' }]).body));
  await assert.rejects(readCompletedResponse(stream([completed, { type: 'response.failed', response: { error: { code: 'usage_limit' } } }]).body), /usage_limit/);
  const bytes = new TextEncoder().encode(`data: ${JSON.stringify(completed)}\r\n\r\n`);
  const chunks = (async function* () { for (const b of bytes) yield new Uint8Array([b]); })();
  assert.equal((await readCompletedResponse(chunks)).model, 'account-model');
});

test('local HTTP OAuth lifecycle: PKCE, one-time callback, scopes, catalog, screening, logout, CSRF', async t => {
  let authUrl, verifier, inferenceBody, tokenScope = SCOPES, responseEvent = completed;
  const service = createChatgptServer({ fetchImpl: async (url, options) => {
    if (url.endsWith('/oauth/token')) {
      verifier = new URLSearchParams(options.body).get('code_verifier');
      return Response.json({ access_token: 'secret-token', refresh_token: 'secret-refresh', expires_in: 3600, scope: tokenScope,
        id_token: jwt({ nonce: authUrl.searchParams.get('nonce') }) });
    }
    if (url.endsWith('/jwks.json')) return Response.json({ keys: [jwk] });
    assert.equal(options.headers.Authorization, 'Bearer secret-token');
    if (url.endsWith('/models')) return Response.json({ models: [{ visibility: 'list', slug: 'account-model', display_name: 'Account Model' }, { visibility: 'hidden', slug: 'hidden' }] });
    inferenceBody = JSON.parse(options.body); return stream([responseEvent]);
  } });
  await new Promise(resolve => service.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => service.close(resolve)));
  const base = `http://127.0.0.1:${service.address().port}`;
  let cookie = '';
  const call = async (path, body, extra = {}) => {
    const res = await new Promise((resolve, reject) => {
      const req = request(base + path, { method: body ? 'POST' : 'GET', headers: { Host: '127.0.0.1:1455',
        'X-Sysreview-Client': '1', Cookie: cookie, ...extra } }, incoming => {
        const chunks = [];
        incoming.on('data', chunk => chunks.push(chunk));
        incoming.on('end', () => resolve(new Response(Buffer.concat(chunks), { status: incoming.statusCode, headers: incoming.headers })));
      });
      req.on('error', reject); req.end(body ? JSON.stringify(body) : undefined);
    });
    if (res.headers.get('set-cookie')) cookie = res.headers.get('set-cookie').split(';')[0];
    return res;
  };
  assert.equal((await call('/api/chatgpt/start', {}, { Origin: 'https://evil.example' })).status, 403);
  assert.equal((await call('/api/gemini/status')).status, 404);
  assert.equal((await call('/auth/gemini/callback?state=old')).status, 404);
  assert.equal((await call('/api/chatgpt/status', null, { Host: 'evil.example' })).status, 403);
  assert.equal((await call('/api/chatgpt/evaluate', { model: 'account-model', state: {}, questions: { a: {} } })).status, 401);
  authUrl = new URL((await (await call('/api/chatgpt/start', {})).json()).url);
  assert.equal(authUrl.searchParams.get('client_id'), 'dynamic_agent_client');
  assert.equal(authUrl.searchParams.get('redirect_uri'), 'http://127.0.0.1:1455/auth/callback');
  assert.equal((await call('/auth/callback?state=invalid&code=x')).status, 400);
  const callback = `/auth/callback?${new URLSearchParams({ state: authUrl.searchParams.get('state'), client_id: 'oaiapp_test', code: 'valid' })}`;
  assert.equal((await call(callback)).status, 200);
  assert.equal(createHash('sha256').update(verifier).digest('base64url'), authUrl.searchParams.get('code_challenge'));
  assert.equal((await call(callback)).status, 400);
  const status = await (await call('/api/chatgpt/status')).json(); assert.equal(status.connected, true);
  assert.ok(!JSON.stringify(status).includes('secret'));
  assert.equal((await (await call('/api/chatgpt/models')).json()).models.length, 1);
  const result = await (await call('/api/chatgpt/evaluate', { model: 'gpt-6-luna', effort: 'low', connectionId: status.connectionId,
    state: { title: 'Study' }, questions: { inc_I1: { type: 'noul' } } })).json();
  assert.equal(result.answers.inc_I1.noul, 0.9); assert.equal(inferenceBody.store, false); assert.equal(inferenceBody.stream, true);
  assert.equal(inferenceBody.reasoning.effort, 'low');
  assert.equal(inferenceBody.text.format.strict, true);
  assert.deepEqual(inferenceBody.text.format.schema.properties.answers.required, ['inc_I1']);
  const payload = { model: 'gpt-6-luna', connectionId: status.connectionId, state: { title: 'Study' }, questions: { inc_I1: { type: 'noul' } } };
  const eventFor = answer => ({ ...completed, response: { ...completed.response, output: [{ content: [{ type: 'output_text', text: JSON.stringify({ answers: { inc_I1: answer } }) }] }] } });
  responseEvent = eventFor({ status: 'assessed', noul: .99, evidence: 'Invented quote' });
  const unverified = await (await call('/api/chatgpt/evaluate', payload)).json();
  assert.equal(unverified.answers.inc_I1.noul, null);
  assert.equal(unverified.answers.inc_I1.reason, 'evidence-not-found');
  responseEvent = { ...completed, response: { ...completed.response, output: [
    { type: 'message', role: 'assistant', phase: 'commentary', content: [{ type: 'output_text', text: 'Assessing study.' }] },
    { type: 'message', role: 'assistant', phase: 'final_answer', content: completed.response.output[0].content },
  ] } };
  const finalOnly = await (await call('/api/chatgpt/evaluate', payload)).json();
  assert.equal(finalOnly.answers.inc_I1.noul, .9);
  responseEvent = { ...completed, response: { ...completed.response, output: [] } };
  const emptyResponse = await call('/api/chatgpt/evaluate', payload);
  assert.equal(emptyResponse.status, 422);
  assert.equal((await emptyResponse.json()).reason, 'empty-output');
  responseEvent = eventFor({ status: 'assessed', noul: '0.99', evidence: 'Study' });
  const invalid = await call('/api/chatgpt/evaluate', payload);
  assert.equal(invalid.status, 422);
  const diagnostic = await invalid.json();
  assert.equal(diagnostic.reason, 'answer-value'); assert.equal(diagnostic.criterionId, 'inc_I1');
  assert.equal((await call('/api/chatgpt/evaluate', { model: 'gpt-6-luna', connectionId: 'old-connection', state: {}, questions: { inc_I1: { type: 'noul' } } })).status, 401);
  await call('/api/chatgpt/logout', {});
  assert.equal((await (await call('/api/chatgpt/status')).json()).connected, false);
  tokenScope = 'openid profile email';
  authUrl = new URL((await (await call('/api/chatgpt/start', {})).json()).url);
  await call(`/auth/callback?${new URLSearchParams({ state: authUrl.searchParams.get('state'), client_id: 'oaiapp_test', code: 'identity-only' })}`);
  assert.equal((await (await call('/api/chatgpt/status')).json()).connected, false);
  assert.equal((await call('/api/chatgpt/models')).status, 401);
});

test('streamed output text is reconstructed when completion carries only metadata', async () => {
  const text = completed.response.output[0].content[0].text;
  const end = { type: 'response.completed', response: { status: 'completed', output: [], usage: { input_tokens: 7 } } };
  for (const events of [
    [{ type: 'response.output_text.delta', output_index: 0, content_index: 0, delta: text.slice(0, 15) },
      { type: 'response.output_text.delta', output_index: 0, content_index: 0, delta: text.slice(15) }, end],
    [{ type: 'response.output_text.done', output_index: 1, content_index: 0, text }, end],
    [{ type: 'response.output_item.done', output_index: 0, item: { type: 'message', role: 'assistant', content: [{ type: 'output_text', text }] } }, end],
  ]) {
    const result = await readCompletedResponse(stream(events).body);
    assert.equal(result.text, text); assert.equal(result.usage.input_tokens, 7);
    assert.equal(parseScreeningResponse(result.text).answers.inc_I1.noul, .9);
  }
});

test('final answer excludes commentary and reasoning and does not duplicate delta/done text', async () => {
  const text = completed.response.output[0].content[0].text;
  const item = { type: 'message', role: 'assistant', phase: 'final_answer', content: [{ type: 'output_text', text }] };
  const end = { type: 'response.completed', response: { status: 'completed', output: [
    { type: 'message', role: 'assistant', phase: 'commentary', content: [{ type: 'output_text', text: 'I will assess the criteria.' }] },
    { type: 'reasoning', content: [{ type: 'reasoning_text', text: 'Not an answer' }] }, item,
  ] } };
  const result = await readCompletedResponse(stream([
    { type: 'response.output_text.delta', output_index: 2, content_index: 0, delta: text },
    { type: 'response.output_text.done', output_index: 2, content_index: 0, text }, end,
  ]).body);
  assert.equal(result.text, text);
  assert.equal(parseScreeningResponse(result.text).answers.inc_I1.noul, .9);
});

test('whole JSON fences are accepted but prose, truncated JSON and empty output remain errors', () => {
  const text = completed.response.output[0].content[0].text;
  assert.deepEqual(parseScreeningResponse('```json\n' + text + '\n```'), JSON.parse(text));
  assert.deepEqual(parseScreeningResponse('\ufeff ' + text), JSON.parse(text));
  for (const [value, reason] of [['', 'empty-output'], [' ', 'empty-output'], [text.slice(0, -1), 'json-syntax'], ['Result: ' + text, 'json-syntax']]) {
    assert.throws(() => parseScreeningResponse(value), e => e.code === 'response-invalid' && e.reason === reason && !e.message.includes('inc_I1'));
  }
});

test('partial or refused streams never become successful evaluations', async () => {
  const delta = { type: 'response.output_text.delta', output_index: 0, content_index: 0, delta: '{"answers":{}}' };
  await assert.rejects(readCompletedResponse(stream([delta]).body), e => e.code === 'response-incomplete');
  await assert.rejects(readCompletedResponse(stream([delta, { type: 'response.incomplete' }]).body), e => e.code === 'response-incomplete');
  await assert.rejects(readCompletedResponse(stream([{ type: 'response.refusal.done' }, completed]).body), e => e.code === 'refusal');
});
