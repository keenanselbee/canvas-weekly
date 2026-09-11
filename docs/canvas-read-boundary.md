Canvas read boundary: transitive review
======================================

Current status, 2026-09-11: the fixed assignment/direct-submission metadata
collector is admitted for manual refreshes under the
[bounded admission decision](canvas-metadata-admission.md). The subsequent
[message decision](canvas-message-review.md) admits fixed course-tagged discovery
and text queries with fatal-error propagation and optional-source coverage. The
[syllabus decision](canvas-syllabus-review.md) separately admits stored syllabus
text and references; assignment descriptions remain excluded. Legacy REST body,
module, quiz and Canvas file-content reads remain disabled. Historical pause
references below describe earlier repair stages; they do not certify the old
collector or establish unchanged account history. Full content collection and
live institutional compatibility remain unfinished.

Reviewed 2026-09-10. The previous safety review was incomplete. This follow-up
pins public Canvas source to commit `1c9f0bb8013ed69c4f2efe11fd483025469b7e6c`;
it does not identify UBC's deployed revision. No authenticated Canvas request,
storage request, quiz action or compensating account write was made for this review.

Finding and current repair
--------------------------

Avoiding explicit POST/PUT operations and module routes is insufficient. The
server can change learning records while constructing otherwise ordinary GET
responses. Live guide refresh is now paused, including a main-process check before
profile verification and a refusal inside CanvasClient.collect. The normal scan
implementation has been withdrawn rather than left reachable after the UI check.
There is no user setting, environment switch or production test flag to bypass it.

Assignments, quizzes and page-list operations are removed from the finite REST
table, so their old URLs also fail network admission. The file-name operation
requires the documented only[]=names parameter; removing, replacing or duplicating
it fails pagination/network validation. It is not run during the paused refresh.

Saved guides can still be opened and exported with current local checkmarks. New
exports show the pause notice without changing the original collection timestamp.
This is a safety repair, not completion of the automatic-collection requirement.

Pinned source paths
-------------------

| Surface | Transitive behavior found | App decision |
| --- | --- | --- |
| Pages with body inclusion | Wiki-page serialization calls context_module_action with read after producing an accessible body. Lock serialization also runs before it. | Remove the operation; do not replace it with page navigation. |
| Assignment listing | The serializer invokes locked_json unconditionally. That helper invokes the object's lock policy; this is not just a stored boolean. | Remove pending complete resolver/permission review of an alternative. |
| Quiz listing | Quiz serialization includes lock fields and permission-dependent behavior. A serializer-only skip option is not evidence that a public endpoint safely supports it. | Remove pending a reviewed metadata alternative; never obtain attempt contents. |
| Default file metadata | The serializer checks locked_for? before building the download URL, then emits lock details. | Require names-only, whose serializer returns before these checks. Do not infer availability from absent lock fields. |
| File public_url | The controller checks download authorization, and Attachment's policy calls locked_for?. Replacing the final download route does not remove this chain. | Keep blocked; no preview/verifier trick or storage URL fallback. |
| Module lock evaluation | An attachment or page can reach ContextModuleItem, ContentTag and ContextModule.available_for?. Depending on prerequisites/sequencing/unlock state, that can find_or_create_progression, and deep checking can evaluate it. | Treat permission checks as potentially stateful, even without an explicit read-completion action. |

Source references:

- [Wiki-page serializer](https://github.com/instructure/canvas-lms/blob/1c9f0bb8013ed69c4f2efe11fd483025469b7e6c/lib/api/v1/wiki_page.rb)
- [Assignment serializer](https://github.com/instructure/canvas-lms/blob/1c9f0bb8013ed69c4f2efe11fd483025469b7e6c/lib/api/v1/assignment.rb)
- [Assignment lock implementation](https://github.com/instructure/canvas-lms/blob/1c9f0bb8013ed69c4f2efe11fd483025469b7e6c/app/models/abstract_assignment.rb)
- [Locked response helper](https://github.com/instructure/canvas-lms/blob/1c9f0bb8013ed69c4f2efe11fd483025469b7e6c/lib/api/v1/locked.rb)
- [Quiz serializer](https://github.com/instructure/canvas-lms/blob/1c9f0bb8013ed69c4f2efe11fd483025469b7e6c/app/serializers/quizzes/quiz_serializer.rb)
- [Shared serializer lock evaluation](https://github.com/instructure/canvas-lms/blob/1c9f0bb8013ed69c4f2efe11fd483025469b7e6c/app/serializers/locked_serializer.rb)
- [Model lock delegation](https://github.com/instructure/canvas-lms/blob/1c9f0bb8013ed69c4f2efe11fd483025469b7e6c/lib/locked_for.rb)
- [File serializer](https://github.com/instructure/canvas-lms/blob/1c9f0bb8013ed69c4f2efe11fd483025469b7e6c/lib/api/v1/attachment.rb)
- [File controller](https://github.com/instructure/canvas-lms/blob/1c9f0bb8013ed69c4f2efe11fd483025469b7e6c/app/controllers/files_controller.rb)
- [Attachment policy](https://github.com/instructure/canvas-lms/blob/1c9f0bb8013ed69c4f2efe11fd483025469b7e6c/app/models/attachment.rb)
- [Module item lock delegation](https://github.com/instructure/canvas-lms/blob/1c9f0bb8013ed69c4f2efe11fd483025469b7e6c/app/models/context_module_item.rb)
- [Content tag delegation](https://github.com/instructure/canvas-lms/blob/1c9f0bb8013ed69c4f2efe11fd483025469b7e6c/app/models/content_tag.rb)
- [Module availability and progression creation](https://github.com/instructure/canvas-lms/blob/1c9f0bb8013ed69c4f2efe11fd483025469b7e6c/app/models/context_module.rb)

What this does and does not prove
--------------------------------

The source shows reachable write paths, not proof that the earlier UBC run took
them or changed a particular record. No complete request ledger, prior progression
baseline or institutional server audit is available. Do not infer unchanged
learning state from unchanged grades or lack of POSTs. Do not undo progress.
Normal authentication/access records remain expected server-side effects.

The retained profile/course connection and other dormant metadata operations are
not a blanket certification of all Canvas APIs. Before restoring collection,
review every operation actually used, its serializer, permission checks and any
linked-content processing. Use pinned source and institutional compatibility
evidence rather than testing against a student's live account to discover effects.

Replacement collector acceptance
--------------------------------

1. Preserve the intended product: automatic student-specific deadlines, status,
   instructions, course materials and message context with source coverage. A
   permanent offline-only app or deadlines-only feed is not the target.
2. Investigate explicitly selected read fields (for example a fixed GraphQL query)
   or an institution-supported read-only export. Review field resolvers and their
   authorization transitively; the word query alone does not establish safety.
   Preserve student access restrictions without evaluating completion requirements
   or using privileged/unscoped data to get around them.
3. Enumerate exact operations, fixed parameters/fields, student identity scope,
   pagination, cancellation, redirects, audit behavior and credential handling.
   Keep starting/resuming attempts, submitting work, sending messages and editing
   accounts unavailable. Reading the student's existing submission status is a
   separate metadata operation requiring review. Any
   transport change must preserve this invariant, not merely a GET-only label.
4. Test the complete supported path using synthetic institutional responses and
   server behavior representing locks, unavailable content, overrides and failure.
   Confirm rejected requests never reach transport. Keep offline notes, revisions
   and local completion unchanged after failed/cancelled scans.
5. Only then perform the authorized institutional compatibility check with human
   sign-in where necessary. Report any source gaps and avoid claims of historical
   or universal account invariance.

Local document import remains a useful complementary path while this work is
pending, not a substitute for the automatic collector. It must retain provenance,
copy age and uncertainty without contacting Canvas.

The replacement query/parser and bounded POST transport are implemented as isolated
components; see [metadata collector design](canvas-metadata-design.md). Fixed queries
passed pinned-schema validation, and actual Electron admission passed local HTTPS
tests. There is still no production admission, verified live authentication binding
or restoration of refresh and assignment instructions.
