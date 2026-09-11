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

[canvas-enrollment-scope.graphql](canvas-enrollment-scope.graphql) now starts at
user(id: $studentId), bound to the verified signed-in user. Its
enrollmentsConnection fixes courseId, currentOnly: false and excludeConcluded:
false, omits role/type filters and paginates. It selects the parent user ID and
each enrollment's user/course/section IDs, raw workflow state, type, section
restriction and role identity. It selects no profile details, grades, scores,
submissions, course progress, lock state or assessment contents.

The query validates against the pinned schema using GraphQL.js 16.11.0. Schema
validation establishes syntax/type compatibility only. The matching runtime
request is admitted only by the isolated CanvasMetadataTransport candidate.
Production CanvasNetwork still denies it, and the refresh hold remains active.

The former course-rooted query was unsuitable for complete role evidence.
CourseType.enrollments_connection requires read_roster, view_all_grades or
manage_grades and applies enrollment visibility before state/user filters.
Course.apply_enrollment_visibility can remove concluded and inactive rows for
limited visibility even when filters explicitly request those states. Listing
every state does not undo that earlier restriction. That query is replaced,
not retained as a fallback.
[Course resolver](https://github.com/instructure/canvas-lms/blob/1c9f0bb8013ed69c4f2efe11fd483025469b7e6c/app/graphql/types/course_type.rb),
[Visibility implementation](https://github.com/instructure/canvas-lms/blob/1c9f0bb8013ed69c4f2efe11fd483025469b7e6c/app/models/course.rb).

UserType.enrollments_connection takes a distinct self-user branch. It selects
object.enrollments across in-region associated shards, joins courses, applies
the course ID and orders by enrollment ID. With both boolean filters false and
no type filter, this branch does not exclude concluded, inactive or deleted
enrollment rows. It does not invoke Course.section_visibilities_for. The direct
User.enrollments association has no workflow-state scope in the pinned model.
Missing joined course records cannot appear; the query is for one existing
selected course, and every returned node must identify that course explicitly.
[User resolver](https://github.com/instructure/canvas-lms/blob/1c9f0bb8013ed69c4f2efe11fd483025469b7e6c/app/graphql/types/user_type.rb),
[User associations and shard helpers](https://github.com/instructure/canvas-lms/blob/1c9f0bb8013ed69c4f2efe11fd483025469b7e6c/app/models/user.rb).

The self-user branch depends on a current verified identity, not merely a valid
ID. A switched administrator account could read another user's enrollments;
matching response payload IDs alone cannot detect that. The session watcher,
profile verification and the transport's response global-ID check provide
independent guards, with their documented institutional limitations. The global
ID is captured from the self-profile response and never inferred from a local ID.
GraphQLNodeLoader checks read_full_profile/read before its explicit self-user
fallback. Those account-policy dependencies are not bypassed by moving to this
query. The nested course selection loads only the association and legacy ID.
Authentication, inherited model hooks and institution-specific behavior still
belong in the complete-path review.
[Node loader](https://github.com/instructure/canvas-lms/blob/1c9f0bb8013ed69c4f2efe11fd483025469b7e6c/app/graphql/graphql_node_loader.rb).

The selected Enrollment fields read attributes or the role association. The _id
and userId resolvers pass through unless_hiding_user_for_anonymous_grading. That
helper consults feature/scoped context; it does not itself load an assignment or
calculate anonymous-grading permission. The query has no submission ancestor that
sets that context. A hidden/null identifier must still fail validation.
[Enrollment fields](https://github.com/instructure/canvas-lms/blob/1c9f0bb8013ed69c4f2efe11fd483025469b7e6c/app/graphql/types/enrollment_type.rb),
[Anonymous-grading helper](https://github.com/instructure/canvas-lms/blob/1c9f0bb8013ed69c4f2efe11fd483025469b7e6c/app/graphql/graphql_helpers/anonymous_grading.rb).

Why the old visibility path stays excluded
-----------------------------------------

Course.section_visibilities_for reads the current user's enrollment rows and
constructs section/type/admin descriptors. It loads concluded roles by default
and treats temporary enrollments separately using their enrollment state.
enrollment_visibility_level_for calculates full, limited, section or restricted
visibility from role/permission checks. apply_enrollment_visibility adds SQL
conditions; the query's final user-ID restriction narrows those results to self.
That does not mean the final roster includes all those rows: subsequent visibility
filters can remove them. The new self-enrollment query avoids this roster path;
assignment date overrides can still reach section visibility independently.

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

Temporary-enrollment admission gap (2026-09-11): the selected GraphQL enrollment
type does not expose temporary_enrollment_source_user_id or pairing ID. Its raw
workflow state and StudentEnrollment type do not directly establish absence of
temporary enrollment. Course.enroll_user assigns the temporary source/pairing
options when the feature is enabled without a type restriction at that point;
no admission rule should assume that a student label alone excludes this path.
The normal REST enrollment serializer exposes these fields conditionally, but
also computes temporary_enrollment_display_state and retains its broader
serialization dependencies, so it is not an automatic replacement.
AssignmentOverrideApplicator.section_overrides calls section_visibilities_for
with only deleted workflows excluded. The temporary-state getter therefore
remains relevant even when the current user's desired output is only deadlines.
Resolve this through reviewed evidence or a read path that does not reach that
getter before enabling the metadata collector. No temporary enrollment or
account change has been observed in the user's account.
[Enrollment field schema](https://github.com/instructure/canvas-lms/blob/1c9f0bb8013ed69c4f2efe11fd483025469b7e6c/app/graphql/types/enrollment_type.rb),
[Course enrollment and visibility](https://github.com/instructure/canvas-lms/blob/1c9f0bb8013ed69c4f2efe11fd483025469b7e6c/app/models/course.rb),
[Section override selection](https://github.com/instructure/canvas-lms/blob/1c9f0bb8013ed69c4f2efe11fd483025469b7e6c/lib/assignment_override_applicator.rb).

Targeted temporary-status candidate
----------------------------------

The pinned routes expose GET /api/v1/temporary_enrollment_status for
bulk_temporary_enrollment_status. Unlike the single-user status action, this
action explicitly skips get_course_from_section and require_context. A candidate
request would bind user_ids[] to the verified user, set limit=1 and omit
account/course/section context parameters. It must retain the same response
identity, redirect, request, body and cancellation guards as the isolated
metadata transport. It is not currently admitted or called by Canvas Weekly.

The action checks the temporary_enrollments feature and, when enabled, selects
authorized users using api_show_user. It returns per-user booleans from SQL
existence/pluck queries. active_by_date joins existing enrollment_states rows;
that helper does not call enrollment_state or ensure_current_state. The bulk
action does not call the enrollment JSON serializer or its temporary-display
state getter. The normal REST enrollment serializer does call that getter when
temporary enrollment is enabled, so it remains excluded as a shortcut.

The status result has narrower scope than the complete self-enrollment query:
temporary_enrollments_for_recipient uses active enrollment workflow state and
courses in available/claimed/created states. It does not prove that concluded,
inactive, invited or rejected rows are not temporary, even though section
overrides can inspect non-deleted rows. A future combined admission rule would
need complete selected-course enrollment evidence and an explicitly supported
state/course scope before using an is_recipient=false result. can_provide is not
evidence that a user is or is not a temporary recipient.

When the feature is disabled, bulk status returns an empty object. An empty
object can also result when no requested user survives lookup/authorization;
it must not be silently interpreted as a negative recipient result. Resolve
this distinction, cross-shard identity behavior and the full controller/auth
path before integrating this candidate. No live status request was made.
[Routes](https://github.com/instructure/canvas-lms/blob/1c9f0bb8013ed69c4f2efe11fd483025469b7e6c/config/routes.rb),
[Bulk status action](https://github.com/instructure/canvas-lms/blob/1c9f0bb8013ed69c4f2efe11fd483025469b7e6c/app/controllers/enrollments_api_controller.rb),
[Enrollment scopes](https://github.com/instructure/canvas-lms/blob/1c9f0bb8013ed69c4f2efe11fd483025469b7e6c/app/models/enrollment.rb).

Enrollment.has_permission_to? delegates to RoleOverride.enabled_for? and caches
the result in memory. Course.cached_account_users_for reads account memberships
through a Rails cache; account_membership_allows then invokes AccountUser's
permission helpers. The reviewed account-membership helpers are recorded in the
[permission review](canvas-metadata-permissions-review.md). Remaining selected
dependencies and account-wide privilege classification retain the production hold.

Offline response validation
---------------------------

src/canvas-enrollment-scope.js validates already-decoded responses, with the same
incremental reader used by the isolated collector. Every page is paired with its
requested cursor; the validator requires a complete chain, the bound parent user,
each node's course/user IDs, known raw states/types and explicit role/section
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

Seven synthetic tests cover these conditions, including multiple sections, a
completed teaching role, switched parent identities and foreign-course nodes on
later pages. Responses shaped like the withdrawn course-rooted query are rejected.
Production admission and permission classification remain unimplemented until
the dependency review is resolved.

Isolated request and transport integration
-----------------------------------------

enrollmentScopeRequest builds a frozen operation and variables. Its query AST
matches the documented candidate and validates against the pinned schema.
permittedEnrollmentScopeBody accepts only exact canonical JSON for the bound
course/user and a bounded cursor. Extra fields, changed filters, mutation names,
foreign IDs, added profile/grade selections and alternate envelopes are denied.
No query text comes from the renderer or planner.

collectEnrollmentScope requires an injected request function; it has no session,
credentials, origin or default fetcher. Each response passes the shared reader
before a subsequent request. It stops at 100 pages, 100 nodes per page, 2 MiB per
decoded page and 16 MiB in total. The reader retains only selected fields and
returns frozen evidence after the last page. Failures never return partial
evidence or upstream exception text. Cancellation is passed to the transport and
checked again before accepting a late result. Transport cancellation/deadlines
remain responsible for interrupting a pending request.

CanvasMetadataTransport admits this third fixed operation through its existing
single-use byte gate. The same origin, identity, cookie/token, redirect, timeout
and streaming limits apply. Enrollment pages share its 200-request/16-MiB budget
with metadata reads when the same instance is used. CanvasAudit records the
distinct metadataenrollments operation and body hash; it omits role records,
cursor values and credentials. This operation is not registered with the
production session and does not itself authorize later metadata operations.

Four additional enrollment unit cases cover the exact request boundary, complete
pagination, early failure/budget exhaustion and cancellation; the original seven
evidence cases still pass. Transport tests reject altered scope/filters before
authentication or networking. The actual Electron localhost HTTPS fixture reads
two enrollment pages with a concluded teaching role and rejects a foreign-user
response before requesting a second page. It also verifies persisted audit
redaction and the existing browser/redirect/CSRF protections. These are synthetic
account fixtures, not evidence of successful UBC access or account-wide privilege
classification. No live Canvas request was made.

Acceptance and remaining work
-----------------------------

1. Finish the selected enrollment-state, permission-registry and account-membership
   dependencies. Resolve how account-wide elevated rights will be detected or
   supported; enrollment records alone cannot establish their absence. Preserve
   the institutional-version limitation in the final admission decision.
2. Complete production connection wiring only after that review. The isolated
   exact-body transport and complete-page validation above are implemented and
   tested; passing those fixtures must not activate the real session gate.
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
