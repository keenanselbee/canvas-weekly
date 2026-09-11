import { app, BrowserWindow } from 'electron';
import { CanvasConnection } from '../../src/canvas-session.js';

// Standalone fixture: never load the real app or its saved account/profile.
app.setPath('userData', process.env.CANVAS_NETWORK_TEST_DATA);
globalThis.networkFixtureReady = app.whenReady().then(() => {
  const connection = new CanvasConnection({ directory: process.env.CANVAS_NETWORK_TEST_DATA,
    settings: { value: { canvasBaseUrl: process.env.CANVAS_NETWORK_TEST_ORIGIN } }, onChange() {} });
  connection.session.setCertificateVerifyProc((request, callback) => callback(request.hostname === '127.0.0.1' ? 0 : -3));
  const window = new BrowserWindow({ show: false, webPreferences: { session: connection.session, sandbox: true, contextIsolation: true, nodeIntegration: false } });
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  globalThis.networkFixture = { connection, window };
});
