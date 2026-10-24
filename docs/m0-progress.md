# M0 progress and handoff — 2026-10-24

## Origin

No pre-existing Linux Island repository was present in this workspace. The connected GitHub installation search for `linux-island` returned no matching repositories. A **new local-only Git repository** was initialized at `/mnt/data/linux-island` on `feat/m0-gnome-compatibility`. It has no remote and was not pushed.

## Work performed

| Planned task | Status | Evidence |
|---|---|---|
| Task 01: bootstrap repository / CMake | **PASSED** | CMake 4.2.3 and Ninja 1.13.2 configure and build `build/dev/core/linux-island-core` with Qt 6.10.2 Core/DBus; 0 ctest failures. |
| Task 02: GNOME capsule lifecycle | **STATIC AUDIT PASS / RUNTIME BLOCKED** | ES module lifecycle and `PanelMenu.Button` integration verified against GNOME Shell 50.1 API; runtime enable/disable blocked pending isolated test user session. |
| Task 03: pure interaction state reducer | **PASSED** | 21 assertions verified under both Node.js v22.22.1 and GJS 1.88.0. |
| Task 04: fullscreen, Smart Adaptive, cleanup | **PASSED (Logic & Adapter Contracts)** | Card M0-04A pure policy (5 checks) and Card M0-04B controller + display adapter (10 checks) pass under Node and GJS. Live runtime acceptance blocked pending isolated test user session. |

## Verified facts

- `cmake --preset dev && cmake --build build/dev`: pass (binary linked dynamically to Qt6Core).
- `node tests/extension/state-machine.test.js` & `gjs -m tests/extension/state-machine.test.js`: pass (21 assertions).
- `node tests/extension/display-policy.test.js` & `gjs -m tests/extension/display-policy.test.js`: pass (5 checks).
- `node tests/extension/island-controller.test.js` & `gjs -m tests/extension/island-controller.test.js`: pass (10 checks).
- `python3 scripts/dev/verify-kit.py`: pass (21 prompts, 7 runbooks, tokens, Core1 XML).
- `python3 tests/integration/test_m0_scaffold.py`: pass (static scaffold checks).
- `python3 design-system/qa/verify_tokens.py`: pass (26 contrast checks).
- `node --check extension/**/*.js`: exit 0 for all extension modules.
- Staged test package created at `build/test-compat-gnome50/linux-island@local.shell-extension.zip`.

## Runtime Acceptance Gate

- **Environment Constraint:** Host runs Ubuntu 26.04.1 LTS / GNOME Shell 50.1 Wayland as the primary user desktop (`farzah`).
- **Safety Rule:** Experimental extensions must never be activated on the primary daily-use desktop.
- **Status:** Live GNOME runtime acceptance remains **BLOCKED** until a dedicated test account (`gnometest`) or VM is provisioned to execute the 10-cycle smoke test.
