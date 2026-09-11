import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { metadataRequest } from '../src/canvas-metadata.js';
import { enrollmentScopeRequest } from '../src/canvas-enrollment-scope.js';
import { ownSubmissionRequest } from '../src/canvas-own-submission.js';
import { courseConversationsRequest, conversationTextRequest } from '../src/canvas-message-candidate.js';

// Independent review pins, recorded in docs/canvas-metadata-admission.md. A query
// change requires another resolver review, not just updating the network builder.
test('enabled metadata queries match the reviewed admission selection', () => {
  const reviewed = {
    CanvasWeeklyCourseConversations: 'f7050e91cd63d766ed19a8c69d18f17e1d2847e034fc3a490523e231d771b824',
    CanvasWeeklyConversationText: '3b87e31acba83b8991264a2210df487fe524cf3d81769e9737c6fa153a2c91af',
    CanvasWeeklyAssignments: 'b9866e8b4d87d806ad447bf2b00b75d6793ef8a21aa8de3d7cafc9d7a58adc50',
    CanvasWeeklyEnrollmentScope: '42a8bb43889e3bea872e8d5ca3db2f4785cc507b27ebc01edddb947c423b81dc',
    CanvasWeeklyOwnSubmission: 'f9207c148426c8d514a3817e6bfb8b4e03f4e36551267dfc4f975db5286cd450',
  };
  for (const request of [metadataRequest('assignments', '1', '99'), enrollmentScopeRequest('1', '99'), ownSubmissionRequest('10', '99'), courseConversationsRequest('1', '99'), conversationTextRequest('10')]) {
    assert.equal(createHash('sha256').update(request.query).digest('hex'), reviewed[request.operationName], 'Review resolver changes before admitting a new selection');
  }
});
