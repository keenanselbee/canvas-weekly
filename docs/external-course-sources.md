External course websites
========================

Design target; authenticated external collection is not implemented yet.
Canvas often supplies only the submission deadlines while a separate course
website contains the syllabus, reading schedule, lecture slides and lab directions.
Treat both as sources for the same course, with independent access and coverage.


Student experience
------------------

Discover links in Canvas pages, syllabus text, announcements and module items.
Show relevant candidates under the course: title, address, where it was linked,
and status (ready, needs sign-in, unavailable or unsupported). Let the student
choose a course site once, and retain that association for later refreshes.
Avoid asking the student to authorize every individual document in that site.

For DATA 311, the supplied screenshots show a course page under
https://irene.vrbik.ok.ubc.ca/data311/ and a browser username/password challenge.
Connect that origin and course path separately. Do not assume Canvas cookies grant
access. Offer a native credential prompt for HTTP Basic authentication, or a
dedicated human login window when the actual site uses browser authentication.
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
3. Follow relevant syllabus, schedule, lecture, lab and reading links inside the
   configured scope. Bound page count, bytes, depth and time; record limits as
   partial coverage. Do not traverse the whole university site or Internet.
4. Scope HTTP credentials to the exact origin and path. Handle authentication
   challenges explicitly. Reject unexpected auth realms, private-network targets,
   unsafe redirects, assessment routes, form actions and external-tool launches.
   Never forward Canvas authorization or external-site credentials elsewhere.
5. Add typed PDF and DOCX readers for linked documents; retain unsupported media
   as references. Dynamic/authenticated pages that cannot be read safely remain
   visible coverage gaps, with the original source link.
6. Keep each source's content hash, URL, retrieval time, course, title, extraction
   status and previous version. A failed refresh retains last known content.


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
