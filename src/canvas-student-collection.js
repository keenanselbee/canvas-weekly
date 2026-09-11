import { collectEnrollmentScope, enrollmentScopeRequest } from './canvas-enrollment-scope.js';
import { collectMetadata, metadataRecord } from './canvas-metadata.js';

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
  return metadataRecord(metadata);
}
