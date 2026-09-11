import test from 'node:test';
import assert from 'node:assert/strict';
import { parseMetadataPage } from '../src/canvas-metadata.js';
import { collectStudentMetadata } from '../src/canvas-student-collection.js';

const binding = { courseId: '1', studentId: '99', globalUserId: '10000000000099' };
const enrollment = (id, changes = {}) => ({ _id: id, userId: '99', course: { _id: '1' }, type: 'StudentEnrollment', state: 'active',
  courseSectionId: id, limitPrivilegesToCourseSection: false, role: { _id: '3', name: 'StudentEnrollment' }, ...changes });
function fixture({ account = { accountMembership: 'none', studentId: binding.studentId, globalUserId: binding.globalUserId }, rows = [enrollment('10'), enrollment('11')] } = {}) {
  const calls = [];
  const transport = {
    remainingRequests: 197,
    async readAssignmentPage() {
      calls.push('CanvasWeeklyAssignments');
      return parseMetadataPage({ data: { course: { _id: '1', name: 'Example course', courseCode: 'EX 1', assignmentsConnection: {
        nodes: [{ _id: '20', courseId: '1', name: 'Preparation', state: 'published', pointsPossible: 5, submissionTypes: ['online_upload'] }],
        pageInfo: { hasNextPage: false, endCursor: null },
      } } } }, 'assignments', '1');
    },
    async readOwnSubmission(id) {
      calls.push('CanvasWeeklyOwnSubmission');
      assert.equal(id, '20');
      return { id: '30', assignmentId: '20', state: 'unsubmitted', cachedDueDate: '2026-09-18T18:00:00.000Z' };
    },
    async checkAccountMembership() { calls.push('account'); return account; },
    async request(value) {
      const { operationName, variables } = value;
      calls.push(operationName + (variables.after || ''));
      if (operationName === 'CanvasWeeklyEnrollmentScope') {
        const next = variables.after === null && rows.length > 1 ? 'second' : null;
        const nodes = variables.after === null ? rows.slice(0, 1) : rows.slice(1);
        return { data: { user: { _id: '99', enrollmentsConnection: { nodes, pageInfo: { hasNextPage: !!next, endCursor: next } } } } };
      }
      throw new Error('Unexpected operation');
    },
  };
  return { calls, transport };
}

test('student collection completes both preflights before metadata and exports no role evidence', async () => {
  const { calls, transport } = fixture();
  const record = await collectStudentMetadata({ ...binding, transport });
  const order = ['account', 'CanvasWeeklyEnrollmentScope', 'CanvasWeeklyEnrollmentScopesecond', 'CanvasWeeklyAssignments', 'CanvasWeeklyOwnSubmission'];
  assert.deepEqual(calls, order);
  assert.equal(record.sources.metadata.submissions[0].cachedDueDate, '2026-09-18T18:00:00.000Z');
  assert.doesNotMatch(JSON.stringify(record), /enrollments|StudentEnrollment|accountMembership|10000000000099/);
  await collectStudentMetadata({ ...binding, transport });
  assert.deepEqual(calls, [...order, ...order], 'A later invocation must gather fresh preflight evidence');
});

test('failed, mismatched or nonempty account evidence stops before enrollment requests', async () => {
  for (const account of [null, {}, { accountMembership: 'present' },
    { accountMembership: 'none', studentId: '100', globalUserId: binding.globalUserId },
    { accountMembership: 'none', studentId: '99', globalUserId: '10000000000100' }]) {
    const { calls, transport } = fixture({ account });
    await assert.rejects(collectStudentMetadata({ ...binding, transport }), /account permissions/);
    assert.deepEqual(calls, ['account']);
  }
  const { transport } = fixture();
  transport.checkAccountMembership = async () => { throw new Error('private-credential'); };
  await assert.rejects(collectStudentMetadata({ ...binding, transport }), error => !error.message.includes('private-credential'));
});

test('mixed roles on later pages, custom roles and no active student stop before assignments', async () => {
  const changes = [
    { type: 'TeacherEnrollment', state: 'completed' }, { type: 'TeacherEnrollment', state: 'deleted' },
    { type: 'ObserverEnrollment' }, { type: 'StudentViewEnrollment' },
    { role: { _id: '200', name: 'Custom student' } }, { userId: '100' },
  ];
  for (const change of changes) {
    const { calls, transport } = fixture({ rows: [enrollment('10'), enrollment('11', change)] });
    await assert.rejects(collectStudentMetadata({ ...binding, transport }));
    assert.deepEqual(calls, ['account', 'CanvasWeeklyEnrollmentScope', 'CanvasWeeklyEnrollmentScopesecond']);
  }
  for (const rows of [[], [enrollment('10', { state: 'completed' })]]) {
    const { calls, transport } = fixture({ rows });
    await assert.rejects(collectStudentMetadata({ ...binding, transport }));
    assert.equal(calls.some(call => call === 'CanvasWeeklyAssignments'), false);
  }
});

test('cancellation after preflight or metadata discards late results and prevents subsequent stages', async () => {
  for (const stopAt of ['account', 'CanvasWeeklyEnrollmentScopesecond', 'CanvasWeeklyOwnSubmission']) {
    const controller = new AbortController();
    const { calls, transport } = fixture();
    for (const method of ['checkAccountMembership', 'request', 'readAssignmentPage', 'readOwnSubmission']) {
      const original = transport[method];
      transport[method] = async (...args) => {
        const result = await original(...args);
        if (calls.at(-1) === stopAt) controller.abort();
        return result;
      };
    }
    await assert.rejects(collectStudentMetadata({ ...binding, transport, signal: controller.signal }), { name: 'AbortError' });
    assert.equal(calls.at(-1), stopAt);
  }
});
