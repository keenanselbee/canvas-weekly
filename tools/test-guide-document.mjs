import { _electron as electron } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { buildGuide, reconcile } from '../src/guide.js';
import { GuideStore } from '../src/guide-store.js';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { createCanvas } from '@napi-rs/canvas';

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
  const print = async name => {
    const base64 = await application.evaluate(async ({ BrowserWindow }) => (await BrowserWindow.getAllWindows()[0].webContents.printToPDF({ printBackground: true, preferCSSPageSize: true })).toString('base64'));
    const bytes = Buffer.from(base64, 'base64');
    await fs.writeFile(path.join(directory, `${name}.pdf`), bytes);
    const loading = getDocument({ data: new Uint8Array(bytes), isEvalSupported: false, verbosity: 0 });
    const texts = [];
    try {
      const pdf = await loading.promise;
      for (let number = 1; number <= pdf.numPages; number++) {
        const printed = await pdf.getPage(number);
        const text = (await printed.getTextContent()).items.filter(item => item.str?.trim());
        assert.ok(text.length > 0, 'No blank print pages');
        for (const item of text) {
          const [x, y] = item.transform.slice(4);
          assert.ok(x >= 24 && x + item.width <= printed.view[2] - 24 && y >= 24 && y <= printed.view[3] - 24, `Print text outside page margins: ${item.str}`);
        }
        texts.push(text.map(item => item.str).join(' '));
        if (name === 'overview') {
          const viewport = printed.getViewport({ scale: 1.5 });
          const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
          await printed.render({ canvasContext: canvas.getContext('2d'), viewport, canvas }).promise;
          await fs.writeFile(path.join(directory, `overview-${number}.png`), canvas.toBuffer('image/png'));
        }
      }
      return { pages: pdf.numPages, text: texts.join(' ') };
    } finally { await loading.destroy(); }
  };
  const full = await print('full-guide');
  await page.emulateMedia({ media: 'screen', colorScheme: 'light' });
  await page.getByText('Print options', { exact: true }).click();
  await page.getByRole('radio', { name: 'Overview and checks', exact: true }).check();
  assert.equal(await page.getByRole('heading', { name: 'Full preparation checklist', exact: true }).isVisible(), true, 'Print choice must not hide on-screen tasks');
  await page.screenshot({ path: '.codex-temp/visual/document-print-options.png' });
  await page.emulateMedia({ media: 'print' });
  assert.equal(await page.getByRole('heading', { name: 'Full preparation checklist', exact: true }).isVisible(), false);
  const overview = await print('overview');
  assert.ok(overview.pages < full.pages, 'Overview must use fewer pages than the full reference guide');
  assert.match(overview.text, /Printed overview/);
  assert.match(overview.text, /Recorded deadlines/);
  assert.match(overview.text, /Relational keys practice/, 'A checked preparation task must retain its outstanding submission deadline');
  assert.match(overview.text, /Confirm the lab room/);
  assert.doesNotMatch(overview.text, /Full preparation checklist|Course information and coverage|Source quote:/);
  console.log(JSON.stringify({ directory, fullPages: full.pages, overviewPages: overview.pages }));
  assert.deepEqual(requests, [], 'Reading and printing the document must make no network requests');
  await page.emulateMedia({ media: 'screen', colorScheme: 'light' });
  await page.getByRole('link', { name: 'Double-check before relying on this plan', exact: true }).click();
  assert.match(page.url(), /#section-2$/);
  console.log('Standalone guide passed: offline rendering, source navigation anchors, local progress, light/dark/narrow/print layouts and no automatic network requests.');
} finally { await application.close(); }
// Keep synthetic files and screenshots under ignored .codex-temp for visual review.
