import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { reconcile, buildGuide, renderMarkdown } from '../src/guide.js';
import { GuideStore } from '../src/guide-store.js';
import { localDate } from '../src/dates.js';
import { buildStudyPlan } from '../src/study-plan.js';

const options = { origin: 'https://canvas.example', now: '2026-09-10T18:00:00Z', timeZone: 'America/Vancouver' };
const record = () => ({ id: '1', coverage: [{ source: 'modules', status: 'unsupported', message: 'Module reads disabled.' }], sources: {
  course: { name: 'Databases', course_code: 'CS 1' },
  assignments: [
    { id: 1, name: 'Lab', due_at: '2026-09-18T18:00:00Z', description: '<p>Read the notes.</p>', submission: { workflow_state: 'unsubmitted' } },
    { id: 2, name: 'Undated exercise', due_at: null },
    { id: 3, name: 'Closed quiz', quiz_id: 4, due_at: '2026-09-09T18:00:00Z', lock_at: '2026-09-09T18:00:00Z', submission: { workflow_state: 'unsubmitted' } },
    { id: 5, name: 'Submitted work', due_at: '2026-09-18T18:00:00Z', submission: { workflow_state: 'submitted' } },
  ],
  conversation: [{ id: '6', data: { subject: 'Deadline update', messages: [{ id: 7, body: 'An extension may apply. A second try is optional.' }] } }],
} });

test('study plan includes preparation, honest uncertainties and suggested days without replacing deadlines', () => {
  const guide = buildGuide(reconcile([record()], null, options));
  const plan = guide.studyPlan;
  assert.equal(plan.tasks.some(task => task.title.includes('Submitted work')), false);
  assert.match(plan.tasks.find(task => task.sourceId === '1:assignment:3').reason, /availability window has ended/);
  assert.match(plan.tasks.find(task => task.sourceId === '1:assignment:2').reason, /Confirm whether this item requires action/);
  assert.equal(guide.items.find(item => item.assignmentId === '1').dueAt, '2026-09-18T18:00:00.000Z');
  assert.ok(plan.tasks.every(task => task.suggestedDate >= guide.week.today && task.suggestedDate <= guide.week.end));
  assert.ok(plan.tasks.filter(task => task.dueAt && Date.parse(task.dueAt) > Date.parse(options.now)).every(task => task.suggestedDate <= localDate(task.dueAt, options.timeZone)));
  assert.ok(plan.checks.some(check => check.title.startsWith('Compare instructor update')));
  assert.ok(plan.checks.some(check => check.detail.includes('Module reads disabled')));
  const markdown = renderMarkdown(guide);
  assert.ok(markdown.indexOf('Your study plan') < markdown.indexOf('This week and overdue'));
  assert.match(markdown, /not a timetable or new course deadlines/);
  assert.match(markdown, /Double-check/);
});

test('no assignments still produces a weekly materials check without claiming no work exists', () => {
  const course = record(); course.sources.assignments = [];
  const guide = buildGuide(reconcile([course], null, options));
  assert.equal(guide.studyPlan.tasks.length, 1);
  assert.match(guide.studyPlan.tasks[0].reason, /even when Canvas lists no deadline/);
  const next = buildGuide(reconcile([course], null, { ...options, now: '2026-09-14T18:00:00Z' }));
  assert.notEqual(guide.studyPlan.tasks[0].id, next.studyPlan.tasks[0].id, 'Weekly materials checks must renew each week');
});

test('AI steps enrich supported preparation while verification tasks and recorded dates remain intact', () => {
  const guide = buildGuide(reconcile([record()], null, options));
  const priority = { sourceId: '1:assignment:1', action: 'Practice identifying keys', reason: 'Prepare for the lab.', suggestedDate: '2026-09-11', checks: ['Confirm the assigned chapter.'], steps: [{ text: 'Review your key examples.', kind: 'suggested', quote: '' }] };
  guide.priorities = [priority, { ...priority, sourceId: '1:assignment:3', action: 'Take the closed quiz' }];
  const plan = buildStudyPlan(guide);
  assert.equal(plan.tasks.find(task => task.sourceId === priority.sourceId).title, priority.action);
  assert.equal(plan.tasks.find(task => task.sourceId === priority.sourceId).dueAt, '2026-09-18T18:00:00.000Z');
  assert.match(plan.tasks.find(task => task.sourceId === '1:assignment:3').title, /Check the next step/);
  assert.ok(plan.checks.some(check => check.detail === 'Confirm the assigned chapter.'));
});

test('local completion survives refresh and restart, reopens on changed requirements, and stays account isolated', async () => {
  await fs.mkdir('.codex-temp', { recursive: true });
  const directory = await fs.mkdtemp(path.resolve('.codex-temp/study-plan-'));
  try {
    const store = new GuideStore(path.join(directory, 'state'));
    const output = path.join(directory, 'output');
    const guide = buildGuide(reconcile([record()], null, options));
    await store.export(guide, output, 'student1');
    const id = '1:assignment:1:prepare';
    const marked = await store.setTaskDone(options.origin, 'student1', id, true);
    assert.equal(marked.studyPlan.tasks.find(task => task.id === id).done, true);
    assert.equal(marked.items.find(item => item.assignmentId === '1').status, 'not-submitted');
    assert.equal((await new GuideStore(path.join(directory, 'state')).load(options.origin, 'student1')).studyPlan.tasks.find(task => task.id === id).done, true);
    const saved = await store.export(guide, output, 'student1');
    assert.match(await fs.readFile(saved.outputPath, 'utf8'), /\[x\] \*\*Prepare for Lab/);
    await assert.rejects(store.setTaskDone(options.origin, 'student2', id, true), /saved guide/);
    await assert.rejects(store.setTaskDone(options.origin, 'student1', '../../other', true), /saved guide/);
    const edited = record(); edited.sources.assignments[0].description = '<p>Read the NEW notes.</p>';
    const changed = buildGuide(reconcile([edited], guide, options));
    const refreshed = await store.export(changed, output, 'student1');
    const task = refreshed.studyPlan.tasks.find(task => task.id === id);
    assert.equal(task.done, false);
    assert.equal(task.changedSinceDone, true);
  } finally {
    assert.equal(path.dirname(directory), path.resolve('.codex-temp'));
    await fs.rm(directory, { recursive: true });
  }
});
