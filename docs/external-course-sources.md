External course websites
========================

Public HTML/text and HTTP Basic website connections are implemented and tested
with synthetic fixtures. The actual DATA 311 site has not been collected by this
adapter yet. PDF/DOCX text extraction is now implemented for documents linked
inside connected website scopes. Browser-login adapters and Canvas-hosted file
downloads remain pending.
Canvas-style file routes are rejected even on a separate hostname: they may update
module progress. They cannot be enabled by adding a website connection. See the
[file access review](canvas-file-access.md).
Canvas often supplies only the submission deadlines while a separate course
website contains the syllabus, reading schedule, lecture slides and lab directions.
Treat both as sources for the same course, with independent access and coverage.


Student experience
------------------

In Courses, expand a course under Course websites. Choose a discovered reference
from the saved Canvas guide, or enter its website address, then Add website.
The app checks the seed page and shows its connection result and collection folder.
If it returns a supported Basic challenge, enter the course website username and
password in the app's masked login form. Check website retries a connection;
Remove website stops future reads and removes its saved encrypted credential.
Existing guides retain last-known evidence, marked stale on the next refresh.

Website setup works for saved courses without reconnecting Canvas. Update guide
collects the selected courses' configured websites after Canvas reads, then feeds
the combined evidence to the guide and optional planner. Only explicitly added
sites are crawled. No source-selection or login prompt is repeated per page.
Discovery uses the existing Canvas page/syllabus/announcement/assignment links;
module reads remain disabled for safety.

For DATA 311, the supplied screenshots show a course page under
https://irene.vrbik.ok.ubc.ca/data311/ and a browser username/password challenge.
Connect that origin and course path separately. Do not assume Canvas cookies grant
access. The implemented form supports HTTP Basic authentication. A dedicated
human login window for browser-authenticated websites remains planned.
Store credentials only in Windows-backed encrypted app storage; never in source
snapshots, exports, logs or AI evidence. The collector now redacts labeled login
details from collected course text. Refer the student to the original Canvas
page when credentials are needed; do not repeat them in the weekly guide.


Collection adapter
------------------

1. Bind the site to a selected Canvas course and an exact HTTPS origin plus path
   prefix. Seed collection with observed links, not guessed endpoints.
2. Fetch HTML with GET using a separate client. Parse content without executing
   JavaScript. Extract headings, paragraphs, ordered steps, tables and links.
   Quarto/Reveal lecture HTML can often provide text without playing slides.
3. Follow HTML, text, PDF, DOCX and folder links inside the configured scope, up to depth 2,
   30 queued document reads, 12 MB total response budget, and two minutes per site.
   Each document read allows at most four redirect-loop iterations.
   Individual requests allow up to 2 MB and 20 seconds including DNS lookup.
   Failed requests conservatively consume their full byte allowance. Record
   limits as partial coverage. Do not crawl other origins or path prefixes.
4. Scope HTTP credentials to the exact origin and path. Handle authentication
   challenges explicitly. Reject unexpected auth realms, private-network targets,
   unsafe redirects, assessment routes, form actions and external-tool launches.
   Never forward Canvas authorization or external-site credentials elsewhere.
5. Typed PDF/DOCX readers now extract text in a worker, without opening Office or
   a browser document viewer. MIME types and file signatures must match supported
   formats; compressed HTTP responses and other document types remain gaps.
   Dynamic/authenticated pages that cannot be read safely remain
   visible coverage gaps, with the original source link.
   Images and embedded media are listed as uncollected references, never loaded
   automatically or represented as having been understood from nearby text.
6. Keep each source's stable URL-based identity, retrieval time, course, title,
   extraction status and previous version. Compare content on each refresh;
   changed schedules appear in the diff. A failed refresh retains stale content.

The Node HTTPS transport has no Canvas cookie jar or token. Resolve only public
network addresses and pin each socket lookup to the checked result; TLS certificate
verification remains enabled. Every redirected URL is checked again. Authorization
starts empty and is sent only after a matching Basic realm challenge inside the
configured origin/path. Never submit HTML forms or execute website scripts.
Stop a site's crawl at the first failed login. Once saved credentials are rejected,
later refreshes do not retry them; a new explicit website login is required. This
avoids repeated failed attempts across queued lecture pages.

Account-bound site records live under private app storage/course-websites.
Credentials use Windows safeStorage and cannot be transmitted for a new login
unless encryption succeeds first. The renderer receives connection metadata only.
Request intent/outcome records are flushed under course-websites/request-audit;
they contain no headers, query strings, bodies or exception details. Failed audit
intent prevents the request. Ordinary website GETs can still create server access
logs; this is not a guarantee that arbitrary remote servers are side-effect-free.

Document extraction limits
--------------------------

PDF.js extracts text with page labels; document JavaScript is not executed,
font rendering and code evaluation are disabled, and no remote document resources are
requested. PDF figures, reading order, tables and scanned pages require checking
the original. No OCR is performed. Every extracted PDF reports partial coverage
with that limitation, including image-only pages explicitly labeled as lacking
extractable text. Password-protected or malformed PDFs remain failed reads.

DOCX extraction reads main document text, headers/footers and footnotes/endnotes,
plus hyperlink relationships. No macros, field instructions, embedded objects or
external entities execute. It reports partial coverage because layout, images,
comments and tracked changes still need review in Word. DTDs are rejected.
ZIP entries are read lazily, with entry-size validation, a 1,000-entry cap,
20 MB total declared expansion cap and 4 MB per selected XML part. No archive is
extracted to disk. Encrypted archives and duplicate selected parts are rejected.

Both formats retain the site's 2 MB response limit. Extraction allows 100 PDF
pages, 200,000 text characters, 1,000 links, and 15 seconds per worker. The worker
has an empty environment, drained private diagnostics and a bounded JavaScript
heap; cancellation terminates it. These heap limits are not an OS-level cap on
native allocations. Parser dependencies must stay patched. Oversized or failed
documents do not replace earlier evidence with empty text. File contents are
credential-redacted before being stored or provided to the planner.

Each collected PDF/DOCX source carries its partial flag and extraction note into
the saved evidence pack and connected AI input. AI task views display that note
beside tasks citing the source. Failed later reads retain both the last-known
text and its limitations. Older saved website sources recover matching partial
notes from their course coverage on local load/export; this does not refresh
the source timestamp. Recovery requires an exact site/source-URL match and does
not infer that unrelated pages have the same limitation.

Collected document links use the same origin/path, authentication, redirect and
read-budget rules as HTML links. No Canvas authorization is involved. Extraction
limitations remain in coverage and study-plan checks, alongside original links.


Reconciliation
--------------

Preserve instructor wording such as tentative schedule, supplementary reading,
optional retry and individual submission. Do not convert every lecture link into
mandatory homework. Distinguish explicit course instructions from AI suggestions.

Canvas deadlines, announcements, Inbox notices and external schedules may disagree.
Keep both claims with their dates and sources. Show conflicts for confirmation;
never silently choose a newly scraped date or overwrite the Canvas due field.
The AI can explain the discrepancy, but the collector remains responsible for
source identity and the exact original facts.


Acceptance checks
-----------------

- Public and password-protected fixtures produce linked, dated course evidence.
- Authentication is reused only inside its configured origin/path and never
  appears in exported files, model input, redirects or diagnostic output.
- A protected response remains a sign-in gap, never an empty successful page.
- Read limits, failures and unsupported file types are visible to the student.
- A changed schedule appears in the next same-week diff; notes remain untouched.
- Optional and tentative labels survive extraction and guide generation.
- No POST, form submission, quiz launch or module-completion request is made.

These checks pass in unit fixtures, the synthetic desktop flow (using actual
Windows encryption), and a local HTTPS transport fixture. The latter trusts only
its ephemeral certificate and maps an inspected public-host request to localhost
inside the test adapter; it does not weaken production TLS or DNS rules. It tests
GET/auth sequencing, rejected redirects/private DNS, oversized responses and
cancellation. No live Canvas or university website request was needed for these
checks. Full institutional-site compatibility remains unverified.
