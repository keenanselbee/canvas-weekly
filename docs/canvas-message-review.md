Canvas course-message replacement
=================================

Decision, 2026-09-11: admit the two fixed message queries after the existing
student preflights and assignment/status scan during manual guide refresh. This
restores course-tagged message text, not attachments, author identities, Canvas
pages or assessment instructions. The old conversation REST operations remain
removed. Local fixtures pass; UBC's deployed revision and live compatibility are
not verified. This decision does not prove historical account invariance.

Why auto_mark_as_read=false is insufficient
-----------------------------------------

Reviewed against Canvas revision 1c9f0bb8013ed69c4f2efe11fd483025469b7e6c in the
pinned local source archive. ConversationsController.show conditionally updates
workflow_state to read; the false parameter prevents that particular update.
It then serializes each message through conversation_message_json, including
attachments and recursively forwarded messages. attachment_json receives no
only=names or skip_permission_checks option from this call. It therefore calls
Attachment.locked_for?(user, check_policies: true) and locked_json. The attachment
lock helper can reach locked_by_module_item? for an eligible course attachment,
which is the module-lock path already excluded by the file/read-boundary review.
No old message was retrieved to see whether it has such an attachment. This is a
reachable serializer dependency, not evidence that any particular account changed.

Disabling client-side attachment handling would not prevent that server work.
The list serializer also expands participants/context/avatar information, so the
replacement does not use it as a supposedly minimal discovery request. Neither
old REST endpoint is required by the currently enabled metadata collector.

Sources:

- [Conversation detail and read flag](https://github.com/instructure/canvas-lms/blob/1c9f0bb8013ed69c4f2efe11fd483025469b7e6c/app/controllers/conversations_controller.rb#L661)
- [Message and recursive attachment serialization](https://github.com/instructure/canvas-lms/blob/1c9f0bb8013ed69c4f2efe11fd483025469b7e6c/lib/api/v1/conversation.rb#L79)
- [Attachment serializer](https://github.com/instructure/canvas-lms/blob/1c9f0bb8013ed69c4f2efe11fd483025469b7e6c/lib/api/v1/attachment.rb#L51)
- [Attachment lock dependency](https://github.com/instructure/canvas-lms/blob/1c9f0bb8013ed69c4f2efe11fd483025469b7e6c/app/models/attachment.rb#L1606)
- [Previously reviewed module-lock path](canvas-read-boundary.md)

Admitted selections
-------------------

canvas-message-candidate.js has no fetcher, credentials, session or transport.

1. CanvasWeeklyCourseConversations selects the verified user's course-filtered
   conversation-participant rows: participant/user IDs, stored workflow state,
   conversation ID/context/subject/update time. Inbox, archived and sent are
   explicit supported scopes. The collector enumerates them, dedupes
   overlaps and reports incomplete scopes; using only unread messages would miss
   previously read deadline changes. The course filter is fixed to course_ID.
2. CanvasWeeklyConversationText reads a previously discovered Conversation through
   legacyNode and selects message ID, conversation ID, body and creation time.
   It does not request attachments, recipients, reply permissions, submission
   assets, media or the full participant roster. Author details are not selected
   yet, so the application must not infer that a message came from an instructor.

The self conversation connection returns data only when its User object equals
current_user. Its course tag handler converts shard-relative IDs and composes a
SQL wildcard predicate. showHorizonConversations=true avoids the additional
Horizon enrollment-filter path; the fixed course tag still limits discovery.
The Conversation node loader requires an existing participant row for current_user.
ConversationType's message connection retains only messages with an active or null
workflow-state participant matching that user. None of those selected methods
calls the REST show action or its mark-read update.

Message body is not always a raw column: ConversationMessage.body formats generated
users-added events. The selected getter parses the stored event, reads user names
and passes them to EventFormatter.users_added. That formatter chooses an I18n
translation and formats names; it does not invoke send/broadcast or save paths.
Unknown event formats can fail the selected response and become unavailable data.

Reviewed the selected Conversation, ConversationParticipant, ConversationMessage
and ConversationMessageParticipant model declarations and their included concerns.
Direct callbacks attach to create/save/update/destroy, not find/initialize.
LinkedAttachmentHandler registers after_save attachment association updates;
SendToStream's registered lifecycle callbacks likewise require writes. SimpleTags
listing dispatch uses its registered course SQL filter, not its tag-writing methods.
Conversation's default relation extension overrides delete_all only; selecting the
relation does not call that method. ConversationHelper defines root-account
attribute helpers without a find hook. HtmlTextHelper, TextHelper and
ConversationsHelper provide formatting/helper methods; their inclusion does not
register a model read callback. ModelCache, Workflow and shared model/permission
concerns retain the previously documented bounded review in the metadata admission.

No selected call in this pinned stock source was found to mark messages read,
start/resume an attempt, submit work, send messages or evaluate module progress.
Controller operation hooks for CreateSubmission/CreateDiscussionEntry do not
match these fixed operation names. Authentication/access logs, caches and generic
GraphQL telemetry remain possible writes, as previously documented. Institutional
extensions and different deployed versions are outside this source-level finding.

Server cost is another limit: conversationMessagesConnection loads messages and
participant associations before filtering/pagination. first=100 limits the
returned page, not necessarily the server's loaded rows. Do not claim a bounded
server workload from the response-size limit alone.

Source references:

- [Self conversation listing](https://github.com/instructure/canvas-lms/blob/1c9f0bb8013ed69c4f2efe11fd483025469b7e6c/app/graphql/types/user_type.rb#L431)
- [Course tag handler](https://github.com/instructure/canvas-lms/blob/1c9f0bb8013ed69c4f2efe11fd483025469b7e6c/app/models/conversation_participant.rb#L178)
- [Conversation membership loader](https://github.com/instructure/canvas-lms/blob/1c9f0bb8013ed69c4f2efe11fd483025469b7e6c/app/graphql/graphql_node_loader.rb#L276)
- [Message visibility and pagination resolver](https://github.com/instructure/canvas-lms/blob/1c9f0bb8013ed69c4f2efe11fd483025469b7e6c/app/graphql/types/conversation_type.rb#L44)
- [Selected message fields](https://github.com/instructure/canvas-lms/blob/1c9f0bb8013ed69c4f2efe11fd483025469b7e6c/app/graphql/types/conversation_message_type.rb#L21)
- [Generated event formatter](https://github.com/instructure/canvas-lms/blob/1c9f0bb8013ed69c4f2efe11fd483025469b7e6c/app/models/conversation_message.rb#L413)
- [Attachment concern callbacks](https://github.com/instructure/canvas-lms/blob/1c9f0bb8013ed69c4f2efe11fd483025469b7e6c/lib/linked_attachment_handler.rb)
- [Generated body getter](https://github.com/instructure/canvas-lms/blob/1c9f0bb8013ed69c4f2efe11fd483025469b7e6c/app/models/conversation_message.rb#L254)

Parser contract
---------------

The parser rejects GraphQL partial errors, wrong user/course/conversation IDs,
duplicate page identities, changed thread subject/context/update time, invalid
dates, oversized bodies and contradictory pagination. It copies expected fields
only and applies the existing credential-line redaction. That redaction is not a
guarantee of detecting arbitrary secrets. Null legacy context is accepted only
as course-tagged discovery evidence and must remain unchanged on detail pages;
a caller-supplied observed object alone is not authorization to fetch a thread.

Transport and refresh contract
------------------------------

- The bound transport records thread IDs only from actual validated course-filtered
  discovery responses and keeps private copies. Renderer IDs, saved-guide IDs and
  mutations to returned objects cannot authorize text requests. Generic request()
  still rejects both operations; named methods construct their exact bodies.
- Both operations share account response checks, cookie cancellation, exact pending
  request admission, the 200-request/16-MiB course budget and 2-MiB page limit.
  Audit records contain operation names and body hashes, never message bodies,
  filters, cursors or credentials. No fallback broadens the request selection.
- Complete pagination covers inbox, archived and sent scopes, deduplicates identical
  overlaps, and rejects changing threads, duplicate identities and repeated cursors.
  A failed scan returns no partial successful message snapshot.
- Messages are an optional source after assignment metadata succeeds. Source errors
  produce explicit coverage gaps; reconciliation preserves old messages as stale
  with their original observation time. Cancellation, identity/authentication,
  interception and audit failures propagate as fatal collection errors, so the
  coordinator preserves the previous guide instead of exporting a mixed run.
- Sender details are unverified. The study plan asks to confirm the sender and
  compare announced exceptions with stored deadlines; it never changes a structured
  deadline from message text. AI evidence carries authorUnverified, and validation
  refuses required/optional step labels based on such a source. Suggested checks
  remain allowed. Message contents are data, never tool instructions.

The independent admission test pins the query text SHA256 values:

| Operation | SHA256 |
| --- | --- |
| CanvasWeeklyCourseConversations | f7050e91cd63d766ed19a8c69d18f17e1d2847e034fc3a490523e231d771b824 |
| CanvasWeeklyConversationText | 3b87e31acba83b8991264a2210df487fe524cf3d81769e9737c6fa153a2c91af |

Validation: unit coverage exercises parsing, discovery authority, pagination,
fatal/optional failures, stale-message reconciliation, unchanged deadlines and
unverified-sender planning. The real local Electron test invokes the production
CanvasConnection collector, verifies message results and exact request order, and
checks redacted audit data. Both fixed queries validate against the pinned schema.
These tests use synthetic data. No real message read or AI request was performed
for this milestone. Canvas instructions/materials and live compatibility remain
unfinished parts of the personal study-guide objective.
