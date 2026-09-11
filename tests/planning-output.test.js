import test from 'node:test';
import assert from 'node:assert/strict';
import { validatePriorities } from '../src/planning-output.js';

const evidence = { week: { today: '2026-09-10', end: '2026-09-13' }, timeZone: 'UTC', items: [{ id: 'one', dueAt: '2026-09-12T18:00:00Z', instructions: 'Read chapter 1 before the lab. The practice sheet is optional.' }] };
const result = () => ({ priorities: [{ sourceId: 'one', action: 'Prepare for the lab', reason: 'Read before applying the concepts.', suggestedDate: '2026-09-11', checks: ['Confirm the room.'], steps: [
  { text: 'Read chapter 1.', kind: 'required', quote: 'Read chapter 1 before the lab.' },
  { text: 'Use the practice sheet if helpful.', kind: 'optional', quote: 'The practice sheet is optional.' },
  { text: 'Note two questions to ask.', kind: 'suggested', quote: '' },
] }] });

test('AI requirements need matching source quotes and dates stay within the useful planning window', () => {
  assert.equal(validatePriorities(result(), evidence)[0].steps.length, 3);
  for (const date of ['2026-09-09', '2026-09-13', '2026-09-99']) {
    const bad = result(); bad.priorities[0].suggestedDate = date;
    assert.throws(() => validatePriorities(bad, evidence), /day|deadline/);
  }
  const invented = result(); invented.priorities[0].steps[0].quote = 'Complete chapters 1 through 10.';
  assert.throws(() => validatePriorities(invented, evidence), /matching source quote/);
  const duplicate = result(); duplicate.priorities.push(duplicate.priorities[0]);
  assert.throws(() => validatePriorities(duplicate, evidence), /references/);
});

test('invalid calendar dates are rejected even when lexically between week boundaries', () => {
  const bad = result(); bad.priorities[0].suggestedDate = '2026-09-99';
  assert.throws(() => validatePriorities(bad, { ...evidence, week: { today: '2026-09-30', end: '2026-10-04' } }), /day outside/);
});
