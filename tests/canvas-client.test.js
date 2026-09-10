import test from 'node:test';
import assert from 'node:assert/strict';
import { CanvasClient, requestUrl, validateNextPage, blockedAssessmentUrl } from '../src/canvas-client.js';

const json = (body, headers = {}) => new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json', ...headers } });

test('collector exposes metadata reads only and explicitly preserves Inbox read state', () => {
  const url = requestUrl('https://canvas.example', 'conversation', { conversationId: 7 });
  assert.equal(url.searchParams.get('auto_mark_as_read'), 'false');
  for (const operation of ['take', 'resume', 'questions', 'submissions', 'constructor', '__proto__']) {
    assert.throws(() => requestUrl('https://canvas.example', operation));
  }
  assert.throws(() => requestUrl('https://canvas.example', 'quizzes', { courseId: '../7' }));
  for (const route of ['/courses/1/quizzes/2/take', '/courses/1/quizzes/2/resume', '/api/v1/quiz_submissions', '/courses/1/external_tools/4', '/courses/1/quizzes/2/%74ake']) {
    assert.equal(blockedAssessmentUrl('https://canvas.example' + route), true, route);
  }
  assert.equal(blockedAssessmentUrl('https://canvas.example/courses/1/quizzes/2'), false);
});

test('pagination rejects other origins, routes, credentials and changed read flags', () => {
  const initial = requestUrl('https://canvas.example', 'conversation', { conversationId: 7 });
  for (const next of ['https://evil.example/api/v1/conversations/7', 'https://canvas.example/api/v1/conversations/7?auto_mark_as_read=true', 'https://canvas.example/api/v1/conversations/7?auto_mark_as_read=false&delete=true', 'https://user:password@canvas.example/api/v1/conversations/7', 'https://canvas.example/api/v1/quizzes/7/take']) {
    assert.throws(() => validateNextPage(next, initial));
  }
});

test('list reads paginate with GET only and never follow a login redirect', async () => {
  const requests = [];
  const initial = requestUrl('https://canvas.example', 'assignments', { courseId: 1 });
  const next = new URL(initial); next.searchParams.set('page', '2');
  const client = new CanvasClient({ origin: 'https://canvas.example', token: 'test-token', fetcher: async (url, init) => {
    requests.push({ url, init });
    return requests.length === 1 ? json([{ id: 1 }], { link: `<${next}>; rel="next"` }) : json([{ id: 2 }]);
  } });
  assert.deepEqual(await client.read('assignments', { courseId: 1 }, true), [{ id: 1 }, { id: 2 }]);
  assert.equal(requests.length, 2);
  assert.ok(requests.every(request => request.init.method === 'GET' && request.init.redirect === 'manual'));
  const redirected = new CanvasClient({ origin: 'https://canvas.example', fetcher: async () => new Response('', { status: 302, headers: { location: 'https://evil.example' } }) });
  await assert.rejects(redirected.read('courses', {}, true), /redirected/);
});

test('partial collection records failures and does not manufacture empty successful sources', async () => {
  const client = new CanvasClient({ origin: 'https://canvas.example', fetcher: async url => {
    if (url.includes('/quizzes')) return new Response('', { status: 403 });
    return json(url.includes('/courses/1?') ? { id: 1 } : []);
  } });
  const [record] = await client.collect(['1']);
  assert.equal(record.coverage.find(item => item.source === 'quizzes').status, 'error');
  assert.equal(Object.hasOwn(record.sources, 'quizzes'), false);
  assert.equal(record.coverage.find(item => item.source === 'assignments').status, 'ok');
});

test('cancelled collection stops without returning a successful snapshot', async () => {
  const controller = new AbortController(); controller.abort();
  const client = new CanvasClient({ origin: 'https://canvas.example', signal: controller.signal, fetcher: () => { throw new Error('Must not fetch'); } });
  await assert.rejects(client.collect(['1']), { name: 'AbortError' });
});
