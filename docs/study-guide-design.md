Personal study guide
====================

The guide should answer what to do next, when to prepare, which source explains
the work, and what needs verification. A list of Canvas records alone is not the
finished product. The factual source details remain available below the plan.


Implemented planning layer
--------------------------

- Lead with a count of outstanding dated work, upcoming work and undated items.
  Absence of a deadline never implies absence of reading or preparation.
- Create a preparation task for each outstanding item in the lookahead window.
  For expired availability, overdue work, stale information, unknown submission
  state or missing dates, suggest checking the next step rather than asserting
  that the work must be submitted or an optional retry must be taken.
- Suggest starting days within the remaining guide week. These are adjustable
  suggestions, not class times, a capacity-aware schedule or new deadlines.
  Display source due times separately and preserve them unchanged.
- Add a weekly materials check per selected course, including courses with no
  assignments. Do not guess required readings or effort from titles or points.
- Surface specific missing instructions/status/dates, unavailable sources, links
  whose contents were not collected, and messages that may qualify deadlines.
  A possible instructor exception is a verification prompt, not an automatic
  replacement of the structured assignment date.
- Keep preparation steps collapsed in the app. Group tasks by suggested day and
  show exact source links. Render the same plan before source details in Markdown.

The initial deterministic steps are deliberately general preparation advice.
Existing source-validated ChatGPT priorities can replace matching task titles and
reasons. Richer source-specific steps and a narrative summary are the next planner
extension; a connected account alone does not enable Study suggestions.


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


Further acceptance work
-----------------------

1. Rich AI summary, source-specific steps, optional/required distinctions grounded
   in quoted evidence, and dated suggestions validated against source deadlines.
2. Readable standalone document presentation and verified Word output.
3. External course sites and linked documents with explicit collection coverage.
4. Live Codex planning and tightened UBC login verification, with no unverified
   claims about the earlier Canvas account state.
