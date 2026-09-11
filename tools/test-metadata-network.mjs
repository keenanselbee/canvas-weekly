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
    response.writeHead(200, { 'content-type': 'application/json',
      ...(mode === 'missing-identity' ? {} : { 'x-canvas-user-id': mode === 'other-identity' ? '90100' : '90099' }),
      ...(mode === 'impersonated-identity' ? { 'x-canvas-real-user-id': '90100' } : {}) });
    if (mode === 'large') { response.end('"' + 'x'.repeat(2 * 1024 * 1024) + '"'); return; }
    if (mode === 'stream') { response.write('{"data":'); streaming?.(); return; }
    if (mode === 'graphql-error') { response.end('{"data":{"course":null},"errors":[{"message":"private-fixture-error"}]}'); return; }
    const input = JSON.parse(Buffer.concat(chunks));
    if (input.operationName === 'CanvasWeeklyEnrollmentScope') {
      const next = input.variables.after === null ? 'enrollment-next' : null;
      const node = { _id: next ? '31' : '32', userId: '99', course: { _id: '1' },
        type: next ? 'StudentEnrollment' : 'TeacherEnrollment', state: next ? 'active' : 'completed',
        courseSectionId: '2', limitPrivilegesToCourseSection: false, role: { _id: next ? '3' : '4', name: next ? 'StudentEnrollment' : 'TeacherEnrollment' } };
      response.end(JSON.stringify({ data: { user: { _id: mode === 'foreign-enrollment' ? '100' : '99',
        enrollmentsConnection: { nodes: [node], pageInfo: { hasNextPage: next !== null, endCursor: next } } } } }));
      return;
    }
    const assignments = input.operationName === 'CanvasWeeklyAssignments';
    const next = assignments && input.variables.after === null ? 'next' : null;
    const id = input.variables.after === null ? '10' : '11';
    const nodes = assignments ? [{ _id: id, courseId: '1', name: 'Synthetic preparation', state: 'published', pointsPossible: 5,
      dueAt: '2026-09-18T23:59:00-07:00', lockAt: null, unlockAt: null, submissionTypes: ['online_upload'] }]
      : [{ _id: '20', assignmentId: '10', state: 'submitted' }, { _id: '21', assignmentId: '11', state: 'unsubmitted' }];
    response.end(JSON.stringify({ data: { course: { _id: '1', name: 'Example course', courseCode: 'DEMO 1',
      [assignments ? 'assignmentsConnection' : 'submissionsConnection']: { nodes, pageInfo: { hasNextPage: next !== null, endCursor: next } } } } }));
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
  assert.equal(result.assignments[0].dueAt, '2026-09-19T06:59:00.000Z');
  assert.equal(received.length, 3);
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
  assert.equal(received.length, 3, 'Missing or invalid CSRF must not reach the server');
  await application.evaluate(async () => {
    const { isolated, origin } = globalThis.metadataFixture;
    await isolated.cookies.set({ url: origin, name: '_csrf_token', value: encodeURIComponent(Buffer.alloc(64, 251).toString('base64')), secure: true, path: '/' });
  });
  await assert.rejects(application.evaluate(async () => {
    const { isolated, origin } = globalThis.metadataFixture;
    await isolated.fetch(origin + '/api/graphql', { method: 'POST', body: '{"query":"mutation { submit }"}' });
  }));
  assert.equal(received.length, 3);
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
  assert.equal(received.length, 3, 'Renderer borrowing must not reach the server');
  await application.evaluate(async () => { const state = globalThis.metadataFixture; state.release(); state.hold = null; await state.pending; });
  assert.equal(received.length, 4);
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
  assert.equal(records.filter(event => event.operation === 'metadataenrollments' && event.event === 'request').length, 3);
  assert.doesNotMatch(log, /enrollment-next|StudentEnrollment|TeacherEnrollment/);
  console.log('Metadata network checks passed: real Electron CSRF-cookie extraction and rejection, POST/body admission, paginated metadata/enrollment parsing, foreign-user rejection, renderer denial, session/token separation, manual redirects, response limits, GraphQL errors, connection cancellation and sanitized audit. Local HTTPS only.');
  console.log('Fixture profile: ' + directory);
} finally {
  if (application) await application.close();
  server.closeAllConnections();
  await new Promise(resolve => server.close(resolve));
}
