Installer experience
====================

Requested direction: match the app's Windows light/dark appearance and show useful
maintenance choices when Canvas Weekly is already installed. The current NSIS
package has custom artwork and a repaired per-user selection, but no dark wizard
controls or dedicated maintenance page. These remain implementation work.


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
dark wizard controls, and avoids custom styles in high contrast. It is a candidate
for the next installer prototype; it has not replaced the NSIS production build.
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
