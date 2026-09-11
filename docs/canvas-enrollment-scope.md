Canvas enrollment-scope review
==============================

Reviewed against upstream 1c9f0bb8013ed69c4f2efe11fd483025469b7e6c on
2026-09-10. This is a preflight design, not production admission or a claim
about UBC's deployed code. No authenticated request was made.

Why the saved course list is insufficient
----------------------------------------

The app's current courses operation requests enrollment_type=student and
enrollment_state=active. CoursesController.courses_for_user filters the enrollment
array before grouping it by course and passing it to CourseJson. The resulting
enrollments expose type, role, role_id, user_id, enrollment_state and the section
restriction flag, but additional role types have already been removed. Checking
that every returned entry says student cannot establish absence of other roles.
[Controller](https://github.com/instructure/canvas-lms/blob/1c9f0bb8013ed69c4f2efe11fd483025469b7e6c/app/controllers/courses_controller.rb),
[Course JSON builder](https://github.com/instructure/canvas-lms/blob/1c9f0bb8013ed69c4f2efe11fd483025469b7e6c/lib/api/v1/course_json.rb).

Removing the role filter would expose more current roles without requesting score
fields. It still would not close the check: Course policy explicitly grants
read_as_admin and view_unpublished_items for completed administrative enrollments
in a non-deleted course. An active-only list omits that evidence. Account-level
membership can also confer privileges independently of course enrollment.
[Course policies](https://github.com/instructure/canvas-lms/blob/1c9f0bb8013ed69c4f2efe11fd483025469b7e6c/app/models/course.rb).

The self-enrollment REST endpoint can enumerate broader states, but its index
always includes a user serialization, and enrollment_json adds grades_hash for
student enrollments. That invokes grade-permission checks and grade getters even
without optional include fields. These observations do not establish a write;
they make this endpoint a broader review surface than the role preflight needs.
Do not add it to the allowlist merely because the route contains users/self.
[Enrollment controller](https://github.com/instructure/canvas-lms/blob/1c9f0bb8013ed69c4f2efe11fd483025469b7e6c/app/controllers/enrollments_api_controller.rb),
[Enrollment serializer and grade getters](https://github.com/instructure/canvas-lms/blob/1c9f0bb8013ed69c4f2efe11fd483025469b7e6c/lib/api/v1/user.rb).

Minimal field-query candidate
----------------------------

[canvas-enrollment-scope.graphql](canvas-enrollment-scope.graphql) requests only
the bound user's enrollments in one selected course. It explicitly includes all
seven states in the pinned EnrollmentWorkflowState enum, avoids a type filter,
and paginates. It selects enrollment/user/section identifiers, workflow state,
type, section restriction and role identity. It selects no user object, grades,
scores, submissions, course progress, lock state or assessment contents.

The query validates against the pinned schema using GraphQL.js 16.11.0. Schema
validation establishes syntax/type compatibility only. It is not registered in
canvas-metadata.js or admitted by CanvasNetwork/CanvasMetadataTransport.

CourseType.enrollments_connection requires at least one of read_roster,
view_all_grades or manage_grades. It applies course enrollment visibility, then
the supplied state/user filters. A denied or null connection must stop preflight;
do not ask for additional privileges to obtain it. All returned user IDs must
match the verified account despite the server-side filter.
[Course resolver](https://github.com/instructure/canvas-lms/blob/1c9f0bb8013ed69c4f2efe11fd483025469b7e6c/app/graphql/types/course_type.rb).

The selected Enrollment fields read attributes or the role association. The _id
and userId resolvers pass through unless_hiding_user_for_anonymous_grading. That
helper consults feature/scoped context; it does not itself load an assignment or
calculate anonymous-grading permission. The query has no submission ancestor that
sets that context. A hidden/null identifier must still fail validation.
[Enrollment fields](https://github.com/instructure/canvas-lms/blob/1c9f0bb8013ed69c4f2efe11fd483025469b7e6c/app/graphql/types/enrollment_type.rb),
[Anonymous-grading helper](https://github.com/instructure/canvas-lms/blob/1c9f0bb8013ed69c4f2efe11fd483025469b7e6c/app/graphql/graphql_helpers/anonymous_grading.rb).

Visibility boundary
-------------------

Course.section_visibilities_for reads the current user's enrollment rows and
constructs section/type/admin descriptors. It includes concluded roles by default
and treats temporary enrollments separately using their enrollment state.
enrollment_visibility_level_for calculates full, limited, section or restricted
visibility from role/permission checks. apply_enrollment_visibility adds SQL
conditions; the query's final user-ID restriction narrows those results to self.
These functions contain no explicit progression evaluation or enrollment change.
Their permission and inherited enrollment-state dependencies remain part of the
existing review. A returned list is constrained by visibility, not a universal
account-role audit.

Acceptance and remaining work
-----------------------------

1. Finish the selected enrollment-state, permission-registry and account-membership
   dependencies. Resolve how account-wide elevated rights will be detected or
   supported; enrollment records alone cannot establish their absence. Preserve
   the institutional-version limitation in the final admission decision.
2. Add an exact operation/body contract only after that review. Bind course/user
   IDs to the current connection, use the same bounded transport and cancellation,
   and finish all pages before producing a scope result. Reject response errors,
   missing IDs/roles, foreign users, duplicate enrollment IDs and cursor cycles.
3. Combine the result with a freshly verified active course selection. Workflow
   state alone does not prove date-effective enrollment. Require supported student
   enrollment evidence; report mixed/custom/test-student or uncertain roles as
   unsupported until their permission behavior is reviewed. Do not silently drop
   conflicting rows or equate missing evidence with a normal student role.
4. Keep this evidence in the current run's account binding. Recheck on subsequent
   refreshes and invalidate on account/credential/scope changes. Do not reuse old
   enrollment evidence as fresh authorization, send it to the planner, or export
   role records into the personal study guide.
5. Exercise student-only, mixed-role, completed-teacher, custom-role, test-student,
   hidden/null, foreign-user, multi-section, pagination and cancellation cases
   before any institutional compatibility check. Preserve the production hold
   until the complete supported collection path is ready.

This preflight does not replace the requested instruction/material collection.
The full personal study-guide objective remains open. Pinned source downloads and
the schema validator remain in ignored .codex-temp/graphql-review; the temporary
validation script is .codex-temp/validate-enrollment-query.cjs.
