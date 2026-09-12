import { collectEnrollmentScope, enrollmentScopeRequest } from './canvas-enrollment-scope.js';
import { collectMetadata, metadataRecord } from './canvas-metadata.js';
import { collectCourseMessages } from './canvas-message-collection.js';
import { collectCourseRubrics } from './canvas-rubrics.js';
import { CanvasCollectionStoppedError } from './canvas-metadata-transport.js';

// Fixed metadata orchestration for CanvasConnection. Supply
// one fresh CanvasMetadataTransport bound to this course/account/connection so
// every stage shares response identity, cancellation, audit and byte budgets.
export async function collectStudentMetadata({ transport, courseId, studentId, globalUserId, signal } = {}) {
  signal?.throwIfAborted();
  enrollmentScopeRequest(courseId, studentId);
  if (!transport || typeof transport.checkAccountMembership !== 'function' || typeof transport.request !== 'function'
    || typeof globalUserId !== 'string' || !/^[1-9]\d{0,31}$/.test(globalUserId)) throw new Error('A verified Canvas connection is required.');
  const request = (value, requestSignal) => transport.request(value, requestSignal);
  let account;
  try { account = await transport.checkAccountMembership(signal); }
  catch { signal?.throwIfAborted(); throw new Error('Canvas account permissions could not be confirmed. Collection stopped.'); }
  signal?.throwIfAborted();
  if (account?.accountMembership !== 'none' || account.studentId !== studentId || account.globalUserId !== globalUserId) {
    throw new Error('Canvas account permissions could not be confirmed. Collection stopped.');
  }

  const scope = await collectEnrollmentScope({ request, courseId, studentId, signal });
  signal?.throwIfAborted();
  // Inspect every returned row, including concluded/deleted roles. Never remove
  // a conflicting role to make an account look student-only. The reserved name
  // is part of the pinned stock Role contract, not an arbitrary display label.
  if (!scope.enrollments.some(enrollment => enrollment.state === 'active')
    || scope.enrollments.some(enrollment => enrollment.type !== 'StudentEnrollment' || enrollment.role.name !== 'StudentEnrollment')) {
    throw new Error('This course needs a supported student enrollment. Mixed, custom and non-student roles are not supported yet.');
  }

  const metadata = await collectMetadata({ transport, courseId, studentId, signal });
  signal?.throwIfAborted();
  // Enrollment and account evidence are confined to this invocation. They are
  // neither exported nor used as cached authority for a later guide update.
  const record = metadataRecord(metadata);
  try {
    const syllabus = await transport.readCourseSyllabus(signal);
    signal?.throwIfAborted();
    record.sources.syllabus = syllabus;
    record.coverage.push({ source: 'course syllabus', status: syllabus.text ? 'ok' : 'partial',
      message: syllabus.text ? 'Collected Canvas syllabus text. Images, embedded media and linked contents were not read by this source; check them separately.'
        : 'Canvas did not supply syllabus text. Check the course home page or external syllabus. Any retained text is last-known information.' });
  } catch (error) {
    signal?.throwIfAborted();
    if (error instanceof CanvasCollectionStoppedError || error?.name === 'AbortError') throw error;
    record.coverage.push({ source: 'course syllabus', status: 'error',
      message: 'The course syllabus could not be refreshed. Any previous text is last-known information; check the original source.' });
  }
  try {
    const messages = await collectCourseMessages({ transport, courseId, studentId, signal });
    signal?.throwIfAborted();
    record.sources.conversation = messages.conversation;
    record.coverage.push(messages.coverage);
  } catch (error) {
    signal?.throwIfAborted();
    if (error instanceof CanvasCollectionStoppedError || error?.name === 'AbortError') throw error;
    // A complete message source is optional. Do not leak response text or export
    // a successful partial scan; reconciliation retains old evidence as stale.
    record.coverage.push({ source: 'course messages', status: 'error',
      message: 'Course messages could not be fully refreshed. Any previous messages are last-known information. Check Canvas Inbox for updates and sender details.' });
  }
  try {
    const result = await collectCourseRubrics({ transport, assignments: metadata.assignments, signal });
    signal?.throwIfAborted();
    record.sources.rubrics = result.rubrics;
    record.coverage.push(result.coverage);
  } catch (error) {
    signal?.throwIfAborted();
    if (error instanceof CanvasCollectionStoppedError || error?.name === 'AbortError') throw error;
    record.coverage.push({ source: 'rubric criteria', status: 'error',
      message: 'Rubric criteria could not be fully refreshed. Any previous criteria are last-known information; check the full rubric in Canvas.' });
  }
  return record;
}
