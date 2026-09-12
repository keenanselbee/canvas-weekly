import test from 'node:test';
import assert from 'node:assert/strict';
import { buildGuide, reconcile, renderMarkdown } from '../src/guide.js';
import { factualOverview } from '../src/factual-overview.js';

test('factual overview counts all records, separates unknown status and preserves shared dates after local completion', () => {
  const assignments = [
    { id: 1, name: 'Earlier work', due_at: '2026-09-09T18:00:00Z' },
    { id: 2, name: 'Same deadline', due_at: '2026-09-09T18:00:00Z' },
    { id: 3, name: 'Next week', due_at: '2026-09-18T18:00:00Z' },
    { id: 4, name: 'Future work', due_at: '2026-11-18T18:00:00Z' },
    { id: 5, name: 'Practice material', due_at: null },
    { id: 6, name: 'Submitted', due_at: '2026-09-08T18:00:00Z', submission: { workflow_state: 'submitted' } },
  ];
  const options = { origin: 'https://canvas.example', now: '2026-09-10T18:00:00Z', timeZone: 'America/Vancouver' };
  const guide = buildGuide(reconcile([
    { id: '1', coverage: [{ source: 'instructions', status: 'unsupported' }], sources: { course: { name: 'Databases' }, assignments } },
    { id: '2', coverage: [], sources: { course: { name: 'Readings only' }, assignments: [] } },
  ], null, options), options.now);
  guide.items[0].dueDateStale = true;
  const overview = factualOverview(guide);
  assert.deepEqual(overview.courses[0].counts, { total: 6, current: 2, upcoming: 1, undated: 1, later: 1, submitted: 1, unknown: 5, stale: 1 });
  assert.equal(overview.courses[0].next.sharedDeadlineCount, 2);
  assert.equal(overview.courses[0].coverageGaps, 1);
  assert.equal(overview.courses[1].next, null);
  assert.match(overview.note, /not a complete workload/);
  guide.studyPlan.tasks.forEach(task => { task.done = true; });
  assert.deepEqual(factualOverview(guide), overview, 'Local preparation never changes recorded workload counts');
  const markdown = renderMarkdown(guide);
  assert.match(markdown, /^# Course reference/);
  assert.match(markdown, /2 outstanding items share this recorded due time/);
  assert.match(markdown, /Last-known date; recheck/);
  assert.match(markdown, /Local preparation record/);
  assert.doesNotMatch(markdown, /Suggested start:|Suggested preparation|Full preparation checklist/);
  assert.match(markdown, /Practice material/);
  assert.match(markdown, /No outstanding dated item in this window was collected/);
});
