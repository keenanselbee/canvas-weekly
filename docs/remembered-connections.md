Remembered connections
======================

Settings has separate Remember on this computer controls for Canvas and ChatGPT.
They default to on, matching the earlier persistent-connection behavior. Turning
either off removes its saved login and signs out locally. Future sign-ins use
memory-only storage until the preference changes. Forget Canvas login and Forget
ChatGPT login also work from the disconnected state when local login data remains.
Forget actions are hidden when there is nothing to clear. Canvas includes saved
credential files, active tokens and browser cookies, including an incomplete
sign-in; unreadable saved files remain removable. ChatGPT includes active sign-in
and saved-login records. These indicators do not establish that credentials are
valid. Guide files are retained.
Remembering ChatGPT never enables Study suggestions.

Canvas
------

The remembered browser profile remains isolated under app-private userData.
After successful account verification, Canvas Weekly also writes a Windows-
encrypted copy of the host-only, secure, root-path session cookie and _csrf_token.
The session name is _normandy_session by default; canvas_session is also recognized
for the exact https://canvas.ubc.ca origin. Both names at once are ambiguous and
cannot authorize a refresh. This supports restoring session-only cookies after an app restart.
The app does not capture the university password or MFA codes. It preserves each
cookie's original attributes and expiry; a snapshot has a seven-day local restore
limit. Other cookie formats use the browser profile and may need another login.

Restoration only fills missing cookies and only for the configured HTTPS origin;
it skips the snapshot if either recognized session cookie is already live.
An expired or wrong-origin snapshot is removed. Restored credentials do not set
Connected: the app still verifies the account, and guide refresh still requires
the existing session watcher, account/role checks and restricted network gate.
The UBC cookie-name mismatch is repaired; authenticated live refresh still needs
validation. See [session diagnostics](session-refresh-diagnostics.md).

With Remember off, Canvas uses an in-memory Electron partition. Saved token and
session files and the previous persistent browser state are cleared. Optional
API tokens are encrypted when remembered and remain in memory otherwise. Changing
the preference during a login or refresh is rejected. Credential writes/removals
remain serialized so a late save cannot undo Forget.

ChatGPT through Codex
--------------------

Remembered authorization uses cli_auth_credentials_store="keyring". The off
setting uses "ephemeral". There is no "auto" or plaintext fallback. The app uses
its own CODEX_HOME, so Forget does not target the user's separate Codex profile.
A non-secret marker triggers restoration on the next launch; connection status
comes from account/read, not the marker. Expired/unavailable authorization asks
for a new sign-in. Runtime replacement waits for the previous process to exit.

An older app auth.json is encrypted with Windows safeStorage, round-trip checked,
and atomically saved before the plaintext file is removed. The recovery copy is
not fed back to Codex: one fresh sign-in lets Codex save to its native credential
store. The encrypted recovery copy is removed after successful account/read or
Forget. If encryption fails, migration stops and preserves the original file;
the app does not silently continue with plaintext storage.

Official behavior: https://developers.openai.com/codex/auth/
The pinned 0.154.0 runtime is tested with synthetic authorization against the real
Windows credential backend, including persistence across two Electron processes.
This establishes storage behavior, not real ChatGPT OAuth refresh acceptance.

Course websites
---------------

Each website login has its own Remember checkbox and Forget website login action.
Remembered credentials stay encrypted and bound to the Canvas account, course
site and authentication realm. An unchecked login stays in memory, disappears on
restart, and does not require disk encryption. Forget removes the saved secret
and memory copy without contacting the website or removing its configured URL.

Storage and validation
----------------------

EncryptedFile uses Electron safeStorage through a main-process-only interface.
It verifies an encryption/decryption round trip before atomic replacement and
sanitizes encryption/decryption failures. Windows DPAPI protects against other
Windows users, not other programs already running as the same user. Only status
is added to renderer snapshots; saved secrets are kept separate from guide and
planning inputs.
See https://www.electronjs.org/docs/latest/api/safe-storage.

npm run test:remember exercises real Windows encryption, cold Canvas restoration,
expiry, forgetting, memory-only mode, Codex keyring persistence and legacy-cache
protection using an isolated profile and synthetic credentials. Unit tests cover
encryption failures and website memory/forget semantics. Desktop tests exercise
checkbox persistence, invalid inputs, both themes and minimum-window layout.
