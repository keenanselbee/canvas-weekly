Session refresh diagnostics
===========================

`CW_SESSION_MISSING` means the local Electron cookie lookup did not return the
expected `_normandy_session` cookie for the configured Canvas origin and GraphQL
path. The refresh stops before its profile verification or material collection
requests. A previously successful profile/course list can still leave Canvas
shown as connected; that status alone does not establish readiness to refresh.

The September 11 installed-app report showed this error and zero recorded
collector requests. Earlier profile and course requests returned HTTP 200.
Read-only inspection of the persistent cookie database did not find a Canvas
cookie, but this does not establish which session cookies were held in memory
when the failure occurred. The cause of that live-session mismatch remains
unverified. Do not infer account progress changes, successful sign-out, or an
institution-specific cookie name from this evidence.

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
- The exact cookie, security flags, scope, expiry and change checks remain in
  force. No new Canvas requests, assessment actions or reading permissions are
  admitted by this change. Existing guides are preserved on collection failure.

Reconnect using Settings and retry. If the error repeats, the live session needs
further diagnosis using credential-free metadata. Changing the expected cookie
name or accepting another cookie requires evidence and a reviewed identity
binding; weakening the check is not a recovery strategy.

Validation uses synthetic cookies and responses in an isolated Electron
profile, plus unit tests for durable diagnostics and UI checks in both themes.
No live refresh or account progress comparison was performed for this repair.
