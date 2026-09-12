Desktop experience
==================

Status: approved direction; implementation progress is tracked in implementation-plan.md.
Target: a personal Windows app usable without a terminal or writing prompts.


Primary flow
------------

The product tagline is "Your week, simplified." Use it consistently in the app,
standalone guide and installer artwork.

The navigation has four destinations: This week, Courses, Settings, and Data & privacy. A fixed
sidebar carries the product name, navigation, and connection status. This week
leads with the academic week, last refresh, and a single primary Update guide
button. Open guide is secondary. Course selection and configuration are not mixed
into the reading experience.

Data & privacy explains collection, local storage, AI sharing and permitted
changes in four compact cards. It shows the live Study suggestions preference,
including when sign-in is still needed. Login settings, the output folder and
saved-guide source coverage are directly accessible; coverage is unavailable
until a guide exists. Expandable protection details explain restricted reads and
institutional limits without promising unchanged server state. The page also
distinguishes protected login storage from ordinary course data and documents,
cloud-folder syncing, and AI-service data policies.

Settings includes per-course reading preferences and an explicit acknowledgement
of possible view-based effects. Expanded preferences currently remain pending
validation, with limited reading displayed as the effective mode. This week shows
the latest Canvas collection status even after a failed update, with a link to
account-specific Collection history in Data & privacy. History includes incomplete
requests and interrupted runs without claiming that access or progress was undone.
See expanded-reading.md for the remaining source-admission work.

The sidebar footer separates Canvas and ChatGPT connection states, with Codex as
secondary connection detail. A separate study-suggestions row shows Off, On or
Sign in; connection alone does not imply permission to send course text. The
Connections header opens Settings.
Each service's status is also a keyboard-accessible button: it opens Settings,
scrolls to that service and focuses its first connection control. Navigation alone
does not start authentication or alter the account. The Connections header's
hover/focus area spans the same width as the sidebar navigation buttons, with
horizontal padding around the label and arrow.
ChatGPT connection options distinguishes Codex detected (a runtime file exists),
Codex ready (the runtime responded), and Codex not detected (manual selection is
needed). It shows the automatic or manual source and runtime location. Detection
does not launch Codex, sign in, or enable study suggestions.
Each service has a Remember on this computer checkbox and an explicit Forget
login action. Changing the preference signs out locally; guide files stay intact.
Course websites expose the same remember/forget choice next to their login form.
See remembered-connections.md for encrypted storage and one-time migration behavior.
Limited Canvas coverage stays visible when
connected, with a source-coverage explanation on This week. A future collection
hold must remain visible even when signed in. Both text and checkmarks convey connection status.

AI tokens shows the latest reported planning-run total in the current app session,
with an expandable input/output/cache/reasoning breakdown. No report displays a
dash rather than zero. Running and interrupted/failed runs are labeled; reported
subtotals are not added twice. These are Canvas Weekly planning tokens, not
account-wide usage, remaining allowance or a billing estimate. Counts reset on
restart or account recheck/disconnection and are not written to the guide.

Usage comes from `thread/tokenUsage/updated.tokenUsage.total`, verified against
the locally generated app-server schema. Each planner run creates a fresh
ephemeral thread; cumulative notifications replace the displayed count. Only
valid nonnegative integer counters from that run are accepted, and listeners
stop when the run ends. The last reported count is not guaranteed to include
usage reported after cancellation or termination. No new API request is needed
for this display. See the [official app-server notification documentation](https://learn.chatgpt.com/docs/app-server).

On first launch show a welcome card: Connect Canvas, choose courses, create your
first guide. ChatGPT connection is available from Settings; a factual guide still
works without AI. An explicitly labeled sample preview demonstrates the layout
without representing sample data as the student's courses or writing live output.

Connection steps open the provider's own login flow in a browser. The app never
asks for the student's ChatGPT password. Canvas access offers supported browser
sign-in first and an optional institution-issued API token connection. If an
institution does not support a method, report that and retain the current guide.


Screen structure
----------------

```text
Native Windows title bar
+-------------------+--------------------------------------------------+
| Canvas Weekly     | This week                       [Update guide]   |
|                   | September 7 - 13                [Open guide]     |
| This week         | Last updated ...                                 |
| Courses           |                                                  |
| Settings          | Priority / deadline list                         |
|                   | New and changed                                  |
|                   | Looking ahead                                    |
|                   | Source coverage / needs confirmation              |
|                   |                                                  |
| Canvas connected  |                                                  |
+-------------------+--------------------------------------------------+
```

Courses shows accessible courses with checkboxes, term, selected count, and save
action. Include nonstandard terms such as co-op separately through user selection.
Settings groups Connections, Output, and Appearance. Output shows the resolved
path and Change folder native dialog. Appearance is System (default), Light, Dark.
Weekly files also provides Academic timezone and Save timezone, with Monday-Sunday
weeks explained next to the control. Choose from runtime-supported timezone names
or UTC. Saving changes only local settings for the next refresh; it neither
rewrites the saved guide nor changes Canvas. Refreshes block timezone changes.
Future scheduling is optional, off by default, and must show local-machine limits.

The implemented weekly screen now leads with Your study plan: suggested starting
days, local preparation checkboxes and collapsible steps. Recorded deadlines stay
separate. Double-check prompts precede the detailed Canvas records. Opening a guide
updates its local checkmarks without recollecting Canvas. See study-guide-design.md
for completion semantics, offline behavior and the richer AI planning work.

The exported HTML guide has a collapsed Print options control. Full guide is the
default; Overview and checks produces a shorter printout with starting points,
recorded deadlines and main checks. The complete guide stays visible on screen.
The printed overview explicitly points to the full document for undated work,
all preparation tasks and supporting details.


Visual system
-------------

Use Segoe UI Variable with Segoe UI fallback, a native framed window, a navy
navigation rail in both themes, blue accents, an 8px spacing rhythm, and modest
4-5px content corner radii. Avoid a marketing hero, gradients, oversized typography or decorative
dashboard metrics. Main content should be readable at 1100x760, usable at 800x600,
and scroll rather than clip at high DPI or 200% text zoom.

Theme source defaults to Electron nativeTheme system. React to OS theme updates
without restarting. Light/dark overrides persist. Match native dialogs and the
renderer; use semantic CSS variables rather than inline colors. Honor forced
colors and reduced motion. Never change Windows' global appearance settings.

| Token | Light | Dark |
| --- | --- | --- |
| Window | #f6f8fa | #151c26 |
| Surface | #ffffff | #1d2835 |
| Text | #233447 | #edf3f9 |
| Secondary text | #536579 | #b7c5d4 |
| Border | #d4dde6 | #35465a |
| Accent | #0055b8 | #8cc8ff |
| Navigation rail | #0b2545 | #0b2545 |

Navigation uses 20px SVGs drawn on a matching 20-unit grid with consistent 2px
strokes. Straight edges align to the grid; rounded joins preserve the circular
eight-tooth settings cog. Curves still use normal antialiasing. Keep SVGs at their
native CSS size instead of scaling down larger glyphs. The original calendar/check
mark is shared with Windows and installer artwork; no university crest is used.
The mark uses a navy rounded tile, blue calendar header and three checklist rows.
Its white calendar is the executable default and the app's Light/System mark;
explicit Dark selects a dark calendar in the app and its window. Inno shortcuts
follow Windows at installation/update time, independently of the app preference.
No background shortcut updater is installed.
Page headers have a thin divider, and coverage or paused-refresh notices have a
colored left border alongside their text explanation.

The installer uses matching navy sidebar artwork and a multi-resolution Windows
icon. Its native wizard controls do not yet follow automatic dark mode. This is
a separate remaining prototype and Windows validation task; the app's existing
System/Light/Dark behavior does not theme NSIS controls. Validate installer pages,
focus, high contrast and 125/150/200% scaling before claiming full theme support.
The proposed existing-installation screen and supported dark-theme implementation
are described in [installer experience](installer-experience.md).


Interaction and accessibility
-----------------------------

- Buttons and form controls have visible keyboard focus and accessible labels.
- Status is expressed with text and icons, never color alone.
- Announce run progress and result/error using a live region without moving focus.
- Disable conflicting run/configuration actions while collecting; offer Cancel.
- A failed connection explains the next action. No raw stack traces in normal UI.
- Plain text rendering for Canvas content; no untrusted HTML or scripts in the app.
- External links open only validated HTTP(S) destinations through a controlled
  main-process handler. Assessment attempt links are rejected.
- User notes stay separate from generated content. Output history is recoverable.


Required states
---------------

Empty, connecting, needs login, ready, collecting, planning, exporting, cancelled,
complete, partial, and failed. Last successful output stays readable across every
state. A partial scan shows missing source categories next to the result. Sample
preview is always labeled, and cannot silently become a real exported guide.


Visual acceptance
-----------------

Inspect light and dark at normal and minimum window sizes; verify system theme
changes, manual override persistence, keyboard focus, long course names, empty
states, partial failures and loading feedback. Use real application screenshots
for review. Do not alter the user's Windows settings to test theme changes.
