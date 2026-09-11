import test from 'node:test';
import assert from 'node:assert/strict';
import { metadataRecord } from '../src/canvas-metadata.js';
import { reconcile, buildGuide, renderMarkdown } from '../src/guide.js';
import { renderHtml } from '../src/guide-html.js';
import { buildStudyPlan } from '../src/study-plan.js';
import { planningEvidence } from '../src/codex-client.js';

const first = { origin: 'https://canvas.example', now: '2026-09-09T18:00:00Z', timeZone: 'America/Vancouver' };
const refresh = { ...first, now: '2026-09-10T18:00:00Z' };
const again = { ...first, now: '2026-09-10T20:00:00Z' };
function original() {
  return { id: '1', sources: { course: { name: 'Old name', course_code: 'CS 1', syllabus_body: '<p>Readings are required before class.</p>' },
    assignments: [{ id: 10, name: 'Preparation', quiz_id: 20, points_possible: 5, due_at: '2026-09-17T18:00:00Z',
      lock_at: '2026-09-18T18:00:00Z', description: '<p>Read chapter 2 and explain the main concepts.</p>',
      submission_types: ['online_quiz'], submission: { workflow_state: 'unsubmitted' } }],
    quizzes: [{ id: 20, assignment_id: 10, title: 'Preparation', question_count: 5, time_limit: 30, allowed_attempts: 2 }],
  }, coverage: [{ source: 'assignments', status: 'ok' }] };
}
function metadata() {
  return { course: { id: '1', name: 'New course name', code: 'CS 1' },
    assignments: [{ id: '10', courseId: '1', name: 'Preparation', state: 'published', points: 10,
      dueAt: '2026-09-18T18:00:00.000Z', closesAt: null, opensAt: null, submissionTypes: ['online_quiz'] }],
    submissions: [{ id: '100', assignmentId: '10', state: 'unsubmitted' }] };
}

test('fresh metadata updates overrides without erasing or refreshing old instructions and syllabus', () => {
  const previous = reconcile([original()], null, first);
  const next = reconcile([metadataRecord(metadata())], previous, refresh);
  assert.equal(next.items.length, 1);
  const item = next.items[0];
  assert.equal(item.dueAt, '2026-09-18T18:00:00.000Z');
  assert.equal(item.closesAt, null, 'A fresh explicit null override replaces the old closing date');
  assert.equal(item.points, 10);
  assert.equal(item.stale, false);
  assert.equal(item.observedAt, refresh.now);
  assert.equal(item.instructions, previous.items[0].instructions);
  assert.equal(item.instructionsStale, true);
  assert.equal(item.instructionsObservedAt, first.now);
  assert.equal(item.questionCount, 5);
  assert.equal(item.quizDetailsStale, true);
  assert.equal(item.quizDetailsObservedAt, first.now);
  assert.equal(item.sourceUrl, 'https://canvas.example/courses/1/assignments/10');
  assert.equal(next.courses[0].name, 'New course name');
  assert.equal(next.courses[0].syllabus, previous.courses[0].syllabus);
  assert.equal(next.courses[0].evidence.find(source => source.kind === 'syllabus').stale, true);
  assert.equal(next.changes.some(change => change.field === 'instructions'), false);
  assert.ok(next.changes.some(change => change.field === 'dueAt'));
});

test('repeat metadata updates preserve original field ages and do not fabricate changes', () => {
  const originalSnapshot = reconcile([original()], null, first);
  // Old saved guides predate the field-specific timestamps.
  delete originalSnapshot.items[0].instructionsObservedAt;
  delete originalSnapshot.items[0].quizDetailsObservedAt;
  const once = reconcile([metadataRecord(metadata())], originalSnapshot, refresh);
  const twice = reconcile([metadataRecord(metadata())], once, again);
  assert.equal(twice.items[0].instructionsObservedAt, first.now);
  assert.equal(twice.items[0].quizDetailsObservedAt, first.now);
  assert.equal(twice.items[0].observedAt, again.now);
  assert.deepEqual(twice.changes, []);
  once.items[0].instructionsObservedAt = null;
  once.items[0].quizDetailsObservedAt = null;
  const unknownAge = reconcile([metadataRecord(metadata())], once, again);
  assert.equal(unknownAge.items[0].instructionsObservedAt, null, 'Unknown copy age must not become a metadata observation time');
  assert.equal(unknownAge.items[0].quizDetailsObservedAt, null);
});

test('missing and ungraded submission states remain unknown and unmatched records invent no work', () => {
  const saved = original(); saved.sources.assignments[0].submission.workflow_state = 'submitted';
  const previous = reconcile([saved], null, first);
  for (const submissions of [[], [{ id: '100', assignmentId: '10', state: 'ungraded' }], [{ id: '101', assignmentId: '999', state: 'unsubmitted' }]]) {
    const input = metadataRecord({ ...metadata(), submissions });
    const next = reconcile([input], previous, refresh);
    assert.equal(next.items.length, 1);
    assert.equal(next.items[0].assignmentId, '10');
    assert.equal(next.items[0].status, 'unknown');
    assert.equal(input.coverage.find(source => source.source === 'submission states').status, 'partial');
    assert.equal(buildGuide(next).studyPlan.checks.some(check => check.title.startsWith('Confirm status:')), true);
  }
});

test('new metadata items expose coverage gaps and missing assignments remain last-known', () => {
  const previous = reconcile([original()], null, first);
  const empty = metadataRecord({ ...metadata(), assignments: [], submissions: [] });
  const missing = reconcile([empty], previous, refresh);
  assert.equal(missing.items[0].stale, true);
  assert.equal(missing.items[0].observedAt, first.now);
  const fresh = reconcile([metadataRecord(metadata())], null, refresh);
  assert.equal(fresh.items[0].type, 'quiz');
  assert.equal(fresh.items[0].instructions, '');
  assert.equal(fresh.items[0].instructionsObservedAt, null);
  assert.equal(fresh.items[0].quizId, null);
  assert.equal(fresh.items[0].questionCount, undefined);
  assert.equal(fresh.courses[0].evidence.length, 0);
  assert.equal(fresh.courses[0].coverage.filter(source => source.status === 'unsupported').length, 3);
  const ambiguous = metadata(); ambiguous.submissions.push({ id: '101', assignmentId: '10', state: 'submitted' });
  assert.throws(() => metadataRecord(ambiguous), /Ambiguous/);
});

test('quiz-only historical records keep their task identity when assignment metadata arrives', () => {
  const record = original(); delete record.sources.assignments;
  record.sources.quizzes[0].description = 'Old quiz instructions';
  const previous = reconcile([record], null, first);
  const next = reconcile([metadataRecord(metadata())], previous, refresh);
  assert.equal(next.items.length, 1);
  assert.equal(next.items[0].id, previous.items[0].id);
  assert.equal(next.items[0].assignmentId, '10');
  assert.equal(next.items[0].quizId, '20');
  assert.equal(next.items[0].instructions, 'Old quiz instructions');
  assert.equal(next.items[0].instructionsObservedAt, first.now);
});

test('field gaps reach study checks, AI evidence and exported guides with conditional suggestions', () => {
  const previous = reconcile([original()], null, first);
  const next = reconcile([metadataRecord(metadata())], previous, refresh);
  const guide = buildGuide(next);
  const task = guide.studyPlan.tasks.find(task => task.sourceId === next.items[0].id);
  assert.equal(task.needsVerification, true);
  assert.ok(guide.studyPlan.checks.some(check => check.title.startsWith('Recheck instructions:')));
  const evidence = planningEvidence(guide).items[0];
  assert.equal(evidence.instructionsStale, true);
  assert.equal(evidence.instructionsObservedAt, first.now);
  assert.equal(evidence.stale, false, 'Fresh metadata and old instructions must stay distinguishable');
  guide.priorities = [{ sourceId: task.sourceId, action: 'Read chapter 2', reason: 'Prepare concepts',
    steps: [{ kind: 'required', text: 'Read chapter 2', quote: 'Read chapter 2 and explain the main concepts.' }] }];
  guide.studyPlan = buildStudyPlan(guide);
  assert.equal(guide.studyPlan.tasks.find(task => task.sourceId === evidence.id).steps.at(-1).conditional, true);
  const markdown = renderMarkdown(guide);
  assert.match(markdown, /Assignment metadata refreshed; instructions not rechecked/);
  assert.match(markdown, /Instructions are last-known information, observed Sep 9, 2026/);
  assert.match(markdown, /Quiz details are last-known information/);
  assert.match(renderHtml(guide), /Recheck instructions: Preparation/);
});

test('new verification needs reopen local tasks once while unchanged metadata refreshes preserve completion', () => {
  const previous = reconcile([original()], null, first);
  const oldPlan = buildGuide(previous).studyPlan;
  const oldTask = oldPlan.tasks.find(task => task.sourceId === previous.items[0].id);
  const next = reconcile([metadataRecord(metadata())], previous, refresh);
  const guide = buildGuide(next);
  const changed = buildStudyPlan(guide, { [oldTask.id]: { done: true, fingerprint: oldTask.fingerprint } }).tasks.find(task => task.id === oldTask.id);
  assert.equal(changed.done, false);
  assert.equal(changed.changedSinceDone, true);
  const repeated = buildGuide(reconcile([metadataRecord(metadata())], next, again));
  const retained = buildStudyPlan(repeated, { [changed.id]: { done: true, fingerprint: changed.fingerprint } }).tasks.find(task => task.id === changed.id);
  assert.equal(retained.done, true);
  assert.equal(retained.changedSinceDone, false);
});

test('a later full instruction source clears field staleness without retaining old text', () => {
  const previous = reconcile([original()], null, first);
  const partial = reconcile([metadataRecord(metadata())], previous, refresh);
  const fresh = original(); fresh.sources.assignments[0].description = '<p>Read chapter 3 instead.</p>';
  const next = reconcile([fresh], partial, again);
  assert.equal(next.items[0].instructions, 'Read chapter 3 instead.');
  assert.equal(next.items[0].instructionsStale, false);
  assert.equal(next.items[0].instructionsObservedAt, again.now);
  assert.equal(next.items[0].quizDetailsStale, false);
  assert.equal(next.items[0].metadataOnly, undefined);
  assert.ok(next.changes.some(change => change.field === 'instructions'));
});
