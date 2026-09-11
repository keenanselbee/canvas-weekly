Canvas file access review
=========================

Reviewed 2026-09-10 against public upstream Canvas source. No authenticated Canvas
or file-storage requests were made. This does not identify UBC's deployed version
or establish what happened in earlier account activity.

Decision
--------

Keep course file metadata and original links in the guide. Do not automatically
follow the file object's download URL or open its preview. New scans with listed
files explicitly report unsupported file-content coverage and explain the reason.
The collector, login network guard and separate website reader must all enforce
this boundary, including when a file URL uses a different hostname.

The source inspection found that FilesController's download path reaches
send_stored_file, which calls context_module_action for the file-access user unless
a preview parameter is present. Inline previews and render_attachment have other
progress calls. Changing the HTTP method to GET does not make these paths inert.
See the upstream [files controller](https://github.com/instructure/canvas-lms/blob/master/app/controllers/files_controller.rb),
especially show, render_attachment and send_stored_file. The metadata listing is
separate; it logs asset access but does not use that download handler.

Do not attempt to undo progress or toggle unread state after collection. There is
no historical baseline proving whether anything changed, and compensating writes
would themselves change the account.

Alternative path to validate
----------------------------

The documented [public inline URL endpoint](https://developerdocs.instructure.com/services/canvas/resources/files)
is a candidate for retrieving an authorized storage URL without the standard
download handler. It is not enabled yet. A metadata file list alone does not
approve arbitrary URLs or prove that every storage backend has identical behavior.

Before implementation, finish the authorization/storage review and verify:

1. Select only file IDs returned for the chosen course; respect locked, hidden and
   unavailable metadata. Never enumerate IDs, follow replacement chains, fetch
   assessment attachments or create course exports.
2. Use one exact reviewed API operation, without view, preview, location, verifier,
   submission or other permission-changing parameters. Review its access checks
   and storage URL generation separately from file preview/session creation.
3. Accept only a supported direct storage destination. Reject Canvas file routes,
   private/reserved DNS, credentials in URL authority, unsafe protocols and
   unreviewed redirects. Pin checked DNS and verify TLS. A returned URL that falls
   back to Canvas must remain a gap, never an automatic alternative.
4. Keep short-lived storage URL credentials in memory. Never forward Canvas
   cookies/tokens, store signed URLs in guides, or expose them in errors or logs.
   Audit intent/outcome using file identity and non-secret destination metadata.
5. Apply existing document byte/page/text/time limits. Parse supported formats
   without a viewer, scripts, OCR, form submission or unscoped link following.
   Keep partial extraction notices and preserve stale evidence on failures.
6. Test the full authorization-to-binary-to-guide path with synthetic HTTPS
   fixtures, including denied destinations, expiry, cancellation and audit failure.
   Separately validate the actual institutional deployment before claiming live
   compatibility. Record access/activity logs as a known residual side effect.

A complementary local-file import can include materials already saved by the
student without contacting Canvas. It must label the copy and import time, retain
source/uncertainty information, preserve the original file, and avoid claiming that
the copy was checked against the current course. This remains planned, not delivered.

Current verification
--------------------

Unit tests distinguish file metadata from file content routes, retain source links
and warnings in the guide/AI evidence, omit signed URLs, and reject attempts to use
file-host routes as website or identity-provider navigation. The local HTTPS
Electron fixture checks that denied download/preview requests never reach its
server. These checks exercise this app, not Canvas's server-side implementation.
