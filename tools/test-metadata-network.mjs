import { _electron as electron } from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import https from 'node:https';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

// Ephemeral test certificate, never installed into Windows certificate stores.
const certificateScript = `
$testRsa = [System.Security.Cryptography.RSA]::Create(2048)
$testRequest = [System.Security.Cryptography.X509Certificates.CertificateRequest]::new('CN=Canvas Weekly metadata fixture', $testRsa, [System.Security.Cryptography.HashAlgorithmName]::SHA256, [System.Security.Cryptography.RSASignaturePadding]::Pkcs1)
$testCertificate = $testRequest.CreateSelfSigned([DateTimeOffset]::UtcNow.AddMinutes(-1), [DateTimeOffset]::UtcNow.AddHours(1))
[Convert]::ToBase64String($testCertificate.Export([System.Security.Cryptography.X509Certificates.X509ContentType]::Pfx, 'fixture-only'))
$testCertificate.Dispose()
$testRsa.Dispose()
`;
const { stdout } = await promisify(execFile)('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', certificateScript], { windowsHide: true });
const received = [];
let mode = 'normal';
let streaming;
const server = https.createServer({ pfx: Buffer.from(stdout.trim(), 'base64'), passphrase: 'fixture-only' }, (request, response) => {
  if (request.url === '/fixture') {
    response.writeHead(200, { 'content-type': 'text/html' });
    response.end('<!doctype html><title>Metadata fixture</title><p>Local synthetic fixture</p>');
    return;
  }
  const chunks = [];
  request.on('data', chunk => chunks.push(chunk));
  request.on('end', () => {
    received.push({ method: request.method, route: request.url, headers: request.headers, body: Buffer.concat(chunks).toString() });
    if (mode === 'redirect') { response.writeHead(307, { location: '/quizzes/1/take' }); response.end(); return; }
    const input = request.method === 'POST' ? JSON.parse(Buffer.concat(chunks)) : null;
    const messageFailure = mode.startsWith('message-') && input?.operationName === 'CanvasWeeklyConversationText' && input.variables.after === 'message-next';
    const syllabusFailure = mode.startsWith('syllabus-') && input?.operationName === 'CanvasWeeklyCourseSyllabus';
    const rubricFailure = mode.startsWith('rubric-') && input?.operationName === 'CanvasWeeklyCourseRubrics' && input.variables.after !== null;
    response.writeHead((messageFailure || syllabusFailure || rubricFailure) && mode.endsWith('-expired') ? 401 : mode === 'account-denied' ? 403 : 200, { 'content-type': 'application/json',
      ...(mode === 'missing-identity' ? {} : { 'x-canvas-user-id': mode === 'other-identity' || ((messageFailure || syllabusFailure || rubricFailure) && mode.endsWith('-identity')) ? '90100' : '90099' }),
      ...(mode === 'account-next' ? { link: `<https://${request.headers.host}/api/v1/accounts?per_page=1&page=2>; rel="next"` } : {}),
      ...(mode === 'impersonated-identity' ? { 'x-canvas-real-user-id': '90100' } : {}) });
    if (mode === 'large') { response.end('"' + 'x'.repeat(2 * 1024 * 1024) + '"'); return; }
    if (mode === 'stream') { response.write('{"data":'); streaming?.(); return; }
    if (mode === 'graphql-error') { response.end('{"data":{"course":null},"errors":[{"message":"private-fixture-error"}]}'); return; }
    if (request.url.startsWith('/api/v1/accounts')) {
      assert.equal(request.url, '/api/v1/accounts?per_page=1');
      assert.equal(request.method, 'GET');
      assert.equal(Buffer.concat(chunks).length, 0);
      response.end(mode === 'account-present' ? '[{"id":1,"name":"private-admin-account"}]' : '[]');
      return;
    }
    if (messageFailure || syllabusFailure || rubricFailure) { response.end(JSON.stringify({ errors: [{ message: 'private-message-fixture-error' }] })); return; }
    if (input.operationName === 'CanvasWeeklyCourseSyllabus') {
      assert.deepEqual(input.variables, { courseId: '1' });
      response.end(JSON.stringify({ data: { course: { _id: '1', syllabusBody: '<p>Read the syllabus before class.</p><a href="https://course.example/syllabus">Full syllabus</a>' } } }));
      return;
    }
    const thread = id => ({ _id: id, contextType: 'Course', contextId: '1', subject: 'Course thread ' + id, updatedAt: '2026-09-10T18:00:00Z' });
    if (input.operationName === 'CanvasWeeklyCourseConversations') {
      assert.equal(input.variables.studentId, '99');
      assert.deepEqual(input.variables.filter, ['course_1']);
      assert.ok(['inbox', 'archived', 'sent'].includes(input.variables.scope));
      const scope = input.variables.scope;
      const id = input.variables.after === null ? '40' : '41';
      const next = scope === 'inbox' && input.variables.after === null ? 'thread-next' : null;
      const nodes = scope === 'archived' ? [] : [{ _id: String(+id + 100), userId: '99', workflowState: 'unread', conversation: thread(id) }];
      response.end(JSON.stringify({ data: { user: { _id: '99', conversationsConnection: { nodes, pageInfo: { hasNextPage: !!next, endCursor: next } } } } }));
      return;
    }
    if (input.operationName === 'CanvasWeeklyConversationText') {
      assert.ok(['40', '41'].includes(input.variables.conversationId));
      const id = input.variables.conversationId;
      const next = id === '40' && input.variables.after === null ? 'message-next' : null;
      response.end(JSON.stringify({ data: { legacyNode: { ...thread(id), conversationMessagesConnection: {
        nodes: [{ _id: id === '41' ? '52' : next ? '50' : '51', conversationId: id, body: 'Private fixture reading update.', createdAt: null, author: { _id: '77', name: 'Example Sender' } }],
        pageInfo: { hasNextPage: !!next, endCursor: next },
      } } } }));
      return;
    }
    if (input.operationName === 'CanvasWeeklyOwnSubmission') {
      assert.equal(input.variables.studentId, '99');
      assert.ok(['10', '11'].includes(input.variables.assignmentId));
      const id = input.variables.assignmentId;
      response.end(JSON.stringify({ data: { submission: mode === 'own-null' ? null : {
        _id: id === '10' ? '20' : '21', assignmentId: mode === 'own-foreign' ? '11' : id, state: id === '10' ? 'submitted' : 'unsubmitted',
        cachedDueDate: id === '10' ? '2026-09-18T23:59:00-07:00' : null, body: 'own-submission-private-body',
      } } }));
      return;
    }
    if (input.operationName === 'CanvasWeeklyEnrollmentScope') {
      const next = input.variables.after === null ? 'enrollment-next' : null;
      const node = { _id: next ? '31' : '32', userId: '99', course: { _id: '1' },
        type: next ? 'StudentEnrollment' : 'TeacherEnrollment', state: next ? 'active' : 'completed',
        courseSectionId: '2', limitPrivilegesToCourseSection: false, role: { _id: next ? '3' : '4', name: next ? 'StudentEnrollment' : 'TeacherEnrollment' } };
      if (mode === 'student-only' || mode.startsWith('message-') || mode.startsWith('syllabus-') || mode.startsWith('rubric-')) Object.assign(node, { type: 'StudentEnrollment', state: 'active', role: { _id: '3', name: 'StudentEnrollment' } });
      response.end(JSON.stringify({ data: { user: { _id: mode === 'foreign-enrollment' ? '100' : '99',
        enrollmentsConnection: { nodes: [node], pageInfo: { hasNextPage: next !== null, endCursor: next } } } } }));
      return;
    }
    assert.ok(['CanvasWeeklyAssignments', 'CanvasWeeklyCourseRubrics'].includes(input.operationName), 'Only reviewed assignment and rubric queries reach this fixture');
    const next = input.variables.after === null ? 'next' : null;
    const id = input.variables.after === null ? '10' : '11';
    const nodes = [{ _id: id, courseId: '1', name: 'Synthetic preparation', state: 'published', pointsPossible: 5,
      submissionTypes: ['online_upload'], ...(input.operationName === 'CanvasWeeklyCourseRubrics' ? { rubric: { _id: '60', title: 'Fixture rubric', criteria: [{ _id: 'c1', description: 'Private fixture criterion', longDescription: 'Explain the tradeoffs.' }] } } : {}) }];
    response.end(JSON.stringify({ data: { course: { _id: '1', name: 'Example course', courseCode: 'DEMO 1',
      assignmentsConnection: { nodes, pageInfo: { hasNextPage: next !== null, endCursor: next } } } } }));
  });
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = `https://127.0.0.1:${server.address().port}`;
await fs.mkdir('.codex-temp', { recursive: true });
const directory = await fs.mkdtemp(path.resolve('.codex-temp/metadata-network-'));
const environment = { ...process.env, CANVAS_METADATA_TEST_DATA: directory, CANVAS_METADATA_TEST_ORIGIN: origin };
delete environment.ELECTRON_RUN_AS_NODE;
let application;
try {
  application = await electron.launch({ args: ['tools/fixtures/metadata-network-app.mjs'], env: environment });
  await application.evaluate(async () => globalThis.metadataFixtureReady);
  const result = await application.evaluate(async () => globalThis.metadataFixture.collect());
  assert.equal(result.assignments.length, 2);
  assert.equal(result.submissions[1].state, 'unsubmitted');
  assert.equal(result.submissions[0].cachedDueDate, '2026-09-19T06:59:00.000Z');
  assert.equal(received.length, 4);
  for (const request of received) {
    assert.equal(request.method, 'POST');
    assert.equal(request.route, '/api/graphql');
    assert.equal(request.headers['x-csrf-token'], Buffer.alloc(64, 251).toString('base64'));
    assert.match(request.headers.cookie, /fixture_session=fixture-cookie-only/);
    assert.match(request.headers.cookie, /_csrf_token=/);
    assert.equal(request.headers.authorization, undefined);
  }
  // Read the real Electron cookie store, without navigating to a login or
  // mutating any server state. Invalid cookies must prevent any POST.
  await application.evaluate(async () => {
    const { isolated, origin } = globalThis.metadataFixture;
    await isolated.cookies.remove(origin, '_csrf_token');
  });
  await assert.rejects(application.evaluate(async () => globalThis.metadataFixture.read()), /Reconnect Canvas/);
  await application.evaluate(async () => {
    const { isolated, origin } = globalThis.metadataFixture;
    await isolated.cookies.set({ url: origin, name: '_csrf_token', value: 'malformed-private-cookie', secure: true, path: '/' });
  });
  await assert.rejects(application.evaluate(async () => globalThis.metadataFixture.read()), error => /Reconnect Canvas/.test(error.message) && !/private/.test(error.message));
  assert.equal(received.length, 4, 'Missing or invalid CSRF must not reach the server');
  await application.evaluate(async () => {
    const { isolated, origin } = globalThis.metadataFixture;
    await isolated.cookies.set({ url: origin, name: '_csrf_token', value: encodeURIComponent(Buffer.alloc(64, 251).toString('base64')), secure: true, path: '/' });
  });
  await assert.rejects(application.evaluate(async () => {
    const { isolated, origin } = globalThis.metadataFixture;
    await isolated.fetch(origin + '/api/graphql', { method: 'POST', body: '{"query":"mutation { submit }"}' });
  }));
  assert.equal(received.length, 4);
  // Hold the main-process request while the renderer tries to borrow its body.
  const canonical = await application.evaluate(async () => {
    const state = globalThis.metadataFixture;
    state.hold = new Promise(resolve => { state.release = resolve; });
    state.pending = state.read();
    // Wait until the asynchronous audit has completed and fetcher is waiting.
    const deadline = Date.now() + 5000;
    while (!state.fetchEntered) { if (Date.now() > deadline) throw new Error('Fixture hold did not initialize'); await new Promise(resolve => setTimeout(resolve, 10)); }
    return state.canonical;
  });
  const page = await application.firstWindow();
  await assert.rejects(page.evaluate(async ({ origin, canonical }) => fetch(origin + '/api/graphql', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(canonical),
  }), { origin, canonical }));
  assert.equal(received.length, 4, 'Renderer borrowing must not reach the server');
  await application.evaluate(async () => { const state = globalThis.metadataFixture; state.release(); state.hold = null; await state.pending; });
  assert.equal(received.length, 5);
  await application.evaluate(async () => {
    const state = globalThis.metadataFixture;
    await state.isolated.cookies.set({ url: state.origin, name: '_csrf_token', value: encodeURIComponent(Buffer.alloc(64, 247).toString('base64')), secure: true, path: '/' });
    await state.read();
  });
  assert.equal(received.at(-1).headers['x-csrf-token'], Buffer.alloc(64, 247).toString('base64'), 'Each request must reread a remasked cookie');
  await application.evaluate(async () => { const state = globalThis.metadataFixture; state.reset('token'); await state.read(); });
  assert.equal(received.at(-1).headers.authorization, 'Bearer fixture-bearer-only');
  assert.equal(received.at(-1).headers.cookie, undefined);
  assert.equal(received.at(-1).headers['x-csrf-token'], undefined);
  mode = 'redirect';
  const beforeRedirect = received.length;
  // Chromium can reject the POST redirect before exposing a Response. Both
  // outcomes must fail closed, without a second request reaching the server.
  await assert.rejects(application.evaluate(async () => globalThis.metadataFixture.read()), /redirect|could not be read/i);
  assert.equal(received.length, beforeRedirect + 1);
  assert.ok(received.every(request => request.route === '/api/graphql'));
  mode = 'large';
  await assert.rejects(application.evaluate(async () => globalThis.metadataFixture.read()), /limit/i);
  mode = 'graphql-error';
  await assert.rejects(application.evaluate(async () => globalThis.metadataFixture.collect()), error => /unavailable|incomplete/.test(error.message) && !/private-fixture/.test(error.message));
  mode = 'stream';
  const started = new Promise(resolve => { streaming = resolve; });
  await application.evaluate(() => { const state = globalThis.metadataFixture; state.pending = state.read().then(() => 'unexpected success', error => error.name); });
  await started;
  assert.equal(await application.evaluate(async () => { const state = globalThis.metadataFixture; state.connection.abort(); return state.pending; }), 'AbortError');
  const count = received.length;
  await assert.rejects(application.evaluate(async () => globalThis.metadataFixture.read()), /cancel/i);
  assert.equal(received.length, count);
  mode = 'normal';
  await application.evaluate(() => globalThis.metadataFixture.reset('session'));
  const enrollmentStart = received.length;
  const evidence = await application.evaluate(async () => globalThis.metadataFixture.enrollments());
  assert.deepEqual(evidence.enrollments.map(row => [row.type, row.state]), [['StudentEnrollment', 'active'], ['TeacherEnrollment', 'completed']]);
  assert.equal(received.length, enrollmentStart + 2);
  for (const request of received.slice(enrollmentStart)) {
    assert.equal(request.method, 'POST');
    assert.equal(request.route, '/api/graphql');
    const body = JSON.parse(request.body);
    assert.equal(body.operationName, 'CanvasWeeklyEnrollmentScope');
    assert.equal(body.variables.courseId, '1');
    assert.equal(body.variables.studentId, '99');
    assert.match(body.query, /currentOnly: false, excludeConcluded: false/);
  }
  mode = 'foreign-enrollment';
  const beforeForeign = received.length;
  await assert.rejects(application.evaluate(async () => globalThis.metadataFixture.enrollments()), /unavailable or incomplete/);
  assert.equal(received.length, beforeForeign + 1, 'Invalid user must stop before the next enrollment page');
  for (const identityMode of ['missing-identity', 'other-identity', 'impersonated-identity']) {
    mode = identityMode;
    await application.evaluate(() => globalThis.metadataFixture.reset('session'));
    const beforeIdentity = received.length;
    await assert.rejects(application.evaluate(async () => globalThis.metadataFixture.read()), /Reconnect Canvas/);
    await assert.rejects(application.evaluate(async () => globalThis.metadataFixture.read()), /Reconnect Canvas/);
    assert.equal(received.length, beforeIdentity + 1, 'A rejected account identity invalidates this transport');
  }
  for (const accountMode of ['normal', 'account-present', 'account-next', 'account-denied', 'missing-identity', 'other-identity', 'impersonated-identity', 'redirect']) {
    mode = accountMode;
    await application.evaluate(() => globalThis.metadataFixture.reset('session'));
    const beforeAccount = received.length;
    if (mode === 'normal') {
      const accountEvidence = await application.evaluate(async () => globalThis.metadataFixture.accounts());
      assert.deepEqual(accountEvidence, { studentId: '99', globalUserId: '90099', accountMembership: 'none' });
    } else {
      await assert.rejects(application.evaluate(async () => globalThis.metadataFixture.accounts()));
      await assert.rejects(application.evaluate(async () => globalThis.metadataFixture.read()), /permissions could not be confirmed|Reconnect Canvas/);
    }
    assert.equal(received.length, beforeAccount + 1, 'Account check must issue one request without following pages or redirects');
    const accountRequest = received.at(-1);
    assert.equal(accountRequest.method, 'GET');
    assert.equal(accountRequest.route, '/api/v1/accounts?per_page=1');
    assert.equal(accountRequest.body, '');
    assert.equal(accountRequest.headers['x-csrf-token'], undefined);
    assert.equal(accountRequest.headers.authorization, undefined);
    assert.match(accountRequest.headers.cookie, /fixture_session=fixture-cookie-only/);
  }
  mode = 'normal';
  await application.evaluate(async () => { const state = globalThis.metadataFixture; state.reset('token'); await state.accounts(); });
  assert.equal(received.at(-1).headers.authorization, 'Bearer fixture-bearer-only');
  assert.equal(received.at(-1).headers.cookie, undefined);
  const beforeUnadmitted = received.length;
  await assert.rejects(page.evaluate(async origin => fetch(origin + '/api/v1/accounts?per_page=1'), origin));
  await assert.rejects(application.evaluate(async () => {
    const state = globalThis.metadataFixture;
    await state.isolated.fetch(state.origin + '/api/v1/accounts?per_page=1');
  }));
  assert.equal(received.length, beforeUnadmitted, 'Account requests outside the pending main-process check are blocked');
  for (const scenario of ['normal', 'student-only']) {
    mode = scenario;
    const start = received.length;
    await application.evaluate(() => globalThis.metadataFixture.reset('session'));
    if (scenario === 'normal') {
      await assert.rejects(application.evaluate(() => globalThis.metadataFixture.collectStudent()), /supported student enrollment/);
    } else {
      const courseRecord = await application.evaluate(() => globalThis.metadataFixture.collectStudent());
      assert.equal(courseRecord.sources.metadata.assignments.length, 2);
      assert.equal(courseRecord.sources.rubrics.length, 2);
      assert.equal(courseRecord.sources.rubrics[0].rubric.criteria[0].description, 'Private fixture criterion');
      assert.doesNotMatch(JSON.stringify(courseRecord), /enrollments|StudentEnrollment|accountMembership/);
    }
    const operations = received.slice(start).map(request => request.method === 'GET' ? 'account' : JSON.parse(request.body).operationName);
    const expected = ['account', 'CanvasWeeklyEnrollmentScope', 'CanvasWeeklyEnrollmentScope'];
    if (scenario === 'student-only') expected.push('CanvasWeeklyAssignments', 'CanvasWeeklyAssignments', 'CanvasWeeklyOwnSubmission', 'CanvasWeeklyOwnSubmission', 'CanvasWeeklyCourseSyllabus',
      'CanvasWeeklyCourseConversations', 'CanvasWeeklyCourseConversations', 'CanvasWeeklyCourseConversations', 'CanvasWeeklyCourseConversations',
      'CanvasWeeklyConversationText', 'CanvasWeeklyConversationText', 'CanvasWeeklyConversationText', 'CanvasWeeklyCourseRubrics', 'CanvasWeeklyCourseRubrics');
    assert.deepEqual(operations, expected, 'Every enrollment page must pass before the first assignment request');
  }
  const logFiles = await fs.readdir(path.join(directory, 'canvas-audit'));
  const log = await fs.readFile(path.join(directory, 'canvas-audit', logFiles[0]), 'utf8');
  assert.doesNotMatch(log, /fixture-(csrf|bearer|cookie)|private-fixture|Synthetic preparation|"query"|studentId/);
  assert.equal(log.includes(Buffer.alloc(64, 251).toString('base64')), false);
  assert.equal(log.includes(Buffer.alloc(64, 247).toString('base64')), false);
  assert.doesNotMatch(log, /malformed-private-cookie/);
  const records = log.trim().split('\n').map(JSON.parse);
  assert.equal(records.filter(event => event.event === 'request').length, received.length);
  assert.ok(records.some(event => event.event === 'read-error'));
  assert.ok(records.some(event => event.event === 'body-read'));
  assert.equal(records.filter(event => event.operation === 'metadataenrollments' && event.event === 'request').length, 7);
  assert.doesNotMatch(log, /enrollment-next|StudentEnrollment|TeacherEnrollment/);
  assert.equal(records.filter(event => event.operation === 'accountscope' && event.event === 'request').length, 11);
  assert.equal(records.filter(event => event.operation === 'accountscope' && event.event === 'body-read').length, 4);
  assert.doesNotMatch(log, /private-admin-account|accountMembership|90099|per_page/);
  mode = 'student-only';
  const beforeBridge = received.length;
  const bridge = await application.evaluate(() => globalThis.metadataFixture.testConnectionBridge());
  assert.deepEqual(bridge, { count: 1, holdBeforeWatch: true, deniedOutsideRun: true, cancelledOnChange: true });
  assert.deepEqual(received.slice(beforeBridge).map(request => request.method === 'GET' ? 'account' : JSON.parse(request.body).operationName),
    ['account', 'CanvasWeeklyEnrollmentScope', 'CanvasWeeklyEnrollmentScope', 'CanvasWeeklyAssignments', 'CanvasWeeklyAssignments', 'CanvasWeeklyOwnSubmission', 'CanvasWeeklyOwnSubmission', 'CanvasWeeklyCourseSyllabus',
      'CanvasWeeklyCourseConversations', 'CanvasWeeklyCourseConversations', 'CanvasWeeklyCourseConversations', 'CanvasWeeklyCourseConversations',
      'CanvasWeeklyConversationText', 'CanvasWeeklyConversationText', 'CanvasWeeklyConversationText', 'CanvasWeeklyCourseRubrics', 'CanvasWeeklyCourseRubrics']);
  const beforeOwn = received.length;
  const ownAuditDirectory = path.join(directory, 'canvas-audit');
  const beforeOwnLog = (await Promise.all((await fs.readdir(ownAuditDirectory)).map(file => fs.readFile(path.join(ownAuditDirectory, file), 'utf8')))).join('');
  const ownReadCount = log => log.split('\n').filter(Boolean).map(line => JSON.parse(line)).filter(event => event.operation === 'metadataownsubmission' && event.event === 'body-read').length;
  const beforeOwnReads = ownReadCount(beforeOwnLog);
  await application.evaluate(() => globalThis.metadataFixture.reset('session'));
  await assert.rejects(application.evaluate(() => globalThis.metadataFixture.transport.readOwnSubmission('10')), /Read this assignment/);
  await application.evaluate(() => globalThis.metadataFixture.transport.readAssignmentPage());
  const own = await application.evaluate(() => globalThis.metadataFixture.transport.readOwnSubmission('10'));
  assert.deepEqual(own, { id: '20', assignmentId: '10', state: 'submitted', cachedDueDate: '2026-09-19T06:59:00.000Z' });
  await assert.rejects(application.evaluate(() => globalThis.metadataFixture.transport.readOwnSubmission('11')), /Read this assignment/);
  mode = 'own-null';
  assert.equal(await application.evaluate(() => globalThis.metadataFixture.transport.readOwnSubmission('10')), null);
  mode = 'own-foreign';
  await assert.rejects(application.evaluate(() => globalThis.metadataFixture.transport.readOwnSubmission('10')), /unavailable or incomplete/);
  assert.deepEqual(received.slice(beforeOwn).map(request => JSON.parse(request.body).operationName),
    ['CanvasWeeklyAssignments', 'CanvasWeeklyOwnSubmission', 'CanvasWeeklyOwnSubmission', 'CanvasWeeklyOwnSubmission']);
  const auditDirectory = path.join(directory, 'canvas-audit');
  const ownAudit = (await Promise.all((await fs.readdir(auditDirectory)).map(file => fs.readFile(path.join(auditDirectory, file), 'utf8')))).join('');
  assert.doesNotMatch(ownAudit, /own-submission-private-body|CanvasWeeklyOwnSubmission/);
  assert.equal(ownReadCount(ownAudit) - beforeOwnReads, 3);
  const beforeMessages = received.length;
  await application.evaluate(() => globalThis.metadataFixture.reset('session'));
  await assert.rejects(application.evaluate(() => globalThis.metadataFixture.transport.readConversationText('40')), /Read this thread/);
  const messageSource = await application.evaluate(() => globalThis.metadataFixture.collectMessages());
  assert.equal(messageSource.conversation.length, 2);
  assert.equal(messageSource.conversation[0].data.messages.length, 2);
  assert.deepEqual(messageSource.conversation[0].data.messages[0].author, { id: '77', name: 'Example Sender' });
  assert.equal(messageSource.conversation[1].data.messages.length, 1);
  assert.deepEqual(received.slice(beforeMessages).map(request => JSON.parse(request.body).operationName),
    [...Array(4).fill('CanvasWeeklyCourseConversations'), ...Array(3).fill('CanvasWeeklyConversationText')]);
  const finalAudit = (await Promise.all((await fs.readdir(auditDirectory)).map(file => fs.readFile(path.join(auditDirectory, file), 'utf8')))).join('');
  assert.doesNotMatch(finalAudit, /Private fixture criterion|Fixture rubric|Explain the tradeoffs|Example Sender|Private fixture reading update|thread-next|message-next|Course thread|Read the syllabus|course.example/);
  const messageEvents = finalAudit.split('\n').filter(Boolean).map(line => JSON.parse(line));
  assert.equal(messageEvents.filter(event => event.operation === 'conversationtext' && event.event === 'body-read').length, 9);
  for (const scenario of ['rubric-unavailable', 'rubric-identity', 'rubric-expired']) {
    mode = scenario;
    await application.evaluate(() => globalThis.metadataFixture.reset('session'));
    if (scenario === 'rubric-unavailable') {
      const record = await application.evaluate(() => globalThis.metadataFixture.collectStudent());
      assert.equal(record.sources.rubrics, undefined, 'A failed later page does not export partial rubric success');
      assert.equal(record.coverage.find(source => source.source === 'rubric criteria').status, 'error');
      assert.doesNotMatch(JSON.stringify(record), /private-message-fixture-error/);
    } else {
      await assert.rejects(application.evaluate(() => globalThis.metadataFixture.collectStudent()), /Reconnect Canvas/);
    }
  }
  for (const scenario of ['message-unavailable', 'message-identity', 'message-expired']) {
    mode = scenario;
    await application.evaluate(() => globalThis.metadataFixture.reset('session'));
    if (scenario === 'message-unavailable') {
      const record = await application.evaluate(() => globalThis.metadataFixture.collectStudent());
      assert.equal(record.sources.metadata.assignments.length, 2);
      assert.equal(record.sources.conversation, undefined, 'A failed second message page must discard the first');
      assert.equal(record.coverage.find(source => source.source === 'course messages').status, 'error');
      assert.doesNotMatch(JSON.stringify(record), /private-message-fixture/);
    } else {
      await assert.rejects(application.evaluate(() => globalThis.metadataFixture.collectStudent()), /Reconnect Canvas/);
    }
  }
  for (const scenario of ['syllabus-unavailable', 'syllabus-identity', 'syllabus-expired']) {
    mode = scenario;
    await application.evaluate(() => globalThis.metadataFixture.reset('session'));
    if (scenario === 'syllabus-unavailable') {
      const record = await application.evaluate(() => globalThis.metadataFixture.collectStudent());
      assert.equal(record.sources.syllabus, undefined);
      assert.equal(record.sources.metadata.assignments.length, 2);
      assert.equal(record.sources.conversation.length, 2);
      assert.equal(record.coverage.find(source => source.source === 'course syllabus').status, 'error');
      assert.doesNotMatch(JSON.stringify(record), /private-message-fixture/);
    } else {
      await assert.rejects(application.evaluate(() => globalThis.metadataFixture.collectStudent()), /Reconnect Canvas/);
    }
  }
  console.log('Metadata network checks passed: real Electron CSRF-cookie extraction and rejection, POST/body admission, fixed account preflight, paginated metadata/enrollment/messages/rubrics, stored syllabus, optional-source recovery, fatal identity/login rejection, foreign-user rejection, renderer denial, session/token separation, manual redirects, response limits, GraphQL errors, connection cancellation and sanitized audit. Local HTTPS only.');
  console.log('Fixture profile: ' + directory);
} finally {
  if (application) await application.close();
  server.closeAllConnections();
  await new Promise(resolve => server.close(resolve));
}
