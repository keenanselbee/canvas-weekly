import { app, BrowserWindow, session } from 'electron';
import { CanvasMetadataTransport } from '../../src/canvas-metadata-transport.js';
import { CanvasAudit } from '../../src/canvas-audit.js';
import { metadataRequest, collectMetadata } from '../../src/canvas-metadata.js';
import { canvasSessionAuthentication } from '../../src/canvas-csrf.js';
import { collectEnrollmentScope } from '../../src/canvas-enrollment-scope.js';
import { collectStudentMetadata } from '../../src/canvas-student-collection.js';
import { CanvasConnection } from '../../src/canvas-session.js';
import { CanvasClient } from '../../src/canvas-client.js';
import assert from 'node:assert/strict';

// Standalone local fixture. Never load the production app or its saved profile.
app.setPath('userData', process.env.CANVAS_METADATA_TEST_DATA);
globalThis.metadataFixtureReady = app.whenReady().then(async () => {
  const origin = process.env.CANVAS_METADATA_TEST_ORIGIN;
  if (!/^https:\/\/127\.0\.0\.1:\d+$/.test(origin)) throw new Error('Only local fixture HTTPS is allowed.');
  const isolated = session.fromPartition('metadata-fixture');
  isolated.setCertificateVerifyProc((request, callback) => callback(request.hostname === '127.0.0.1' ? 0 : -3));
  isolated.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  isolated.on('will-download', event => event.preventDefault());
  const window = new BrowserWindow({ show: false, webPreferences: { session: isolated, sandbox: true, contextIsolation: true, nodeIntegration: false } });
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  const state = { isolated, window, origin, connection: null, transport: null, pending: null, release: null, hold: null, fetchEntered: false,
    canonical: metadataRequest('assignments', '1', '99') };
  const audit = new CanvasAudit(process.env.CANVAS_METADATA_TEST_DATA);
  state.reset = kind => {
    state.connection?.abort();
    state.connection = new AbortController();
    state.transport = new CanvasMetadataTransport({ origin, courseId: '1', studentId: '99', globalUserId: '90099', connectionSignal: state.connection.signal,
      authentication: () => kind === 'session' ? canvasSessionAuthentication({ origin, cookies: isolated.cookies, signal: state.connection.signal })
        : { kind, value: 'fixture-bearer-only' },
      audit: event => audit.write(event), fetcher: async (url, init) => {
        if (state.hold) { state.fetchEntered = true; await state.hold; }
        return isolated.fetch(url, init);
      } });
  };
  state.read = () => state.transport.request(metadataRequest('assignments', '1', '99'));
  state.accounts = () => state.transport.checkAccountMembership();
  state.collect = () => collectMetadata({ courseId: '1', studentId: '99', transport: state.transport, signal: state.connection.signal });
  state.collectStudent = () => collectStudentMetadata({ courseId: '1', studentId: '99', globalUserId: '90099',
    transport: state.transport, signal: state.connection.signal });
  state.enrollments = () => collectEnrollmentScope({ courseId: '1', studentId: '99', signal: state.connection.signal,
    request: (value, signal) => state.transport.request(value, signal) });
  state.reset('session');
  state.testConnectionBridge = async () => {
    const settings = { value: { canvasBaseUrl: origin, selectedCourseIds: ['1'] } };
    const connection = new CanvasConnection({ directory: process.env.CANVAS_METADATA_TEST_DATA, settings, onChange: () => {} });
    connection.session.setCertificateVerifyProc((request, callback) => callback(request.hostname === '127.0.0.1' ? 0 : -3));
    connection.profile = { id: '99', globalId: '90099', name: 'Synthetic student' };
    const paused = Object.getOwnPropertyDescriptor(CanvasClient.prototype, 'collectionIssue');
    let watchCalls = 0;
    const watch = connection.watchSession.bind(connection);
    connection.watchSession = (...args) => { watchCalls++; return watch(...args); };
    await assert.rejects(connection.collectMetadata(), /refresh is paused/);
    assert.equal(watchCalls, 0, 'The connection method must honor the production hold before watching cookies');
    await connection.session.cookies.set({ url: origin, name: '_normandy_session', value: 'fixture-bridge-session', httpOnly: true, secure: true, path: '/' });
    await connection.session.cookies.set({ url: origin, name: '_csrf_token', value: encodeURIComponent(Buffer.alloc(64, 251).toString('base64')), secure: true, path: '/' });
    // Test-process replacement only. No app setting or production switch exists.
    Object.defineProperty(CanvasClient.prototype, 'collectionIssue', { configurable: true, get: () => null });
    try {
      const cookieListeners = connection.session.cookies.listenerCount('changed');
      const records = await connection.collectMetadata();
      assert.equal(records.length, 1);
      assert.equal(records[0].sources.metadata.assignments.length, 2);
      assert.equal(connection.session.cookies.listenerCount('changed'), cookieListeners, 'Cookie watcher must be disposed');
      await assert.rejects(connection.session.fetch(origin + '/api/graphql', { method: 'POST', body: JSON.stringify(state.canonical) }));
      let concurrent;
      await assert.rejects(connection.collectMetadata({ onProgress: () => {
        concurrent = connection.collectMetadata().catch(error => error);
        connection.invalidate();
      } }), { name: 'AbortError' });
      assert.match((await concurrent).message, /already running/);
      assert.equal(connection.session.cookies.listenerCount('changed'), cookieListeners);
      return { count: records.length, pausedBeforeWatch: true, deniedOutsideRun: true, cancelledOnChange: true };
    } finally {
      connection.invalidate();
      Object.defineProperty(CanvasClient.prototype, 'collectionIssue', paused);
    }
  };
  isolated.webRequest.onBeforeRequest((details, callback) => {
    const fixturePage = details.webContentsId === window.webContents.id && details.method === 'GET' && details.url === origin + '/fixture';
    callback({ cancel: !fixturePage && !state.transport.allows(details) });
  });
  await isolated.cookies.set({ url: origin, name: 'fixture_session', value: 'fixture-cookie-only', httpOnly: true, secure: true, path: '/' });
  await isolated.cookies.set({ url: origin, name: '_csrf_token', value: encodeURIComponent(Buffer.alloc(64, 251).toString('base64')), secure: true, path: '/' });
  await window.loadURL(origin + '/fixture');
  globalThis.metadataFixture = state;
});
