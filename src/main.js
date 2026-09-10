import { app, BrowserWindow, ipcMain, nativeTheme, dialog, shell } from 'electron';
import path from 'node:path';
import fs from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { SettingsStore, validateSettings } from './settings.js';
import { CanvasConnection } from './canvas-session.js';

const directory = path.dirname(fileURLToPath(import.meta.url));
const uiUrl = pathToFileURL(path.join(directory, 'ui/index.html')).href;
const testMode = process.env.CANVAS_WEEKLY_TEST === '1';
if (!app.isPackaged) app.setPath('userData', path.resolve(directory, '../.local', testMode ? 'test-app' : 'app'));
const store = new SettingsStore(app.getPath('userData'));
let window;
let canvas;
let courses = [];

function snapshot() {
  return {
    settings: store.value,
    outputDirectory: store.value.outputDirectory || path.join(app.getPath('desktop'), 'Canvas Weekly'),
    appearance: { source: nativeTheme.themeSource, dark: nativeTheme.shouldUseDarkColors },
    canvas: canvas?.status || { connected: false },
    courses,
    ai: { connected: false },
  };
}

function publish() {
  if (window && !window.isDestroyed()) window.webContents.send('state:changed', snapshot());
}

function handle(channel, callback) {
  ipcMain.handle(channel, async (event, ...args) => {
    if (!window || event.sender !== window.webContents || event.senderFrame !== window.webContents.mainFrame || event.senderFrame.url !== uiUrl) {
      throw new Error('Untrusted application request.');
    }
    try { return { ok: true, value: await callback(...args) }; }
    catch (error) { return { ok: false, error: error.message }; }
  });
}

if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', () => { if (window) { window.show(); window.focus(); } });
  app.whenReady().then(async () => {
    await store.load();
    canvas = new CanvasConnection({ directory: app.getPath('userData'), settings: store, onChange: publish });
    await canvas.restore();
    nativeTheme.themeSource = store.value.theme;
    window = new BrowserWindow({
      width: 1140, height: 820, minWidth: 800, minHeight: 600,
      title: 'Canvas Weekly', show: !testMode,
      backgroundColor: nativeTheme.shouldUseDarkColors ? '#202020' : '#f3f3f3',
      webPreferences: { preload: path.join(directory, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true },
    });
    window.removeMenu();
    window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    window.webContents.on('will-navigate', event => event.preventDefault());
    window.webContents.session.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
    handle('state:get', snapshot);
    handle('canvas:login', async () => { await canvas.openLogin(); return snapshot(); });
    handle('canvas:verify', async () => {
      courses = [];
      await canvas.finishLogin();
      courses = await canvas.client().read('courses', {}, true);
      return snapshot();
    });
    handle('canvas:token', async token => {
      courses = [];
      await canvas.connectToken(token);
      courses = await canvas.client().read('courses', {}, true);
      return snapshot();
    });
    handle('canvas:disconnect', async () => { await canvas.disconnect(); courses = []; return snapshot(); });
    handle('settings:canvas', async origin => {
      validateSettings({ ...store.value, canvasBaseUrl: origin });
      const canvasBaseUrl = new URL(origin).origin;
      validateSettings({ ...store.value, canvasBaseUrl });
      if (canvasBaseUrl !== store.value.canvasBaseUrl) {
        await canvas.disconnect();
        await store.update({ canvasBaseUrl, selectedCourseIds: [] });
        courses = [];
      }
      return snapshot();
    });
    handle('courses:select', async selectedCourseIds => {
      if (!Array.isArray(selectedCourseIds) || !selectedCourseIds.every(id => courses.some(course => String(course.id) === id))) throw new Error('Choose courses from the connected account.');
      await store.update({ selectedCourseIds: [...new Set(selectedCourseIds)] });
      return snapshot();
    });
    handle('settings:theme', async theme => {
      await store.update({ theme });
      nativeTheme.themeSource = theme;
      return snapshot();
    });
    handle('settings:output', async () => {
      const result = await dialog.showOpenDialog(window, { title: 'Choose weekly guide folder', properties: ['openDirectory', 'createDirectory'], defaultPath: snapshot().outputDirectory });
      if (!result.canceled) await store.update({ outputDirectory: result.filePaths[0] });
      return snapshot();
    });
    handle('output:open', async () => {
      const output = snapshot().outputDirectory;
      await fs.mkdir(output, { recursive: true });
      const error = await shell.openPath(output);
      if (error) throw new Error(error);
    });
    nativeTheme.on('updated', () => {
      if (!window.isDestroyed()) window.webContents.send('state:changed', snapshot());
    });
    await window.loadURL(uiUrl);
  }).catch(error => { dialog.showErrorBox('Canvas Weekly could not start', error.message); app.quit(); });
  app.on('window-all-closed', () => app.quit());
}
