Implementation milestones
=========================

The user authorized implementation and DIFF followed by COMMIT for each suitable
milestone. The active goal is the usable personal Windows app, with explicit
account-dependent validation gaps. Keep this file current as work progresses.

Current objective: the [revised evidence and AI guide goal](evidence-first-plan.md)
supersedes universal factual study planning. Preserve the desktop and safety
requirements while prioritizing export for online AI chats and full connected
weekly-guide generation. E1 below is delivered; E2-E4 remain active work.


Milestone ledger
----------------

| Milestone | Deliverable | Acceptance | State |
| --- | --- | --- | --- |
| M0 | Product, UX, architecture and delivery plan; existing output initializer | Documents agree with the user's boundaries; Desktop/override verified | Complete: 8eb1b63 |
| M1 | Native desktop shell, navigation, appearance and saved settings | App launches; system/light/dark work; folder picker; light/dark visual QA | Complete: 49a892d |
| M2 | Canvas connection and restricted course collection | Allowlist, redirects, pagination, assessment metadata, preserved read state tested | Restricted metadata refresh enabled with optional reviewed message/syllabus reads; tightened live UBC login and deployment compatibility still require validation |
| M3 | Persistent weekly guide and updates | Week/DST, same-week revisions, notes, partial scans and changes tested | Complete: ddd9975; synthetic end-to-end verified |
| M4 | ChatGPT connection and optional planning | Official login, process lifecycle, bounded evidence, graceful fallback | Live account restoration and validated synthetic planning verified with pinned CLI; full-course quality review pending |
| M5 | Broader course evidence and Word output | Sources/coverage visible, document render verified, no unsupported completeness claims | Reviewed course-message/syllabus reads, public/Basic websites, scoped PDF/DOCX text and Word export implemented; six-page native Word render verified; automatic Canvas instructions/pages/files, live sites and browser-login sites remain incomplete |
| M6 | Windows package and end-to-end review | Installable local artifact, no secrets, first-run UX, refresh/reconnect tested | Unsigned x64 installer built; package inventory, matching installer payload, first-run themes and bundled Codex tested; installation walkthrough and live reconnect pending |
| E1 | Shared evidence pack and Export for AI | Full normalized text, source IDs/coverage, explicit AI omissions, offline export and protected files | Implemented; 166 unit tests and synthetic desktop refresh passed |
| E2 | Full connected weekly guide | Standalone generation from saved evidence; source-linked tasks and questions; failure preserves prior guide | Core generation, shared views and opt-in personal preferences implemented; live quality review pending |
| E3 | Improve permitted source coverage | Evidence-driven source additions with provenance and safety review | Pending; no collection permissions expanded by E1 |
| E4 | Collection and AI routes in the primary UX | Simple collection/coverage/export/generate flow, useful factual fallback, desktop release checks | Explicit collection/export/generate interface and recorded-work reference implemented; release and live-course review pending |

Scheduling, multi-provider support, public distribution and hosted service are
subsequent enhancements. They are documented product directions, not prerequisites
for the first personal release. Never claim live account integration is tested
without a real successful run. Human login is a required external step.


DIFF and COMMIT procedure
-------------------------

At each milestone inspect status, relevant new files and diff, run the documented
checks, then publish a concise DIFF proposal listing exact files and commit title.
COMMIT executes that proposal if those files remain unchanged, using explicit
paths, git diff --cached --check, and the style in commit-style.md. If files change,
review and propose again first. Report commit hash and validation. Authorization
persists across milestones; no repeated permission question is needed.

Pre-existing unrelated files remain untouched and unstaged. Do not commit machine
state, sample exports, node_modules, user credentials or build artifacts. No push
or remote publishing is part of this local milestone authorization.


Release acceptance scenarios
----------------------------

1. A new user opens the app, sees clear setup, chooses output and connects Canvas.
2. A factual weekly guide works without ChatGPT; AI connection adds interpretation.
3. Available assessments appear once, with exact dates and source links, without
   starting/resuming a quiz or retrieving questions/answers.
4. A changed deadline updates the same weekly file and shows old/new values.
5. A Monday rollover creates a new week while preserving overdue work and notes.
6. Failed or cancelled scans preserve the previous guide and show stale coverage.
7. Login expiry requests reconnect and never becomes an empty successful result.
8. Course-message text uses only the reviewed fixed GraphQL discovery/detail
   operations, with no read-state update or send operation. REST conversation
   reads remain disabled because their attachment serializers invoke lock checks.
9. Theme follows Windows live; manual light/dark overrides survive restart.
10. Package excludes all developer state and opens correctly from a path with spaces.


Work log
--------

- 2026-09-10: Existing output initializer resolves Desktop/Canvas Weekly and accepts
  an absolute override. Added Windows UX, architecture, milestones and acceptance.
  Chose Electron with a minimal renderer and separate collector/planner boundaries.
- 2026-09-10: M1 added a sandboxed native-window app, theme persistence and system
  updates, output folder dialog, navigation and labeled sample preview. Two unit
  tests and Electron navigation/theme/isolation/minimum-size checks pass. Inspected
  light/dark screenshots. Fixed a test race by waiting for settings save completion.
- 2026-09-10: M2 added isolated Canvas login, encrypted optional API token storage,
  course selection, fixed read operations, protected pagination, bounded responses,
  timeout/retry/cancellation and per-source failures. Seven unit tests plus desktop
  checks pass. No live account has been used. Broader source detail is tracked in M5.
- 2026-09-10: M2 committed as 1657c61. User screenshot confirms browser login;
  session API access still awaits verification. Added automatic return after a
  successful profile read to improve the login flow.
- 2026-09-10: M3 added normalized facts, assignment-specific date precedence,
  stale-source retention, deterministic changes, timezone-aware week identity,
  Markdown export/revisions, preserved notes, manual-edit protection and account
  isolation. Twelve unit tests and a synthetic full desktop refresh pass. DST
  test uses Los Angeles explicitly rather than assuming Vancouver's DST rules.
- 2026-09-10: M4 added official app-server login, account state, executable picker,
  isolated credentials, bounded evidence and source-validated suggestions. Real
  installed Codex handshake/account read succeeds without using existing account
  credentials. Fifteen unit tests and both desktop workflows pass. A real model
  planning turn still needs the user's separate ChatGPT sign-in.
- 2026-09-10: Follow-up connection repair exposes failed profile checks instead
  of silently leaving the Canvas login window open. Startup checks saved sessions,
  successful checks flush cookie storage without extending expiry, and account
  changes clear course selections. The screenshot's dashboard widget failure
  does not establish API failure; live API access remains unverified. Desktop
  checks cover visible expiry errors and account-switch isolation.
- 2026-09-10: The user's live refresh saved Desktop/Canvas Weekly/2026-09-07/
  Weekly Plan.md: four courses, 65 assessment records, 16 upcoming and 33 undated
  outstanding items, no outstanding dated items in the current week. Six source
  categories returned 403/404 across those courses and are recorded as gaps.
  This was factual mode (AI suggestions disabled). ChatGPT login is user-reported;
  a real model planning turn still requires verification.
- 2026-09-10: Expanded course evidence with page-list bodies, module item lists,
  course message details preserving unread state, calendar events and rubrics.
  Added HTML parsing, credential-line redaction, source links, stale retention
  and course-content diffs. Confirmation notices expire and can be dismissed;
  the sidebar names ChatGPT via Codex and indicates when suggestions are off.
- 2026-09-10: Committed expanded evidence as 7da7e5b. All 19 tests and both
  desktop workflows pass. The restarted live app confirms ChatGPT connected and
  retains the 65-item offline guide. Canvas authorization did not survive this
  browser session restart and requires human sign-in again.
- 2026-09-10: Safety audit found that module GET listings can create/evaluate
  student progression. Disabled modules/moduleItems and blocked module browser
  routes, preserving previous evidence as stale with unsupported coverage. Added
  regression checks for denied reads and history preservation. Historical account
  invariance remains unprovable; see safety-audit.md. No live refresh was issued.
- 2026-09-10: Added flushed collector intent/outcome logs in private app storage.
  Logging failure prevents the request or stops that source. Tests cover request
  ordering, pagination, credential/content exclusion and failed logging/network.
  Corrected the synthetic desktop test to await the current refresh instead of
  occasionally inspecting the prior guide. Login traffic is outside this ledger.
- 2026-09-10: Added exact pending-request network admission, denying unsolicited
  session reads and browser API traffic even during human login. A local HTTPS
  fixture exercises the real Electron session guard, with an ephemeral test
  certificate and isolated storage. It confirms approved requests arrive while
  module/message reads, quiz-submission writes and redirect targets do not.
  No live Canvas request was issued. UBC SSO with this stricter gate remains
  unverified; external login origins are not individually allowlisted.
- 2026-09-10: Added a personal study-plan layer with suggested preparation days,
  weekly materials checks, concrete verification prompts and source links.
  Local preparation checkmarks persist separately per account and reopen when
  requirements change. Open guide exports checkmarks without Canvas or AI access.
  Thirty unit tests and synthetic desktop refresh/progress checks pass; inspected
  light and dark study-plan renderings. Richer AI planning and document output remain.
- 2026-09-10: Expanded AI output to source-specific steps, suggested dates and
  verification checks. Required/optional labels require a matching source quote
  and remain explicit AI interpretations. Windows denied execution of the CLI
  inside the Store app; added the official @openai/codex 0.154.0 package and default
  Windows runtime resolution. The app's saved ChatGPT account restored and returned
  a validated synthetic lab plan with required reading, optional practice and
  missing-information checks. No Canvas request or real course prompt was used.
  Thirty-three unit tests and the synthetic desktop refresh pass, including AI
  step rendering, unchanged deadlines, local progress reopening after changes,
  and offline export. Inspected the AI plan in dark mode with collapsible quotes.
- 2026-09-10: Open guide now opens a standalone HTML study guide with navigation,
  local progress snapshots, system-aware appearance and print styles. Markdown
  remains available. Added paired document ownership/revisions, legacy-folder
  migration and rollback on ordinary file failures. Thirty-five unit tests and
  synthetic desktop refresh pass; document checks and visual inspection cover
  light, dark, narrow and print styling without automatic network requests.
  Word export and actual PDF pagination review remain pending.
- 2026-09-10: Re-exported the user's saved four-course snapshot locally to the
  existing Desktop/Canvas Weekly week folder. Inspected the actual HTML plan and
  verification section: 53 preparation/check tasks, 50 prompts, no horizontal
  overflow or automatic HTTP requests. Preserved the original collection time
  and factual mode. The large undated backlog includes possibly historical exam
  resources; prioritization/applicability needs review before calling this a
  finished personal study plan. No fresh Canvas scan or real-course AI call ran.
- 2026-09-10: Implemented per-course public/HTTP Basic website connections, scoped
  HTML/text reads, encrypted local credentials and request intent/outcome logs.
  Courses now supports discovered links, add/check/login/remove, and guide updates
  include website evidence with stale retention and content diffs. Forty
  unit tests and the synthetic desktop flow pass. A real local HTTPS fixture
  verifies GET/auth sequencing, TLS with a fixture-only CA, DNS pinning, rejected
  redirects/private addresses, byte limits and cancellation. It exposed and fixed
  an oversized-response completion race. Inspected the login form in both themes.
  Failed website logins stop the crawl and suspend automatic credential retries;
  images and embedded media remain explicit uncollected references.
  No actual Canvas or university course-site request ran. DATA 311 compatibility,
  browser-only login, linked PDF/DOCX contents and Word export remain unverified
  or unfinished as detailed in external-course-sources.md.
- 2026-09-10: Added Word output from the same Markdown study-plan content with
  native headings/lists, safe source links and progress labels. Export ownership,
  revisions, manual-edit protection and rollback now work with binary files.
  Identical Word input reuses verified prior bytes to avoid redundant revisions.
  Structural checks exposed duplicate default style IDs; corrected the style
  configuration and added regression coverage. Word content/layout-token tests,
  file-lock rollback and synthetic desktop refresh pass. LibreOffice is absent;
  Word page rendering remains explicitly unverified. No Canvas account was used.
- 2026-09-10: Separated items with neither due nor closing times into per-course
  Timing to confirm groups, preserving task IDs, progress, source links and all
  per-item checks. Weekly course checks remind the student to review applicability.
  Closing-time-only items remain in the dated plan; AI cannot invent timing for
  the unscheduled group. Forty-three unit tests and the synthetic desktop flow
  pass, including focus/open-state after checking a review item. Inspected both
  app themes and the actual saved HTML without network requests. The existing
  four-course snapshot now has 21 dated plan tasks and 32 timing-review tasks,
  with 17 general checks and remaining checks alongside their review items.
  Re-exported locally without fresh Canvas or AI access. Workload balancing,
  full-course AI quality and Word page rendering remain acceptance gaps.
- 2026-09-10: Built an unsigned per-user x64 NSIS installer with the pinned Codex
  runtime and an explicit application-source allowlist. Package tests compare
  source contents and installer payloads, reject private state and development
  dependencies, and launch the actual packaged app with an isolated profile.
  Bundled Codex initializes with no account, Desktop default resolves correctly,
  and appearance persists across restart. Inspected light/dark first-run views.
  Initial archive inspection used incompatible path separators; fixed the verifier.
  A hidden-window screenshot timed out; making the test window visible resolved
  capture. No real accounts, installer execution, signing or publishing were used.
  Installation/uninstallation and clean-machine acceptance remain open.
- 2026-09-10: Added PDF/DOCX text readers for in-scope website documents. Binary
  HTTPS bodies feed cancellable workers; ZIP expansion, PDF page count, text and
  time limits are enforced. PDF evaluation/font fetching and XML DTDs are disabled.
  Visual/scan/layout limitations remain partial coverage, with source links and
  stale retention after failures. Forty-six unit tests and the local HTTPS fixture
  pass. Rebuilt the installer and verified both readers within the actual packaged
  app alongside prior package checks. No real course site or Canvas was read.
  Canvas-hosted file downloads, browser login, OCR and Word render QA remain open.
- 2026-09-10: Reviewed Canvas file-content access before enabling it. Upstream
  standard downloads/previews can update module view progress. Kept those routes
  disabled and added explicit guards across login/file-host and website boundaries.
  File names and original links remain in the guide with a new file-content safety
  gap. Documented the alternative storage-access review still required in
  canvas-file-access.md. Forty-eight unit tests and the actual Electron/local HTTPS
  network fixture pass. Rebuilt the unsigned installer and passed packaged source,
  payload, first-run, Codex, theme and document-reader checks. No authenticated
  Canvas or storage request was made. Alternative storage access and local imports
  remain implementation work; the historical account-state limitation is unchanged.
- 2026-09-10: Reviewed the real saved factual guide offline: no AI priorities or
  message details were present, and eight database items share one recorded due
  time. Added Start here with one unfinished starting point per course, shared
  deadline counts, and local View task navigation. The saved four-course Desktop
  guide was re-exported without changing its collection timestamp or enabling AI.
  Forty-nine unit tests, synthetic desktop refresh/navigation, standalone guide
  checks and rebuilt-package checks pass. Fixed an ambiguous fixture heading and
  a persisted test checkbox that prevented repeat-run focus verification. Reviewed
  light/dark/narrow document and desktop screenshots. Real-course AI review remains
  pending the user's response because saved Study suggestions are off; no Canvas
  or live planning request was made. Word visual pagination remains unverified.

- 2026-09-10: Follow-up file authorization review found missed transitive side
  effects: page bodies explicitly mark module items read; lock serialization and
  download permission can create module-progression records. Withdrew assignment,
  quiz and page REST operations; file-name reads require only[]=names. Paused live
  guide refresh before profile verification, with a persistent UI/export notice.
  Offline guides and local checkmarks remain supported. The full automatic
  collector is still required, with acceptance documented in canvas-read-boundary.md.
  The desktop pipeline test now supplies in-memory records after first proving
  the production hold prevents network access; it must not be reported as a live
  or REST collection success. No production bypass flag was introduced.
  Forty-nine unit tests, the real local HTTPS guard, desktop hold/offline pipeline,
  standalone document and rebuilt-package checks pass. Light/dark pause screens
  were visually reviewed. The existing Desktop guide was re-exported with the
  safety notice and original collection timestamp; no production app process was
  running during this check. Historical account changes remain unprovable.
- 2026-09-10: Implemented a transport-free GraphQL metadata candidate with exact
  fixed queries, course/student scope, independent assignment/status pagination,
  typed response validation and bounded failure handling. Upstream review confirms
  assignment descriptions still invoke lock checks, so they are excluded; a fuller
  instruction-source solution remains required. Both queries pass validation
  against the pinned upstream schema. Seven new tests cover mutation/field/scope
  rejection, null override dates, partial errors, duplicate cursors/identities,
  cancellation and page/byte limits. Production refresh remains paused and the
  network gate rejects the candidate POST route. No live account was contacted.
  All 56 unit tests and the rebuilt Windows package checks pass, including the
  production refresh hold. The schema and temporary validation dependency remain
  under ignored .codex-temp/graphql-review; neither is a shipped dependency.
- 2026-09-10: Extended the replacement-query audit through enrollment preloading,
  visibility selection, readonly date clones and controller operation hooks.
  Documented cache/authentication side effects separately from learning progress,
  the reviewed revision's scoped-token incompatibility, and exact-envelope,
  identity and CSRF transport requirements. Shared permission/visibility branches,
  model callbacks, schema analyzers and institutional compatibility remain open.
  This documentation milestone preserves the production pause and makes no
  authenticated requests or guide changes. Source links and local document links
  were checked against the pinned repository tree and workspace.
- 2026-09-10: Implemented an isolated metadata transport with exact upload-byte
  admission, connection cancellation, session/token separation, streaming byte
  budgets and a request deadline. Added named POST audit hashes and body-read/error
  events without raw queries, credentials or responses. Ten new unit tests and
  actual Electron/local HTTPS checks cover the boundary, including renderer
  borrowing, redirects, GraphQL errors and cancellation. Chromium may reject a
  POST redirect before returning its status; the fixture verifies that no redirect
  target receives a request. All 66 unit tests, existing network checks and rebuilt
  Windows package checks pass. Production refresh remains paused and no actual
  Canvas account was contacted. Verified live authentication, remaining source
  review and reconciliation with saved instructions are still required.
- 2026-09-10: Added metadata-to-guide reconciliation that updates dates and points
  while preserving instruction and quiz-detail observation times. Missing or
  ungraded submission states remain unknown; unmatched status rows create no work.
  App/export notices and study/AI evidence identify old requirements separately
  from fresh metadata, and unchanged refreshes preserve local completion. Eight
  new reconciliation tests bring the unit suite to 74 passing tests. The synthetic
  desktop update/export pipeline passes, including repeated refreshes and visually
  reviewed light/dark instruction notices. The rebuilt Windows package matches
  current source and passes installer-payload, isolated first-run, reader-worker,
  Codex initialization, theme and restart checks. Production refresh remains paused;
  no actual Canvas, course-site or AI account request was made, and the user's saved
  guide was not rewritten. Live authentication and the remaining permission/source
  review are still required before enabling collection.
- 2026-09-10: Closed the shared visibility SQL-builder review, including both
  performance-feature branches, and inspected all three registered GraphQL
  analyzers. Found a zero-increment Redis rate-limit/expiry write even for the
  candidate queries; documented it separately from coursework and message state.
  Inventoried direct model load callbacks and role lookup without treating that
  search as proof about inherited concerns. Remaining review is narrowed to
  permission dependencies, inherited hooks/getters, identity and institutional
  behavior. This source-review milestone makes no authenticated requests and
  preserves the production refresh pause.
- 2026-09-10: Implemented stock Canvas CSRF-cookie validation as an isolated
  authentication helper. Scoped lookup, canonical masked-token decoding, expiry,
  duplicate rejection and cancellation fail closed without logging credentials.
  The metadata transport turns synchronous/asynchronous authentication failures
  into a safe reconnect message. Five new unit tests bring the suite to 79 passing
  tests. Actual Electron/local HTTPS checks cover cookie extraction, changed-cookie
  retrieval, missing/malformed-cookie request denial and token/cookie separation.
  Rebuilt the unsigned Windows installer and passed packaged source/payload,
  isolated first-run, Codex initialization, reader-worker and theme/restart checks.
  The helper is not connected to production Canvas; verified account/enrollment
  binding and remaining source review still precede admission. No real Canvas,
  external course-site or AI request was made, and the saved student guide remains
  unchanged. Test profiles and pinned review sources remain in ignored .codex-temp.
- 2026-09-10: Bound local Canvas clients and guide runs to an abortable connection
  lifetime. Delayed profile results cannot reconnect a disconnected account or
  overwrite a newer verification. Serialized local credential writes/removals
  prevent a pending token save from undoing Disconnect; browser verification waits
  for cookie cleanup. Guide runs capture immutable account/course identity and
  reject late collection results before planning or export. Added eight isolated
  Electron lifecycle scenarios and a desktop test preserving all three guide
  formats after connection invalidation. All 79 unit tests, connection/desktop
  checks and rebuilt-package verification pass. No real account was contacted or
  student guide changed. This establishes local lifecycle binding only: enrollment
  role evidence, remote session-cookie changes, remaining source permissions and
  the full collection path still require work. Production refresh remains paused.
- 2026-09-10: Reviewed enrollment evidence sources. The existing course-list
  filter removes conflicting role types, and active-only enumeration misses
  completed teaching roles that may retain elevated read access. The self-
  enrollment REST serializer additionally evaluates grade fields by default.
  Added a minimal self-enrollment GraphQL preflight design and query covering all
  declared states with no grade/submission fields. It passes the pinned schema
  validator. Documented resolver/visibility behavior, account-level privilege
  limits and concrete admission tests. This documentation/query milestone does
  not register a new operation, widen the gate, run account requests or change
  guides. Permission dependencies and runtime preflight integration remain open.
- 2026-09-10: Added offline enrollment-evidence validation with complete cursor
  chains, bound identities, immutable selected fields, response limits and safe
  failures. Six synthetic tests retain conflicting/custom/test/completed roles
  and reject partial or malformed evidence. This module makes no requests and
  produces no collection authorization. Further source review found that the
  enrollment-state getter can create a missing row; a separate recalculation
  path can transition expired temporary enrollments. Reachability of that path
  through selected permissions remains unresolved. Documented the distinction
  and retained the production hold. No real Canvas, website or AI request was
  made; the student's saved guide remains unchanged. All 85 unit tests pass.
- 2026-09-10: Reworked the sidebar connection area into separate Canvas, ChatGPT
  (via Codex), study-suggestion and expandable AI-token rows. Connection status
  does not hide the collection pause or imply suggestions are enabled. Added
  latest-run/session usage from existing Codex notifications with explicit
  missing/partial counts and input/output subtotals; no account-wide balance or
  price is inferred. Counts are not persisted. All 88 unit tests pass, including
  repeated/invalid/foreign usage events, missing counts, failed planning and
  cancellation. Isolated Electron status and desktop checks pass in both themes
  and at minimum width. Visual review caught and fixed a hidden-state CSS conflict.
  No real planning request was made and Canvas collection remains paused.
- 2026-09-10: Added a browser-session watcher to the paused refresh pipeline.
  It reads and fingerprints the stock session cookie, cancels on applicable
  cookie changes and rechecks after verification/collection and before export.
  The watcher changes no cookies, omits credentials from outputs and disposes
  listeners on completion or failure. Token connections retain their existing
  independent binding. Five new unit tests bring the suite to 93 passing tests;
  nine Electron connection scenarios and the synthetic desktop refresh pass.
  Late results after cookie replacement preserve all three guide formats.
  Reviewed account membership/role permission helpers and narrowed unresolved
  registry and inherited-model dependencies. Production collection stays paused;
  server identity changes without cookie changes and institutional rotation
  behavior remain unverified. Rebuilt the Windows installer with the sidebar
  and session guard; packaged source/payload, reader workers, fresh profile,
  bundled Codex initialization and theme/restart checks pass. No real Canvas
  collection or planning request was made. Test profiles and source-review
  downloads remain in ignored .codex-temp.
- 2026-09-10: Replaced the offline enrollment preflight candidate after source
  review showed that course-roster visibility can hide concluded/inactive roles
  even when the query explicitly requests them. The replacement reads the bound
  user's own paginated enrollments for one course with current/concluded filters
  disabled. Validation binds the parent user and each node's course, rejects the
  old response shape, and preserves all raw states and conflicting roles. The
  pinned schema accepts the replacement query. Seven enrollment tests and the
  full unit suite pass. Documented why the limited GraphQL permission fields and
  REST permissions controller do not yet resolve the remaining privilege review.
  No production request admission, real account request or guide rewrite occurred.
- 2026-09-10: Connected the self-enrollment candidate to the isolated metadata
  transport using a third exact operation/body contract. A shared incremental
  reader validates every page before another request, preserves conflicting roles,
  enforces pagination/size budgets and returns evidence only after completion.
  The audit records a separate enrollment operation without role data, cursor
  values or credentials. The runtime query matches the documented AST and passes
  the pinned schema. All 99 unit tests and the actual Electron localhost HTTPS
  fixture pass, including two-page enrollment reads and early rejection of a
  foreign user. Production admission and account-wide permission classification
  remain pending; no real Canvas request, AI request or guide rewrite occurred.
- 2026-09-10: Added authenticated response identity checks. Self-profile
  verification captures Canvas's global user header alongside its local profile
  ID; changing either invalidates the run binding. Isolated metadata/enrollment
  reads require the verified global ID, reject absent/changed/impersonated headers
  before body acceptance and prevent reuse of a rejected transport. No identity
  header is persisted in audit, settings or guides. All 102 unit tests, eleven
  Electron connection scenarios, the localhost HTTPS fixture and synthetic
  desktop refresh pass. Reviewed the account-list index context, default
  serializer/getters and pagination as the next membership preflight candidate.
  Institutional header/extension behavior remains unverified and production
  collection remains paused. No real Canvas request or AI request was made.
- 2026-09-11: Narrowed the planned account-membership check to an authenticated
  empty first-page check with per_page=1. Any nonempty result stops admission;
  administrator accounts do not need enumeration. Reviewed Api pagination and
  the remaining group-quota fallback. BookmarkedCollection/Folio execution and
  serializer extension dependencies remain open before network admission.
- 2026-09-11: Rebuilt the Windows installer after the response identity changes.
  Packaged validation passes for source inventory, installer payload agreement,
  absence of private state, document reader workers, fresh-profile Desktop
  defaults, bundled Codex initialization, themes and restart persistence.
  This does not verify installation/uninstallation on a clean Windows machine
  or the institution's live response headers.
- 2026-09-11: Implemented the fixed account-membership GET in the isolated
  metadata transport. It accepts only authenticated empty first-page evidence,
  never follows pagination/redirects, and stops subsequent reads after failed
  preflight. Shared identity, byte, timeout and cancellation guards remain in
  force; audit output excludes account details. All 106 unit tests and the real
  Electron localhost HTTPS fixture pass. Reviewed the bookmarked page wrapper,
  shard merge and page execution helpers. Production admission remains disabled
  pending the remaining server dependencies; no live Canvas or AI request ran.
- 2026-09-11: Closed the selected Folio/WillPaginate paging-adapter review against
  the exact locked package versions, including Canvas's transaction-local count
  timeout and both initial-page formats. Recorded the separate temporary-
  enrollment evidence gap: the selected GraphQL fields cannot establish its
  absence, and section override resolution reaches the state getter. Keep
  production collection paused until that path and serializer extensions are
  resolved. This pass changed review documents only; no live account request ran.
- 2026-09-11: Verified the complete pinned archive against all 6,721 Ruby paths
  and completed the stock account-serializer extension registration inventory.
  Only the extension mechanism and a test double were found. Confirmed three
  additional selected permission entries have no account_allows callback.
  Identified the context-free bulk temporary-status endpoint and documented its
  state-scope, empty-response and cross-shard limitations before any admission.
  The slower redundant download was stopped and its partial file removed after
  verifying the complete replacement. Source packages, extracted Ruby files and
  inventory remain in ignored .codex-temp/graphql-review for continuing review.
  No real Canvas request, AI request, app setting or saved guide was changed.
- 2026-09-11: Traced the default Planner collection through calendar section
  visibility to the enrollment-state getter's primary-database first_or_create.
  Planner is not an unguarded replacement, even with an empty event result.
  Identified and schema-validated a self-submission cachedDueDate selection as
  the next deadline-source candidate. Documented the required runtime contract,
  reconciliation, field-age and uncertainty changes before implementation.
  This review did not admit requests or change the app, account or saved guide.
- 2026-09-11: Revised the isolated metadata collector to remove assignment
  due/open/close resolvers and read cachedDueDate on self-scoped submissions.
  Null and missing stored dates retain earlier due dates only as last-known;
  availability dates and their original ages remain explicitly unrefreshed.
  These distinctions reach study tasks, AI evidence, the app and document exports.
  Both runtime queries pass the pinned schema. All 108 unit tests, the Electron
  localhost network fixture and synthetic desktop refresh pass, including both
  themes, retained field ages and the production hold. No real Canvas or AI
  request ran and no personal guide was rewritten. Admission review continues.
- 2026-09-11: Reviewed the stored deadline scalar and SubmissionType's always-run
  anonymous-grading initializer, including its self-user short circuit. Traced
  selected Course permission checks to joined enrollment-state columns and the
  stock student's unavailable elevated permissions. Added isolated orchestration
  that completes bound account and enrollment preflights before metadata reads,
  rejects unsupported/mixed roles on any page, discards cancelled results and
  exports no role evidence. All 112 unit tests and the Electron localhost HTTPS
  fixture pass. Production wiring and institution validation remain pending;
  no live account request, AI request or personal guide change occurred.
- 2026-09-11: Wired the metadata transport and student preflights through the
  connection and guide-refresh coordinator behind the existing production hold.
  A second hold blocks direct connection calls before credentials or requests;
  active request admission and cookie watchers are cleaned up after each run.
  The localhost Electron fixture verifies the actual bridge, ordered preflights,
  concurrent-run rejection, cancellation and denial outside collection. All 112
  unit tests, connection lifecycle tests and synthetic desktop refresh pass.
  Rebuilt the Windows preview; packaged source/payload checks, fresh profile,
  bundled Codex initialization, both themes and restart persistence pass.
  Installer SHA256: b880f2dd4960ecaffe7900001ced2245996637b382bf44b69dfb4d8c26ad162c.
  No installer walkthrough, institutional validation or real AI request ran.
  Production collection remains paused and personal guides remain untouched.
- 2026-09-11: Closed the selected permission-dispatch and self-user account-policy
  routing review against the pinned source. Confirmed that explicit permission
  checks do not execute unrelated action predicates, while permission caches can
  still persist. Traced the always-calculated observer check and account-chain
  queries. Recorded the non-production special-account bootstrap write branch.
  Replaced the generic remaining-permissions task with explicit model-load,
  admission-decision, institutional-validation and full-content work. This pass
  changes review documents only; no real Canvas request, settings or guide changed.
- 2026-09-11: Completed the four additional self-preflight model reviews, including
  selected getters, included concerns, root-account lookup, list/broadcast macros
  and model initialization helpers. Inspected the exact Authlogic revision from
  Canvas's lockfile; its model hooks run during validation/password/save paths,
  while session authentication can still persist bookkeeping. Recorded the
  dependency archive hash and retained its 44 Ruby sources in ignored review
  storage. No dependency was installed or executed, and no live Canvas or AI
  request ran. The consolidated admission decision remains the next step.
- 2026-09-11: Withheld metadata admission after tracing the elevated course-
  submission branch through student visibility to temporary enrollment-state
  creation. Separate account/enrollment preflights cannot freeze server roles
  between requests. Withdrew enablement edits before any live request or build;
  production app code remains unchanged. Validated a direct self-submission query
  candidate against the pinned schema and recorded its required fallback-policy
  review and request-budget implications. Dashboard and comment-stream alternatives
  are not complete safe replacements. The restored desktop refresh test passes,
  including the production hold and preservation after connection changes.
- 2026-09-11: Reviewed direct submission permission/anonymity fallbacks, including
  unpublished assignments and peer-review submitted? checks that read existing
  rows. Added an isolated fixed query/parser and transport methods bound to
  assignment IDs actually read from the selected course. Missing rows remain
  unknown; mismatched responses fail and audit records omit response content.
  All 116 unit tests and localhost Electron metadata network checks pass.
  Production collection remains paused pending orchestration replacement and
  per-assignment budget/coverage handling. No real Canvas/AI calls or personal
  guide changes occurred. Ignored test profiles and pinned source review files
  remain under .codex-temp for inspection.
- 2026-09-11: Replaced course-wide submission collection with one direct lookup
  per freshly observed assignment. Removed the old query, parser branch and
  transport/audit admission. All assignment pages must finish first; insufficient
  shared request capacity rejects the update before status reads. Null records
  produce unknown status and partial coverage while saved deadlines retain their
  original age and verification tasks. Added tests for duplicate/mismatched rows,
  cancellation, request capacity and shared raw-byte limits. All 120 unit tests,
  localhost Electron metadata checks and desktop refresh safeguards pass; the
  three runtime GraphQL queries validate against the pinned schema. Collection
  remains paused pending integrated admission and further course-content work.
  No real Canvas/AI requests, personal guide writes or package build ran. Ignored
  fixture profiles and logs remain under .codex-temp for inspection.
- 2026-09-11: Completed the integrated bounded admission decision and enabled
  manual metadata refresh through CanvasConnection. The legacy REST collector
  remains disabled; the shared repair hold now belongs to the connection rather
  than the withdrawn client. Added visible coverage limits to This week, the
  connection panel and generated guides. Pinned the three reviewed query hashes
  in an independent admission regression test. All 121 unit tests, actual local
  Electron metadata networking, synthetic desktop refresh and connection-panel
  tests pass. Inspected light/dark coverage screenshots. Built the unsigned
  Windows installer and passed package tests for matching source/payload, no
  private state, Desktop default, bundled Codex initialization, document workers,
  themes and restart. Installer SHA256:
  f54168ce809d939b4d17e56ad045b5056bda28108eec16809dc0b5effa54cba1.
  No installer walkthrough, real Canvas/AI request or personal-guide update ran.
  Live UBC compatibility and automatic Canvas instructions/materials/messages
  remain incomplete; the broader goal is active. Fixture profiles/logs/screenshots
  remain in ignored .codex-temp for inspection, and dist contains the local build.
- 2026-09-11: Reviewed course-message reads and found that the old REST detail
  serializer expands attachments through file lock/permission checks despite
  auto_mark_as_read=false. Removed both conversation REST operations from the
  request/network allowlist. Added isolated fixed GraphQL conversation discovery
  and text query/parsers with bound course/user/context validation, duplicate and
  changed-thread rejection, credential-line redaction and no transport admission.
  Both queries validate against the pinned schema. All 125 unit tests, actual
  Electron network rejection tests and the rebuilt Windows package checks pass.
  Installer SHA256: 1afc716b910dfec92a4f8ce428883e2eefa753f2d3bdc6a3e5c0913acd6a95fd.
  The enabled metadata refresh is unchanged; message model-hook review, bound
  transport/pagination and guide integration remain next. No real Canvas/AI
  requests, installer walkthrough or personal-guide changes ran. Ignored review
  sources, test profiles/logs and local dist artifacts remain for inspection.
- 2026-09-11: Completed the selected message-model/generated-event review and
  integrated course-tagged message text into manual guide refresh after metadata.
  Fixed named methods register threads from current course discovery, paginate
  inbox/archived/sent and text pages, and use shared account/cookie/audit/budget
  controls. Optional source errors discard partial messages and preserve older
  evidence as stale; typed authentication/identity/interception/audit failures
  stop the complete update. Added sender verification to factual/AI planning;
  message wording never overwrites a structured deadline. Both query hashes are
  pinned and validate against the reviewed schema. All 134 unit tests, real local
  Electron metadata/message tests (including production connection orchestration,
  later-page failure and fatal identity/login failures), synthetic desktop refresh
  and the rebuilt package tests pass. The package assertion was updated to the
  new coverage notice. Installer SHA256:
  ee7099ab55a883ecf1b866b6d00f82267bb56ef26976f787e8f4dc7d3ed4dc04.
  Tests used synthetic data; no real Canvas/AI request or personal-guide update ran.
  Sender identities/attachments, automatic Canvas instructions/materials and live
  UBC compatibility remain unfinished. Ignored fixture profiles/logs/review sources
  and the local dist build remain for inspection. The broader goal remains active.
- 2026-09-11: Confirmed AssignmentType.description invokes the excluded lock
  resolver even without requesting lockInfo; kept that field disabled. Reviewed
  CourseType.syllabusBody, Course sanitizer/restriction/version callbacks and the
  existing course permission path. Added a fixed course-bound syllabus read after
  metadata and before messages. Extracted text and safe references enter the guide
  and planner; links, images and embeds are not fetched by this source. Empty or
  unavailable text retains previous syllabus evidence as stale, while account,
  login, interception, audit and cancellation failures stop the update. Pinned
  the query hash and validated it against the upstream schema. All 140 unit tests,
  actual local Electron network tests (including production integration and fatal
  syllabus failures), synthetic desktop refresh with syllabus HTML export, and
  rebuilt package checks pass. Installer SHA256:
  796c546b2dbe10d04ac9ad442e0f27c59f2b83e6b4550a69294720bec33fcfeb.
  No real Canvas/AI request or personal-guide update ran. Assignment instructions,
  Canvas page/file contents and live UBC compatibility remain incomplete. The
  broader goal is active. Ignored test profiles, logs, source-review files and dist
  artifacts remain available for inspection.
- 2026-09-11: Added an optional native Microsoft Word layout check using a
  synthetic two-course guide. Word 16.0 opened the DOCX read-only, produced six
  PDF pages and left the original bytes unchanged. Page bounds, running headers
  and footers, source/verification content and rasterized header pixels pass;
  inspected every page and independently checked repeated headers with MuPDF.
  Existing Word content/file-protection tests and connection-panel checks pass.
  Updated the release ledger to the admitted metadata/message/syllabus scope and
  removed the obsolete REST message acceptance wording. Announcement message
  fields remain excluded: DiscussionType.message invokes locked_for? with policy
  checks before content processing in the pinned upstream source. No new Canvas
  operation was enabled. No real Canvas/AI request, personal-guide update or
  production source change ran. Temporary render diagnostics remain ignored.
- 2026-09-11: Full saved-guide review found that early version-one syllabus text
  was retained on disk but omitted by the newer evidence reader. Added local
  recovery for legacy syllabus/announcement fields on load and explicit export,
  with stable source IDs, safe links, credential-line redaction and stale labels.
  Preserved guide timestamps and marked individual source ages as unknown.
  Existing modern evidence stays authoritative; later successful reads replace
  recovered entries. Three regression tests cover nonmutating load, plain-text
  fidelity, stale planning evidence, repeated recovery, replacement and export.
  All 143 unit tests, desktop refresh/progress/export checks, standalone document
  checks and rebuilt package checks pass. A read-only review of the saved
  four-course snapshot recovered two syllabus entries and retained 65 assessments;
  the opening and recovered-text HTML views were inspected with no network calls.
  Its full reference document prints to 59 pages; every print page has text, but
  full visual print review and a more concise print experience remain unfinished.
  The original saved state and personal guide files were not changed. Installer
  SHA256: 931263b3abd3e55bfb43fc62b370e32802e17e68c8f6f3d04f6320c8a54f343f.
  No real Canvas/AI request or installer walkthrough ran. Ignored local review
  artifacts and the rebuilt dist installer remain available for inspection.
- 2026-09-11: Added an HTML print-scope choice, defaulting to the full guide.
  Overview and checks keeps course starting points, outstanding dated records
  even when preparation is checked off, and main verification notes. Full tasks,
  undated items and reference details remain on screen and in the full export;
  the overview discloses its limited scope. Native inputs/CSS require no scripts
  or network access. All 144 unit tests and connection-panel checks pass. The
  isolated document test prints four full pages or two overview pages. A read-only
  copy of the saved four-course guide prints a five-page overview instead of the
  59-page full reference; every overview page was visually inspected. The original
  saved state stayed byte-identical and the viewer made no network requests.
  Live UBC sign-in remains unverified: the Windows inspection helper was unavailable
  and the previously opened app predates the fixes. No real Canvas/AI request or
  personal-guide update ran. AI remains off. Temporary review outputs are ignored.
  Desktop refresh/export and rebuilt package checks passed with isolated synthetic
  data. Current installer SHA256:
  4668fa6fada8160b58d93021dad29f6ff181dd7aa0b3e86bd740e00eec0f3144.
- 2026-09-11: The personal-release audit found that academic timezone was stored
  but unavailable in Settings. Added a supported-timezone selector and explicit
  save action, validated through a narrow idle-only IPC method. Changes apply to
  the next refresh; current saved guide state and export bytes remain unchanged.
  Invalid/null/missing timezone values are rejected without altering settings.
  All 144 unit tests, desktop save/reload and light/dark/minimum-window checks,
  refresh-time rejection, unchanged-guide/no-request checks and rebuilt package
  tests pass. Installer SHA256:
  c5f340657248edcf063fbf05afbaef724003aeb44324f9b4f17ea5d8c8b75747.
  Corrected obsolete architecture claims about a total refresh pause and unverified
  Word rendering. See personal-release-review.md for requirement-level evidence
  and remaining live acceptance. The goal remains incomplete. The old app is still
  running; the user's close/sign-in handoff is pending. No real account request,
  personal setting change or guide export ran during this milestone.
- 2026-09-11: Made Canvas and ChatGPT sidebar statuses keyboard-accessible links
  to their corresponding Settings controls. Clicking Not connected scrolls to and
  focuses the appropriate sign-in button; navigation does not start authentication.
  Widened the Connections hover/focus area to match the sidebar navigation width
  with horizontal padding. Status tests pass for mouse/keyboard navigation, target
  focus and visibility at 800x600; light/dark hover screenshots were inspected.
  Rebuilt package checks pass. Installer SHA256:
  58de590c8153a6d1a9a6e1497cb8c00c6a3470a5cebb57174b7b9787382d2aab.
  No real account actions or personal-guide changes ran. Live login and collection
  acceptance remain outstanding.
- 2026-09-11: ChatGPT connection options now reports whether Codex is detected,
  responding, or needs manual executable selection, including its source and path.
  File discovery is separate from the runtime handshake and does not launch a
  process or enable AI. Runtime resolver tests and the synthetic status/navigation
  fixture pass; detected, ready/manual and missing screenshots were inspected.
  Real Canvas profile/course-list reads succeeded during user testing, but a
  session-cookie verification failure stopped the guide refresh before collection.
  The cause remains unconfirmed; this UI milestone does not resolve that failure.
- 2026-09-11: Added specific, credential-free diagnostics for browser-session
  verification. Missing/ambiguous cookies, unsupported scope/security/expiry,
  invalid values, lookup failures and timeouts remain blocked under the same
  validation rules. Unexpected store exceptions are sanitized. All 146 unit
  tests pass. The isolated desktop refresh fixture verifies that missing and
  unsupported cookies report their reason before network reads and preserve the
  saved guide and all three exported formats. Timeout/cancellation cleanup and
  cookie-change rejection also pass. No real account request was made by these
  tests. The app was reopened for a human retry to identify the actual UBC failure;
  its cause and a successful real refresh remain unverified. The combined rebuilt
  package passes inventory/payload/private-state and bundled-runtime checks.
  Installer SHA256:
  ad6b17839d266ba189c466a115d353832a0c06ebd9159c5e48a7413ac24bfaeb.
- 2026-09-11: Added separate Remember/Forget controls for Canvas, ChatGPT and
  course websites. Remembered Canvas session cookies gain a Windows-encrypted
  restore copy; off uses an in-memory browser partition and token. Codex uses
  its strict OS credential store or ephemeral authorization. An older plaintext
  Codex cache is encrypted before removal and requests a one-time secure sign-in.
  Website credentials can be session-only or encrypted, with a local Forget action.
  Connection changes are serialized and blocked during refresh. A runtime exit
  wait fixes a file-lock race found during the restart test. All 148 unit tests,
  desktop preference/navigation/layout checks, connection-lifecycle and refresh
  checks pass. The new test:remember verifies real Windows encryption, cold
  restoration, expiry, forgetting and Codex keyring/memory behavior with synthetic
  credentials. Temporary keyring entries from failed fixture runs were cleaned up.
  Light/dark/minimum-window screenshots were inspected. No personal Canvas request,
  real AI planning run or personal credential migration ran during this milestone.
  The user's open window predates this change. Live UBC restoration and the earlier
  session-verification failure remain outstanding; see remembered-connections.md.
  Rebuilt package checks pass; installer SHA256:
  74df0419795b47efe600b67467aac6494af7adeb19ba96249b276ea262b86d7c.

- Added contextual Forget actions and a Data & privacy navigation page, then
  introduced per-account course-reading preferences and durable Canvas collection
  history. Expanded reading is explicitly pending validation: the reviewed
  assignment-description lock path also schedules assignment/submittable timestamp
  maintenance, beyond the proposed viewing exception. No new Canvas read or broader
  network permission was enabled. The latest-run summary and history distinguish
  requested/effective reading modes, failures, cancellation and interrupted runs.
  Request intent is persisted before transmission, and history storage failures
  stop collection. Account changes isolate history; login removal retains local
  guide/history files. All 152 unit tests and the synthetic status/refresh fixtures
  pass, including preference acknowledgement, cross-account separation, zero reads
  after failed session verification and unknown effects after failed requests.
  History and privacy layouts were visually inspected. See expanded-reading.md
  for source evidence and remaining milestones. No personal Canvas or AI request
  was made. The installer has not been rebuilt for this source milestone.

- Added supplied sender names to the fixed course-message query after reviewing
  its author association, stored name/ID getters and existing User model concerns
  in the pinned Canvas source. No Inbox navigation, mark-read operation, attachment
  selection or assessment action was added. The guide records attribution changes
  and asks users to verify sender authority; AI validation rejects required/optional
  labels when the sender role is unverified. Data & privacy now discloses sender
  names as collected information and optional AI input. Both queries validate
  against the pinned schema; all 152 unit tests, the Electron metadata-network
  fixture and the status/privacy/history fixture pass. Extra missing/null/blank
  sender cases pass the targeted parser suite. Network tests confirm names reach
  the guide collection and remain out of audit logs. No personal Canvas or AI
  request was made. Expanded reading and live UBC compatibility remain unresolved;
  the installer has not been rebuilt for this source milestone.

- Added rubric criterion text through the existing course assignment visibility
  path after reviewing the rubric association, stored criteria and model callbacks.
  The fixed query excludes description/lock resolvers, ratings, outcome resolution
  and assessment feedback. Its optional scan must match the observed assignment
  set and shares existing request/byte budgets, identity checks and audit ordering.
  Partial source failures preserve older criteria as stale; fatal connection/audit
  failures still stop the refresh. Guides and optional AI evidence disclose missing
  rubric details and add a full-rubric verification task. All 157 unit tests, pinned
  schema validation, the local Electron network fixture and the desktop refresh
  fixture pass. Tests verify paginated criteria, later-page failure, account/expiry
  rejection, content-free audit and Markdown/HTML output alongside existing notes
  and local checklist preservation. No personal Canvas or AI request was made.
  See canvas-rubric-review.md. Expanded reading, live UBC compatibility and a rebuilt
  installer remain outstanding.

- Rebuilt the local Windows installer from application commit a2b4c9c. Extended
  packaged smoke checks cover privacy navigation, empty account history,
  contextual Forget controls, pending expanded reading and AI-off defaults.
  test:package passes with matching source/installer payload, no private state,
  bundled Codex initialization, document workers, Desktop default and theme
  persistence. Light/dark first-run screenshots were inspected. Latest installer
  SHA256: 307cd49c316b0e0a2475251cdb567dc90294f962181f68bfb1459c579181b01d.
  Updated the architecture and release review for rubric coverage and the
  remaining account-dependent checks. No installation, personal login or live
  collection was performed; a human test of the current build is still needed.

- Extended the rubric query with stored rating descriptions, grading-use and
  free-form comment flags, and criterion range/scoring flags. Reviewed the added
  Ruby field/model paths and pinned the new schema-validated query. Numeric scoring
  remains uncollected because its visibility rules require further review.
  The parser validates the assignment association, bounds rating lists/text and
  omits unselected scores. Guides describe standards rather than earned results,
  retain old criterion-only gap labels and report changed rating text. All 157
  unit tests and the localhost Electron network fixture pass, including pagination,
  optional/fatal failures and exclusion of rating contents from audit logs. No
  personal Canvas or AI request was made. This source milestone is newer than the
  last packaged installer; the live-login question for that installer is pending.

- Revalidated local activity while awaiting the live test. Development audit logs
  show successful profile/course-list responses, but no new collection history or
  refreshed saved guide. An installed app window then appeared; its main executable,
  app archive and bundled Codex hashes match the verified installer payload. Only
  the installed window remained after the briefly opened development window closed.
  The installed profile had no collection history at inspection. Installed execution
  is now verified for the a2b4c9c application build; wizard/elevation, uninstall,
  clean-machine use and a real selected-course refresh remain unverified. The rating
  description source change is newer than that installed build. No automated
  course refresh or personal AI planning request was issued during this inspection.

- Investigated the installed-app CW_SESSION_MISSING report: successful earlier
  profile/course reads did not establish refresh readiness. The collector stopped
  at its cookie check with zero request intents. The live cause remains unresolved;
  no authentication checks or read permissions were relaxed. Session failures now
  expose a refresh pause, connection-settings action and fixed diagnostic in local
  history. Replaced mixed Unicode navigation glyphs with consistent outline SVGs.
  All 158 unit tests, isolated Electron connection/UI checks, Windows build and
  fresh-profile package validation pass. Navigation was visually checked in both
  themes. The new installer hash and installed-copy distinction are recorded in
  windows-package.md; no personal Canvas refresh or AI request was made.

- An anonymous UBC login redirect revealed the session-name mismatch: the server
  sets secure, HttpOnly canvas_session, while the app previously recognized only
  _normandy_session. Added the evidenced alias for the exact UBC HTTPS origin to
  the watcher and encrypted session storage. Duplicate credentials still fail;
  fingerprints include the cookie name, and snapshots cannot introduce a second
  credential beside a live one. All 160 unit tests, isolated Electron connection,
  encrypted restart, synthetic refresh/export, Windows build and package checks
  pass. The new installer hash is in windows-package.md. No personal login or
  authenticated collection was performed; a human sign-in and refresh of this
  corrected build remains the next acceptance check.

- Started the Canvas-inspired visual redesign with a permanent navy rail,
  coordinated light/dark surfaces, clearer notices and consistent 20px SVG icons,
  including a circular eight-tooth settings cog. Added original calendar/check
  branding shared by the app and generated Windows/NSIS assets. The preview build
  and package-test switches use dist/preview, preserving the running standard app.
  Synthetic status/navigation and isolated package checks passed; both themes,
  artwork and the packaged executable icon were visually checked. No personal
  account operations ran. Automatic installer dark mode, a wizard walkthrough and
  125/150/200% scaling validation remain pending; see windows-package.md for the
  preview hash and ux-design.md for the updated visual specification.

- Reproduced the reported UAC-on-Next bug with native Windows radio controls:
  a disabled preselected all-users radio remains checked after Only me is clicked.
  Added a supported NSIS install-mode hook to select per-user mode before control
  creation in non-elevated setup when elevation is disabled. The native regression
  fixture passes with the production hook; no registry writes, installation or
  elevation occur in that test. The rebuilt preview and isolated package checks
  passed. Full wizard confirmation still needs the user because the native
  inspection helper is unavailable. Existing all-users installations are retained
  when installing a separate per-user copy; no Canvas account operations changed.

- Updated the tagline to "Your week, simplified." across the app, HTML guide and
  generated installer artwork. The current packaged app detects this computer's
  dark Windows preference with a fresh System profile. Added a packaged display
  fixture covering all four navigation pages in both themes at rendering scales
  1/1.25/1.5/2 and zoom factors 1/2; horizontal layout checks pass. This simulates
  display scaling and does not certify monitor transitions or native installer
  controls. An initial cropped screenshot was a capture issue; no responsive CSS
  change was retained. Guide tests and the rebuilt package checks pass. Documented
  the proposed maintenance screen and Inno Setup theme candidate separately;
  installer dark mode and the full human installation flow remain incomplete.

- Added a separate UI-only Inno Setup preview with native startup light/dark
  detection, shared branding and read-only NSIS installation discovery. This
  computer has both per-user and all-users registrations; the preview requires
  choosing a copy when both exist. Its payload and install/uninstall actions are
  deliberately absent while migration remains unvalidated. Native silent fixtures
  pass for dynamic dark, forced light/dark and style suppression, with pre-install
  aborts and no destination or preview registration created. Actual Windows-light,
  high-contrast and visual wizard walkthroughs remain pending. Production NSIS
  packaging is unchanged; see installer-experience.md for the separate artifact
  and portable compiler instructions. No Canvas or personal guide operations ran.

- Added a functional Inno installer candidate in dist/inno-candidate, retaining
  the default NSIS builder. It supports dynamic Windows appearance, explicit scope,
  same-folder reinstall/update, downgrade blocking and a constrained interactive
  uninstall path. NSIS migration remains blocked rather than invoking its recursive
  uninstaller automatically. Native lifecycle fixtures pass, including restoration
  of a missing file and retention of an unowned guide inside the installation
  directory. The full-payload fixture installed and verified 135 files, launched
  the actual packaged app with an isolated profile and bundled Codex detection,
  then uninstalled while preserving guide/settings fixtures. Temporary fixture
  registrations were removed. All-users elevation, shortcuts, maintenance UI
  interaction, live accounts and legacy migration still require validation.

- Added white and dark calendar artwork based on the supplied checklist design,
  with nine native Windows icon sizes and matching installer graphics. The app
  keeps white for Light/System and selects the dark calendar for explicit Dark.
  Inno shortcuts choose Windows' theme when setup runs; no live shortcut updater
  is installed. The default NSIS build remains separate.

- Added guarded NSIS migration to the Inno candidate without executing the old
  recursive uninstaller. Existing payload files are backed up before replacement
  and restored after failure; successful installation transfers registration to
  the new ownership-based uninstaller. Native fixtures pass for migration,
  downgrade/invalid-command/linked-folder rejection and pre-copy/mid-copy rollback,
  preserving unowned guides and separate settings. Power-loss recovery, all-users
  elevation, shortcut adoption and the human wizard walkthrough remain pending.
  The rebuilt candidate's full installation check verified 137 payload files,
  exercised Light/Dark/System through the actual Settings control, and removed
  its temporary installation while preserving guide/settings fixtures.

- Simplified installer branding after user review: removed the bright sidebar
  stripe and dark calendar variant, using the white calendar in all app themes
  and shortcuts. Maintenance now keeps three visible actions: Update enabled only
  for a newer package, Reinstall for the same version, and Uninstall (still disabled
  until a legacy copy is migrated). Native version-state and lifecycle fixtures
  pass. The green native progress gauge remains pending a supported blue style
  and visual/high-contrast review. The factual-guide improvements proposed in
  factual-guide-plan.md do not change collection permissions or current output yet.

- Implemented the first factual-guide milestone using collected records only:
  visible status and field-specific gaps, complete short instruction passages,
  and collected material links beside weekly preparation tasks. A missing
  availability window no longer hides known dated work behind a generic check
  prompt. App/Markdown/HTML/Word share the task model, with local completion
  invalidation on material changes and no additional Canvas access. Broader
  deadline grouping, source discovery and scheduling improvements remain pending.
  Validation: all 163 unit tests, the synthetic desktop refresh workflow, and
  native Word export checks passed. All seven Word pages were visually reviewed:
  text remains within page bounds and source links are readable. A final wording
  correction removes a positional reference to instructions; compactness and
  repetition remain follow-up work. No personal Canvas collection was run.

- Revised the goal toward course evidence collection and two AI guide routes.
  Added a shared explicit evidence projection and Course Information.md with a
  reusable study prompt, source coverage, changes and complete normalized text.
  Export for AI uses saved local records and reveals the file without connecting
  to Canvas or AI. Copy study prompt writes only the fixed prompt on user action.
  Connected suggestions now consume the same projection with whole-text and
  record omissions reported, rather than silently shortening each source.
  Validation: 166 unit tests and the synthetic desktop refresh workflow passed;
  targeted evidence tests also verify exception preservation, excluded private
  state, manual edits, account ownership, revisions and rollback after a locked
  evidence file. No new personal Canvas or AI requests were made. Full connected
  guide generation and improved coverage remain subsequent milestones.

- Implemented Create my weekly guide as a separate saved-evidence operation.
  Added validated overview/course/task/question output and a shared app/document
  presentation, with source-recorded deadlines and optional AI study dates.
  Failed/cancelled generation preserves the previous guide; collection age is
  retained and AI generation time recorded separately. AI changes reopen local
  preparation checks. The legacy automatic suggestion path remains during UI
  migration. All 169 unit tests passed, including course/source/quote/date checks,
  disabled AI tool/network policy, rendering and local task invalidation. The
  five-page synthetic AI Word guide passed native bounds/content checks and all
  pages were visually inspected. Desktop generation/cancellation checks are
  complete: the synthetic desktop workflow verified standalone generation made
  no Canvas requests, preserved collection timestamps, exported the AI content,
  and retained identical prior guide state after failure and cancellation.
  No live Canvas or AI account was used.

- Added account-scoped study availability, priorities and guide length with
  explicit sharing disabled by default. Both AI routes use the same opted-in
  projection. Existing AI guides retain the preferences they used and flag later
  changes; clearing settings does not claim to erase prior documents or uploads.
  Settings drafts survive ordinary status rerenders but reset on account changes.
  Validation: 171 unit tests passed, including input limits, default non-sharing,
  restart persistence, cross-account isolation and export/AI parity. The synthetic
  desktop workflow passed form entry, opt-in sharing, changed-preference notices,
  generation input, clearing and account-switch checks without Canvas requests.
  Light/dark screenshot capture returned the wrong window region and does not
  establish visual QA; verify the form during the primary UI cleanup. Collection
  permissions remain unchanged; no personal Canvas or AI requests were made.

- Separated Collect/Refresh course information from AI generation and retired
  automatic Study suggestions, including older saved aiEnabled settings and its
  renderer IPC. The primary screen presents manual export and connected ChatGPT
  as separate routes. Successful history and the coverage explanation collapse
  behind visible summaries; failed runs and possible viewing effects stay open.
  The generic checklist remains accessible but collapsed. Refresh still replaces
  current weekly output with a factual reference and preserves prior generated
  files in Revisions; this is now disclosed beside an existing AI guide.
  Validation: all 171 unit tests and the synthetic refresh workflow passed,
  including legacy-setting retirement, zero AI calls during collection, explicit
  generation, failure/cancellation preservation, local checkmarks and account
  isolation. Status/UX checks passed small windows, 200% zoom, keyboard routing,
  privacy and connection states. Light/dark routes and preference controls were
  visually reviewed. Earlier capture problems were traced to retained 200% test
  zoom and background render-frame waits; test capture now controls zoom and uses
  a bounded paint wait with background throttling disabled. No personal Canvas
  or AI requests were made. Factual exports still contain the older checklist;
  replacing that output and live-course quality review remain pending.

- Replaced the factual document's generated preparation schedule with a shared
  recorded-work overview in the app, Markdown, HTML and Word: per-course counts,
  earliest outstanding dates, shared due times, unknown submission status and
  coverage gaps. Generic steps, suggested start dates and old AI suggestions
  are excluded from factual exports. Local completed/changed checks remain a
  separate record and do not reduce outstanding counts. The app's older checklist
  remains collapsed for existing checkmarks. Detailed weekly records and source
  text remain; the separate Course Information.md pack includes all collected
  assessment records, including submitted and beyond-lookahead items.
  Validation: 172 unit tests passed, including source conditions/exceptions,
  complete undated records, local progress persistence and reference counts.
  The synthetic desktop workflow passed. Offline HTML passed light/dark/narrow
  rendering, navigation and no-network checks; the fixture printed three full
  pages and a two-page overview. Native Word factual and AI fixtures each passed
  content, bounds and running-furniture checks at five pages. All page renders
  were reviewed; unchanged pages were byte-compared after final label edits.
  The in-app summary passed light/dark, small-window, 200% zoom and keyboard
  checks; its rendered screens were reviewed. The Inno candidate rebuilt with
  source-byte and package privacy checks. No personal Canvas or AI requests were
  made. This changes presentation only;
  permitted-source coverage improvements remain outstanding.


- Added local course-document preview/import as a permitted coverage improvement.
  PDF/DOCX/TXT/MD copies retain source IDs, import times, fingerprints, optional
  original links and extraction limitations. Native-picker previews are kept in
  memory and bound to the saved account/guide. Add/replace/remove use the existing
  export transaction; they preserve Canvas dates/status and never trigger Canvas
  requests or AI generation. Current AI output is cleared for explicit regeneration;
  older exports and revisions retain prior copies. The UI explains limits and
  removal scope, supports offline use, and links imported AI citations back to
  the local source review. Canvas's broader-read safety hold is unchanged.
  Validation: 177 unit tests passed, including PDF/DOCX extraction,
  malformed/oversized/UTF-8/path/cancel rejection, complete ending conditions,
  provenance, reconciliation retention, account isolation, manual-edit protection
  and cancelled export preservation. The import desktop fixture passed preview,
  replacement/removal, expired-preview and account-switch cases with no Canvas
  requests from document operations. Light/dark and 800x600 renders were reviewed.
  The existing synthetic collection/AI/export workflow passed after separating
  document and website selectors. No personal Canvas or AI requests were made.
  The Inno candidate rebuilt with source-byte matching and package privacy
  checks; the installed personal app was not changed.


- Fixed website document extraction limitations being lost between SiteReader
  pages and normalized course sources. PDF/DOCX sources now retain partial and
  coverageNote through exports, connected AI input, failed-refresh retention and
  the existing per-task warning view. Older sources recover exact matching
  partial coverage notes locally without changing observation time or freshness.
  Source collection routes, credentials and permissions are unchanged.
  Validation: all 179 unit tests passed. The document fixture covers the complete
  reader-to-evidence-to-AI-view path; recovery tests cover source isolation,
  idempotence and replacement/failed-read behavior. No personal Canvas or AI
  requests were made.
