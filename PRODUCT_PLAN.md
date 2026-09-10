# Canvas Weekly: product and delivery plan

Status: implementation authorized, September 10, 2026. See
[implementation milestones](docs/implementation-plan.md) for current delivery
status, [Windows UX](docs/ux-design.md), and [architecture](docs/architecture.md).
This document does not enable scheduling or connect any accounts.

## Product goal

A student opens Canvas Weekly, connects Canvas through a supported login method,
chooses courses, and gets a source-linked answer to: what do I need to do this
week, what changed, and what should I start preparing for?

The product gathers and explains academic information. It never performs work
inside an assessment or changes the student's Canvas content or preferences.
The strict collection boundary in README.md applies to every product version.

Initial scope: serve Keenan on Windows, with a path to students who do not use
Codex. Follow Windows light/dark appearance by default with manual overrides.
Decide on other operating systems after the collection workflow works reliably.

## Delivery choices

| Form | Student experience | Constraints | Recommendation |
| --- | --- | --- | --- |
| Codex workflow | Ask Codex to refresh the guide | Requires Codex and a compatible local tool environment | First working version |
| Desktop launcher | Double-click, then Update guide / Open guide | Still depends on the installed local engine and its AI access | First usability milestone |
| Standalone desktop app | Installer, normal login, course selection, folder picker, update status | Must package updates, session handling, and model authentication | Recommended personal end state |
| Browser extension | Click an action while signed into Canvas | Local file integration and background execution need separate design; extension does not eliminate model access requirements | Conditional option if browser-session collection proves necessary |
| Hosted web app | Sign in from any device, automatic server refresh | Requires supported Canvas authorization, server operations, per-user data isolation, and AI funding | Later, only if sharing demand justifies it |

Current local work runs on the user's Windows computer through this session's
tools. There is no separate always-on assistant computer collecting Canvas data.
Local scheduled collection needs the computer and its runner available. Reading
an already exported guide can be independent of the computer, if the student
chooses a synced output folder.

Do not assume a Codex SDK process inherits this conversation's browser tool or
plugin connections. The collector must provide its own supported access adapter.

## Finished desktop experience

First use:

1. Open Canvas Weekly and choose the Canvas institution URL.
2. Connect using the supported institution-specific method. Human handles login
   and MFA. If token authorization is unavailable, explain the supported browser
   alternative without bypassing restrictions.
3. Show discovered courses and let the student include academic courses and
   optional application/co-op work. Show source coverage and unavailable sources.
4. Default output to Desktop/Canvas Weekly. Provide a folder picker, academic
   timezone and week boundary, and optional future refresh schedule.
5. Generate the baseline guide, then open it. Show last refreshed time and any
   course/source gaps alongside the result.

Routine use:

- Update guide: collect changes, update the current week, show a concise diff.
- Open guide: immediately open the latest available document, including offline.
- View changes: show deadline moves, requirement changes, new items and conflicts.
- Settings: courses, output folder, timezone, refresh schedule and AI connection.
- Reconnect Canvas: available when login expires, with the previous guide retained.

Use keyboard-accessible controls, readable text, explicit status labels and source
links. Do not rely on color alone for urgency or state. Technical logs belong in
an optional diagnostics view, not the routine student workflow.

## Output contract

Each weekly guide has a short actionable opening and detailed course sections:

- Top priorities with reasons, estimated effort where grounded, and prerequisites.
- Due dates, closing times, submission requirements and links to original pages.
- What changed since the previous successful refresh, including old/new values.
- Per-course readings, lectures/labs, project steps, rubrics and applicable rules.
- Upcoming work over the next 21 days and major semester commitments.
- Optional opportunities/retries separately from required work.
- Missing information, conflicting sources and last checked time by course/source.

Keep Markdown as the initial inspectable format, then add a verified Word export.
Offer PDF later if students want a fixed-layout version. Store generated material
apart from user notes and local completion state; arbitrary edits in generated
Word content must not be silently lost. The initial supported notes workflow is a
separate Student Notes document; in-app notes can later be merged at render time.

Same Monday-Sunday period means the same week identity and filenames. A new week
creates new files. Historical weeks are retained, with later corrections labeled
and recorded instead of silently rewriting history. Overdue unfinished work can
carry forward without changing its original due date.

Switching output folder redirects future exports while preserving local course
history. It does not automatically move or delete previous exports.

## Architecture that can grow beyond Codex

Use one core pipeline behind the chat workflow, launcher and eventual app:

```text
Canvas read adapter + linked document readers
                    |
                    v
Normalized facts + source snapshots + coverage ledger
                    |
                    v
Deterministic changes, dates, statuses and duplicate reconciliation
                    |
                    v
Optional AI interpretation and prioritization
                    |
                    v
Validated guide model -> Markdown / Word exports -> output folder
```

The collector owns all Canvas access. The AI planner receives selected evidence
and produces a structured guide; it does not need Canvas credentials or general
browser control. Enforce read restrictions in the collector independently of
model instructions. Treat retrieved course text as data, not executable commands.

Separate components:

1. Configuration and identity: course selection, output, academic timezone.
2. Read adapters: official API first; relevant linked documents; safe browser
   extraction for supported gaps. Calendar feed is supplementary.
3. Local store: SQLite or equivalent transactional storage for records, snapshots,
   source links, runs, extracted text, and local notes. Keep credentials outside
   the database and exports in OS-protected credential storage where supported.
4. Reconciliation: stable IDs, quiz-to-assignment mapping, student-specific dates,
   evidence conflicts, incomplete collection handling, change history.
5. Planner: Codex initially; a replaceable model integration for a standalone app.
6. Renderer: deterministic templates consuming the validated guide model.
7. Runner: manual now; cancellation, progress and scheduling later.

Local storage does not mean all AI processing is offline. Disclose what selected
course text/messages go to the configured AI service. Exclude unnecessary roster
data and unrelated messages. Provide local data cleanup and retention settings
before distributing the app.

Codex authentication and Canvas authentication are separate. A standalone student
app must provide a usable AI connection or funded backend; do not assume the
developer's Codex account automatically covers other users. A personal launcher
can use an installed authenticated Codex runtime where supported.

If AI is unavailable, still generate a clearly labeled factual deadline/change
report from structured data. AI failure must not erase a valid prior guide.

## Access feasibility comes first

Validate capabilities with the actual account before committing to the final
distribution form. Published API documentation is not proof of authorization.

- Are scoped API/token or OAuth reads available through a supported route?
- Can supported browser-session reads provide remaining required data?
- Can relevant Inbox messages be read with read state preserved?
- Can important external materials be retrieved without assessment launches?
- Which sources remain unsupported, and can useful guides expose those gaps?

Prefer an API-backed desktop app if supported access covers most data. Use browser
integration where institution-permitted session access is necessary. Consider a
browser extension only after determining it improves login reliability enough to
justify maintaining a second installed component. Consider hosted execution only
after confirming an appropriate authorization route for multiple users.

## Delivery milestones and acceptance criteria

### 1. One trustworthy course through Codex

Implement permitted collection and persistent facts for COSC 304. Produce a guide
with source links and coverage. Inspect every assessment in the selected horizon
against a manual inventory. Retrieve linked syllabus/materials. No assessment
attempt route is entered; verify the request guard independently.

### 2. Complete personal weekly workflow

Cover selected academic courses and co-op work. Incorporate relevant messages,
external sources and current-week/lookahead plans. Verify same-week updates,
Monday rollover, timezone/date overrides, duplicate merging, optional retries,
and preserved notes. Repeat runs without changes must not invent changes.

### 3. One-click use

Add a small local launcher with Update guide, Open guide, folder selection and
clear reconnect/error states. Test a run without typing a Codex prompt. Package
dependencies or explain them honestly; a shortcut alone is not a standalone app.

### 4. Dependable refreshes

Add optional scheduling after manual refreshes are reliable. Recover from missed
runs when the machine becomes available; avoid duplicate concurrent runs. Report
partial failures, expired login and stale data. Preserve the previous documents
on interruption, unavailable AI or Word/file locks. Use revisioned atomic writes.

### 5. Distribution to other students, if wanted

Create an installer, credential onboarding, upgrade/migration handling and an AI
access/cost model. Test on a clean student computer. Select another institution
only after validating its course formats and permitted authorization. A hosted
service is a separate product decision, not an automatic consequence of this step.

## Definition of success

- The student can identify urgent work and changes within a minute of opening.
- Every deadline/requirement has supporting evidence or an explicit uncertainty.
- All selected courses have visible coverage; inaccessible content is never hidden.
- Updates preserve notes and history, and never create duplicate tasks.
- No assessment interaction, messages sent, or intentional Canvas state edits.
- Another run is easy to launch, and failures say what needs attention.

## Open product decisions

- Primary audience: personal use first, non-Codex students, or hosted service.
- Preferred primary reading experience: Word document or eventual in-app guide.
- AI access for distributed use: student-configured connection or funded service.
- Desired unattended refresh cadence after access and reliability are proven.

## Sources for platform constraints

- [Codex SDK: programmatic local agent integration](https://learn.chatgpt.com/docs/codex-sdk)
- [Scheduled tasks: local availability and web limits](https://learn.chatgpt.com/docs/automations?surface=app)
- [Canvas authentication and developer authorization](https://developerdocs.instructure.com/services/canvas/oauth2/file.oauth)
- [Browser extension native messaging](https://developer.chrome.com/docs/extensions/develop/concepts/native-messaging)
