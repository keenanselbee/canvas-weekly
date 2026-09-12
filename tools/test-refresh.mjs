import { _electron as electron } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { captureUI } from './capture-ui.mjs';

await fs.mkdir('.codex-temp', { recursive: true });
const output = await fs.mkdtemp(path.resolve('.codex-temp/desktop-refresh-'));
const environment = { ...process.env, CANVAS_WEEKLY_TEST: '1' };
delete environment.ELECTRON_RUN_AS_NODE;
const application = await electron.launch({ args: ['.'], env: environment });
try {
  await application.evaluate(({ session, dialog, shell }, output) => {
    globalThis.syntheticRequestCount = 0;
    shell.openPath = async value => { globalThis.syntheticOpenedPath = value; return ''; };
    shell.showItemInFolder = value => { globalThis.syntheticRevealedPath = value; };
    const deadline = new Date().toISOString();
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [output] });
    globalThis.syntheticRecords = [{ id: '1', coverage: ['course', 'assignments', 'pages'].map(source => ({ source, status: 'ok', checkedAt: deadline })), sources: {
      course: { id: 1, name: 'Example course', course_code: 'DEMO 101', syllabus_body: '<p>Read the notes first.</p>' },
      syllabus: { text: 'Fresh Canvas syllabus: read before class.', links: ['https://course.example/syllabus'] },
      rubrics: [{ assignmentId: '10', name: 'Example assignment', rubric: { id: '40', title: 'Design criteria', criteria: [{ id: 'c1', description: 'Explain tradeoffs', longDescription: 'Compare the alternatives you considered.' }] } }],
      assignments: [{ id: 10, name: 'Example assignment', due_at: deadline, description: '<p>Complete the practice. Extra examples are optional.</p>', submission: { workflow_state: 'unsubmitted' } },
        { id: 11, name: 'Practice exam 2020', due_at: null, description: '<p>Check the current syllabus for applicability.</p>' }],
      pages: [{ page_id: 2, url: 'course-site', title: 'Course website', body: '<p>Read the external syllabus.</p><p>Password: example-password</p>' }],
    } }];
    session.fromPartition('persist:canvas').fetch = async (address, options) => {
      globalThis.syntheticRequestCount++;
      if (options.method !== 'GET' || options.redirect !== 'manual') throw new Error('Unsafe request in desktop test');
      const url = new URL(address);
      let data;
      if (url.pathname.endsWith('/users/self/profile')) data = { id: 999, name: 'Example Student' };
      else if (url.pathname === '/api/v1/courses') data = [{ id: 1, name: 'Example course', course_code: 'DEMO 101' }];
      else throw new Error('The paused Canvas collector must not request course contents');
      return new Response(JSON.stringify(data), { headers: { 'content-type': 'application/json', 'x-canvas-user-id': '999' } });
    };
  }, output);
  await application.evaluate(async ({ session }) => {
    await session.fromPartition('persist:canvas').cookies.set({ url: 'https://canvas.ubc.ca', name: 'canvas_session',
      value: 'synthetic-refresh-session', path: '/', secure: true, httpOnly: true });
  });
  await application.evaluate((_electron, moduleUrl) => {
    const require = process.getBuiltinModule('module').createRequire(moduleUrl);
    const { CourseWebsites } = require('./course-websites.js');
    const original = CourseWebsites.prototype.reader;
    globalThis.syntheticWebsiteRequests = [];
    CourseWebsites.prototype.reader = function (...args) {
      this.transport = async (url, init) => {
        globalThis.syntheticWebsiteRequests.push(url.href);
        if (url.origin !== 'https://course.example' || !url.pathname.startsWith('/data311/')) throw new Error('Unexpected website request');
        if (init.authorization !== 'Basic ' + Buffer.from('student:website-fixture-password').toString('base64')) return { status: 401, headers: { 'www-authenticate': 'Basic realm="course"' }, body: '' };
        return { status: 200, headers: { 'content-type': 'text/html' }, body: '<main><h1>Course website schedule</h1><p>Supplementary readings are optional. Review the lecture notes before class.</p></main>' };
      };
      return original.apply(this, args);
    };
  }, new URL('../src/course-websites.js', import.meta.url).href);
  const page = await application.firstWindow();
  await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].webContents.setZoomFactor(1));
  await page.evaluate(async () => {
    await window.canvasWeekly.verifyCanvas();
    for (const site of (await window.canvasWeekly.getState()).websites) await window.canvasWeekly.removeWebsite(site.id);
    await window.canvasWeekly.selectCourses(['1']);
    await window.canvasWeekly.chooseOutput();
  });
  await application.evaluate((_electron, moduleUrl) => {
    const require = process.getBuiltinModule('module').createRequire(moduleUrl);
    const { CanvasConnection } = require('./canvas-session.js');
    globalThis.originalCollectionIssue = Object.getOwnPropertyDescriptor(CanvasConnection.prototype, 'collectionIssue');
    Object.defineProperty(CanvasConnection.prototype, 'collectionIssue', { configurable: true, get: () => 'Synthetic Canvas refresh is paused' });
  }, new URL('../src/canvas-session.js', import.meta.url).href);
  await page.reload();
  await page.getByRole('heading', { name: 'Canvas refresh paused', exact: true }).waitFor();
  assert.equal(await page.getByRole('button', { name: /^(Collect|Refresh) course information$/ }).isDisabled(), true);
  const beforePause = await application.evaluate(() => globalThis.syntheticRequestCount);
  const savedBeforePause = (await page.evaluate(() => window.canvasWeekly.getState())).guide;
  await assert.rejects(page.evaluate(() => window.canvasWeekly.updateGuide()), /refresh is paused/);
  assert.equal(await application.evaluate(() => globalThis.syntheticRequestCount), beforePause, 'The real refresh hold must run before even profile verification');
  assert.deepEqual((await page.evaluate(() => window.canvasWeekly.getState())).guide, savedBeforePause);
  // Exercise the downstream guide pipeline using in-memory records only. This
  // test-process replacement is not a production flag or permission bypass.
  await application.evaluate((_electron, moduleUrl) => {
    const require = process.getBuiltinModule('module').createRequire(moduleUrl);
    const { CanvasConnection } = require('./canvas-session.js');
    globalThis.originalCollect = CanvasConnection.prototype.collectMetadata;
    const capture = CanvasConnection.prototype.capture;
    CanvasConnection.prototype.capture = function (...args) { globalThis.syntheticConnection = this; return capture.apply(this, args); };
    Object.defineProperty(CanvasConnection.prototype, 'collectionIssue', globalThis.originalCollectionIssue);
    CanvasConnection.prototype.collectMetadata = async function ({ signal } = {}) { signal?.throwIfAborted(); return structuredClone(globalThis.syntheticRecords); };
  }, new URL('../src/canvas-client.js', import.meta.url).href);
  await page.reload();
  await page.getByRole('button', { name: 'Courses', exact: true }).click();
  await page.getByRole('button', { name: 'Save course selection', exact: true }).click();
  await page.getByText('Course selection saved.', { exact: true }).waitFor();
  const beforeReadingPreference = await application.evaluate(() => globalThis.syntheticRequestCount);
  await assert.rejects(page.evaluate(() => window.canvasWeekly.setCourseReading(['1'], false)), /Acknowledge/);
  await assert.rejects(page.evaluate(() => window.canvasWeekly.setCourseReading(['999'], true)), /connected account/);
  const reading = await page.evaluate(() => window.canvasWeekly.setCourseReading(['1'], true));
  assert.equal(reading.reading.courses[0].requested, 'expanded');
  assert.equal(reading.reading.courses[0].effective, 'limited');
  assert.equal(await application.evaluate(() => globalThis.syntheticRequestCount), beforeReadingPreference, 'Saving consent must not read Canvas');
  await page.locator('#notice').waitFor({ state: 'hidden', timeout: 6500 });
  await page.locator('.website-course > summary').click();
  await page.getByRole('textbox', { name: 'Course website for Example course', exact: true }).fill('https://course.example/data311/');
  const beforeWebsite = await application.evaluate(() => globalThis.syntheticRequestCount);
  await page.getByRole('button', { name: 'Add website', exact: true }).click();
  await page.getByRole('textbox', { name: 'Website username for https://course.example/data311/', exact: true }).fill('student');
  await page.getByLabel('Website password for https://course.example/data311/', { exact: true }).fill('website-fixture-password');
  await fs.mkdir('.codex-temp/visual', { recursive: true });
  await page.locator('#notice').waitFor({ state: 'hidden', timeout: 6500 });
  await page.locator('.website-connection').screenshot({ path: '.codex-temp/visual/website-login.png' });
  await page.evaluate(() => window.canvasWeekly.setTheme('light'));
  await page.locator('html[data-theme="light"]').waitFor();
  await page.locator('.website-connection').screenshot({ path: '.codex-temp/visual/website-login-light.png' });
  await page.evaluate(() => window.canvasWeekly.setTheme('dark'));
  await page.evaluate(() => {
    window.websiteConnected = new Promise((resolve, reject) => {
      const timer = setTimeout(() => { unsubscribe(); reject(new Error('Website login did not complete')); }, 15000);
      const unsubscribe = window.canvasWeekly.onStateChanged(state => {
        if (!state.run.busy && state.websites[0]?.status === 'ok' && state.websites[0]?.hasCredentials) {
          clearTimeout(timer); unsubscribe(); resolve();
        }
      });
    });
  });
  await page.getByRole('button', { name: 'Connect website', exact: true }).click();
  await page.evaluate(() => window.websiteConnected);
  assert.equal(await application.evaluate(() => globalThis.syntheticRequestCount), beforeWebsite, 'Website setup must not access Canvas');
  const websiteState = await page.evaluate(() => window.canvasWeekly.getState());
  assert.equal(JSON.stringify(websiteState).includes('website-fixture-password'), false);
  assert.equal(websiteState.websites[0].hasCredentials, true);
  const websiteId = websiteState.websites[0].id;
  await page.getByRole('button', { name: 'This week', exact: true }).click();
  await page.evaluate(output => {
    window.refreshFinished = new Promise((resolve, reject) => {
      const timer = setTimeout(() => { unsubscribe(); reject(new Error('Refresh did not finish')); }, 20000);
      const unsubscribe = window.canvasWeekly.onStateChanged(state => {
        if (!state.run.busy && state.guide?.outputPath?.startsWith(output)) {
          clearTimeout(timer); unsubscribe(); resolve(state);
        }
      });
    });
  }, output);
  await page.getByRole('button', { name: /^(Collect|Refresh) course information$/ }).click();
  const first = await page.evaluate(() => window.refreshFinished);
  await page.getByRole('heading', { name: 'Example assignment', exact: true }).waitFor();
  assert.equal(first.run.busy, false);
  const savedGuide = structuredClone(first.guide);
  const savedHtml = await fs.readFile(first.guide.documentPath);
  const beforeTimezone = await application.evaluate(() => globalThis.syntheticRequestCount);
  const changedTimezone = await page.evaluate(() => window.canvasWeekly.setTimeZone('UTC'));
  assert.equal(changedTimezone.settings.timeZone, 'UTC');
  assert.deepEqual(changedTimezone.guide, savedGuide, 'Changing timezone must preserve the saved guide');
  assert.deepEqual(await fs.readFile(first.guide.documentPath), savedHtml);
  assert.equal(await application.evaluate(() => globalThis.syntheticRequestCount), beforeTimezone);
  await page.evaluate(timeZone => window.canvasWeekly.setTimeZone(timeZone), first.settings.timeZone);
  assert.ok(first.guide.outputPath.startsWith(output));
  assert.equal(first.guide.items.length, 2);
  const timingGroup = page.locator('details.study-day').filter({ has: page.locator('summary', { hasText: 'Timing to confirm: DEMO 101' }) });
  assert.equal(await timingGroup.evaluate(node => node.open), false);
  assert.equal(first.guide.studyPlan.tasks.find(task => task.sourceId === '1:assignment:11').suggestedDate, null);
  assert.ok((await fs.readFile(first.guide.outputPath, 'utf8')).includes('Complete the practice.'));
  assert.ok((await fs.readFile(first.guide.outputPath, 'utf8')).includes('Read the external syllabus.'));
  assert.ok(!(await fs.readFile(first.guide.outputPath, 'utf8')).includes('example-password'));
  assert.equal(first.guide.courses[0].syllabus, 'Fresh Canvas syllabus: read before class.');
  assert.match(await fs.readFile(first.guide.documentPath, 'utf8'), /Fresh Canvas syllabus: read before class/);
  assert.match(await fs.readFile(first.guide.documentPath, 'utf8'), /Compare the alternatives you considered/);
  assert.match(await fs.readFile(first.guide.outputPath, 'utf8'), /Criterion text only/);
  assert.equal(first.guide.courses[0].evidence.find(source => source.kind === 'rubric').partial, true);
  assert.ok(first.guide.courses[0].references.some(link => link.sourceUrl === 'https://course.example/syllabus'));
  assert.ok(first.guide.courses[0].evidence.some(source => source.kind === 'website' && source.body.includes('Supplementary readings are optional.')));
  assert.ok(!(await fs.readFile(first.guide.outputPath, 'utf8')).includes('website-fixture-password'));
  await assert.rejects(page.evaluate(() => window.canvasWeekly.openSource('https://unknown.example/')), /Choose a source/);
  const notes = path.join(path.dirname(first.guide.outputPath), 'Student Notes.md');
  await fs.writeFile(notes, 'Keep these student notes.');
  await page.evaluate(() => window.canvasWeekly.updateGuide());
  assert.equal(await fs.readFile(notes, 'utf8'), 'Keep these student notes.');
  assert.equal((await page.evaluate(() => window.canvasWeekly.getState())).guide.changes.length, 0);
  const taskId = '1:assignment:10:prepare';
  await page.evaluate(taskId => window.canvasWeekly.setStudyTaskDone(taskId, false), taskId);
  const beforeLocalChanges = await application.evaluate(() => globalThis.syntheticRequestCount);
  assert.equal(await page.locator('.legacy-plan').evaluate(element => element.open), false);
  await page.locator('#notice').waitFor({ state: 'hidden', timeout: 6500 });
  for (const theme of ['light', 'dark']) {
    await page.evaluate(theme => window.canvasWeekly.setTheme(theme), theme);
    await page.locator(`html[data-theme="${theme}"]`).waitFor();
    await page.locator('main').evaluate(node => { node.scrollTop = 0; });
    await captureUI(application, `.codex-temp/visual/collection-flow-${theme}.png`);
  }
  await page.locator('details.study-day').evaluateAll(nodes => nodes.forEach(node => { node.open = false; }));
  await page.locator('.legacy-plan > summary').click();
  await page.getByRole('button', { name: 'View task', exact: true }).click();
  await page.waitForFunction(() => document.activeElement?.id === 'study-1:assignment:10:prepare');
  assert.equal(await page.locator('#study-1\\:assignment\\:10\\:prepare').isVisible(), true);
  assert.equal(await application.evaluate(() => globalThis.syntheticRequestCount), beforeLocalChanges, 'Starting-point navigation stays local');
  await page.evaluate(taskId => {
    window.progressSaved = new Promise((resolve, reject) => {
      const timer = setTimeout(() => { unsubscribe(); reject(new Error('Study progress did not save')); }, 10000);
      const unsubscribe = window.canvasWeekly.onStateChanged(state => {
        if (!state.run.busy && state.guide?.studyPlan.tasks.find(task => task.id === taskId)?.done) {
          clearTimeout(timer); unsubscribe(); resolve();
        }
      });
    });
  }, taskId);
  await page.getByRole('checkbox', { name: /Preparation done:.*Example assignment/ }).check();
  await page.evaluate(() => window.progressSaved);
  await page.evaluate(() => window.canvasWeekly.openGuide());
  assert.equal(await application.evaluate(() => globalThis.syntheticRequestCount), beforeLocalChanges, 'Local progress and Open guide must not fetch Canvas');
  assert.equal(await application.evaluate(() => globalThis.syntheticOpenedPath), first.guide.documentPath);
  await page.getByRole('button', { name: 'Export for AI', exact: true }).click();
  await page.getByText(/Course Information.md is ready/).waitFor();
  assert.equal(await application.evaluate(() => globalThis.syntheticRequestCount), beforeLocalChanges, 'Export for AI must not fetch Canvas');
  assert.equal(await application.evaluate(() => globalThis.syntheticRevealedPath), first.guide.evidencePath);
  assert.match(await fs.readFile(first.guide.evidencePath, 'utf8'), /Suggested prompt/);
  assert.match(await fs.readFile(first.guide.outputPath, 'utf8'), /- \[x\]/);
  assert.equal((await page.evaluate(() => window.canvasWeekly.getState())).guide.items[0].status, 'not-submitted');
  await page.reload();
  await page.locator('.legacy-plan > summary').click();
  assert.equal(await page.getByRole('checkbox', { name: /Preparation done:.*Example assignment/ }).isChecked(), true);
  // This fixture uses persistent test storage. Reset the unchanged undated task
  // so a repeat run actually exercises its change event and focus restoration.
  if ((await page.evaluate(() => window.canvasWeekly.getState())).guide.studyPlan.tasks.find(task => task.id === '1:assignment:11:prepare').done) {
    await page.evaluate(() => window.canvasWeekly.setStudyTaskDone('1:assignment:11:prepare', false));
    await page.reload();
  }
  await page.locator('.legacy-plan').evaluate(element => { element.open = true; });
  await timingGroup.locator(':scope > summary').click();
  await page.getByRole('checkbox', { name: /Preparation done:.*Practice exam 2020/ }).check();
  await page.waitForFunction(() => document.getElementById('study-1:assignment:11:prepare') === document.activeElement);
  assert.equal(await timingGroup.evaluate(node => node.open), true, 'Checking a review item preserves its open group and focus');
  assert.equal(await page.getByRole('checkbox', { name: /Preparation done:.*Practice exam 2020/ }).isChecked(), true);
  await page.locator('.legacy-plan').evaluate(element => { element.open = true; });
  await timingGroup.locator(':scope > summary').click();
  await fs.mkdir('.codex-temp/visual', { recursive: true });
  await page.evaluate(() => window.canvasWeekly.setTheme('light'));
  await page.locator('html[data-theme="light"]').waitFor();
  await page.screenshot({ path: '.codex-temp/visual/study-plan-light.png' });
  await page.evaluate(() => window.canvasWeekly.setTheme('dark'));
  await page.locator('html[data-theme="dark"]').waitFor();
  await page.screenshot({ path: '.codex-temp/visual/factual-guide.png' });
  // Exercise full guide generation from saved evidence with an in-process AI
  // fixture, never a real AI account or a new Canvas collection.
  await application.evaluate((_electron, modules) => {
    const require = process.getBuiltinModule('module').createRequire(modules.client);
    const { CodexClient } = require('./codex-client.js');
    const { validateWeeklyGuide } = require('./weekly-output.js');
    CodexClient.prototype.start = async function () {};
    CodexClient.prototype.readAccount = async function () { this.state.connected = true; };
    globalThis.weeklyTestCalls = 0;
    const assertWeekly = options => { if (!options?.weekly) throw new Error('Unexpected automatic AI call'); };
    globalThis.weeklyTestMode = 'success';
    CodexClient.prototype.plan = async function (evidence, signal, options) {
      globalThis.weeklyTestClient = this;
      this.state.connected = true;
      globalThis.weeklyTestCalls++;
      assertWeekly(options);
      globalThis.weeklyTestEvidence = evidence;
      if (globalThis.weeklyTestMode === 'fail') throw new Error('Synthetic weekly generation failure');
      if (globalThis.weeklyTestMode === 'wait') return new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(signal.reason), { once: true }));
      return validateWeeklyGuide({ overview: [{ text: 'Prepare the practice and check the materials.', sourceIds: ['1:assignment:10'] }],
        courses: evidence.courses.map(course => ({ courseId: course.id, focus: 'Use the collected instructions to prepare.', tasks: [{
          sourceId: '1:assignment:10', action: 'Prepare the weekly practice', reason: 'Review the concepts before attempting the work.', suggestedDate: null,
          checks: ['Confirm the deadline in the original source.'], steps: [{ text: 'Complete the practice.', kind: 'required', quote: 'Complete the practice.' }],
        }] })), questions: [{ text: 'How much study time is available?', sourceIds: ['course:1'] }] }, evidence);
    };
  }, { client: new URL('../src/codex-client.js', import.meta.url).href });
  await page.evaluate(() => window.canvasWeekly.checkChatGPT());
  await page.evaluate(() => window.canvasWeekly.updateGuide());
  assert.equal(await application.evaluate(() => globalThis.weeklyTestCalls), 0, 'Collection must not invoke connected AI');
  assert.equal(await page.evaluate(() => typeof window.canvasWeekly.setAIEnabled), 'undefined');
  await page.reload();
  const beforeGeneration = await application.evaluate(() => globalThis.syntheticRequestCount);
  const savedCollectionTime = (await page.evaluate(() => window.canvasWeekly.getState())).guide.generatedAt;
  await page.getByRole('button', { name: 'Create my weekly guide', exact: true }).click();
  await page.getByRole('heading', { name: 'Your AI weekly guide', exact: true }).waitFor();
  assert.equal(await application.evaluate(() => globalThis.syntheticRequestCount), beforeGeneration);
  const generated = (await page.evaluate(() => window.canvasWeekly.getState())).guide;
  assert.equal(generated.generatedAt, savedCollectionTime, 'AI generation must not refresh the collection timestamp');
  assert.ok(generated.aiGuide);
  assert.match(await fs.readFile(generated.outputPath, 'utf8'), /Your AI weekly guide/);
  await application.evaluate(() => { globalThis.weeklyTestMode = 'fail'; });
  await assert.rejects(page.evaluate(() => window.canvasWeekly.generateGuide()), /previous guide is preserved/);
  assert.deepEqual((await page.evaluate(() => window.canvasWeekly.getState())).guide, generated);
  await application.evaluate(() => { globalThis.weeklyTestMode = 'wait'; });
  await page.evaluate(() => { window.waitingGeneration = window.canvasWeekly.generateGuide().catch(error => error.message); });
  await page.waitForFunction(async () => (await window.canvasWeekly.getState()).run.busy);
  await page.evaluate(() => window.canvasWeekly.cancelRefresh());
  assert.match(await page.evaluate(() => window.waitingGeneration), /cancelled/);
  assert.deepEqual((await page.evaluate(() => window.canvasWeekly.getState())).guide, generated);
  assert.equal(await application.evaluate(() => globalThis.syntheticRequestCount), beforeGeneration);
  await application.evaluate(() => { globalThis.weeklyTestMode = 'success'; });
  const preferences = { availability: 'Tuesday and Thursday evenings', priorities: 'Practice SQL before the lab', detail: 'brief', includeWithAI: false };
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByLabel('Available study time', { exact: true }).fill(preferences.availability);
  await page.getByLabel('Priorities and preferences', { exact: true }).fill(preferences.priorities);
  await page.getByLabel('Guide length', { exact: true }).selectOption('brief');
  await page.getByLabel('Include study preferences with AI', { exact: true }).uncheck();
  await page.getByRole('button', { name: 'Save study preferences', exact: true }).click();
  await page.getByText(/Study preferences saved/).waitFor();
  assert.equal((await page.evaluate(() => window.canvasWeekly.getState())).guide.planningPreferences, null);
  await page.getByLabel('Include study preferences with AI', { exact: true }).check();
  await page.getByRole('button', { name: 'Save study preferences', exact: true }).click();
  await page.waitForFunction(async () => (await window.canvasWeekly.getState()).planningPreferences.includeWithAI);
  assert.equal((await page.evaluate(() => window.canvasWeekly.getState())).guide.aiPreferencesChanged, true);
  for (const theme of ['light', 'dark']) {
    await page.evaluate(theme => window.canvasWeekly.setTheme(theme), theme);
    await page.locator('.study-preferences').evaluate(element => element.scrollIntoView({ block: 'start' }));
    await captureUI(application, `.codex-temp/visual/study-preferences-${theme}.png`);
  }
  await page.getByRole('button', { name: 'This week', exact: true }).click();
  await page.evaluate(() => window.canvasWeekly.generateGuide());
  assert.deepEqual(await application.evaluate(() => globalThis.weeklyTestEvidence.studentPreferences), { availability: preferences.availability, priorities: preferences.priorities, detail: 'brief' });
  assert.equal((await page.evaluate(() => window.canvasWeekly.getState())).guide.aiPreferencesChanged, false);
  assert.equal(await application.evaluate(() => globalThis.syntheticRequestCount), beforeGeneration);
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('button', { name: 'Clear study preferences', exact: true }).click();
  await page.waitForFunction(async () => !(await window.canvasWeekly.getState()).planningPreferences.includeWithAI);
  await page.getByRole('button', { name: 'This week', exact: true }).click();
  await page.evaluate(id => window.canvasWeekly.removeWebsite(id), websiteId);
  const beforeMetadata = (await page.evaluate(() => window.canvasWeekly.getState())).guide;
  await application.evaluate((_electron, moduleUrl) => {
    const require = process.getBuiltinModule('module').createRequire(moduleUrl);
    const { metadataRecord } = require('./canvas-metadata.js');
    globalThis.syntheticRecords = [metadataRecord({ course: { id: '1', name: 'Example course', code: 'DEMO 101' },
      assignments: [{ id: '10', courseId: '1', name: 'Example assignment', state: 'published', points: 5,
        submissionTypes: ['online_upload'] },
      { id: '11', courseId: '1', name: 'Practice exam 2020', state: 'published', points: null,
        submissionTypes: ['online_upload'] }], submissions: [{ id: '100', assignmentId: '10', state: 'ungraded', cachedDueDate: new Date(Date.now() + 7 * 86400000).toISOString() }] })];
  }, new URL('../src/canvas-metadata.js', import.meta.url).href);
  await page.evaluate(() => window.canvasWeekly.updateGuide());
  const mixed = (await page.evaluate(() => window.canvasWeekly.getState())).guide;
  assert.equal(mixed.items.length, 2);
  assert.equal(mixed.items[0].status, 'unknown');
  assert.equal(mixed.items[0].instructionsStale, true);
  assert.equal(mixed.items[0].instructionsObservedAt, beforeMetadata.items[0].instructionsObservedAt);
  assert.equal(mixed.items[0].dueDateState, 'stored');
  assert.equal(mixed.items[0].availabilityStale, true);
  assert.equal(mixed.items[0].closesAt, beforeMetadata.items[0].closesAt);
  assert.equal(mixed.items[0].availabilityObservedAt, beforeMetadata.items[0].availabilityObservedAt);
  assert.equal(mixed.courses[0].syllabus, beforeMetadata.courses[0].syllabus);
  assert.match(await fs.readFile(mixed.outputPath, 'utf8'), /Instructions are last-known information/);
  assert.match(await fs.readFile(mixed.documentPath, 'utf8'), /Assignment metadata refreshed; instructions not rechecked/);
  for (const theme of ['light', 'dark']) {
    await page.evaluate(theme => window.canvasWeekly.setTheme(theme), theme);
    await page.locator(`html[data-theme="${theme}"]`).waitFor();
    const mixedItem = page.locator('.task').filter({ has: page.getByRole('heading', { name: 'Example assignment', exact: true }) });
    if (!await mixedItem.locator('details').evaluate(element => element.open)) await mixedItem.getByText('Instructions and details', { exact: true }).click();
    await mixedItem.getByText(/Last-known instructions, observed/).waitFor();
    await mixedItem.getByText(/Availability dates were not refreshed/).waitFor();
    await mixedItem.screenshot({ path: `.codex-temp/visual/metadata-instructions-${theme}.png` });
  }
  await page.evaluate(() => window.canvasWeekly.updateGuide());
  const repeatedMetadata = (await page.evaluate(() => window.canvasWeekly.getState())).guide;
  assert.equal(repeatedMetadata.items[0].instructionsObservedAt, mixed.items[0].instructionsObservedAt);
  assert.equal(repeatedMetadata.changes.length, 0);
  const protectedExports = [repeatedMetadata.outputPath, repeatedMetadata.documentPath, repeatedMetadata.wordPath];
  const beforeConnectionChange = await Promise.all(protectedExports.map(file => fs.readFile(file)));
  for (const change of ['connection', 'cookie']) {
    await application.evaluate((_electron, moduleUrl) => {
      const require = process.getBuiltinModule('module').createRequire(moduleUrl);
      const { CanvasConnection } = require('./canvas-session.js');
      globalThis.syntheticCollectionEntered = new Promise(resolve => { globalThis.enterCollection = resolve; });
      const hold = new Promise(resolve => { globalThis.releaseCollection = resolve; });
      CanvasConnection.prototype.collectMetadata = async function () {
        globalThis.enterCollection(); await hold;
        return structuredClone(globalThis.syntheticRecords); // Deliberately ignores cancellation to exercise the consumer guard.
      };
    }, new URL('../src/canvas-client.js', import.meta.url).href);
    await page.evaluate(() => { window.changedConnectionResult = window.canvasWeekly.updateGuide().then(() => 'unexpected success', error => error.message); });
    await application.evaluate(async () => { await globalThis.syntheticCollectionEntered; });
    await assert.rejects(page.evaluate(() => window.canvasWeekly.setTimeZone('UTC')), /current refresh/);
    await assert.rejects(page.evaluate(() => window.canvasWeekly.setRememberCanvas(false)), /current refresh/);
    await assert.rejects(page.evaluate(() => window.canvasWeekly.setRememberChatGPT(false)), /current refresh/);
    assert.equal((await page.evaluate(() => window.canvasWeekly.getState())).settings.timeZone, first.settings.timeZone);
    await application.evaluate(async (_electron, change) => {
      await globalThis.syntheticCollectionEntered;
      if (change === 'connection') globalThis.syntheticConnection.invalidate();
      else await globalThis.syntheticConnection.session.cookies.set({ url: 'https://canvas.ubc.ca', name: 'canvas_session',
        value: 'synthetic-changed-refresh-session', path: '/', secure: true, httpOnly: true });
      globalThis.releaseCollection();
    }, change);
    assert.match(await page.evaluate(() => window.changedConnectionResult), /(?:connection|session) changed/);
    assert.deepEqual((await page.evaluate(() => window.canvasWeekly.getState())).guide, repeatedMetadata);
    assert.deepEqual(await Promise.all(protectedExports.map(file => fs.readFile(file))), beforeConnectionChange, 'A changed connection must not overwrite any guide format');
  }
  for (const reason of ['MISSING', 'FLAGS']) {
    await page.evaluate(() => window.canvasWeekly.verifyCanvas());
    await application.evaluate(async ({ session }, reason) => {
      const cookies = session.fromPartition('persist:canvas').cookies;
      await cookies.remove('https://canvas.ubc.ca', 'canvas_session');
      if (reason === 'FLAGS') await cookies.set({ url: 'https://canvas.ubc.ca', name: 'canvas_session',
        value: 'private-diagnostic-fixture', path: '/', secure: true, httpOnly: false });
    }, reason);
    const beforeRejectedRefresh = await application.evaluate(() => globalThis.syntheticRequestCount);
    await assert.rejects(page.evaluate(() => window.canvasWeekly.updateGuide()), new RegExp('CW_SESSION_' + reason));
    assert.equal(await application.evaluate(() => globalThis.syntheticRequestCount), beforeRejectedRefresh, 'An unverified session must stop before network reads');
    const rejectedState = await page.evaluate(() => window.canvasWeekly.getState());
    assert.equal(rejectedState.run.busy, false);
    assert.equal(rejectedState.run.message.includes('private-diagnostic-fixture'), false);
    assert.deepEqual(rejectedState.guide, repeatedMetadata);
    assert.equal(rejectedState.collectionHistory[0].status, 'failed');
    assert.equal(rejectedState.collectionHistory[0].failure.code, 'CW_SESSION_' + reason);
    assert.match(rejectedState.canvas.collectionIssue, new RegExp('CW_SESSION_' + reason));
    assert.equal(rejectedState.collectionHistory[0].requests.length, 0, 'Session rejection must not invent accessed items');
    assert.deepEqual(await Promise.all(protectedExports.map(file => fs.readFile(file))), beforeConnectionChange, 'Session diagnostics must preserve all guide formats');
  }
  await application.evaluate(async ({ session }) => {
    await session.fromPartition('persist:canvas').cookies.set({ url: 'https://canvas.ubc.ca', name: 'canvas_session',
      value: 'synthetic-restored-refresh-session', path: '/', secure: true, httpOnly: true });
  });
  await page.evaluate(() => window.canvasWeekly.verifyCanvas());
  await application.evaluate((_electron, moduleUrl) => {
    const require = process.getBuiltinModule('module').createRequire(moduleUrl);
    const { CanvasConnection } = require('./canvas-session.js');
    Object.defineProperty(CanvasConnection.prototype, 'collectionIssue', globalThis.originalCollectionIssue);
    CanvasConnection.prototype.collectMetadata = globalThis.originalCollect;
  }, new URL('../src/canvas-client.js', import.meta.url).href);
  await page.reload();
  await page.locator('.coverage-notice > summary').waitFor();
  assert.equal(await page.getByRole('button', { name: /^(Collect|Refresh) course information$/ }).isDisabled(), false);
  const beforeOfflineOpen = await application.evaluate(() => globalThis.syntheticRequestCount);
  await page.evaluate(() => window.canvasWeekly.openGuide());
  assert.equal(await application.evaluate(() => globalThis.syntheticRequestCount), beforeOfflineOpen);
  for (const theme of ['light', 'dark']) {
    await page.evaluate(theme => window.canvasWeekly.setTheme(theme), theme);
    await page.locator(`html[data-theme="${theme}"]`).waitFor();
    await page.locator('main').evaluate(node => { node.scrollTop = 0; });
    await page.screenshot({ path: `.codex-temp/visual/refresh-coverage-${theme}.png` });
  }
  await application.evaluate(({ session }) => {
    session.fromPartition('persist:canvas').fetch = async () => new Response('', { status: 401 });
  });
  await assert.rejects(page.evaluate(() => window.canvasWeekly.verifyCanvas()), /login expired/);
  const failed = await page.evaluate(() => window.canvasWeekly.getState());
  assert.equal(failed.canvas.connected, false);
  assert.match(failed.canvas.error, /login expired/);
  await page.getByText('Canvas login expired. Reconnect Canvas and try again.', { exact: true }).waitFor();
  await application.evaluate(({ session }) => {
    session.fromPartition('persist:canvas').fetch = async address => new Response(JSON.stringify(
      new URL(address).pathname.endsWith('/profile') ? { id: 1000, name: 'Different student' } : [{ id: 1, name: 'Shared course' }]
    ), { headers: { 'content-type': 'application/json', 'x-canvas-user-id': '1000' } });
  });
  const switched = await page.evaluate(() => window.canvasWeekly.verifyCanvas());
  assert.equal(switched.canvas.error, null);
  assert.deepEqual(switched.settings.selectedCourseIds, []);
  assert.equal(switched.guide, null);
  assert.deepEqual(switched.websites, []);
  assert.deepEqual(switched.collectionHistory, [], 'A different account cannot see the previous collection history');
  assert.deepEqual(switched.reading.courses, []);
  assert.deepEqual(switched.planningPreferences, { includeWithAI: false, availability: '', priorities: '', detail: 'standard' });
  console.log('Desktop checks passed: shared refresh hold, enabled metadata coverage notice, synthetic profile/website connections, encrypted website login, in-memory course evidence (not Canvas collection), study plan, persistent local checkmarks, offline Open guide, preserved notes, login errors, account-switch isolation and discarded collection after connection change.');
  await page.evaluate(() => window.canvasWeekly.disconnectCanvas());
} finally { await application.close(); }
