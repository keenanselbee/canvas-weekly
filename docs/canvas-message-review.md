Canvas course-message replacement
=================================

Status, 2026-09-11: fixed query/parser candidate only. The enabled metadata
collector is unchanged. Neither new message operation is accepted by the live
transport or exported to the planner. The old conversation list/detail REST
operations have been removed from request construction and network admission.

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

Candidate selections
--------------------

canvas-message-candidate.js has no fetcher, credentials, session or transport.

1. CanvasWeeklyCourseConversations selects the verified user's course-filtered
   conversation-participant rows: participant/user IDs, stored workflow state,
   conversation ID/context/subject/update time. Inbox, archived and sent are
   explicit supported scopes. The future collector must enumerate them, dedupe
   overlaps and report incomplete scopes; using only unread messages would miss
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
users-added events by reading user names. Direct model declarations show create/
save/update/destroy callbacks; included concerns and the generated formatter must
be included in the final review, not dismissed because the requested field is
called body. In particular LinkedAttachmentHandler registers an after_save hook;
that is not the attachment serialization path used by the rejected REST response.

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
- [Generated body getter](https://github.com/instructure/canvas-lms/blob/1c9f0bb8013ed69c4f2efe11fd483025469b7e6c/app/models/conversation_message.rb#L254)

Parser contract and next implementation
--------------------------------------

The candidate rejects GraphQL partial errors, wrong user/course/conversation IDs,
duplicate page identities, changed thread subject/context/update time, invalid
dates, oversized bodies and contradictory pagination. It copies expected fields
only and applies the existing credential-line redaction. That redaction is not a
guarantee of detecting arbitrary secrets. Null legacy context is accepted only
as course-tagged discovery evidence and must remain unchanged on detail pages;
a caller-supplied observed object alone is not authorization to fetch a thread.

Before wiring this source:

- Finish included model hooks and generated-event formatter review.
- Register thread IDs only from actual validated course-filtered listing responses
  on the bound transport; reject caller-supplied or saved-guide IDs as authority.
- Keep shared identity, cookie, deadline, byte/request budgets and durable redacted
  audit. Enumerate each scope and each message page; dedupe records and detect
  changed/duplicate pages without returning partial data as complete.
- Treat missing/changed threads as unavailable. Preserve previous evidence as stale,
  label messages without author attribution, and add coverage instead of declaring
  that no instructor updates exist. Keep message text as source data, never tool
  instructions. Use it to suggest verification when it conflicts with deadlines.
- Add local Electron network and guide tests before any live admission decision.

Validation this milestone: both runtime queries pass GraphQL validation against
the pinned schema. All 125 unit tests pass, including immutable scope, unread-state
preservation in parsing, legacy-context consistency, redaction and candidate
rejection before transport authentication/audit/network. Tests use synthetic data.
No real Canvas/AI requests or personal-guide changes occurred. Live compatibility
and automatic message collection remain unverified and unfinished.
