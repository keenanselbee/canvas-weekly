Canvas collection safety audit
==============================

Audited 2026-09-10. Findings describe application code, saved local evidence and
upstream Canvas source. They do not establish the exact UBC deployed version or
prove the absence of historical account changes. No authenticated Canvas requests
were issued for this audit.


Findings and repair status
-------------------------

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
Open guide have synthetic desktop tests confirming no Canvas fetches. Richer AI
steps, required/optional reading grounded in evidence and polished document output
remain. ChatGPT connection and enabled study suggestions are separate states;
a live model planning turn remains untested.
