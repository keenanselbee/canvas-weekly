// Complete-source collector used after the student and metadata preflights.
// Use one fresh course/account-bound transport and its shared run budgets.
export async function collectCourseMessages({ transport, courseId, studentId, signal } = {}) {
  signal?.throwIfAborted();
  const validId = value => typeof value === 'string' && /^[1-9]\d{0,31}$/.test(value);
  if (!validId(courseId) || !validId(studentId) || !transport
    || typeof transport.readCourseConversations !== 'function' || typeof transport.readConversationText !== 'function') {
    throw new Error('A bound course-message transport is required.');
  }
  const threads = new Map();
  for (const scope of ['inbox', 'archived', 'sent']) {
    const cursors = new Set();
    const participants = new Set();
    const scopeThreads = new Set();
    let after = null;
    for (let page = 0; ; page++) {
      signal?.throwIfAborted();
      if (page >= 100 || cursors.has(after)) throw new Error('Canvas message listing did not finish. Previous information must be preserved.');
      cursors.add(after);
      const result = await transport.readCourseConversations(scope, after, signal);
      signal?.throwIfAborted();
      for (const node of result.nodes) {
        if (node.courseId !== courseId || node.userId !== studentId || participants.has(node.participantId) || scopeThreads.has(node.id)) {
          throw new Error('Canvas message listing returned inconsistent identities.');
        }
        participants.add(node.participantId); scopeThreads.add(node.id);
        const previous = threads.get(node.id);
        if (previous && JSON.stringify(previous) !== JSON.stringify(node)) throw new Error('Canvas threads changed during collection. Try again later.');
        threads.set(node.id, node);
      }
      after = result.next;
      if (after === null) break;
    }
  }
  // At least one request per thread is required. Further pages remain subject
  // to the same transport budget; exhausting it rejects this entire source.
  if (!Number.isSafeInteger(transport.remainingRequests) || threads.size > transport.remainingRequests) {
    throw new Error('Canvas messages exceed the remaining request limit. Previous information must be preserved.');
  }
  const conversations = [];
  const messageIds = new Set();
  for (const thread of threads.values()) {
    const cursors = new Set();
    const messages = [];
    let after = null;
    for (let page = 0; ; page++) {
      signal?.throwIfAborted();
      if (page >= 100 || cursors.has(after)) throw new Error('Canvas message pagination did not finish. Previous information must be preserved.');
      cursors.add(after);
      const result = await transport.readConversationText(thread.id, after, signal);
      signal?.throwIfAborted();
      for (const message of result.messages) {
        if (message.conversationId !== thread.id || messageIds.has(message.id)) throw new Error('Canvas returned duplicate or mismatched messages.');
        messageIds.add(message.id);
        messages.push({ id: message.id, body: message.body, created_at: message.createdAt,
          author: message.author ? { id: message.author.id, name: message.author.name } : null });
      }
      after = result.next;
      if (after === null) break;
    }
    // Keep only each message's author, not a participant/recipient roster.
    // A supplied name does not establish an instructor or TA role.
    conversations.push({ id: thread.id, data: { subject: thread.subject, messages } });
  }
  return { conversation: conversations, coverage: { source: 'course messages', status: 'ok',
    message: 'Collected course-tagged inbox, archived and sent messages, with sender names when supplied. Sender roles and attachments were not collected; confirm authority before relying on instructions.' } };
}
