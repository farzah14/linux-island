# Media card layout and motion implementation plan

**Goal:** Apply the approved Warm Minimalist media-card layout and cancellable fade/scale transitions in one M3-14B rendering step.

**Architecture:** Keep the existing GJS actors and Core1 contract. Capsule owns transitions; MediaView owns track labels and controls. Extension forwards connection and animation settings. No changes to the installed extension or GNOME session.

**Approved design:** Aligned 48 px artwork placeholder and track details, compact header, centered controls with consistent 40 px hit targets. Use the canonical 220 ms standard transition, and no animation when disabled by the user or GNOME. Hide immediately on fullscreen and cancel transitions on destruction. Show Core offline distinctly from no media.

**Files:** `extension/ui/capsule.js`, `extension/ui/mediaView.js`, `extension/extension.js`, `tests/extension/capsule-rendering.test.js`, `tests/extension/manual-smoke.md`. Existing scoped stylesheet retained.

## Verification and implementation

- [x] Add actor-double regression tests that load the real renderer: active title/artist, offline state, disabled controls, expanded layout, interrupted animation, fullscreen hide, settings disabling animation, destruction cleanup.
- [x] Run `node tests/extension/capsule-rendering.test.js`; observe failure for missing offline/animation behavior.
- [x] Update MediaView layout and empty state; forward connected/settings from extension; add Capsule fade/scale transition using `ease`, replacing existing transitions before each state change.
- [x] Run the new regression and all existing `tests/extension/*.test.js`, token QA and `git diff --check`; record command exit codes.
- [x] Add isolated GNOME acceptance cases. Live GNOME 46 Wayland verification remains NOT_RUN; GNOME 50 source inspection and actor doubles are not compatibility proof.

## Observed evidence

- RED: `node tests/extension/capsule-rendering.test.js`, exit 1: `AssertionError: renderer must distinguish Core offline from no media`. Subsequent offline-snapshot assertion also failed with `Island` instead of `Core offline` before its fix.
- GREEN: same command, exit 0: `PASS: media rendering, offline recovery, interrupted transitions, reduced motion, fullscreen and cleanup`.
- `for test in tests/extension/*.test.js; do node "$test" || exit; done`, exit 0, seven test files pass.
- Six existing logic test files run with `gjs -m`, exit 0, each prints PASS. Actor-double test requires Node and is not a live Shell test.
- `python3 design-system/qa/verify_tokens.py`, exit 0: `PASS: 26 contrast checks; both flat themes match canonical JSON; token format and version valid`.
- `python3 design-system/qa/test_warm_palette.py`, exit 0: `Ran 3 tests`, `OK`.
- `python3 scripts/dev/verify-kit.py`, exit 0: `PASS: 21 prompts, 7 v2 runbooks, warm tokens, Core1 schema and starter paths verified`.
- `python3 tests/integration/test_m0_scaffold.py`, exit 0: `PASS: M0 static scaffold checks`.
- `node --check` on the three modified production JavaScript files: exit 0 each. `git diff --check`: exit 0 after removing a trailing documentation blank line.
- Real GJS CoreProxy against running user service, exit 0: `{"connected":true,"hasPlayer":true,"hasTitle":true,"hasArtist":true}`. No metadata text logged.
- Installed GNOME Shell 50.1 / GJS 1.88.0: introspection confirms `St.Settings.enable-animations`, `Clutter.Actor.set_pivot_point`, `remove_all_transitions`, and `St.Button.accessible-name`; installed `environment.js` supplies `Actor.ease`. This does not establish GNOME 46 acceptance.

Runtime boundary: new layout, visual motion quality, scaling and focus behavior are NOT_RUN in an isolated GNOME session. No installation or Shell reload performed. Native build/CTest NOT_RUN because this step changes only GJS rendering and its documentation/tests.

No commit, install, merge or push in this step. The stopped Core was restarted separately and its D-Bus metadata presence verified without logging song text.

## Subsequent user-authorized installation (2026-10-25, Asia/Jakarta)

After the user requested “Update 1”, installed only `extension.js`,
`ui/capsule.js`, and `ui/mediaView.js` in the existing per-user extension directory.
Preserved the installed metadata's existing GNOME 46/50 version declarations;
repository metadata remains unchanged. Core service configuration was not replaced.

- Backup: `/home/farzah/.local/state/linux-island/backups/20261024T180718.692579Z`.
- Seven Node test files: PASS, exit 0. Token validation: 26 contrast checks, exit 0.
- Installation: exit 0; SHA-256 comparison matches source for all three files.
- `gnome-extensions info linux-island@local`: enabled, ACTIVE. This is the existing loaded instance, not proof the new code is running.
- `systemctl --user is-active linux-island-core.service`: `active`, exit 0.
- No automatic logout, Shell reload, or enable/disable operation performed.

Status: installation verified; new code awaits a fresh GNOME session. Isolated
GNOME 46 Wayland visual/runtime acceptance remains NOT_RUN. The user should save
open work and log out/in to load the installed update on the existing GNOME 50
host; that does not replace the required baseline acceptance.
