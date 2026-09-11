import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createCanvas } from '@napi-rs/canvas';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { buildGuide, reconcile } from '../src/guide.js';
import { buildStudyPlan } from '../src/study-plan.js';
import { renderWord } from '../src/guide-word.js';

// Native Word pagination is a Windows release check, not a prerequisite for
// ordinary unit tests or running Canvas Weekly. Fixtures contain no real data.
if (process.platform !== 'win32') throw new Error('This check requires Windows and installed Microsoft Word.');
const root = path.resolve('.codex-temp');
await fs.mkdir(root, { recursive: true });
const directory = await fs.mkdtemp(path.join(root, 'word-layout-'));
const options = { origin: 'https://canvas.example', now: '2026-09-10T18:00:00Z', timeZone: 'America/Vancouver' };
const records = ['Databases', 'Software Engineering'].map((name, index) => ({ id: String(index + 1),
  coverage: [{ source: 'syllabus', status: 'ok' }, { source: 'course materials', status: 'partial', message: 'Confirm the lab room and the current reading list.' }],
  sources: {
    course: { name, course_code: `DEMO ${index + 1}` },
    syllabus: { text: 'Read the course notes before the lab. Supplementary exercises are optional. Keep a list of questions and bring it to office hours.', links: ['https://course.example/materials'] },
    assignments: [{ id: 10, name: index ? 'Individual project preparation and design questions' : 'Relational keys practice',
      due_at: '2026-09-12T18:00:00Z', lock_at: '2026-09-13T23:00:00Z', description: '<p>Read chapter 2 before the lab. Prepare two questions in your own words. Extra examples are optional.</p><p>Check the instructions against the syllabus and record any uncertainty before planning your submission.</p>',
      submission: { workflow_state: 'unsubmitted' } }],
    conversation: [{ id: '20', data: { subject: 'Possible deadline extension', messages: [{ id: '30', created_at: '2026-09-10T17:00:00Z', body: 'A second try may be available. Confirm the applicable deadline with the instructor.' }] } }],
  },
}));
const guide = buildGuide(reconcile(records, null, options), options.now);
const completed = guide.studyPlan.tasks[0];
guide.studyPlan = buildStudyPlan(guide, { [completed.id]: { done: true, fingerprint: completed.fingerprint } });
const documentPath = path.join(directory, 'Weekly Plan.docx');
const pdfPath = path.join(directory, 'Weekly Plan.pdf');
await fs.writeFile(documentPath, await renderWord(guide));
const script = path.join(directory, 'render.ps1');
await fs.writeFile(script, `param([string]$DocumentPath, [string]$PdfPath)
$ErrorActionPreference = 'Stop'
$word = $null
$document = $null
$owned = $false
try {
  if (Get-Process WINWORD -ErrorAction SilentlyContinue) { throw 'Close Microsoft Word before running this optional layout check.' }
  $word = New-Object -ComObject Word.Application
  if ($word.Documents.Count -ne 0) { throw 'Word returned an existing document session; refusing to change it.' }
  $owned = $true
  $word.Visible = $false
  $word.DisplayAlerts = 0
  $word.AutomationSecurity = 3
  $document = $word.Documents.Open($DocumentPath, $false, $true, $false)
  $document.Repaginate()
  $pages = $document.ComputeStatistics(2)
  $document.ExportAsFixedFormat($PdfPath, 17)
  @{ pages = $pages; version = $word.Version; readOnly = $document.ReadOnly } | ConvertTo-Json -Compress
} finally {
  try {
    if ($null -ne $document) {
      try { $document.Close(0) }
      finally { [void][Runtime.InteropServices.Marshal]::FinalReleaseComObject($document) }
    }
  } finally {
    if ($null -ne $word) {
      try {
        $saveChanges = 0
        if ($owned) { $word.Quit([ref]$saveChanges) }
      } finally { [void][Runtime.InteropServices.Marshal]::FinalReleaseComObject($word) }
    }
  }
}
`, 'utf8');
const before = await fs.readFile(documentPath);
const { stdout } = await promisify(execFile)('powershell.exe', ['-NoProfile', '-NonInteractive', '-File', script, '-DocumentPath', documentPath, '-PdfPath', pdfPath],
  { windowsHide: true, timeout: 120000, maxBuffer: 1024 * 1024 });
const word = JSON.parse(stdout.trim());
assert.equal(word.readOnly, true);
assert.deepEqual(await fs.readFile(documentPath), before, 'Word must not modify the app-generated document');
const loading = getDocument({ data: new Uint8Array(await fs.readFile(pdfPath)), isEvalSupported: false, useSystemFonts: false, useWorkerFetch: false, stopAtErrors: true, verbosity: 0 });
const pages = [];
try {
  const pdf = await loading.promise;
  assert.equal(pdf.numPages, word.pages);
  assert.ok(pdf.numPages >= 3 && pdf.numPages <= 12, 'Fixture should exercise multiple pages without runaway pagination');
  for (let number = 1; number <= pdf.numPages; number++) {
    const page = await pdf.getPage(number);
    const text = (await page.getTextContent()).items.filter(item => typeof item.str === 'string' && item.str.trim());
    const viewport = page.getViewport({ scale: 1.5 });
    const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
    const context = canvas.getContext('2d');
    await page.render({ canvasContext: context, viewport, canvas }).promise;
    await fs.writeFile(path.join(directory, `page-${number}.png`), canvas.toBuffer('image/png'));
    const content = text.map(item => item.str).join(' ');
    assert.match(content, /Canvas Weekly/);
    assert.match(content, new RegExp(`Page\\s*${number}`));
    assert.ok(text.length > 4, `Page ${number} is nearly empty`);
    for (const item of text) {
      const [x, y] = item.transform.slice(4);
      assert.ok(x >= 25 && x + item.width <= page.view[2] - 25 && y >= 20 && y <= page.view[3] - 20, `Text outside page bounds on page ${number}: ${item.str}`);
    }
    // Verify actual header pixels as well as extractable text. Some preview
    // surfaces omit repeated image regions when displaying consecutive pages.
    const header = context.getImageData(90, 45, 330, 30).data;
    assert.ok(header.some((value, index) => index % 4 !== 3 && value < 160), `Header not rasterized on page ${number}`);
    pages.push({ number, text: content });
    page.cleanup();
  }
} finally { await loading.destroy(); }
const text = pages.map(page => page.text).join(' ');
for (const expected of ['Your study plan', 'Done:', 'Double-check before relying', 'Possible deadline extension', 'Confirm message sender', 'Read chapter 2', 'Course syllabus']) assert.ok(text.includes(expected), expected);
await fs.writeFile(path.join(directory, 'review.json'), JSON.stringify({ word, pages }, null, 2));
console.log(JSON.stringify({ result: 'Native Word export, page bounds, running header/footer and content checks passed. Inspect every page PNG before claiming visual QA.', directory, pages: pages.length, wordVersion: word.version }));
