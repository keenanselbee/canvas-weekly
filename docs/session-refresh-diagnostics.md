Session refresh diagnostics
===========================

`CW_SESSION_MISSING` means the local Electron cookie lookup did not return a
recognized session cookie for the configured Canvas origin and GraphQL path.
The refresh stops before its profile verification or material collection
requests. A previously successful profile/course list can still leave Canvas
shown as connected; that status alone does not establish readiness to refresh.

The September 11 installed-app report showed this error and zero recorded
collector requests. Earlier profile and course requests returned HTTP 200.
Read-only inspection of the persistent cookie database did not find a Canvas
cookie, but this does not establish which session cookies were held in memory
when the failure occurred. Subsequent anonymous login-response inspection found
the cookie-name mismatch described below. Do not infer account progress changes
or successful sign-out from the earlier database evidence.

UBC cookie-name evidence and repair
----------------------------------

On September 11, an anonymous HTTPS GET of https://canvas.ubc.ca/login returned
a same-origin redirect. Following that redirect once, without any personal
cookies, credentials or profile, returned another HTTP 302 to UBC authentication.
The Canvas response set these cookie names and attributes:

| Name | Attributes observed |
| --- | --- |
| `_csrf_token` | path=/; secure |
| `log_session_id` | path=/; secure; httponly |
| `canvas_session` | path=/; secure; httponly; samesite=none |

Cookie values and redirect queries were not printed or retained. The request
stopped before the external identity-provider redirect. This is direct evidence
that this UBC login flow uses a different session-cookie name from the app's
previous `_normandy_session` assumption. Upstream Canvas allows configuration to
override the default key in config/initializers/session_store.rb (reviewed source
revision 1c9f0bb8013ed69c4f2efe11fd483025469b7e6c).

The watcher and encrypted session snapshot now recognize `canvas_session` only
for the exact origin https://canvas.ubc.ca. The stock `_normandy_session` name
continues to work. Exactly one applicable recognized cookie must exist; neither
name takes priority if both are present. The fingerprint includes the name, and
a change to either recognized name aborts the refresh. Log-session and CSRF
cookies alone cannot establish the watched session. Other institutions do not
inherit the UBC alias. Restoration never inserts a saved credential when either
recognized session cookie is already live.

This repairs the evidenced compatibility mismatch. The anonymous response does
not prove a successful authenticated UBC refresh or complete course coverage;
the student must still validate the rebuilt app after sign-in.

Current behavior
----------------

- A failed local session check exposes Refresh paused and connection settings.
  The profile connection remains distinct from collection readiness.
- Collection history persists a fixed session error code and explanation,
  including zero-request failures. Arbitrary exception text, cookie names,
  cookie values and headers are not added to history. Older history records are
  not retrospectively assigned a cause.
- Reverification clears the local pause so a new refresh can check the session
  again. It does not bypass that check or guarantee successful collection.
- The recognized-cookie, security flags, scope, expiry and change checks remain in
  force. No new Canvas requests, assessment actions or reading permissions are
  admitted by this change. Existing guides are preserved on collection failure.

Reconnect using Settings and retry. If the error repeats, the live session needs
further diagnosis using credential-free metadata. Changing the expected cookie
name or accepting another cookie requires evidence and a reviewed identity
binding; weakening the check is not a recovery strategy.

Validation uses synthetic cookies and responses in isolated Electron profiles:
encrypted stock-cookie restoration, UBC-cookie cold restart, preservation of a
newer live credential, and the refresh/export path. Unit cases cover both names,
origin restrictions, duplicate/shadow cookies, flags, expiry and name changes.
No authenticated live refresh or account progress comparison was performed for
this repair.
