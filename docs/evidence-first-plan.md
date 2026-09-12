Course evidence and AI study guides
==================================

Revised direction authorized September 11, 2026. This is the current goal
interpretation and supersedes plans to build a universal rule-based factual
study planner. Existing factual guides remain available during migration.


Revised goal
------------

Build Canvas Weekly as a simple Windows desktop app that collects as much
relevant Canvas and connected course-source information as its reviewed access
policy permits, organizes it into a complete, source-linked evidence pack, and
supports two ways to create a personal weekly study guide: exporting a document
and prompt for an online AI chat, or using the connected ChatGPT/Codex planner.
Preserve recorded deadlines and submission status as factual reference data.
Clearly identify missing, stale, partial, omitted and conflicting information.
Retain system-aware light/dark appearance, native installation, account isolation,
Desktop/Canvas Weekly defaults with a folder override, local notes/history,
and DIFF/COMMIT at suitable milestones. Never start, resume or submit coursework,
answer assessments, send messages or change Canvas content or preferences.

Collecting more information does not authorize arbitrary browser actions or
requests. Any future admission of reads that may mark items viewed requires the
existing explicit access choice, effect disclosure and request history. Such
reads remain unavailable while the safety hold is active. The AI never receives
Canvas credentials or a Canvas action tool.


User experience
---------------

1. Connect Canvas, select courses and optionally connect course websites.
2. Collect course information and inspect coverage, age and changes.
3. Choose Export for AI or Create my weekly guide using the connected AI.
4. Review the source-linked guide and its questions, then maintain local notes
   and preparation checkmarks. Recorded Canvas status remains separate.

The factual fallback is an evidence/deadline view, not an inferred timetable.
Optional study availability and priorities belong to the student. Future
suggested study dates must be labeled as suggestions, not course deadlines.
Keep familiar existing actions until their replacements are functional.


Architecture and delivery
-------------------------

Normalized saved records feed an explicit evidence projection. This projection
includes all assessment records, course text, source references, coverage and
changes. It excludes authentication storage, settings, participant rosters,
local filesystem paths, student notes and previous AI output. Existing credential
label and unsafe-link filtering is applied again. Free-text filtering is not a
proof that every secret or personal detail is removed; show a review-before-upload
notice. Exporting does not upload anything.

Both manual export and connected planning consume the same projection. The
manual Markdown document preserves complete normalized source text, quoted in
JSON records with stable source IDs, and includes a ready-to-copy prompt. It does
not claim to include source data the collector never obtained. Connected input
limits omit whole text bodies rather than cutting off later conditions or
exceptions, and report omitted records and texts. Output validation continues
to enforce known sources and separate suggested preparation from requirements.

Milestones:

1. Shared evidence pack, offline Export for AI, copyable prompt, explicit AI
   input omissions, and protected same-week files. Implemented in this change;
   validation results are recorded in the implementation ledger.
2. Replace suggestion-only connected output with a full weekly guide using the
   same pack: overview, per-course to-do list, deadline clusters, source citations
   and precise questions. Run it independently of collection and preserve the
   previous successful output on failure. The separate Create my weekly guide
   action, validated output, local checkmarks and app/Markdown/HTML/Word views are
   implemented. Optional account-scoped availability, priorities and guide length
   are implemented with explicit sharing off by default. Live generation-quality
   review remains pending. Automatic Study suggestions is retired: collection
   never starts an AI run, including for older saved settings.
3. Improve collection coverage within reviewed boundaries, guided by actual
   missing sources; improve connected-site discovery and consider user-supplied
   documents. Preserve provenance and make per-source limitations visible.
4. Rework the main screen around collection, coverage and the two AI routes.
   Keep a concise factual deadline view and retire arbitrary rule-based start
   dates. Validate light/dark, keyboard use, installer and live-account limits.
   Collection and AI actions are now separated in the primary interface. The
   generic preparation checklist is collapsed in the app during migration;
   retiring it from factual exports remains pending.

Completion requires both AI routes to be usable, exports to preserve collected
evidence without silent clipping, connected guides to retain traceable facts,
and coverage/safety limitations to remain visible. This milestone alone does not
complete the revised goal or resolve institutional collection restrictions.

Study preferences are stored separately from course evidence in the current
account's planning-preferences.json. They are not encrypted, and are not course
requirements. Only the explicit shared projection enters a new evidence export
or AI request. Student Notes.md and other settings remain excluded. The AI guide
retains which shared preferences it used; changed or disabled preferences flag
that guide for regeneration. Clearing current preferences cannot recall earlier
documents, revisions, AI guide snapshots or data uploaded to an AI service.
