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

The installer is `dist/Canvas-Weekly-0.1.0-x64-Setup.exe`. The unpacked app is
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
after restart. Test screenshots and extracted payload checks remain ignored.

Remaining release checks
------------------------

- Installer/uninstaller walkthrough and execution on a clean Windows machine.
- Live tightened UBC login and real course website access in the packaged app.
- Full-course study-planning quality and Word page rendering.
- A dedicated application icon, signing identity and distribution destination
  before a polished public release. No installer or update has been published.

Unsigned builds have no verified publisher identity and may receive Windows
reputation prompts. No Windows security settings are changed by the build/test
workflow. ARM64 and other operating systems have not been packaged or verified.
