import { BrowserWindow, session, safeStorage } from 'electron';
import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
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
import { METADATA_NOTICE } from './canvas-metadata.js';
import { EncryptedFile } from './encrypted-file.js';

export class CanvasConnection {
  #metadataTransport = null;
  #metadataRunning = false;
  constructor({ directory, settings, onChange, onConnected = () => {} }) {
    this.file = path.join(directory, 'canvas-credential.json');
    this.savedSession = new EncryptedFile(path.join(directory, 'canvas-session.encrypted.json'), {
      encrypt: value => {
        if (!safeStorage.isEncryptionAvailable()) throw new Error();
        return safeStorage.encryptString(value);
      },
      decrypt: value => safeStorage.decryptString(value),
    });
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
    this.attachSession();
  }
  attachSession() {
    if (this.cookieListener) this.session.cookies.removeListener('changed', this.cookieListener);
    this.session = session.fromPartition(this.settings.value.rememberCanvas === false ? 'canvas-private' : 'persist:canvas');
    this.browserLoginData = false;
    this.cookieListener = () => { void this.refreshLoginData(); };
    this.session.cookies.on('changed', this.cookieListener);
    this.network = new CanvasNetwork({ origin: () => new URL(this.settings.value.canvasBaseUrl).origin,
      loginContentsId: () => this.loginWindow?.webContents.id,
      fetcher: (url, init) => this.session.fetch(url, init) });
    this.session.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
    this.session.on('will-download', event => event.preventDefault());
    this.session.webRequest.onBeforeRequest((details, callback) => {
      callback({ cancel: !(this.#metadataTransport?.allows(details) || this.network.allows(details)) });
    });
  }
  get collectionIssue() { return null; }
  get status() { return { connected: Boolean(this.profile), canForget: Boolean(this.profile || this.token || this.browserLoginData || existsSync(this.file) || existsSync(this.savedSession.file)), name: this.profile?.name || null, connecting: Boolean(this.loginWindow), error: this.connectionError, collectionIssue: this.collectionIssue, collectionNotice: METADATA_NOTICE }; }
  async refreshLoginData() {
    const currentSession = this.session;
    const check = Symbol();
    this.loginDataCheck = check;
    let present;
    // Include identity-provider cookies left by an incomplete sign-in. Only a
    // boolean leaves this process; expired/unreadable saved files remain clearable.
    try { present = (await currentSession.cookies.get({})).length > 0; }
    catch { present = true; }
    if (this.session !== currentSession || this.loginDataCheck !== check) return;
    const changed = this.browserLoginData !== present;
    this.browserLoginData = present;
    if (changed) this.onChange();
  }
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
    await this.refreshLoginData();
    const { signal } = this.lifetime;
    if (this.settings.value.rememberCanvas === false) {
      await this.writeCredential(async () => {
        await fs.rm(this.file, { force: true });
        await this.savedSession.remove();
        await session.fromPartition('persist:canvas').clearStorageData();
      });
      return;
    }
    try {
      const credential = JSON.parse(await fs.readFile(this.file, 'utf8'));
      signal.throwIfAborted();
      if (credential.origin === this.settings.value.canvasBaseUrl && safeStorage.isEncryptionAvailable()) {
        this.token = safeStorage.decryptString(Buffer.from(credential.encrypted, 'base64'));
      }
    } catch (error) { if (error.code !== 'ENOENT') this.restoreError = 'Saved Canvas connection could not be restored. Reconnect Canvas.'; }
    if (this.token) return;
    try {
      const saved = await this.savedSession.read();
      if (!saved) return;
      if (saved.origin !== this.settings.value.canvasBaseUrl || !Number.isFinite(saved.until) || saved.until <= Date.now()) {
        if (saved.origin === this.settings.value.canvasBaseUrl) this.restoreError = 'Saved Canvas sign-in expired. Sign in again.';
        await this.savedSession.remove(); return;
      }
      if (!Array.isArray(saved.cookies) || saved.cookies.length > 100) throw new Error();
      // Never overwrite a newer live/browser-persisted cookie with a snapshot.
      const current = await this.session.cookies.get({ url: saved.origin });
      for (const cookie of saved.cookies) {
        signal.throwIfAborted();
        if (!['_normandy_session', '_csrf_token'].includes(cookie.name) || cookie.url !== saved.origin
          || cookie.path !== '/' || cookie.secure !== true || cookie.domain !== undefined
          || typeof cookie.value !== 'string' || cookie.value.length > 16384) throw new Error();
        if (cookie.expirationDate !== undefined && (!Number.isFinite(cookie.expirationDate) || cookie.expirationDate <= Date.now() / 1000)) {
          if (cookie.name === '_normandy_session') this.restoreError = 'Saved Canvas sign-in expired. Sign in again.';
          continue;
        }
        if (!current.some(item => item.name === cookie.name)) await this.session.cookies.set(cookie);
      }
    } catch { this.restoreError = 'Saved Canvas session could not be restored. Sign in again.'; }
    finally { if (this.restoreError) this.connectionError = this.restoreError; }
  }
  async rememberSession(signal) {
    if (this.settings.value.rememberCanvas === false || this.token) return;
    const origin = this.settings.value.canvasBaseUrl;
    const cookies = (await this.session.cookies.get({ url: origin })).filter(cookie =>
      ['_normandy_session', '_csrf_token'].includes(cookie.name) && cookie.path === '/' && cookie.secure
      && cookie.hostOnly && cookie.domain === new URL(origin).hostname).map(cookie => ({
        url: origin, name: cookie.name, value: cookie.value, path: cookie.path, secure: cookie.secure,
        httpOnly: cookie.httpOnly, sameSite: cookie.sameSite,
        ...(cookie.session ? {} : { expirationDate: cookie.expirationDate }),
      }));
    if (!cookies.some(cookie => cookie.name === '_normandy_session')) return;
    await this.writeCredential(async () => {
      signal.throwIfAborted();
      await this.savedSession.write({ origin, until: Date.now() + 7 * 86400000, cookies });
    });
  }
  async setRemember(remember) {
    if (typeof remember !== 'boolean') throw new Error('Choose whether to remember Canvas.');
    if (this.loginWindow) throw new Error('Finish Canvas sign-in before changing this setting.');
    if (remember === (this.settings.value.rememberCanvas !== false)) return;
    await this.disconnect();
    await this.settings.update({ rememberCanvas: remember });
    this.attachSession();
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
    // Share any collection hold with guide:update. The legacy REST collector
    // remains disabled; only the fixed metadata transport below is admitted.
    const issue = this.collectionIssue;
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
        await this.rememberSession(lifetime.signal);
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
    if (this.settings.value.rememberCanvas !== false && !safeStorage.isEncryptionAvailable()) throw new Error('Windows credential encryption is unavailable. Turn off Remember Canvas to connect for this session.');
    const previous = this.token;
    this.invalidate();
    const { signal } = this.lifetime;
    this.profile = null;
    this.token = value.trim();
    try {
      await this.verify();
      signal.throwIfAborted();
      if (this.settings.value.rememberCanvas !== false) {
        const credential = { origin: this.settings.value.canvasBaseUrl, encrypted: safeStorage.encryptString(this.token).toString('base64') };
        await this.writeCredential(async () => { signal.throwIfAborted(); await atomicJson(this.file, credential); });
      }
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
    await this.writeCredential(async () => { await fs.rm(this.file, { force: true }); await this.savedSession.remove(); });
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
      await this.savedSession.remove();
      await this.session.clearStorageData();
    });
    await this.refreshLoginData();
    this.onChange();
  }
}
