import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { readDocument } from './document-reader.js';
import { redactCredentials, referenceUrl } from './content.js';
import { buildGuide } from './guide.js';

const byteLimit = 2 * 1024 * 1024;
const textLimit = 200000;
const isLocal = value => path.isAbsolute(value) && !/^(?:\\\\|\/\/)/.test(value);

// Only a native file-picker result enters here. Do not keep the path or bytes.
export async function previewCourseDocument(file, course, signal) {
  signal?.throwIfAborted();
  if (typeof file !== 'string' || !isLocal(file)) throw new Error('Choose a file stored on this computer, not a network share.');
  const resolved = await fs.realpath(file);
  if (!isLocal(resolved)) throw new Error('Copy the document to this computer before adding it.');
  const type = path.extname(file).slice(1).toLowerCase();
  if (!['pdf', 'docx', 'txt', 'md'].includes(type)) throw new Error('Choose a PDF, Word (.docx), UTF-8 text or Markdown document.');
  const handle = await fs.open(resolved, 'r');
  let bytes;
  try {
    const stat = await handle.stat();
    if (!stat.isFile() || stat.size > byteLimit) throw new Error('Choose a regular file of 2 MB or less. Large files are not shortened automatically.');
    const buffer = Buffer.alloc(byteLimit + 1);
    let length = 0;
    while (length < buffer.length) {
      signal?.throwIfAborted();
      const result = await handle.read(buffer, length, buffer.length - length, null);
      if (!result.bytesRead) break;
      length += result.bytesRead;
    }
    if (length > byteLimit) throw new Error('The document exceeds the 2 MB limit.');
    bytes = buffer.subarray(0, length);
  } finally { await handle.close(); }
  let content;
  if (['pdf', 'docx'].includes(type)) content = await readDocument(bytes, type, signal);
  else {
    let text;
    try { text = new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
    catch { throw new Error('Save the text document as UTF-8 before adding it.'); }
    if (/[\x00-\x08\x0B\x0C\x0E-\x1F]/.test(text)) throw new Error('This file contains unsupported binary or control data. Choose a text document.');
    content = { text, message: 'Text imported as written; links and embedded content are not opened.' };
  }
  signal?.throwIfAborted();
  if (!content.text.trim() || content.text.length > textLimit) throw new Error('The file must contain readable text of up to 200,000 characters. Nothing was added.');
  return {
    id: `${course.id}:document:${randomUUID()}`, courseId: String(course.id), courseName: course.code || course.name,
    title: redactCredentials(path.basename(file)), kind: 'document', userProvided: true,
    body: redactCredentials(content.text).trim(), sourceUrl: null, observedAt: null,
    importedAt: new Date().toISOString(), stale: true, partial: true,
    documentHash: createHash('sha256').update(bytes).digest('hex'), documentType: type,
    coverageNote: `User-selected document; its current version, author and course applicability have not been verified. ${content.message} Extracted hyperlinks are not collected separately.`,
  };
}

export function changeCourseDocument(saved, courseId, { source, replaceId, removeId, title, url = '' }) {
  const course = saved.courses.find(course => course.id === courseId);
  if (!course) throw new Error('Choose a course in the saved collection.');
  const oldId = removeId || replaceId;
  if (oldId && !course.evidence?.some(item => item.id === oldId && item.kind === 'document' && item.userProvided)) throw new Error('Choose an imported document from this course.');
  if (!source && !removeId) throw new Error('Choose and review a document first.');
  const sources = (course.evidence || []).filter(item => item.id !== oldId);
  if (source) {
    if (source.courseId !== courseId || source.kind !== 'document' || !source.userProvided) throw new Error('The document belongs to another course.');
    if (typeof title !== 'string' || !title.trim() || title.length > 180) throw new Error('Give the document a title of up to 180 characters.');
    if (typeof url !== 'string' || url.length > 2000) throw new Error('Use an original HTTPS source link, or leave it blank.');
    const sourceUrl = url.trim() ? referenceUrl(url.trim()) : null;
    if (url.trim() && (!/^https:\/\//i.test(url.trim()) || !sourceUrl)) throw new Error('Use an original HTTPS source link without credentials, or leave it blank.');
    sources.push({ ...source, id: replaceId || source.id, title: redactCredentials(title.trim()), sourceUrl });
  }
  const courses = saved.courses.map(item => item.id === courseId ? { ...item, evidence: sources } : item);
  const documents = courses.flatMap(item => (item.evidence || []).filter(source => source.kind === 'document' && source.userProvided));
  if (documents.length > 20 || documents.reduce((total, source) => total + source.body.length, 0) > 2000000) throw new Error('This collection supports 20 imported documents and 2 million extracted characters. Remove or replace an earlier document first.');
  const next = { ...saved, courses, priorities: [] };
  delete next.aiGuide; delete next.planningCoverage; delete next.planningNote;
  // Local imports never pretend to refresh Canvas, its dates or submission state.
  return buildGuide(next, saved.generatedAt);
}
