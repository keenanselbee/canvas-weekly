Desktop experience
==================

Status: approved direction; implementation progress is tracked in implementation-plan.md.
Target: a personal Windows app usable without a terminal or writing prompts.


Primary flow
------------

The navigation has three destinations: This week, Courses, and Settings. A fixed
sidebar carries the product name, navigation, and connection status. This week
leads with the academic week, last refresh, and a single primary Update guide
button. Open guide is secondary. Course selection and configuration are not mixed
into the reading experience.

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
Future scheduling is optional, off by default, and must show local-machine limits.


Visual system
-------------

Use Segoe UI Variable with Segoe UI fallback, a native framed window, restrained
blue accent, neutral backgrounds and borders, 8px spacing rhythm, and modest 6-10px
corner radii. Avoid a marketing hero, gradients, oversized typography or decorative
dashboard metrics. Main content should be readable at 1100x760, usable at 800x600,
and scroll rather than clip at high DPI or 200% text zoom.

Theme source defaults to Electron nativeTheme system. React to OS theme updates
without restarting. Light/dark overrides persist. Match native dialogs and the
renderer; use semantic CSS variables rather than inline colors. Honor forced
colors and reduced motion. Never change Windows' global appearance settings.

| Token | Light | Dark |
| --- | --- | --- |
| Window | #f3f3f3 | #202020 |
| Surface | #ffffff | #2b2b2b |
| Text | #202020 | #f5f5f5 |
| Secondary text | #595959 | #bdbdbd |
| Border | #d8d8d8 | #484848 |
| Accent | #005fb8 | #70b7ff |


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
