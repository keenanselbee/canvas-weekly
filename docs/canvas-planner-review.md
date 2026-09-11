Planner and stored deadline review
=================================

Status: Planner is not admitted to the production session. The isolated GraphQL
collector now uses the stored-deadline selection described below, with parser,
reconciliation and synthetic tests. It no longer selects assignment date resolvers.
Live collection remains paused.

This review uses the complete Ruby source at upstream commit
`1c9f0bb8013ed69c4f2efe11fd483025469b7e6c`. It does not establish the version or
extensions running at UBC, or prove that the earlier live scan changed nothing.


Planner is not an unguarded replacement
--------------------------------------

The self-user GET /api/v1/planner/items initially looked useful because its
dedicated serializer selects attributes rather than calling the full assignment,
quiz and page serializers. The controller's default options include scope_only,
include_locked, include_ignored and include_ungraded. Those are server-side
options, not proposed parameters for overriding access checks.

The assignment collection joins existing student submissions and filters their
cached_due_date. The ungraded quiz collection uses a separate SQL due-date
selection. With scope_only, these paths do not invoke the later availability
filter. Submission read state and discussion unread helpers inspected here query
existing participation records; they do not mark them read. The planner cache ID
uses Rails.cache, and clear_checkpoint_data_cache! resets an instance variable.
These observations do not certify every Planner dependency or all server writes.

The decisive remaining dependency is in the default collection itself:

1. PlannerController.planner_items includes calendar_events_collection alongside
   assignments, quizzes, notes, pages, discussions and peer reviews.
2. calendar_events_collection calls User.section_context_codes with
   skip_visibility_filter: false and include_concluded: false.
3. That helper calls Course.course_section_visibility, which immediately calls
   section_visibilities_for.
4. section_visibilities_for excludes completed/deleted/rejected/inactive rows in
   this case, but inspects temporary enrollments among the remaining rows using
   enrollment.enrollment_state.active?.
5. Enrollment.enrollment_state reloads a missing association, then calls
   create_enrollment_state. That helper switches to the primary database and
   performs EnrollmentState.where(enrollment_id: self).first_or_create.

This path is reached while assembling the collection, before knowing whether
any calendar events will appear in the response. Narrowing the date window or
discarding calendar records locally does not remove it. Running Planner inside
GuardRail's secondary block is not a read-only database guarantee: the nested
getter explicitly switches to primary. Existing enrollment-state rows may avoid
creation, but the client cannot infer their presence from an ordinary student
role or a successful sign-in.

The reviewed default Planner path therefore does not resolve the temporary-state
gap. A combined enrollment preflight would need separate justification; the bulk
temporary-status limitations in [the enrollment review](canvas-enrollment-scope.md)
still apply. Other Planner filters have distinct paths and are not cleared by
this review. No request was made to test the side effect on a real account.


A more focused deadline source
------------------------------

SubmissionInterface declares cached_due_date as a nullable DateTime field, with
no custom resolver on that declaration. This is the same stored date column used
by Planner's assignment selection. The already-reviewed course submissions
connection selects existing Submission rows for permitted student IDs. Its
default query does not need to recalculate assignment overrides to select this
column. A source search found no cached_due_date getter override in Submission;
the full type authorization and inherited getter path still belongs in the
admission review.

The revised candidate removes dueAt, lockAt and unlockAt from assignment
nodes, and requests cachedDueDate on self-scoped submission nodes:

```graphql
query CanvasWeeklySubmissionStates($courseId: ID!, $studentId: ID!, $after: String) {
  course(id: $courseId) {
    _id
    submissionsConnection(first: 100, after: $after, studentIds: [$studentId], filter: {states: [unsubmitted, submitted, pending_review, graded, ungraded]}) {
      pageInfo { hasNextPage endCursor }
      nodes { _id assignmentId state cachedDueDate }
    }
  }
}
```

This runtime query passes GraphQL.js 16.11.0 validation against the pinned
schema. Validation establishes field compatibility only. The runtime query,
exact request allowlist, parser and reconciliation changed together. All 108 unit
tests and the real Electron localhost network fixture pass; production admission
and institutional validation remain pending.

Data contract and remaining admission work:

- Join dates to the independently collected assignment list by assignment ID;
  reject duplicate or conflicting submission identities. A status row alone
  must not create a new assignment or expand course scope.
- Distinguish a returned null cached date, a missing submission and a malformed
  response. A missing or null stored date is not proof that no deadline exists.
  Do not substitute a base assignment deadline as the student's deadline.
- Identify the date as Canvas's stored student deadline, with its collection
  time. A new response does not prove the server cache has been recomputed or
  resolve conflicting dates in announcements and external course websites.
- Opening and closing dates are not provided by this selection. Preserve any
  previous values only as last-known evidence with their original ages, and
  carry their uncertainty through the app, study plan, AI evidence and exports.
  Do not use a missing field to report unrestricted availability.
- Keep complete pagination, response identity, account/enrollment evidence,
  cancellation and bounded transport checks. Removing date resolvers does not
  automatically clear the remaining course permission and visibility paths.
- Regression cases now cover changed/null/missing cached dates, unmatched status
  records, retained availability ages and uncertainty-driven study tasks.

This component improves deadline collection, but it cannot supply assignment
instructions, readings, syllabus bodies or messages. Restoring those sources
remains part of the full personal study-guide objective.


Source references
-----------------

- [Planner controller and collection assembly](https://github.com/instructure/canvas-lms/blob/1c9f0bb8013ed69c4f2efe11fd483025469b7e6c/app/controllers/planner_controller.rb)
- [Dedicated Planner serializer](https://github.com/instructure/canvas-lms/blob/1c9f0bb8013ed69c4f2efe11fd483025469b7e6c/lib/api/v1/planner_item.rb)
- [User learning-object queries](https://github.com/instructure/canvas-lms/blob/1c9f0bb8013ed69c4f2efe11fd483025469b7e6c/app/models/user_learning_object_scopes.rb)
- [User section context codes](https://github.com/instructure/canvas-lms/blob/1c9f0bb8013ed69c4f2efe11fd483025469b7e6c/app/models/user.rb#L3184)
- [Course section visibility](https://github.com/instructure/canvas-lms/blob/1c9f0bb8013ed69c4f2efe11fd483025469b7e6c/app/models/course.rb#L3273)
- [Enrollment state getter and creation](https://github.com/instructure/canvas-lms/blob/1c9f0bb8013ed69c4f2efe11fd483025469b7e6c/app/models/enrollment.rb#L841)
- [Stored student deadline field](https://github.com/instructure/canvas-lms/blob/1c9f0bb8013ed69c4f2efe11fd483025469b7e6c/app/graphql/interfaces/submission_interface.rb#L298)
- [Course submissions connection](https://github.com/instructure/canvas-lms/blob/1c9f0bb8013ed69c4f2efe11fd483025469b7e6c/app/graphql/types/course_type.rb#L432)
- [Assignment stored-date scope](https://github.com/instructure/canvas-lms/blob/1c9f0bb8013ed69c4f2efe11fd483025469b7e6c/app/models/abstract_assignment.rb#L3458)
