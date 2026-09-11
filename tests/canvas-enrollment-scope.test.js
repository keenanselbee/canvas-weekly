import test from 'node:test';
import assert from 'node:assert/strict';
import { validateEnrollmentScopePages } from '../src/canvas-enrollment-scope.js';

const scope = { courseId: '1', studentId: '99' };
const enrollment = (id = '10', changes = {}) => ({ _id: id, userId: '99', type: 'StudentEnrollment', state: 'active',
  course: { _id: '1' },
  courseSectionId: '2', limitPrivilegesToCourseSection: false, role: { _id: '3', name: 'StudentEnrollment' }, ...changes });
const page = (nodes = [enrollment()], after = null, next = null) => ({ after, response: { data: { user: { _id: '99',
  enrollmentsConnection: { nodes, pageInfo: { hasNextPage: next !== null, endCursor: next } } } } } });

test('enrollment evidence preserves multi-section and conflicting roles without granting admission', () => {
  const pages = [page([enrollment()], null, 'next'), page([
    enrollment('11', { courseSectionId: '4', limitPrivilegesToCourseSection: true }),
    enrollment('12', { type: 'TeacherEnrollment', state: 'completed', role: { _id: '5', name: 'TeacherEnrollment' } }),
    enrollment('13', { role: { _id: '6', name: 'Custom student' } }),
    enrollment('14', { type: 'StudentViewEnrollment' }),
  ], 'next')];
  const result = validateEnrollmentScopePages(pages, scope);
  assert.deepEqual(result.enrollments.map(item => item.id), ['10', '11', '12', '13', '14']);
  assert.equal(result.enrollments[2].state, 'completed');
  assert.equal(result.enrollments[3].role.name, 'Custom student');
  assert.deepEqual(Object.keys(result), ['courseId', 'studentId', 'enrollments']);
  assert.throws(() => { result.enrollments[0].role.name = 'Changed'; }, TypeError);
  pages[0].response.data.user.enrollmentsConnection.nodes[0].role.name = 'Changed';
  assert.equal(result.enrollments[0].role.name, 'StudentEnrollment');
});

test('missing or malformed enrollment fields and foreign identities fail closed', () => {
  for (const change of [{ _id: null }, { _id: 10 }, { userId: '100' }, { userId: null }, { type: 'UnknownEnrollment' },
    { course: null }, { course: { _id: '2' } }, { course: { _id: 1 } },
    { state: 'pending' }, { courseSectionId: null }, { limitPrivilegesToCourseSection: null }, { role: null },
    { role: { _id: '3', name: '' } }, { role: { _id: null, name: 'StudentEnrollment' } }]) {
    assert.throws(() => validateEnrollmentScopePages([page([enrollment('10', change)])], scope), /unavailable or incomplete/);
  }
  for (const key of Object.keys(enrollment())) {
    const node = enrollment(); delete node[key];
    assert.throws(() => validateEnrollmentScopePages([page([node])], scope));
  }
  for (const badScope of [{ courseId: '2', studentId: '99' }, { courseId: 1, studentId: '99' }, { courseId: '1', studentId: '099' }]) {
    assert.throws(() => validateEnrollmentScopePages([page()], badScope));
  }
});

test('all raw enrollment states remain visible to later permission review', () => {
  const states = ['active', 'invited', 'creation_pending', 'completed', 'inactive', 'rejected', 'deleted'];
  const result = validateEnrollmentScopePages([page(states.map((state, index) => enrollment(String(index + 10), { state })))], scope);
  assert.deepEqual(result.enrollments.map(item => item.state), states);
});

test('partial GraphQL results and empty evidence never establish a scope', () => {
  for (const response of [null, {}, { data: { user: null } }, { data: { user: { _id: '99', enrollmentsConnection: null } } },
    { data: { course: { _id: '1', enrollmentsConnection: page().response.data.user.enrollmentsConnection } } }]) {
    assert.throws(() => validateEnrollmentScopePages([{ after: null, response }], scope));
  }
  const partial = page(); partial.response.errors = [{ message: 'private upstream detail' }];
  assert.throws(() => validateEnrollmentScopePages([partial], scope), error => !error.message.includes('private upstream detail'));
  assert.throws(() => validateEnrollmentScopePages([page([])], scope));
  assert.throws(() => validateEnrollmentScopePages([], scope));
});

test('self-enrollment evidence requires the bound user on every page', () => {
  const foreign = page([enrollment('11')], 'next');
  foreign.response.data.user._id = '100';
  assert.throws(() => validateEnrollmentScopePages([page([enrollment()], null, 'next'), foreign], scope));
  const missing = page(); delete missing.response.data.user._id;
  assert.throws(() => validateEnrollmentScopePages([missing], scope));
  const foreignCourse = page([enrollment('11', { course: { _id: '2' } })], 'next');
  assert.throws(() => validateEnrollmentScopePages([page([enrollment()], null, 'next'), foreignCourse], scope));
});

test('pagination rejects missing, additional, repeated and mismatched pages', () => {
  for (const pages of [
    [page([enrollment()], null, 'next')],
    [page(), page([enrollment('11')], 'next')],
    [page([enrollment()], null, 'next'), page([enrollment('11')], 'wrong')],
    [page([enrollment()], null, 'next'), page([enrollment()], 'next')],
    [page([enrollment(), enrollment()])],
    [page([enrollment()], null, 'next'), page([enrollment('11')], 'next', 'next'), page([enrollment('12')], 'next')],
    [page([], null, 'next'), page([enrollment()], 'next')],
    [page([enrollment()], null, '\n'), page([enrollment('11')], '\n')],
  ]) assert.throws(() => validateEnrollmentScopePages(pages, scope));
});

test('enrollment evidence enforces size limits and cancellation without contacting a service', () => {
  assert.throws(() => validateEnrollmentScopePages(Array.from({ length: 101 }, () => page()), scope));
  assert.throws(() => validateEnrollmentScopePages([page(Array.from({ length: 101 }, (_, index) => enrollment(String(index + 10))))], scope));
  const large = page(); large.response.padding = 'x'.repeat(2 * 1024 * 1024);
  assert.throws(() => validateEnrollmentScopePages([large], scope));
  const oversized = Array.from({ length: 9 }, (_, index) => {
    const value = page([enrollment(String(index + 10))], index ? String(index) : null, index < 8 ? String(index + 1) : null);
    value.response.padding = 'x'.repeat(1900000); return value;
  });
  assert.throws(() => validateEnrollmentScopePages(oversized, scope));
  const controller = new AbortController(); controller.abort();
  assert.throws(() => validateEnrollmentScopePages([page()], { ...scope, signal: controller.signal }), { name: 'AbortError' });
});
