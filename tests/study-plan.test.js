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
  assert.ok(plan.tasks.filter(task => !task.unscheduled).every(task => task.suggestedDate >= guide.week.today && task.suggestedDate <= guide.week.end));
  assert.ok(plan.tasks.filter(task => task.dueAt && Date.parse(task.dueAt) > Date.parse(options.now)).every(task => task.suggestedDate <= localDate(task.dueAt, options.timeZone)));
  assert.ok(plan.checks.some(check => check.title.startsWith('Compare course update')));
  assert.ok(plan.checks.some(check => check.detail.includes('Module reads disabled')));
  const markdown = renderMarkdown(guide);
  assert.ok(markdown.indexOf('Recorded course work') < markdown.indexOf('This week and overdue'));
  assert.match(markdown, /not a complete workload/);
  assert.match(markdown, /Double-check/);
});

test('undated backlog stays complete without invented start dates or changing dated priorities', () => {
  const course = record();
  const baseline = buildGuide(reconcile([course], null, options));
  for (let id = 100; id < 130; id++) course.sources.assignments.push({ id, name: `Practice exam 2020 number ${id}`, due_at: null });
  course.sources.assignments.push({ id: 200, name: 'Undated closing soon', due_at: null, lock_at: '2026-09-11T18:00:00Z' });
  const guide = buildGuide(reconcile([course], null, options));
  const plan = guide.studyPlan;
  assert.equal(plan.reviewGroups.length, 1);
  assert.equal(plan.reviewGroups[0].tasks.length, 31);
  assert.ok(plan.reviewGroups[0].tasks.every(task => task.suggestedDate === null && task.needsVerification));
  assert.equal(plan.tasks.find(task => task.sourceId === '1:assignment:1').suggestedDate, baseline.studyPlan.tasks.find(task => task.sourceId === '1:assignment:1').suggestedDate);
  const closing = plan.tasks.find(task => task.sourceId === '1:assignment:200');
  assert.equal(closing.unscheduled, false);
  assert.equal(closing.suggestedDate, guide.week.today);
  assert.equal(closing.closesAt, '2026-09-11T18:00:00.000Z');
  assert.ok(plan.tasks.find(task => task.id.startsWith('course:')).steps.some(step => step.includes('31 items')));
  assert.ok(plan.reviewGroups[0].tasks.every(task => task.checks.some(check => check.title.startsWith('Confirm timing'))));
  assert.equal(plan.checks.some(check => check.title.includes('Practice exam 2020')), false);
  const markdown = renderMarkdown(guide);
  assert.doesNotMatch(markdown, /Suggested start:/);
  assert.ok(markdown.includes('Practice exam 2020 number 129'));
  assert.ok(!markdown.includes('Suggested start: null'));
  assert.match(markdown, /Available until:/);
  guide.priorities = [{ sourceId: '1:assignment:100', action: 'Do this today', reason: 'Unverified AI urgency', suggestedDate: guide.week.today, checks: ['Confirm applicability'], steps: [{ text: 'Read it', kind: 'suggested', quote: '' }] }];
  const ai = buildStudyPlan(guide).tasks.find(task => task.sourceId === '1:assignment:100');
  assert.equal(ai.suggestedDate, null);
  assert.ok(ai.steps.at(-1).conditional);
  assert.ok(ai.checks.some(check => check.detail === 'Confirm applicability'));
  assert.match(ai.title, /Check the next step/);
  course.sources.assignments.find(item => item.id === 100).due_at = '2026-09-12T18:00:00Z';
  const dated = buildGuide(reconcile([course], guide, options));
  const promoted = dated.studyPlan.tasks.find(task => task.id === ai.id);
  assert.equal(promoted.unscheduled, false);
  assert.equal(promoted.dueAt, '2026-09-12T18:00:00.000Z');
  const withProgress = buildStudyPlan(dated, { [ai.id]: { done: true, fingerprint: ai.fingerprint } });
  assert.equal(withProgress.tasks.find(task => task.id === ai.id).changedSinceDone, true);
});

test('no assignments still produces a weekly materials check without claiming no work exists', () => {
  const course = record(); course.sources.assignments = [];
  const guide = buildGuide(reconcile([course], null, options));
  assert.equal(guide.studyPlan.tasks.length, 1);
  assert.match(guide.studyPlan.tasks[0].reason, /even when Canvas lists no deadline/);
  const next = buildGuide(reconcile([course], null, { ...options, now: '2026-09-14T18:00:00Z' }));
  assert.notEqual(guide.studyPlan.tasks[0].id, next.studyPlan.tasks[0].id, 'Weekly materials checks must renew each week');
});

test('starting points cover each course, flag shared deadlines and advance after local completion', () => {
  const first = record();
  first.sources.assignments = [1, 2, 3].map(id => ({ id, name: `Deadline group ${id}`, due_at: '2026-09-18T18:00:00Z', submission: { workflow_state: 'unsubmitted' } }));
  const second = { id: '2', coverage: [], sources: { course: { name: 'Ethics', course_code: 'PHIL 1' }, assignments: [{ id: 10, name: 'Reading questions', due_at: '2026-09-17T15:00:00Z' }] } };
  const third = { id: '3', coverage: [], sources: { course: { name: 'Learning', course_code: 'DATA 1' }, assignments: [{ id: 20, name: 'Undated work' }] } };
  const guide = buildGuide(reconcile([first, second, third], null, options));
  const focus = guide.studyPlan.focus;
  assert.deepEqual(focus.map(item => item.courseId), ['2', '1', '3']);
  assert.match(focus[0].title, /Check the next step/);
  assert.equal(focus[1].sharedDeadlineCount, 3);
  assert.match(focus[1].deadlineNote, /3 outstanding items/);
  assert.equal(focus[2].dueAt, null);
  assert.match(focus[2].title, /materials/);
  const chosen = guide.studyPlan.tasks.find(task => task.id === focus[1].taskId);
  const changed = buildStudyPlan(guide, { [chosen.id]: { done: true, fingerprint: chosen.fingerprint } });
  assert.notEqual(changed.focus.find(item => item.courseId === '1').taskId, chosen.id);
  assert.equal(changed.focus.find(item => item.courseId === '1').sharedDeadlineCount, 3, 'Preparation completion does not mean submission');
  assert.ok(guide.items.every(item => item.status !== 'submitted'));
  const markdown = renderMarkdown(guide);
  assert.ok(markdown.indexOf('Recorded course work') < markdown.indexOf('This week and overdue'));
  assert.match(markdown, /3 outstanding items share this recorded due time/);
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
    assert.match(await fs.readFile(saved.outputPath, 'utf8'), /\[x\] Lab — preparation marked done/);
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
