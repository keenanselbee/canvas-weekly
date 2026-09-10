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
  await application.evaluate(({ session, dialog }, output) => {
    const deadline = new Date().toISOString();
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [output] });
    session.fromPartition('persist:canvas').fetch = async (address, options) => {
      if (options.method !== 'GET' || options.redirect !== 'manual') throw new Error('Unsafe request in desktop test');
      const url = new URL(address);
      let data = [];
      if (url.pathname.endsWith('/users/self/profile')) data = { id: 999, name: 'Example Student' };
      else if (url.pathname === '/api/v1/courses') data = [{ id: 1, name: 'Example course', course_code: 'DEMO 101' }];
      else if (url.pathname === '/api/v1/courses/1') data = { id: 1, name: 'Example course', course_code: 'DEMO 101', syllabus_body: '<p>Read the notes first.</p>' };
      else if (url.pathname.endsWith('/assignments')) data = [{ id: 10, name: 'Example assignment', due_at: deadline, description: '<p>Complete the practice.</p>', submission: { workflow_state: 'unsubmitted' } }];
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
  await page.getByRole('button', { name: 'Update guide', exact: true }).click();
  await page.getByRole('heading', { name: 'Example assignment' }).waitFor();
  const first = await page.evaluate(() => window.canvasWeekly.getState());
  assert.equal(first.guide.items.length, 1);
  assert.ok((await fs.readFile(first.guide.outputPath, 'utf8')).includes('Complete the practice.'));
  const notes = path.join(path.dirname(first.guide.outputPath), 'Student Notes.md');
  await fs.writeFile(notes, 'Keep these student notes.');
  await page.getByRole('button', { name: 'Update guide', exact: true }).click();
  await page.waitForFunction(async () => !(await window.canvasWeekly.getState()).run.busy);
  assert.equal(await fs.readFile(notes, 'utf8'), 'Keep these student notes.');
  assert.equal((await page.evaluate(() => window.canvasWeekly.getState())).guide.changes.length, 0);
  await fs.mkdir('.codex-temp/visual', { recursive: true });
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
  console.log('Desktop refresh passed: synthetic connection, generation, preserved notes, visible login errors and account-switch isolation.');
  await page.evaluate(() => window.canvasWeekly.disconnectCanvas());
} finally { await application.close(); }
