import test from 'node:test';
import assert from 'node:assert/strict';
import { courseRubricsRequest, parseCourseRubrics, collectCourseRubrics } from '../src/canvas-rubrics.js';
import { reconcile, buildGuide, renderMarkdown } from '../src/guide.js';
import { planningEvidence } from '../src/codex-client.js';

const response = () => ({ data: { course: { _id: '1', name: 'Example course', courseCode: 'EX 1', assignmentsConnection: {
  nodes: [{ _id: '20', courseId: '1', name: 'Design proposal', state: 'published', pointsPossible: 5, submissionTypes: ['online_upload'],
    rubric: { _id: '40', title: 'Proposal criteria', criteria: [{ _id: 'criterion-a', description: '<b>Requirements</b>', longDescription: 'Explain your design decisions.<script>private-code</script>' }] } }],
  pageInfo: { hasNextPage: false, endCursor: null },
} } } });
const assignments = [{ id: '20' }];

test('rubric selection copies criterion text without scores, assessments or embedded content', () => {
  const query = courseRubricsRequest('1');
  assert.doesNotMatch(query.query, /rubricAssessment|outcome|ratings|lockInfo|description\s*\{/);
  assert.throws(() => courseRubricsRequest('../1'));
  assert.throws(() => courseRubricsRequest('1', '\n'));
  const raw = response();
  raw.data.course.assignmentsConnection.nodes[0].rubric.criteria[0].ratings = [{ description: 'not-selected' }];
  const parsed = parseCourseRubrics(raw, '1');
  assert.equal(parsed.nodes[0].rubric.criteria[0].description, 'Requirements');
  assert.equal(parsed.nodes[0].rubric.criteria[0].longDescription, 'Explain your design decisions.');
  assert.doesNotMatch(JSON.stringify(parsed), /private-code|not-selected/);
  raw.data.course.assignmentsConnection.nodes[0].rubric = null;
  assert.equal(parseCourseRubrics(raw, '1').nodes[0].rubric, null);
});

test('rubric parsing rejects wrong courses, hidden assignments, partial errors and malformed criteria', () => {
  for (const mutate of [
    raw => { raw.data.course._id = '2'; },
    raw => { raw.data.course.assignmentsConnection.nodes[0].state = 'unpublished'; },
    raw => { raw.errors = [{ message: 'private-error' }]; },
    raw => { delete raw.data.course.assignmentsConnection.nodes[0].rubric; },
    raw => { raw.data.course.assignmentsConnection.nodes[0].rubric._id = 'x'; },
    raw => { raw.data.course.assignmentsConnection.nodes[0].rubric.criteria[0].longDescription = 'x'.repeat(65537); },
    raw => { raw.data.course.assignmentsConnection.nodes[0].rubric.criteria.push(raw.data.course.assignmentsConnection.nodes[0].rubric.criteria[0]); },
    raw => { raw.data.course.assignmentsConnection.pageInfo.hasNextPage = true; },
  ]) {
    const raw = response(); mutate(raw);
    assert.throws(() => parseCourseRubrics(raw, '1'), error => !error.message.includes('private-error'));
  }
});

test('rubric collection requires a complete matching assignment scan and rejects repeated pages', async () => {
  const page = parseCourseRubrics(response(), '1');
  const result = await collectCourseRubrics({ assignments, transport: { readCourseRubrics: async () => page } });
  assert.equal(result.coverage.status, 'partial');
  assert.equal(result.rubrics.length, 1);
  for (const value of [{ nodes: [], next: null }, { nodes: [{ ...page.nodes[0], assignmentId: '21' }], next: null }, { ...page, next: 'again' }]) {
    await assert.rejects(collectCourseRubrics({ assignments, transport: { readCourseRubrics: async () => value } }));
  }
  const calls = [];
  const paginated = await collectCourseRubrics({ assignments: [...assignments, { id: '21' }], transport: { readCourseRubrics: async cursor => {
    calls.push(cursor);
    return cursor === null ? { ...page, next: 'next' } : { nodes: [{ ...page.nodes[0], assignmentId: '21', rubric: null }], next: null };
  } } });
  assert.deepEqual(calls, [null, 'next']);
  assert.equal(paginated.rubrics.length, 2);
  const abort = new AbortController(); abort.abort();
  await assert.rejects(collectCourseRubrics({ assignments, signal: abort.signal, transport: {} }), { name: 'AbortError' });
  const empty = await collectCourseRubrics({ assignments: [], transport: {} });
  assert.deepEqual(empty.rubrics, []);
});

test('rubric text enriches the guide and AI evidence while failed or empty reads preserve prior criteria as stale', async () => {
  const collected = await collectCourseRubrics({ assignments, transport: { readCourseRubrics: async () => parseCourseRubrics(response(), '1') } });
  const options = { origin: 'https://canvas.example', timeZone: 'UTC', now: '2026-09-11T18:00:00Z' };
  const record = { id: '1', sources: { rubrics: collected.rubrics }, coverage: [collected.coverage] };
  const snapshot = reconcile([record], null, options);
  const guide = buildGuide(snapshot, options.now);
  assert.match(renderMarkdown(guide), /Explain your design decisions/);
  assert.match(renderMarkdown(guide), /Review the full rubric/);
  const evidence = planningEvidence(guide).sources[0];
  assert.equal(evidence.kind, 'rubric');
  assert.equal(evidence.partial, true);
  assert.match(evidence.coverageNote, /Rating levels/);
  for (const rubrics of [undefined, [{ assignmentId: '20', rubric: null }]]) {
    const next = reconcile([{ ...record, sources: { rubrics } }], snapshot, { ...options, now: '2026-09-12T18:00:00Z' });
    assert.equal(next.courses[0].evidence[0].stale, true);
    assert.equal(next.courses[0].evidence[0].observedAt, options.now);
  }
});
