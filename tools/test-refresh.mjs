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
    session.fromPartition('persist:canvas').fetch = async (address, options) => {
      globalThis.syntheticRequestCount++;
      if (options.method !== 'GET' || options.redirect !== 'manual') throw new Error('Unsafe request in desktop test');
      const url = new URL(address);
      let data = [];
      if (url.pathname.endsWith('/users/self/profile')) data = { id: 999, name: 'Example Student' };
      else if (url.pathname === '/api/v1/courses') data = [{ id: 1, name: 'Example course', course_code: 'DEMO 101' }];
      else if (url.pathname === '/api/v1/courses/1') data = { id: 1, name: 'Example course', course_code: 'DEMO 101', syllabus_body: '<p>Read the notes first.</p>' };
      else if (url.pathname.endsWith('/assignments')) data = [{ id: 10, name: 'Example assignment', due_at: deadline, description: '<p>Complete the practice.</p>', submission: { workflow_state: 'unsubmitted' } }];
      else if (url.pathname.endsWith('/pages')) data = [{ page_id: 2, url: 'course-site', title: 'Course website', body: '<p>Read the external syllabus.</p><p>Password: example-password</p>' }];
      return new Response(JSON.stringify(data), { headers: { 'content-type': 'application/json' } });
    };
  }, output);
  const page = await application.firstWindow();
  await page.evaluate(async () => {
    await window.canvasWeekly.verifyCanvas();
    await window.canvasWeekly.selectCourses(['1']);
    await window.canvasWeekly.chooseOutput();
  });
  await page.reload();
  await page.getByRole('button', { name: 'Courses', exact: true }).click();
  await page.getByRole('button', { name: 'Save course selection', exact: true }).click();
  await page.getByText('Course selection saved.', { exact: true }).waitFor();
  await page.locator('#notice').waitFor({ state: 'hidden', timeout: 6500 });
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
  await page.getByRole('heading', { name: 'Example assignment' }).waitFor();
  assert.equal(first.run.busy, false);
  assert.ok(first.guide.outputPath.startsWith(output));
  assert.equal(first.guide.items.length, 1);
  assert.ok((await fs.readFile(first.guide.outputPath, 'utf8')).includes('Complete the practice.'));
  assert.ok((await fs.readFile(first.guide.outputPath, 'utf8')).includes('Read the external syllabus.'));
  assert.ok(!(await fs.readFile(first.guide.outputPath, 'utf8')).includes('example-password'));
  await assert.rejects(page.evaluate(() => window.canvasWeekly.openSource('https://unknown.example/')), /Choose a source/);
  const notes = path.join(path.dirname(first.guide.outputPath), 'Student Notes.md');
  await fs.writeFile(notes, 'Keep these student notes.');
  await page.evaluate(() => window.canvasWeekly.updateGuide());
  assert.equal(await fs.readFile(notes, 'utf8'), 'Keep these student notes.');
  assert.equal((await page.evaluate(() => window.canvasWeekly.getState())).guide.changes.length, 0);
  const taskId = '1:assignment:10:prepare';
  await page.evaluate(taskId => window.canvasWeekly.setStudyTaskDone(taskId, false), taskId);
  const beforeLocalChanges = await application.evaluate(() => globalThis.syntheticRequestCount);
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
  assert.equal(await application.evaluate(() => globalThis.syntheticOpenedPath), first.guide.outputPath);
  assert.match(await fs.readFile(first.guide.outputPath, 'utf8'), /- \[x\]/);
  assert.equal((await page.evaluate(() => window.canvasWeekly.getState())).guide.items[0].status, 'not-submitted');
  await page.reload();
  assert.equal(await page.getByRole('checkbox', { name: /Preparation done:.*Example assignment/ }).isChecked(), true);
  await fs.mkdir('.codex-temp/visual', { recursive: true });
  await page.evaluate(() => window.canvasWeekly.setTheme('light'));
  await page.locator('html[data-theme="light"]').waitFor();
  await page.screenshot({ path: '.codex-temp/visual/study-plan-light.png' });
  await page.evaluate(() => window.canvasWeekly.setTheme('dark'));
  await page.locator('html[data-theme="dark"]').waitFor();
  await page.screenshot({ path: '.codex-temp/visual/factual-guide.png' });
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
    ), { headers: { 'content-type': 'application/json' } });
  });
  const switched = await page.evaluate(() => window.canvasWeekly.verifyCanvas());
  assert.equal(switched.canvas.error, null);
  assert.deepEqual(switched.settings.selectedCourseIds, []);
  assert.equal(switched.guide, null);
  console.log('Desktop refresh passed: synthetic connection, study plan, persistent local checkmarks, offline Open guide, preserved notes, login errors and account-switch isolation.');
  await page.evaluate(() => window.canvasWeekly.disconnectCanvas());
} finally { await application.close(); }
