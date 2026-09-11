Word layout verification
========================

`npm run test:word-layout` checks the app's actual Word export using installed
Microsoft Word on Windows. It is an optional release check, not a prerequisite
for running Canvas Weekly or its ordinary unit tests. Close Word first; the
check refuses to run while an existing Word process is present.

After `npm ci`, run the command from the repository root. It creates a synthetic
two-course guide under ignored `.codex-temp/word-layout-*`, opens it read-only in
hidden Word with macros disabled and without adding it to recent files, and
exports a PDF. It closes its document and Word instance without saving and checks
that the original DOCX bytes did not change. No Canvas or AI account is used.

The existing PDF.js and native canvas dependencies render every PDF page to PNG.
Automated assertions check matching Word/PDF page counts, nonempty pages, text
bounds, source and verification content, running header/footer text and actual
header pixels. Inspect every page PNG for clipping, overlap, orphan headings and
readability before calling visual QA complete; passing text checks alone is not
enough. `review.json` records Word version and per-page extracted text.

The check has bounded process timeouts. If Word itself hangs and its automation
process is terminated, an owned hidden Word instance can remain; identify that
specific test process before cleanup. Never terminate arbitrary Word sessions.


Verified result and limits
--------------------------

On 2026-09-11, Word 16.0 produced six pages. All pages were inspected: preparation
tasks, local Done/To do state, suggested dates, recorded deadlines, source links,
coverage gaps, syllabus text and sender/deadline verification remained readable
without clipping or overlapping text. Page breaks split some long source entries
across pages, but headings retain following content. No production layout change
was needed. The existing Word content and file-protection tests also pass.

An independent MuPDF render and pixel checks confirmed repeated running headers
when the conversation's image preview appeared to omit them. No additional Python
dependency is required by the committed check or the app. Temporary diagnostic
renders and the isolated diagnostic dependency remain under `.codex-temp`.

This verifies a representative synthetic document on this Word installation.
Other Office versions, fonts, full real-course documents and HTML browser-print
pagination still need their own checks. Word/PDF output here is a test artifact;
the app's user-facing outputs remain HTML, Markdown and DOCX.
