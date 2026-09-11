import test from 'node:test';
import assert from 'node:assert/strict';
import { CanvasClient, requestUrl, validateNextPage, blockedAssessmentUrl, blockedCanvasFileRead } from '../src/canvas-client.js';

const json = (body, headers = {}) => new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json', ...headers } });

test('collector exposes metadata reads only and explicitly preserves Inbox read state', () => {
  const url = requestUrl('https://canvas.example', 'conversation', { conversationId: 7 });
  assert.equal(url.searchParams.get('auto_mark_as_read'), 'false');
  for (const operation of ['take', 'resume', 'questions', 'submissions', 'modules', 'moduleItems', 'constructor', '__proto__']) {
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

test('expanded collection reads page bodies and message details without read-state writes', async () => {
  const visited = [];
  const client = new CanvasClient({ origin: 'https://canvas.example', fetcher: async (address, init) => {
    assert.equal(init.method, 'GET');
    const url = new URL(address); visited.push(url);
    if (url.pathname.endsWith('/pages')) { assert.equal(url.searchParams.get('include[]'), 'body'); return json([{ page_id: 2, title: 'Locked page' }]); }
    assert.equal(url.pathname.includes('/modules'), false, 'Module reads must never reach the transport');
    if (url.pathname === '/api/v1/conversations') return json([{ id: 5 }]);
    if (url.pathname === '/api/v1/conversations/5') { assert.equal(url.searchParams.get('auto_mark_as_read'), 'false'); return json({ id: 5, messages: [{ id: 6, body: 'Deadline moved' }] }); }
    return json(url.pathname === '/api/v1/courses/1' ? { id: 1 } : []);
  } });
  const [result] = await client.collect(['1']);
  assert.equal(result.sources.conversation[0].data.messages[0].body, 'Deadline moved');
  assert.equal(result.coverage.find(source => source.source === 'pageBodies').status, 'partial');
  assert.equal(result.coverage.find(source => source.source === 'modules').status, 'unsupported');
  assert.equal(Object.hasOwn(result.sources, 'modules'), false);
  assert.equal(visited.some(url => url.pathname.includes('/take') || url.pathname.includes('/questions')), false);
});

test('module progress routes are denied in the login browser as well as the collector', () => {
  for (const route of ['/api/v1/courses/1/modules', '/api/v1/courses/1/modules/2/items', '/courses/1/modules', '/courses/1/modules/2', '/courses/1/modules/items/3']) {
    assert.equal(blockedAssessmentUrl('https://canvas.example' + route), true, route);
  }
});

test('file content routes are distinct from metadata and never followed during collection', async () => {
  for (const route of ['/files/2', '/files/2/download?preview=1', '/courses/1/files/2/preview', '/api/v1/files/2/public_url', '/api/v1/courses/1/files/2?view=true', '/courses/1/file_contents/lecture.pdf', '/courses/1/%66iles/2/download', '/courses/1/%2566iles/2/download', '/courses/1/%2566iles%252f2/download']) {
    assert.equal(blockedCanvasFileRead('https://files.example' + route), true, route);
  }
  for (const route of ['/api/v1/courses/1/files', '/data311/files/lecture.pdf', '/login/saml']) assert.equal(blockedCanvasFileRead('https://canvas.example' + route), false, route);
  const requests = [];
  const client = new CanvasClient({ origin: 'https://canvas.example', fetcher: async address => {
    const url = new URL(address); requests.push(url.pathname);
    assert.equal(blockedCanvasFileRead(address), false);
    return json(url.pathname.endsWith('/files') ? [{ id: 2, display_name: 'Syllabus.pdf', url: 'https://files.example/files/2/download?verifier=fixture-secret' }] : url.pathname === '/api/v1/courses/1' ? { id: 1 } : []);
  } });
  const [result] = await client.collect(['1']);
  assert.equal(requests.length, 9);
  assert.equal(result.sources.files[0].display_name, 'Syllabus.pdf');
  assert.match(result.coverage.find(source => source.source === 'fileContents').message, /update module progress/);
});
