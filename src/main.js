import { app, BrowserWindow, ipcMain, nativeTheme, dialog, shell, safeStorage } from 'electron';
import path from 'node:path';
import fs from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { SettingsStore, validateSettings } from './settings.js';
import { CanvasConnection } from './canvas-session.js';
import { GuideStore } from './guide-store.js';
import { reconcile, buildGuide } from './guide.js';
import { CodexClient, planningEvidence } from './codex-client.js';
import { referenceUrl } from './content.js';
import { guideSources } from './study-plan.js';
import { CourseWebsites } from './course-websites.js';

const directory = path.dirname(fileURLToPath(import.meta.url));
const uiUrl = pathToFileURL(path.join(directory, 'ui/index.html')).href;
const testMode = process.env.CANVAS_WEEKLY_TEST === '1';
if (app.isPackaged && testMode) {
  const profile = process.env.CANVAS_WEEKLY_TEST_PROFILE;
  if (!profile || !path.isAbsolute(profile)) throw new Error('Packaged tests require an explicit absolute test profile.');
  app.setPath('userData', profile);
}
if (!app.isPackaged) app.setPath('userData', path.resolve(directory, '../.local', testMode ? 'test-app' : 'app'));
const store = new SettingsStore(app.getPath('userData'));
const guides = new GuideStore(path.join(app.getPath('userData'), 'guides'));
let window;
let canvas;
let courses = [];
let guide = null;
let run = { busy: false, message: '' };
let controller;
let codex;
let websiteStore;
let websites = [];

function snapshot() {
  return {
    settings: store.value,
    outputDirectory: store.value.outputDirectory || path.join(app.getPath('desktop'), 'Canvas Weekly'),
    appearance: { source: nativeTheme.themeSource, dark: nativeTheme.shouldUseDarkColors },
    canvas: canvas?.status || { connected: false },
    courses,
    websites,
    guide,
    run,
    ai: codex ? { ...codex.state, runtime: codex.runtime } : { connected: false },
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
    websiteStore = new CourseWebsites({ directory: path.join(app.getPath('userData'), 'course-websites'), secrets: {
      encrypt: value => {
        if (process.platform !== 'win32' || !safeStorage.isEncryptionAvailable()) throw new Error('Windows credential encryption is unavailable. Website passwords cannot be saved.');
        return safeStorage.encryptString(value);
      },
      decrypt: value => safeStorage.decryptString(value),
    } });
    const createCodex = () => {
      const client = new CodexClient({ executable: store.value.codexExecutable || 'codex', directory: path.join(app.getPath('userData'), 'planner') });
      client.on('state', publish);
      return client;
    };
    codex = createCodex();
    if (store.value.lastGuideAccount) guide = await guides.load(store.value.lastGuideAccount.origin, store.value.lastGuideAccount.userId);
    if (store.value.lastGuideAccount) {
      try { websites = await websiteStore.list(store.value.lastGuideAccount); }
      catch (error) { run.message = error.message; }
    }
    const loadCourses = async () => {
      const binding = canvas.capture({ includeCourses: false });
      const loadedCourses = await canvas.client({ signal: binding.signal }).read('courses', {}, true);
      binding.assertCurrent();
      const loadedGuide = await guides.load(binding.origin, binding.userId);
      binding.assertCurrent();
      const previousAccount = store.value.lastGuideAccount;
      const sameAccount = previousAccount?.origin === binding.origin && previousAccount?.userId === binding.userId;
      await store.update({
        lastGuideAccount: { origin: binding.origin, userId: binding.userId },
        selectedCourseIds: sameAccount ? store.value.selectedCourseIds.filter(id => loadedCourses.some(course => String(course.id) === id)) : [],
      });
      binding.assertCurrent();
      const loadedWebsites = await websiteStore.list({ origin: binding.origin, userId: binding.userId });
      binding.assertCurrent();
      courses = loadedCourses;
      guide = loadedGuide;
      websites = loadedWebsites;
    };
    canvas = new CanvasConnection({ directory: app.getPath('userData'), settings: store, onChange: publish, onConnected: async () => {
      try { await loadCourses(); run = { busy: false, message: 'Canvas connected. Choose your courses.' }; }
      catch (error) { run = { busy: false, message: error.message }; }
      publish();
    } });
    await canvas.restore();
    nativeTheme.themeSource = store.value.theme;
    window = new BrowserWindow({
      width: 1140, height: 820, minWidth: 800, minHeight: 600,
      title: 'Canvas Weekly', show: false,
      backgroundColor: nativeTheme.shouldUseDarkColors ? '#202020' : '#f3f3f3',
      webPreferences: { preload: path.join(directory, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true },
    });
    window.removeMenu();
    window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    window.webContents.on('will-navigate', event => event.preventDefault());
    window.webContents.session.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
    handle('state:get', snapshot);
    const requireIdle = () => { if (run.busy) throw new Error('Wait for the current refresh or cancel it first.'); };
    handle('canvas:login', async () => { requireIdle(); guide = null; websites = []; await canvas.openLogin(); return snapshot(); });
    handle('canvas:verify', async () => {
      requireIdle(); guide = null; websites = [];
      courses = [];
      await canvas.finishLogin();
      await loadCourses();
      return snapshot();
    });
    handle('canvas:token', async token => {
      requireIdle(); guide = null; websites = [];
      courses = [];
      await canvas.connectToken(token);
      await loadCourses();
      return snapshot();
    });
    handle('canvas:disconnect', async () => { requireIdle(); await canvas.disconnect(); await store.update({ lastGuideAccount: null }); courses = []; guide = null; websites = []; return snapshot(); });
    handle('settings:canvas', async origin => {
      requireIdle();
      validateSettings({ ...store.value, canvasBaseUrl: origin });
      const canvasBaseUrl = new URL(origin).origin;
      validateSettings({ ...store.value, canvasBaseUrl });
      if (canvasBaseUrl !== store.value.canvasBaseUrl) {
        await canvas.disconnect();
        await store.update({ canvasBaseUrl, selectedCourseIds: [], lastGuideAccount: null });
        courses = [];
        guide = null;
        websites = [];
      }
      return snapshot();
    });
    handle('courses:select', async selectedCourseIds => {
      requireIdle();
      if (!Array.isArray(selectedCourseIds) || !selectedCourseIds.every(id => courses.some(course => String(course.id) === id))) throw new Error('Choose courses from the connected account.');
      canvas.invalidate();
      await store.update({ selectedCourseIds: [...new Set(selectedCourseIds)] });
      return snapshot();
    });
    const websiteAction = async callback => {
      requireIdle();
      const account = store.value.lastGuideAccount;
      if (!account) throw new Error('Connect Canvas and choose a course first.');
      controller = new AbortController();
      run = { busy: true, message: 'Updating course website connection...' }; publish();
      try {
        await callback(account, controller.signal);
        websites = await websiteStore.list(account);
        run = { busy: false, message: 'Course website settings updated.' };
        return snapshot();
      } catch (error) {
        websites = await websiteStore.list(account).catch(() => []);
        run = { busy: false, message: controller.signal.aborted ? 'Website operation cancelled.' : error.message };
        throw new Error(run.message);
      } finally { controller = null; run.busy = false; publish(); }
    };
    handle('website:add', (courseId, url) => websiteAction(async (account, signal) => {
      if (![...courses, ...(guide?.courses || [])].some(course => String(course.id) === courseId)) throw new Error('Choose a course from the current account.');
      const id = await websiteStore.add(account, courseId, url);
      await websiteStore.probe(account, id, null, signal);
    }));
    handle('website:check', id => websiteAction((account, signal) => websiteStore.probe(account, id, null, signal)));
    handle('website:login', (id, username, password) => websiteAction((account, signal) => websiteStore.probe(account, id, { username, password }, signal)));
    handle('website:remove', id => websiteAction(account => websiteStore.remove(account, id)));
    handle('guide:update', async () => {
      requireIdle();
      // Check before profile verification or any other network/storage action.
      const collectionIssue = canvas.collectionIssue;
      if (collectionIssue) throw new Error(collectionIssue);
      if (!canvas.profile) throw new Error('Connect Canvas before updating your guide.');
      if (!store.value.selectedCourseIds.length) throw new Error('Choose at least one course first.');
      const userId = canvas.profile.id;
      const binding = canvas.capture();
      controller = new AbortController();
      let signal = AbortSignal.any([controller.signal, binding.signal]);
      let sessionWatch;
      run = { busy: true, message: 'Checking Canvas connection…' }; publish();
      try {
        sessionWatch = await canvas.watchSession(binding, signal);
        if (sessionWatch) signal = AbortSignal.any([signal, sessionWatch.signal]);
        await canvas.verify();
        await sessionWatch?.check();
        signal.throwIfAborted();
        binding.assertCurrent();
        if (canvas.profile.id !== userId) throw new Error('Canvas account changed. Reconnect and select courses for this account.');
        const previous = await guides.load(binding.origin, userId);
        binding.assertCurrent();
        const records = await canvas.collectMetadata({ signal, onProgress: message => { run = { busy: true, message }; publish(); } });
        await sessionWatch?.check();
        binding.assertCurrent();
        if (!records.some(record => record.coverage.some(source => ['assignments', 'quizzes', 'assignment metadata'].includes(source.source) && source.status === 'ok'))) throw new Error('No assessment information could be refreshed. Your previous guide has been preserved.');
        try {
          const external = await websiteStore.collect({ origin: binding.origin, userId }, binding.courseIds, { signal,
            onProgress: message => { run = { busy: true, message }; publish(); } });
          for (const record of records) {
            record.sources.websites = external.filter(site => site.courseId === record.id);
            record.coverage.push(...record.sources.websites.flatMap(site => site.coverage));
            const connected = new Set(record.sources.websites.map(site => site.siteId));
            if (previous?.courses.find(course => course.id === record.id)?.evidence?.some(source => source.kind === 'website' && !connected.has(source.siteId))) record.coverage.push({ source: 'websites', status: 'unsupported', message: 'A prior course website is disconnected. Its last-known content needs rechecking.' });
          }
          websites = await websiteStore.list({ origin: binding.origin, userId });
        } catch {
          signal.throwIfAborted();
          for (const record of records) record.coverage.push({ source: 'websites', status: 'error', message: 'Course website collection failed. Check the website settings in Courses.' });
        }
        binding.assertCurrent();
        const next = buildGuide(reconcile(records, previous, { origin: binding.origin, now: new Date().toISOString(), timeZone: store.value.timeZone }));
        if (store.value.aiEnabled) {
          run = { busy: true, message: 'Preparing study suggestions with ChatGPT…' }; publish();
          try { next.priorities = await codex.plan(planningEvidence(next), signal); next.mode = 'Factual guide with AI study suggestions'; }
          catch (error) { signal.throwIfAborted(); next.planningNote = error.message; }
        }
        signal.throwIfAborted();
        await sessionWatch?.check();
        binding.assertCurrent();
        run = { busy: true, message: 'Saving your weekly guide…' }; publish();
        guide = await guides.export(next, snapshot().outputDirectory, userId, signal);
        run = { busy: false, message: records.some(record => record.coverage.some(source => source.status !== 'ok')) ? 'Guide updated with some information unavailable. Review source coverage.' : 'Weekly guide updated.' };
        return snapshot();
      } catch (error) {
        run = { busy: false, message: controller.signal.aborted ? 'Refresh cancelled. Your previous guide is preserved.' : error.message };
        throw new Error(run.message);
      } finally { sessionWatch?.dispose(); controller = null; publish(); }
    });
    handle('guide:cancel', () => { controller?.abort(); return snapshot(); });
    handle('guide:task', async (taskId, done) => {
      requireIdle();
      const account = store.value.lastGuideAccount;
      if (!account || !guide) throw new Error('Create a guide before tracking study progress.');
      run = { busy: true, message: 'Saving study progress on this device...' }; publish();
      try {
        guide = await guides.setTaskDone(account.origin, account.userId, taskId, done);
        run = { busy: false, message: 'Study progress saved locally. Open guide includes the latest checkmarks.' };
        return snapshot();
      } catch (error) { run = { busy: false, message: error.message }; throw error; }
      finally { publish(); }
    });
    handle('guide:open', async () => {
      requireIdle();
      if (!guide?.outputPath) throw new Error('Create a guide first.');
      const account = store.value.lastGuideAccount;
      if (account) {
        // Refresh only the local document; opening it never contacts Canvas or AI.
        run = { busy: true, message: 'Preparing your saved study guide...' }; publish();
        try { guide = await guides.export(guide, path.dirname(path.dirname(guide.outputPath)), account.userId); }
        finally { run = { busy: false, message: '' }; publish(); }
      }
      const error = await shell.openPath(guide.documentPath || guide.outputPath);
      if (error) throw new Error(error);
    });
    handle('guide:source', async id => {
      const source = guide && guideSources(guide).find(item => item.id === id);
      const url = source && referenceUrl(source.sourceUrl, guide.origin);
      if (!url) throw new Error('Choose a source in the current guide.');
      await shell.openExternal(url);
    });
    handle('ai:login', async () => { requireIdle(); await shell.openExternal(await codex.login()); return snapshot(); });
    handle('ai:check', async () => { requireIdle(); await codex.start(); await codex.readAccount(); return snapshot(); });
    handle('ai:logout', async () => { requireIdle(); await codex.logout(); await store.update({ aiEnabled: false }); return snapshot(); });
    handle('settings:ai', async enabled => { requireIdle(); await store.update({ aiEnabled: enabled }); return snapshot(); });
    handle('settings:codex', async () => {
      requireIdle();
      const result = await dialog.showOpenDialog(window, { title: 'Choose installed Codex', properties: ['openFile'], filters: [{ name: 'Codex executable', extensions: ['exe'] }] });
      if (!result.canceled) {
        await store.update({ codexExecutable: result.filePaths[0] });
        codex.close(); codex = createCodex();
      }
      return snapshot();
    });
    handle('settings:timezone', async timeZone => {
      requireIdle();
      await store.update({ timeZone });
      return snapshot();
    });
    handle('settings:theme', async theme => {
      await store.update({ theme });
      nativeTheme.themeSource = theme;
      return snapshot();
    });
    handle('settings:output', async () => {
      requireIdle();
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
    if (!testMode) { window.show(); window.focus(); }
    if (!testMode) {
      try {
        await fs.access(path.join(app.getPath('userData'), 'planner/codex-home/auth.json'));
        await codex.start();
      } catch { /* Factual guides stay available if the saved AI connection cannot be restored. */ }
      publish();
    }
    if (!testMode && await canvas.hasSavedSession()) {
      try {
        await canvas.verify(); await loadCourses();
        run = { busy: false, message: 'Canvas connected. Choose your courses to create a guide.' };
      } catch (error) { run = { busy: false, message: error.message }; }
      publish();
    }
  }).catch(error => { dialog.showErrorBox('Canvas Weekly could not start', error.message); app.quit(); });
  app.on('window-all-closed', () => app.quit());
  app.on('before-quit', () => { controller?.abort(); codex?.close(); });
}
