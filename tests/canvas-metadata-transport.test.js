import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { CanvasMetadataTransport, CanvasCollectionStoppedError } from '../src/canvas-metadata-transport.js';
import { courseSyllabusRequest } from '../src/canvas-syllabus.js';
import { courseRubricsRequest } from '../src/canvas-rubrics.js';
import { CanvasAudit } from '../src/canvas-audit.js';
import { metadataRequest } from '../src/canvas-metadata.js';
import { enrollmentScopeRequest } from '../src/canvas-enrollment-scope.js';
import { ownSubmissionRequest } from '../src/canvas-own-submission.js';
import { courseConversationsRequest, conversationTextRequest } from '../src/canvas-message-candidate.js';

const request = () => metadataRequest('assignments', '1', '99');
const response = () => new Response('{"data":{"course":null}}', { headers: { 'content-type': 'application/json', 'x-canvas-user-id': '90099' } });
function fixture(options = {}) {
  const connection = new AbortController();
  const events = [];
  const sent = [];
  let transport;
  let id = 0;
  const details = (init, overrides = {}) => ({ id: ++id,
    url: 'https://canvas.example' + (init.method === 'GET' ? '/api/v1/accounts?per_page=1' : '/api/graphql'), method: init.method, webContentsId: 0,
    resourceType: 'other', ...(init.body === undefined ? {} : { uploadData: [{ bytes: Buffer.from(init.body) }] }), ...overrides });
  transport = new CanvasMetadataTransport({ origin: 'https://canvas.example', courseId: '1', studentId: '99', globalUserId: '90099', connectionSignal: connection.signal,
    authentication: async () => ({ kind: 'session', value: 'fixture-csrf-secret' }),
    audit: async event => events.push(event),
    fetcher: async (url, init) => {
      sent.push({ url, init });
      assert.equal(transport.allows(details(init)), true);
      return init.method === 'GET' ? new Response('[]', { headers: { 'content-type': 'application/json', 'x-canvas-user-id': '90099' } }) : response();
    }, ...options });
  return { transport, connection, events, sent, details };
}

test('rubric reads require observed assignments, reject generic bodies and keep content out of audit', async () => {
  let value = { data: { course: { _id: '1', name: 'Example course', courseCode: 'EX 1', assignmentsConnection: {
    nodes: [{ _id: '10', courseId: '1', name: 'Preparation', state: 'published', pointsPossible: 5, submissionTypes: ['online_upload'],
      rubricAssociation: { associationId: '10', associationType: 'Assignment', useForGrading: true },
      rubric: { _id: '40', title: 'Private rubric title', freeFormCriterionComments: true, criteria: [{ _id: 'c1', description: 'Private rubric criterion', longDescription: null, criterionUseRange: false, ignoreForScoring: false, ratings: null }] } }],
    pageInfo: { hasNextPage: false, endCursor: null },
  } } } };
  const setup = fixture({ fetcher: async (_url, init) => {
    assert.equal(setup.transport.allows(setup.details(init, { uploadData: [{ bytes: Buffer.from(init.body + ' ') }] })), false);
    assert.equal(setup.transport.allows(setup.details(init)), true);
    return new Response(JSON.stringify(value), { headers: { 'content-type': 'application/json', 'x-canvas-user-id': '90099' } });
  } });
  await assert.rejects(setup.transport.readCourseRubrics(), /Read assignments/);
  await assert.rejects(setup.transport.request(courseRubricsRequest('1')), /not permitted/);
  assert.equal(setup.events.length, 0);
  await setup.transport.readAssignmentPage();
  const result = await setup.transport.readCourseRubrics();
  assert.equal(result.nodes[0].rubric.criteria[0].description, 'Private rubric criterion');
  assert.doesNotMatch(JSON.stringify(setup.events), /Private rubric/);
  assert.ok(setup.events.some(event => event.operation === 'courserubrics' && event.event === 'body-read'));
  value.data.course.assignmentsConnection.nodes[0]._id = '11';
  value.data.course.assignmentsConnection.nodes[0].rubricAssociation.associationId = '11';
  await assert.rejects(setup.transport.readCourseRubrics(), /changed during collection/);
  setup.connection.abort();
  await assert.rejects(setup.transport.readCourseRubrics(), { name: 'AbortError' });
});

test('direct submission reads require fresh validated assignment scope and keep exact transport binding', async () => {
  let authCalls = 0;
  let value = { data: { course: { _id: '1', name: 'Example course', courseCode: 'DEMO', assignmentsConnection: {
    nodes: [{ _id: '10', courseId: '1', name: 'Preparation', state: 'published', pointsPossible: 5, submissionTypes: ['online_upload'] }],
    pageInfo: { hasNextPage: false, endCursor: null },
  } } } };
  const context = fixture({ authentication: () => { authCalls++; return { kind: 'session', value: 'fixture-csrf' }; },
    fetcher: async (_url, init) => {
      context.sent.push(init);
      assert.equal(context.transport.allows(context.details(init)), true);
      return new Response(JSON.stringify(value), { headers: { 'content-type': 'application/json', 'x-canvas-user-id': '90099' } });
    } });
  assert.equal(context.transport.remainingRequests, 200);
  await assert.rejects(context.transport.readOwnSubmission('10'), /Read this assignment/);
  await assert.rejects(context.transport.request(ownSubmissionRequest('10', '99')), /not permitted/);
  assert.equal(authCalls, 0);
  await context.transport.readAssignmentPage();
  assert.equal(context.transport.remainingRequests, 199);
  await assert.rejects(context.transport.readOwnSubmission('11'), /Read this assignment/);
  assert.equal(authCalls, 1);
  value = { data: { submission: { _id: '20', assignmentId: '10', state: 'unsubmitted', cachedDueDate: null } } };
  assert.deepEqual(await context.transport.readOwnSubmission('10'), { id: '20', assignmentId: '10', state: 'unsubmitted', cachedDueDate: null });
  assert.equal(context.transport.remainingRequests, 198);
  assert.deepEqual(JSON.parse(context.sent[1].body), ownSubmissionRequest('10', '99'));
  assert.equal(context.events.filter(event => event.operation === 'metadataownsubmission' && event.event === 'body-read').length, 1);
  value = { data: { submission: null } };
  assert.equal(await context.transport.readOwnSubmission('10'), null);
  context.connection.abort();
  const before = authCalls;
  await assert.rejects(context.transport.readOwnSubmission('10'), { name: 'AbortError' });
  assert.equal(authCalls, before);
});

test('foreign assignment pages cannot extend the direct submission scope', async () => {
  const context = fixture({ fetcher: async (_url, init) => {
    assert.equal(context.transport.allows(context.details(init)), true);
    return new Response(JSON.stringify({ data: { course: { _id: '2' } } }),
      { headers: { 'content-type': 'application/json', 'x-canvas-user-id': '90099' } });
  } });
  await assert.rejects(context.transport.readAssignmentPage(), /unavailable or incomplete/);
  await assert.rejects(context.transport.readOwnSubmission('10'), /Read this assignment/);
});

test('metadata transport rejects altered requests before authentication, audit or network', async () => {
  const setup = fixture({ authentication: () => assert.fail('Invalid requests must not load authentication') });
  for (const altered of [null, {}, { ...request(), operationName: 'CreateSubmission' }, metadataRequest('assignments', '2', '99'),
    courseConversationsRequest('1', '99'), conversationTextRequest('10'), courseSyllabusRequest('1'),
    { ...request(), operationName: 'CanvasWeeklySubmissionStates' }, { ...request(), query: 'mutation { submitAssignment }' }, { ...request(), session_token: 'x' },
    enrollmentScopeRequest('2', '99'), enrollmentScopeRequest('1', '100'),
    { ...enrollmentScopeRequest('1', '99'), query: enrollmentScopeRequest('1', '99').query.replace('excludeConcluded: false', 'excludeConcluded: true') }]) {
    await assert.rejects(setup.transport.request(altered), /not permitted/);
  }
  assert.deepEqual(setup.events, []);
  assert.deepEqual(setup.sent, []);
  assert.equal(setup.transport.allows(setup.details({ method: 'POST', body: JSON.stringify(request()) })), false);
  for (const origin of ['http://canvas.example', 'https://user@canvas.example', 'https://canvas.example/path', 'https://canvas.example?as_user_id=2']) {
    assert.throws(() => new CanvasMetadataTransport({ origin, courseId: '1', studentId: '99' }), /origin/);
  }
});

test('account preflight uses one fixed GET and returns only bound negative membership evidence', async () => {
  for (const kind of ['session', 'token']) {
    const setup = fixture({ authentication: async () => ({ kind, value: 'private-fixture-value' }) });
    const evidence = await setup.transport.checkAccountMembership();
    assert.deepEqual(evidence, { studentId: '99', globalUserId: '90099', accountMembership: 'none' });
    assert.ok(Object.isFrozen(evidence));
    assert.equal(setup.sent.length, 1);
    const { url, init } = setup.sent[0];
    assert.equal(url, 'https://canvas.example/api/v1/accounts?per_page=1');
    assert.equal(init.method, 'GET');
    assert.equal(init.redirect, 'manual');
    assert.equal(init.body, undefined);
    assert.equal(init.credentials, kind === 'session' ? 'include' : 'omit');
    assert.deepEqual(init.headers, { Accept: 'application/json', ...(kind === 'token' ? { Authorization: 'Bearer private-fixture-value' } : {}) });
    assert.deepEqual(setup.events.map(event => [event.operation, event.event]), [['accountscope', 'request'], ['accountscope', 'response'], ['accountscope', 'body-read']]);
    assert.doesNotMatch(JSON.stringify(setup.events), /private-|90099|studentId|per_page|bodyHash/);
  }
});

test('account GET cannot be borrowed, redirected, paginated or supplied with upload bytes', async () => {
  let setup;
  setup = fixture({ fetcher: async (_url, init) => {
    for (const change of [{ method: 'POST' }, { webContentsId: 5 }, { webContents: {} }, { frame: {} },
      { url: 'https://other.example/api/v1/accounts?per_page=1' },
      { url: 'https://canvas.example/api/v1/accounts?per_page=1&page=2' },
      { url: 'https://canvas.example/api/v1/accounts?per_page=1&as_user_id=100' },
      { url: 'https://canvas.example/api/v1/accounts?per_page=100' },
      { uploadData: [{ bytes: Buffer.from('') }] }, { uploadData: [{ file: 'private' }] }, { uploadData: null }]) {
      assert.equal(setup.transport.allows(setup.details(init, change)), false);
    }
    assert.equal(setup.transport.allows(setup.details(init, { uploadData: [] })), true);
    assert.equal(setup.transport.allows(setup.details(init)), false);
    return new Response('[]', { headers: { 'content-type': 'application/json', 'x-canvas-user-id': '90099',
      link: '<https://canvas.example/api/v1/accounts?page=first&per_page=1>; rel="current",<https://canvas.example/api/v1/accounts?per_page=1&page=first>; rel="first"' } });
  } });
  await setup.transport.checkAccountMembership();
  assert.equal(setup.transport.allows(setup.details({ method: 'GET' })), false);
});

test('account preflight rejects positive, malformed, incomplete and unauthenticated evidence without following links', async () => {
  const base = 'https://canvas.example/api/v1/accounts';
  const failures = [
    { body: '[{"id":1,"name":"private-admin-account"}]' }, { body: '{}' }, { body: 'null' }, { body: '[null]' },
    { status: 401 }, { status: 403 }, { status: 302, headers: { location: '/quizzes/1/take' } },
    { headers: { 'x-canvas-user-id': '90100' } }, { headers: { 'content-type': 'text/html' } },
    ...['', `<${base}?page=2&per_page=1>; rel="next"`, `<${base}?page=2&per_page=1>; rel="current"`,
      `<${base}?page=first&per_page=1&include[]=services>; rel="first"`,
      `<${base}?page=first&per_page=100>; rel="first"`, '<https://other.example/>; rel="last"',
      `<${base}?page=first&per_page=1>; rel="first",<${base}?page=first&per_page=1>; rel="first"`,
      'x'.repeat(8193)].map(link => ({ headers: { link } })),
  ];
  for (const failure of failures) {
    let setup, calls = 0;
    setup = fixture({ fetcher: async (_url, init) => {
      calls++;
      assert.ok(setup.transport.allows(setup.details(init)));
      return new Response(failure.body ?? '[]', { status: failure.status ?? 200,
        headers: { 'content-type': 'application/json', 'x-canvas-user-id': '90099', ...failure.headers } });
    } });
    await assert.rejects(setup.transport.checkAccountMembership(), error => !/private-admin|90100/.test(error.message));
    await assert.rejects(setup.transport.request(request()), /permissions could not be confirmed|Reconnect Canvas/);
    await assert.rejects(setup.transport.checkAccountMembership(), /permissions could not be confirmed|Reconnect Canvas/);
    assert.equal(calls, 1);
    assert.doesNotMatch(JSON.stringify(setup.events), /private-admin|90100|name/);
  }
});

test('isolated enrollment transport uses exact admission and distinct content-free audit events', async () => {
  const setup = fixture();
  await setup.transport.request(enrollmentScopeRequest('1', '99', 'private-cursor'));
  assert.equal(setup.sent.length, 1);
  assert.equal(setup.sent[0].init.method, 'POST');
  assert.deepEqual(JSON.parse(setup.sent[0].init.body), enrollmentScopeRequest('1', '99', 'private-cursor'));
  assert.deepEqual(setup.events.map(event => event.operation), ['metadataenrollments', 'metadataenrollments', 'metadataenrollments']);
  assert.equal(setup.events[0].paginated, true);
  assert.doesNotMatch(JSON.stringify(setup.events), /private-cursor|StudentEnrollment|studentId|query/);
});

test('account preflight cancels pending reads and does not invalidate another read merely for being busy', async () => {
  let setup, entered, release;
  const waiting = new Promise(resolve => { entered = resolve; });
  const held = new Promise(resolve => { release = resolve; });
  setup = fixture({ fetcher: async (_url, init) => {
    assert.ok(setup.transport.allows(setup.details(init)));
    entered();
    await held;
    return response();
  } });
  const metadata = setup.transport.request(request());
  await waiting;
  await assert.rejects(setup.transport.checkAccountMembership(), /already running/);
  release();
  await metadata;
  await setup.transport.request(request());

  let blocked, streamEntered;
  const started = new Promise(resolve => { streamEntered = resolve; });
  const cancellation = new AbortController();
  blocked = fixture({ fetcher: async (_url, init) => {
    assert.ok(blocked.transport.allows(blocked.details(init)));
    return new Response(new ReadableStream({ pull() { streamEntered(); } }, { highWaterMark: 0 }),
      { headers: { 'content-type': 'application/json', 'x-canvas-user-id': '90099' } });
  } });
  const accounts = blocked.transport.checkAccountMembership(cancellation.signal);
  await started;
  cancellation.abort();
  await assert.rejects(accounts, { name: 'AbortError' });
  await assert.rejects(blocked.transport.request(request()), /permissions could not be confirmed/);
  assert.deepEqual(blocked.events.map(event => event.event), ['request', 'response', 'read-error']);
});

test('metadata identity mismatches reject the body and prevent reuse of the transport', async () => {
  for (const identityHeaders of [{}, { 'x-canvas-user-id': '99' }, { 'x-canvas-user-id': '90099, 90100' },
    { 'x-canvas-user-id': '90099', 'x-canvas-real-user-id': '90100' }]) {
    let setup, cancelled = false, calls = 0;
    setup = fixture({ fetcher: async (_url, init) => {
      calls++;
      assert.ok(setup.transport.allows(setup.details(init)));
      return { status: 200, headers: new Headers({ 'content-type': 'application/json', ...identityHeaders }),
        body: { getReader() { assert.fail('Identity must be checked before accepting any response data'); }, async cancel() { cancelled = true; } } };
    } });
    await assert.rejects(setup.transport.request(request()), /Reconnect Canvas/);
    assert.equal(cancelled, true);
    await assert.rejects(setup.transport.request(request()), /Reconnect Canvas/);
    assert.equal(calls, 1);
    assert.deepEqual(setup.events.map(event => event.event), ['request', 'response', 'read-error']);
    assert.doesNotMatch(JSON.stringify(setup.events), /90099|90100|x-canvas/);
  }
  for (const globalUserId of [undefined, '0', 99, '099', 'private-invalid-identity']) {
    assert.throws(() => fixture({ globalUserId }), /verified global Canvas account identity/);
  }
});

test('admission binds actual bytes once and rejects browser borrowing, files, blobs and route changes', async () => {
  let setup;
  setup = fixture({ fetcher: async (_url, init) => {
    const bytes = Buffer.from(init.body);
    for (const change of [
      { method: 'GET' }, { webContentsId: 7 }, { webContents: {} }, { frame: {} }, { id: -1 },
      { url: 'https://canvas.example/api/graphql?course_id=1' }, { url: 'https://other.example/api/graphql' },
      { uploadData: [] }, { uploadData: [{ bytes: Buffer.from('mutation { submit }') }] },
      { uploadData: [{ bytes, file: '' }] }, { uploadData: [{ bytes, blobUUID: '' }] },
      { uploadData: [{ bytes: new Uint8Array(bytes) }] }, { uploadData: [{ bytes: Buffer.concat([bytes, Buffer.from(' ')]) }] },
    ]) assert.equal(setup.transport.allows(setup.details(init, change)), false);
    const correct = setup.details(init, { uploadData: [{ bytes: bytes.subarray(0, 20) }, { bytes: bytes.subarray(20) }] });
    assert.equal(setup.transport.allows(correct), true);
    assert.equal(setup.transport.allows(correct), false, 'Admission is single-use');
    assert.equal(setup.transport.allows(setup.details(init)), false);
    return response();
  } });
  await setup.transport.request(request());
  assert.equal(setup.transport.allows(setup.details({ method: 'POST', body: JSON.stringify(request()) })), false);
});

test('session and token requests use fixed headers and sanitized audit records', async () => {
  for (const kind of ['session', 'token']) {
    const setup = fixture({ authentication: async () => ({ kind, value: 'private-fixture-value' }) });
    assert.deepEqual(await setup.transport.request(request()), { data: { course: null } });
    const { url, init } = setup.sent[0];
    assert.equal(url, 'https://canvas.example/api/graphql');
    assert.equal(init.redirect, 'manual');
    assert.equal(init.method, 'POST');
    assert.equal(init.credentials, kind === 'session' ? 'include' : 'omit');
    assert.deepEqual(init.headers, { Accept: 'application/json', 'Content-Type': 'application/json',
      ...(kind === 'session' ? { 'X-CSRF-Token': 'private-fixture-value' } : { Authorization: 'Bearer private-fixture-value' }) });
    assert.deepEqual(setup.events.map(event => event.event), ['request', 'response', 'body-read']);
    assert.match(setup.events[0].bodyHash, /^[a-f0-9]{64}$/);
    assert.equal(setup.events[0].method, 'POST');
    assert.equal(setup.events[0].courseId, '1', 'History identifies the course without storing query bodies or student IDs');
    assert.doesNotMatch(JSON.stringify(setup.events), /private-fixture|csrf|Authorization|studentId|query/);
  }
  for (const auth of [{ kind: 'session', value: 'bad\nheader' }, { kind: 'unknown', value: 'x' }, { kind: 'token', value: '' }]) {
    const setup = fixture({ authentication: async () => auth });
    await assert.rejects(setup.transport.request(request()), /Reconnect/);
    assert.equal(setup.events.length, 0);
    assert.equal(setup.sent.length, 0);
  }
  for (const authentication of [() => { throw new Error('private-cookie-error'); }, async () => { throw new Error('private-cookie-error'); }]) {
    const setup = fixture({ authentication });
    await assert.rejects(setup.transport.request(request()), { message: 'Reconnect Canvas before reading metadata.' });
    assert.equal(setup.events.length, 0);
    assert.equal(setup.sent.length, 0);
  }
});

test('redirects, login/scope errors, non-JSON and invalid body encodings stop without retry', async () => {
  for (const makeResponse of [
    () => new Response('', { status: 302, headers: { location: '/quizzes/1/take' } }),
    () => new Response('private-content', { status: 401 }), () => new Response('private-content', { status: 403 }),
    () => new Response('private-content', { status: 429 }),
    () => new Response('<form>private-content</form>', { headers: { 'content-type': 'text/html', 'x-canvas-user-id': '90099' } }),
    () => new Response('private-content', { headers: { 'content-type': 'application/json', 'x-canvas-user-id': '90099' } }),
    () => new Response(Buffer.from([0xff]), { headers: { 'content-type': 'application/json', 'x-canvas-user-id': '90099' } }),
  ]) {
    let calls = 0;
    let setup;
    setup = fixture({ fetcher: async (_url, init) => { calls++; assert.ok(setup.transport.allows(setup.details(init))); return makeResponse(); } });
    await assert.rejects(setup.transport.request(request()), error => !/private-content|quizzes/.test(error.message));
    assert.equal(calls, 1);
    assert.deepEqual(setup.events.map(event => event.event), ['request', 'response', 'read-error']);
  }
});

test('received byte limits reject oversized, misleading and cumulative responses', async () => {
  for (const mode of ['declared', 'stream', 'total']) {
    let setup;
    let calls = 0;
    let cancelled = false;
    setup = fixture({ fetcher: async (_url, init) => {
      calls++;
      assert.ok(setup.transport.allows(setup.details(init)));
      if (mode === 'declared') return new Response('[]', { headers: { 'content-type': 'application/json', 'x-canvas-user-id': '90099', 'content-length': String(2 * 1024 * 1024 + 1) } });
      if (mode === 'total') return new Response('"' + 'x'.repeat(2 * 1024 * 1024 - 2) + '"', { headers: { 'content-type': 'application/json', 'x-canvas-user-id': '90099' } });
      return new Response(new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(2 * 1024 * 1024 + 1)); }, cancel() { cancelled = true; } }),
        { headers: { 'content-type': 'application/json', 'x-canvas-user-id': '90099', 'content-length': '1' } });
    } });
    if (mode === 'total') for (let i = 0; i < 8; i++) await setup.transport.request(request());
    await assert.rejects(setup.transport.request(request()), /limit/);
    assert.equal(calls, mode === 'total' ? 8 : 1);
    if (mode === 'stream') assert.equal(cancelled, true);
  }
});

test('connection cancellation, request cancellation and concurrent reads cannot cross the binding', async () => {
  const already = fixture();
  already.connection.abort('private-reason');
  await assert.rejects(already.transport.request(request()), error => error.name === 'AbortError' && !error.message.includes('private'));
  assert.equal(already.sent.length, 0);
  let setup;
  let entered;
  const waiting = new Promise(resolve => { entered = resolve; });
  setup = fixture({ fetcher: async (_url, init) => {
    assert.ok(setup.transport.allows(setup.details(init)));
    entered();
    return new Promise(() => {}); // Even a misbehaving injected fetch cannot hide cancellation.
  } });
  const ongoing = setup.transport.request(request());
  await waiting;
  await assert.rejects(setup.transport.request(request()), /already running/);
  setup.connection.abort();
  await assert.rejects(ongoing, { name: 'AbortError' });
  assert.deepEqual(setup.events.map(event => event.event), ['request', 'network-error']);
  let streaming;
  let streamStarted;
  const streamWait = new Promise(resolve => { streamStarted = resolve; });
  const cancel = new AbortController();
  streaming = fixture({ fetcher: async (_url, init) => {
    assert.ok(streaming.transport.allows(streaming.details(init)));
    return new Response(new ReadableStream({ pull() { streamStarted(); } }), { headers: { 'content-type': 'application/json', 'x-canvas-user-id': '90099' } });
  } });
  const reading = streaming.transport.request(request(), cancel.signal);
  await streamWait;
  cancel.abort();
  await assert.rejects(reading, { name: 'AbortError' });
  assert.equal(streaming.events.at(-1).event, 'read-error');
});

test('audit failures fail closed and private transport exceptions are not exposed', async () => {
  for (const phase of ['request', 'response', 'body-read']) {
    let setup;
    let calls = 0;
    setup = fixture({ audit: async event => { if (event.event === phase) throw new Error('private-disk-path'); }, fetcher: async (_url, init) => {
      calls++; assert.ok(setup.transport.allows(setup.details(init))); return response();
    } });
    await assert.rejects(setup.transport.request(request()), error => /audit could not be saved/.test(error.message) && !/private/.test(error.message));
    assert.equal(calls, phase === 'request' ? 0 : 1);
  }
  const setup = fixture({ fetcher: async () => { throw new Error('Authorization: private-value'); } });
  await assert.rejects(setup.transport.request(request()), error => /could not be read/.test(error.message) && !/private|Authorization/.test(error.message));
  assert.equal(setup.events.at(-1).event, 'network-error');
  const unguarded = fixture({ fetcher: async () => response() });
  await assert.rejects(unguarded.transport.request(request()), /interception was not confirmed/);
});

test('audit persists only named POST metadata hashes and preserves existing GET records', async () => {
  await fs.mkdir('.codex-temp', { recursive: true });
  const directory = await fs.mkdtemp(path.resolve('.codex-temp/metadata-audit-'));
  const audit = new CanvasAudit(directory);
  const setup = fixture({ audit: event => audit.write({ ...event, headers: 'private-header', body: 'private-body' }) });
  await setup.transport.request(request());
  const event = { requestId: '00000000-0000-0000-0000-000000000000', operation: 'profile', event: 'request', origin: 'https://canvas.example', path: '/api/v1/users/self/profile' };
  await audit.write(event);
  for (const invalid of [{ ...event, method: 'POST' }, { ...event, method: 'DELETE' }, { ...event, path: '/api/graphql', method: 'POST', bodyHash: 'a'.repeat(64) },
    { ...event, path: '/api/graphql', method: 'POST', operation: 'metadataassignments', bodyHash: 'private-body' }]) await assert.rejects(audit.write(invalid), /Invalid/);
  const files = await fs.readdir(path.join(directory, 'canvas-audit'));
  const text = await fs.readFile(path.join(directory, 'canvas-audit', files[0]), 'utf8');
  const records = text.trim().split('\n').map(JSON.parse);
  assert.deepEqual(records.map(record => record.method), ['POST', 'POST', 'POST', 'GET']);
  assert.doesNotMatch(text, /private-|headers|"body"|Authorization/);
  assert.match(records[0].bodyHash, /^[a-f0-9]{64}$/);
});

test('request budget and network timeout remain bounded after successful reads', async context => {
  const setup = fixture();
  for (let i = 0; i < 200; i++) await setup.transport.request(request());
  await assert.rejects(setup.transport.request(request()), /collection limit/);
  assert.equal(setup.sent.length, 200);
  assert.equal(setup.transport.remainingRequests, 0);
  context.mock.timers.enable({ apis: ['setTimeout'] });
  let stalled;
  let entered;
  const waiting = new Promise(resolve => { entered = resolve; });
  stalled = fixture({ fetcher: async (_url, init) => {
    assert.ok(stalled.transport.allows(stalled.details(init)));
    entered();
    return new Promise(() => {});
  } });
  const ongoing = stalled.transport.request(request());
  await waiting;
  context.mock.timers.tick(30000);
  await assert.rejects(ongoing, { name: 'TimeoutError' });
  assert.equal(stalled.events.at(-1).event, 'network-error');
});

test('audit identity is derived from transmitted canonical JSON, not mutable input getters', async () => {
  const setup = fixture();
  const disguised = { toJSON: () => request(), get variables() { throw new Error('Untrusted getter'); }, operationName: 'CreateSubmission' };
  await setup.transport.request(disguised);
  assert.equal(setup.events[0].operation, 'metadataassignments');
  assert.equal(setup.events[0].paginated, false);
  await setup.transport.request(request());
  assert.equal(setup.sent.length, 2);
});


test('raw response byte budget is shared across assignment and direct submission reads', async () => {
  const assignments = { data: { course: { _id: '1', name: 'Example course', courseCode: 'DEMO', assignmentsConnection: {
    nodes: [{ _id: '10', courseId: '1', name: 'Preparation', state: 'published', pointsPossible: 5, submissionTypes: ['online_upload'] }],
    pageInfo: { hasNextPage: false, endCursor: null },
  } } } };
  let calls = 0;
  const setup = fixture({ fetcher: async (_url, init) => {
    assert.ok(setup.transport.allows(setup.details(init)));
    const value = calls++ === 0 ? assignments : { data: { submission: { _id: '20', assignmentId: '10', state: 'submitted', cachedDueDate: null } } };
    return new Response(JSON.stringify({ ...value, extra: 'x'.repeat(1024 * 1024) }),
      { headers: { 'content-type': 'application/json', 'x-canvas-user-id': '90099' } });
  } });
  await setup.transport.readAssignmentPage();
  for (let i = 0; i < 14; i++) await setup.transport.readOwnSubmission('10');
  await assert.rejects(setup.transport.readOwnSubmission('10'), /response limit/);
  assert.equal(calls, 16);
  await assert.rejects(setup.transport.readOwnSubmission('10'), /collection limit/);
  assert.equal(calls, 16, 'Exhausted byte budget must stop before another request');
});


test('message transport admits only freshly observed threads and isolates returned objects from its authority', async () => {
  const thread = { _id: '40', contextType: 'Course', contextId: '1', subject: 'Course update', updatedAt: '2026-09-10T18:00:00Z' };
  let value = { data: { user: { _id: '99', conversationsConnection: {
    nodes: [{ _id: '140', userId: '99', workflowState: 'unread', conversation: thread }],
    pageInfo: { hasNextPage: false, endCursor: null },
  } } } };
  let authCalls = 0;
  const setup = fixture({ authentication: () => { authCalls++; return { kind: 'session', value: 'fixture-csrf' }; },
    fetcher: async (_url, init) => {
      assert.ok(setup.transport.allows(setup.details(init)));
      return new Response(JSON.stringify(value), { headers: { 'content-type': 'application/json', 'x-canvas-user-id': '90099' } });
    } });
  await assert.rejects(setup.transport.readConversationText('40'), /Read this thread/);
  assert.equal(authCalls, 0);
  const page = await setup.transport.readCourseConversations('inbox');
  page.nodes[0].subject = 'Forged subject';
  page.nodes[0].id = '41';
  await assert.rejects(setup.transport.readConversationText('41'), /Read this thread/);
  value = { data: { legacyNode: { ...thread, conversationMessagesConnection: {
    nodes: [{ _id: '50', conversationId: '40', body: 'Read chapter 2.', createdAt: null }],
    pageInfo: { hasNextPage: false, endCursor: null },
  } } } };
  assert.equal((await setup.transport.readConversationText('40')).messages[0].body, 'Read chapter 2.');
  assert.equal(setup.transport.remainingRequests, 198);
  assert.deepEqual(setup.events.filter(event => event.event === 'body-read').map(event => event.operation), ['courseconversations', 'conversationtext']);
  setup.connection.abort();
  await assert.rejects(setup.transport.readConversationText('40'), { name: 'AbortError' });
  assert.equal(authCalls, 2);
});


test('optional sources can distinguish connection and audit failures from unavailable content', async () => {
  for (const scenario of ['authentication', 'identity', 'identity-denied', 'expired', 'redirect', 'interception', 'audit-intent', 'audit-response', 'audit-body']) {
    const context = fixture({
      authentication: async () => {
        if (scenario === 'authentication') throw new Error('private-authentication-detail');
        return { kind: 'session', value: 'fixture-csrf' };
      },
      audit: async event => {
        if (scenario === `audit-${{ request: 'intent', response: 'response', 'body-read': 'body' }[event.event]}`) throw new Error('private-audit-detail');
      },
      fetcher: async (_url, init) => {
        if (scenario !== 'interception') assert.equal(context.transport.allows(context.details(init)), true);
        return new Response('{}', { status: scenario === 'identity-denied' ? 403 : scenario === 'expired' ? 401 : scenario === 'redirect' ? 302 : 200,
          headers: { 'content-type': 'application/json', 'x-canvas-user-id': scenario.startsWith('identity') ? '90098' : '90099' } });
      },
    });
    await assert.rejects(context.transport.request(request()), error => {
      assert.ok(error instanceof CanvasCollectionStoppedError, scenario);
      assert.doesNotMatch(error.message, /private-/);
      return true;
    });
  }
  for (const status of [403, 404, 429, 500]) {
    const context = fixture({ fetcher: async (_url, init) => {
      assert.equal(context.transport.allows(context.details(init)), true);
      return new Response('{}', { status });
    } });
    await assert.rejects(context.transport.request(request()), error => !(error instanceof CanvasCollectionStoppedError));
  }
});


test('stored syllabus uses fixed bound transport, sanitized content and redacted audit', async () => {
  const setup = fixture({ fetcher: async (_url, init) => {
    assert.ok(setup.transport.allows(setup.details(init)));
    assert.deepEqual(JSON.parse(init.body), courseSyllabusRequest('1'));
    return new Response(JSON.stringify({ data: { course: { _id: '1', syllabusBody: '<p>Password: private-syllabus-secret</p><p>Read before class.</p>' } } }),
      { headers: { 'content-type': 'application/json', 'x-canvas-user-id': '90099' } });
  } });
  const syllabus = await setup.transport.readCourseSyllabus();
  assert.match(syllabus.text, /Read before class/);
  assert.doesNotMatch(syllabus.text, /private-syllabus-secret/);
  assert.equal(setup.transport.remainingRequests, 199);
  assert.ok(setup.events.every(event => event.operation === 'coursesyllabus' && /^[a-f0-9]{64}$/.test(event.bodyHash)));
  assert.doesNotMatch(JSON.stringify(setup.events), /private-syllabus|Read before class|syllabusBody/);
  setup.connection.abort();
  await assert.rejects(setup.transport.readCourseSyllabus(), { name: 'AbortError' });
});
