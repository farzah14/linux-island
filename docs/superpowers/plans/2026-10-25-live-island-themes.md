# Live Island themes — M3-14C

Use the approved dark/light flat token exports (canonical tokens read-only).
Apply Core theme=light|dark|system to a scoped root class. System follows GNOME
org.gnome.desktop.interface color-scheme, including changes while open. Preserve
HIDDEN/COMPACT/EXPANDED, dimensions, artwork and audio meter; disconnect the
settings listener on disable. No desktop theme writes, Shell reload or root CSS.

Generate scoped stylesheet colors from approved exports. Replace fixed inline
colors in MediaView and BeatBars with scoped component classes, so child content
switches with the root. These renderer dependencies are necessary to avoid a
light outer capsule with dark inner controls. QML Settings-window restyling is
the separate M4-16B step; existing preference controls already persist the choice.

1. RED renderer tests for missing setTheme; explicit light/dark/system, live system
   change, keeping current interaction state, and listener cleanup.
2. Implement root theme switching and forward Core theme; generate CSS from tokens.
3. GREEN Node/GJS regressions, token/CSS consistency checks and syntax/diff gates.
4. Back up and hash-verify only modified extension files on installation. No logout.

A new session is needed once to load this updated JavaScript. Afterwards changing
the theme applies live. GNOME 46 visual acceptance remains NOT_RUN.

## Evidence

- RED `node tests/extension/capsule-rendering.test.js`: assertion `renderer needs live theme switching`, missing method. GREEN exit 0 after implementation.
- Renderer regression covers explicit Light/Dark, System mapping for prefer-dark/prefer-light/default, desktop changes ignored under explicit selection, expanded state retained, Core preference forwarding, listener cleanup and no fixed inline child colors overriding the palette.
- Seven Node test files, six GJS logic test files, and GJS local artwork test: exit 0, PASS.
- `python3 scripts/dev/generate-island-css.py --check`: exit 0, scoped CSS matches both approved theme exports. Token QA: 26 contrast checks, exit 0; warm palette: 3 tests, OK.
- Generated CSS parsed by installed GNOME St.Theme in a separate GJS process: exit 0, no active Shell theme modification. JavaScript syntax and diff checks exit 0.
- Host system schema/color-scheme verified; currently prefer-dark. Desktop setting was read, never changed.
- Installed stylesheet.css, extension.js, capsule.js, mediaView.js and beatBars.js; SHA-256 comparison matches source. Installed metadata preserved; Core remains active.
- Backup: `/home/farzah/.local/state/linux-island/backups/live-themes-20261024T200442.578179Z`.

Installed, awaiting fresh session to load JavaScript. Actual live theme rendering,
fractional scaling and GNOME 46 runtime acceptance NOT_RUN. Native build/CTest
not repeated because this step only changes extension rendering and tooling. No
automatic logout, Shell reload, commit, push, merge or tag.
