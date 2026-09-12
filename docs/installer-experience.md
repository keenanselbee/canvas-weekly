Installer experience
====================

Requested direction: match the app's Windows light/dark appearance and show useful
maintenance choices when Canvas Weekly is already installed. The current NSIS
package has custom artwork and a repaired per-user selection, but no dark wizard
controls or dedicated maintenance page. A separate Inno Setup appearance preview
implements startup theme detection and read-only discovery of existing NSIS
installations. A functional installer candidate now supports fresh installation
and maintenance of its own installations, with guarded NSIS migration;
neither candidate has replaced production packaging.


First installation and maintenance
----------------------------------

First install offers Only me by default, a folder choice, and explicit shortcut
choices. Only an all-users install or protected location should need elevation.
Show the scope and destination before making changes. Keep the app unelevated.

When an installation exists, show Manage Canvas Weekly with its version, location
and scope. Offer Update when the package is newer, Reinstall for the same version,
and Uninstall. Do not label reinstall as Repair until file replacement, shortcuts,
registration and preservation behavior have been tested as a repair operation.
Block accidental downgrades. With two installations, require choosing the copy.

Each action explains whether administrator permission is needed before launching
an elevated operation. An all-users copy must not silently become a per-user copy,
or vice versa. Any optional side-by-side installation needs an explicit description.
Uninstall retains guides and local account/settings data by default, with no bundled
delete-data action. The app already provides scoped Forget controls.


Theme implementation direction
------------------------------

Prefer a supported installer theme implementation with consistent native controls,
keyboard focus and high-contrast fallback. Inno Setup documents
`WizardStyle=modern dynamic`, which reads Windows appearance at startup, supports
dark wizard controls, and avoids custom styles in high contrast. The appearance
preview uses this setting; it has not replaced the NSIS production build.
Its dynamic mode is startup detection, not live switching while Setup remains open.

Retain electron-builder for packaging Electron and Codex. Before changing the
installer engine, implement migration discovery for the existing NSIS registry
identity, validate the uninstaller path, and test upgrade/uninstall behavior in
both scopes. Avoid executing an untrusted registry command string as a shell
command. A different installer engine alone does not establish safe migration or
repair behavior. Keep the current validated package available until those checks
pass. No personal installation or Windows appearance setting is changed by design
or prototype work.

Primary references: [Inno Setup theme behavior](https://jrsoftware.org/ishelp/topic_setup_wizardstyle.htm)
and [installation-scope options](https://jrsoftware.org/ishelp/topic_setup_privilegesrequiredoverridesallowed.htm).


Appearance preview
------------------

Build with `node tools/build-installer-preview.mjs`, then open
`dist/installer-prototype/Canvas-Weekly-Setup-Preview.exe`. This is a small UI-only
executable, separate from both standard and preview NSIS app installers. It uses
the shared calendar icon, navy artwork and "Your week, simplified." tagline.
Its transparent 256px header mark works on light and dark surfaces.

The preview reads the known Canvas Weekly NSIS registration keys in HKCU/HKLM's
64-bit view. It displays registered scope/version and location, without checking
application integrity or executing any registry command. With two copies, neither
is selected automatically. It contains no payload, uninstall program, shortcuts,
registry-write section or external process launch. Both page navigation and a
pre-install guard prevent installation, including silent mode. Close preview exits
without installing. It does not read guides, saved logins or Canvas content.

`node tools/test-installer-preview.mjs` compiles and runs isolated silent fixtures
for dynamic, forced light, forced dark and `/NOSTYLE`. On this dark Windows session,
the native wizard reports dynamic dark correctly and discovers two registrations.
Forced light/dark and style suppression pass. Each run aborts before installation,
creates no destination folder and leaves the preview's uninstall registration
unchanged. These checks inspect native runtime state; they do not certify visual
layout, keyboard navigation, high contrast, a light Windows session or a complete
upgrade/uninstall. Human wizard review is still pending.

Build prerequisite: official **Inno Setup 7.1.0 x64** compiler, extracted in portable
mode to `.codex-temp/inno/compiler` (the compiler architecture does not determine
the generated wizard's architecture). Obtain `innosetup-7.1.0-x64.exe` from the
[official release](https://github.com/jrsoftware/issrc/releases/tag/is-7_1_0).
The verified download SHA-256 is
`0362a383ed217d4c4239b5933866dd96d3eb2102737da92f80f6057a4b40df2f`;
its Authenticode signature was valid for **Pyrsys B.V.**. Verify both before running.
Inno's own installer supports `/PORTABLE=1 /CURRENTUSER /VERYSILENT /SP- /NORESTART`
with `/DIR="<absolute repository path>\.codex-temp\inno\compiler"`; portable mode
disables registration, shortcuts and file associations. See the
[official portable-mode notes](https://jrsoftware.org/ishelp/topic_technotes.htm).
Compiler downloads, fixtures and logs stay untracked. The standard build does not
download or depend on Inno Setup.


Functional installer candidate
------------------------------

`node tools/build-inno.mjs` freshly packages Electron/Codex into
`dist/inno-candidate/win-unpacked`, checks the application archive boundaries and
source bytes, then compiles `dist/inno-candidate/Canvas-Weekly-0.1.0-x64-Setup.exe`.
This is an unsigned candidate, separate from the NSIS outputs and the UI-only
preview. Do not use it to migrate personal NSIS installations yet.

The candidate uses dynamic Windows appearance and defaults to the current user.
Its native scope dialog offers all-users installation with elevation. It does not
launch the app after installation, close running applications automatically, or
register startup/update tasks. Start Menu access is installed; a Desktop shortcut
is optional. Exported guides and account settings are outside its payload.

For an existing Inno installation in the selected scope, it shows version/location
and offers Update or Reinstall and Uninstall. It keeps the recorded folder even
when a command-line directory override is supplied. Downgrades are blocked, and
uninstall is never inferred in silent setup. The interactive uninstall action
accepts only a quoted generated `uninsNNN.exe` path inside that copy's `.setup`
directory and invokes it directly, without a shell or appended registry arguments.
It still requires a visual walkthrough of the action and cancellation behavior.
If only the other scope has an installation, a separate-copy choice is required.

NSIS migration validates the selected scope's known registration, version, folder
and exact uninstaller command. It never runs the old recursive uninstaller. Setup
sets that executable aside and backs up existing files that the new payload will
replace. A cancelled or failed migration restores those backups; native rollback
alone does not restore overwritten files. Linked destinations, unexpected command
arguments, downgrades and interrupted backup metadata stop migration for review.
After successful installation, setup redirects and removes the old registration,
then removes its temporary backups. An incomplete cleanup reports a warning.
Power-loss recovery and partial registration recovery are not automated yet.
The new uninstaller uses its generated ownership log, with no recursive delete
rule. Old files absent from the new payload remain untouched.

The candidate installs both calendar icon variants. Start Menu and Desktop
shortcuts select the dark icon when Windows is dark at setup time; otherwise they
use the white calendar, including high contrast. Running setup again refreshes
that choice. Ordinary shortcuts do not switch live when Windows changes theme.
An existing standard Desktop shortcut is retained during migration. Shortcut
creation and adoption still need a human Windows check; fixture builds omit them.

Validation commands:

- `node tools/test-windows-setup.mjs`: actual native fixture install, missing-file
  reinstall, upgrade, blocked downgrade, retained installation directory and
  uninstall. Synthetic NSIS copies exercise migration, invalid commands, linked
  metadata, downgrade rejection, pre-copy failure and mid-copy rollback.
- `node tools/test-windows-setup.mjs --payload`: install the complete candidate
  payload under `.codex-temp`, compare every file, launch the installed app with a
  fresh test profile, and uninstall it. The check verifies every payload file,
  packaged mode, isolated profile, no connected accounts or guide, bundled Codex
  detection and System theme matching the native Windows preference. It also
  checks that explicit Dark uses the dark calendar and Light/System use white.

Both checks passed. Student-owned guide files inside the install folder and a
separate settings fixture survive updates and removal. Each test uses a unique,
short `cw.fixture.<UUID>` AppId, a temporary HKCU uninstall registration and only
repository fixture destinations. The generated native uninstaller removes that
registration; tests do not modify personal Canvas Weekly registrations. Test builds
omit shortcuts and scope elevation, so these results do not prove those behaviors.
Compiler output, installed fixtures and logs remain untracked under `.codex-temp`.


Remaining acceptance checks
-----------------

- New per-user installation, with no UAC at scope selection or file installation.
- Existing per-user/all-users copies, both copies present, and missing executables.
- Same-version reinstall, newer upgrade, rejected downgrade and cancelled elevation.
- Preserved settings, encrypted credentials, weekly guides and external output paths.
- Dark/light Windows preferences at launch, high contrast, keyboard focus and DPI.
- Matching packaged payload and no developer state or credentials in the installer.
- Human confirmation of the complete wizard on Windows; a compiled script and
  synthetic radio fixture do not prove the full installation experience.
