import test from 'node:test';
import assert from 'node:assert/strict';
import { validateWeeklyGuide } from '../src/weekly-output.js';
import { plannerEvidence } from '../src/evidence-pack.js';
import { buildGuide, reconcile, renderMarkdown } from '../src/guide.js';
import { buildStudyPlan } from '../src/study-plan.js';
import { weeklyView } from '../src/weekly-view.js';
import { renderHtml } from '../src/guide-html.js';
import { renderWord } from '../src/guide-word.js';
import JSZip from 'jszip';

function fixture() {
  const guide = buildGuide(reconcile(['1', '2'].map(id => ({ id, coverage: [], sources: {
    course: { name: `Course ${id}`, course_code: `DEMO ${id}` }, assignments: [{ id: 10, name: 'Lab', due_at: '2026-09-12T18:00:00Z',
      description: '<p>Read chapter 2 before the lab. Extra exercises are optional.</p>', submission: { workflow_state: 'unsubmitted' } }],
  } })), null, { origin: 'https://canvas.example', now: '2026-09-10T18:00:00Z', timeZone: 'America/Vancouver' }));
  const output = { overview: [{ text: 'Prepare for the two labs due together.', sourceIds: guide.items.map(item => item.id) }],
    courses: guide.courses.map(course => ({ courseId: course.id, focus: 'Review the concepts, then prepare your questions.', tasks: [{
      sourceId: `${course.id}:assignment:10`, action: 'Prepare for the lab', reason: 'Read before applying the concepts.', suggestedDate: null, checks: [],
      steps: [{ text: 'Read chapter 2.', kind: 'required', quote: 'Read chapter 2 before the lab.' }, { text: 'Try exercises if helpful.', kind: 'optional', quote: 'Extra exercises are optional.' }],
    }] })), questions: [{ text: 'How much study time do you have?', sourceIds: ['course:1', 'course:2'] }] };
  return { guide, output, evidence: plannerEvidence(guide) };
}

test('weekly output accounts for every course and validates source, quote and suggested date boundaries', () => {
  const { output, evidence } = fixture();
  assert.equal(validateWeeklyGuide(output, evidence).courses.length, 2);
  for (const mutate of [
    value => value.courses.pop(),
    value => { value.courses[0].tasks[0].sourceId = '2:assignment:10'; },
    value => { value.courses[0].tasks[0].steps[0].quote = 'Invented course requirement.'; },
    value => { value.courses[0].tasks[0].suggestedDate = '2026-09-13'; },
    value => { value.overview[0].sourceIds = ['invented']; },
  ]) {
    const bad = structuredClone(output); mutate(bad);
    assert.throws(() => validateWeeklyGuide(bad, evidence));
  }
  evidence.items[0].authorRoleUnverified = true;
  assert.throws(() => validateWeeklyGuide(output, evidence), /unverified message/);
});

test('AI view and exports retain source deadlines, optional wording, uncertainty and local task changes', async () => {
  const { guide, output, evidence } = fixture();
  guide.aiGuide = { ...validateWeeklyGuide(output, evidence), generatedAt: '2026-09-11T18:00:00Z' };
  guide.priorities = guide.aiGuide.courses.flatMap(course => course.tasks);
  guide.items[0].availabilityStale = true;
  guide.studyPlan = buildStudyPlan(guide);
  const view = weeklyView(guide);
  assert.equal(view.courses[0].tasks[0].suggestedDate, null);
  assert.match(view.courses[0].tasks[0].recorded.join(' '), /Recorded due/);
  assert.match(view.courses[0].tasks[0].checks.join(' '), /opening and closing dates/);
  const zip = await JSZip.loadAsync(await renderWord(guide));
  for (const rendered of [renderMarkdown(guide), renderHtml(guide), await zip.file('word/document.xml').async('string')]) {
    assert.match(rendered, /Your AI weekly guide/);
    assert.match(rendered, /two labs due together/);
    assert.match(rendered, /Extra exercises are optional/);
    assert.match(rendered, /opening and closing dates/);
    assert.doesNotMatch(rendered, /Suggested study day:/, 'No invented date for a null AI suggestion');
  }
  assert.doesNotMatch(renderHtml(guide), /id="print-overview"/, 'Legacy print summary must not hide the AI overview');
  const task = guide.studyPlan.tasks.find(task => task.sourceId === '1:assignment:10');
  const progress = { [task.id]: { done: true, fingerprint: task.fingerprint } };
  assert.equal(buildStudyPlan(guide, progress).tasks.find(item => item.id === task.id).done, true);
  guide.aiGuide.courses[0].tasks[0].checks.push('Confirm the room.');
  assert.equal(buildStudyPlan(guide, progress).tasks.find(item => item.id === task.id).changedSinceDone, true);
});
