Canvas syllabus field admission
===============================

Decision, 2026-09-11: admit CanvasWeeklyCourseSyllabus as an optional source after
student preflights and assignment metadata, before messages. It reads the selected
course ID and stored syllabusBody only. Assignment descriptions, module/page bodies,
quiz instructions and Canvas file contents remain excluded. This improves available
course context without completing the automatic instruction/material collection goal.


Selected source path
--------------------

Reviewed against pinned upstream revision 1c9f0bb8013ed69c4f2efe11fd483025469b7e6c,
using the complete local source archive. UBC's deployed revision is unknown.

- CourseType declares syllabus_body as a nullable String without a custom resolver.
  The existing course lookup, permission preloader and selected Course model review
  apply, as documented in the metadata admission. This selection adds no module,
  assignment lock, attachment serializer or user-content processing resolver.
- Course has no syllabus_body getter override in the reviewed source. Its validation
  and sanitize_field declaration concern saved content. CanvasSanitize.sanitize_field
  configures field sanitizers and registers before_save; it does not rewrite the
  selected getter or install a read callback.
- MasterCourses::Restrictor.restrict_columns records restriction configuration.
  Its included callbacks run on validation/create/update, not on reading the column.
- Course syllabus version tracking is attached to before_save/after_save and the
  previously reviewed versioning lifecycle. The selected read does not save the
  Course, run those callbacks or create a syllabus version.
- The fixed GraphQL operation name does not match the controller's create-submission
  or create-discussion participation hooks. Generic request telemetry, authentication
  bookkeeping and caches can persist, as described by the existing admission.

No attempt start/resume, submission, message send/read-state change or module-progress
operation was identified on this selected path. This is a bounded source finding,
not a promise about arbitrary GraphQL fields, institutional extensions or historical
account changes.

In contrast, AssignmentType.description calls load_locked_for, which calls
assignment.low_level_locked_for? with check_policies=true before processing attachment
links. That remains on the excluded lock/progress path. Requesting a description
without lockInfo would not avoid this resolver. The syllabus admission does not
permit that assignment field or a fallback through its REST/browser page.

Source references:

- [Course syllabus field](https://github.com/instructure/canvas-lms/blob/1c9f0bb8013ed69c4f2efe11fd483025469b7e6c/app/graphql/types/course_type.rb#L162)
- [Course sanitizer and version callbacks](https://github.com/instructure/canvas-lms/blob/1c9f0bb8013ed69c4f2efe11fd483025469b7e6c/app/models/course.rb#L388)
- [Sanitize field registration](https://github.com/instructure/canvas-lms/blob/1c9f0bb8013ed69c4f2efe11fd483025469b7e6c/gems/canvas_sanitize/lib/canvas_sanitize/canvas_sanitize.rb#L773)
- [Content restriction registration](https://github.com/instructure/canvas-lms/blob/1c9f0bb8013ed69c4f2efe11fd483025469b7e6c/app/models/master_courses/restrictor.rb#L37)
- [Assignment description resolver](https://github.com/instructure/canvas-lms/blob/1c9f0bb8013ed69c4f2efe11fd483025469b7e6c/app/graphql/types/assignment_type.rb#L628)
- [Assignment lock helper](https://github.com/instructure/canvas-lms/blob/1c9f0bb8013ed69c4f2efe11fd483025469b7e6c/app/graphql/types/assignment_type.rb#L559)
- [Existing course/model admission](canvas-metadata-admission.md)


Application boundary
--------------------

The query text SHA256 is
90bc30e7eb75ea82e83d960d0c5140d8a3f345d2b58cf600803c63df296a8b40.
The independent admission test pins this selection. The only variable is the
transport's bound course ID; generic request() admission rejects this operation.
The named reader uses the same exact pending-request gate, account response checks,
connection cancellation, request/byte limits and redacted audit as metadata/messages.
No new renderer operation, navigation, form action or broader permission is added.

The parser rejects partial GraphQL errors, mismatched IDs, missing fields, non-string
content and bodies above 512 Ki characters; the transport's 2-MiB raw response limit
also applies. It extracts text without executing HTML and applies existing
credential-line redaction and safe-link filtering. Those rules do not guarantee
recognition of every possible secret. References are collected without following
URLs; Canvas assessment-action links and credential-bearing targets are excluded.

Source coverage distinguishes syllabus text from assignment instructions and other
materials. Images, embeds and linked contents are not claimed as read. Null/empty
or unavailable text preserves previous syllabus evidence as stale with its original
observation time; any newly supplied links remain available for checking. Nonempty
text becomes fresh course evidence and can support study planning. Angle brackets
in plain text are preserved rather than reparsed as HTML.

A syllabus-source error allows assignment/message results to remain useful.
Authentication, account mismatch, interception, audit failure and cancellation
still stop the full update. No partial or foreign syllabus body reaches the guide.

Validation covers the pinned schema, fixed query admission, extraction/redaction,
empty and image-only content, stale reconciliation, planner evidence, exact local
Electron requests and production connection integration. Local network scenarios
also verify unavailable syllabus recovery and fatal login/identity failures.
All fixtures are synthetic; live UBC compatibility and full course-content coverage
remain unverified.
