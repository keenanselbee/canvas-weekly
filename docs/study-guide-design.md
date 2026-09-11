Personal study guide
====================

The guide should answer what to do next, when to prepare, which source explains
the work, and what needs verification. A list of Canvas records alone is not the
finished product. The factual source details remain available below the plan.


Implemented planning layer
--------------------------

- Lead with a count of outstanding dated work, upcoming work and undated items.
  Absence of a deadline never implies absence of reading or preparation.
- Add a compact Start here overview with one unfinished starting point per course.
  Prefer the earliest recorded due/closing boundary; otherwise show an AI preparation
  task or the weekly materials check. Keep the full checklist below. Display exact
  due/closing times separately from suggested preparation dates, and flag multiple
  outstanding items with the same course and exact due time. This is workload
  orientation, not an estimate of effort or a claim that other work is optional.
  Local completion advances the overview but never reduces the recorded submission
  backlog. View task expands and focuses the existing checkbox without network access.
- Create a preparation task for each outstanding item in the lookahead window.
  For expired availability, overdue work, stale information, unknown submission
  state or missing dates, suggest checking the next step rather than asserting
  that the work must be submitted or an optional retry must be taken.
- Suggest starting days within the remaining guide week. These are adjustable
  suggestions, not class times, a capacity-aware schedule or new deadlines.
  Display source due times separately and preserve them unchanged.
- Items with neither a due time nor a closing time have no invented start day.
  Keep their existing task IDs, local progress and per-item verification notes in
  per-course Timing to confirm groups. Course materials checks explicitly ask the
  student to review these items against the current schedule. No title heuristic
  declares an item optional or historical. An undated item with a closing time
  stays in the dated plan, with the closing time visible.
- An undated backlog does not affect preparation-day allocation for dated items.
  AI may add conditional preparation or verification steps to an unscheduled item,
  but cannot promote it into the dated plan without a recorded time.
- Add a weekly materials check per selected course, including courses with no
  assignments. Do not guess required readings or effort from titles or points.
- Surface specific missing instructions/status/dates, unavailable sources, links
  whose contents were not collected, and messages that may qualify deadlines.
  A possible instructor exception is a verification prompt, not an automatic
  replacement of the structured assignment date.
- Keep preparation steps collapsed in the app. Group tasks by suggested day and
  show exact source links. Timing-review groups start collapsed and retain focus
  when the student checks a task. Render the same plan and separate timing-review
  section before source details in Markdown, HTML and Word.

The deterministic steps are general preparation advice. ChatGPT can refine up to
twelve priorities with specific steps, suggested dates and verification questions.
Validate source IDs, calendar dates, due/closing limits and bounded text. Required
or optional steps must carry a short quote found in the supplied source. Quote
matching is not semantic proof: label those steps as AI interpretation and retain
the quote for review. Stale sources keep verification prompts; unknown/expired/
undated work retains its verification-first task and conditionally adds AI steps.
Display how many tasks ChatGPT refined so generic prompts are not mistaken for a
complete AI interpretation. A connected account alone does not enable suggestions.


Local task completion
---------------------

Checkmarks mean preparation checked off, never Canvas submission or module
completion. A narrow IPC accepts only a task ID present in the saved guide and a
boolean. It uses the saved guide account so it works offline, without connecting
to Canvas. Conflicting operations are serialized by the app's busy state.

Store progress separately in the account's study-progress.json. A fingerprint of
task content and supporting requirements reopens a completed task when they change.
Assessment preparation persists between weeks; the weekly materials-check ID
includes the week so it renews on Monday. Account keys prevent cross-account reuse.

Opening the guide rebuilds only the local document with current checkmarks, then
opens it through Windows. It does not fetch Canvas or call ChatGPT. Unchanged
exports do not create redundant revisions. Manual edits still block replacement;
use checkboxes in the app and Student Notes.md for editable personal notes.

Older version-one guides stored plain syllabus and announcement text without an
evidence array. Loading or exporting those guides now recovers the text into the
current evidence format. Existing evidence arrays, including empty arrays, remain
authoritative. Recovery preserves the guide's week and collection time, redacts
credential lines, retains plain-text angle brackets, and uses safe source links.
Recovered sources are stale, with unknown individual observation times; the old
guide's collection date is displayed separately. A coverage note asks the student
to recheck them. Load does not rewrite disk state; an explicit export persists the
recovery through the existing revision and manual-edit protections. Subsequent
successful source reads replace the recovered entries using their stable IDs.

Open guide now selects the standalone Weekly Plan.html document in the browser.
It includes section navigation, light/dark appearance, a compact navigation menu
on narrow windows, and print styles. Preparation checkboxes are a disabled
snapshot of app progress. Markdown and Word copies remain available alongside it.
Word preserves the same study plan and supporting evidence, using native headings
and lists, To do/Done labels, source hyperlinks and page numbers. It uses a compact
reference layout with a simple masthead. No course images or scripts are embedded.
Manual Word edits block replacement just like edits to the other generated files.
Source content is escaped; the document contains no executable scripts, remote
images, fonts or other automatic network requests. External source navigation
occurs only when the student clicks a link.

Print options in the HTML reading note offers Full guide (default) or Overview
and checks before using the browser's Print command. Native radio inputs and CSS
select the print scope without scripts or changing the on-screen document. The
overview retains course starting points, all outstanding dated records in the
guide, and the main verification section. Checking preparation off never removes
an outstanding submission deadline. A printed notice directs students to the full
guide for undated work, every task, per-item checks and source details. Starting-point
blocks and deadline rows stay together where they fit on a page. New exports
default to Full guide; the app does not persist the choice. Markdown and Word
exports are unchanged.


Further acceptance work
-----------------------

1. Evaluate richer planning against the full real-course evidence and improve
   workload balance using student availability rather than an invented timetable.
2. Broader browser and representative full-course export review. Electron HTML
   printing passed a synthetic four-page full/two-page overview check, and every
   page of a five-page overview of the saved four-course guide was inspected.
   The 59-page full reference printout has not had complete visual review.
   Word export passes structural/content and file-safety tests; a six-page guide
   was paginated in Word 16.0 and every rendered page inspected. See the
   [native Word layout check](word-layout-check.md). This does not establish
   layout in other Word versions or with arbitrary course content.
3. Validate external course sites with real course access; add browser-login and
   Canvas-hosted file downloads. Public/Basic HTML/text and scoped PDF/DOCX text
   collection are implemented with explicit extraction gaps.
4. Tightened UBC login verification, with no unverified claims about the earlier
   Canvas account state. A live Codex planning turn with synthetic evidence passed.
