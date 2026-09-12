import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { DEFAULT_PLANNING_PREFERENCES, validatePlanningPreferences, sharedPlanningPreferences } from '../src/planning-preferences.js';
import { GuideStore } from '../src/guide-store.js';
import { buildGuide, reconcile } from '../src/guide.js';
import { plannerEvidence, renderEvidencePack } from '../src/evidence-pack.js';

test('study preferences require explicit sharing and reject oversized or malformed fields', () => {
  const value = { ...DEFAULT_PLANNING_PREFERENCES, availability: '  Tuesday evenings  ', priorities: 'Review SQL.\nPassword: hidden-secret' };
  assert.equal(sharedPlanningPreferences(value), null);
  const shared = sharedPlanningPreferences({ ...value, includeWithAI: true });
  assert.equal(shared.availability, 'Tuesday evenings');
  assert.ok(!shared.priorities.includes('hidden-secret'));
  for (const patch of [{ includeWithAI: 'yes' }, { detail: 'unlimited' }, { availability: 'x'.repeat(1501) }, { priorities: {} }]) assert.throws(() => validatePlanningPreferences({ ...value, ...patch }));
  assert.equal(validatePlanningPreferences({ ...value, authToken: 'never-store' }).authToken, undefined);
});

test('preferences survive restart, remain account scoped and affect both AI routes only when included', async () => {
  await fs.mkdir('.codex-temp', { recursive: true });
  const directory = await fs.mkdtemp(path.resolve('.codex-temp/planning-preferences-'));
  const store = new GuideStore(path.join(directory, 'state'));
  const origin = 'https://canvas.example';
  const preferences = { includeWithAI: false, availability: 'Tuesday evenings', priorities: 'Practice SQL', detail: 'brief' };
  await store.savePlanningPreferences(origin, 'one', preferences);
  const reopened = new GuideStore(store.directory);
  assert.deepEqual(await reopened.loadPlanningPreferences(origin, 'one'), preferences);
  assert.deepEqual(await reopened.loadPlanningPreferences(origin, 'two'), DEFAULT_PLANNING_PREFERENCES);
  const guide = buildGuide(reconcile([{ id: '1', coverage: [], sources: { course: { name: 'Databases', course_code: 'CS 1' } } }], null,
    { origin, now: '2026-09-10T18:00:00Z', timeZone: 'America/Vancouver' }));
  let saved = await store.export(guide, path.join(directory, 'output'), 'one');
  assert.equal(plannerEvidence(saved).studentPreferences, null);
  assert.ok(!renderEvidencePack(saved).includes('Tuesday evenings'));
  await reopened.savePlanningPreferences(origin, 'one', { ...preferences, includeWithAI: true });
  saved = await reopened.export(saved, path.join(directory, 'output'), 'one');
  assert.equal(plannerEvidence(saved).studentPreferences.availability, 'Tuesday evenings');
  assert.match(await fs.readFile(saved.evidencePath, 'utf8'), /Tuesday evenings/);
  saved.aiGuide = { preferencesUsed: saved.planningPreferences, overview: [], courses: [], questions: [] };
  await reopened.export(saved, path.join(directory, 'output'), 'one');
  await reopened.savePlanningPreferences(origin, 'one', DEFAULT_PLANNING_PREFERENCES);
  const changed = await reopened.load(origin, 'one');
  assert.equal(changed.aiPreferencesChanged, true);
  assert.equal(changed.planningPreferences, null);
  assert.equal(plannerEvidence(changed).studentPreferences, null);
  assert.ok(!renderEvidencePack(changed).includes('Tuesday evenings'), 'Old AI preferences must not leak into a new evidence pack');
});
