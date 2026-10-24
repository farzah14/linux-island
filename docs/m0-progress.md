# M0 progress and handoff — 2026-10-24

## Origin

No pre-existing Linux Island repository was present in this workspace. The connected GitHub installation search for `linux-island` returned no matching repositories. A **new local-only Git repository** was initialized at `/mnt/data/linux-island` on `feat/m0-gnome-compatibility`. It has no remote and was not pushed.

## Work performed

| Planned task | Status | Evidence |
|---|---|---|
| Task 01: bootstrap repository / CMake | PARTIAL | Files and preset exist; Qt6 configuration blocked (`Qt6Config.cmake` missing). |
| Task 02: GNOME capsule lifecycle | STATIC PROTOTYPE | `metadata.json`, ES module extension, and panel actor created; no runtime GNOME execution. |
| Task 03: pure interaction state reducer | LOGIC VERIFIED UNDER NODE | Red test: module-not-found exit 1; green test: 17 assertions pass under Node. GJS runtime confirmation pending. |
| Task 04: fullscreen, Smart Adaptive, cleanup | NOT STARTED | Requires an actual GNOME 46 Wayland test user/VM and its live Mutter APIs. |

## Verified facts

- `node tests/extension/state-machine.test.js`: pass (17 state assertions).
- `python3 tests/integration/test_m0_scaffold.py`: pass (static file and metadata checks).
- `node --check`: exit 0 for all three JS source modules.
- Approved D-Bus XML copied byte-for-byte; XML parsed; 6 methods and 3 signals.
- `cmake --preset dev`: fails because `Qt6Config.cmake` is not installed in this container.
- GNOME Shell, GNOME Extensions CLI, and GJS are not installed here.

These facts do **not** demonstrate a running Island or successful GNOME Wayland integration.

## Next actions on an Ubuntu 24.04/GNOME 46 Wayland test VM

1. Read `tests/extension/manual-smoke.md` and capture actual host facts in `docs/compatibility.md`.
2. Install necessary dependencies only on the disposable test environment and run `cmake --preset dev`, `cmake --build --preset dev`, `ctest --preset dev`.
3. Run `gjs -m tests/extension/state-machine.test.js` to confirm pure state logic in GJS.
4. Install the extension into the **test user** and verify enable/disable lifecycle 10 times.
5. Implement Task 04 only after identifying the supported GNOME fullscreen/primary-monitor signals on that host; perform fullscreen/recovery acceptance tests.
6. Do not proceed to M1 until live M0 compatibility acceptance passes or documented deviations are approved.
