Canvas metadata admission decision
==================================

Decision, 2026-09-11: admit the fixed metadata collector for manual guide
refreshes. The course-wide submission query was removed in 999c0ad and cannot be
constructed, collected or admitted by the current transport. The replacement
reads existing submissions for freshly observed assignments and the bound user.
This decision restores assignment metadata, stored student deadlines and status;
it does not authorize automatic instruction/material reads. The subsequent
[message admission](canvas-message-review.md) adds the two fixed course-message
queries after metadata using the same bound transport.

Integrated evidence and boundary
--------------------------------

| Request stage | Evidence | Admission |
| --- | --- | --- |
| Profile/session and selected courses | Existing identity validation, stock session-cookie watcher, account-change invalidation and fixed GET admission | Existing connection operations; authentication/access bookkeeping is not promised to be write-free |
| GET /api/v1/accounts?per_page=1 | Fixed empty-membership preflight, bounded account serializer/policy/model review | Accept only empty negative evidence; stop on errors, nonempty results or pagination contradictions |
| CanvasWeeklyEnrollmentScope | Self-user lookup, selected permission dispatch and preflight model review; complete enrollment pagination | Bound self/course IDs and stock StudentEnrollment roles; reject mixed/custom/test-student roles |
| CanvasWeeklyAssignments | Selected course permission preload, differentiated visibility SQL, model/scalar getters, controller hooks and analyzers | Published assignment identity/name/points/type only; no override dates, descriptions or lock information |
| CanvasWeeklyOwnSubmission | Existing-row loader and fallback policy/anonymity review below | Bound assignment/user; ID, assignment ID, stored state and cachedDueDate only |
| Collection and persistence | Exact pending-request admission, response identity, shared budgets, cancellation, atomic guide export and account binding | Metadata and fatal connection/audit failures stop the update; optional message-source failures retain old evidence as stale; null submission records remain unknown |

The selected paths were reviewed against upstream revision
1c9f0bb8013ed69c4f2efe11fd483025469b7e6c, including the production special-account
assumption. The permission-dispatch and included-model findings are recorded in
[permission review](canvas-metadata-permissions-review.md) and
[preflight model review](canvas-preflight-model-review.md). The direct lookup
avoids the known enrollment-state creation branch; no requested resolver in this
selection was found to start/resume attempts, submit work, send messages, change
read status or evaluate module progress. This is a bounded source review, not a
claim that arbitrary reads or every institutional extension are harmless.

User-visible behavior: Update guide is available after connection/selection;
the app and exports identify limited coverage. Saved instructions and other old
content retain their age and verification flags. No broader token scopes, retry
fallbacks, assessment navigation or general-purpose GraphQL access are enabled.
The legacy REST collector and the removed body/download routes remain disabled.
The application still supports a shared collection hold for a future repair.

Limits that remain: UBC's deployed revision and live compatibility are unverified;
authentication, access telemetry and server caches may persist. Separate
preflights do not freeze server permissions. Response identity rejects wrong-user
data but cannot undo server processing. No historical account invariance is
claimed. These limits are disclosed rather than represented as passing tests.
No real Canvas or AI request was used for this admission milestone.

Query review pins (SHA-256 of the UTF-8 runtime query text):

| Operation | Hash |
| --- | --- |
| CanvasWeeklyAssignments | b9866e8b4d87d806ad447bf2b00b75d6793ef8a21aa8de3d7cafc9d7a58adc50 |
| CanvasWeeklyEnrollmentScope | 42a8bb43889e3bea872e8d5ca3db2f4785cc507b27ebc01edddb947c423b81dc |
| CanvasWeeklyOwnSubmission | f9207c148426c8d514a3817e6bfb8b4e03f4e36551267dfc4f975db5286cd450 |

The admission regression test pins these selections independently of the request
builders. Changes require another resolver review; hashes prove selection
identity, not side-effect freedom. The localhost Electron fixture now exercises
the real enabled connection method without overriding its hold for collection.

Historical rejection and replacement evidence
--------------------------------------------

The following sections retain the evidence that led to removal of the former
course-wide query. References to a production hold describe those earlier stages;
the bounded decision above is the current admission state.

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
- Query.submission(assignmentId:, userId:) is the selected bounded replacement. The
  SubmissionByAssignmentAndUser loader reads an existing active row with find_by;
  it does not create a missing submission or use the course-wide visibility
  loader. Its first Submission read policy passes for the student's own published
  assignment. The anonymous-grading helper and permission fallbacks are reviewed
  below; orchestration now uses the direct query behind the production hold.

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
and redacted audit apply. Collection orchestration now uses this component behind
the production hold. After all assignment pages finish, it verifies sufficient
remaining request capacity for one lookup per assignment. Insufficient capacity,
failed responses, duplicate identities and cancellation reject the whole update.
Null records produce partial coverage, unknown status and retained last-known
deadlines with verification tasks. No privileges or attempt access are added.
The old course-wide query cannot be constructed or admitted by the transport.

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

Validation: 120 unit tests passed. The localhost Electron HTTPS fixture verifies
observed-assignment admission, complete direct collection through CanvasConnection,
fixed student identity, null and mismatched results, and audit redaction. No real Canvas or AI requests were made.

Fallback source references:

- [Submission policies and anonymity helpers](https://github.com/instructure/canvas-lms/blob/1c9f0bb8013ed69c4f2efe11fd483025469b7e6c/app/models/submission.rb#L584)
- [Existing submission lookup for submitted?](https://github.com/instructure/canvas-lms/blob/1c9f0bb8013ed69c4f2efe11fd483025469b7e6c/app/models/abstract_assignment.rb#L2124)
- [Grade permission helper](https://github.com/instructure/canvas-lms/blob/1c9f0bb8013ed69c4f2efe11fd483025469b7e6c/app/models/abstract_assignment.rb#L2230)
- [Unposted anonymity lookup](https://github.com/instructure/canvas-lms/blob/1c9f0bb8013ed69c4f2efe11fd483025469b7e6c/app/models/abstract_assignment.rb#L1986)
- [Participating student association](https://github.com/instructure/canvas-lms/blob/1c9f0bb8013ed69c4f2efe11fd483025469b7e6c/app/models/course.rb#L109)

Automatic instructions/materials remain separate work. Course-message text is
now covered by the subsequent message admission; sender identities and attachments
are not collected.
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
