import MarkdownIt from 'markdown-it';
import { createHash } from 'node:crypto';
import { renderMarkdown, formatDate } from './guide.js';

const styles = `
:root{color-scheme:light dark;--page:#f3f5f8;--paper:#fff;--ink:#202b3a;--muted:#526177;--line:#dce2ea;--accent:#075cad;--soft:#eaf3fd;--check:#835000}
*{box-sizing:border-box}html{scroll-padding-top:24px}body{margin:0;background:var(--page);color:var(--ink);font:16px/1.65 'Segoe UI',system-ui,sans-serif}
a{color:var(--accent);text-underline-offset:3px;overflow-wrap:anywhere}a:focus-visible{outline:3px solid var(--accent);outline-offset:4px}
.layout{display:grid;grid-template-columns:245px minmax(0,850px);gap:36px;max-width:1200px;margin:auto;padding:36px 24px}
nav{position:sticky;top:32px;align-self:start}nav .brand{font-size:20px;font-weight:700;margin:0 0 4px}nav p{color:var(--muted);font-size:14px;margin:0 0 24px}
nav ol{list-style:none;padding:0;margin:0}nav li{margin:0 0 5px}nav a{display:block;padding:7px 10px;border-radius:6px;text-decoration:none;font-size:14px}nav a:hover{background:var(--soft)}
.mobile-navigation{display:none}
main{min-width:0;background:var(--paper);padding:42px 48px;border:1px solid var(--line);border-radius:12px;box-shadow:0 3px 18px #00000008}
h1,h2,h3,h4{line-height:1.3;letter-spacing:-.02em;overflow-wrap:anywhere}h1{font-size:38px;margin:0 0 12px}h2{font-size:25px;margin:42px 0 16px;padding-top:25px;border-top:1px solid var(--line)}
h3{font-size:19px;margin:30px 0 12px}h4{font-size:17px;margin:24px 0 10px}p{margin:12px 0;overflow-wrap:anywhere}li{margin:8px 0;overflow-wrap:anywhere}ul,ol{padding-left:24px}
main>p:nth-of-type(-n+3){color:var(--muted)}main>p:first-of-type{font-size:20px;color:var(--accent)}
.task{list-style:none;margin:24px 0 12px;padding:16px 18px;background:var(--soft);border:1px solid var(--line);border-radius:8px;position:relative}
.task p{margin:0}.task input{margin:0 9px 0 0;width:17px;height:17px;vertical-align:-2px;accent-color:var(--accent);opacity:1}
.reading-note{font-size:14px;color:var(--muted);padding:14px 18px;border-left:3px solid var(--accent);background:var(--soft);margin-bottom:28px}
.print-options{margin-top:8px}.print-options summary{cursor:pointer}.print-options fieldset{border:0;margin:8px 0;padding:0}.print-options label{display:block;margin:6px 0;cursor:pointer}.print-options input{accent-color:var(--accent);margin-right:7px}.overview-only{display:none}
table{border-collapse:collapse;width:100%}th,td{padding:10px;text-align:left;border-bottom:1px solid var(--line)}blockquote{border-left:3px solid var(--line);margin:18px 0;padding-left:18px;color:var(--muted)}
pre{white-space:pre-wrap;overflow-wrap:anywhere}code{font-size:.9em}footer{margin-top:32px;padding-top:20px;border-top:1px solid var(--line);font-size:14px;color:var(--muted)}
@media(prefers-color-scheme:dark){:root{--page:#191c21;--paper:#22272f;--ink:#edf1f7;--muted:#b8c4d6;--line:#3c4655;--accent:#8ac2ff;--soft:#29394d;--check:#ffd18a}}
@media(max-width:800px){.layout{display:block;padding:16px}nav{display:none}.mobile-navigation{display:block;margin:0 0 16px;padding:12px 16px;background:var(--paper);border:1px solid var(--line);border-radius:8px}.mobile-navigation summary{cursor:pointer;font-weight:600}.mobile-navigation li{margin:6px 0}main{padding:26px 22px}h1{font-size:32px}}
@media print{:root{color-scheme:light;--paper:white;--ink:#111;--muted:#444;--line:#bbb;--accent:#174774;--soft:#f4f7fa}body{background:white;font-size:10pt}.layout{display:block;padding:0;max-width:none}nav,.reading-note,.mobile-navigation{display:none}main{padding:0;border:0;box-shadow:none}h1{font-size:26pt}h2{font-size:17pt;break-after:avoid}h3,h4{break-after:avoid}li.task{break-inside:avoid}a{color:inherit}footer{font-size:9pt}@page{margin:18mm}}
@media print{body:has(#print-overview:checked) .print-detail{display:none}body:has(#print-overview:checked) .overview-only{display:block}.overview-notice{border-left:3px solid var(--accent);padding-left:12px;margin-bottom:18px}.overview-only tr,.starting-point{break-inside:avoid}}
`;

export function renderHtml(guide) {
  const markdown = new MarkdownIt({ html: false, linkify: false, typographer: false });
  // Only deliberate HTTPS source navigation is allowed. Never load source images.
  markdown.validateLink = value => {
    try { const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password; }
    catch { return false; }
  };
  markdown.renderer.rules.image = (tokens, index) => markdown.utils.escapeHtml(tokens[index].content);
  markdown.renderer.rules.link_open = (tokens, index, options, env, renderer) => {
    tokens[index].attrSet('rel', 'noreferrer noopener');
    return renderer.renderToken(tokens, index, options);
  };
  const tokens = markdown.parse(renderMarkdown(guide), {});
  // The HTML reading note replaces the Markdown-specific editing directions.
  const directions = tokens.findIndex(token => token.type === 'inline' && token.content.startsWith('Generated sections are refreshed by Canvas Weekly.'));
  if (directions > 0) tokens.splice(directions - 1, 3);
  const sections = [];
  for (let index = 0; index < tokens.length; index++) {
    const token = tokens[index];
    if (token.type === 'heading_open' && token.tag === 'h2') {
      const id = `section-${sections.length + 1}`;
      token.attrSet('id', id);
      sections.push({ id, title: tokens[index + 1].content });
    }
    const inline = tokens[index + 2];
    if (token.type === 'list_item_open' && inline?.type === 'inline' && /^\[[ x]\] /.test(inline.content)) {
      token.attrSet('class', 'task');
      const checked = inline.content.startsWith('[x]');
      inline.children[0].content = inline.children[0].content.slice(4);
      const checkbox = new MarkdownIt.Token('html_inline', '', 0);
      checkbox.content = `<input type="checkbox" disabled${checked ? ' checked' : ''} aria-label="Preparation ${checked ? 'checked off' : 'not checked off'}">`;
      inline.children.unshift(checkbox);
    }
  }
  const escape = markdown.utils.escapeHtml;
  // Keep one copy of every heading/source in the document. Only the full
  // checklist and reference sections are hidden for a deliberately chosen
  // print overview; the main verification section and source counts stay included.
  const prefixEnd = tokens.findIndex((token, index) => token.type === 'heading_open'
    && ((token.tag === 'h3' && /^(Full preparation checklist|Suggested start:)/.test(tokens[index + 1].content))
      || (token.tag === 'h2' && tokens[index + 1].content !== 'Your study plan')));
  const checksStart = tokens.findIndex((token, index) => token.type === 'heading_open' && token.tag === 'h2' && tokens[index + 1].content === 'Double-check before relying on this plan');
  const nextSection = tokens.findIndex((token, index) => index > checksStart && token.type === 'heading_open' && token.tag === 'h2');
  const checksEnd = nextSection < 0 ? tokens.length : nextSection;
  const overviewAvailable = prefixEnd >= 0 && checksStart >= prefixEnd;
  const render = (from, to) => markdown.renderer.render(tokens.slice(from, to), markdown.options, {});
  const focusStarts = tokens.flatMap((token, index) => index < prefixEnd && token.type === 'heading_open' && token.tag === 'h4' ? [index] : []);
  const prefix = focusStarts.length ? render(0, focusStarts[0]) + focusStarts.map((start, index) => `<section class="starting-point">${render(start, focusStarts[index + 1] ?? prefixEnd)}</section>`).join('\n') : render(0, prefixEnd);
  // Preparation checkmarks must not remove outstanding submission deadlines
  // from the overview, even when all local preparation tasks are checked off.
  const deadlines = [...guide.inWeek, ...guide.upcoming].map(item => {
    const title = escape(item.title);
    const label = markdown.validateLink(item.sourceUrl) ? `<a href="${escape(item.sourceUrl)}" rel="noreferrer noopener">${title}</a>` : title;
    return `<tr><td>${label}<br>${escape(item.courseName)}</td>
<td>${escape(formatDate(item.dueAt, guide.timeZone))}${item.stale || item.dueDateStale ? '<br>Last-known date; recheck' : ''}</td>
<td>${item.closesAt ? `Available until ${escape(formatDate(item.closesAt, guide.timeZone))}` : 'Closing time not supplied'}${item.stale || item.availabilityStale ? '<br>Availability needs recheck' : ''}<br>${escape(item.status)}</td></tr>`;
  }).join('\n');
  const deadlineOverview = `<section class="overview-only"><h2>Recorded deadlines</h2>
<p>Outstanding dated work in this guide, including work whose preparation is checked off. Suggested starting days do not change these dates. Confirm undated work in the full guide.</p>
${deadlines ? `<table><thead><tr><th scope="col">Work</th><th scope="col">Due</th><th scope="col">Availability and submission</th></tr></thead><tbody>${deadlines}</tbody></table>` : '<p>No outstanding dated items were identified. Undated work, reading and unavailable sources may still require attention.</p>'}</section>`;
  const content = overviewAvailable ? `<aside class="overview-only overview-notice">Printed overview: starting points, recorded deadlines and main verification checks. Use the full guide for every preparation task, undated item, per-item check and source detail. Local checkmarks are not submission records.</aside>
${prefix}${deadlineOverview}
<div class="print-detail">${render(prefixEnd, checksStart)}</div>
${render(checksStart, checksEnd)}<div class="print-detail">${render(checksEnd)}</div>` : render(0);
  const navigation = sections.map(section => `<li><a href="#${section.id}">${escape(section.title)}</a></li>`).join('\n');
  const cssHash = createHash('sha256').update(styles).digest('base64');
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="referrer" content="no-referrer">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'sha256-${cssHash}'; base-uri 'none'; form-action 'none'">
<title>Study guide | ${escape(guide.week.start)} | Canvas Weekly</title><style>${styles}</style></head>
<body><div class="layout"><nav aria-label="Guide sections"><p class="brand">Canvas Weekly</p><p>Your week, in view</p><ol>
${navigation}
</ol></nav><details class="mobile-navigation"><summary>On this page</summary><ol>${navigation}</ol></details>
<main><aside class="reading-note">Saved guide. Check off tasks in Canvas Weekly. Use your browser's Print command to print or save as PDF.
${overviewAvailable ? `<details class="print-options"><summary>Print options</summary><fieldset><legend>Include when printing</legend>
<label><input type="radio" name="print-scope" id="print-full" checked>Full guide</label>
<label><input type="radio" name="print-scope" id="print-overview">Overview and checks</label></fieldset>
<p>The overview includes starting points, recorded times and verification checks. Choose an option, then use Print in your browser. Your on-screen guide stays complete.</p></details>` : ''}</aside>
${content}
<footer>Keep personal notes in <a href="Student%20Notes.md">Student Notes.md</a>. This is a local snapshot. Source links open only when you choose them. Preparation checkmarks do not submit or complete coursework in Canvas.</footer>
</main></div></body></html>\n`;
}
