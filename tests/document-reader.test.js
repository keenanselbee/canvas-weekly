import test from 'node:test';
import assert from 'node:assert/strict';
import JSZip from 'jszip';
import { readDocument } from '../src/document-reader.js';
import { SiteReader } from '../src/site-reader.js';
import { reconcile, buildGuide, renderMarkdown } from '../src/guide.js';

import { wordXml, word, pdf } from '../tools/document-fixtures.mjs';

test('PDF and Word text extraction preserve content and report visual limitations', async () => {
  const extracted = await readDocument(pdf(), 'pdf');
  assert.match(extracted.text, /\[Page 1\][\s\S]*Supplementary reading is optional/);
  assert.match(extracted.message, /no OCR/);
  const docx = await readDocument(await word('Read chapter 2. Supplementary work is optional.'), 'docx');
  assert.match(docx.text, /Supplementary work is optional/);
  assert.equal(docx.links[0], 'https://course.example/course/reading.html');
  assert.match(docx.message, /tracked changes/);
});

test('malformed, oversized, DTD, ZIP-expansion and excessive-page documents fail without partial success', async () => {
  await assert.rejects(readDocument(Buffer.from('not PDF'), 'pdf'), /could not be extracted/);
  await assert.rejects(readDocument(Buffer.alloc(2 * 1024 * 1024 + 1), 'docx'), /byte limit/);
  await assert.rejects(readDocument(pdf('Repeated page', 101), 'pdf'), /could not be extracted/);
  const dtd = new JSZip(); dtd.file('word/document.xml', '<?xml version="1.0"?><!DOCTYPE document [<!ENTITY secret SYSTEM "file:///private.txt">]>' + wordXml('&secret;').replace('<?xml version="1.0"?>', ''));
  await assert.rejects(readDocument(await dtd.generateAsync({ type: 'nodebuffer' }), 'docx'), /could not be extracted/);
  const expanded = new JSZip(); expanded.file('word/document.xml', wordXml('x')); expanded.file('word/media/large.bin', Buffer.alloc(21 * 1024 * 1024));
  await assert.rejects(readDocument(await expanded.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' }), 'docx'), /could not be extracted/);
  const abort = new AbortController();
  const pending = readDocument(pdf(), 'pdf', abort.signal); abort.abort();
  await assert.rejects(pending, /cancelled/);
  await assert.rejects(readDocument(pdf(), 'pdf', abort.signal), /abort/i);
});

test('website document links use the scoped reader and preserve partial coverage and credential redaction', async () => {
  const requested = [];
  const reader = new SiteReader({ transport: async url => {
    requested.push(url.href);
    if (url.pathname.endsWith('.pdf')) return { status: 200, headers: { 'content-type': 'application/pdf' }, body: pdf() };
    if (url.pathname.endsWith('.docx')) return { status: 200, headers: { 'content-type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }, body: await word('Password: fixture-secret') };
    return { status: 200, headers: { 'content-type': 'text/html' }, body: '<main><p>Course documents</p><a href="syllabus.pdf">Syllabus</a><a href="lab.docx">Lab</a><a href="https://outside.example/course/private.pdf">Other origin</a><a href="quiz/take.pdf">Assessment</a></main>' };
  } });
  const result = await reader.collect({ id: 'site1', url: 'https://course.example/course/' });
  assert.equal(result.pages.length, 4);
  assert.equal(result.coverage.filter(source => source.status === 'partial').length, 2);
  assert.ok(result.pages.some(page => page.body.includes('Supplementary reading is optional')));
  assert.ok(result.pages.every(page => !page.body.includes('fixture-secret')));
  assert.deepEqual(requested, ['https://course.example/course/', 'https://course.example/course/syllabus.pdf', 'https://course.example/course/lab.docx', 'https://course.example/course/reading.html']);
  assert.ok(result.references.some(source => source.sourceUrl === 'https://outside.example/course/private.pdf'));
  assert.ok(!result.references.some(source => source.sourceUrl.includes('/quiz/')));
  const record = { id: '1', coverage: result.coverage, sources: { course: { name: 'Course' }, websites: [{ siteId: 'site1', ...result }] } };
  const options = { origin: 'https://canvas.example', now: '2026-09-10T18:00:00Z', timeZone: 'UTC' };
  const snapshot = reconcile([record], null, options);
  const guide = buildGuide(snapshot);
  assert.match(renderMarkdown(guide), /no OCR or visual interpretation/);
  assert.ok(guide.courses[0].evidence.some(source => source.sourceUrl.endsWith('.pdf') && source.body.includes('[Page 1]')));
  record.sources.websites[0].pages = [];
  const missing = reconcile([record], snapshot, options);
  assert.ok(missing.courses[0].evidence.filter(source => source.kind === 'website').every(source => source.stale));
});
