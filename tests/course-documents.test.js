import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { previewCourseDocument, changeCourseDocument } from '../src/course-documents.js';
import { buildEvidencePack, plannerEvidence, renderEvidencePack } from '../src/evidence-pack.js';
import { reconcile, buildGuide, renderMarkdown } from '../src/guide.js';
import { GuideStore } from '../src/guide-store.js';
import { weeklyMarkdown } from '../src/weekly-view.js';
import { pdf, word } from '../tools/document-fixtures.mjs';

const origin = 'https://canvas.example';
const now = '2026-09-10T18:00:00Z';
const record = { id: '1', sources: { course: { name: 'Example', course_code: 'DEMO' }, assignments: [{ id: 4, name: 'Lab', due_at: '2026-09-18T23:00:00Z', submission: { workflow_state: 'submitted' } }] }, coverage: [{ source: 'assignments', status: 'ok' }] };
const sample = () => buildGuide(reconcile([record], null, { origin, now, timeZone: 'America/Vancouver' }));
async function fixture(name, bytes) {
  await fs.mkdir('.codex-temp', { recursive: true });
  const directory = await fs.mkdtemp(path.resolve('.codex-temp/course-documents-'));
  const file = path.join(directory, name); await fs.writeFile(file, bytes);
  return { directory, file };
}

test('preview is read-only, redacts credentials, preserves ending conditions and excludes local paths', async () => {
  const body = 'Read chapter 2.\nPassword: fixture-secret\nOptional: read chapter 3 only if needed.';
  const { file, directory } = await fixture('reading.md', body);
  const course = sample().courses[0];
  const source = await previewCourseDocument(file, course);
  assert.equal(await fs.readFile(file, 'utf8'), body);
  assert.deepEqual(await fs.readdir(directory), ['reading.md']);
  assert.match(source.body, /Optional: read chapter 3 only if needed/);
  assert.doesNotMatch(JSON.stringify(source), /fixture-secret|codex-temp/);
  assert.equal(source.observedAt, null); assert.equal(source.userProvided, true);
  assert.equal(source.stale, true); assert.equal(source.partial, true);
  assert.equal(source.documentHash.length, 64);
  const saved = sample();
  const next = changeCourseDocument(saved, '1', { source, title: 'Weekly readings' });
  assert.deepEqual(next.items, saved.items);
  assert.equal(next.generatedAt, saved.generatedAt);
  const pack = buildEvidencePack(next);
  const imported = pack.sources.find(item => item.userProvided);
  assert.equal(imported.sourceUrl, null); assert.equal(imported.importedAt, source.importedAt);
  assert.equal(imported.documentHash, source.documentHash);
  assert.equal(plannerEvidence(next).sources.find(item => item.userProvided).body, source.body);
  assert.match(renderEvidencePack(next), /Weekly readings/);
  assert.doesNotMatch(renderMarkdown(next), /<null>|<undefined>/);
  assert.match(renderMarkdown(next), /Imported copy:/);
});

test('malformed, oversized, nonlocal and cancelled previews fail without importing partial text', async () => {
  for (const [name, bytes, message] of [['bad.txt', Buffer.from([0xff]), /UTF-8/], ['binary.txt', Buffer.from([0]), /binary/], ['huge.pdf', Buffer.alloc(2097153), /2 MB/], ['long.md', 'a'.repeat(200001), /200,000/], ['empty.txt', '', /readable text/], ['bad.pdf', 'not a pdf', /extracted/], ['run.exe', 'text', /Choose a PDF/]]) {
    const { file } = await fixture(name, bytes);
    await assert.rejects(previewCourseDocument(file, sample().courses[0]), message);
  }
  await assert.rejects(previewCourseDocument('\\\\server\\share\\notes.pdf', sample().courses[0]), /network share/);
  await assert.rejects(previewCourseDocument('relative.txt', sample().courses[0]), /network share/);
  const abort = new AbortController(); abort.abort();
  await assert.rejects(previewCourseDocument('unused.txt', sample().courses[0], abort.signal), /abort/i);
});

test('PDF and Word imports use bounded extraction and retain visual limitations', async () => {
  for (const [name, bytes, limitation] of [['reading.pdf', pdf(), /no OCR/], ['reading.docx', await word('Read chapter 2. Extra work is optional.'), /tracked changes/]]) {
    const { file } = await fixture(name, bytes);
    const source = await previewCourseDocument(file, sample().courses[0]);
    assert.match(source.body, /optional/); assert.match(source.coverageNote, limitation);
    assert.equal(source.userProvided, true); assert.equal(source.observedAt, null);
  }
});

test('replacement and removal preserve factual state, clear outdated AI, and survive collection with original provenance', async () => {
  const { file } = await fixture('notes.txt', 'Read the current lecture notes before class.');
  const saved = sample();
  const source = await previewCourseDocument(file, saved.courses[0]);
  saved.aiGuide = { overview: [], courses: [], questions: [] }; saved.priorities = [{ sourceId: 'old-ai' }];
  const added = changeCourseDocument(saved, '1', { source, title: 'Notes', url: 'https://course.example/notes?token=private' });
  assert.equal(added.aiGuide, undefined); assert.deepEqual(added.priorities, []);
  assert.equal(added.courses[0].evidence.at(-1).sourceUrl, 'https://course.example/notes');
  const refreshed = reconcile([record], added, { origin, now: '2026-09-11T18:00:00Z', timeZone: added.timeZone });
  assert.deepEqual(refreshed.courses[0].evidence.find(item => item.userProvided), added.courses[0].evidence.at(-1));
  const replaced = changeCourseDocument(added, '1', { source: { ...source, id: 'new', body: 'Replacement text.' }, replaceId: source.id, title: 'Replacement' });
  assert.equal(replaced.courses[0].evidence.filter(item => item.userProvided).length, 1);
  assert.equal(replaced.courses[0].evidence.at(-1).id, source.id);
  const removed = changeCourseDocument(replaced, '1', { removeId: source.id });
  assert.equal(removed.courses[0].evidence.some(item => item.userProvided), false);
  assert.deepEqual(removed.items, saved.items);
  assert.throws(() => changeCourseDocument(added, '9', { source, title: 'Wrong course' }), /saved collection/);
  assert.throws(() => changeCourseDocument(added, '1', { removeId: 'foreign-id' }), /from this course/);
  for (const url of ['file:///private.txt', 'https://name:password@course.example/', 'https://canvas.example/courses/1/quizzes/2/take', 'relative']) assert.throws(() => changeCourseDocument(saved, '1', { source, title: 'Notes', url }), /HTTPS/);
  const crowded = { ...added, courses: [{ ...added.courses[0], evidence: Array.from({ length: 20 }, (_, i) => ({ ...source, id: `doc-${i}` })) }] };
  assert.throws(() => changeCourseDocument(crowded, '1', { source, title: 'One too many' }), /20 imported/);
});

test('document edits share account-scoped export rollback, preserve revisions, and cite offline AI sources', async () => {
  const { file, directory } = await fixture('notes.md', 'Optional preparation, not a new deadline.');
  const store = new GuideStore(path.join(directory, 'state'));
  const output = path.join(directory, 'output');
  const saved = await store.export(sample(), output, '1');
  const source = await previewCourseDocument(file, saved.courses[0]);
  const next = changeCourseDocument(saved, '1', { source, title: 'Notes' });
  const added = await store.export(next, output, '1');
  assert.equal((await store.load(origin, '1')).courses[0].evidence.at(-1).body, source.body);
  assert.equal(await store.load(origin, '2'), null);
  const abort = new AbortController(); abort.abort();
  await assert.rejects(store.export(changeCourseDocument(added, '1', { removeId: source.id }), output, '1', abort.signal), /abort/i);
  assert.equal((await store.load(origin, '1')).courses[0].evidence.at(-1).id, source.id);
  await fs.appendFile(added.evidencePath, '\nManual changes');
  await assert.rejects(store.export(changeCourseDocument(added, '1', { removeId: source.id }), output, '1'), /manual edits/);
  assert.equal((await store.load(origin, '1')).courses[0].evidence.at(-1).id, source.id);
  const ai = { ...added, aiGuide: { generatedAt: now, overview: [{ text: 'Review notes', sourceIds: [source.id] }], courses: [], questions: [] } };
  assert.match(weeklyMarkdown(ai).join('\n'), new RegExp(source.id));
  assert.doesNotMatch(weeklyMarkdown(ai).join('\n'), /<null>/);
});
