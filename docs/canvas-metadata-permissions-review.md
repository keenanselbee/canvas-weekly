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
| Assignment visibility | ScopedToUser calls DifferentiableAssignment.scope_filter, then AbstractAssignment.visible_to_students_in_course_with_da and AssignmentVisibilityService. The repository assembles a visibility SQL query and maps result rows to data objects. | This path selects eligible assignments; it does not call ContextModule.available_for? in the functions reviewed. Shared SQL helpers and feature branches are not fully closed out. |
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
request classification to bypass CSRF. Cookie naming, encoding, expiry and the
actual Electron session transport remain to be verified before use.
[Request-forgery source](https://github.com/instructure/canvas-lms/blob/1c9f0bb8013ed69c4f2efe11fd483025469b7e6c/lib/canvas/request_forgery_protection.rb).

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


Remaining review before production admission
-------------------------------------------

The functions above narrow the review; they do not close the whole call graph.
Finish the shared visibility SQL feature branches, section/observer/account
permission dependencies and selected role-registry callbacks. Confirm that
schema analyzers and any model load callbacks on the selected records do not
introduce learning-state writes. Complete session authentication and actual
Electron request-body admission tests using isolated fixtures first.

The pinned upstream source and passing schema checks cannot establish UBC's
deployed behavior. Record that limitation in the restoration decision, including
the supported identity/enrollment scope and the evidence used. A metadata-only
restoration must keep missing or old instructions visibly separate from fresh
deadlines. It does not complete the personal study-guide objective.

Downloaded upstream files remain in ignored .codex-temp/graphql-review for the
continuing audit. This milestone changes documentation only; it does not widen
the production network gate, run an account request, or change saved guides.
