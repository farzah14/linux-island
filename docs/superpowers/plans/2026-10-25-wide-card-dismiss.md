# Wide, shallow card and outside-click dismissal

Approved design: roughly 360 by 110 logical pixels, artwork/text/close on one row,
32 px playback buttons below, 8 px control gaps. Keep existing artwork and motion.
The first outside click dismisses the card like a native GNOME menu, without
replaying that click into another application.

M3-14B renderer step. Scope: mediaView.js, capsule.js, renderer test, manual smoke.
Use GNOME GrabHelper public constructor/grab/ungrab APIs, confirmed in official
GNOME 46 source and installed GNOME 50.1 source. No private GNOME methods or
independent global input listeners. Acquire only while EXPANDED; release on
collapse, fullscreen hide and destroy. On grab failure request dismissal.

1. RED renderer tests for wide two-row layout, small controls and modal lifecycle.
2. Minimal layout and GrabHelper integration.
3. GREEN Node suites, GJS logic/artwork, token QA, syntax and diff checks.
4. Back up installation; copy and hash-verify the two UI files. No logout/reload.

GNOME 46 reference:
https://raw.githubusercontent.com/GNOME/gnome-shell/gnome-46/js/ui/grabHelper.js

Live outside-click, focus restoration, fullscreen, fractional scaling and visual
size acceptance remain NOT_RUN until an isolated GNOME runtime check.

## Observed results

- RED: `node tests/extension/capsule-rendering.test.js`, exit 1, `AssertionError: wide card content width` (old content width 268, expected 328).
- GREEN: same command, exit 0. Checks two-row structure, 32 px control height, matched Previous/Next styles, grab acquisition on expansion, release on collapse/fullscreen/destroy, outside-dismiss callback, and compact fallback after grab rejection. Existing artwork/motion checks remain passing.
- All seven Node test files, six existing GJS logic test files and `gjs -m tests/extension/local-artwork.gjs.js`: exit 0, PASS.
- Token QA: exit 0, 26 contrast checks. `node --check` for both modified UI modules and `git diff --check`: exit 0.
- Copied `ui/mediaView.js` and `ui/capsule.js` into the installed extension; SHA-256 matches source. Existing metadata preserved.
- Backup: `/home/farzah/.local/state/linux-island/backups/wide-dismiss-20261024T184832.847494Z`.
- Core service: `active`, exit 0. No automatic logout or Shell reload. Installation awaits a fresh GNOME session.

Environment: GNOME Shell 50.1 / Wayland, GJS 1.88.0. Real GNOME 46 pointer/focus/visual acceptance NOT_RUN; actor doubles are not compositor proof. No commit, push, merge or tag.
