import test from 'node:test';
import assert from 'node:assert/strict';
import { buildGuide, reconcile, renderMarkdown } from '../src/guide.js';
import { refreshWebsiteEvidence } from '../src/website-evidence.js';
import { buildEvidencePack, plannerEvidence, renderEvidencePack } from '../src/evidence-pack.js';

const oldTime = '2026-09-11T18:00:00Z';
const newTime = '2026-09-14T18:00:00Z';
const page = (id, body = 'Old reading') => ({ id, title: 'Reading', sourceUrl: `https://course.example/${id}.html`, body, observedAt: oldTime });
function sample() {
  const site = { siteId: 'site', courseId: '1', pages: [page('a'), page('b')], references: [{ sourceUrl: 'https://course.example/unread.pdf', foundOn: 'https://course.example/b.html', title: 'Unread', status: 'Not read' }] };
  const records = ['1', '2'].map(id => ({ id, sources: {
    course: { name: `Course ${id}`, course_code: `DEMO ${id}`, syllabus_body: '<p>Canvas syllabus</p>' },
    assignments: [{ id: 10, name: 'Assignment', due_at: '2026-09-18T18:00:00Z', description: 'Canvas instructions', submission: { workflow_state: 'submitted' } }],
    websites: id === '1' ? [site] : [],
  }, coverage: [{ source: 'metadata', status: 'ok' }, { source: 'website:site:old', status: 'partial', message: 'Old gap' }] }));
  const saved = buildGuide(reconcile(records, null, { origin: 'https://canvas.example', now: oldTime, timeZone: 'UTC' }));
  saved.courses[0].evidence.push({ id: '1:document:local', courseId: '1', kind: 'document', userProvided: true, body: 'Local copy', stale: true });
  saved.aiGuide = { overview: [], courses: [], questions: [] };
  return saved;
}

test('website-only refresh preserves Canvas and local evidence, with separate freshness and current week', () => {
  const saved = sample();
  const result = { siteId: 'site', courseId: '1', pages: [{ ...page('a', 'New reading with optional appendix'), observedAt: newTime, partial: true, coverageNote: 'Figures not extracted' }], references: [], coverage: [{ source: 'website:site:a', status: 'partial', message: 'Figures not extracted' }] };
  const next = refreshWebsiteEvidence(saved, [result], newTime);
  assert.deepEqual(next.items, saved.items);
  assert.equal(next.observedAt, oldTime); assert.equal(next.generatedAt, oldTime);
  assert.equal(next.websiteRefreshedAt, newTime); assert.equal(next.week.start, '2026-09-14');
  assert.equal(next.aiGuide, undefined); assert.deepEqual(next.priorities, []);
  assert.deepEqual(next.courses[0].evidence.filter(source => source.kind !== 'website'), saved.courses[0].evidence.filter(source => source.kind !== 'website'));
  assert.deepEqual(next.courses[1], saved.courses[1]);
  const source = next.courses[0].evidence.find(source => source.sourceUrl?.endsWith('/a.html'));
  assert.equal(source.stale, false); assert.equal(source.observedAt, newTime); assert.equal(source.partial, true);
  const missing = next.courses[0].evidence.find(source => source.sourceUrl?.endsWith('/b.html'));
  assert.equal(missing.stale, true); assert.equal(missing.observedAt, oldTime);
  assert.equal(next.courses[0].references.find(reference => reference.sourceUrl.endsWith('unread.pdf')).stale, true);
  assert.ok(!next.courses[0].coverage.some(entry => entry.source === 'website:site:old'));
  assert.ok(next.changes.some(change => change.itemId === source.id && change.field === 'course-information'));
  for (const pack of [buildEvidencePack(next), plannerEvidence(next)]) {
    assert.equal(pack.generatedAt, oldTime); assert.equal(pack.websiteRefreshedAt, newTime);
    assert.deepEqual(pack.items, buildEvidencePack(saved).items);
  }
  for (const text of [renderMarkdown(next), renderEvidencePack(next)]) assert.match(text, /Websites refreshed separately/);
});

test('no successful website reads reject without mutating the saved guide or erasing AI output', () => {
  const saved = sample(); const before = structuredClone(saved);
  assert.throws(() => refreshWebsiteEvidence(saved, [], newTime), /connected websites/);
  assert.throws(() => refreshWebsiteEvidence(saved, [{ siteId: 'site', courseId: '1', pages: [], references: [], coverage: [{ status: 'error' }] }], newTime), /previous guide is preserved/);
  assert.throws(() => refreshWebsiteEvidence(saved, [{ siteId: 'foreign', courseId: '9', pages: [page('a')], references: [], coverage: [] }], newTime), /saved courses/);
  assert.deepEqual(saved, before);
});
