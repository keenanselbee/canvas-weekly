import test from 'node:test';
import assert from 'node:assert/strict';
import { factualTask } from '../src/factual-task.js';
import { buildStudyPlan } from '../src/study-plan.js';
import { buildGuide, reconcile, renderMarkdown } from '../src/guide.js';
import { renderHtml } from '../src/guide-html.js';
import { renderWord } from '../src/guide-word.js';
import JSZip from 'jszip';

function guide() {
  return buildGuide(reconcile([{ id: '1', coverage: [], sources: {
    course: { name: 'Databases', course_code: 'CS 1' },
    assignments: [{ id: 10, name: 'Lab', due_at: '2026-09-12T18:00:00Z',
      description: '<p>Submit a PDF only if you chose option A. Option B needs no upload. The example report is optional.</p>',
      submission: { workflow_state: 'unsubmitted' } }],
  } }], null, { origin: 'https://canvas.example', now: '2026-09-10T18:00:00Z', timeZone: 'America/Vancouver' }));
}

test('factual preparation keeps fresh dates and status visible beside a specific availability gap', () => {
  const value = guide();
  value.items[0].availabilityStale = true;
  const task = buildStudyPlan(value).tasks.find(task => task.sourceId === value.items[0].id);
  assert.equal(task.title, 'Prepare for Lab');
  assert.equal(task.dueAt, value.items[0].dueAt);
  assert.equal(task.needsVerification, true, 'AI must still respect the missing field');
  assert.deepEqual(task.posted.needs, ['opening and closing dates']);
  assert.match(task.posted.facts[0], /Not submitted/);
  assert.match(task.reason, /opening and closing dates/);
});

test('complete source passages preserve optional wording and conditions across factual exports', async () => {
  const value = guide();
  const task = value.studyPlan.tasks.find(task => task.sourceId === value.items[0].id);
  assert.equal(task.posted.sources[0].text, value.items[0].instructions);
  assert.equal(task.posted.sources[0].sourceId, value.items[0].id);
  const word = await JSZip.loadAsync(await renderWord(value));
  const xml = await word.file('word/document.xml').async('string');
  for (const output of [renderMarkdown(value), renderHtml(value), xml]) {
    assert.match(output, /Submit a PDF only if you chose option A/);
    assert.match(output, /Option B needs no upload/);
    assert.match(output, /example report is optional/);
    assert.match(output, /Recorded information/);
    assert.match(output, /Suggested preparation/);
  }
  assert.match(await word.file('word/_rels/document.xml.rels').async('string'), /https:\/\/canvas.example\/courses\/1\/assignments\/10/);
  const long = factualTask({ ...value.items[0], instructions: 'Important context. '.repeat(100) + 'No upload is required.' });
  assert.equal(long.sources[0].text, '', 'Do not excerpt an early requirement while omitting a later exception');
  assert.match(long.sources[0].note, /full text/);
});

test('all collected course material changes invalidate local preparation without timestamp churn', () => {
  const value = guide();
  value.courses[0].evidence = [1, 2].map(id => ({ id: `1:website:${id}`, courseId: '1', kind: 'website', title: `Lecture ${id}`,
    body: `Posted lecture ${id}.`, sourceUrl: `https://course.example/lecture-${id}`, observedAt: value.generatedAt, stale: false }));
  let plan = buildStudyPlan(value);
  const task = plan.tasks.find(task => task.id.startsWith('course:'));
  assert.equal(task.posted.sources.length, 2);
  assert.match(task.posted.sources[1].note, /not an assigned-reading determination/);
  const progress = { [task.id]: { done: true, fingerprint: task.fingerprint } };
  value.courses[0].evidence[1].observedAt = '2026-09-11T18:00:00Z';
  assert.equal(buildStudyPlan(value, progress).tasks.find(t => t.id === task.id).done, true);
  value.courses[0].evidence[1].body = 'Updated lecture requirements.';
  plan = buildStudyPlan(value, progress);
  assert.equal(plan.tasks.find(t => t.id === task.id).changedSinceDone, true);
  value.courses[0].evidence[1].stale = true;
  assert.equal(buildStudyPlan(value).tasks.find(t => t.id === task.id).posted.sources[1].stale, true);
});
