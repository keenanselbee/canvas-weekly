import { parseMetadataPage } from './canvas-metadata.js';
import { plainText } from './content.js';

// Same course/assignment visibility path as metadata. Only stored rubric text
// is selected; no lock information, assessments, scores or outcome resolvers.
// See canvas-rubric-review.md before changing this selection.
const query = `query CanvasWeeklyCourseRubrics($courseId: ID!, $after: String) {
  course(id: $courseId) {
    _id name courseCode
    assignmentsConnection(first: 100, after: $after, filter: {gradingPeriodId: null}) {
      pageInfo { hasNextPage endCursor }
      nodes { _id courseId name state pointsPossible submissionTypes
        rubric { _id title criteria { _id description longDescription } }
      }
    }
  }
}`;
const validId = value => typeof value === 'string' && /^[1-9]\d{0,31}$/.test(value);
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const unavailable = 'Canvas rubric text is unavailable or incomplete.';

export function courseRubricsRequest(courseId, after = null) {
  if (!validId(courseId) || !(after === null || (typeof after === 'string' && after.length > 0 && after.length <= 1024 && !/[\u0000-\u001f\u007f]/.test(after)))) throw new Error(unavailable);
  return Object.freeze({ operationName: 'CanvasWeeklyCourseRubrics', query, variables: Object.freeze({ courseId, after }) });
}

export function parseCourseRubrics(value, courseId) {
  const page = parseMetadataPage(value, 'assignments', courseId);
  const text = (input, limit) => {
    if (input === null) return '';
    if (typeof input !== 'string' || input.length > limit) throw new Error(unavailable);
    return plainText(input);
  };
  const nodes = page.nodes.map((assignment, index) => {
    const rubric = value.data.course.assignmentsConnection.nodes[index].rubric;
    if (rubric === null) return { assignmentId: assignment.id, name: assignment.name, rubric: null };
    if (!object(rubric) || !validId(rubric._id) || !Array.isArray(rubric.criteria) || rubric.criteria.length > 200) throw new Error(unavailable);
    const seen = new Set();
    const criteria = rubric.criteria.map(criterion => {
      if (!object(criterion) || typeof criterion._id !== 'string' || !criterion._id.length || criterion._id.length > 128
        || /[\u0000-\u001f\u007f]/.test(criterion._id) || seen.has(criterion._id)) throw new Error(unavailable);
      seen.add(criterion._id);
      return { id: criterion._id, description: text(criterion.description, 16384), longDescription: text(criterion.longDescription, 65536) };
    });
    return { assignmentId: assignment.id, name: assignment.name,
      rubric: { id: rubric._id, title: text(rubric.title, 4096), criteria } };
  });
  return { nodes, next: page.next };
}

export async function collectCourseRubrics({ transport, assignments, signal }) {
  signal?.throwIfAborted();
  const expected = new Set(assignments.map(assignment => assignment.id));
  if (!expected.size) return { rubrics: [], coverage: { source: 'rubric criteria', status: 'ok', message: 'No visible assignments were found to check for rubric criteria.' } };
  const seen = new Set();
  const cursors = new Set();
  const rubrics = [];
  let after = null;
  do {
    signal?.throwIfAborted();
    if (cursors.has(after)) throw new Error(unavailable);
    cursors.add(after);
    const page = await transport.readCourseRubrics(after, signal);
    signal?.throwIfAborted();
    for (const node of page.nodes) {
      if (!expected.has(node.assignmentId) || seen.has(node.assignmentId)) throw new Error(unavailable);
      seen.add(node.assignmentId);
      rubrics.push(node);
    }
    after = page.next;
  } while (after !== null);
  if (seen.size !== expected.size) throw new Error(unavailable);
  const supplied = rubrics.filter(item => item.rubric?.criteria.some(criterion => criterion.description || criterion.longDescription)).length;
  return { rubrics, coverage: { source: 'rubric criteria', status: 'partial',
    message: supplied ? `Collected rubric criterion text for ${supplied} assignments. Rating levels, scoring settings and assessment feedback were not collected; check the full rubric.`
      : 'No rubric criterion text was supplied. This does not establish that assignments have no rubric; check the original source. Any retained criteria are last-known information.' } };
}
