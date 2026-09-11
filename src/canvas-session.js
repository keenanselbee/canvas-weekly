import { BrowserWindow, session, safeStorage } from 'electron';
import fs from 'node:fs/promises';
import path from 'node:path';
import { CanvasClient, blockedAssessmentUrl } from './canvas-client.js';
import { atomicJson } from './settings.js';
import { CanvasAudit } from './canvas-audit.js';

export class CanvasConnection {
  constructor({ directory, settings, onChange, onConnected = () => {} }) {
    this.file = path.join(directory, 'canvas-credential.json');
    this.audit = new CanvasAudit(directory);
    this.settings = settings;
    this.onChange = onChange;
    this.onConnected = onConnected;
    this.profile = null;
    this.token = null;
    this.loginWindow = null;
    this.connectionError = null;
    this.session = session.fromPartition('persist:canvas');
    this.session.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
    this.session.on('will-download', event => event.preventDefault());
    this.session.webRequest.onBeforeRequest((details, callback) => {
      // This profile is used only for human login and reviewed API reads.
      const url = new URL(details.url);
      if (blockedAssessmentUrl(details.url)) return callback({ cancel: true });
      if (url.origin === new URL(this.settings.value.canvasBaseUrl).origin) {
        const loginRoute = /^\/login(\/|$)/.test(url.pathname);
        if (details.method !== 'GET' && details.method !== 'HEAD' && !loginRoute) return callback({ cancel: true });
        if (details.resourceType === 'mainFrame' && !loginRoute && !['/', '/dashboard'].includes(url.pathname)) return callback({ cancel: true });
      }
      callback({ cancel: false });
    });
  }
  get status() { return { connected: Boolean(this.profile), name: this.profile?.name || null, connecting: Boolean(this.loginWindow), error: this.connectionError }; }
  async restore() {
    try {
      const credential = JSON.parse(await fs.readFile(this.file, 'utf8'));
      if (credential.origin === this.settings.value.canvasBaseUrl && safeStorage.isEncryptionAvailable()) {
        this.token = safeStorage.decryptString(Buffer.from(credential.encrypted, 'base64'));
      }
    } catch (error) { if (error.code !== 'ENOENT') this.restoreError = 'Saved Canvas connection could not be restored. Reconnect Canvas.'; }
  }
  async hasSavedSession() {
    if (this.token) return true;
    const cookies = await this.session.cookies.get({ url: this.settings.value.canvasBaseUrl });
    return cookies.length > 0;
  }
  client(options = {}) {
    return new CanvasClient({ origin: this.settings.value.canvasBaseUrl, token: this.token,
      fetcher: (url, init) => this.session.fetch(url, init), ...options, audit: event => this.audit.write(event) });
  }
  async verify() {
    if (this.verification) return this.verification;
    this.verification = (async () => {
      this.profile = null;
      this.connectionError = null;
      try {
        const profile = await this.client().read('profile');
        if (!profile?.id) throw new Error('Canvas did not return an account profile.');
        this.profile = { id: String(profile.id), name: String(profile.name || 'Canvas account') };
        await this.session.cookies.flushStore();
        return this.status;
      } catch (error) {
        this.profile = null;
        this.connectionError = error.message;
        throw error;
      } finally { this.onChange(); }
    })();
    try { return await this.verification; }
    finally { this.verification = null; }
  }
  async connectToken(value) {
    if (typeof value !== 'string' || value.trim().length < 10 || value.length > 4096 || /[\r\n]/.test(value)) throw new Error('Enter a valid institution-issued Canvas API token.');
    if (!safeStorage.isEncryptionAvailable()) throw new Error('Windows credential encryption is unavailable. Use browser sign-in instead.');
    const previous = this.token;
    this.token = value.trim();
    try {
      await this.verify();
      await atomicJson(this.file, { origin: this.settings.value.canvasBaseUrl, encrypted: safeStorage.encryptString(this.token).toString('base64') });
    } catch (error) { this.token = previous; this.profile = null; throw error; }
    return this.status;
  }
  async openLogin() {
    if (this.loginWindow) { this.loginWindow.focus(); return; }
    this.token = null;
    this.profile = null;
    this.connectionError = null;
    await fs.rm(this.file, { force: true });
    this.loginWindow = new BrowserWindow({ width: 1000, height: 800, title: 'Sign in to Canvas · Close this window when finished',
      webPreferences: { session: this.session, nodeIntegration: false, contextIsolation: true, sandbox: true } });
    this.loginWindow.removeMenu();
    this.loginWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    this.loginWindow.webContents.on('did-navigate', async (_event, value) => {
      const url = new URL(value);
      if (url.origin !== new URL(this.settings.value.canvasBaseUrl).origin || !['/', '/dashboard'].includes(url.pathname) || this.verifying) return;
      this.verifying = true;
      try {
        await this.verify();
        this.loginWindow?.close();
        await this.onConnected();
      } catch { /* verify publishes the failure; leave login available for a manual retry. */ }
      finally { this.verifying = false; }
    });
    this.loginWindow.webContents.on('will-navigate', (event, value) => {
      try { if (new URL(value).protocol !== 'https:' || blockedAssessmentUrl(value)) event.preventDefault(); }
      catch { event.preventDefault(); }
    });
    this.loginWindow.on('closed', () => { this.loginWindow = null; this.onChange(); });
    this.onChange();
    await this.loginWindow.loadURL(this.settings.value.canvasBaseUrl + '/login');
  }
  async finishLogin() {
    if (this.loginWindow) this.loginWindow.close();
    return this.verify();
  }
  async disconnect() {
    if (this.loginWindow) this.loginWindow.close();
    this.profile = null;
    this.token = null;
    this.connectionError = null;
    await fs.rm(this.file, { force: true });
    await this.session.clearStorageData();
    this.onChange();
  }
}
