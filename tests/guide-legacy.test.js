import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { buildGuide, reconcile, renderMarkdown } from '../src/guide.js';
import { restoreLegacyEvidence } from '../src/course-evidence.js';
import { GuideStore } from '../src/guide-store.js';
import { planningEvidence } from '../src/codex-client.js';

const options = { origin: 'https://canvas.example', now: '2026-09-10T18:00:00Z', timeZone: 'America/Vancouver' };
function oldGuide() {
  const guide = buildGuide(reconcile([{ id: '1', sources: { course: { name: 'Databases', course_code: 'CS 1' } }, coverage: [{ source: 'course', status: 'ok' }] }], null, options));
  delete guide.courses[0].evidence;
  guide.courses[0].syllabus = 'Review List<T> and the relation x < y.\nPassword: sample-secret';
  guide.courses[0].announcements = [{ id: '7', title: 'Lab preparation', body: 'Bring two questions.', sourceUrl: 'https://canvas.example/courses/1/discussion_topics/7?token=sample-token', postedAt: '2026-09-09T18:00:00Z' }];
  return guide;
}

test('older guide text is recovered without reparsing plain text or asserting fresh observation', () => {
  const original = oldGuide();
  const before = JSON.stringify(original);
  const guide = restoreLegacyEvidence(original);
  assert.equal(JSON.stringify(original), before, 'Recovery must not mutate caller data');
  assert.equal(guide.generatedAt, original.generatedAt);
  assert.deepEqual(guide.week, original.week);
  const [syllabus, announcement] = guide.courses[0].evidence;
  assert.equal(syllabus.id, '1:syllabus:1');
  assert.match(syllabus.body, /List<T>.*x < y/);
  assert.doesNotMatch(syllabus.body, /sample-secret/);
  assert.equal(syllabus.stale, true);
  assert.equal(syllabus.observedAt, null);
  assert.equal(syllabus.recoveredFromGuideAt, options.now.replace('Z', '.000Z'));
  assert.equal(announcement.id, '1:announcement:7');
  assert.equal(announcement.sourceUrl, 'https://canvas.example/courses/1/discussion_topics/7');
  assert.equal(announcement.postedAt, '2026-09-09T18:00:00.000Z');
  assert.deepEqual(restoreLegacyEvidence(guide), guide, 'Repeated recovery must not duplicate sources or coverage');
  const evidence = planningEvidence(guide);
  assert.match(JSON.stringify(evidence), /Bring two questions/);
  assert.equal(evidence.sources.find(source => source.id === syllabus.id).stale, true);
  assert.match(renderMarkdown(guide), /Original source observation time is unavailable/);
});

test('modern evidence stays authoritative and fresh syllabus reads replace recovered text', () => {
  const modern = oldGuide();
  modern.courses[0].evidence = [];
  assert.deepEqual(restoreLegacyEvidence(modern), modern);
  const recovered = restoreLegacyEvidence(oldGuide());
  const next = reconcile([{ id: '1', sources: { syllabus: { text: 'Current syllabus', links: [] } }, coverage: [{ source: 'syllabus', status: 'ok' }] }], recovered,
    { ...options, now: '2026-09-11T18:00:00Z' });
  const syllabus = next.courses[0].evidence.find(source => source.kind === 'syllabus');
  assert.equal(syllabus.body, 'Current syllabus');
  assert.equal(syllabus.stale, false);
  assert.equal(syllabus.recovered, undefined);
  assert.equal(syllabus.observedAt, '2026-09-11T18:00:00Z');
  const unknown = oldGuide(); delete unknown.observedAt;
  assert.equal(restoreLegacyEvidence(unknown).courses[0].evidence[0].recoveredFromGuideAt, null);
});

test('loading an older guide is read-only and explicit export preserves recovered evidence across reloads', async () => {
  const root = path.resolve('.codex-temp');
  await fs.mkdir(root, { recursive: true });
  const directory = await fs.mkdtemp(path.join(root, 'legacy-guide-'));
  try {
    const store = new GuideStore(path.join(directory, 'state'));
    const original = oldGuide();
    const statePath = path.join(store.directory, store.accountKey(options.origin, 'synthetic'), 'state.json');
    await fs.mkdir(path.dirname(statePath), { recursive: true });
    const before = JSON.stringify(original);
    await fs.writeFile(statePath, before);
    const loaded = await store.load(options.origin, 'synthetic');
    assert.equal(loaded.courses[0].evidence.length, 2);
    assert.equal(await fs.readFile(statePath, 'utf8'), before, 'Loading must not rewrite saved state');
    const exported = await store.export(original, path.join(directory, 'output'), 'synthetic');
    assert.match(await fs.readFile(exported.documentPath, 'utf8'), /Bring two questions/);
    assert.match(await fs.readFile(exported.documentPath, 'utf8'), /List&lt;T&gt;/);
    assert.match(await fs.readFile(exported.outputPath, 'utf8'), /Last known information/);
    assert.equal(exported.generatedAt, original.generatedAt);
    assert.deepEqual((await store.load(options.origin, 'synthetic')).courses, exported.courses);
  } finally { await fs.rm(directory, { recursive: true, force: true }); }
});
