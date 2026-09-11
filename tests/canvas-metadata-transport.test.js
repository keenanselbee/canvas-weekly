import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { CanvasMetadataTransport } from '../src/canvas-metadata-transport.js';
import { CanvasAudit } from '../src/canvas-audit.js';
import { metadataRequest } from '../src/canvas-metadata.js';
import { enrollmentScopeRequest } from '../src/canvas-enrollment-scope.js';

const request = () => metadataRequest('assignments', '1', '99');
const response = () => new Response('{"data":{"course":null}}', { headers: { 'content-type': 'application/json' } });
function fixture(options = {}) {
  const connection = new AbortController();
  const events = [];
  const sent = [];
  let transport;
  let id = 0;
  const details = (init, overrides = {}) => ({ id: ++id, url: 'https://canvas.example/api/graphql', method: init.method, webContentsId: 0,
    resourceType: 'other', uploadData: [{ bytes: Buffer.from(init.body) }], ...overrides });
  transport = new CanvasMetadataTransport({ origin: 'https://canvas.example', courseId: '1', studentId: '99', connectionSignal: connection.signal,
    authentication: async () => ({ kind: 'session', value: 'fixture-csrf-secret' }),
    audit: async event => events.push(event),
    fetcher: async (url, init) => {
      sent.push({ url, init });
      assert.equal(transport.allows(details(init)), true);
      return response();
    }, ...options });
  return { transport, connection, events, sent, details };
}

test('metadata transport rejects altered requests before authentication, audit or network', async () => {
  const setup = fixture({ authentication: () => assert.fail('Invalid requests must not load authentication') });
  for (const altered of [null, {}, { ...request(), operationName: 'CreateSubmission' }, metadataRequest('assignments', '2', '99'),
    metadataRequest('submissions', '1', '100'), { ...request(), query: 'mutation { submitAssignment }' }, { ...request(), session_token: 'x' },
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

test('isolated enrollment transport uses exact admission and distinct content-free audit events', async () => {
  const setup = fixture();
  await setup.transport.request(enrollmentScopeRequest('1', '99', 'private-cursor'));
  assert.equal(setup.sent.length, 1);
  assert.equal(setup.sent[0].init.method, 'POST');
  assert.deepEqual(JSON.parse(setup.sent[0].init.body), enrollmentScopeRequest('1', '99', 'private-cursor'));
  assert.deepEqual(setup.events.map(event => event.operation), ['metadataenrollments', 'metadataenrollments', 'metadataenrollments']);
  assert.equal(setup.events[0].paginated, true);
  assert.doesNotMatch(JSON.stringify(setup.events), /private-cursor|StudentEnrollment|courseId|studentId|query/);
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
    assert.doesNotMatch(JSON.stringify(setup.events), /private-fixture|csrf|Authorization|courseId|studentId|query/);
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
    () => new Response('<form>private-content</form>', { headers: { 'content-type': 'text/html' } }),
    () => new Response('private-content', { headers: { 'content-type': 'application/json' } }),
    () => new Response(Buffer.from([0xff]), { headers: { 'content-type': 'application/json' } }),
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
      if (mode === 'declared') return new Response('[]', { headers: { 'content-type': 'application/json', 'content-length': String(2 * 1024 * 1024 + 1) } });
      if (mode === 'total') return new Response('"' + 'x'.repeat(2 * 1024 * 1024 - 2) + '"', { headers: { 'content-type': 'application/json' } });
      return new Response(new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(2 * 1024 * 1024 + 1)); }, cancel() { cancelled = true; } }),
        { headers: { 'content-type': 'application/json', 'content-length': '1' } });
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
    return new Response(new ReadableStream({ pull() { streamStarted(); } }), { headers: { 'content-type': 'application/json' } });
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
