import test from 'node:test';
import assert from 'node:assert/strict';
import { weeklyAcceptanceFixture, weeklyAcceptanceCriteria } from '../tools/weekly-acceptance-fixture.mjs';
import { plannerEvidence } from '../src/evidence-pack.js';

test('live acceptance evidence exercises distinct course gaps without silently omitting test conditions', () => {
  const guide = weeklyAcceptanceFixture();
  const evidence = plannerEvidence(guide);
  assert.equal(evidence.courses.length, 4);
  assert.equal(evidence.items.length, 5);
  assert.equal(evidence.items.filter(item => item.dueAt === '2026-09-18T18:00:00.000Z').length, 2);
  assert.equal(evidence.items.find(item => item.title === 'Orientation').status, 'submitted');
  assert.equal(evidence.items.find(item => item.title === 'Practice worksheet').dueAt, null);
  assert.equal(evidence.sources.find(source => source.kind === 'message').authorRoleUnverified, true);
  const document = evidence.sources.find(source => source.userProvided);
  assert.equal(document.sourceUrl, null); assert.equal(document.partial, true);
  assert.match(document.body, /optional unless your instructor assigns it separately/);
  assert.match(document.body, /Untrusted embedded note/);
  assert.match(evidence.studentPreferences.availability, /Avoid scheduling Tuesday or Thursday/);
  assert.equal(evidence.omissions.length, 0);
  assert.ok(Object.values(evidence.omittedRecords).every(count => count === 0));
  assert.equal(weeklyAcceptanceCriteria.length, 10);
  assert.equal(guide.generatedAt, '2026-09-14T16:00:00Z');
});
