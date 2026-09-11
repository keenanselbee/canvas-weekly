import { parseMetadataDate } from './canvas-metadata.js';

// Replacement for the rejected course-wide submission connection. No default
// transport and no attempt/answer fields. See the bounded admission review.
const query = `query CanvasWeeklyOwnSubmission($assignmentId: ID!, $studentId: ID!) {
  submission(assignmentId: $assignmentId, userId: $studentId) {
    _id assignmentId state cachedDueDate
  }
}`;
const validId = value => typeof value === 'string' && /^[1-9]\d{0,31}$/.test(value);
const unavailable = 'Canvas submission information is unavailable or incomplete. Previous information must be preserved.';

export function ownSubmissionRequest(assignmentId, studentId) {
  if (!validId(assignmentId) || !validId(studentId)) throw new Error('Invalid Canvas submission identity.');
  return Object.freeze({ operationName: 'CanvasWeeklyOwnSubmission', query,
    variables: Object.freeze({ assignmentId, studentId }) });
}

export function parseOwnSubmission(value, assignmentId) {
  if (!validId(assignmentId) || !value || typeof value !== 'object' || Array.isArray(value)
    || (value.errors !== undefined && (!Array.isArray(value.errors) || value.errors.length))
    || !value.data || typeof value.data !== 'object' || Array.isArray(value.data)
    || !Object.hasOwn(value.data, 'submission')) throw new Error(unavailable);
  const node = value.data.submission;
  // Null means no readable existing record. It is not evidence of no deadline
  // or an unsubmitted assignment, and must not replace previously known facts.
  if (node === null) return null;
  if (!node || typeof node !== 'object' || Array.isArray(node) || !validId(node._id)
    || node.assignmentId !== assignmentId
    || !['unsubmitted', 'submitted', 'pending_review', 'graded', 'ungraded'].includes(node.state)) throw new Error(unavailable);
  return { id: node._id, assignmentId, state: node.state, cachedDueDate: parseMetadataDate(node.cachedDueDate) };
}
