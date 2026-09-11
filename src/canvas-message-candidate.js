import { parseMetadataDate } from './canvas-metadata.js';
import { redactCredentials } from './content.js';

// Fixed message selections and parsers. Transport authority comes only from
// validated discovery in the current course run; see canvas-message-review.md.
const listQuery = `query CanvasWeeklyCourseConversations($studentId: ID!, $filter: [String!], $scope: String!, $after: String) {
  user(id: $studentId) {
    _id
    conversationsConnection(first: 50, after: $after, filter: $filter, scope: $scope, showHorizonConversations: true) {
      pageInfo { hasNextPage endCursor }
      nodes { _id userId workflowState conversation { _id contextId contextType subject updatedAt } }
    }
  }
}`;
const messageQuery = `query CanvasWeeklyConversationText($conversationId: ID!, $after: String) {
  legacyNode(type: Conversation, _id: $conversationId) {
    ... on Conversation {
      _id contextId contextType subject updatedAt
      conversationMessagesConnection(first: 100, after: $after) {
        pageInfo { hasNextPage endCursor }
        nodes { _id conversationId body createdAt }
      }
    }
  }
}`;
const validId = value => typeof value === 'string' && /^[1-9]\d{0,31}$/.test(value);
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const validCursor = value => value === null || (typeof value === 'string' && value.length > 0 && value.length <= 1024 && !/[\u0000-\u001f\u007f]/.test(value));
const unavailable = 'Canvas course messages are unavailable or incomplete. Previous information must be preserved.';

export function courseConversationsRequest(courseId, studentId, scope = 'inbox', after = null) {
  if (!validId(courseId) || !validId(studentId) || !['inbox', 'archived', 'sent'].includes(scope) || !validCursor(after)) throw new Error('Invalid course message request.');
  return Object.freeze({ operationName: 'CanvasWeeklyCourseConversations', query: listQuery,
    variables: Object.freeze({ studentId, filter: Object.freeze([`course_${courseId}`]), scope, after }) });
}

export function conversationTextRequest(conversationId, after = null) {
  if (!validId(conversationId) || !validCursor(after)) throw new Error('Invalid conversation text request.');
  return Object.freeze({ operationName: 'CanvasWeeklyConversationText', query: messageQuery,
    variables: Object.freeze({ conversationId, after }) });
}

function connection(value, limit) {
  if (!object(value) || !Array.isArray(value.nodes) || value.nodes.length > limit
    || !object(value.pageInfo) || typeof value.pageInfo.hasNextPage !== 'boolean'
    || !validCursor(value.pageInfo.endCursor)
    || (value.pageInfo.hasNextPage && (!value.pageInfo.endCursor || !value.nodes.length))) throw new Error(unavailable);
  return { nodes: value.nodes, next: value.pageInfo.hasNextPage ? value.pageInfo.endCursor : null };
}

function data(value) {
  if (!object(value) || !object(value.data)
    || (value.errors !== undefined && (!Array.isArray(value.errors) || value.errors.length))) throw new Error(unavailable);
  return value.data;
}

function thread(value, courseId) {
  if (!object(value) || !validId(value._id) || !validId(courseId)
    || !(value.subject === null || (typeof value.subject === 'string' && value.subject.length <= 4096))
    || !((value.contextType === 'Course' && value.contextId === courseId) || (value.contextType === null && value.contextId === null))) throw new Error(unavailable);
  // Legacy course-tagged conversations may have no explicit context. They must
  // be bound to the course-filtered listing; null is not arbitrary course access.
  return { id: value._id, contextType: value.contextType, contextId: value.contextId,
    subject: value.subject === null ? null : redactCredentials(value.subject), updatedAt: parseMetadataDate(value.updatedAt) };
}

export function parseCourseConversations(value, courseId, studentId, scope = 'inbox') {
  courseConversationsRequest(courseId, studentId, scope);
  const user = data(value).user;
  if (!object(user) || user._id !== studentId) throw new Error(unavailable);
  const page = connection(user.conversationsConnection, 50);
  const ids = new Set();
  const conversations = new Set();
  const nodes = page.nodes.map(node => {
    if (!object(node) || !validId(node._id) || ids.has(node._id) || node.userId !== studentId
      || !['read', 'unread', 'archived'].includes(node.workflowState)
      || (scope === 'inbox' && node.workflowState === 'archived')
      || (scope === 'archived' && node.workflowState !== 'archived')) throw new Error(unavailable);
    const result = thread(node.conversation, courseId);
    if (conversations.has(result.id)) throw new Error(unavailable);
    ids.add(node._id); conversations.add(result.id);
    return { ...result, courseId, participantId: node._id, userId: studentId, workflowState: node.workflowState };
  });
  return { nodes, next: page.next };
}

export function parseConversationText(value, observed) {
  if (!object(observed) || !validId(observed.id) || !validId(observed.courseId)) throw new Error(unavailable);
  const node = data(value).legacyNode;
  const current = thread(node, observed.courseId);
  if (current.id !== observed.id || current.contextType !== observed.contextType || current.contextId !== observed.contextId
    || current.subject !== observed.subject || current.updatedAt !== observed.updatedAt) throw new Error(unavailable);
  const page = connection(node.conversationMessagesConnection, 100);
  const ids = new Set();
  const messages = page.nodes.map(message => {
    if (!object(message) || !validId(message._id) || ids.has(message._id) || message.conversationId !== observed.id
      || typeof message.body !== 'string' || message.body.length > 128 * 1024) throw new Error(unavailable);
    ids.add(message._id);
    return { id: message._id, conversationId: observed.id, body: redactCredentials(message.body), createdAt: parseMetadataDate(message.createdAt) };
  });
  return { messages, next: page.next };
}
