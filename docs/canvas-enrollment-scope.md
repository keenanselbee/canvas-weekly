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
These functions contain no explicit progression evaluation or enrollment change,
but that does not establish the same property for their getters. A returned list
is constrained by visibility, not a universal account-role audit.

Enrollment-state dependency findings
-----------------------------------

EnrollmentDateBuilder.preload_state only preloads the association; its separate
build method writes a date-range cache. EnrollmentState.active? compares the
stored state without calling ensure_current_state. However, Enrollment overrides
the enrollment_state getter: if the association remains missing after reload,
create_enrollment_state uses first_or_create. The temporary-enrollment branch of
section_visibilities_for calls that getter. Association preloading therefore does
not prove an absence of database writes for missing state rows.
[Enrollment date builder](https://github.com/instructure/canvas-lms/blob/1c9f0bb8013ed69c4f2efe11fd483025469b7e6c/lib/canvas/builders/enrollment_date_builder.rb),
[Enrollment getter](https://github.com/instructure/canvas-lms/blob/1c9f0bb8013ed69c4f2efe11fd483025469b7e6c/app/models/enrollment.rb).

The separate EnrollmentState.ensure_current_state path recalculates access/date
state and saves changes. This is not always only cache maintenance: when an
expired temporary enrollment reaches calculate_state_based_on_dates, it can call
enrollment.conclude, deactivate or destroy. Enrollment.state_based_on_date reaches
that recalculation through get_effective_state. The section-visibility active?
call above does not itself invoke it. Reachability through the remaining selected
permission dependencies is unresolved; neither actual execution nor an account
change at UBC has been established. Do not generalize these methods into a claim
that all enrollment reads are harmless or all enrollment reads change accounts.
[Enrollment-state model](https://github.com/instructure/canvas-lms/blob/1c9f0bb8013ed69c4f2efe11fd483025469b7e6c/app/models/enrollment_state.rb).

Enrollment.has_permission_to? delegates to RoleOverride.enabled_for? and caches
the result in memory. Course.cached_account_users_for reads account memberships
through a Rails cache; account_membership_allows then invokes AccountUser's
permission helpers. Those helpers and selected registry callbacks still need
review. These findings retain the production hold.

Offline response validation
---------------------------

src/canvas-enrollment-scope.js validates already-decoded synthetic responses. It
has no request builder, transport, production registration or authorization result.
Every page is paired with its requested cursor; the validator requires a complete
chain, bound course/user IDs, known raw states/types and explicit role/section
fields. It rejects partial GraphQL errors, missing/duplicate identities, cursor
cycles, empty evidence, excess pages/nodes/bytes and cancellation. Errors exclude
upstream text. Output copies and freezes selected fields only.

Mixed, custom, completed, inactive and test roles remain in the evidence rather
than being silently removed. A role name is not treated as proof of built-in
privileges. Passing validation does not establish date-effective enrollment,
account-wide rights, current-session identity or safe request execution. The
future transport must enforce request/stream/time limits before decoding; this
validator's decoded-size checks do not replace that boundary. No evidence is
persisted, exported or sent to the planner by this module.

Six synthetic tests cover these conditions, including multiple sections and a
completed teaching role. Runtime admission and permission classification remain
unimplemented until the dependency review is resolved.

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
