// Candidate preflight only. No default transport or production admission.
// Complete enrollment evidence is not proof of account-level permissions or
// date-effective access, and must never authorize collection by itself.
const query = `query CanvasWeeklyEnrollmentScope($courseId: ID!, $studentId: ID!, $after: String) {
  user(id: $studentId) {
    _id
    enrollmentsConnection(first: 100, after: $after, courseId: $courseId, currentOnly: false, excludeConcluded: false) {
      pageInfo { hasNextPage endCursor }
      nodes { _id userId course { _id } type state courseSectionId limitPrivilegesToCourseSection role { _id name } }
    }
  }
}`;
const validId = value => typeof value === 'string' && /^[1-9]\d{0,31}$/.test(value);
const validCursor = value => value === null || (typeof value === 'string' && value.length > 0 && value.length <= 1024 && !/[\u0000-\u001f\u007f]/.test(value));
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const types = new Set(['StudentEnrollment', 'TeacherEnrollment', 'TaEnrollment', 'ObserverEnrollment', 'DesignerEnrollment', 'StudentViewEnrollment']);
const states = new Set(['active', 'invited', 'creation_pending', 'completed', 'inactive', 'rejected', 'deleted']);
const unavailable = 'Canvas enrollment evidence is unavailable or incomplete. Collection remains paused.';

export function enrollmentScopeRequest(courseId, studentId, after = null) {
  if (!validId(courseId) || !validId(studentId) || !validCursor(after)) throw new Error(unavailable);
  return Object.freeze({ operationName: 'CanvasWeeklyEnrollmentScope', query,
    variables: Object.freeze({ courseId, studentId, after }) });
}

export function permittedEnrollmentScopeBody(body, courseId, studentId) {
  try {
    if (typeof body !== 'string' || body.length > 4096) return false;
    const value = JSON.parse(body);
    return body === JSON.stringify(enrollmentScopeRequest(courseId, studentId, value.variables?.after));
  } catch { return false; }
}

// Shared incremental validation for recorded pages and the isolated collector.
// Nothing leaves this reader until the entire chain has completed successfully.
function enrollmentReader({ courseId, studentId, signal } = {}) {
  signal?.throwIfAborted();
  if (!validId(courseId) || !validId(studentId)) throw new Error(unavailable);
  const enrollments = [];
  const identities = new Set();
  const cursors = new Set();
  let expected = null;
  let bytes = 0;
  let count = 0;
  const add = page => {
    signal?.throwIfAborted();
    if (++count > 100 || !object(page) || page.after !== expected || cursors.has(page.after)) throw new Error(unavailable);
    cursors.add(page.after);
    const value = page.response;
    let encoded;
    try { encoded = JSON.stringify(value); } catch { throw new Error(unavailable); }
    if (typeof encoded !== 'string') throw new Error(unavailable);
    const length = Buffer.byteLength(encoded);
    bytes += length;
    if (length > 2 * 1024 * 1024 || bytes > 16 * 1024 * 1024 || !object(value)
      || (value.errors !== undefined && (!Array.isArray(value.errors) || value.errors.length))
      || !object(value.data?.user) || value.data.user._id !== studentId) throw new Error(unavailable);
    const connection = value.data.user.enrollmentsConnection;
    if (!object(connection) || !Array.isArray(connection.nodes) || connection.nodes.length > 100
      || !object(connection.pageInfo) || typeof connection.pageInfo.hasNextPage !== 'boolean'
      || !validCursor(connection.pageInfo.endCursor)) throw new Error(unavailable);
    const { hasNextPage, endCursor } = connection.pageInfo;
    if (hasNextPage && (!endCursor || !connection.nodes.length || cursors.has(endCursor))) throw new Error(unavailable);
    if (hasNextPage && count === 100) throw new Error(unavailable);
    for (const node of connection.nodes) {
      if (!object(node) || !validId(node._id) || identities.has(node._id)
        || node.userId !== studentId || !object(node.course) || node.course._id !== courseId
        || !types.has(node.type) || !states.has(node.state)
        || !validId(node.courseSectionId) || typeof node.limitPrivilegesToCourseSection !== 'boolean'
        || !object(node.role) || !validId(node.role._id) || typeof node.role.name !== 'string'
        || !node.role.name.trim() || node.role.name.length > 256 || /[\u0000-\u001f\u007f]/.test(node.role.name)) throw new Error(unavailable);
      identities.add(node._id);
      // Keep conflicting, custom, inactive and test roles. Never discard them
      // to make a response appear student-only or infer privileges from a name.
      enrollments.push(Object.freeze({ id: node._id, userId: studentId, type: node.type, state: node.state,
        sectionId: node.courseSectionId, sectionRestricted: node.limitPrivilegesToCourseSection,
        role: Object.freeze({ id: node.role._id, name: node.role.name }) }));
    }
    expected = hasNextPage ? endCursor : null;
    return expected;
  };
  const finish = () => {
    signal?.throwIfAborted();
    if (!enrollments.length || expected !== null) throw new Error(unavailable);
    return Object.freeze({ courseId, studentId, enrollments: Object.freeze(enrollments) });
  };
  return { add, finish };
}

// Recorded pages pair each requested cursor with its decoded response. This
// cannot establish where the evidence came from or grant collection permission.
export function validateEnrollmentScopePages(pages, scope) {
  const reader = enrollmentReader(scope);
  if (!Array.isArray(pages) || !pages.length || pages.length > 100) throw new Error(unavailable);
  for (const page of pages) reader.add(page);
  return reader.finish();
}

export async function collectEnrollmentScope({ request, courseId, studentId, signal } = {}) {
  const reader = enrollmentReader({ courseId, studentId, signal });
  if (typeof request !== 'function') throw new Error(unavailable);
  let after = null;
  try {
    do {
      signal?.throwIfAborted();
      const response = await request(enrollmentScopeRequest(courseId, studentId, after), signal);
      after = reader.add({ after, response });
    } while (after !== null);
    return reader.finish();
  } catch {
    signal?.throwIfAborted();
    // Supplied transport errors may contain credentials or response contents.
    throw new Error(unavailable);
  }
}
