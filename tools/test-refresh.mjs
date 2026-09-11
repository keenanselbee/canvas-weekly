import { _electron as electron } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';

await fs.mkdir('.codex-temp', { recursive: true });
const output = await fs.mkdtemp(path.resolve('.codex-temp/desktop-refresh-'));
const environment = { ...process.env, CANVAS_WEEKLY_TEST: '1' };
delete environment.ELECTRON_RUN_AS_NODE;
const application = await electron.launch({ args: ['.'], env: environment });
try {
  await application.evaluate(({ session, dialog, shell }, output) => {
    globalThis.syntheticRequestCount = 0;
    shell.openPath = async value => { globalThis.syntheticOpenedPath = value; return ''; };
    const deadline = new Date().toISOString();
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [output] });
    globalThis.syntheticRecords = [{ id: '1', coverage: ['course', 'assignments', 'pages'].map(source => ({ source, status: 'ok', checkedAt: deadline })), sources: {
      course: { id: 1, name: 'Example course', course_code: 'DEMO 101', syllabus_body: '<p>Read the notes first.</p>' },
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
    await session.fromPartition('persist:canvas').cookies.set({ url: 'https://canvas.ubc.ca', name: '_normandy_session',
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
  assert.equal(await page.getByRole('button', { name: 'Update guide', exact: true }).isDisabled(), true);
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
  await page.getByRole('button', { name: 'Update guide', exact: true }).click();
  const first = await page.evaluate(() => window.refreshFinished);
  await page.getByRole('heading', { name: 'Example assignment', exact: true }).waitFor();
  assert.equal(first.run.busy, false);
  assert.ok(first.guide.outputPath.startsWith(output));
  assert.equal(first.guide.items.length, 2);
  const timingGroup = page.locator('details.study-day').filter({ has: page.locator('summary', { hasText: 'Timing to confirm: DEMO 101' }) });
  assert.equal(await timingGroup.evaluate(node => node.open), false);
  assert.equal(first.guide.studyPlan.tasks.find(task => task.sourceId === '1:assignment:11').suggestedDate, null);
  assert.ok((await fs.readFile(first.guide.outputPath, 'utf8')).includes('Complete the practice.'));
  assert.ok((await fs.readFile(first.guide.outputPath, 'utf8')).includes('Read the external syllabus.'));
  assert.ok(!(await fs.readFile(first.guide.outputPath, 'utf8')).includes('example-password'));
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
  await page.getByRole('heading', { name: 'Start here', exact: true }).waitFor();
  await page.locator('#notice').waitFor({ state: 'hidden', timeout: 6500 });
  for (const theme of ['light', 'dark']) {
    await page.evaluate(theme => window.canvasWeekly.setTheme(theme), theme);
    await page.locator(`html[data-theme="${theme}"]`).waitFor();
    await page.locator('main').evaluate(node => { node.scrollTop = 0; });
    await page.screenshot({ path: `.codex-temp/visual/start-here-${theme}.png` });
  }
  await page.locator('details.study-day').evaluateAll(nodes => nodes.forEach(node => { node.open = false; }));
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
  assert.match(await fs.readFile(first.guide.outputPath, 'utf8'), /- \[x\]/);
  assert.equal((await page.evaluate(() => window.canvasWeekly.getState())).guide.items[0].status, 'not-submitted');
  await page.reload();
  assert.equal(await page.getByRole('checkbox', { name: /Preparation done:.*Example assignment/ }).isChecked(), true);
  // This fixture uses persistent test storage. Reset the unchanged undated task
  // so a repeat run actually exercises its change event and focus restoration.
  if ((await page.evaluate(() => window.canvasWeekly.getState())).guide.studyPlan.tasks.find(task => task.id === '1:assignment:11:prepare').done) {
    await page.evaluate(() => window.canvasWeekly.setStudyTaskDone('1:assignment:11:prepare', false));
    await page.reload();
  }
  await timingGroup.locator(':scope > summary').click();
  await page.getByRole('checkbox', { name: /Preparation done:.*Practice exam 2020/ }).check();
  await page.waitForFunction(() => document.getElementById('study-1:assignment:11:prepare') === document.activeElement);
  assert.equal(await timingGroup.evaluate(node => node.open), true, 'Checking a review item preserves its open group and focus');
  assert.equal(await page.getByRole('checkbox', { name: /Preparation done:.*Practice exam 2020/ }).isChecked(), true);
  await timingGroup.locator(':scope > summary').click();
  await fs.mkdir('.codex-temp/visual', { recursive: true });
  await page.evaluate(() => window.canvasWeekly.setTheme('light'));
  await page.locator('html[data-theme="light"]').waitFor();
  await page.screenshot({ path: '.codex-temp/visual/study-plan-light.png' });
  await page.evaluate(() => window.canvasWeekly.setTheme('dark'));
  await page.locator('html[data-theme="dark"]').waitFor();
  await page.screenshot({ path: '.codex-temp/visual/factual-guide.png' });
  await application.evaluate(async (_electron, urls) => {
    const require = process.getBuiltinModule('module').createRequire(urls.client);
    const { CodexClient } = require('./codex-client.js');
    const { validatePriorities } = require('./planning-output.js');
    CodexClient.prototype.plan = async evidence => validatePriorities({ priorities: [{
      sourceId: '1:assignment:10', action: 'Prepare the practice', reason: 'Use the required work to identify gaps.', suggestedDate: evidence.week.today,
      checks: ['Confirm whether any extension applies.'], steps: [
        { text: 'Complete the practice.', kind: 'required', quote: 'Complete the practice.' },
        { text: 'Use extra examples if helpful.', kind: 'optional', quote: 'Extra examples are optional.' },
      ],
    }] }, evidence);
  }, { client: new URL('../src/codex-client.js', import.meta.url).href, output: new URL('../src/planning-output.js', import.meta.url).href });
  await page.evaluate(async () => { await window.canvasWeekly.setAIEnabled(true); await window.canvasWeekly.updateGuide(); });
  const planned = await page.evaluate(() => window.canvasWeekly.getState());
  const plannedTask = planned.guide.studyPlan.tasks.find(task => task.id === taskId);
  assert.equal(plannedTask.ai, true);
  assert.equal(plannedTask.changedSinceDone, true);
  assert.equal(plannedTask.dueAt, first.guide.items[0].dueAt);
  await page.getByText(/ChatGPT refined 1 preparation task/).waitFor();
  await page.getByText('Preparation steps', { exact: true }).first().click();
  await page.getByText(/Required \(AI interpretation\)/).first().waitFor();
  await page.locator('#notice').waitFor({ state: 'hidden', timeout: 6500 });
  await page.screenshot({ path: '.codex-temp/visual/study-plan-ai.png' });
  assert.match(await fs.readFile(first.guide.outputPath, 'utf8'), /Optional \(AI interpretation\)/);
  await page.evaluate(() => window.canvasWeekly.setAIEnabled(false));
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
    await application.evaluate(async (_electron, change) => {
      await globalThis.syntheticCollectionEntered;
      if (change === 'connection') globalThis.syntheticConnection.invalidate();
      else await globalThis.syntheticConnection.session.cookies.set({ url: 'https://canvas.ubc.ca', name: '_normandy_session',
        value: 'synthetic-changed-refresh-session', path: '/', secure: true, httpOnly: true });
      globalThis.releaseCollection();
    }, change);
    assert.match(await page.evaluate(() => window.changedConnectionResult), /(?:connection|session) changed/);
    assert.deepEqual((await page.evaluate(() => window.canvasWeekly.getState())).guide, repeatedMetadata);
    assert.deepEqual(await Promise.all(protectedExports.map(file => fs.readFile(file))), beforeConnectionChange, 'A changed connection must not overwrite any guide format');
  }
  await application.evaluate((_electron, moduleUrl) => {
    const require = process.getBuiltinModule('module').createRequire(moduleUrl);
    const { CanvasConnection } = require('./canvas-session.js');
    Object.defineProperty(CanvasConnection.prototype, 'collectionIssue', globalThis.originalCollectionIssue);
    CanvasConnection.prototype.collectMetadata = globalThis.originalCollect;
  }, new URL('../src/canvas-client.js', import.meta.url).href);
  await page.reload();
  await page.getByRole('heading', { name: 'Check source coverage', exact: true }).waitFor();
  assert.equal(await page.getByRole('button', { name: 'Update guide', exact: true }).isDisabled(), false);
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
  console.log('Desktop checks passed: shared refresh hold, enabled metadata coverage notice, synthetic profile/website connections, encrypted website login, in-memory course evidence (not Canvas collection), study plan, persistent local checkmarks, offline Open guide, preserved notes, login errors, account-switch isolation and discarded collection after connection change.');
  await page.evaluate(() => window.canvasWeekly.disconnectCanvas());
} finally { await application.close(); }
