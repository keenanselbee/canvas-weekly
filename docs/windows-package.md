Windows package
===============

The first local Windows x64 installer is implemented. It bundles Electron and the
pinned official Codex runtime; the student does not need Node.js or a separate
Codex installation. ChatGPT and Canvas sign-in remain separate account steps.
This is an unsigned personal preview, not a signed public release.

Build and verify
----------------

From the repository, run `npm ci`, `npm run build:windows`, then
`npm run test:package`. Building requires Windows x64 and downloads builder tools
into ignored `.codex-temp/builder-cache`. It uses the pinned Electron distribution
already installed by npm. Publishing and automatic signing discovery are disabled.
`npm run build:windows -- --dir` produces the app directory without an installer;
the complete package test requires the installer as well.

`package.json` is the authoritative app version; both root version fields in
`package-lock.json` must match it. Windows builds accept MAJOR.MINOR.PATCH with
single-digit MINOR and PATCH. The build stops before packaging when an installer
for that version already exists in `dist`, `dist/preview` or `dist/inno-candidate`.
Reuse the existing artifact, or finalize the next version and its changelog before
building changed release contents. Do not remove older installers to bypass this
check. A successful build reserves the version even if it is not installed yet.
Scratch iteration can use `--dir` before that version has an installer.

After a preview build, `node tools/test-display.mjs` checks the packaged app with
fresh profiles at rendering scales 1/1.25/1.5/2 and normal/200% zoom in both themes.
It checks horizontal overflow on the four navigation pages and captures the client
area after painting. Pass scale numbers to narrow a visual recheck, for example
`node tools/test-display.mjs 1`. These are simulated app rendering scales, not
installer DPI or physical-monitor transition tests. No Windows preference is changed.

Use `npm run build:windows -- --preview` and `npm run test:package -- --preview`
to build and verify in `dist/preview` while the ordinary unpacked app is running.
The preview switch changes only the build directory; it does not create a separate
personal application profile. Package tests still use fresh isolated test profiles.

The SVG in `src/ui/assets/mark.svg` supplies the app logo. Regenerate its
Windows icon and NSIS artwork with `node tools/build-branding.mjs` after changing
the mark or artwork source. This uses the installed Electron renderer without
external resources, writes required assets to `build/branding`, and saves visual
previews under `.codex-temp/branding`. The native window PNG also lives beside the SVG;
the white shortcut ICO is packaged in `resources/icons`. Commit generated assets with
their source. The executable uses the white calendar by default.

An experimental Inno installer now builds separately with `node tools/build-inno.mjs`.
It supports system appearance, native install/maintenance and guarded NSIS
migration. It has not replaced the default build. Its actual fixture and full-payload
installation checks are described in [installer experience](installer-experience.md).

The default installer is `dist/Canvas-Weekly-<version>-x64-Setup.exe`. The unpacked app is
`dist/win-unpacked/Canvas Weekly.exe`; keep that entire directory together if
using it directly. Build outputs and test profiles are ignored by Git.

Installation behavior
---------------------

The installer is configured for the current Windows user, offers an installation
folder choice, and creates Desktop and Start Menu shortcuts. It requests no
elevation and does not start the app automatically after installation. The app
does not register a startup task or configure automatic updates. Uninstall is
configured to preserve application data; exported guides live in the chosen
output folder separately. Installation and uninstall behavior still need a real
Windows installer walkthrough; configuration alone does not prove that experience.

The packaged app uses its own Windows application-data directory. It does not
import this repository's development profile, accounts or credentials. On first
launch, connect Canvas and ChatGPT again as needed. Guides default to the Windows
Desktop/Canvas Weekly folder, including redirected Desktop locations, unless the
student chooses another folder.

Package boundaries
------------------

`electron-builder.json` includes only `src`, package metadata, and production
dependencies. Development settings, `.local`, `.codex-temp`, Git data, test
fixtures, generated guides and account files are excluded. Native Codex files
are unpacked outside `app.asar` so Windows can execute them. Bundling the CLI does
not enable its tools: the same restricted app-server arguments and rejected tool
requests used during development apply in the package.

Packaged smoke tests require an explicit absolute test-profile path and use a
new directory under `.codex-temp`. They never reuse the development profile or
sign in. Tests inspect archive paths, compare packaged application sources to the
worktree, reject private-state/development-package paths, and compare the app
archive, main executable and Codex executable inside the installer to the tested
unpacked files. They exercise first-run state, the Desktop default, bundled Codex
initialization without an account, light/dark rendering, and theme persistence
after restart. PDF and DOCX fixture reads also run through workers inside the
actual packaged app, verifying parser dependency resolution from the archive.
Test screenshots and extracted payload checks remain ignored.

Remaining release checks
------------------------

- Installer/uninstaller walkthrough and execution on a clean Windows machine.
- Live tightened UBC login and real course website access in the packaged app.
- Full-course study-planning quality and broader export layout. The two-page
  synthetic and five-page saved-guide HTML print overviews were visually checked;
  the full 59-page saved reference printout was not reviewed page by page.
  The six-page synthetic native Word layout check passes; see
  [Word layout verification](word-layout-check.md).
- A signing identity and distribution destination
  before a polished public release. No installer or update has been published.

Unsigned builds have no verified publisher identity and may receive Windows
reputation prompts. No Windows security settings are changed by the build/test
workflow. ARM64 and other operating systems have not been packaged or verified.


Current themed candidate (2026-09-13)
------------------------------------

Artifact: `dist/inno-candidate/Canvas-Weekly-0.1.1-x64-Setup.exe`

SHA256: `1fd57db8c91d94c304f33271042187ee51288398ea7f9a8d67d2bbd95c891f45`

Version 0.1.1 is reserved for this payload. It includes the current evidence-first
app, independent preparation checkmarks, Settings last in navigation, and the
local white-calendar branding/spacing edits present at build time. The branding
files remain separate worktree changes, not part of the versioning commit.

The candidate passed archive privacy/source matching, 190 unit tests, and the
full native fixture install/launch/uninstall check in `setup-lifecycle-SgFDCS`.
All 136 payload files matched. The installed app reported version 0.1.1, used a
fresh profile with disconnected accounts, detected bundled Codex and followed
native System appearance. Fixture guides and settings survived removal. The
three existing 0.1.0 installers retained their pre-build SHA-256 hashes.

The standard/preview builder also refused to reuse 0.1.1 before starting packaging.
No personal installation, login or Canvas collection ran. The fixture omits
shortcuts and scope elevation; human wizard, UAC and migration review remain
required before making Inno the default installer. The NSIS package smoke test
was not rerun for this Inno candidate.


Current design preview (2026-09-11)
---------------------------------

Artifact: dist/preview/Canvas-Weekly-0.1.0-x64-Setup.exe

SHA256: e5e44d2b1e7ff6a65f6865417219ab99ea954e6cec2df3f146e3ea1fd2bbcbc8

The latest rebuild retains the per-user fix and changes the app, standalone HTML
guide and installer tagline to "Your week, simplified." Package and guide checks
passed. This supersedes the per-user-fix artifact with hash 813ed0ba.... Installer
dark mode remains unimplemented; see [installer experience](installer-experience.md)
for the maintenance-screen and theme direction.

This replaces the initial design preview (78ec6ea...) with a per-user selection
fix. A previous all-users install caused the assisted template to preselect the
disabled all-users radio. Clicking Only me could leave both radios checked; Next
checks the all-users radio and requests elevation. The build/installer.nsh hook
defaults non-elevated setup to per-user mode before creating these controls when
elevation is disabled. Uninstall mode and explicitly requested all-users mode keep
the upstream behavior. A per-user install does not remove the existing all-users
copy; upgrading/removing that copy remains an administrator operation.

`node tools/test-installer-mode.mjs` compiles a native Windows radio fixture using
the cached NSIS compiler. It reproduces both radios checked in the baseline and
only the current-user radio checked with the production hook. The privilege and
registry-derived mode are simulated; no registry writes, installation or UAC
requests run. The Windows build and isolated package checks passed again. The
user's complete Next-to-install flow remains to be checked in the rebuilt wizard.

This preview adds the navy navigation rail, coordinated light/dark surfaces,
round settings cog, native-size SVG navigation and shared calendar/check branding.
The Windows executable icon was extracted and visually verified. NSIS artwork was
rendered and inspected; native wizard dark mode and a wizard walkthrough remain
unverified. The installer does not yet detect or apply Windows dark mode.

Status/navigation checks and the full isolated package checks passed, including
matching application sources and installer payload, document workers, private-state
exclusion, safe defaults, theme rendering and restart persistence. App screenshots
were reviewed in both themes. No installation, personal sign-in or live collection
was performed. The ordinary unpacked app was left running; the standard artifact
below and the older installed copy were not replaced.


Previous standard build (2026-09-11)
----------------------------------

The standard-path installer includes the Data & privacy page, contextual Forget
controls, per-course reading preferences, durable collection history, supplied
message sender names, partial rubric rating descriptions, consistent navigation
icons, durable session-failure explanations and recognition of UBC's observed
canvas_session cookie. Expanded reading remains unavailable and AI suggestions
default to off; saved pending reading preferences do not enable additional reads.

Artifact: dist/Canvas-Weekly-0.1.0-x64-Setup.exe

SHA256: 4a3877baad25559d62d1e17de7cb6129b96a89b0a3ee93d7cd05cfa087541cf9

test:package passed with a new isolated profile, including matching source and
installer payload, private-data exclusions, bundled Codex initialization without
an account, document workers, Desktop output default and theme persistence.
New checks cover the privacy page, empty collection history, contextual Forget
buttons, disabled expanded reading and AI-off defaults. The navigation icons
were visually checked in both themes using the UI fixture. The test does not install the app, authenticate to UBC
or send a planning request. Live login/refresh and installer walkthrough remain
unverified. This artifact supersedes the earlier hashes below.

Earlier local inspection found the a2b4c9c application running from
C:\Program Files\Canvas Weekly. Its app.asar, Canvas Weekly.exe and bundled
codex.exe hashes matched the earlier verified win-unpacked payload. This verifies installed
execution of that build; the installer wizard, elevation behavior, uninstall and
clean-machine experience were not observed. The installed profile had no collection
history at inspection. A subsequent user refresh reported CW_SESSION_MISSING and
zero collector requests; see [session diagnostics](session-refresh-diagnostics.md).
The current artifact above has not replaced that installed copy. The observed
UBC cookie-name mismatch is repaired and tested with synthetic sessions, but
authenticated live refresh still needs validation. No additional Canvas read or
assessment operation was admitted.


Earlier validated builds
------------------------

The local unsigned metadata-refresh build passed test:package with an isolated
profile. The test verifies the installer payload against win-unpacked and current
source, private-state exclusions, bundled Codex initialization, PDF/Word workers,
Desktop output default, appearance and restart persistence. The installer remains
uninstalled by this milestone; human installer flow and live account use are not
covered by the smoke test. The default Electron icon is still used.

Artifact: dist/Canvas-Weekly-0.1.0-x64-Setup.exe

SHA256: f54168ce809d939b4d17e56ad045b5056bda28108eec16809dc0b5effa54cba1

This build enables only the reviewed Canvas metadata refresh. It does not restore
withdrawn instruction/module/assessment/file-content reads. See the
[admission decision](canvas-metadata-admission.md) for the exact supported scope.

Message-boundary rebuild (2026-09-11): test:package passed after removal of the
unused conversation REST routes and addition of the non-admitted message query
candidate. Enabled metadata behavior is unchanged. The current installer SHA256
is 1afc716b910dfec92a4f8ce428883e2eefa753f2d3bdc6a3e5c0913acd6a95fd. This supersedes
the prior build hash above; installation and live account behavior were not tested.

Syllabus/message rebuild (2026-09-11): the current installer also includes reviewed
course-tagged message text and syllabus text. Package checks passed at that
milestone; SHA256 is
796c546b2dbe10d04ac9ad442e0f27c59f2b83e6b4550a69294720bec33fcfeb.
This supersedes the earlier hashes. The later Word layout verification changes
test tooling and documentation only, so it does not require an application rebuild.

Saved-guide recovery rebuild (2026-09-11): the latest installer restores syllabus
and announcement text from older saved guides as last-known evidence. Full package
checks passed, including matching application source and installer payload.
SHA256: 931263b3abd3e55bfb43fc62b370e32802e17e68c8f6f3d04f6320c8a54f343f.
This supersedes the earlier artifacts; it was not installed or used for live login.

Print-overview rebuild (2026-09-11): the current installer includes Full guide and
Overview and checks print choices in the exported HTML. Full package checks passed
with an isolated profile, matching installer payload and private-state exclusions.
SHA256: 4668fa6fada8160b58d93021dad29f6ff181dd7aa0b3e86bd740e00eec0f3144.
This supersedes the earlier artifacts. Desktop refresh/export and connection-panel
checks also passed with synthetic data. No installation or live account test ran.

Timezone-settings rebuild (2026-09-11): added Academic timezone under Weekly files.
Package inventory, matching installer payload, isolated first-run state and bundled
runtime checks pass. SHA256:
c5f340657248edcf063fbf05afbaef724003aeb44324f9b4f17ea5d8c8b75747.
This is the latest local artifact; installation and live sign-in remain untested.
See personal-release-review.md for the remaining requirement-level checks.

Connection-navigation rebuild (2026-09-11): sidebar statuses open the relevant
Settings controls, and the Connections hover/focus area has wider padding.
Status-navigation and isolated package checks pass. Latest installer SHA256:
58de590c8153a6d1a9a6e1497cb8c00c6a3470a5cebb57174b7b9787382d2aab.
This supersedes the timezone-settings build; it has not been installed or used
for live account validation.

Connection-diagnostics rebuild (2026-09-11): Codex options now shows detected,
ready or manual-selection-needed status. Canvas session rejection includes a
credential-free diagnostic reason while preserving the same safety checks.
Unit, status, desktop refresh and isolated package checks pass. Latest SHA256:
ad6b17839d266ba189c466a115d353832a0c06ebd9159c5e48a7413ac24bfaeb.
This supersedes the connection-navigation artifact. The installer has not been
installed; live UBC refresh is still blocked pending the specific session error.

Remembered-connections rebuild (2026-09-11): separate remember/forget controls,
Windows-encrypted Canvas restoration, Codex OS credential storage and memory-only
website logins are included. Isolated package checks pass with matching source
and installer payload and no private-state inclusion. Latest installer SHA256:
74df0419795b47efe600b67467aac6494af7adeb19ba96249b276ea262b86d7c.
This supersedes the diagnostics build. It has not been installed or used for live
UBC restoration. Existing ChatGPT file-based authorization needs a one-time sign-in
after its local cache is protected; see remembered-connections.md.
