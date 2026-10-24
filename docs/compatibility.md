# Linux Island M0 environment audit

**Date:** 2026-10-24

## Verified Host Environment

| Check | Observed result | Status / Implication |
|---|---|---|
| Operating system | Ubuntu 26.04.1 LTS (Resolute Raccoon) x86_64 | Additional compatibility target (baseline spec: Ubuntu 24.04 LTS) |
| Git | Available (/usr/bin/git) | Working tree verified |
| Compiler | GCC 15.2.0 (g++ 15.2.0-16ubuntu1) | Available; C++20 standard supported |
| Build tools | CMake 4.2.3, Ninja 1.13.2 | Available; configuration and build verified |
| Qt 6 libraries | Qt 6.10.2 (`Qt6Core`, `Qt6DBus`, `Qt6Quick`, `Qt6Qml`) | Available via system packages (`qt6-base-dev`, `qt6-declarative-dev`) |
| GNOME Shell | GNOME Shell 50.1 | Installed; Wayland session (`XDG_SESSION_TYPE=wayland`) |
| GJS | 1.88.0 | Installed; GJS ESM test harness verified |
| Node.js | v22.22.1 | Installed; pure reducer tests verified |
| Python 3 | 3.14.4 | Installed; verification kit and token validation verified |

## Baseline Verification Results

- `cmake --preset dev`: **PASS** (Ninja generator, Debug build configured in 1.4s)
- `cmake --build build/dev`: **PASS** (`linux-island-core` binary compiled and linked successfully)
- `ctest --test-dir build/dev --output-on-failure`: **PASS** (4 tests passed: `revision-clock`, `settings-schema`, `dbus-schema`, `core-dbus`)
- `python3 scripts/dev/verify-kit.py`: **PASS** (21 prompts, 7 v2 runbooks, warm tokens, Core1 schema)
- `node tests/extension/state-machine.test.js`: **PASS** (21 state-machine assertions)
- `gjs -m tests/extension/state-machine.test.js`: **PASS** (21 state-machine assertions under GJS 1.88.0)
- `python3 tests/integration/test_m0_scaffold.py`: **PASS** (M0 static scaffold checks)
- `python3 design-system/qa/verify_tokens.py`: **PASS** (26 contrast checks, canonical token validation)
- `node tests/extension/display-policy.test.js`: **PASS** (5 display policy checks)
- `gjs -m tests/extension/display-policy.test.js`: **PASS** (5 display policy checks)
- `node tests/extension/island-controller.test.js`: **PASS** (10 controller and display adapter checks)
- `gjs -m tests/extension/island-controller.test.js`: **PASS** (10 controller and display adapter checks)
- `node tests/extension/core-proxy.test.js`: **PASS** (18 core-proxy and reconciler tests)
- `gjs -m tests/extension/core-proxy.test.js`: **PASS** (18 core-proxy and reconciler tests)
- `python3 design-system/qa/test_warm_palette.py`: **PASS** (3 unit tests)
- Node syntax checks (`extension.js`, `capsule.js`, `interactionState.js`, `displayPolicy.js`, `gnomeDisplayAdapter.js`, `islandController.js`, `coreProxy.js`): **PASS**

## Acceptance & Milestone Status

- **M0 Task 01 Qt build verification:** **PASSED** (CMake bootstrap, Qt 6 Core/DBus link, and executable build verified).
- **M0 Task 02 live GNOME enable/disable:** **PENDING / BLOCKED** (Extension runtime enable/disable requires an isolated test user or VM; live daily-use desktop testing prohibited by safety rules).
- **M0 Task 04 Smart Adaptive fullscreen:** **PASSED (Logic & Contract)** (Card M0-04A pure policy verified with 5 tests; Card M0-04B controller and adapter verified with 10 unit tests under Node & GJS; live acceptance pending isolated session).
- **M1 Core + D-Bus Architecture (Cards M1-05 through M1-09):** **PASSED**
  - **Task 05 (M1-05A):** Core1 schema frozen with 6 methods and 3 signals (`test_schema.py` in CTest).
  - **Task 06 (M1-06A/B):** `CoreService` and `CoreAdaptor` exposed on session bus (`tst_core_dbus` with 13 assertions).
  - **Task 07 (M1-07):** `RevisionClock` tracking monotonic revisions and distinct instance IDs per process (`tst_revision_clock`).
  - **Task 08 (M1-08A/B):** Typed settings schema validation and atomic persistence (`SettingsStore` with `QSaveFile`, rejected patches leave disk/memory unchanged).
  - **Task 09 (M1-09):** Nonblocking GJS `CoreProxy` with owner sequence `:1.20 -> null -> :1.21` reset, cancellable async Gio requests, and offline UI fallback.

## Compatibility Matrix

| Target Platform | Shell Version | Lifecycle Status | Fullscreen Status | Notes |
|---|---|---|---|---|
| **Ubuntu 24.04 LTS (Canonical Baseline)** | GNOME 46 | Baseline target; code compatible; runtime acceptance pending VM/test user | Policy & Adapter verified (M0-04A/B); runtime acceptance pending VM/test user | Canonical v0.1 release target |
| **Ubuntu 26.04.1 LTS (Host Environment)** | GNOME 50.1 | Code audit PASS (M0-02); runtime validation BLOCKED (primary desktop) | Policy & Adapter verified (M0-04A/B); runtime validation BLOCKED (primary desktop) | Additional target; requires isolated session for live testing |

## GNOME Fullscreen API Feasibility (M0-04B)

Verified against GNOME Shell and Mutter sources (`libshell-18.so`, `layout.js`, `workspaceAnimation.js`):
- `global.display`:
  - Signal: `'in-fullscreen-changed'`
  - Method: `get_monitor_in_fullscreen(monitorIndex)` -> `boolean`
- `Main.layoutManager`:
  - Property: `primaryIndex` -> `number`
  - Property: `primaryMonitor` -> object with `{ index, inFullscreen, x, y, width, height }`
  - Signal: `'monitors-changed'`
- `global.workspace_manager`:
  - Signal: `'active-workspace-changed'`
  - Method: `get_active_workspace().list_windows()` -> Array of `Meta.Window`
- `Meta.Window`:
  - Method: `get_monitor()` -> `number`
  - Method: `is_fullscreen()` -> `boolean`
## GNOME 50 Code Audit & Compatibility Findings (M0-02)

- **Extension Subclass & Lifecycle:** `LinuxIslandExtension` inherits `Extension` via `resource:///org/gnome/shell/extensions/extension.js`. `enable()` creates a single `Capsule` instance with guard check `if (this._capsule) return;`. `disable()` calls `destroy()` and nullifies references. Fully compatible with GNOME 50 lifecycle semantics.
- **Panel Integration:** `Main.panel.addToStatusArea('linux-island', this._button, 0, 'center')` verified against GNOME Shell 50 `ui/panel.js`. GNOME 50 requires `indicator instanceof PanelMenu.Button` and connects a `destroy` signal handler that removes the indicator from `statusArea` on destruction.
- **Actor Hierarchy:** `Capsule` allocates `PanelMenu.Button`, `St.BoxLayout`, and `St.Label`. Child actors are destroyed upon button destruction.
- **Review Guidelines Adherence:** Zero actors, side effects, or signal connections in module scope; all resources allocated in `enable()` and torn down in `disable()`.
- **Metadata:** `extension/metadata.json` remains strictly `"shell-version": ["46"]` until live runtime verification succeeds in an isolated GNOME 50 environment.
- **Runtime Validation Gate:** BLOCKED. The host is an active primary daily-use session (`Session: wayland`, `GNOME Shell 50.1`). Live extension installation and enable/disable tests require an isolated test user or VM to prevent session disruption.

## Isolated Testing Preparation (M0-02A)

- **Host Resource Inspection:**
  - CPU: x86_64 with VT-x hardware virtualization support.
  - RAM: 14 GiB total, 5.9 GiB available.
  - Disk: 92 GiB available on root NVMe filesystem (`/dev/nvme0n1p2`).
  - Virtualization packages: `gnome-boxes`, `qemu-system-x86_64`, `virt-manager` are not currently installed. Sudo requires interactive password authentication.
- **Evaluation of Testing Options:**
  1. *Dedicated Test Account (`gnometest`)*: Requires ~50–100 MB disk, 0 extra background RAM, full native Wayland GPU acceleration, and 100% separate D-Bus session bus and extension directory. **Recommended as safest and most lightweight.**
  2. *Virtual Machine (GNOME Boxes / QEMU)*: Requires downloading a 3+ GB ISO, allocating 15–25 GB disk and 4–6 GB RAM. Fully isolated but high resource overhead.
- **Test Staging Package:**
  - Staging path: `build/test-compat-gnome50/linux-island@local.shell-extension.zip`.
  - Staged metadata contains `"shell-version": ["46", "50"]` for testing eligibility in GNOME 50.
  - Repository source `extension/metadata.json` remains strictly unchanged at `"shell-version": ["46"]`.
- **Rollback Plan:**
  - Delete test account via `sudo userdel -r gnometest`.
  - Remove build staging artifacts via `rm -rf build/test-compat-gnome50/`.
