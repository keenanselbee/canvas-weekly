Canvas metadata permission review
=================================

Reviewed 2026-09-10 against upstream revision
`1c9f0bb8013ed69c4f2efe11fd483025469b7e6c`. This review covers the two fixed
queries in canvas-metadata.js. It does not identify UBC's deployed revision,
certify the earlier collection, or authorize additional GraphQL fields.
No authenticated Canvas request was made. Production refresh remains paused.


Selected call paths
-------------------

| Component | Reviewed behavior | Consequence |
| --- | --- | --- |
| CoursePermissionsPreloader | Calls Course.preload_active_enrollments_for_permissions, which selects existing enrollments and populates enrollment caches. | No progression evaluation or enrollment transition identified in this preloader. |
| Course permission checks | Course lookup requires read permission. Course policies query enrollment state and delegate role/account permissions. Enrollment.has_permission_to? delegates to RoleOverride.enabled_for?. | Reading permission is not the same as invoking an action named by that permission. Account and role dependencies still need the bounded follow-up below. |
| Assignment visibility | ScopedToUser calls DifferentiableAssignment.scope_filter, then AbstractAssignment.visible_to_students_in_course_with_da and AssignmentVisibilityService. The repository and shared helpers assemble visibility SELECT/UNION/EXCEPT queries and map result rows to data objects. Both visibility_performance_improvements branches were reviewed. | Module/section/ADHOC/group joins read eligibility records; they do not instantiate ContextModule or evaluate progression in these functions. Feature configuration and inherited model behavior remain separate dependencies. |
| Override preloading | DatesOverridable loads assignment/module override records and associated IDs into object attributes. AssignmentOverrideApplicator preloads existing student override rows. | Loading module IDs for date overrides does not itself evaluate module progression. |
| Date calculation | assignment_with_overrides applies collapsed dates to a clone; setup_overridden_clone marks that clone readonly. Section enrollment flags are in-memory attributes; availability_expired? compares dates. | No assignment/date persistence call identified in these calculation functions. Keep description and lockInfo excluded: those follow a different path. |
| GraphQL operation hooks | subject and the two post-execution participation hooks match CreateSubmission or CreateDiscussionEntry. Neither matches the candidate's operation names. | The exact operationName is part of the safety boundary, including the JSON envelope, not just the query text. |
| Common controller bookkeeping | Enrollment activity requires a context enrollment. Participation logging requires an accessed asset. Default page-view setup requires GET. The fixed POST queries do not set those inputs through the reviewed GraphQL hooks. | This is a conditional source finding, not a promise that all request middleware is free of persistence. |

Permission, visibility and override helpers use server caches. In particular,
should_preload_override_students? explicitly writes a cache flag; the override
calculation also caches computed dates. The readonly clone does not mean that
the complete request makes zero server writes. It prevents saving that clone.
Authentication and request telemetry are separate from coursework, attempts,
message-read state and module progression.

Source locations at the pinned revision:

- [Course permission preloader](https://github.com/instructure/canvas-lms/blob/1c9f0bb8013ed69c4f2efe11fd483025469b7e6c/app/graphql/loaders/course_permissions_preloader.rb),
  [Course policies and enrollment caches](https://github.com/instructure/canvas-lms/blob/1c9f0bb8013ed69c4f2efe11fd483025469b7e6c/app/models/course.rb),
  [Enrollment role lookup](https://github.com/instructure/canvas-lms/blob/1c9f0bb8013ed69c4f2efe11fd483025469b7e6c/app/models/enrollment.rb),
  [Role permission calculation](https://github.com/instructure/canvas-lms/blob/1c9f0bb8013ed69c4f2efe11fd483025469b7e6c/app/models/role_override.rb).
- [Differentiated assignment scope](https://github.com/instructure/canvas-lms/blob/1c9f0bb8013ed69c4f2efe11fd483025469b7e6c/lib/differentiable_assignment.rb),
  [Assignment visibility scope](https://github.com/instructure/canvas-lms/blob/1c9f0bb8013ed69c4f2efe11fd483025469b7e6c/app/models/abstract_assignment.rb),
  [Visibility service](https://github.com/instructure/canvas-lms/blob/1c9f0bb8013ed69c4f2efe11fd483025469b7e6c/app/services/assignment_visibility/assignment_visibility_service.rb),
  [Visibility repository](https://github.com/instructure/canvas-lms/blob/1c9f0bb8013ed69c4f2efe11fd483025469b7e6c/app/services/assignment_visibility/repositories/assignment_visible_to_student_repository.rb),
  [Visibility cache](https://github.com/instructure/canvas-lms/blob/1c9f0bb8013ed69c4f2efe11fd483025469b7e6c/app/services/visibility_helpers/common.rb).
- [Override preloading](https://github.com/instructure/canvas-lms/blob/1c9f0bb8013ed69c4f2efe11fd483025469b7e6c/lib/dates_overridable.rb),
  [Override calculation and readonly clone](https://github.com/instructure/canvas-lms/blob/1c9f0bb8013ed69c4f2efe11fd483025469b7e6c/lib/assignment_override_applicator.rb),
  [Section enrollment and availability helpers](https://github.com/instructure/canvas-lms/blob/1c9f0bb8013ed69c4f2efe11fd483025469b7e6c/app/models/assignment_override.rb).
- [GraphQL controller](https://github.com/instructure/canvas-lms/blob/1c9f0bb8013ed69c4f2efe11fd483025469b7e6c/app/controllers/graphql_controller.rb),
  [Common controller hooks](https://github.com/instructure/canvas-lms/blob/1c9f0bb8013ed69c4f2efe11fd483025469b7e6c/app/controllers/application_controller.rb).


Authentication findings and transport requirements
-------------------------------------------------

AuthenticationMethods.graphql_type_authorized? allows only the root Query type
when the token's developer key requires scopes. Such a token cannot read the
Course type needed here. This is an upstream compatibility limit, not an error
to work around by requesting an unrestricted token. load_user can initialize
authentication cookies and session identity; token authentication calls used!.
Do not describe either authentication mode as having no persistent effects.
[Authentication source](https://github.com/instructure/canvas-lms/blob/1c9f0bb8013ed69c4f2efe11fd483025469b7e6c/lib/authentication_methods.rb).

Canvas's request-forgery protection accepts a valid X-CSRF-Token for session
requests. It separately handles API requests classified as outside the app.
The future collector must use the intended session token mechanism, not spoof
request classification to bypass CSRF. The stock cookie mechanism has since been
reviewed and implemented in an isolated helper; institutional session behavior
and verified connection binding remain prerequisites before use. See
[transport status](canvas-metadata-design.md).
[Request-forgery source](https://github.com/instructure/canvas-lms/blob/1c9f0bb8013ed69c4f2efe11fd483025469b7e6c/lib/canvas/request_forgery_protection.rb).

MaskingSecrets names the cookie _csrf_token and encodes a 32-byte mask plus a
32-byte masked secret in strict Base64. It remasks the cookie when creating an
authenticity token. Canvas's shared Axios configuration uses that cookie and
X-CSRF-Token. The candidate reads the scoped Electron cookie without writing it,
decodes URL escaping once and requires canonical encoding. It accepts only the
stock secure root-path shape and checks persistent-cookie expiry; ambiguous or
nonstandard cookies stop collection. Local fixtures validate the actual Electron
cookie-to-header path, not successful authentication against UBC.
[Masked-token implementation](https://github.com/instructure/canvas-lms/blob/1c9f0bb8013ed69c4f2efe11fd483025469b7e6c/gems/canvas_breach_mitigation/lib/canvas_breach_mitigation/masking_secrets.rb),
[Canvas Axios configuration](https://github.com/instructure/canvas-lms/blob/1c9f0bb8013ed69c4f2efe11fd483025469b7e6c/ui/shared/axios/index.js).

The transport acceptance checks must include:

- Exact HTTPS origin and /api/graphql path, with no query string or fragment.
  Accept only the canonical JSON envelope; never add course_id, session_token,
  as_user_id, impersonation parameters, interaction_seconds or page_view_token.
- Bind course and student IDs to the verified connection, not renderer input.
  Abort if the connection changes during collection. Reject known impersonation
  and unsupported enrollment roles instead of silently taking an admin/observer
  branch. Do not assume an ID string establishes the account's role.
- Fix operationName, query and variables together. Deny alternate operations,
  fields, request methods, browser borrowing, redirects and content-type tricks.
- Stop on authentication, scope or GraphQL errors. Do not retry with broader
  credentials, fall back to withdrawn REST reads, or navigate to assessment pages.
- Keep authentication material out of logs, generated guides, AI prompts and
  raw error messages. Receive response bytes under a limit before JSON parsing.


Visibility, analyzers and model-loading follow-up
------------------------------------------------

The complete VisibilitySqlHelper and AssignmentVisibleToStudentRepository were
reviewed, including section and ADHOC alternatives controlled by
visibility_performance_improvements. The shared helper generates SQL fragments;
the repository executes the composed selection and constructs plain result
objects. Joining module and content-tag tables here does not call their model
availability methods. This closes the previously open SQL-builder branches, not
all account feature checks.
[Shared SQL helper](https://github.com/instructure/canvas-lms/blob/1c9f0bb8013ed69c4f2efe11fd483025469b7e6c/app/helpers/visibility_sql_helper.rb).

CanvasSchema registers three analyzers. CanvasAntiabuseAnalyzer counts aliases
and directives and can emit metrics/errors. LogQueryComplexity logs a computed
complexity. ConversationComplexityAnalyzer is relevant even though the fixed
queries contain no createConversation field: when its feature and Redis are
enabled, result increments a per-user Redis counter by zero and can initialize
or refresh its expiry. An already-exceeded counter can reject these reads.
No message is created by that analyzer. Do not call this path free of all server
state changes or retry a rate-limit failure with different credentials.
[Schema](https://github.com/instructure/canvas-lms/blob/1c9f0bb8013ed69c4f2efe11fd483025469b7e6c/app/graphql/canvas_schema.rb),
[Anti-abuse analyzer](https://github.com/instructure/canvas-lms/blob/1c9f0bb8013ed69c4f2efe11fd483025469b7e6c/app/graphql/analyzers/canvas_antiabuse_analyzer.rb),
[Complexity logger](https://github.com/instructure/canvas-lms/blob/1c9f0bb8013ed69c4f2efe11fd483025469b7e6c/app/graphql/analyzers/log_query_complexity.rb),
[Conversation analyzer](https://github.com/instructure/canvas-lms/blob/1c9f0bb8013ed69c4f2efe11fd483025469b7e6c/app/graphql/analyzers/conversation_complexity_analyzer.rb).

BaseAnalyzer's extra helpers read query arguments and report Sentry diagnostics;
GraphQLTuning reads plugin settings. These are not assessment actions. Framework
tracers and institutional extensions are not certified by that observation.
[Analyzer base](https://github.com/instructure/canvas-lms/blob/1c9f0bb8013ed69c4f2efe11fd483025469b7e6c/app/graphql/analyzers/base_analyzer.rb),
[Tuning](https://github.com/instructure/canvas-lms/blob/1c9f0bb8013ed69c4f2efe11fd483025469b7e6c/app/graphql/graphql_tuning.rb).

The selected model files declare no after_find/after_initialize callbacks:
Assignment, AbstractAssignment, Submission, Course, Enrollment, CourseSection,
AssignmentOverride, Account and Role. ApplicationRecord only marks the base class
abstract. Role's association helper registers a before_save callback, while role
lookup reads existing rows. This is a direct-declaration inventory, not proof
about inherited concerns, framework initializers or all getter implementations.
Those must stay in the remaining review instead of being silently cleared by a
text search. Temporary pinned sources remain under .codex-temp/graphql-review.
[ApplicationRecord](https://github.com/instructure/canvas-lms/blob/1c9f0bb8013ed69c4f2efe11fd483025469b7e6c/app/models/application_record.rb),
[Role](https://github.com/instructure/canvas-lms/blob/1c9f0bb8013ed69c4f2efe11fd483025469b7e6c/app/models/role.rb).


Enrollment and permission-query decision (2026-09-10)
---------------------------------------------------

The course roster query cannot prove a user's complete course-role history:
apply_enrollment_visibility can remove inactive/concluded enrollments before the
query's explicit state filter. The enrollment candidate now uses the self-user
connection, which avoids that roster-visibility branch and includes a course ID
on each node. The [updated enrollment review](canvas-enrollment-scope.md) records
the selected resolver and remaining identity/account-policy dependencies.

Course.permissions in the pinned GraphQL schema exposes becomeUser, manageGrades,
sendMessages, viewAllGrades and viewAnalytics. It exposes neither readAsAdmin nor
the granular assignment/content permissions. False grade permissions alone cannot
establish absence of the rights used by differentiated assignment visibility.
Do not treat this field as a complete privilege preflight.

The REST course permissions endpoint accepts selected permission names, but
CoursesController.permissions calls get_context. For a course, that populates
@context_enrollment; the controller's update_enrollment_last_activity_at hook
then has an enrollment to pass to RecentActivity.record_for_access. This is a
different controller path from the reviewed context-free GraphQL POST. It is not
an admitted substitute for the missing GraphQL permission fields. Follow-up
review of RecentActivity confirms thresholded update_all_locked_in_order writes
to enrollment.last_activity_at and, in some cases, total_activity_time. Its
record_for_access ignores 4xx/5xx responses but can record a successful read.
Separately, check_for_readonly_enrollment_state returns immediately for non-HTML
requests, so its date-state recalculation is not reached for a JSON request.
Do not conflate those two paths. No live request was used to test either.
[Course controller](https://github.com/instructure/canvas-lms/blob/1c9f0bb8013ed69c4f2efe11fd483025469b7e6c/app/controllers/courses_controller.rb),
[Context and activity hooks](https://github.com/instructure/canvas-lms/blob/1c9f0bb8013ed69c4f2efe11fd483025469b7e6c/app/controllers/application_controller.rb),
[Activity recorder](https://github.com/instructure/canvas-lms/blob/1c9f0bb8013ed69c4f2efe11fd483025469b7e6c/app/models/enrollment/recent_activity.rb).

The next account-level preflight candidate is GET /api/v1/accounts, without
optional includes. AccountsController.index paginates
current_user.all_paginatable_accounts. The pinned User implementation wraps
adminable_accounts_scope, which selects active AccountUser account IDs and active
Accounts across associated shards; it does not first filter by a named privilege.
That offers a way to reject accounts with administrative membership without
assuming false grade permissions cover all course privileges. It is distinct
from /accounts/manageable, which additionally filters course-management rights
and would lose relevant evidence. Complete the index controller's get_context,
student-view rejection, pagination and default account_json review before
admission. Empty responses must be authenticated and complete, never inferred
from an error. Institutional shard/role behavior remains a limitation.
[Account controller](https://github.com/instructure/canvas-lms/blob/1c9f0bb8013ed69c4f2efe11fd483025469b7e6c/app/controllers/accounts_controller.rb),
[Account membership scope](https://github.com/instructure/canvas-lms/blob/1c9f0bb8013ed69c4f2efe11fd483025469b7e6c/app/models/user.rb).

Account-list follow-up: with the fixed /api/v1/accounts index route and no context
ID parameters, get_context does not select a course or populate
@context_enrollment. Its setup_live_events_context call assembles request/user
metadata. reject_student_view_student checks fake_student? and rejects that mode;
the normal index retains the inherited require_user hook. Thus an unauthenticated
empty list must not be accepted by the future client even though the index has
an internal nil-user fallback.

The default account_json selects account identity/configuration attributes,
storage-quota getters, timezone and optional SIS identifiers gated by account
permissions. It does not select course/module/assessment objects. The quota
getters read configured or inherited values, sometimes through Rails cache;
TimeZoneHelper converts the stored/default zone in memory. Api::V1::Json passes
the named attributes/methods to as_json with include_permissions false. Optional
services, registration and counts remain excluded. account_json also invokes
registered extension callbacks, an explicit institutional compatibility boundary;
the stock serializer's read_only argument is not passed by index and is not a
documented request flag. Do not invent a query parameter to activate it.
ShardedBookmarkedCollection wraps/merges per-shard read relations. The candidate
needs a fixed GET contract and complete authenticated-empty-response validation;
it is not registered with the app's network gate yet.
[Account serializer](https://github.com/instructure/canvas-lms/blob/1c9f0bb8013ed69c4f2efe11fd483025469b7e6c/lib/api/v1/account.rb),
[JSON helper](https://github.com/instructure/canvas-lms/blob/1c9f0bb8013ed69c4f2efe11fd483025469b7e6c/lib/api/v1/json.rb),
[Timezone getter](https://github.com/instructure/canvas-lms/blob/1c9f0bb8013ed69c4f2efe11fd483025469b7e6c/lib/time_zone_helper.rb),
[Sharded pagination](https://github.com/instructure/canvas-lms/blob/1c9f0bb8013ed69c4f2efe11fd483025469b7e6c/app/models/sharded_bookmarked_collection.rb).

Response identity follow-up: the controller emits current_user.global_id in
X-Canvas-User-Id and the real user's global ID during impersonation. Profile
verification now captures that ID alongside the local profile ID. The isolated
transport requires the verified global ID and rejects missing/mismatched or
impersonated response identity before accepting a body. See the implemented
[response identity boundary](canvas-metadata-design.md). This complements the
cookie watcher without asserting that the returned ID proves enrollment rights.

The override helpers reviewed in this pass select existing adhoc, group, tag,
observer, section and course overrides and apply dates to a readonly clone.
preload_for_nonactive_enrollment assigns an in-memory flag from enrollment
workflow rows. user_has_been_admin? and user_has_no_enrollments? use existing
enrollments and cached existence checks. The lenient administrator-date branch
requires prior administrator enrollment or no course enrollment, plus granular
assignment-management permission. Verified student-only enrollment evidence
therefore addresses that branch; it does not by itself close assignment
visibility's separate account-permission checks. Section visibility's temporary
enrollment-state getter remains a separate dependency.
[Override implementation](https://github.com/instructure/canvas-lms/blob/1c9f0bb8013ed69c4f2efe11fd483025469b7e6c/lib/assignment_override_applicator.rb).

An additional inventory of 26 inherited concerns found no declarations of
after_find or after_initialize. Reviewed inclusion blocks in ContextModuleItem,
HasContentTags, LinkedAttachmentHandler, Plannable, Scannable, SmartSearchable,
MasterCourses::Restrictor, Workflow and SimplyVersioned register associations,
validation/save/commit hooks or explicit methods. Those declarations do not make
a selected read call their save hooks. FeatureFlags.persist_result reports
metrics and can publish sampled analytics; its name does not imply a coursework
save. This remains a bounded source review: selected overridden getters, other
concerns and institutional extensions are not certified by a callback-name search.
Temporary sources are cached as concern--*.rb under .codex-temp/graphql-review.

Remaining review before production admission
-------------------------------------------

Account-membership follow-up (2026-09-10): AccountUser.permission_check delegates
to enabled_for?, which caches RoleOverride.enabled_for?; permitted_for_account?
returns a policy Success object. These helpers do not call the model's nearby
registration, notification, save or destroy methods. RoleOverride.permission_for
and uncached_permission_for read roles/account chains/overrides, calculate an
in-memory permission hash and cache it. enabled_for? adjusts the allowed scope;
it does not execute the named permission. The pinned registry entries for
manage_grades, view_all_grades, read_roster, read_course_content and the three
manage_assignments add/edit/delete permissions contain no account_allows callback.
Other selected permissions and inherited dependencies are not cleared by this
observation. ObserverEnrollment.observed_students and observed_student_ids select
existing enrollment/user associations; the restricted-access option adds an SQL
join to enrollment_states rather than recalculating those states in that helper.
[Account membership helpers](https://github.com/instructure/canvas-lms/blob/1c9f0bb8013ed69c4f2efe11fd483025469b7e6c/app/models/account_user.rb),
[Permission registry](https://github.com/instructure/canvas-lms/blob/1c9f0bb8013ed69c4f2efe11fd483025469b7e6c/config/initializers/permissions_registry.rb),
[Observer helpers](https://github.com/instructure/canvas-lms/blob/1c9f0bb8013ed69c4f2efe11fd483025469b7e6c/app/models/observer_enrollment.rb).

The functions above narrow the review; they do not close the whole call graph.
Finish section/observer/account permission dependencies and selected permission-
registry callbacks. Complete inherited model-load concern and selected getter
review; the direct declarations and registered analyzers above are now inventoried.
Complete the verified account/enrollment binding
and institutional session authentication. Actual Electron request-body admission
has since passed the isolated fixture described in the transport design.

The [enrollment-scope follow-up](canvas-enrollment-scope.md) records the filtered-
course-list and completed-role limitations, compares the self-enrollment REST
serializer, and supplies a schema-validated minimal query for the next preflight
implementation. It does not authorize that query or certify account-wide roles.

The pinned upstream source and passing schema checks cannot establish UBC's
deployed behavior. Record that limitation in the restoration decision, including
the supported identity/enrollment scope and the evidence used. A metadata-only
restoration must keep missing or old instructions visibly separate from fresh
deadlines. It does not complete the personal study-guide objective.

Downloaded upstream files remain in ignored .codex-temp/graphql-review for the
continuing audit. The original review milestone changed documentation only.
The subsequent isolated transport work does not widen the production network
gate, run an account request, or change saved guides.
