Implementation milestones
=========================

The user authorized implementation and DIFF followed by COMMIT for each suitable
milestone. The active goal is the usable personal Windows app, with explicit
account-dependent validation gaps. Keep this file current as work progresses.


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
