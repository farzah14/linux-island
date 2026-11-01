# Standardize on Qt6 overlay across all desktop environments

## Context
Linux Island currently maintains two divergent UI frontends: a native GNOME Shell Extension in GJS/Clutter (`extension/`) and a standalone Qt6 Quick/QML overlay (`island-ui/`). When installed across different desktop environments or Linux distributions, the launcher branches on `$XDG_CURRENT_DESKTOP`, running the GNOME extension on GNOME and the Qt6 overlay on KDE, XFCE, and other environments, resulting in completely different tab layouts, card metrics, and styling. This plan standardizes Linux Island on the standalone Qt6 overlay (`linux-island-ui`) across all desktop environments, ensuring the identical UI shown in the user's photos runs consistently on every Linux distribution.

## Approach

### 1. Universal Qt6 Execution in Launcher
- **File:** `packaging/bin/linux-island-launch`
- **Action:** Replace the conditional GNOME Shell extension handover with universal `linux-island-ui` execution:
  - Remove lines 117–127 where `gnome-extensions enable linux-island@local` was called and exited on GNOME sessions.
  - When `$IS_GNOME` is true, invoke `gnome-extensions disable linux-island@local 2>/dev/null || true` to disable any previously loaded GNOME Shell extension and avoid double-rendering or Mutter actor conflicts.
  - Update `if [[ "$MODE_FLAG" == "--status" ]]` block to output:
    ```bash
    echo "Linux Island Desktop Environment: $DE"
    echo "Display Mode Preference: $DISPLAY_MODE"
    echo "UI Engine: Standalone Qt6 QML Overlay (linux-island-ui)"
    ```
  - Unconditionally pass execution to `exec "$UI_BIN" "$@"` so that systemd user units, autostart, and manual CLI launches run the identical Qt6 overlay process.

### 2. Installer & Systemd Service Configuration
- **File:** `packaging/dev/install-local.sh`
- **Action:**
  - Remove step 6 (copying extension files into `~/.local/share/gnome-shell/extensions/linux-island@local` as default active UI).
  - Add explicit disable step: if `command -v gnome-extensions &>/dev/null`, run `gnome-extensions disable linux-island@local 2>/dev/null || true` to cleanly migrate existing users.
  - Ensure `linux-island-ui.service` and `linux-island-core.service` are enabled and started via `systemctl --user`.
- **File:** `packaging/systemd-user/linux-island-ui.service`
- **Action:**
  - Add platform environment variables under `[Service]`:
    ```ini
    Environment=QT_QPA_PLATFORM=wayland;xcb
    Environment=QT_WAYLAND_DISABLE_WINDOWDECORATION=1
    ```
    This ensures `linux-island-ui` launches reliably with frameless transparent window styling across GNOME Wayland, KDE Wayland, and X11 sessions.

### 3. Display Surface Geometry & Fullscreen Policy Verification
- **File:** `island-ui/display_surface_manager.cpp`
- **Action:**
  - In `DisplaySurfaceManager::updateWindowPosition()`, ensure window coordinates properly account for GNOME's top panel when running on GNOME by querying screen available geometry:
    - Replace raw `screenGeo.y() + vOffset` with screen available geometry top offset: `int screenTop = primary->availableGeometry().y(); int posY = screenTop + vOffset;`. This prevents the overlay from overlapping native panels on desktop environments that reserve top screen struts (like GNOME or KDE panels).
  - In `DisplaySurfaceManager::checkFullscreen()`, retain the existing non-intrusive Hyprland/Sway/xprop checks; fail closed (no fullscreen suppression) when running under unprivileged Wayland environments rather than blocking or crashing.

### 4. Settings & Documentation Alignment
- **File:** `settings-app/qml/Main.qml`
- **Action:**
  - Update any description text mentioning GNOME Shell extension dynamic mode to state that the Qt6 overlay is the universal display engine.
- **File:** `README.md`
- **Action:**
  - Update Architecture overview to document `linux-island-ui` (Qt6 / QML) as the universal cross-DE overlay engine, noting the GNOME extension is superseded by the unified Qt6 UI.

## Critical files & anchors
- `packaging/bin/linux-island-launch`: Line 116 (`ensure_core` and DE branching logic). Eliminates extension branching.
- `packaging/dev/install-local.sh`: Line 82 (GNOME extension install). Switches install focus to `linux-island-ui.service`.
- `packaging/systemd-user/linux-island-ui.service`: Line 7 (`[Service]` section). Adds Wayland/XCB Qt environment variables.
- `island-ui/display_surface_manager.cpp`: Line 33 (`updateWindowPosition`). Positions relative to `availableGeometry()` for panel clearance.

## Verification
1. **Launcher parity across DEs:**
   - Run: `XDG_CURRENT_DESKTOP=ubuntu:GNOME packaging/bin/linux-island-launch --status`
   - Expected output: contains `UI Engine: Standalone Qt6 QML Overlay (linux-island-ui)`.
   - Run: `XDG_CURRENT_DESKTOP=KDE packaging/bin/linux-island-launch --status`
   - Expected output: contains `UI Engine: Standalone Qt6 QML Overlay (linux-island-ui)`.
2. **Smoke test validation:**
   - Run: `packaging/bin/linux-island-launch --smoke-test`
   - Expected output: `PASS: linux-island-ui smoke check` with exit code 0.
3. **Core test suite regression check:**
   - Run: `ctest --test-dir build/dev --output-on-failure`
   - Expected output: 12/12 tests pass.
4. **Installer dry-run validation:**
   - Execute install script in dev mode and verify `linux-island-ui.service` is enabled and no extension conflict exists.

## Assumptions & contingencies
- **Assumption:** The host has Qt6 Wayland libraries installed (`qt6-wayland` / `libqt6gui6`).
  - *Fallback:* If Wayland initialization fails on a specific compositor, `QT_QPA_PLATFORM=wayland;xcb` automatically falls back to XCB / XWayland.
- **Assumption:** User wants the exact layout shown in the photos (the segmented tabs `Music`, `System`, `AI Quota`, 3 system cards, 4 quick toggles).
  - *Fallback:* `island-ui/qml` already contains this full layout; standardizing on it avoids rewriting or duplicating the complex QML carousel inside GJS.
