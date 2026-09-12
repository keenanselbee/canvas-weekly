import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import JSZip from 'jszip';
import { buildGuide, reconcile } from '../src/guide.js';
import { renderWord } from '../src/guide-word.js';
import { GuideStore } from '../src/guide-store.js';

function fixture() {
  return buildGuide(reconcile([{ id: '1', coverage: [{ source: 'pages', status: 'failed', message: 'Verify the reading list.' }], sources: {
    course: { name: 'Databases', course_code: 'CS 1' }, assignments: [{ id: 1, name: 'Lab <test>',
      due_at: '2026-09-11T18:00:00Z', description: '<p>Read the relational keys chapter before the lab.</p>',
      submission: { workflow_state: 'unsubmitted' } }],
  } }], null, { origin: 'https://canvas.example', now: '2026-09-10T18:00:00Z', timeZone: 'UTC' }));
}

test('Word includes plan, exact deadlines, uncertainties and source links without active content', async () => {
  const guide = fixture();
  guide.studyPlan.tasks[0].done = true;
  guide.studyPlan.tasks[0].steps = [{ kind: 'required', text: 'Read before lab.', quote: 'Read the relational keys chapter before the lab.' }];
  guide.studyPlan.tasks[0].title += ' \u0001 <script>bad()</script> ![image](https://remote.example/image.png)';
  guide.courses[0].references = [{ title: 'Unsafe file', sourceUrl: 'file:///private.txt', status: 'uncollected' }, { title: 'Credentials', sourceUrl: 'https://user:password@example.com', status: 'uncollected' }];
  const zip = await JSZip.loadAsync(await renderWord(guide));
  const xml = await zip.file('word/document.xml').async('string');
  for (const expected of ['Your study plan', 'Suggested start:', 'Done:', 'Recorded due time:', '11, 2026', 'Required (AI interpretation)', 'Source quote:', 'Double-check before relying', 'Verify the reading list.', '&lt;script&gt;', 'Submission status:']) assert.ok(xml.includes(expected), expected);
  assert.ok(!xml.includes('\u0001'));
  assert.match(xml, /w:pgSz w:w="12240" w:h="15840"/);
  assert.match(xml, /w:pgMar w:top="1440"/);
  assert.match(xml, /w:pStyle w:val="Heading1"/);
  assert.match(xml, /w:numPr/);
  const styles = await zip.file('word/styles.xml').async('string');
  assert.match(styles, /w:after="200" w:before="360" w:line="300" w:lineRule="auto"/);
  const styleIds = [...styles.matchAll(/w:styleId="([^"]+)"/g)].map(match => match[1]);
  assert.equal(styleIds.length, new Set(styleIds).size, 'Style IDs must be unique');
  const numbering = await zip.file('word/numbering.xml').async('string');
  assert.match(numbering, /w:left="540" w:hanging="271"/);
  assert.equal(Object.keys(zip.files).some(name => /vba|embeddings|media\//i.test(name)), false);
  const relationships = await zip.file('word/_rels/document.xml.rels').async('string');
  assert.match(relationships, /https:\/\/canvas.example/);
  assert.doesNotMatch(relationships, /file:\/|password|remote.example|javascript:/);
  assert.doesNotMatch(xml, /INCLUDETEXT|INCLUDEPICTURE|DDEAUTO/);
});

test('Word export reuses unchanged bytes, preserves manual edits and restores all formats after a lock', async t => {
  const root = path.resolve('.codex-temp');
  await fs.mkdir(root, { recursive: true });
  const directory = await fs.mkdtemp(path.join(root, 'word-export-'));
  assert.equal(path.dirname(directory), root);
  try {
    const store = new GuideStore(path.join(directory, 'state'));
    const output = path.join(directory, 'output');
    const guide = fixture();
    const first = await store.export(guide, output, 'one');
    const paths = [first.outputPath, first.documentPath, first.wordPath, first.evidencePath];
    const originals = await Promise.all(paths.map(file => fs.readFile(file)));
    const stat = await fs.stat(first.wordPath);
    await store.export(guide, output, 'one');
    assert.equal((await fs.stat(first.wordPath)).mtimeMs, stat.mtimeMs);
    assert.deepEqual(await fs.readdir(path.join(path.dirname(first.wordPath), 'Revisions')).catch(() => []), []);
    await fs.writeFile(first.wordPath, 'Manual Word edits');
    await assert.rejects(store.export(guide, output, 'one'), /Weekly Plan.docx has manual edits/);
    await fs.writeFile(first.wordPath, originals[2]);
    const rename = fs.rename;
    const mock = t.mock.method(fs, 'rename', async (from, to) => {
      if (to === first.wordPath) throw new Error('Synthetic Word file lock');
      return rename(from, to);
    });
    await assert.rejects(store.export({ ...guide, generatedAt: '2026-09-11T18:00:00Z' }, output, 'one'), /Synthetic Word file lock/);
    mock.mock.restore();
    for (let i = 0; i < paths.length; i++) assert.deepEqual(await fs.readFile(paths[i]), originals[i]);
    assert.equal((await store.load(guide.origin, 'one')).generatedAt, guide.generatedAt);
    await store.setTaskDone(guide.origin, 'one', guide.studyPlan.tasks[0].id, true);
    const updated = await store.export(guide, output, 'one');
    const zip = await JSZip.loadAsync(await fs.readFile(updated.wordPath));
    assert.match(await zip.file('word/document.xml').async('string'), /Done:/);
    assert.equal((await store.load(guide.origin, 'one')).wordPath, first.wordPath);
  } finally { await fs.rm(directory, { recursive: true, force: true }); }
});
