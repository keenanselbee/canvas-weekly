import test from 'node:test';
import assert from 'node:assert/strict';
import { metadataRequest, permittedMetadataBody, parseMetadataPage, parseMetadataDate, collectMetadata, metadataRecord } from '../src/canvas-metadata.js';
import { CanvasNetwork } from '../src/canvas-network.js';

const assignment = (id = '10') => ({ _id: id, courseId: '1', name: 'Reading questions', state: 'published', pointsPossible: 5,
  submissionTypes: ['online_quiz'] });
const response = (operation, nodes, next = null) => ({ data: { course: { _id: '1', name: 'Example course', courseCode: 'DEMO 1',
  [`${operation}Connection`]: { nodes, pageInfo: { hasNextPage: next !== null, endCursor: next } } } } });

test('metadata bodies bind exact fields, course and student without accepting general GraphQL', async () => {
  for (const operation of ['assignments']) {
    const request = metadataRequest(operation, '1', '99');
    const body = JSON.stringify(request);
    assert.equal(permittedMetadataBody(body, '1', '99'), true);
    assert.doesNotMatch(request.query, /description|lockInfo|body|commentsConnection|attempt|mutation|moduleProgress/);
    for (const change of [
      value => { value.query += '\nmutation { submitAssignment }'; },
      value => { value.query = value.query.replace('_id', '_id description'); },
      value => { value.variables.courseId = '2'; },
      value => { value.variables.userId = '100'; },
      value => { value.operationName = 'Other'; },
      value => { value.extensions = {}; },
    ]) {
      const altered = structuredClone(request); change(altered);
      assert.equal(permittedMetadataBody(JSON.stringify(altered), '1', '99'), false);
    }
    assert.equal(permittedMetadataBody(body.replace('"after":null', '"after":"cursor","after":null'), '1', '99'), false);
  }
  assert.throws(() => metadataRequest('submissions', '1', '99'));
  assert.match(metadataRequest('assignments', '1', '99').query, /gradingPeriodId: null/);
  for (const operation of ['mutation', '__proto__', 'constructor']) assert.throws(() => metadataRequest(operation, '1', '99'));
  for (const cursor of ['', '\n', 'x'.repeat(1025), 1, {}]) assert.throws(() => metadataRequest('assignments', '1', '99', cursor));
  assert.throws(() => metadataRequest('assignments', '../1', '99'));
  // Building this candidate must not enable the production POST route.
  const gate = new CanvasNetwork({ origin: () => 'https://canvas.example', loginContentsId: () => null, fetcher: () => assert.fail('No transport allowed') });
  await assert.rejects(gate.fetch('https://canvas.example/api/graphql', { method: 'POST', redirect: 'manual', body: JSON.stringify(metadataRequest('assignments', '1', '99')) }), /not permitted/);
});

test('metadata parsing uses stored student dates and discards assignment override dates', () => {
  const input = response('assignments', [{ ...assignment(), dueAt: 'unrequested date', lockAt: 'unrequested date', description: 'private-body' }]);
  const page = parseMetadataPage(input, 'assignments', '1');
  assert.doesNotMatch(JSON.stringify(page), /dueAt|closesAt|opensAt|private-body|unrequested/);
  assert.equal(parseMetadataDate('2026-09-18T23:59:00-07:00'), '2026-09-19T06:59:00.000Z');
  for (const invalid of ['Tuesday', '2026-02-30T01:00:00Z', '2026-09-18T24:00:00Z', '2026-09-18T10:00:00', undefined]) {
    assert.throws(() => parseMetadataDate(invalid), /invalid metadata date/);
  }
  assert.equal(parseMetadataDate(null), null);
  const request = metadataRequest('assignments', '1', '99');
  assert.doesNotMatch(request.query, /dueAt|lockAt|unlockAt/);
  assert.equal(permittedMetadataBody(JSON.stringify({ ...request, query: request.query.replace('pointsPossible', 'pointsPossible dueAt lockAt unlockAt') }), '1', '99'), false);
});

test('HTTP-success-shaped GraphQL errors, null nodes and wrong course data fail closed', () => {
  for (const input of [
    { errors: [{ message: 'private-server-detail' }], ...response('assignments', [assignment()]) },
    { data: { course: null } },
    response('assignments', [null]),
    response('assignments', [{ ...assignment(), courseId: '2' }]),
    response('assignments', [{ ...assignment(), state: 'unpublished' }]),
    response('assignments', [assignment(), assignment()]),
    response('assignments', [], 'cursor'),
    response('submissions', [{ _id: '20', assignmentId: '10', state: 'deleted' }]),
  ]) {
    assert.throws(() => parseMetadataPage(input, input.data?.course?.submissionsConnection ? 'submissions' : 'assignments', '1'), error => !error.message.includes('private-server-detail'));
  }
  const wrong = response('assignments', []); wrong.data.course._id = '2';
  assert.throws(() => parseMetadataPage(wrong, 'assignments', '1'), /unavailable or incomplete/);
});

// Parsed-page fixture mirrors the narrow transport contract. Raw byte limits
// and authentication failures are exercised by the transport/network tests.
function transportFixture({ page, submission, budget = 200 } = {}) {
  const calls = [];
  let remaining = budget;
  return { calls, transport: {
    get remainingRequests() { return remaining; },
    async readAssignmentPage(after, signal) {
      calls.push(['assignments', after]); remaining--;
      return parseMetadataPage(await (page?.(after, signal) ?? response('assignments', [assignment()])), 'assignments', '1');
    },
    async readOwnSubmission(id, signal) {
      calls.push(['submission', id]); remaining--;
      return submission ? submission(id, signal) : { id: '20', assignmentId: id, state: 'submitted', cachedDueDate: null };
    },
  } };
}
const collect = (transport, signal) => collectMetadata({ courseId: '1', studentId: '99', transport, signal });

test('collector finishes assignment pagination before directly reading each listed submission', async () => {
  const { calls, transport } = transportFixture({
    page: after => after === null ? response('assignments', [assignment()], 'next') : response('assignments', [assignment('11')]),
    submission: id => ({ id: String(+id + 10), assignmentId: id, state: id === '10' ? 'submitted' : 'unsubmitted', cachedDueDate: null }),
  });
  const result = await collect(transport);
  assert.deepEqual(calls, [['assignments', null], ['assignments', 'next'], ['submission', '10'], ['submission', '11']]);
  assert.deepEqual(result.submissions.map(item => item.state), ['submitted', 'unsubmitted']);
});

test('collector rejects repeated cursors, assignment identities and inconsistent course pages before status reads', async () => {
  for (const scenario of ['cursor', 'identity', 'course']) {
    let count = 0;
    const { calls, transport } = transportFixture({ page: () => {
      count++;
      const value = response('assignments', [assignment(scenario === 'identity' ? '10' : String(count))], scenario === 'cursor' ? 'same' : String(count));
      if (scenario === 'course' && count > 1) value.data.course.name = 'Changed';
      return value;
    } });
    await assert.rejects(collect(transport), /pagination did not finish|repeated a record|changed during pagination/);
    assert.equal(calls.length, 2);
    assert.ok(calls.every(call => call[0] === 'assignments'));
  }
});

test('collector keeps null status unknown and reports incomplete status and deadline coverage', async () => {
  const { transport } = transportFixture({ submission: () => null });
  const result = await collect(transport);
  assert.deepEqual(result.submissions, []);
  const record = metadataRecord(result);
  for (const source of ['submission states', 'student deadlines']) {
    assert.equal(record.coverage.find(item => item.source === source).status, 'partial');
  }
  const empty = transportFixture({ page: () => response('assignments', []) });
  assert.equal((await collect(empty.transport)).assignments.length, 0);
  assert.deepEqual(empty.calls, [['assignments', null]]);
});

test('collector rejects mismatched and repeated submission records rather than returning partial success', async () => {
  for (const scenario of ['foreign', 'duplicate', 'failure']) {
    const { transport } = transportFixture({ page: () => response('assignments', [assignment(), assignment('11')]),
      submission: id => {
        if (scenario === 'failure' && id === '11') throw new Error('Submission information unavailable');
        return { id: '20', assignmentId: scenario === 'foreign' ? '12' : id, state: 'submitted', cachedDueDate: null };
      } });
    await assert.rejects(collect(transport), /ambiguous submission|unavailable/);
  }
});

test('collector discards late cancelled page/status responses and never starts subsequent reads', async () => {
  const stopped = new AbortController(); stopped.abort();
  const initial = transportFixture();
  await assert.rejects(collect(initial.transport, stopped.signal), { name: 'AbortError' });
  assert.equal(initial.calls.length, 0);
  for (const stage of ['page', 'submission']) {
    const controller = new AbortController();
    const { calls, transport } = transportFixture({
      page: () => { if (stage === 'page') controller.abort(); return response('assignments', [assignment(), assignment('11')]); },
      submission: () => { controller.abort(); return null; },
    });
    await assert.rejects(collect(transport, controller.signal), { name: 'AbortError' });
    assert.equal(calls.length, stage === 'page' ? 1 : 2);
  }
});

test('collector enforces page limits and checks the remaining shared request budget before status reads', async () => {
  let count = 0;
  const paginated = transportFixture({ page: () => { count++; return response('assignments', [assignment(String(count))], String(count)); } });
  await assert.rejects(collect(paginated.transport), /pagination did not finish/);
  assert.equal(count, 100);
  for (const budget of [0, 2]) {
    const { calls, transport } = transportFixture({ budget, page: () => response('assignments', [assignment(), assignment('11')]) });
    await assert.rejects(collect(transport), /remaining Canvas request limit/);
    assert.deepEqual(calls, [['assignments', null]]);
  }
  const exact = transportFixture({ budget: 2 });
  assert.equal((await collect(exact.transport)).submissions.length, 1);
  assert.equal(exact.transport.remainingRequests, 0);
});
