Implementation milestones
=========================

The user authorized implementation and DIFF followed by COMMIT for each suitable
milestone. The active goal is the usable personal Windows app, with explicit
account-dependent validation gaps. Keep this file current as work progresses.


Milestone ledger
----------------

| Milestone | Deliverable | Acceptance | State |
| --- | --- | --- | --- |
| M0 | Product, UX, architecture and delivery plan; existing output initializer | Documents agree with the user's boundaries; Desktop/override verified | In review |
| M1 | Native desktop shell, navigation, appearance and saved settings | App launches; system/light/dark work; folder picker; light/dark visual QA | Pending |
| M2 | Canvas connection and restricted course collection | Allowlist, redirects, pagination, quiz metadata, preserved read state tested | Pending |
| M3 | Persistent weekly guide and updates | Week/DST, same-week revisions, notes, partial scans and changes tested | Pending |
| M4 | ChatGPT connection and optional planning | Official login, process lifecycle, bounded evidence, graceful fallback | Pending |
| M5 | Broader course evidence and Word output | Sources/coverage visible, document render verified, no unsupported completeness claims | Pending |
| M6 | Windows package and end-to-end review | Installable local artifact, no secrets, first-run UX, refresh/reconnect tested | Pending |

Scheduling, multi-provider support, public distribution and hosted service are
subsequent enhancements. They are documented product directions, not prerequisites
for the first personal release. Never claim live account integration is tested
without a real successful run. Human login is a required external step.


DIFF and COMMIT procedure
-------------------------

At each milestone inspect status, relevant new files and diff, run the documented
checks, then publish a concise DIFF proposal listing exact files and commit title.
COMMIT executes that proposal if those files remain unchanged, using explicit
paths, git diff --cached --check, and the style in commit-style.md. If files change,
review and propose again first. Report commit hash and validation. Authorization
persists across milestones; no repeated permission question is needed.

Pre-existing unrelated files remain untouched and unstaged. Do not commit machine
state, sample exports, node_modules, user credentials or build artifacts. No push
or remote publishing is part of this local milestone authorization.


Release acceptance scenarios
----------------------------

1. A new user opens the app, sees clear setup, chooses output and connects Canvas.
2. A factual weekly guide works without ChatGPT; AI connection adds interpretation.
3. Available assessments appear once, with exact dates and source links, without
   starting/resuming a quiz or retrieving questions/answers.
4. A changed deadline updates the same weekly file and shows old/new values.
5. A Monday rollover creates a new week while preserving overdue work and notes.
6. Failed or cancelled scans preserve the previous guide and show stale coverage.
7. Login expiry requests reconnect and never becomes an empty successful result.
8. A source message is read with auto_mark_as_read=false and no message is sent.
9. Theme follows Windows live; manual light/dark overrides survive restart.
10. Package excludes all developer state and opens correctly from a path with spaces.


Work log
--------

- 2026-09-10: Existing output initializer resolves Desktop/Canvas Weekly and accepts
  an absolute override. Added Windows UX, architecture, milestones and acceptance.
  Chose Electron with a minimal renderer and separate collector/planner boundaries.
