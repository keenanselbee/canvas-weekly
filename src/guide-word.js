import MarkdownIt from 'markdown-it';
import { Document, ExternalHyperlink, Footer, Header, LevelFormat, Packer, PageNumber, Paragraph, TextRun } from 'docx';
import { renderMarkdown, contentHash } from './guide.js';

// Bump when layout or conversion changes, so unchanged guides get the new format.
export const WORD_FORMAT_VERSION = 2;
export function wordInputHash(guide) {
  return contentHash(`${WORD_FORMAT_VERSION}|${renderMarkdown(guide)}`);
}

const markdown = new MarkdownIt({ html: false, linkify: false, typographer: false });
function safeLink(value) {
  try { const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password ? url.href : null; }
  catch { return null; }
}

function runs(tokens) {
  const result = [];
  let bold = false, italics = false, link = null, linked = [];
  for (const token of tokens || []) {
    if (token.type === 'strong_open') bold = true;
    else if (token.type === 'strong_close') bold = false;
    else if (token.type === 'em_open') italics = true;
    else if (token.type === 'em_close') italics = false;
    else if (token.type === 'link_open') { link = safeLink(token.attrGet('href')); linked = []; }
    else if (token.type === 'link_close') {
      if (link) result.push(new ExternalHyperlink({ link, children: linked }));
      else result.push(...linked);
      link = null; linked = [];
    } else if (['text', 'code_inline', 'softbreak', 'hardbreak', 'image'].includes(token.type)) {
      const text = ['softbreak', 'hardbreak'].includes(token.type) ? ' ' : token.content;
      const run = new TextRun({ text: text.toWellFormed().replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/g, ''), bold, italics, ...(link ? { style: 'Hyperlink' } : {}) });
      if (link) linked.push(run); else result.push(run);
    }
  }
  return result;
}

export async function renderWord(guide) {
  // Same content as the other exports; no network, embedded HTML, remote images,
  // macros, or field instructions derived from course content.
  const tokens = markdown.parse(renderMarkdown(guide), {});
  const children = [];
  let heading = null, listDepth = 0, listItem = false;
  for (const token of tokens) {
    if (token.type === 'heading_open') heading = Number(token.tag.slice(1));
    else if (token.type === 'heading_close') heading = null;
    else if (token.type === 'bullet_list_open') listDepth++;
    else if (token.type === 'bullet_list_close') listDepth--;
    else if (token.type === 'list_item_open') listItem = true;
    else if (token.type === 'list_item_close') listItem = false;
    else if (token.type === 'inline') {
      // Word displays preparation state as words, preserving accessible native lists.
      const first = token.children?.[0];
      if (first?.type === 'text') first.content = first.content.replace(/^\[ \] /, 'To do: ').replace(/^\[x\] /, 'Done: ');
      children.push(new Paragraph({
        style: heading ? (heading === 1 ? 'Title' : `Heading${Math.min(heading - 1, 3)}`) : listDepth ? 'StudyList' : 'Normal',
        ...(listDepth && listItem ? { numbering: { reference: 'study-bullets', level: Math.min(listDepth - 1, 2) } } : {}),
        children: runs(token.children),
      }));
      listItem = false;
    }
  }
  // compact_reference_guide preset, with a compact left-aligned masthead.
  // Named overrides: title 26pt/8pt after; subtitle and running furniture 9pt gray.
  const paragraph = (before, after) => ({ spacing: { before, after, line: 300, lineRule: 'auto' }, widowControl: true });
  const doc = new Document({
    creator: 'Canvas Weekly', title: guide.aiGuide ? 'Weekly Plan' : 'Course reference',
    description: guide.aiGuide ? 'Personal study plan with source evidence and checks' : 'Recorded course information, deadlines and coverage checks',
    styles: {
      default: {
        document: { run: { font: 'Calibri', size: 22, color: '202020' }, paragraph: paragraph(0, 120) },
        title: { run: { size: 52, bold: true, color: '0B2545' }, paragraph: { ...paragraph(0, 160), keepNext: true } },
        ...Object.fromEntries([[32, '2E74B5', 360, 200], [26, '2E74B5', 280, 140], [24, '1F4D78', 200, 100]].map(([size, color, before, after], i) => [
          `heading${i + 1}`, { run: { size, color, bold: true }, paragraph: { ...paragraph(before, after), keepNext: true, outlineLevel: i } },
        ])),
      },
      paragraphStyles: [
        { id: 'Normal', name: 'Normal', run: { font: 'Calibri', size: 22, color: '202020' }, paragraph: paragraph(0, 120) },
        { id: 'Subtitle', name: 'Subtitle', basedOn: 'Normal', run: { size: 18, color: '555555' }, paragraph: paragraph(0, 120) },
        { id: 'StudyList', name: 'Study list', basedOn: 'Normal', paragraph: paragraph(0, 80) },
        { id: 'Running', name: 'Running furniture', basedOn: 'Normal', run: { size: 18, color: '555555' }, paragraph: paragraph(0, 0) },
      ],
    },
    numbering: { config: [{ reference: 'study-bullets', levels: [0, 1, 2].map(level => ({
      level, format: LevelFormat.BULLET, text: '\u2022', alignment: 'left',
      style: { paragraph: { ...paragraph(0, 80), indent: { left: 540 * (level + 1), hanging: 271 }, tabStops: [{ type: 'num', position: 540 * (level + 1) }] } },
    })) }] },
    sections: [{
      properties: { page: { size: { width: 12240, height: 15840 }, margin: { top: 1440, bottom: 1440, left: 1440, right: 1440, header: 708, footer: 708 } } },
      headers: { default: new Header({ children: [new Paragraph({ style: 'Running', text: `Canvas Weekly | ${guide.week.start} to ${guide.week.end}` })] }) },
      footers: { default: new Footer({ children: [new Paragraph({ style: 'Running', alignment: 'right', children: [new TextRun({ children: ['Page ', PageNumber.CURRENT] })] })] }) },
      children,
    }],
  });
  return Packer.toBuffer(doc);
}
