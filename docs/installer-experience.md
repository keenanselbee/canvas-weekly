Installer experience
====================

Requested direction: match the app's Windows light/dark appearance and show useful
maintenance choices when Canvas Weekly is already installed. The current NSIS
package has custom artwork and a repaired per-user selection, but no dark wizard
controls or dedicated maintenance page. A separate Inno Setup appearance preview
now implements startup theme detection and read-only discovery of existing NSIS
installations. It cannot install, update or remove anything; production migration
and maintenance actions remain implementation work.


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


Acceptance checks
-----------------

- New per-user installation, with no UAC at scope selection or file installation.
- Existing per-user/all-users copies, both copies present, and missing executables.
- Same-version reinstall, newer upgrade, rejected downgrade and cancelled elevation.
- Preserved settings, encrypted credentials, weekly guides and external output paths.
- Dark/light Windows preferences at launch, high contrast, keyboard focus and DPI.
- Matching packaged payload and no developer state or credentials in the installer.
- Human confirmation of the complete wizard on Windows; a compiled script and
  synthetic radio fixture do not prove the full installation experience.
