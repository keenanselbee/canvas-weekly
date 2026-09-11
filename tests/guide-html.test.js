import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { parse } from 'parse5';
import { buildGuide, reconcile, contentHash } from '../src/guide.js';
import { renderHtml } from '../src/guide-html.js';
import { GuideStore } from '../src/guide-store.js';

const origin = 'https://canvas.example';
function fixture() {
  return buildGuide(reconcile([{ id: '1', coverage: [], sources: { course: { name: 'Databases', course_code: 'CS 1' }, assignments: [{
    id: 1, name: 'Prepare <script>globalThis.compromised=true</script>', due_at: '2026-09-11T18:00:00Z',
    description: '<p>Review the keys.</p>', submission: { workflow_state: 'unsubmitted' },
  }] } }], null, { origin, now: '2026-09-10T18:00:00Z', timeZone: 'UTC' }));
}

test('standalone guide escapes source text, restricts navigation and contains no active or remote content', () => {
  const guide = fixture();
  guide.studyPlan.tasks[0].title += ' ![image](https://remote.example/image.png)';
  guide.studyPlan.tasks[0].done = true;
  guide.items[0].sourceUrl = 'javascript:alert(1)';
  const html = renderHtml(guide);
  const nodes = [];
  const walk = node => { nodes.push(node); for (const child of node.childNodes || []) walk(child); };
  walk(parse(html));
  assert.equal(nodes.some(node => ['script', 'img', 'iframe', 'object', 'form', 'base', 'link'].includes(node.tagName)), false);
  const links = nodes.filter(node => node.tagName === 'a').map(node => node.attrs.find(attr => attr.name === 'href')?.value);
  assert.ok(links.every(href => href.startsWith('#section-') || href === 'Student%20Notes.md' || href.startsWith('https://')));
  assert.ok(html.includes('&lt;script&gt;'));
  assert.match(html, /default-src 'none'/);
  assert.match(html, /type="checkbox" disabled checked/);
});

test('HTML export migrates Markdown-only folders, preserves manual edits and rolls back a partial replacement', async t => {
  await fs.mkdir('.codex-temp', { recursive: true });
  const root = path.resolve('.codex-temp');
  const directory = await fs.mkdtemp(path.join(root, 'html-export-'));
  assert.equal(path.dirname(directory), root);
  try {
    const store = new GuideStore(path.join(directory, 'state'));
    const output = path.join(directory, 'output');
    const guide = fixture();
    const first = await store.export(guide, output, 'one');
    const oldMarkdown = await fs.readFile(first.outputPath, 'utf8');
    const oldHtml = await fs.readFile(first.documentPath, 'utf8');
    const markerPath = path.join(path.dirname(first.outputPath), '.canvas-weekly.json');
    // Previous releases owned only the Markdown document.
    await fs.rm(first.documentPath);
    await fs.rm(first.wordPath);
    await fs.writeFile(markerPath, JSON.stringify({ owner: store.accountKey(origin, 'one'), hash: contentHash(oldMarkdown) }));
    await store.export(guide, output, 'one');
    assert.equal(await fs.readFile(first.documentPath, 'utf8'), oldHtml);
    const revisions = await fs.readdir(path.join(path.dirname(first.outputPath), 'Revisions')).catch(() => []);
    await store.export(guide, output, 'one');
    assert.deepEqual(await fs.readdir(path.join(path.dirname(first.outputPath), 'Revisions')).catch(() => []), revisions);
    await fs.writeFile(first.documentPath, 'My HTML edits');
    await assert.rejects(store.export(guide, output, 'one'), /Weekly Plan.html has manual edits/);
    assert.equal(await fs.readFile(first.outputPath, 'utf8'), oldMarkdown);
    assert.equal(await fs.readFile(first.documentPath, 'utf8'), 'My HTML edits');
    await fs.writeFile(first.documentPath, oldHtml);
    const oldMarker = await fs.readFile(markerPath, 'utf8');
    const rename = fs.rename;
    const mock = t.mock.method(fs, 'rename', async (from, to) => {
      if (to === first.documentPath) throw new Error('Synthetic HTML file lock');
      return rename(from, to);
    });
    await assert.rejects(store.export({ ...guide, generatedAt: '2026-09-10T19:00:00Z' }, output, 'one'), /Synthetic HTML file lock/);
    mock.mock.restore();
    assert.equal(await fs.readFile(first.outputPath, 'utf8'), oldMarkdown);
    assert.equal(await fs.readFile(first.documentPath, 'utf8'), oldHtml);
    assert.equal(await fs.readFile(markerPath, 'utf8'), oldMarker);
    assert.equal((await store.load(origin, 'one')).generatedAt, guide.generatedAt);
  } finally { await fs.rm(directory, { recursive: true, force: true }); }
});
