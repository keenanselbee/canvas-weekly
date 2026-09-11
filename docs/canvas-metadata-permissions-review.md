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


Remaining review before production admission
-------------------------------------------

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
