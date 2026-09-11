Canvas metadata admission decision
==================================

Decision, 2026-09-11: withhold production admission. The fixed course submission
query still has a reachable enrollment-state write path when elevated course
permissions are present. A client-side enrollment preflight is not an atomic
server-side restriction on the following query. The production hold remains.

Why the preflight does not close this path
-----------------------------------------

Reviewed against upstream Canvas
1c9f0bb8013ed69c4f2efe11fd483025469b7e6c and the exact runtime queries.

1. CanvasConnection collects empty account membership and complete supported
   student-role evidence, then sends a separate metadata request. The binding
   detects local account/course/credential changes and returned user identity;
   it cannot freeze server-side role or permission state between requests.
2. CourseType.submissions_connection checks manage_grades/view_all_grades before
   the student's read_grades branch. If an elevated permission is present, it
   invokes CourseVisibleStudentUserIdsLoader. The explicit studentIds filter is
   intersected with the result only after that loader has run.
3. That loader calls course.apply_enrollment_visibility, which calls
   section_visibilities_for before plucking the allowed student IDs.
4. section_visibilities_for loads non-deleted/rejected/inactive enrollment rows
   and checks enrollment_state.active? on temporary enrollments.
5. Enrollment.enrollment_state reloads a missing association, then invokes
   create_enrollment_state if it is still absent. That helper uses a primary
   database first_or_create for EnrollmentState.

For example, adding an elevated temporary enrollment after the preflight can
change which branch the subsequent query executes without changing the student's
local/global user ID. Even re-running the preflight immediately before each POST
cannot make those two server requests atomic. Rechecking after the response
cannot undo a read-time write. No such change was made to the real account to
exercise this scenario; the evidence is the source path and request ordering.

The earlier stock StudentEnrollment permission review remains useful for a
stable-role snapshot. Its conclusion must not be extended into a guarantee that
the elevated resolver is unreachable for the duration of the collection.

The exact submitted query remains the source of the problem even though it asks
only for ID, assignment ID, state and cachedDueDate. Small field selections do not
eliminate work performed by the parent connection resolver. Its schema validation
and passing localhost fixtures establish syntax and local transport behavior,
not absence of this server-side effect.

The attempted enablement edits were withdrawn before any live Canvas request or
package build. The app, guide-export notice and tests were restored to their
committed production-hold behavior. No saved personal guide or AI setting changed.

Selected getter review retained
-------------------------------

The remaining selected scalar/getter checks did not identify a new direct write:
LegacyIDInterface reads id; Course.name returns an existing nickname or stored
value; AbstractAssignment.name returns title; submission_types_array splits a
stored string; AssignmentType intersects that array with known enum values and
reads context_id. Points, workflow states, course code, section ID and enrollment
privilege flags are stored values. Role/course fields load the reviewed
associations. Enrollment IDs use the anonymous-grading feature/scoped-context
helper; the self-root enrollment query has no submission-derived hiding context.
SubmissionType's always-run anonymous context was reviewed separately.

Those findings do not authorize the unsafe parent connection or new body fields.
See the [permission review](canvas-metadata-permissions-review.md),
[preflight model review](canvas-preflight-model-review.md), and
[stored deadline review](canvas-planner-review.md).

Replacement candidates
-----------------------

- User.courseWorkSubmissionsConnection is not an immediate substitute. It calls
  cached_current_course_ids_for_dashboard; the underlying User helper invokes
  state_based_on_date and enrollment_state while filtering all current courses.
- User.viewableSubmissionsConnection supplies submissions with comments through
  stream items. It cannot provide the complete outstanding-work inventory.
- Query.submission(assignmentId:, userId:) is the next bounded candidate. The
  SubmissionByAssignmentAndUser loader reads an existing active row with find_by;
  it does not create a missing submission or use the course-wide visibility
  loader. Its first Submission read policy passes for the student's own published
  assignment. The anonymous-grading helper and permission fallbacks are reviewed
  below; production orchestration still needs to replace the old query.

The proposed fixed query validates against the pinned schema:

```graphql
query CanvasWeeklyOwnSubmission($assignmentId: ID!, $studentId: ID!) {
  submission(assignmentId: $assignmentId, userId: $studentId) {
    _id assignmentId state cachedDueDate
  }
}
```

The isolated canvas-own-submission.js component implements this exact query and
strict response parsing. CanvasMetadataTransport.readAssignmentPage registers
only IDs from validated pages read for its bound course. readOwnSubmission can
request only those IDs for the bound student; generic request does not accept
the new operation. Null remains unavailable, not evidence of no deadline or no
submission. The existing identity, credential, cancellation, byte/request limits
and redacted audit apply. This component is not yet used by production collection.

Before admission, replace the course-wide query in collection orchestration,
preserve prior status/dates as last-known for missing records, and account for
per-assignment request costs in coverage. Do not broaden privileges or obtain
attempts to fill gaps. The production hold remains in place.

Direct lookup fallback review, 2026-09-11
---------------------------------------

Reviewed against the same pinned source, including unpublished assignments and
permission fallbacks rather than assuming the first self-policy always passes:

- SubmissionByAssignmentAndUser uses Submission.active.preload(...).find_by,
  then anonymous-name filtering and the selected read policy. Missing records
  produce null; this loader does not call find_or_create_submission.
- Submission's read fallbacks check published grade permissions, existing
  observer enrollments, and peer-review eligibility. user_can_read_grades? checks
  view_all_grades/manage_grades through the previously reviewed course policies.
- peer_reviewer? first requires a published assignment, then checks stored peer
  review settings, participating student membership and existing assessment
  requests. The participating_students association filters stored enrollment
  type/workflow fields; it does not evaluate date-based enrollment state.
- The peer-review submitted? helper reads submissions.find_by(user:). Its
  non_digital_submission? and has_submission? checks use stored submission types.
  They do not create a row or inspect quiz attempts. Unpublished assignments
  stop before this peer-review branch.
- can_read_submission_user_name? short-circuits for the owner. Its foreign-user
  paths inspect stored anonymity settings, existing unposted submissions and
  reviewed course permissions. preload_unposted_anonymous_submissions uses SQL
  with stored enrollment workflow states and assigns an in-memory boolean.

These selected paths did not reveal the course-wide enrollment-state creation
problem. That finding supports the isolated replacement component, not a claim
that the deployed institution matches this source or that historical account
state is unchanged. Response identity checks remain mandatory.

Validation: 116 unit tests passed. The localhost Electron HTTPS fixture verifies
observed-assignment admission, fixed student identity, null and mismatched result
handling, and audit redaction. No real Canvas or AI requests were made.

Fallback source references:

- [Submission policies and anonymity helpers](https://github.com/instructure/canvas-lms/blob/1c9f0bb8013ed69c4f2efe11fd483025469b7e6c/app/models/submission.rb#L584)
- [Existing submission lookup for submitted?](https://github.com/instructure/canvas-lms/blob/1c9f0bb8013ed69c4f2efe11fd483025469b7e6c/app/models/abstract_assignment.rb#L2124)
- [Grade permission helper](https://github.com/instructure/canvas-lms/blob/1c9f0bb8013ed69c4f2efe11fd483025469b7e6c/app/models/abstract_assignment.rb#L2230)
- [Unposted anonymity lookup](https://github.com/instructure/canvas-lms/blob/1c9f0bb8013ed69c4f2efe11fd483025469b7e6c/app/models/abstract_assignment.rb#L1986)
- [Participating student association](https://github.com/instructure/canvas-lms/blob/1c9f0bb8013ed69c4f2efe11fd483025469b7e6c/app/models/course.rb#L109)

The requested automatic instructions/materials/messages remain separate work.
A deadlines-only replacement is not the final personal study-guide objective.
Authentication/access bookkeeping and server caches can still persist; neither
this decision nor the earlier review proves historical account invariance.

Sources
-------

- [Course submission resolver](https://github.com/instructure/canvas-lms/blob/1c9f0bb8013ed69c4f2efe11fd483025469b7e6c/app/graphql/types/course_type.rb#L432)
- [Visible student loader](https://github.com/instructure/canvas-lms/blob/1c9f0bb8013ed69c4f2efe11fd483025469b7e6c/app/graphql/loaders/course_visible_student_user_ids_loader.rb)
- [Enrollment visibility](https://github.com/instructure/canvas-lms/blob/1c9f0bb8013ed69c4f2efe11fd483025469b7e6c/app/models/course.rb#L3338)
- [Temporary enrollment state lookup](https://github.com/instructure/canvas-lms/blob/1c9f0bb8013ed69c4f2efe11fd483025469b7e6c/app/models/course.rb#L3273)
- [Enrollment state creation](https://github.com/instructure/canvas-lms/blob/1c9f0bb8013ed69c4f2efe11fd483025469b7e6c/app/models/enrollment.rb#L841)
- [Dashboard course filtering](https://github.com/instructure/canvas-lms/blob/1c9f0bb8013ed69c4f2efe11fd483025469b7e6c/app/models/user.rb#L602)
- [Direct submission lookup](https://github.com/instructure/canvas-lms/blob/1c9f0bb8013ed69c4f2efe11fd483025469b7e6c/app/graphql/graphql_node_loader.rb#L213)
- [Submission read policy](https://github.com/instructure/canvas-lms/blob/1c9f0bb8013ed69c4f2efe11fd483025469b7e6c/app/models/submission.rb#L584)
