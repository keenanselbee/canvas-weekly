Factual guide without AI
=======================

Proposed next milestone: the default guide should tell a student what is due,
what the posted instructions say to do, and which specific details need checking.
AI should be optional refinement, not a requirement for a useful guide.

Current limitations
-------------------

`src/study-plan.js` already creates local checklists, chooses a starting point per
course, groups undated items and flags possible deadline changes in messages.
However, its non-AI steps are generic. A single stale or unknown field changes a
task into a broad verification prompt. Suggested starting days are distributed by
task order rather than a student's availability or measured workload. Full source
text appears later in the guide, separated from those tasks.

The metadata collector often cannot supply current instructions or availability.
Better wording cannot fill those gaps. Improve presentation using information
already collected, then add sources only within the existing collection policy.

Recommended guide structure
---------------------------

1. This week at a glance: due dates, overdue or closed items requiring a decision,
   and the next deadline cluster. State the refresh time and coverage plainly.
   An empty list means no dated work was found, not that the student has no work.
2. A short checklist per course: task name, recorded deadline, current submission
   status, posted deliverables and relevant materials. Keep the source link beside
   each task. Completing a preparation checkmark stays local.
3. Needs checking: the specific missing or conflicting field and where to verify
   it. Keep known facts visible even when another field is unavailable.
4. Changes since the last refresh: new work, changed dates, changed instructions
   and potentially relevant course updates. Preserve both sides of a conflict.
5. Full source details: expandable in the app and later in exported guides.

Deterministic extraction
-------------------------

Use structured Canvas fields first. From collected instructions, retain short
source excerpts for deliverables, file types, word limits and named readings.
Prefer explicit headings, list items and whole sentences. Carry conditions,
exceptions, negation and nearby context; do not silently turn an example or an
optional activity into a requirement. If a passage cannot be shortened safely,
show the original passage under Instructions rather than inventing a summary.

Each extracted fact needs a source ID, exact supporting excerpt, observation
time and freshness state. Rules are fallible: label excerpts as posted information
and make the full source easy to inspect. Do not derive quiz answers, start an
attempt, resume work, submit work or mark anything complete in Canvas.

Separate three kinds of content in each task:

- Posted information: source-backed facts and short excerpts.
- Suggested preparation: clearly labeled generic steps appropriate to the task
  type, such as checking the lab requirements or reviewing named lecture notes.
- Needs checking: missing instructions, unrefreshed availability, unknown status,
  or an instructor-message discrepancy. Do not replace a recorded deadline using
  a text match in a message.

Timing and scope
----------------

Sort by confirmed urgency and group items sharing a deadline. Show upcoming work
early enough to see a workload cluster. Do not invent effort estimates or assign
arbitrary calendar days. Offer optional local planned dates and effort estimates
entered by the student; distinguish them from course deadlines.

Undated work stays grouped by course until applicability and timing are known.
Use a course schedule to assign readings to a week only when the source explicitly
supports that match. External course websites and supplied files should have their
own coverage indicator; a detected URL is not proof its contents were read.

Delivery and verification
-------------------------

First implement the shared factual task model and source excerpts, then render
the same content in the app, HTML, Markdown and Word. Keep AI steps separate so
enabling or disabling AI cannot change recorded facts. Record source changes so
old local checkmarks do not silently certify changed requirements.

Test missing fields, stale instructions with a fresh due date, conflicting message
dates, optional and conditional wording, several tasks due together, undated
readings and empty collection results. Run an offline guide with AI disabled and
verify that every asserted requirement links to its supporting source. Collector
permissions and Canvas progress protections remain unchanged in this milestone.
