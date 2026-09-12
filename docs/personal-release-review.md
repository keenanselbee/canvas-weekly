Personal release review
=======================

Reviewed September 12, 2026 against PRODUCT_PLAN.md, evidence-first-plan.md, the user requests and the
implementation ledger. This is an acceptance review, not a declaration that the
whole goal is complete. Local tests use synthetic accounts; they cannot establish
UBC deployment behavior or the completeness of a student's course materials.


Requirements and evidence
-------------------------

| Requirement | Current evidence | Remaining acceptance |
| --- | --- | --- |
| Simple Windows app, no terminal needed for routine use | Electron shell; x64 package includes Codex; source/payload inventory and isolated first-run tests; Inno fixture install/reinstall/update/uninstall and guarded migration checks | Candidate is separate from default NSIS packaging; real wizard, elevation, shortcuts, clean-machine and personal migration walkthrough remain unverified |
| System light/dark with persistent overrides | nativeTheme integration, desktop/package tests and light/dark screenshots; four-page simulated scale/zoom checks; Inno candidate uses dynamic startup appearance and the white calendar in every theme | Default NSIS wizard lacks dark controls. Inno high contrast, actual DPI transitions and human theme walkthrough remain unverified; native progress remains green |
| Human Canvas sign-in and saved course selection | Narrow login bridge, encrypted credentials, isolated synthetic connection lifecycle tests; earlier user login succeeded before the latest restrictions | Reopen the current build and validate tightened UBC login and a real selected-course refresh |
| Never start/resume quizzes, submit or message; preserve learning/read state | Denied assessment/action routes, exact pending-request admission, reviewed fixed queries, local network fixtures and request ledger | Historical account invariance cannot be certified without the missing earlier baseline; current UBC resolver/deployment assumptions remain unverified |
| As much useful course information as safely available | Metadata, own submission status, stored syllabus, course-tagged messages, rubric criterion/rating descriptions; retained stale evidence and per-source limitations | Assignment instructions, numeric rubric scoring, Canvas page/file bodies and modules remain excluded. Sender roles and complete course coverage are not verified; do not infer no work from these gaps |
| Course websites and local documents | Scoped public/HTTP Basic HTML/text/PDF/DOCX adapter; independent website refresh preserves Canvas facts; previewed PDF/DOCX/TXT/MD import, replacement/removal and account isolation; complete extracted text with partial-document warnings | Current-build live course-site coverage needs review. Browser-only website login, scanned pages and diagrams remain unsupported; linked references do not mean content was read |
| Personal study guide and to-do list with uncertainty | Explicit full weekly-guide generation from saved evidence, per-course tasks, cited quotes/questions, recorded dates and local checkmarks; reviewed live four-course fictional output and shared app/document views; independent split-action checkmarks; opt-in study preferences | Representative real-course and manual online-chat review remain pending. Source/quote validation cannot establish correct interpretation; compare real evidence against a manual course inventory |
| Export for online AI chat | Offline Course Information.md and copyable prompt; full normalized text/references, credential filtering, source IDs/timestamps and protected revisions; shared projection with connected AI | User must review and upload; provider-specific attachment parsing/limits and guide quality remain unverified. Export is not proof of complete Canvas collection |
| ChatGPT/Codex connection and usage | Pinned app-server integration, bundled runtime, isolated encrypted login and token panel; the current full-guide live test restored the development connection and reported 14,726 tokens with zero tool requests. Collection never invokes AI | One fictional run does not prove interpretation quality for every course or input |
| Bounded connected AI input | Course/task/source metadata reserved before large text; initial text allowance per course; entire UTF-8 input bounded, whole passages retained or explicitly omitted; excluded coverage/reference counts shown | Size limits still exclude material. Read the full manual pack when omissions matter; no local allocation test proves that the model used every included source |
| Desktop/Canvas Weekly default and other folder option | Known Desktop folder resolution, native picker, settings/initializer and packaged default checks | No known implementation gap |
| Academic timezone and Monday-Sunday week identity | Settings control, validated narrow IPC, saved timezone tests; date/rollover/DST tests | Confirm the academic timezone against the student's Canvas setting during live validation |
| Same-week updates, new-week files, diff/history and notes | Guide tests cover revisions, rollover, overrides, deduplication, stale retention and manual-edit protection; synthetic desktop exports/progress pass | Live changed-source comparison remains unverified with the replacement collector |
| Readable standalone files and offline Open guide | Factual reference and AI-plan Markdown/HTML/Word views; HTML makes no automatic network requests; offline export and synthetic Word layout checks | Current real-course AI document quality and long-document layout remain unverified; earlier print checks do not prove every new output layout |
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
check syllabus, schedule, lecture links and extraction gaps. Collection and website
refresh never invoke AI. Export for AI creates a local file; Create my weekly guide
is the explicit connected AI action. Connecting ChatGPT is not consent to an
automatic run. Review what will be shared before either route.

The fictional four-course live test in ai-guide-acceptance.md passed its ten
semantic criteria. Next, separately test manual upload in an online chat. Only
then evaluate representative real course material chosen by the student.
A schema-valid or synthetic result is not proof
of useful personal planning.

Current source validation: 188 unit tests and the synthetic desktop workflow pass.
The separate live test used the development ChatGPT connection with fictional
data only. The earlier Inno candidate passed source matching and package privacy
checks; it has not been rebuilt for this milestone.
The remaining account and human-wizard gates prevent declaring the full goal
complete. See implementation-plan.md for the current payload lifecycle result.

Scheduling, Claude/Gemini adapters, hosted service and public distribution remain
later product directions under the implementation ledger. They are not silently
enabled by this review. Unsupported content remains a documented limitation, not
a reason to bypass the user's Canvas safety boundary.
