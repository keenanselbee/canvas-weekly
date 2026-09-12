import { app, BrowserWindow, ipcMain, nativeTheme, dialog, shell, safeStorage, clipboard } from 'electron';
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
import { STUDY_PROMPT } from './evidence-pack.js';
import { CourseWebsites } from './course-websites.js';
import { CollectionHistory } from './collection-history.js';
import { readingSelection, READING_VERSION, EXPANDED_AVAILABLE, EXPANDED_HOLD } from './reading-policy.js';

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
const history = new CollectionHistory(path.join(app.getPath('userData'), 'collection-history'));
let historyAccount = null;
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
    reading: { available: EXPANDED_AVAILABLE, hold: EXPANDED_HOLD,
      courses: canvas?.profile ? readingSelection(store.value, store.value.canvasBaseUrl, canvas.profile.id, store.value.selectedCourseIds) : [] },
    collectionHistory: historyAccount === JSON.stringify(store.value.lastGuideAccount) ? structuredClone(history.entries) : [],
    ai: codex ? { ...codex.state, canForget: codex.canForget, runtime: codex.runtime } : { connected: false },
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
      const client = new CodexClient({ executable: store.value.codexExecutable || 'codex', directory: path.join(app.getPath('userData'), 'planner'),
        remember: store.value.rememberChatGPT !== false, secrets: {
          encrypt: value => {
            if (process.platform !== 'win32' || !safeStorage.isEncryptionAvailable()) throw new Error('Windows encryption unavailable.');
            return safeStorage.encryptString(value);
          },
          decrypt: value => safeStorage.decryptString(value),
        } });
      client.on('state', publish);
      return client;
    };
    codex = createCodex();
    if (store.value.lastGuideAccount) guide = await guides.load(store.value.lastGuideAccount.origin, store.value.lastGuideAccount.userId);
    if (store.value.lastGuideAccount) {
      try { websites = await websiteStore.list(store.value.lastGuideAccount); }
      catch (error) { run.message = error.message; }
      try { await history.load(store.value.lastGuideAccount.origin, store.value.lastGuideAccount.userId); historyAccount = JSON.stringify(store.value.lastGuideAccount); }
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
      await history.load(binding.origin, binding.userId);
      historyAccount = JSON.stringify(store.value.lastGuideAccount);
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
      icon: path.join(directory, 'ui/assets', 'mark.png'),
      backgroundColor: nativeTheme.shouldUseDarkColors ? '#151c26' : '#f6f8fa',
      webPreferences: { preload: path.join(directory, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true },
    });
    window.removeMenu();
    window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    window.webContents.on('will-navigate', event => event.preventDefault());
    window.webContents.session.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
    handle('state:get', snapshot);
    const requireIdle = () => { if (run.busy) throw new Error('Wait for the current refresh or cancel it first.'); };
    const connectionChange = async callback => {
      requireIdle();
      run = { busy: true, message: 'Updating saved connection...' }; publish();
      try { await callback(); run = { busy: false, message: '' }; return snapshot(); }
      catch (error) { run = { busy: false, message: error.message }; throw error; }
      finally { publish(); }
    };
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
    handle('canvas:disconnect', () => connectionChange(async () => { await canvas.disconnect(); await store.update({ lastGuideAccount: null }); courses = []; guide = null; websites = []; }));
    handle('settings:remember-canvas', remember => connectionChange(async () => {
      await canvas.setRemember(remember); courses = [];
    }));
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
    handle('settings:reading', async (courseIds, acknowledged) => {
      requireIdle();
      if (!canvas.profile || canvas.loginWindow || !Array.isArray(courseIds)
        || courseIds.some(id => typeof id !== 'string' || !courses.some(course => String(course.id) === id))) throw new Error('Choose courses from the connected account.');
      if (courseIds.length && acknowledged !== true) throw new Error('Acknowledge the possible viewing effects before saving expanded reading.');
      const origin = store.value.canvasBaseUrl;
      const userId = canvas.profile.id;
      const preferences = (store.value.courseReading || []).filter(entry => entry.origin !== origin || entry.userId !== userId);
      preferences.push({ origin, userId, version: READING_VERSION, courseIds: [...new Set(courseIds)] });
      canvas.invalidate();
      await store.update({ courseReading: preferences });
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
    handle('website:login', (id, username, password, remember = true) => websiteAction((account, signal) => websiteStore.probe(account, id, { username, password, remember }, signal)));
    handle('website:forget', id => websiteAction(account => websiteStore.forgetLogin(account, id)));
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
      let historyId;
      let historyFinished = false;
      let failureCode;
      run = { busy: true, message: 'Checking Canvas connection…' }; publish();
      try {
        const modes = readingSelection(store.value, binding.origin, userId, binding.courseIds);
        historyId = await history.begin(binding.origin, userId, modes.map(mode => ({ ...mode,
          name: courses.find(course => String(course.id) === mode.courseId)?.name || `Course ${mode.courseId}` })));
        historyAccount = JSON.stringify({ origin: binding.origin, userId });
        canvas.audit.onEvent = event => history.record(historyId, event);
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
          try {
            const evidence = planningEvidence(next);
            next.planningCoverage = { omittedTexts: evidence.omissions.length, ...evidence.omittedRecords };
            next.priorities = await codex.plan(evidence, signal); next.mode = 'Factual guide with AI study suggestions';
          }
          catch (error) { signal.throwIfAborted(); next.planningNote = error.message; }
        }
        signal.throwIfAborted();
        await sessionWatch?.check();
        binding.assertCurrent();
        run = { busy: true, message: 'Saving your weekly guide…' }; publish();
        guide = await guides.export(next, snapshot().outputDirectory, userId, signal);
        await history.finish(historyId, 'completed', next.changes.length); historyFinished = true;
        run = { busy: false, message: records.some(record => record.coverage.some(source => source.status !== 'ok')) ? 'Guide updated with some information unavailable. Review source coverage.' : 'Weekly guide updated.' };
        return snapshot();
      } catch (error) {
        failureCode = error.code;
        run = { busy: false, message: controller.signal.aborted ? 'Refresh cancelled. Your previous guide is preserved.' : error.message };
        throw new Error(run.message);
      } finally {
        canvas.audit.onEvent = null;
        try { if (historyId && !historyFinished) await history.finish(historyId, controller.signal.aborted ? 'cancelled' : 'failed', null, failureCode); }
        finally { sessionWatch?.dispose(); controller = null; publish(); }
      }
    });
    handle('guide:cancel', () => { controller?.abort(); return snapshot(); });
    handle('guide:generate', async () => {
      requireIdle();
      const saved = guide;
      const account = store.value.lastGuideAccount;
      if (!saved?.outputPath || !account) throw new Error('Collect course information before creating an AI guide.');
      if (!codex.state.connected) throw new Error('Connect ChatGPT in Settings before creating your weekly guide.');
      const binding = JSON.stringify(account);
      controller = new AbortController();
      const signal = controller.signal;
      run = { busy: true, message: 'Creating your weekly guide from saved course information...' }; publish();
      try {
        const next = buildGuide(saved, new Date().toISOString());
        // Generation time must not make the collection appear newly refreshed.
        next.generatedAt = saved.generatedAt;
        const evidence = planningEvidence(next);
        next.aiGuide = { ...await codex.plan(evidence, signal, { weekly: true }), generatedAt: new Date().toISOString() };
        next.priorities = next.aiGuide.courses.flatMap(course => course.tasks);
        next.planningCoverage = { omittedTexts: evidence.omissions.length, ...evidence.omittedRecords };
        delete next.planningNote;
        next.mode = 'AI weekly guide';
        signal.throwIfAborted();
        if (guide !== saved || binding !== JSON.stringify(store.value.lastGuideAccount)) throw new Error('The account or saved collection changed. Generate again from the current collection.');
        guide = await guides.export(next, path.dirname(path.dirname(saved.outputPath)), account.userId, signal);
        run = { busy: false, message: 'AI weekly guide created. Review its source links and questions before relying on it.' };
        return snapshot();
      } catch (error) {
        run = { busy: false, message: signal.aborted ? 'Guide generation cancelled. Your previous guide is preserved.' : `Guide generation failed. Your previous guide is preserved. ${error.message}` };
        throw new Error(run.message);
      } finally { controller = null; publish(); }
    });
    handle('history:source', async (runId, requestId) => {
      const account = store.value.lastGuideAccount;
      if (!account || historyAccount !== JSON.stringify(account)) throw new Error('Choose history for the current account.');
      const entry = history.entries.find(entry => entry.id === runId);
      const request = entry?.requests.find(request => request.id === requestId);
      if (!request?.courseId || !entry.courses.some(course => course.courseId === request.courseId)) throw new Error('This request has no course source.');
      const route = `/courses/${request.courseId}${request.itemId ? `/assignments/${request.itemId}` : request.operation === 'coursesyllabus' ? '/assignments/syllabus' : ''}`;
      const url = referenceUrl(new URL(route, account.origin).href, account.origin);
      if (!url) throw new Error('This source is unavailable.');
      await shell.openExternal(url);
    });
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
    handle('guide:export-ai', async () => {
      requireIdle();
      const account = store.value.lastGuideAccount;
      if (!account || !guide?.outputPath) throw new Error('Collect course information before exporting for AI.');
      run = { busy: true, message: 'Preparing your course information pack...' }; publish();
      try {
        // Only saved local evidence. Export never collects or sends data to AI.
        guide = await guides.export(guide, path.dirname(path.dirname(guide.outputPath)), account.userId);
        shell.showItemInFolder(guide.evidencePath);
        run = { busy: false, message: 'Course Information.md is ready. Review it, then upload it to your chosen AI chat. The study prompt is included.' };
        return snapshot();
      } catch (error) { run = { busy: false, message: error.message }; throw error; }
      finally { publish(); }
    });
    handle('guide:copy-prompt', () => { clipboard.writeText(STUDY_PROMPT); });
    handle('guide:source', async id => {
      const source = guide && guideSources(guide).find(item => item.id === id);
      const url = source && referenceUrl(source.sourceUrl, guide.origin);
      if (!url) throw new Error('Choose a source in the current guide.');
      await shell.openExternal(url);
    });
    handle('ai:login', async () => { requireIdle(); await shell.openExternal(await codex.login()); return snapshot(); });
    handle('ai:check', async () => { requireIdle(); await codex.start(); await codex.readAccount(); return snapshot(); });
    handle('ai:logout', () => connectionChange(async () => { await codex.logout(); await store.update({ aiEnabled: false }); }));
    handle('settings:remember-chatgpt', remember => connectionChange(async () => {
      if (typeof remember !== 'boolean') throw new Error('Choose whether to remember ChatGPT.');
      if (codex.state.connecting) throw new Error('Finish ChatGPT sign-in before changing this setting.');
      if (remember === (store.value.rememberChatGPT !== false)) return;
      if (codex.process || await codex.hasSavedLogin()) await codex.logout();
      await codex.stop();
      await store.update({ rememberChatGPT: remember, aiEnabled: false });
      codex = createCodex();
    }));
    handle('settings:ai', async enabled => { requireIdle(); await store.update({ aiEnabled: enabled }); return snapshot(); });
    handle('settings:codex', async () => {
      requireIdle();
      const result = await dialog.showOpenDialog(window, { title: 'Choose installed Codex', properties: ['openFile'], filters: [{ name: 'Codex executable', extensions: ['exe'] }] });
      if (!result.canceled) {
        await store.update({ codexExecutable: result.filePaths[0] });
        await codex.stop(); codex = createCodex();
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
        if (await codex.hasSavedLogin()) await codex.start();
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
