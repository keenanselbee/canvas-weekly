import { app, BrowserWindow, session } from 'electron';
import { CanvasMetadataTransport } from '../../src/canvas-metadata-transport.js';
import { CanvasAudit } from '../../src/canvas-audit.js';
import { metadataRequest, collectMetadata } from '../../src/canvas-metadata.js';

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
    state.transport = new CanvasMetadataTransport({ origin, courseId: '1', studentId: '99', connectionSignal: state.connection.signal,
      authentication: async () => ({ kind, value: kind === 'session' ? 'fixture-csrf-only' : 'fixture-bearer-only' }),
      audit: event => audit.write(event), fetcher: async (url, init) => {
        if (state.hold) { state.fetchEntered = true; await state.hold; }
        return isolated.fetch(url, init);
      } });
  };
  state.read = () => state.transport.request(metadataRequest('assignments', '1', '99'));
  state.collect = () => collectMetadata({ courseId: '1', studentId: '99', request: (value, signal) => state.transport.request(value, signal) });
  state.reset('session');
  isolated.webRequest.onBeforeRequest((details, callback) => {
    const fixturePage = details.webContentsId === window.webContents.id && details.method === 'GET' && details.url === origin + '/fixture';
    callback({ cancel: !fixturePage && !state.transport.allows(details) });
  });
  await isolated.cookies.set({ url: origin, name: 'fixture_session', value: 'fixture-cookie-only', httpOnly: true, secure: true, path: '/' });
  await window.loadURL(origin + '/fixture');
  globalThis.metadataFixture = state;
});
