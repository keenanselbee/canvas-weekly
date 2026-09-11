// Fixed field-level collector admitted by docs/canvas-metadata-admission.md.
// This selection does not authorize instruction, module or assessment reads.
export const METADATA_NOTICE = 'Canvas refresh checks assignments, stored deadlines and submission status. Course messages and syllabus text are checked when available. Assignment instructions and other materials remain incomplete; review coverage and last-known information.';
const queries = Object.freeze({
  assignments: `query CanvasWeeklyAssignments($courseId: ID!, $after: String) {
  course(id: $courseId) {
    _id name courseCode
    assignmentsConnection(first: 100, after: $after, filter: {gradingPeriodId: null}) {
      pageInfo { hasNextPage endCursor }
      nodes { _id courseId name state pointsPossible submissionTypes }
    }
  }
}`,
});
const names = Object.freeze({ assignments: 'CanvasWeeklyAssignments' });
const validId = value => typeof value === 'string' && /^[1-9]\d{0,31}$/.test(value);
const validCursor = value => value === null || (typeof value === 'string' && value.length > 0 && value.length <= 1024 && !/[\u0000-\u001f\u007f]/.test(value));
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);

export function metadataRequest(operation, courseId, studentId, after = null) {
  if (!Object.hasOwn(queries, operation) || !validId(courseId) || !validId(studentId) || !validCursor(after)) throw new Error('Invalid course metadata request.');
  const variables = Object.freeze({ courseId, after });
  return Object.freeze({ operationName: names[operation], query: queries[operation], variables });
}

// Exact canonical bodies only: no extra fields, fragments, directives, aliases,
// mutations, multiple operations or caller-controlled scope. The network adapter
// must also bind this body to a pending main-process request and authenticated ID.
export function permittedMetadataBody(body, courseId, studentId) {
  try {
    if (typeof body !== 'string' || body.length > 4096) return false;
    const value = JSON.parse(body);
    const operation = Object.keys(names).find(key => names[key] === value.operationName);
    return body === JSON.stringify(metadataRequest(operation, courseId, studentId, value.variables?.after));
  } catch { return false; }
}

export function parseMetadataDate(value) {
  if (value === null) return null;
  if (typeof value !== 'string') throw new Error('Canvas returned an invalid metadata date.');
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,3})?(Z|[+-]\d{2}:\d{2})$/);
  const parsed = Date.parse(value);
  if (!match || !Number.isFinite(parsed)) throw new Error('Canvas returned an invalid metadata date.');
  const [, y, m, d, h, minute, second, zone] = match;
  if (+y < 1000 || +m < 1 || +m > 12 || +d < 1 || +d > new Date(Date.UTC(+y, +m, 0)).getUTCDate()
    || +h > 23 || +minute > 59 || +second > 59 || (zone !== 'Z' && (+zone.slice(1, 3) > 23 || +zone.slice(4) > 59))) throw new Error('Canvas returned an invalid metadata date.');
  return new Date(parsed).toISOString();
}

function text(value, nullable = false) {
  if (nullable && value === null) return null;
  if (typeof value !== 'string' || value.length > 4096) throw new Error('Canvas returned invalid metadata text.');
  return value;
}

export function parseMetadataPage(value, operation, courseId) {
  // GraphQL can return HTTP 200 with errors and partial data. Never treat that as
  // a complete source or copy arbitrary error text into the guide or audit log.
  if (!Object.hasOwn(queries, operation) || !validId(courseId) || !object(value)
    || (value.errors !== undefined && (!Array.isArray(value.errors) || value.errors.length))
    || !object(value.data?.course) || value.data.course._id !== courseId) throw new Error('Canvas metadata is unavailable or incomplete. Previous information must be preserved.');
  const course = value.data.course;
  const connection = course[`${operation}Connection`];
  if (!object(connection) || !Array.isArray(connection.nodes) || connection.nodes.length > 100
    || !object(connection.pageInfo) || typeof connection.pageInfo.hasNextPage !== 'boolean'
    || !validCursor(connection.pageInfo.endCursor)
    || (connection.pageInfo.hasNextPage && (!connection.pageInfo.endCursor || !connection.nodes.length))) throw new Error('Canvas returned invalid metadata pagination.');
  const seen = new Set();
  const nodes = connection.nodes.map(node => {
    if (!object(node) || !validId(node._id) || seen.has(node._id)) throw new Error('Canvas returned invalid or duplicate metadata identities.');
    seen.add(node._id);
    if (node.courseId !== courseId || node.state !== 'published'
      || !(node.pointsPossible === null || (typeof node.pointsPossible === 'number' && Number.isFinite(node.pointsPossible) && node.pointsPossible >= 0))
      || !Array.isArray(node.submissionTypes) || node.submissionTypes.length > 20
      || node.submissionTypes.some(type => typeof type !== 'string' || !/^[a-z_]{1,64}$/.test(type))) throw new Error('Canvas returned invalid assignment metadata.');
    return { id: node._id, courseId, name: text(node.name, true), state: node.state, points: node.pointsPossible,
      submissionTypes: [...node.submissionTypes] };
  });
  return { course: { id: courseId, name: text(course.name), code: text(course.courseCode, true) },
    nodes, next: connection.pageInfo.hasNextPage ? connection.pageInfo.endCursor : null };
}

// No default transport, token, session or global fetch. Use one fresh bound
// transport for the entire course, including preflights and raw response limits.
export async function collectMetadata({ transport, courseId, studentId, signal }) {
  signal?.throwIfAborted();
  metadataRequest('assignments', courseId, studentId);
  if (!transport || typeof transport.readAssignmentPage !== 'function' || typeof transport.readOwnSubmission !== 'function') {
    throw new Error('A reviewed metadata transport is required.');
  }
  const result = { course: null, assignments: [], submissions: [] };
  let after = null;
  const cursors = new Set();
  const identities = new Set();
  for (let page = 0; ; page++) {
    signal?.throwIfAborted();
    if (page >= 100 || cursors.has(after)) throw new Error('Canvas metadata pagination did not finish. Previous information must be preserved.');
    cursors.add(after);
    const parsed = await transport.readAssignmentPage(after, signal);
    signal?.throwIfAborted();
    if (parsed.course.id !== courseId) throw new Error('Canvas returned metadata for a different course.');
    if (result.course && JSON.stringify(result.course) !== JSON.stringify(parsed.course)) throw new Error('Course metadata changed during pagination. Try again later.');
    result.course = parsed.course;
    for (const node of parsed.nodes) {
      if (identities.has(node.id)) throw new Error('Canvas metadata repeated a record across pages. Try again later.');
      identities.add(node.id);
      result.assignments.push(node);
    }
    after = parsed.next;
    if (after === null) break;
  }
  // Account/enrollment/assignment pages consume the same budget. Refuse an
  // incomplete status scan before its first request instead of silently omitting
  // later assignments. Callers preserve the prior guide if collection fails.
  if (!Number.isSafeInteger(transport.remainingRequests) || transport.remainingRequests < result.assignments.length) {
    throw new Error('This course exceeds the remaining Canvas request limit. No guide was replaced.');
  }
  const submissionIds = new Set();
  for (const assignment of result.assignments) {
    signal?.throwIfAborted();
    const submission = await transport.readOwnSubmission(assignment.id, signal);
    signal?.throwIfAborted();
    // No readable row is unknown, never "not submitted" or "no deadline".
    if (submission === null) continue;
    if (submission.assignmentId !== assignment.id || submissionIds.has(submission.id)) throw new Error('Canvas returned ambiguous submission metadata.');
    submissionIds.add(submission.id);
    result.submissions.push(submission);
  }
  return result;
}

// Convert a completed collectMetadata result into the guide's course record.
// Keep this source distinct from full REST assignments: it contains no newly
// read instructions, syllabus, quiz configuration or course materials.
export function metadataRecord(metadata) {
  if (!validId(metadata?.course?.id) || !Array.isArray(metadata.assignments) || !Array.isArray(metadata.submissions)
    || metadata.assignments.some(item => item.courseId !== metadata.course.id)) throw new Error('Invalid completed course metadata.');
  const assignments = new Set(metadata.assignments.map(item => item.id));
  const statuses = new Set(metadata.submissions.map(item => item.assignmentId));
  const deadlines = new Map(metadata.submissions.map(item => [item.assignmentId, item.cachedDueDate]));
  if (assignments.size !== metadata.assignments.length || statuses.size !== metadata.submissions.length) throw new Error('Ambiguous completed course metadata.');
  const unknown = new Set(metadata.submissions.filter(item => item.state === 'ungraded').map(item => item.assignmentId));
  const missing = metadata.assignments.filter(item => !statuses.has(item.id) || unknown.has(item.id)).length;
  const unmatched = metadata.submissions.some(item => !assignments.has(item.assignmentId));
  return { id: metadata.course.id, sources: { metadata: structuredClone(metadata) }, coverage: [
    { source: 'assignment metadata', status: 'ok' },
    { source: 'student deadlines', status: metadata.assignments.some(item => !deadlines.get(item.id)) ? 'partial' : 'ok',
      message: 'Dates come from Canvas stored student deadlines. Missing or empty stored dates need confirmation; they do not establish that no deadline exists.' },
    { source: 'availability dates', status: 'unsupported', message: 'Opening and closing dates were not refreshed. Any retained dates are last-known information.' },
    { source: 'submission states', status: missing || unmatched ? 'partial' : 'ok',
      ...(missing || unmatched ? { message: `${missing ? `Submission status needs confirmation for ${missing} listed item${missing === 1 ? '' : 's'}. ` : ''}${unmatched ? 'Some submission records could not be matched to listed work. ' : ''}Check uncertain status in Canvas.` } : {}) },
    { source: 'assignment instructions', status: 'unsupported', message: 'Instructions were not read by the metadata collector. Saved instructions are kept as last-known information.' },
    { source: 'quiz details', status: 'unsupported', message: 'Question counts, time limits and attempt allowances were not refreshed. No quiz was started or resumed.' },
    { source: 'course materials', status: 'unsupported', message: 'Readings, schedules and announcements were not refreshed. Course-message coverage is reported separately.' },
  ] };
}
