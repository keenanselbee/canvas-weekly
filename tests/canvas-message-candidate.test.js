import test from 'node:test';
import assert from 'node:assert/strict';
import { courseConversationsRequest, conversationTextRequest, parseCourseConversations, parseConversationText } from '../src/canvas-message-candidate.js';
import { permittedMetadataBody } from '../src/canvas-metadata.js';

const thread = () => ({ _id: '10', contextType: 'Course', contextId: '1', subject: 'Reading questions moved', updatedAt: '2026-09-10T18:00:00Z' });
const list = () => ({ data: { user: { _id: '99', conversationsConnection: {
  nodes: [{ _id: '20', userId: '99', workflowState: 'unread', conversation: thread() }],
  pageInfo: { hasNextPage: false, endCursor: null },
} } } });
const messages = () => ({ data: { legacyNode: { ...thread(), conversationMessagesConnection: {
  nodes: [{ _id: '30', conversationId: '10', body: 'The reading questions are now due Thursday. A second try is optional.', createdAt: '2026-09-10T17:00:00Z' }],
  pageInfo: { hasNextPage: false, endCursor: null },
} } } });

test('message candidate fixes course filters and scopes without obtaining transport admission', () => {
  for (const scope of ['inbox', 'archived', 'sent']) {
    const request = courseConversationsRequest('1', '99', scope);
    assert.deepEqual(request.variables, { studentId: '99', filter: ['course_1'], scope, after: null });
    assert.throws(() => { request.variables.filter.push('course_2'); }, TypeError);
    assert.equal(permittedMetadataBody(JSON.stringify(request), '1', '99'), false);
  }
  const request = conversationTextRequest('10', 'next');
  assert.deepEqual(request.variables, { conversationId: '10', after: 'next' });
  assert.equal(permittedMetadataBody(JSON.stringify(request), '1', '99'), false);
  assert.doesNotMatch(request.query, /attachments|recipients|canReply|submissions|mutation/);
  for (const invalid of ['', '../1', 1, '0', '1'.repeat(33)]) {
    assert.throws(() => courseConversationsRequest(invalid, '99'));
    assert.throws(() => conversationTextRequest(invalid));
  }
  assert.throws(() => courseConversationsRequest('1', '99', 'all'));
  assert.throws(() => conversationTextRequest('10', '\n'));
});

test('candidate retains unread state and course binding while copying only selected message fields', () => {
  const input = list(); const before = structuredClone(input);
  const observed = parseCourseConversations(input, '1', '99').nodes[0];
  assert.deepEqual(input, before);
  assert.equal(observed.workflowState, 'unread');
  const value = messages();
  value.data.legacyNode.conversationMessagesConnection.nodes[0].author = { _id: '77', name: 'Example Sender', email: 'private-email@example.edu' };
  value.data.legacyNode.conversationMessagesConnection.nodes[0].attachments = [{ url: 'private-file-url' }];
  const result = parseConversationText(value, observed);
  assert.equal(result.messages[0].createdAt, '2026-09-10T17:00:00.000Z');
  assert.match(result.messages[0].body, /second try is optional/);
  assert.deepEqual(result.messages[0].author, { id: '77', name: 'Example Sender' });
  for (const author of [undefined, null, { _id: '77', name: null }, { _id: '77', name: '  ' }]) {
    const missing = messages();
    missing.data.legacyNode.conversationMessagesConnection.nodes[0].author = author;
    const parsed = parseConversationText(missing, observed).messages[0];
    assert.equal(Boolean(parsed.author?.name), false);
  }
  assert.doesNotMatch(JSON.stringify(result), /private-email/);
  assert.doesNotMatch(JSON.stringify(result), /attachments|private-file-url/);
  value.data.legacyNode.conversationMessagesConnection.nodes[0].body = 'Password: synthetic-course-secret';
  assert.doesNotMatch(parseConversationText(value, observed).messages[0].body, /synthetic-course-secret/);
});

test('candidate rejects foreign users, contexts, duplicate identities and partial GraphQL data', () => {
  for (const mutate of [
    value => { value.errors = [{ message: 'private-error' }]; },
    value => { value.data.user._id = '100'; },
    value => { value.data.user.conversationsConnection.nodes[0].userId = '100'; },
    value => { value.data.user.conversationsConnection.nodes[0].conversation.contextId = '2'; },
    value => { value.data.user.conversationsConnection.nodes[0].workflowState = 'archived'; },
    value => { value.data.user.conversationsConnection.nodes.push(value.data.user.conversationsConnection.nodes[0]); },
    value => { value.data.user.conversationsConnection.nodes = []; value.data.user.conversationsConnection.pageInfo.hasNextPage = true; },
  ]) {
    const value = list(); mutate(value);
    assert.throws(() => parseCourseConversations(value, '1', '99'), error => !error.message.includes('private-error'));
  }
  const observed = parseCourseConversations(list(), '1', '99').nodes[0];
  for (const mutate of [
    value => { value.data.legacyNode = null; },
    value => { value.data.legacyNode.updatedAt = '2026-09-11T18:00:00Z'; },
    value => { value.data.legacyNode.subject = 'Changed subject'; },
    value => { value.data.legacyNode.conversationMessagesConnection.nodes[0].conversationId = '11'; },
    value => { value.data.legacyNode.conversationMessagesConnection.nodes[0].body = 'x'.repeat(128 * 1024 + 1); },
    value => { value.data.legacyNode.conversationMessagesConnection.nodes[0].author = { _id: '../77', name: 'Name' }; },
    value => { value.data.legacyNode.conversationMessagesConnection.nodes[0].author = { _id: '77', name: 'x'.repeat(1025) }; },
    value => { value.data.legacyNode.conversationMessagesConnection.nodes.push(value.data.legacyNode.conversationMessagesConnection.nodes[0]); },
  ]) {
    const value = messages(); mutate(value);
    assert.throws(() => parseConversationText(value, observed));
  }
});

test('legacy course-tagged threads preserve null context and require it to stay unchanged', () => {
  const value = list();
  Object.assign(value.data.user.conversationsConnection.nodes[0].conversation, { contextType: null, contextId: null });
  const observed = parseCourseConversations(value, '1', '99').nodes[0];
  const text = messages();
  assert.throws(() => parseConversationText(text, observed));
  Object.assign(text.data.legacyNode, { contextType: null, contextId: null });
  assert.equal(parseConversationText(text, observed).messages.length, 1);
});
