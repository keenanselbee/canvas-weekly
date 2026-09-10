import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { weekOf, reconcile, buildGuide, sourceUrl } from '../src/guide.js';
import { GuideStore } from '../src/guide-store.js';

const options = { origin: 'https://canvas.example', now: '2026-09-10T18:00:00Z', timeZone: 'America/Vancouver' };
function record(dueAt = '2026-09-18T18:00:00Z') {
  return { id: '1', sources: { course: { name: 'Databases', course_code: 'CS 1' }, assignments: [{ id: 10, name: 'Practice', quiz_id: 20, due_at: dueAt, submission: { workflow_state: 'unsubmitted' } }], quizzes: [{ id: 20, assignment_id: 10, title: 'Practice', due_at: '2026-09-17T18:00:00Z', question_count: 5 }] }, coverage: [{ source: 'assignments', status: 'ok' }] };
}

test('weeks roll over on local Monday including DST boundaries', () => {
  assert.equal(weekOf('2026-09-14T06:59:00Z', 'America/Vancouver').start, '2026-09-07');
  assert.equal(weekOf('2026-09-14T07:00:00Z', 'America/Vancouver').start, '2026-09-14');
  assert.equal(weekOf('2026-11-02T07:59:00Z', 'America/Los_Angeles').start, '2026-10-26');
  assert.equal(weekOf('2026-11-02T08:00:00Z', 'America/Los_Angeles').start, '2026-11-02');
});

test('quiz metadata merges once with assignment-specific due date and null overrides', () => {
  const snapshot = reconcile([record()], null, options);
  assert.equal(snapshot.items.length, 1);
  assert.equal(snapshot.items[0].dueAt, '2026-09-18T18:00:00.000Z');
  assert.equal(snapshot.items[0].questionCount, 5);
  assert.equal(reconcile([record(null)], null, options).items[0].dueAt, null);
  assert.equal(reconcile([record()], snapshot, options).changes.length, 0);
});

test('failed assignment scan preserves override and missing items stay stale, not cancelled', () => {
  const previous = reconcile([record()], null, options);
  const failed = record(); delete failed.sources.assignments;
  const next = reconcile([failed], previous, options);
  assert.equal(next.items[0].dueAt, previous.items[0].dueAt);
  assert.equal(next.items[0].stale, true);
  const missing = record(); missing.sources.assignments = []; missing.sources.quizzes = [];
  assert.equal(reconcile([missing], previous, options).items[0].stale, true);
});

test('changed deadlines are reported and unsafe assessment/source credentials are not exported', () => {
  const previous = reconcile([record()], null, options);
  const next = reconcile([record('2026-09-19T18:00:00Z')], previous, options);
  assert.equal(next.changes.find(change => change.field === 'dueAt').before, previous.items[0].dueAt);
  assert.equal(sourceUrl('/courses/1/quizzes/20/take', options.origin, '/courses/1'), 'https://canvas.example/courses/1');
  assert.equal(sourceUrl('https://example.com/file?token=secret', options.origin, '/courses/1'), 'https://example.com/file');
});

test('same-week exports retain revisions and notes, reject manual edits and isolate accounts', async () => {
  await fs.mkdir('.codex-temp', { recursive: true });
  const directory = await fs.mkdtemp(path.resolve('.codex-temp/guide-'));
  try {
    const store = new GuideStore(path.join(directory, 'state'));
    const output = path.join(directory, 'output');
    const guide = buildGuide(reconcile([record()], null, options));
    const first = await store.export(guide, output, 'student1');
    const notesFile = path.join(output, guide.week.start, 'Student Notes.md');
    await fs.writeFile(notesFile, 'My own notes');
    await store.export({ ...guide, generatedAt: '2026-09-11T18:00:00Z' }, output, 'student1');
    assert.equal(await fs.readFile(notesFile, 'utf8'), 'My own notes');
    assert.equal((await fs.readdir(path.join(output, guide.week.start, 'Revisions'))).length, 1);
    assert.equal((await store.load(options.origin, 'student1')).outputPath, first.outputPath);
    assert.equal(await store.load(options.origin, 'student2'), null);
    await assert.rejects(store.export(guide, output, 'student2'), /another Canvas account/);
    await fs.writeFile(first.outputPath, 'Student edits');
    await assert.rejects(store.export(guide, output, 'student1'), /manual edits/);
    assert.equal(await fs.readFile(first.outputPath, 'utf8'), 'Student edits');
  } finally { await fs.rm(directory, { recursive: true, force: true }); }
});
