import test from 'node:test';
import assert from 'node:assert/strict';
import { metadataRequest, permittedMetadataBody, parseMetadataPage, collectMetadata } from '../src/canvas-metadata.js';
import { CanvasNetwork } from '../src/canvas-network.js';

const assignment = (id = '10') => ({ _id: id, courseId: '1', name: 'Reading questions', state: 'published', pointsPossible: 5,
  submissionTypes: ['online_quiz'] });
const response = (operation, nodes, next = null) => ({ data: { course: { _id: '1', name: 'Example course', courseCode: 'DEMO 1',
  [`${operation}Connection`]: { nodes, pageInfo: { hasNextPage: next !== null, endCursor: next } } } } });

test('metadata bodies bind exact fields, course and student without accepting general GraphQL', async () => {
  for (const operation of ['assignments', 'submissions']) {
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
  const submitted = metadataRequest('submissions', '1', '99');
  assert.equal(permittedMetadataBody(JSON.stringify(submitted), '1', '100'), false);
  assert.match(submitted.query, /studentIds: \[\$studentId\]/);
  assert.match(metadataRequest('assignments', '1', '99').query, /gradingPeriodId: null/);
  for (const operation of ['mutation', '__proto__', 'constructor']) assert.throws(() => metadataRequest(operation, '1', '99'));
  for (const cursor of ['', '\n', 'x'.repeat(1025), 1, {}]) assert.throws(() => metadataRequest('assignments', '1', '99', cursor));
  assert.throws(() => metadataRequest('assignments', '../1', '99'));
  // Building this candidate must not enable the production POST route.
  const gate = new CanvasNetwork({ origin: () => 'https://canvas.example', loginContentsId: () => null, fetcher: () => assert.fail('No transport allowed') });
  await assert.rejects(gate.fetch('https://canvas.example/api/graphql', { method: 'POST', redirect: 'manual', body: JSON.stringify(submitted) }), /not permitted/);
});

test('metadata parsing uses stored student dates and discards assignment override dates', () => {
  const input = response('assignments', [{ ...assignment(), dueAt: 'unrequested date', lockAt: 'unrequested date', description: 'private-body' }]);
  const page = parseMetadataPage(input, 'assignments', '1');
  assert.doesNotMatch(JSON.stringify(page), /dueAt|closesAt|opensAt|private-body|unrequested/);
  const submission = { _id: '20', assignmentId: '10', state: 'unsubmitted', cachedDueDate: '2026-09-18T23:59:00-07:00' };
  assert.equal(parseMetadataPage(response('submissions', [submission]), 'submissions', '1').nodes[0].cachedDueDate, '2026-09-19T06:59:00.000Z');
  for (const invalid of ['Tuesday', '2026-02-30T01:00:00Z', '2026-09-18T24:00:00Z', '2026-09-18T10:00:00', undefined]) {
    assert.throws(() => parseMetadataPage(response('submissions', [{ ...submission, cachedDueDate: invalid }]), 'submissions', '1'), /invalid metadata date/);
  }
  assert.equal(parseMetadataPage(response('submissions', [{ ...submission, cachedDueDate: null }]), 'submissions', '1').nodes[0].cachedDueDate, null);
  const request = metadataRequest('assignments', '1', '99');
  assert.doesNotMatch(request.query, /dueAt|lockAt|unlockAt/);
  assert.equal(permittedMetadataBody(JSON.stringify({ ...request, query: request.query.replace('pointsPossible', 'pointsPossible dueAt lockAt unlockAt') }), '1', '99'), false);
  assert.match(metadataRequest('submissions', '1', '99').query, /cachedDueDate/);
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

test('candidate collects assignment and self-status pages with independent cursors', async () => {
  const calls = [];
  const result = await collectMetadata({ courseId: '1', studentId: '99', request: async value => {
    calls.push(value);
    assert.equal(permittedMetadataBody(JSON.stringify(value), '1', '99'), true);
    if (value.operationName === 'CanvasWeeklyAssignments') return value.variables.after === null
      ? response('assignments', [assignment()], 'assignments-next') : response('assignments', [assignment('11')]);
    return value.variables.after === null
      ? response('submissions', [{ _id: '20', assignmentId: '10', state: 'submitted', cachedDueDate: null }], 'submissions-next')
      : response('submissions', [{ _id: '21', assignmentId: '11', state: 'unsubmitted', cachedDueDate: null }]);
  } });
  assert.deepEqual(calls.map(call => call.variables.after), [null, 'assignments-next', null, 'submissions-next']);
  assert.equal(result.assignments.length, 2);
  assert.equal(result.submissions[0].state, 'submitted');
  assert.equal(result.submissions[1].state, 'unsubmitted');
});

test('candidate rejects repeated cursors, identities and ambiguous status records', async () => {
  for (const scenario of ['cursor', 'identity', 'status']) {
    let calls = 0;
    await assert.rejects(collectMetadata({ courseId: '1', studentId: '99', request: async value => {
      calls++;
      if (scenario === 'status') return value.operationName === 'CanvasWeeklyAssignments' ? response('assignments', [assignment()])
        : response('submissions', [{ _id: '20', assignmentId: '10', state: 'submitted', cachedDueDate: null }, { _id: '21', assignmentId: '10', state: 'unsubmitted', cachedDueDate: null }]);
      return response('assignments', [assignment(scenario === 'identity' ? '10' : String(calls))], scenario === 'cursor' ? 'same' : String(calls));
    } }), /pagination did not finish|repeated a record/);
    assert.ok(calls <= 2);
  }
});

test('candidate cancellation and response limits do not return a partial successful result', async () => {
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(collectMetadata({ courseId: '1', studentId: '99', signal: controller.signal, request: () => assert.fail('Cancelled request') }), { name: 'AbortError' });
  const active = new AbortController();
  await assert.rejects(collectMetadata({ courseId: '1', studentId: '99', signal: active.signal, request: async () => { active.abort(); return response('assignments', []); } }), { name: 'AbortError' });
  await assert.rejects(collectMetadata({ courseId: '1', studentId: '99', request: async () => ({ ...response('assignments', []), extra: 'x'.repeat(2 * 1024 * 1024) }) }), /exceeded the supported size/);
  await assert.rejects(collectMetadata({ courseId: '1', studentId: '99', request: async value => value.operationName === 'CanvasWeeklyAssignments'
    ? response('assignments', [assignment()]) : { errors: [{ message: 'Private failure' }] } }), /unavailable or incomplete/);
  await assert.rejects(collectMetadata({ courseId: '1', studentId: '99', request: async () => { throw new Error('Private connection details'); } }), error => /could not be read/.test(error.message) && !/Private/.test(error.message));
});

test('candidate enforces total byte and page budgets across responses', async () => {
  for (const scenario of ['bytes', 'pages']) {
    let calls = 0;
    await assert.rejects(collectMetadata({ courseId: '1', studentId: '99', request: async () => {
      calls++;
      return { ...response('assignments', [assignment(String(calls))], String(calls)), ...(scenario === 'bytes' ? { extra: 'x'.repeat(1024 * 1024) } : {}) };
    } }), scenario === 'bytes' ? /exceeded the supported size/ : /pagination did not finish/);
    assert.equal(calls, scenario === 'bytes' ? 16 : 100);
  }
});
