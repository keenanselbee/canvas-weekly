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
| M2 | Canvas connection and restricted course collection | Allowlist, redirects, pagination, quiz metadata, preserved read state tested | Safety repairs implemented and local HTTPS interception tested; tightened UBC login flow still needs account validation |
| M3 | Persistent weekly guide and updates | Week/DST, same-week revisions, notes, partial scans and changes tested | Complete: ddd9975; synthetic end-to-end verified |
| M4 | ChatGPT connection and optional planning | Official login, process lifecycle, bounded evidence, graceful fallback | Live account restoration and validated synthetic planning verified with pinned CLI; full-course quality review pending |
| M5 | Broader course evidence and Word output | Sources/coverage visible, document render verified, no unsupported completeness claims | Canvas evidence, public/Basic websites, scoped PDF/DOCX text and Word export implemented; live site validation, browser-login sites, Canvas file downloads and Word page rendering pending |
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
8. A source message is read with auto_mark_as_read=false and no message is sent.
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
