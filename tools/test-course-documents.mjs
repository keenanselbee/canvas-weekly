import { _electron as electron } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { captureUI } from './capture-ui.mjs';

await fs.mkdir('.codex-temp', { recursive: true });
const directory = await fs.mkdtemp(path.resolve('.codex-temp/document-import-ui-'));
const file = path.join(directory, 'weekly-reading.md');
await fs.writeFile(file, '# Weekly reading\nRead chapter 2 before Thursday.\nThe extra examples are optional.\nPassword: fixture-secret\n');
const env = { ...process.env, CANVAS_WEEKLY_TEST: '1' }; delete env.ELECTRON_RUN_AS_NODE;
const application = await electron.launch({ args: ['.'], env });
try {
  const page = await application.firstWindow();
  page.setDefaultTimeout(10000);
  await application.evaluate(async ({ app, session, dialog, BrowserWindow }, { directory, file, moduleUrl }) => {
    const require = process.getBuiltinModule('module').createRequire(moduleUrl);
    const { GuideStore } = require('./guide-store.js');
    const { reconcile, buildGuide } = require('./guide.js');
    const { CodexClient } = require('./codex-client.js');
    globalThis.documentTestAIRequests = 0;
    CodexClient.prototype.plan = async () => { globalThis.documentTestAIRequests++; throw new Error('Import must not call AI'); };
    const path = require('node:path');
    const origin = 'https://canvas.ubc.ca';
    const saved = buildGuide(reconcile([{ id: '1', coverage: [{ source: 'instructions', status: 'unsupported', message: 'Instruction bodies were not collected.' }], sources: {
      course: { name: 'Example course', course_code: 'DEMO 101' }, assignments: [{ id: 10, name: 'Lab', due_at: '2026-09-18T18:00:00Z', submission: { workflow_state: 'unsubmitted' } }],
    } }], null, { origin, now: '2026-09-11T18:00:00Z', timeZone: 'America/Vancouver' }));
    await new GuideStore(path.join(app.getPath('userData'), 'guides')).export(saved, directory, '90001');
    globalThis.documentTestRequests = 0;
    globalThis.documentTestUser = 90001;
    globalThis.documentTestCancelled = false;
    session.fromPartition('persist:canvas').fetch = async (address, options) => {
      globalThis.documentTestRequests++;
      if (options.method !== 'GET') throw new Error('Unexpected mutation request');
      const url = new URL(address);
      const data = url.pathname.endsWith('/users/self/profile') ? { id: globalThis.documentTestUser, name: 'Example Student' }
        : url.pathname === '/api/v1/courses' ? [{ id: 1, name: 'Example course', course_code: 'DEMO 101' }] : null;
      if (!data) throw new Error('Unexpected Canvas request');
      return new Response(JSON.stringify(data), { headers: { 'content-type': 'application/json', 'x-canvas-user-id': String(globalThis.documentTestUser) } });
    };
    dialog.showOpenDialog = async () => ({ canceled: globalThis.documentTestCancelled, filePaths: [file] });
    await session.fromPartition('persist:canvas').cookies.set({ url: origin, name: 'canvas_session', value: 'synthetic-document-test', path: '/', secure: true, httpOnly: true });
    BrowserWindow.getAllWindows()[0].webContents.setZoomFactor(1);
  }, { directory, file, moduleUrl: new URL('../src/main.js', import.meta.url).href });
  await page.evaluate(() => window.canvasWeekly.verifyCanvas());
  await page.reload();
  const saved = (await page.evaluate(() => window.canvasWeekly.getState())).guide;
  const beforeRequests = await application.evaluate(() => globalThis.documentTestRequests);
  await page.getByRole('button', { name: 'Courses', exact: true }).click();
  await page.getByText('DEMO 101 · 0 added documents', { exact: true }).click();
  await page.getByRole('button', { name: 'Choose document', exact: true }).click();
  await page.getByRole('heading', { name: 'Review document', exact: true }).waitFor();
  assert.equal((await page.evaluate(() => window.canvasWeekly.getState())).guide.evidenceHash, saved.evidenceHash, 'Preview must not write the pack');
  await page.getByLabel('Document title', { exact: true }).fill('Week 2 reading');
  for (const theme of ['light', 'dark']) {
    await page.evaluate(theme => window.canvasWeekly.setTheme(theme), theme);
    await page.getByRole('heading', { name: 'Review document', exact: true }).waitFor();
    assert.equal(await page.getByLabel('Document title', { exact: true }).inputValue(), 'Week 2 reading', 'Normal rerenders preserve the draft');
    await page.getByRole('heading', { name: 'Review document', exact: true }).evaluate(element => element.scrollIntoView({ block: 'start' }));
    if (await page.locator('#notice button').isVisible()) await page.locator('#notice button').click();
    await captureUI(application, path.join(directory, `preview-${theme}.png`));
  }
  await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(800, 600));
  await page.getByRole('heading', { name: 'Review document', exact: true }).evaluate(element => element.scrollIntoView({ block: 'start' }));
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await captureUI(application, path.join(directory, 'preview-small.png'));
  await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1140, 820));
  await page.getByRole('button', { name: 'Add to evidence pack', exact: true }).click();
  await page.getByText('DEMO 101 · 1 added documents', { exact: true }).waitFor();
  let added = (await page.evaluate(() => window.canvasWeekly.getState())).guide;
  const source = added.courses[0].evidence.find(item => item.userProvided);
  assert.equal(source.title, 'Week 2 reading'); assert.deepEqual(added.items, saved.items);
  assert.equal(added.generatedAt, saved.generatedAt);
  assert.doesNotMatch(await fs.readFile(added.evidencePath, 'utf8'), /fixture-secret|document-import-ui-/);
  assert.match(await fs.readFile(added.evidencePath, 'utf8'), /extra examples are optional/);
  const discarded = await page.evaluate(() => window.canvasWeekly.previewDocument('1'));
  await page.evaluate(() => window.canvasWeekly.discardDocument());
  await assert.rejects(page.evaluate(token => window.canvasWeekly.addDocument(token, 'Discarded', ''), discarded.token), /preview expired/);
  assert.equal((await page.evaluate(() => window.canvasWeekly.getState())).guide.evidenceHash, added.evidenceHash);
  await page.evaluate(async id => {
    const api = window.canvasWeekly;
    const draft = await api.previewDocument('1', id);
    await api.savePlanningPreferences({ includeWithAI: false, availability: '', priorities: '', detail: 'standard' });
    try { await api.addDocument(draft.token, 'Expired', ''); throw new Error('stale preview was accepted'); }
    catch (error) { if (!/preview expired/.test(error.message)) throw error; }
  }, source.id);
  await application.evaluate(() => { globalThis.documentTestCancelled = true; });
  assert.equal(await page.evaluate(() => window.canvasWeekly.previewDocument('1')), null);
  await application.evaluate(() => { globalThis.documentTestCancelled = false; });
  const replacement = await page.evaluate(id => window.canvasWeekly.previewDocument('1', id), source.id);
  added = (await page.evaluate(({ token }) => window.canvasWeekly.addDocument(token, 'Replacement', 'https://course.example/reading'), replacement)).guide;
  assert.equal(added.courses[0].evidence.filter(item => item.userProvided).length, 1);
  assert.equal(added.courses[0].evidence.find(item => item.userProvided).id, source.id);
  assert.equal(await application.evaluate(() => globalThis.documentTestRequests), beforeRequests, 'Document operations never contact Canvas');
  await page.reload();
  assert.equal((await page.evaluate(() => window.canvasWeekly.getState())).guide.courses[0].evidence.find(item => item.userProvided).title, 'Replacement');
  const removed = (await page.evaluate(id => window.canvasWeekly.removeDocument('1', id), source.id)).guide;
  assert.equal(removed.courses[0].evidence.some(item => item.userProvided), false);
  assert.doesNotMatch(await fs.readFile(removed.evidencePath, 'utf8'), /extra examples are optional/);
  const revisionDirectory = path.join(path.dirname(removed.evidencePath), 'Revisions');
  const revisions = await Promise.all((await fs.readdir(revisionDirectory)).filter(name => name.endsWith('-Course Information.md')).map(name => fs.readFile(path.join(revisionDirectory, name), 'utf8')));
  assert.equal(revisions.some(text => text.includes('extra examples are optional')), true, 'Removal retains prior exported revisions');
  assert.match(await fs.readFile(file, 'utf8'), /fixture-secret/, 'The original document is untouched');
  assert.equal(await application.evaluate(() => globalThis.documentTestAIRequests), 0);
  const oldDraft = await page.evaluate(() => window.canvasWeekly.previewDocument('1'));
  await application.evaluate(() => { globalThis.documentTestUser = 90002; });
  await page.evaluate(() => window.canvasWeekly.verifyCanvas());
  await assert.rejects(page.evaluate(token => window.canvasWeekly.addDocument(token, 'Foreign source', ''), oldDraft.token), /preview expired/);
  assert.equal((await page.evaluate(() => window.canvasWeekly.getState())).guide, null);
  console.log(`Document import UI, preview/discard, offline export, replacement/removal, stale-preview and account boundaries passed. Synthetic requests only. Fixtures: ${directory}`);
} catch (error) {
  const page = await application.firstWindow();
  console.error(await page.evaluate(async () => ({ run: (await window.canvasWeekly.getState()).run, notice: document.querySelector('#notice')?.textContent })));
  throw error;
} finally { await application.close(); }
