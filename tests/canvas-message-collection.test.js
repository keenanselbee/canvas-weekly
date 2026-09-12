import test from 'node:test';
import assert from 'node:assert/strict';
import { collectCourseMessages } from '../src/canvas-message-collection.js';
import { courseEvidence } from '../src/course-evidence.js';

const thread = id => ({ id, courseId: '1', userId: '99', participantId: String(+id + 100), workflowState: 'unread', subject: `Thread ${id}` });
function fixture() {
  const calls = [];
  const transport = {
    remainingRequests: 190,
    async readCourseConversations(scope, after) {
      calls.push([scope, after]);
      return scope === 'archived' ? { nodes: [], next: null } : { nodes: [thread('10')], next: null };
    },
    async readConversationText(id, after) {
      calls.push([id, after]);
      return { messages: [{ id: after ? '31' : '30', conversationId: id, body: 'The reading questions moved to Thursday.', createdAt: '2026-09-10T18:00:00Z' }], next: after ? null : 'second' };
    },
  };
  return { calls, transport };
}
const collect = (transport, signal) => collectCourseMessages({ transport, courseId: '1', studentId: '99', signal });

test('message collection covers all scopes, deduplicates overlaps and finishes text pagination', async () => {
  const { calls, transport } = fixture();
  const result = await collect(transport);
  assert.deepEqual(calls, [['inbox', null], ['archived', null], ['sent', null], ['10', null], ['10', 'second']]);
  assert.equal(result.conversation.length, 1);
  assert.equal(result.conversation[0].data.messages.length, 2);
  assert.doesNotMatch(JSON.stringify(result), /workflowState|participantId|userId/);
  const evidence = courseEvidence({ id: '1', sources: { conversation: result.conversation } }, null, 'https://canvas.example', '2026-09-11T18:00:00Z');
  assert.equal(evidence.evidence.length, 2);
  assert.equal(evidence.evidence[0].author, 'Author not supplied');
  assert.match(result.coverage.message, /confirm authority/i);
});

test('changed threads, duplicate scope rows and repeated listing cursors reject the complete message source', async () => {
  for (const scenario of ['changed', 'duplicate', 'cursor']) {
    const { transport } = fixture();
    transport.readCourseConversations = async (scope, after) => {
      const node = thread(after ? '11' : '10');
      if (scenario === 'changed' && scope === 'sent') node.subject = 'Changed';
      return { nodes: scenario === 'duplicate' ? [node, node] : [node], next: scenario === 'cursor' ? 'repeat' : null };
    };
    await assert.rejects(collect(transport), /inconsistent identities|changed during collection|listing did not finish/);
  }
});

test('message budgets, failures and duplicate text never return partial successful content', async () => {
  const limited = fixture(); limited.transport.remainingRequests = 0;
  await assert.rejects(collect(limited.transport), /remaining request limit/);
  assert.equal(limited.calls.length, 3);
  for (const scenario of ['duplicate', 'foreign', 'failure']) {
    const { transport } = fixture();
    const read = transport.readConversationText;
    transport.readConversationText = async (id, after) => {
      if (scenario === 'failure' && after) throw new Error('Unavailable');
      const page = await read(id, after);
      if (scenario === 'duplicate') page.messages[0].id = '30';
      if (scenario === 'foreign') page.messages[0].conversationId = '999';
      return page;
    };
    await assert.rejects(collect(transport), /duplicate or mismatched|Unavailable/);
  }
});

test('late cancellation discards listing and message results before a subsequent request', async () => {
  for (const method of ['readCourseConversations', 'readConversationText']) {
    const controller = new AbortController();
    const { calls, transport } = fixture(); const original = transport[method];
    transport[method] = async (...args) => { const result = await original(...args); controller.abort(); return result; };
    await assert.rejects(collect(transport, controller.signal), { name: 'AbortError' });
    assert.equal(calls.length, method === 'readCourseConversations' ? 1 : 4);
  }
});
