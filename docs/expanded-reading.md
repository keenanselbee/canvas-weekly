Expanded course reading and collection history
=============================================

Implemented: per-account/per-course requested reading preferences, explicit
acknowledgement, requested versus effective mode, durable Canvas request history,
latest-run summaries and history navigation. Limited reading remains the effective
mode in every run. No new Canvas content operation has been admitted.

Admission blocker
-----------------

The proposed view-based exception is not sufficient to admit assignment
descriptions as currently implemented upstream. In the previously pinned Canvas
revision 1c9f0bb8013ed69c4f2efe11fd483025469b7e6c:

- AssignmentType.description calls load_locked_for and then user-content rewriting.
- AbstractAssignment.low_level_locked_for? evaluates overrides and module locks,
  then calls touch_on_unlock_if_necessary.
- Within an hour before unlock, that helper schedules a primary-database job.
  touch_assignment_and_submittable later touches the assignment, its submittable
  object and, where applicable, child discussion topics.
- User-content rewriting also checks attachment permissions. Narrowing the field
  selection or declining downloads in the client does not remove this processing.

Sources: app/graphql/types/assignment_type.rb:628,
app/models/abstract_assignment.rb:2013 and :2035, and
lib/user_content/files_handler.rb in the pinned source. These are reachable code
paths, not evidence that an actual UBC account changed. The earlier source review
did not establish this path as only an access/view effect. No attempt to exercise
it on a personal account was made. UBC compatibility and the existing session
verification failure remain unresolved.

EXPANDED_AVAILABLE is false. Saved expanded preferences do not authorize these
operations, weaken the network allowlist, or change existing course data. Before
activation, review the full new resolver paths and effects, validate them in a
controlled Canvas course, and require renewed acknowledgement of the actual
enabled sources/effects. Do not silently activate existing pending preferences.

History contract
----------------

The main process records a run before local session verification, then connects
the existing credential-free audit to durable history. Each request intent is
saved before transmission. Failure to save history stops collection. History
contains course names/IDs, item IDs where available, operation names, timestamps,
response statuses and outcomes, never request bodies, headers, cookies or tokens.
Opening history makes no Canvas request. User-clicked source links open the
normal browser outside collection protection.

Completed, failed and cancelled updates remain available even without a new
guide. A run left running after restart is displayed as interrupted. Requested
and failed entries can have unknown server effects; an HTTP success is not proof
of a progress change. Effective reading mode is recorded independently of user
preference. Current entries identify no view effect in the admitted limited
requests, while retaining the access-activity caveat. No progress undo is offered.
History is stored in app-private collection-history files, separated by a hash
of Canvas origin and user ID, and retained when a login is forgotten. It is not
encrypted by the app. Old request logs are not retroactively attributed to runs.
External website requests remain represented by source coverage, not this ledger.

Remaining implementation sequence
---------------------------------

1. Diagnose the actual CW_SESSION error from the current UBC build; retain the
   identity/session guards while addressing compatibility. No personal refresh
   is needed for UI/history verification.
2. Review instruction/rubric fields and current individual date/availability
   resolvers, including automatic timestamp maintenance. Continue to block unknown
   effects beyond the user's authorized boundary.
3. Add verified message authors and announcements, then weekly module/page data,
   documents and quiz introductions. Keep attempt contents, external-tool launches,
   submission endpoints and explicit Mark done unreachable in every mode.
4. Each admitted expanded operation needs a fixed request definition, course/item
   binding, a conservative effect classification, durable intent, parser tests,
   actual gate interception tests and controlled Canvas effect validation. Do not
   replace this with unrestricted GET access or an autonomous browser.
5. Record item-level possible effects for those operations, including failures,
   and show the post-update access summary. Before/after observations alone do not
   prove causation. Preserve the separate local study checklist.
6. Feed newly verified content into required/suggested/needs-checking study tasks,
   retaining source attribution, observation times and conflicting deadlines.

The milestone adds the controls and visibility foundation. Expanded collection
and full source coverage are not complete.
