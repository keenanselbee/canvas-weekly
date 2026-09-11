import { BrowserWindow, session, safeStorage } from 'electron';
import fs from 'node:fs/promises';
import path from 'node:path';
import { CanvasClient, blockedAssessmentUrl } from './canvas-client.js';
import { atomicJson } from './settings.js';
import { CanvasAudit } from './canvas-audit.js';
import { CanvasNetwork } from './canvas-network.js';
import { watchCanvasSession } from './canvas-session-watch.js';
import { canvasResponseIdentity } from './canvas-identity.js';
import { CanvasMetadataTransport } from './canvas-metadata-transport.js';
import { canvasSessionAuthentication } from './canvas-csrf.js';
import { collectStudentMetadata } from './canvas-student-collection.js';

export class CanvasConnection {
  #metadataTransport = null;
  #metadataRunning = false;
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
    this.lifetime = new AbortController();
    this.credentialWrites = Promise.resolve();
    this.session = session.fromPartition('persist:canvas');
    this.network = new CanvasNetwork({ origin: () => new URL(this.settings.value.canvasBaseUrl).origin,
      loginContentsId: () => this.loginWindow?.webContents.id,
      fetcher: (url, init) => this.session.fetch(url, init) });
    this.session.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
    this.session.on('will-download', event => event.preventDefault());
    this.session.webRequest.onBeforeRequest((details, callback) => {
      callback({ cancel: !(this.#metadataTransport?.allows(details) || this.network.allows(details)) });
    });
  }
  get status() { return { connected: Boolean(this.profile), name: this.profile?.name || null, connecting: Boolean(this.loginWindow), error: this.connectionError, collectionIssue: this.client().collectionIssue }; }
  invalidate() {
    this.lifetime.abort(new DOMException('Canvas connection changed. Start again with the current account.', 'AbortError'));
    this.lifetime = new AbortController();
  }
  async writeCredential(callback) {
    const operation = this.credentialWrites.then(callback);
    this.credentialWrites = operation.catch(() => {});
    return operation;
  }
  capture({ includeCourses = true } = {}) {
    if (!this.profile) throw new Error('Connect Canvas before reading course information.');
    const { signal } = this.lifetime;
    const origin = this.settings.value.canvasBaseUrl;
    const userId = this.profile.id;
    const globalUserId = this.profile.globalId;
    const token = this.token;
    const courseIds = Object.freeze([...this.settings.value.selectedCourseIds].sort());
    const assertCurrent = () => {
      signal.throwIfAborted();
      if (origin !== this.settings.value.canvasBaseUrl || userId !== this.profile?.id || globalUserId !== this.profile?.globalId || token !== this.token
        || (includeCourses && JSON.stringify(courseIds) !== JSON.stringify([...this.settings.value.selectedCourseIds].sort()))) {
        throw new DOMException('Canvas account or course selection changed. Start the refresh again.', 'AbortError');
      }
    };
    // Local identity/lifetime binding only; this does not prove enrollment roles
    // or detect an account change in the remote session cookie store.
    return Object.freeze({ origin, userId, globalUserId, courseIds, signal, assertCurrent });
  }
  async restore() {
    const { signal } = this.lifetime;
    try {
      const credential = JSON.parse(await fs.readFile(this.file, 'utf8'));
      signal.throwIfAborted();
      if (credential.origin === this.settings.value.canvasBaseUrl && safeStorage.isEncryptionAvailable()) {
        this.token = safeStorage.decryptString(Buffer.from(credential.encrypted, 'base64'));
      }
    } catch (error) { if (error.code !== 'ENOENT') this.restoreError = 'Saved Canvas connection could not be restored. Reconnect Canvas.'; }
  }
  async watchSession(binding, signal) {
    binding.assertCurrent();
    if (this.token) return null;
    const watcher = await watchCanvasSession({ cookies: this.session.cookies, origin: binding.origin,
      signal: AbortSignal.any([signal, binding.signal]) });
    try { binding.assertCurrent(); return watcher; }
    catch (error) { watcher.dispose(); throw error; }
  }
  async hasSavedSession() {
    if (this.token) return true;
    const cookies = await this.session.cookies.get({ url: this.settings.value.canvasBaseUrl });
    return cookies.length > 0;
  }
  client(options = {}) {
    const origin = this.settings.value.canvasBaseUrl;
    const token = this.token;
    const globalUserId = this.profile?.globalId;
    const signal = AbortSignal.any([this.lifetime.signal, ...(options.signal ? [options.signal] : [])]);
    return new CanvasClient({ ...options, origin, token, signal,
      fetcher: async (url, init) => {
        signal.throwIfAborted();
        if (origin !== this.settings.value.canvasBaseUrl || token !== this.token) throw new DOMException('Canvas connection changed.', 'AbortError');
        const response = await this.network.fetch(url, init);
        if (signal.aborted) { await response.body?.cancel(); signal.throwIfAborted(); }
        if (response.status === 200 && (options.captureIdentity || globalUserId)) {
          try {
            const identity = canvasResponseIdentity(response.headers, options.captureIdentity ? undefined : globalUserId);
            options.captureIdentity?.(identity);
          }
          catch (error) { await response.body?.cancel(); throw error; }
        }
        return response;
      }, audit: event => this.audit.write(event) });
  }
  async collectMetadata({ signal, onProgress = () => {} } = {}) {
    // Keep a second hold here: direct callers must not bypass guide:update's
    // production guard. No watcher, credentials, audit or request starts first.
    const issue = this.client().collectionIssue;
    if (issue) throw new Error(issue);
    if (this.#metadataRunning) throw new Error('A Canvas collection is already running.');
    const binding = this.capture();
    if (!binding.courseIds.length) throw new Error('Choose at least one course first.');
    this.#metadataRunning = true;
    const run = new AbortController();
    let watcher;
    let currentSignal = AbortSignal.any([binding.signal, run.signal, ...(signal ? [signal] : [])]);
    try {
      watcher = await this.watchSession(binding, currentSignal);
      if (watcher) currentSignal = AbortSignal.any([currentSignal, watcher.signal]);
      const records = [];
      for (let index = 0; index < binding.courseIds.length; index++) {
        binding.assertCurrent();
        currentSignal.throwIfAborted();
        await watcher?.check();
        onProgress(`Reading course ${index + 1} of ${binding.courseIds.length}...`);
        const transport = new CanvasMetadataTransport({ origin: binding.origin, courseId: binding.courseIds[index],
          studentId: binding.userId, globalUserId: binding.globalUserId, connectionSignal: currentSignal,
          authentication: () => {
            binding.assertCurrent();
            return this.token ? { kind: 'token', value: this.token }
              : canvasSessionAuthentication({ origin: binding.origin, cookies: this.session.cookies, signal: currentSignal });
          },
          fetcher: (url, init) => { binding.assertCurrent(); currentSignal.throwIfAborted(); return this.session.fetch(url, init); },
          audit: event => this.audit.write(event) });
        this.#metadataTransport = transport;
        const record = await collectStudentMetadata({ transport, courseId: binding.courseIds[index], studentId: binding.userId,
          globalUserId: binding.globalUserId, signal: currentSignal });
        this.#metadataTransport = null;
        await watcher?.check();
        binding.assertCurrent();
        currentSignal.throwIfAborted();
        records.push(record);
      }
      return records;
    } finally {
      run.abort();
      this.#metadataTransport = null;
      watcher?.dispose();
      this.#metadataRunning = false;
    }
  }
  async verify() {
    const lifetime = this.lifetime;
    if (this.verification?.lifetime === lifetime) return this.verification.promise;
    const previousId = this.profile?.id;
    const previousGlobalId = this.profile?.globalId;
    const promise = (async () => {
      this.profile = null;
      this.connectionError = null;
      try {
        // A browser-session check must not race a queued local sign-out that is
        // still clearing cookies. Token checks do not depend on that cookie jar.
        if (!this.token) await this.credentialWrites;
        lifetime.signal.throwIfAborted();
        let identity;
        const profile = await this.client({ captureIdentity: value => { identity = value; } }).read('profile');
        lifetime.signal.throwIfAborted();
        const userId = String(profile?.id || '');
        if (!/^[1-9]\d{0,31}$/.test(userId) || (typeof profile.id === 'number' && !Number.isSafeInteger(profile.id))) throw new Error('Canvas did not return a valid account profile.');
        if (!identity) throw new Error('Canvas did not confirm the account identity. Reconnect Canvas before continuing.');
        await this.session.cookies.flushStore();
        lifetime.signal.throwIfAborted();
        if ((previousId && previousId !== userId) || (previousGlobalId && previousGlobalId !== identity.globalUserId)) this.invalidate();
        this.profile = { id: userId, globalId: identity.globalUserId, name: String(profile.name || 'Canvas account') };
        return this.status;
      } catch (error) {
        lifetime.signal.throwIfAborted();
        this.profile = null;
        this.connectionError = error.message;
        throw error;
      } finally { this.onChange(); }
    })();
    const verification = { lifetime, promise };
    this.verification = verification;
    try { return await promise; }
    finally { if (this.verification === verification) this.verification = null; }
  }
  async connectToken(value) {
    if (typeof value !== 'string' || value.trim().length < 10 || value.length > 4096 || /[\r\n]/.test(value)) throw new Error('Enter a valid institution-issued Canvas API token.');
    if (!safeStorage.isEncryptionAvailable()) throw new Error('Windows credential encryption is unavailable. Use browser sign-in instead.');
    const previous = this.token;
    this.invalidate();
    const { signal } = this.lifetime;
    this.profile = null;
    this.token = value.trim();
    try {
      await this.verify();
      signal.throwIfAborted();
      const credential = { origin: this.settings.value.canvasBaseUrl, encrypted: safeStorage.encryptString(this.token).toString('base64') };
      await this.writeCredential(async () => { signal.throwIfAborted(); await atomicJson(this.file, credential); });
      signal.throwIfAborted();
    } catch (error) { if (!signal.aborted) { this.invalidate(); this.token = previous; this.profile = null; } throw error; }
    return this.status;
  }
  async openLogin() {
    if (this.loginWindow) { this.loginWindow.focus(); return; }
    this.invalidate();
    const lifetime = this.lifetime;
    const origin = this.settings.value.canvasBaseUrl;
    this.token = null;
    this.profile = null;
    this.connectionError = null;
    await this.writeCredential(() => fs.rm(this.file, { force: true }));
    lifetime.signal.throwIfAborted();
    this.loginWindow = new BrowserWindow({ width: 1000, height: 800, title: 'Sign in to Canvas · Close this window when finished',
      webPreferences: { session: this.session, nodeIntegration: false, contextIsolation: true, sandbox: true } });
    this.loginWindow.removeMenu();
    const loginWindow = this.loginWindow;
    this.loginWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    this.loginWindow.webContents.on('did-navigate', async (_event, value) => {
      const url = new URL(value);
      if (lifetime.signal.aborted || this.loginWindow !== loginWindow || url.origin !== origin || !['/', '/dashboard'].includes(url.pathname) || this.verifying === lifetime) return;
      this.verifying = lifetime;
      try {
        await this.verify();
        lifetime.signal.throwIfAborted();
        this.loginWindow?.close();
        await this.onConnected();
      } catch { /* verify publishes the failure; leave login available for a manual retry. */ }
      finally { if (this.verifying === lifetime) this.verifying = null; }
    });
    this.loginWindow.webContents.on('will-navigate', (event, value) => {
      try { if (new URL(value).protocol !== 'https:' || blockedAssessmentUrl(value)) event.preventDefault(); }
      catch { event.preventDefault(); }
    });
    this.loginWindow.on('closed', () => { if (this.loginWindow === loginWindow) this.loginWindow = null; this.onChange(); });
    this.onChange();
    await loginWindow.loadURL(origin + '/login');
  }
  async finishLogin() {
    if (this.loginWindow) this.loginWindow.close();
    return this.verify();
  }
  async disconnect() {
    this.invalidate();
    if (this.loginWindow) this.loginWindow.close();
    this.profile = null;
    this.token = null;
    this.connectionError = null;
    await this.writeCredential(async () => {
      await fs.rm(this.file, { force: true });
      await this.session.clearStorageData();
    });
    this.onChange();
  }
}
