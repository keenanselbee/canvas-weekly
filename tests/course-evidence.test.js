import test from 'node:test';
import assert from 'node:assert/strict';
import { extractHtml, referenceUrl } from '../src/content.js';
import { reconcile, buildGuide, renderMarkdown } from '../src/guide.js';
import { planningEvidence } from '../src/codex-client.js';

const context = { origin: 'https://canvas.example', now: '2026-09-10T18:00:00Z', timeZone: 'America/Vancouver' };
const record = () => ({ id: '1', coverage: [], sources: {
  course: { id: 1, course_code: 'DATA 311' },
  assignments: [{ id: 10, name: 'Reading questions', due_at: '2026-09-15T18:00:00Z' }],
  pages: [{ page_id: 4, url: 'course-site', title: 'Course website', body: '<p>Read the syllabus &amp; notes.</p><p>User: sample-student<br>Password: sample-secret</p><a href="https://course.example/data311/?token=example-token">Course website</a>' }],
  modules: [{ id: 6, name: 'Week one', prerequisite_module_ids: [5], require_sequential_progress: true }],
  moduleItems: [{ id: '6', data: [{ title: 'Introduction', type: 'Page', completion_requirement: { type: 'must_view' } }] }],
  calendar: [{ id: 7, title: 'Lab', start_at: '2026-09-11T18:00:00Z', location_name: 'Room 100' }],
  conversation: [{ id: '8', data: { subject: 'Reading questions moved', participants: [{ id: 2, name: 'Instructor' }, { id: 3, name: 'Unrelated recipient' }], messages: [{ id: 9, author_id: 2, created_at: '2026-09-10T10:00:00Z', body: 'The reading questions have moved to Thursday. A second try is optional.' }] } }],
} });

test('HTML extraction preserves structure and redacts credential lines and unsafe links', () => {
  const result = extractHtml('<h2>Notes</h2><p>2 &lt; 3 &amp; caf&eacute;</p><script>alert(1)</script><p>Password: sample-secret</p>');
  assert.match(result.text, /2 < 3 & café/);
  assert.doesNotMatch(result.text, /alert|sample-secret/);
  assert.match(result.text, /redacted/);
  for (const url of ['javascript:alert(1)', 'https://a:b@course.example/', 'https://canvas.example/courses/1/modules/items/2', 'https://canvas.example/logout']) assert.equal(referenceUrl(url, context.origin), null);
});

test('course evidence carries full messages and source links without changing assignment deadlines', () => {
  const guide = buildGuide(reconcile([record()], null, context));
  const markdown = renderMarkdown(guide);
  assert.equal(guide.items[0].dueAt, '2026-09-15T18:00:00.000Z');
  assert.match(markdown, /second try is optional/);
  assert.match(markdown, /Room 100/);
  assert.match(guide.courses[0].evidence.find(source => source.kind === 'module').body, /View this item in Canvas/);
  assert.match(markdown, /https:\/\/course.example\/data311\//);
  assert.doesNotMatch(JSON.stringify(guide), /sample-secret|sample-student|example-token|Unrelated recipient/);
  assert.match(JSON.stringify(planningEvidence(guide)), /reading questions have moved/);
});

test('failed detail reads keep last known evidence and edited messages appear in changes', () => {
  const first = reconcile([record()], null, context);
  const missing = record(); delete missing.sources.conversation; delete missing.sources.moduleItems;
  const stale = reconcile([missing], first, context);
  assert.equal(stale.courses[0].evidence.find(item => item.kind === 'message').stale, true);
  assert.match(stale.courses[0].evidence.find(item => item.kind === 'module').body, /Introduction/);
  assert.equal(stale.courses[0].evidence.find(item => item.kind === 'module').stale, true);
  const edited = record(); edited.sources.conversation[0].data.messages[0].body = 'Now due Friday.';
  assert.equal(reconcile([edited], first, context).changes.find(change => change.itemId === '1:message:8:9').field, 'course-information');
});
