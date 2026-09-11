import test from 'node:test';
import assert from 'node:assert/strict';
import { ownSubmissionRequest, parseOwnSubmission } from '../src/canvas-own-submission.js';

const result = () => ({ data: { submission: { _id: '20', assignmentId: '10', state: 'submitted', cachedDueDate: '2026-09-18T23:59:00-07:00' } } });

test('direct submission builder fixes the selection and freezes the bound identities', () => {
  const value = ownSubmissionRequest('10', '99');
  assert.equal(value.operationName, 'CanvasWeeklyOwnSubmission');
  assert.deepEqual(value.variables, { assignmentId: '10', studentId: '99' });
  assert.match(value.query, /submission\(assignmentId: \$assignmentId, userId: \$studentId\)/);
  assert.doesNotMatch(value.query, /submissionsConnection|answers|attempt|description|mutation/);
  assert.throws(() => { value.variables.studentId = '100'; }, TypeError);
  assert.throws(() => { value.query = 'mutation {}'; }, TypeError);
  for (const id of ['', '0', 'self', 10, '10/submit', '1'.repeat(33)]) {
    assert.throws(() => ownSubmissionRequest(id, '99'));
    assert.throws(() => ownSubmissionRequest('10', id));
  }
});

test('direct submission parsing preserves null/unknown data and rejects partial or foreign results', () => {
  const value = result();
  value.data.submission.body = 'Not collected or exported';
  assert.deepEqual(parseOwnSubmission(value, '10'), { id: '20', assignmentId: '10', state: 'submitted', cachedDueDate: '2026-09-19T06:59:00.000Z' });
  assert.equal(parseOwnSubmission({ data: { submission: null } }, '10'), null);
  value.data.submission.state = 'ungraded';
  value.data.submission.cachedDueDate = null;
  assert.equal(parseOwnSubmission(value, '10').state, 'ungraded');
  assert.equal(parseOwnSubmission(value, '10').cachedDueDate, null);
  for (const change of [
    value => { value.errors = [{ message: 'Private server error' }]; },
    value => { value.errors = {}; },
    value => { delete value.data.submission; },
    value => { value.data.submission = []; },
    value => { value.data.submission.assignmentId = '11'; },
    value => { value.data.submission._id = '0'; },
    value => { value.data.submission.state = 'deleted'; },
    value => { delete value.data.submission.cachedDueDate; },
    value => { value.data.submission.cachedDueDate = '2026-02-30T12:00:00Z'; },
  ]) {
    const invalid = result(); change(invalid);
    assert.throws(() => parseOwnSubmission(invalid, '10'), error => !error.message.includes('Private server error'));
  }
});
