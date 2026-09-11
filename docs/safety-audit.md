Canvas collection safety audit
==============================

Current status, 2026-09-11: the fixed assignment/direct-submission metadata
collector is admitted for manual refreshes under the
[bounded admission decision](canvas-metadata-admission.md). Legacy REST body,
module, quiz and Canvas file-content reads remain disabled. Historical pause
references below describe earlier repair stages; they do not certify the old
collector or establish unchanged account history. Full content collection and
live institutional compatibility remain unfinished.

Audited 2026-09-10. Findings describe application code, saved local evidence and
upstream Canvas source. They do not establish the exact UBC deployed version or
prove the absence of historical account changes. No authenticated Canvas requests
were issued for this audit.


Findings and repair status
-------------------------

**Superseding high-severity finding:** the earlier endpoint review was incomplete.
Page-body serialization can invoke an explicit module read action, and assignment,
page and file lock checks can reach progression creation. Removed assignment,
quiz and page reads from the operation table and paused the complete live guide
refresh before any network request. The file-name query now requires only[]=names;
its institutional behavior is not yet verified. Saved guides remain available,
with a refresh-pause notice in newly exported documents. See
[the pinned-source call-chain review](canvas-read-boundary.md). No authenticated
request was made during this follow-up. This changes the previous assessment of
which GETs were safe; it cannot establish what happened in the earlier live run.

The historical findings below remain evidence, but their narrower repairs must
not be read as certification of the withdrawn collector.

The replacement's [metadata permission review](canvas-metadata-permissions-review.md)
separates in-memory date overrides, server caches, authentication bookkeeping
and learning-state effects. The reviewed GraphQL operation hooks do not match
the candidate's fixed names. A separate exact-body POST transport now passes
local Electron/HTTPS tests, with bounded reads, connection cancellation and
sanitized audit. Production still rejects these requests. Remaining source
dependencies and live authentication wiring are unfinished; no replacement query
has been sent to Canvas. See [transport status](canvas-metadata-design.md).

1. High: GET module listings are not free of learning-progress side effects.
   The modules controller selects the current student and calls evaluate_for.
   This can create a ContextModuleProgression and evaluate/save its state using
   existing requirements and submission records. The saved live guide reports
   successful module reads for all four courses. We cannot determine whether
   progress actually changed without a prior baseline and server evidence.
   Repair: removed both modules and moduleItems operations; blocked module routes
   in the authentication browser too. Refresh reports unsupported module coverage,
   and prior module evidence remains stale. Do not fall back to module page visits.
2. High: no complete historical request ledger or account-state baseline exists.
   Source coverage timestamps cannot prove every request or absence of writes.
   A future request ledger cannot retroactively certify the earlier run.
   Repair: collector requests now record intent before network access and HTTP
   status or network failure afterward. Logs live in local application storage
   under canvas-audit/YYYY-MM-DD.jsonl. They contain request IDs, operation, origin,
   path and timestamps, never query strings, headers, course content or exceptions.
   Failed intent writes prevent the request; failed outcome writes stop that
   source. A request without an outcome is inconclusive (for example, a crash).
   A response event records HTTP status, not successful parsing or account state.
   Authentication browser traffic and rejected operations are not in this ledger.
   Actual Electron transport interception is tested against a local HTTPS server
   using synthetic data. The test does not use Canvas accounts or internet hosts.
3. Medium: the login network guard allows broader GET subresources than needed.
   It blocks common assessment routes and non-login Canvas writes but is not an
   exact operation boundary for all traffic. SSO requests are a separate human
   authentication phase, not authorization for autonomous browsing.
   Repair: the closed-login session admits only an exact reviewed GET/manual-
   redirect request currently pending from the collector. Browser requests cannot
   borrow that permission. The human login window can load Canvas login routes
   and static assets, but Canvas API traffic requires collector permission even
   during login. Module/assessment routes remain denied in both phases.
   External HTTPS identity-provider traffic is restricted to the login window;
   individual institutional SSO hosts are not yet configured as an allowlist.
   Actual UBC sign-in with the tightened asset/API restrictions needs validation.
4. High for future attachment support: standard Canvas file downloads and previews
   can satisfy module view requirements. They were not enabled in the collector.
   Added an explicit file-route guard to the login and website boundaries, plus
   file-content coverage warnings. Metadata and student-clicked source links remain
   available. Alternate storage access is still under review; see
   [file access review](canvas-file-access.md). No live requests were made for this review.

The finite collector contains no operation that starts/resumes a quiz, fetches
attempt questions, submits work, sends messages, or edits account settings.
Conversation details use auto_mark_as_read=false. This supports a limited claim
about intended application operations, not proof of historical account invariance.
Do not attempt to roll back Canvas progress without evidence of what changed.

Ordinary authentication and API access can generate server-side access/activity
records. The product must never promise literally zero persistent server changes.
Its learning-state boundary requires endpoint-level review, not only GET methods.


Evidence
--------

- Local Weekly Plan.md generated 2026-09-10T23:36:22.218Z in factual mode:
  four courses, 65 assessment records and successful modules coverage for each.
- src/canvas-client.js: finite operations, GET/manual redirects, protected
  pagination, module removal and explicit coverage gap.
- src/canvas-session.js: isolated login profile and network guard.
- tests/canvas-client.test.js and tests/course-evidence.test.js: synthetic
  rejection of module requests and stale retention. These are not live account
  verification. tools/test-network.mjs separately checks actual Electron network
  interception: approved reads, rejected module/message reads and quiz writes,
  denied browser API requests and redirects that never reach their target.
- [Canvas modules controller](https://github.com/instructure/canvas-lms/blob/master/app/controllers/context_modules_api_controller.rb)
- [Canvas module progression creation](https://github.com/instructure/canvas-lms/blob/master/app/models/context_module.rb)
- [Canvas progression evaluation](https://github.com/instructure/canvas-lms/blob/master/app/models/context_module_progression.rb)
- [Canvas activity logging](https://github.com/instructure/canvas-lms/blob/master/app/controllers/application_controller.rb)


Guide requirements after safety repairs
--------------------------------------

The earlier saved factual guide was an evidence list. The application now builds
source-linked preparation tasks, suggested dates distinct from deadlines, local
completion tracking and concrete verification prompts. Local task completion and
Open guide have synthetic desktop tests confirming no Canvas fetches. Word
output is implemented; Word page rendering and full-course quality review remain. AI steps now use validated
source IDs and matching quotes for required/optional interpretations; these do not
prove that the interpretation is correct. A live model turn using synthetic
evidence and the app's saved ChatGPT connection passed with the official CLI
0.154.0. ChatGPT connection and enabled suggestions remain separate states.

The standalone HTML export contains no scripts or remote resources. Source text
is escaped; source links permit HTTPS navigation only, while local notes and
section anchors are generated by the app. Its CSP permits only the bundled
stylesheet hash. A synthetic Electron document check confirms that rendering,
theme changes and print styling make no automatic HTTP requests. Clicking a
source link intentionally leaves the offline document and may record a page view.


External website adapter review
-------------------------------

The new website client is separate from CanvasConnection and rejects the active
Canvas origin as an external site. It never receives Canvas cookies or tokens.
The student selects a HTTPS origin and course path once. Only scoped document
GETs are followed; private/reserved DNS results, unsafe paths, query-bearing URLs,
cross-scope redirects, scripts and form submissions are rejected or skipped.
Basic credentials are sent only after an in-scope matching realm challenge;
redirects restart without authorization. Windows encryption is required before
a new login transmits credentials. Renderer state and guide evidence omit them.
Rejected credentials stop that site's crawl and are not automatically retried by
later refreshes. A new explicit website login is required before they can be reused.

Website request intent/outcome records are flushed to separate local audit files.
Failed intent writes prevent transmission. Failed downloads consume their byte
allowance so repeated truncations cannot evade the total budget. A real local
HTTPS fixture found an oversized-response race (end could beat request error);
the collector now rejects immediately on overflow before destroying the request.
That fixture, unit checks and the synthetic desktop workflow now pass. No real
Canvas or university website was used. Unknown websites can still create server
access records or have undisclosed GET side effects; this adapter does not certify
arbitrary servers as state-free. Actual institutional-site validation is pending.
