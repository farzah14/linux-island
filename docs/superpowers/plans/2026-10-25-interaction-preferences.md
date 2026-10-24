# Live interaction preferences

Connect existing hoverPreviewEnabled and smartAdaptiveEnabled settings without
changing schema, colors or layout. Hover OFF ignores enter/leave and closes only
PREVIEW, preserving explicit expansion. Hover ON under a stationary pointer can
enter preview immediately. Smart Adaptive OFF restores compact even if fullscreen;
ON reevaluates current display state immediately and hides conservatively.

Scope: Capsule hover gate/setter, IslandController fullscreen policy setter,
extension settings forwarding, renderer/controller tests and manual smoke. Apply
fullscreen setting before hover so its visibility policy keeps priority.

Test RED missing setters; GREEN toggle during hover/fullscreen/expanded, frozen
pointer, unknown display state and destruction. Run Node/GJS regression and CSS/
token checks, then back up and hash-verify the three installed JavaScript files.
No logout or Shell reload. Live GNOME 46 acceptance remains NOT_RUN.

## Evidence

- RED renderer regression, exit 1: `renderer needs live hover preference` (undefined setter). Controller regression, exit 1: `Live fullscreen preference setter: expected function, got undefined`.
- GREEN both regressions exit 0. Renderer integrates the real reducer/controller with actor doubles: hover disabled, stationary-pointer activation, preview dismissal, explicit click unaffected, simultaneous fullscreen priority, and restoring compact when adaptive is disabled. Controller checks enable/disable during fullscreen, unknown state and post-destroy settings.
- Seven Node test files, six GJS logic files and GJS artwork test: PASS, exit 0. Generated CSS consistency, 26 token contrast checks, modified JavaScript syntax and diff check: exit 0.
- Installed lib/islandController.js, ui/capsule.js and extension.js with SHA-256 matches; metadata preserved. Core remains active. Backup: `/home/farzah/.local/state/linux-island/backups/interaction-preferences-20261024T202543.262409Z`.

Fresh session required to load installed code; afterwards preference changes are
live. Compositor fullscreen/input and GNOME 46 acceptance remain NOT_RUN. Native
tests not repeated for this extension-only change. No automatic logout/reload,
commit, push, merge or tag.
