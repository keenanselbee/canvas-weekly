Personal release review
=======================

Reviewed September 11, 2026 against PRODUCT_PLAN.md, the user requests and the
implementation ledger. This is an acceptance review, not a declaration that the
whole goal is complete. Local tests use synthetic accounts; they cannot establish
UBC deployment behavior or the completeness of a student's course materials.


Requirements and evidence
-------------------------

| Requirement | Current evidence | Remaining acceptance |
| --- | --- | --- |
| Simple Windows app, no terminal needed for routine use | Electron shell; x64 installer includes Codex; package test checks actual bundled source/runtime and first-run state | Human installation/uninstallation walkthrough and clean-machine check |
| System light/dark with persistent overrides | nativeTheme integration; desktop/package tests and light/dark screenshots | No known implementation gap; other Windows display configurations remain untested |
| Human Canvas sign-in and saved course selection | Narrow login bridge, encrypted credentials, isolated synthetic connection lifecycle tests; earlier user login succeeded before the latest restrictions | Reopen the current build and validate tightened UBC login and a real selected-course refresh |
| Never start/resume quizzes, submit or message; preserve learning/read state | Denied assessment/action routes, exact pending-request admission, reviewed fixed queries, local network fixtures and request ledger | Historical account invariance cannot be certified without the missing earlier baseline; current UBC resolver/deployment assumptions remain unverified |
| As much useful course information as safely available | Metadata, own submission status, stored syllabus, course-tagged messages with supplied sender names and rubric criteria; retained stale evidence and explicit source coverage | Assignment instructions, full rubric details, Canvas page/file contents and modules remain excluded due to unreviewed or side-effectful access paths; sender roles and full course completeness are not verified |
| Course websites and linked documents | Scoped public/HTTP Basic HTML/text/PDF/DOCX adapter, encrypted credentials, local HTTPS fixtures | Actual DATA 311 site access is unverified; browser-only login sites remain unsupported |
| Personal study guide and to-do list with uncertainty | Starting point per course, local checkmarks, source-backed preparation, separate recorded dates, verification prompts and undated backlog | Compare real current course evidence against a manual inventory; full-course AI planning quality is unverified |
| ChatGPT/Codex connection and usage | Official pinned app-server integration, isolated credentials, prior live account/synthetic planning result; token panel tested | Real course evidence has not been sent for quality evaluation; personal AI setting remains off |
| Desktop/Canvas Weekly default and other folder option | Known Desktop folder resolution, native picker, settings/initializer and packaged default checks | No known implementation gap |
| Academic timezone and Monday-Sunday week identity | Settings control, validated narrow IPC, saved timezone tests; date/rollover/DST tests | Confirm the academic timezone against the student's Canvas setting during live validation |
| Same-week updates, new-week files, diff/history and notes | Guide tests cover revisions, rollover, overrides, deduplication, stale retention and manual-edit protection; synthetic desktop exports/progress pass | Live changed-source comparison remains unverified with the replacement collector |
| Readable standalone files and offline Open guide | Markdown/HTML/Word exports; HTML makes no automatic network requests; synthetic Word six-page render and HTML print overview review | Full 59-page saved reference printout not visually checked on every page; broader browser/Word layout remains unverified |
| Useful failure and reconnect behavior | Cancellation, changed-account/cookie rejection, last-known source retention and protected exports tested | Tightened UBC reconnect and actual source failures need live testing |
| Clear data policy, reading choices and collection history | Data & privacy page, per-account reading preferences, durable intent/outcome history and post-update summaries; synthetic UI/refresh tests | Expanded reading remains unavailable pending source review and validation; existing pending preferences cannot silently activate new operations |
| Design/architecture and DIFF/COMMIT milestones | Product, UX, architecture, source-admission reviews and commit history | Keep claims tied to the admitted scope; no push or publishing requested |


Next live validation
--------------------

Earlier reviews observed an older development window. That observation is not
evidence of the current running process or a test of the latest code. Before live
validation, identify the executable/build being used and reopen the current app
if necessary. Local package tests use separate profiles and do not replace or
validate the student's personal window.

After reopening the current app, the student handles Canvas login/MFA. Validate
the selected courses and one manual refresh, then compare the collected inventory,
dates, submission states and coverage against the student's Canvas view. Do not
enter assessments or change read/progress state merely to test the collector.
Review the credential-free request ledger for that run; it does not cover login
traffic or prove the absence of all server effects.

Connect the course's actual website through its separate supported login, then
check syllabus, schedule, lecture links and extraction gaps. Keep AI off unless
the student enables it. Evaluate full-course planning only after collecting
current evidence and obtaining that preference; a synthetic AI result is not
proof of useful personal planning.

Scheduling, Claude/Gemini adapters, hosted service and public distribution remain
later product directions under the implementation ledger. They are not silently
enabled by this review. Unsupported content remains a documented limitation, not
a reason to bypass the user's Canvas safety boundary.
