import test from 'node:test';
import assert from 'node:assert/strict';
import { CanvasClient, requestUrl, validateNextPage, blockedAssessmentUrl, blockedCanvasFileRead } from '../src/canvas-client.js';

const json = (body, headers = {}) => new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json', ...headers } });

test('collector excludes assessment actions and withdrawn conversation serializers', () => {
  for (const operation of ['conversations', 'conversation', 'take', 'resume', 'questions', 'submissions', 'assignments', 'quizzes', 'pages', 'modules', 'moduleItems', 'constructor', '__proto__']) {
    assert.throws(() => requestUrl('https://canvas.example', operation));
  }
  assert.throws(() => requestUrl('https://canvas.example', 'files', { courseId: '../7' }));
  for (const route of ['/courses/1/quizzes/2/take', '/courses/1/quizzes/2/resume', '/api/v1/quiz_submissions', '/courses/1/external_tools/4', '/courses/1/quizzes/2/%74ake']) {
    assert.equal(blockedAssessmentUrl('https://canvas.example' + route), true, route);
  }
  assert.equal(blockedAssessmentUrl('https://canvas.example/courses/1/quizzes/2'), false);
});

test('pagination rejects other origins, routes, credentials and changed read flags', () => {
  const initial = requestUrl('https://canvas.example', 'files', { courseId: 7 });
  for (const next of ['https://evil.example/api/v1/conversations/7', 'https://canvas.example/api/v1/courses/7/files?only[]=names&only[]=body', 'https://canvas.example/api/v1/conversations/7?auto_mark_as_read=false&delete=true', 'https://user:password@canvas.example/api/v1/conversations/7', 'https://canvas.example/api/v1/quizzes/7/take']) {
    assert.throws(() => validateNextPage(next, initial));
  }
});

test('list reads paginate with GET only and never follow a login redirect', async () => {
  const requests = [];
  const initial = requestUrl('https://canvas.example', 'files', { courseId: 1 });
  const next = new URL(initial); next.searchParams.set('page', '2');
  const client = new CanvasClient({ origin: 'https://canvas.example', token: 'test-token', fetcher: async (url, init) => {
    requests.push({ url, init });
    return requests.length === 1 ? json([{ id: 1 }], { link: `<${next}>; rel="next"` }) : json([{ id: 2 }]);
  } });
  assert.deepEqual(await client.read('files', { courseId: 1 }, true), [{ id: 1 }, { id: 2 }]);
  assert.equal(requests.length, 2);
  assert.ok(requests.every(request => request.init.method === 'GET' && request.init.redirect === 'manual'));
  const redirected = new CanvasClient({ origin: 'https://canvas.example', fetcher: async () => new Response('', { status: 302, headers: { location: 'https://evil.example' } }) });
  await assert.rejects(redirected.read('courses', {}, true), /redirected/);
});

test('paused collection fails before audit, transport or progress callbacks', async () => {
  let calls = 0;
  const client = new CanvasClient({ origin: 'https://canvas.example', fetcher: async () => { calls++; }, audit: async () => { calls++; }, onProgress: () => { calls++; } });
  assert.match(client.collectionIssue, /refresh is paused/);
  await assert.rejects(client.collect(['1']), /safety repair/);
  for (const operation of ['assignments', 'quizzes', 'pages']) await assert.rejects(client.read(operation, { courseId: 1 }, true), /not permitted/);
  assert.equal(calls, 0);
});

test('cancelled collection stops without returning a successful snapshot', async () => {
  const controller = new AbortController(); controller.abort();
  const client = new CanvasClient({ origin: 'https://canvas.example', signal: controller.signal, fetcher: () => { throw new Error('Must not fetch'); } });
  await assert.rejects(client.collect(['1']), { name: 'AbortError' });
});

test('file names use a protected parameter and never request lock state or contents', async () => {
  const initial = requestUrl('https://canvas.example', 'files', { courseId: 1 });
  assert.equal(initial.searchParams.get('only[]'), 'names');
  for (const change of ['drop', 'replace', 'duplicate']) {
    const altered = new URL(initial);
    if (change === 'drop') altered.searchParams.delete('only[]');
    else if (change === 'replace') altered.searchParams.set('only[]', 'all');
    else altered.searchParams.append('only[]', 'names');
    assert.throws(() => validateNextPage(altered, initial));
  }
  const requests = [];
  const client = new CanvasClient({ origin: 'https://canvas.example', fetcher: async address => {
    requests.push(address);
    assert.equal(new URL(address).searchParams.get('only[]'), 'names');
    return json([{ id: 2, display_name: 'Syllabus.pdf' }]);
  } });
  assert.deepEqual(await client.read('files', { courseId: 1 }, true), [{ id: 2, display_name: 'Syllabus.pdf' }]);
  assert.equal(requests.length, 1);
});

test('module progress routes are denied in the login browser as well as the collector', () => {
  for (const route of ['/api/v1/courses/1/modules', '/api/v1/courses/1/modules/2/items', '/courses/1/modules', '/courses/1/modules/2', '/courses/1/modules/items/3']) {
    assert.equal(blockedAssessmentUrl('https://canvas.example' + route), true, route);
  }
});

test('file content routes remain blocked independently of the collection hold', async () => {
  for (const route of ['/files/2', '/files/2/download?preview=1', '/courses/1/files/2/preview', '/api/v1/files/2/public_url', '/api/v1/courses/1/files/2?view=true', '/courses/1/file_contents/lecture.pdf', '/courses/1/%66iles/2/download', '/courses/1/%2566iles/2/download', '/courses/1/%2566iles%252f2/download']) {
    assert.equal(blockedCanvasFileRead('https://files.example' + route), true, route);
  }
  for (const route of ['/api/v1/courses/1/files', '/data311/files/lecture.pdf', '/login/saml']) assert.equal(blockedCanvasFileRead('https://canvas.example' + route), false, route);
});
