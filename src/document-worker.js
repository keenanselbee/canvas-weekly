import { parentPort, workerData } from 'node:worker_threads';
import yauzl from 'yauzl';
import { SaxesParser } from 'saxes';

const textLimit = 200000;
const bytes = Buffer.from(workerData.bytes);
// No URL input, browser scripts, remote resources or document actions are used.
globalThis.fetch = async () => { throw new Error('Document network access is disabled.'); };

function parseXml(xml, handlers) {
  const parser = new SaxesParser({ xmlns: true });
  parser.on('doctype', () => { throw new Error('DTD is unsupported.'); });
  for (const [event, handler] of Object.entries(handlers)) parser.on(event, handler);
  parser.write(xml).close();
}

async function docxText() {
  if (bytes.subarray(0, 4).toString('hex') !== '504b0304') throw new Error('Not a ZIP document.');
  const parts = new Map();
  await new Promise((resolve, reject) => yauzl.fromBuffer(bytes, { lazyEntries: true, validateEntrySizes: true, strictFileNames: true }, (error, zip) => {
    if (error) { reject(error); return; }
    let count = 0, total = 0;
    const fail = error => { zip.close(); reject(error); };
    zip.on('error', fail); zip.on('end', resolve);
    zip.on('entry', entry => {
      if (++count > 1000 || (total += entry.uncompressedSize) > 20 * 1024 * 1024 || entry.isEncrypted()) { fail(new Error('ZIP limit or encryption.')); return; }
      const relevant = /^word\/(?:document|footnotes|endnotes|header\d+|footer\d+)\.xml$/.test(entry.fileName)
        || /^word\/_rels\/(?:document|footnotes|endnotes|header\d+|footer\d+)\.xml\.rels$/.test(entry.fileName);
      if (!relevant) { zip.readEntry(); return; }
      if (parts.has(entry.fileName) || entry.uncompressedSize > 4 * 1024 * 1024) { fail(new Error('Invalid or oversized part.')); return; }
      parts.set(entry.fileName, '');
      zip.openReadStream(entry, (error, stream) => {
        if (error) { fail(error); return; }
        const chunks = []; let length = 0;
        stream.on('error', fail);
        stream.on('data', chunk => {
          length += chunk.length;
          if (length > 4 * 1024 * 1024) { stream.destroy(); fail(new Error('Part size limit.')); return; }
          chunks.push(chunk);
        });
        stream.on('end', () => { parts.set(entry.fileName, Buffer.concat(chunks).toString('utf8')); zip.readEntry(); });
      });
    });
    zip.readEntry();
  }));
  if (!parts.has('word/document.xml')) throw new Error('No Word document part.');
  const text = [], links = [];
  let length = 0;
  const append = value => { length += value.length; if (length > textLimit) throw new Error('Text limit.'); text.push(value); };
  for (const [name, xml] of [...parts].sort(([a], [b]) => a === 'word/document.xml' ? -1 : b === 'word/document.xml' ? 1 : a.localeCompare(b))) {
    if (name.endsWith('.rels')) {
      parseXml(xml, { opentag: tag => {
        const attributes = Object.fromEntries(Object.values(tag.attributes).map(value => [value.local, value.value]));
        if (tag.local === 'Relationship' && attributes.TargetMode === 'External' && attributes.Type?.endsWith('/hyperlink') && links.length < 1000) links.push(attributes.Target);
      } });
      continue;
    }
    if (name !== 'word/document.xml') append(`\n[${name.split('/').at(-1).replace('.xml', '')}]\n`);
    let inText = false;
    const wordNamespace = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
    parseXml(xml, {
      opentag: tag => {
        if (tag.uri !== wordNamespace) return;
        if (tag.local === 't') inText = true;
        if (tag.local === 'tab') append('\t');
        if (tag.local === 'br') append('\n');
      },
      text: value => { if (inText) append(value); },
      closetag: tag => {
        if (tag.uri !== wordNamespace) return;
        if (tag.local === 't') inText = false;
        if (tag.local === 'p' || tag.local === 'tr') append('\n');
        if (tag.local === 'tc') append(' | ');
      },
    });
  }
  return { text: text.join('').trim(), links,
    message: 'Word text extracted. Verify layout, images, embedded objects, comments and tracked changes in the original document.' };
}

async function pdfText() {
  if (!bytes.subarray(0, 1024).includes(Buffer.from('%PDF-'))) throw new Error('Not a PDF.');
  const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const loading = getDocument({ data: new Uint8Array(bytes), isEvalSupported: false, disableFontFace: true,
    useSystemFonts: false, useWorkerFetch: false, stopAtErrors: true, disableAutoFetch: true, verbosity: 0 });
  try {
    const document = await loading.promise;
    if (document.numPages > 100) throw new Error('PDF page limit.');
    const pages = [], links = []; let length = 0;
    for (let number = 1; number <= document.numPages; number++) {
      const page = await document.getPage(number);
      const content = await page.getTextContent();
      const text = content.items.map(item => typeof item.str === 'string' ? item.str + (item.hasEOL ? '\n' : ' ') : '').join('').trim();
      length += text.length;
      if (length > textLimit) throw new Error('PDF text limit.');
      pages.push(`[Page ${number}]\n${text || '[No extractable text on this page]'}`);
      for (const annotation of await page.getAnnotations()) if (annotation.url && links.length < 1000) links.push(annotation.url);
      page.cleanup();
    }
    return { text: pages.join('\n\n'), links,
      message: 'PDF text extracted with page labels. Verify reading order, tables, figures and scanned pages in the original; no OCR or visual interpretation was performed.' };
  } finally { await loading.destroy(); }
}

try {
  const content = await (workerData.type === 'pdf' ? pdfText() : docxText());
  if (!content.text.trim()) throw new Error('No readable text.');
  parentPort.postMessage({ ok: true, content });
} catch { parentPort.postMessage({ ok: false }); }
