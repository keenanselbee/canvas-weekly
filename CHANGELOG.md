Canvas Weekly changelog
=======================

0.1.1 - September 13, 2026
-------------------------

- Prepare this version for the evidence-first app: separate course collection,
  complete normalized evidence export for online AI, and explicit connected
  weekly-guide generation with source citations and uncertainty checks.
- Support local document imports, independent course website refreshes, optional
  study preferences, and independent checkmarks for actions sharing a source.
- Refine Windows light/dark navigation, connection status and local login cleanup.
- Add installer version checks and preserve existing same-version installers.
  Full-payload installation tests now check the actual application version.
- Keep the themed Inno installer experimental pending the documented human
  wizard and migration checks. Collection permissions are unchanged; expanded
  Canvas reads remain unavailable. No automatic credential migration is added.


0.1.0 - September 10-12, 2026
----------------------------

Initial local development and unsigned preview builds used this version across
multiple milestones. Their distinct build hashes and validation limits remain in
[Windows package history](docs/windows-package.md) and the
[implementation work log](docs/implementation-plan.md). Those historical builds
are not renamed or overwritten. Existing saved guides and connections are kept;
legacy ChatGPT authorization may require one new sign-in as described in
[remembered connections](docs/remembered-connections.md).
