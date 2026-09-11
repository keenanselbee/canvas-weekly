import { _electron as electron } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { buildGuide, reconcile } from '../src/guide.js';
import { GuideStore } from '../src/guide-store.js';

await fs.mkdir('.codex-temp/visual', { recursive: true });
const root = path.resolve('.codex-temp');
const directory = await fs.mkdtemp(path.join(root, 'document-viewer-'));
assert.equal(path.dirname(directory), root);
const guide = buildGuide(reconcile([{ id: '1', coverage: [
  { source: 'assignments', status: 'ok' }, { source: 'modules', status: 'unsupported', message: 'Module reads are disabled to avoid changing learning progress.' },
], sources: { course: { name: 'Introduction to Databases', course_code: 'COSC 304', syllabus_body: '<p>Review the lecture notes before the lab.</p>' }, assignments: [{
  id: 10, name: 'Relational keys practice', due_at: '2026-09-12T18:00:00Z', lock_at: '2026-09-12T23:00:00Z', description: '<p>Read chapter 2. Bring two questions to the lab. Extra examples are optional.</p>', submission: { workflow_state: 'unsubmitted' },
}] } }], null, { origin: 'https://canvas.example', now: '2026-09-10T18:00:00Z', timeZone: 'America/Vancouver' }));
guide.priorities = [{ sourceId: '1:assignment:10', action: 'Read about keys and prepare two lab questions', reason: 'Prepare to apply the concepts during the lab.', suggestedDate: '2026-09-10', checks: ['Confirm the lab room in the course schedule.'], steps: [
  { text: 'Read chapter 2.', kind: 'required', quote: 'Read chapter 2.' },
  { text: 'Bring two questions to the lab.', kind: 'required', quote: 'Bring two questions to the lab.' },
  { text: 'Try extra examples if helpful.', kind: 'optional', quote: 'Extra examples are optional.' },
] }];
guide.mode = 'Factual guide with AI study suggestions';
const store = new GuideStore(path.join(directory, 'state'));
let saved = await store.export(guide, path.join(directory, 'output'), 'synthetic');
saved = await store.setTaskDone(guide.origin, 'synthetic', '1:assignment:10:prepare', true);
saved = await store.export(saved, path.join(directory, 'output'), 'synthetic');
const entry = path.join(directory, 'viewer.cjs');
await fs.writeFile(entry, `const { app, BrowserWindow } = require('electron');
app.setPath('userData', ${JSON.stringify(path.join(directory, 'profile'))});
app.whenReady().then(() => {
  const window = new BrowserWindow({ show: false, width: 1200, height: 950, webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true } });
  window.loadFile(${JSON.stringify(saved.documentPath)});
});`);
const environment = { ...process.env };
delete environment.ELECTRON_RUN_AS_NODE;
const application = await electron.launch({ args: [entry], env: environment });
try {
  const page = await application.firstWindow();
  const requests = [];
  page.on('request', request => { if (/^https?:/.test(request.url())) requests.push(request.url()); });
  // Reload under observation; no network fixtures or Canvas sessions are involved.
  await page.reload();
  await page.getByRole('heading', { name: 'Your study plan', exact: true }).waitFor();
  assert.equal(await page.getByRole('checkbox').first().isChecked(), true);
  assert.equal(await page.getByRole('checkbox').first().isDisabled(), true);
  assert.equal(await page.locator('script,img,iframe,object').count(), 0);
  assert.equal(await page.evaluate(() => typeof window.require), 'undefined');
  await page.emulateMedia({ colorScheme: 'light' });
  assert.equal(await page.locator('main').evaluate(node => getComputedStyle(node).backgroundColor), 'rgb(255, 255, 255)');
  await page.screenshot({ path: '.codex-temp/visual/document-light.png' });
  await page.emulateMedia({ colorScheme: 'dark' });
  assert.equal(await page.locator('main').evaluate(node => getComputedStyle(node).backgroundColor), 'rgb(34, 39, 47)');
  await page.screenshot({ path: '.codex-temp/visual/document-dark.png' });
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await page.screenshot({ path: '.codex-temp/visual/document-narrow.png' });
  await page.setViewportSize({ width: 1200, height: 950 });
  await page.emulateMedia({ media: 'print' });
  assert.equal(await page.locator('nav').evaluate(node => getComputedStyle(node).display), 'none');
  await page.screenshot({ path: '.codex-temp/visual/document-print.png' });
  assert.deepEqual(requests, [], 'Reading and printing the document must make no network requests');
  await page.emulateMedia({ media: 'screen', colorScheme: 'light' });
  await page.getByRole('link', { name: 'Double-check before relying on this plan', exact: true }).click();
  assert.match(page.url(), /#section-2$/);
  console.log('Standalone guide passed: offline rendering, source navigation anchors, local progress, light/dark/narrow/print layouts and no automatic network requests.');
} finally { await application.close(); }
// Keep synthetic files and screenshots under ignored .codex-temp for visual review.
