import { extractHtml, referenceUrl } from './content.js';

// CourseType.syllabusBody is a stored field, unlike Assignment.description's
// lock resolver. See the field-level admission in canvas-syllabus-review.md.
const query = `query CanvasWeeklyCourseSyllabus($courseId: ID!) {
  course(id: $courseId) { _id syllabusBody }
}`;
const validId = value => typeof value === 'string' && /^[1-9]\d{0,31}$/.test(value);
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const unavailable = 'Canvas syllabus text is unavailable or incomplete.';

export function courseSyllabusRequest(courseId) {
  if (!validId(courseId)) throw new Error(unavailable);
  return Object.freeze({ operationName: 'CanvasWeeklyCourseSyllabus', query,
    variables: Object.freeze({ courseId }) });
}

export function parseCourseSyllabus(value, courseId, origin) {
  courseSyllabusRequest(courseId);
  if (!object(value) || (value.errors !== undefined && (!Array.isArray(value.errors) || value.errors.length))
    || !object(value.data?.course) || value.data.course._id !== courseId) throw new Error(unavailable);
  const body = value.data.course.syllabusBody;
  if (body === null) return { text: null, links: [] };
  if (typeof body !== 'string' || body.length > 512 * 1024) throw new Error(unavailable);
  const base = new URL(`/courses/${courseId}/assignments/syllabus`, origin).href;
  const content = extractHtml(body);
  // Keep extracted text with credential-line redaction and filtered links, not
  // raw HTML or scripts. Redaction cannot identify every possible secret.
  // Links remain references; this read does not follow them.
  return { text: content.text,
    links: [...new Set(content.links.map(link => referenceUrl(link, base)).filter(Boolean))] };
}
