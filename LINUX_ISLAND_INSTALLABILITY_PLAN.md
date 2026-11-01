# Cross-distro / cross-DE installability for Linux Island

## Context

Today the project has **no install rules at all** (`grep -rn "install(" CMakeLists.txt core island-ui settings-app` → no matches), a launcher that only finds binaries in `build/dev` or `$HOME/.local/libexec`, systemd units hardcoded to `%h/.local`, an extension locked to GNOME `46` and `50`, and a Qt overlay whose Wayland positioning is ignored by every compositor. `packaging/dev/install-local.sh` copies files into `$HOME` and hardcodes `build/dev/...`.

End state: one build produces `linux-island-core`, `linux-island-ui`, `linux-island-settings`, the GNOME extension, desktop entries, AppStream metadata, icons, window-rule snippets, a systemd user unit and CPack packages. It installs via DEB, RPM, Arch `PKGBUILD`, a source tarball, or the per-user script; the extension loads on GNOME 45–50; non-GNOME desktops run the overlay through XWayland with optional window rules. MIT licensed.

Confirmed environment facts used below: Ubuntu 26.04 host, Qt 6.10.2, GNOME 50.1 Wayland, CMake 4.2.3, `dpkg-deb` present, `rpmbuild`/`makepkg` absent, Docker daemon not running, `xvfb-run` present. Ubuntu 24.04 ships Qt 6.4.2, so 6.4 is the minimum. `St.BoxLayout:vertical` still exists in GNOME 50 (deprecated, not removed) and `St.BoxLayout:orientation` does not exist in 45–47 — therefore **do not migrate `vertical:`**.

## Approach

### Phase 1 — Legal and desktop assets

1. Create `LICENSE` at repo root with the standard MIT text and line `Copyright (c) 2026 Linux Island contributors`.
2. Create `packaging/icons/io.github.linuxisland.svg`, 128×128 `viewBox`, containing exactly:
   `<rect x="8" y="40" width="112" height="48" rx="24" fill="#191816"/>`
   `<circle cx="36" cy="64" r="10" fill="#D8B77F"/>`
   `<rect x="56" y="58" width="48" height="12" rx="6" fill="#F4F0E9"/>`
   (colors are `design-system/tokens/tokens.json` graphite-900, amber-300, cream-100).
3. Create `packaging/metainfo/io.github.linuxisland.metainfo.xml` with this exact validated content: `component type="desktop-application"`, `id io.github.linuxisland`, `metadata_license MIT`, `project_license MIT`, name `Linux Island`, summary `Dynamic Island-style status capsule for Linux desktops`, two-paragraph description, `launchable type="desktop-id"` = `linux-island.desktop`, `provides` binaries `linux-island-ui` and `linux-island-settings`, category `Utility`, homepage `https://github.com/farzah14/linux-island`, developer id `io.github.linuxisland`, `content_rating type="oars-1.1"`, one screenshot pointing at `https://raw.githubusercontent.com/farzah14/linux-island/main/design-system/previews/Linux_Island_Warm_Minimalist_Preview.png` (URL returns HTTP 200), release `0.1.0` dated `2026-11-01`.
4. Rewrite `packaging/desktop/linux-island.desktop`:
   `Type=Application`, `Name=Linux Island`, `Comment=Launch the Linux Island overlay`, `Exec=linux-island-launch --standalone`, `TryExec=linux-island-launch`, `Icon=io.github.linuxisland`, `Terminal=false`, `Categories=Utility;`, `Keywords=island;capsule;notch;media;overlay;`, `StartupWMClass=linux-island-ui`.
5. Rewrite `packaging/desktop/linux-island-settings.desktop`: same fields but `Name=Linux Island Settings`, `Comment=Configure Linux Island appearance, offsets and media`, `Exec=linux-island-settings`, `TryExec=linux-island-settings`, `Categories=Settings;`, `StartupWMClass=linux-island-settings`.
6. Rewrite `packaging/autostart/linux-island.desktop`: `Exec=linux-island-launch --autostart`, `TryExec=linux-island-launch`, `Icon=io.github.linuxisland`, `X-GNOME-Autostart-enabled=true`, `X-systemd-skip=true` (systemd's XDG autostart generator documents that this suppresses unit generation), `StartupWMClass=linux-island-ui`, `Categories=Utility;`.
7. Create `packaging/window-rules/kwin-linux-island.kwinrule`:
   section `[linux-island-overlay]`, `Description=Linux Island overlay`, `above=true`, `aboverule=2`, `noborder=true`, `noborderrule=2`, `skiptaskbar=true`, `skiptaskbarrule=2`, `skippager=true`, `skippagerrule=2`, `skipswitcher=true`, `skipswitcherrule=2`, `wmclass=linux-island-ui`, `wmclassmatch=1`. Do **not** set `position`/`positionrule`; KWin honors the client's requested geometry by default.
8. Create `packaging/window-rules/hyprland.conf`:
   `windowrulev2 = float,class:^(linux-island-ui)$`
   `windowrulev2 = pin,class:^(linux-island-ui)$`
   `windowrulev2 = noborder,class:^(linux-island-ui)$`
   `windowrulev2 = noanim,class:^(linux-island-ui)$`
   `windowrulev2 = noinitialfocus,class:^(linux-island-ui)$`
9. Create `packaging/window-rules/sway.conf` (matches both native Wayland `xdg-shell` `app_id` and XWayland `xcb` X11 `class`):
   `for_window [app_id="linux-island-ui"] floating enable, sticky enable, border none`
   `for_window [class="(?i)linux-island-ui"] floating enable, sticky enable, border none`

### Phase 2 — CMake install, versioning and CPack

10. Replace root `CMakeLists.txt` with:
    - `cmake_minimum_required(VERSION 3.22)`, `project(LinuxIsland VERSION 0.1.0 LANGUAGES CXX)`, C++20.
    - `include(GNUInstallDirs)`, `include(CTest)`.
    - `find_package(Qt6 6.4 REQUIRED COMPONENTS Core DBus Network Quick Qml Sql WebEngineQuick WebEngineCore)` (adds the previously missing `WebEngineCore`).
    - `find_package(OpenSSL REQUIRED)`, `find_package(Python3 REQUIRED COMPONENTS Interpreter)`.
    - `if(BUILD_TESTING) find_package(Qt6 REQUIRED COMPONENTS Test) add_subdirectory(tests/unit) add_subdirectory(tests/integration) endif()`; `add_subdirectory(core)`, `settings-app`, `island-ui` outside the guard.
    - `install(PROGRAMS packaging/bin/linux-island-launch DESTINATION ${CMAKE_INSTALL_BINDIR})`.
    - `install(FILES packaging/desktop/linux-island.desktop packaging/desktop/linux-island-settings.desktop DESTINATION ${CMAKE_INSTALL_DATADIR}/applications)`.
    - `install(FILES packaging/metainfo/io.github.linuxisland.metainfo.xml DESTINATION ${CMAKE_INSTALL_DATADIR}/metainfo)`.
    - `install(FILES packaging/icons/io.github.linuxisland.svg DESTINATION ${CMAKE_INSTALL_DATADIR}/icons/hicolor/scalable/apps)`.
    - `install(FILES schemas/io.github.linuxisland.Core1.xml DESTINATION ${CMAKE_INSTALL_DATADIR}/dbus-1/interfaces)`.
    - `install(FILES LICENSE DESTINATION ${CMAKE_INSTALL_DATADIR}/licenses/linux-island)`.
    - `install(FILES packaging/autostart/linux-island.desktop DESTINATION ${CMAKE_INSTALL_DATADIR}/linux-island RENAME linux-island-autostart.desktop)`.
    - `install(DIRECTORY packaging/window-rules/ DESTINATION ${CMAKE_INSTALL_DATADIR}/linux-island/window-rules)`.
    - `install(DIRECTORY extension/ DESTINATION ${CMAKE_INSTALL_DATADIR}/gnome-shell/extensions/linux-island@local)`.
    - One `install(CODE "...")` block that, at install time, sets `ISLAND_LIBEXECDIR` to `${CMAKE_INSTALL_PREFIX}/${CMAKE_INSTALL_LIBEXECDIR}`, `configure_file`s `packaging/systemd-user/linux-island-core.service.in` to `linux-island-core.service` with `@ISLAND_LIBEXECDIR@`, and `file(INSTALL ...)`s it to `${CMAKE_INSTALL_PREFIX}/lib/systemd/user` and to `${CMAKE_INSTALL_PREFIX}/${CMAKE_INSTALL_DATADIR}/linux-island` as `linux-island-core.service`. Use escaped `\${CMAKE_INSTALL_PREFIX}` so `cmake --install --prefix` and `DESTDIR` both work (verified).
    - CPack block, before `include(CPack)`: `CPACK_PACKAGE_NAME linux-island`, `CPACK_PACKAGE_VENDOR "Linux Island contributors"`, `CPACK_PACKAGE_CONTACT "farzahwalker46@gmail.com"`, `CPACK_PACKAGE_DESCRIPTION_SUMMARY "Dynamic Island-style status capsule for Linux desktops"`, `CPACK_RESOURCE_FILE_LICENSE "${CMAKE_SOURCE_DIR}/LICENSE"`, `CPACK_GENERATOR "TGZ;DEB;RPM"`, `CPACK_PACKAGING_INSTALL_PREFIX "/usr"`, `CPACK_PACKAGE_FILE_NAME "linux-island-${PROJECT_VERSION}-${CMAKE_SYSTEM_PROCESSOR}"`, `CPACK_DEBIAN_FILE_NAME DEB-DEFAULT`, `CPACK_DEBIAN_PACKAGE_MAINTAINER "farzahwalker46@gmail.com"`, `CPACK_DEBIAN_PACKAGE_SECTION utils`, `CPACK_DEBIAN_PACKAGE_SHLIBDEPS ON`, `CPACK_DEBIAN_PACKAGE_DEPENDS "qml6-module-qtquick, qml6-module-qtquick-window, qml6-module-qtquick-layouts, qml6-module-qtquick-controls, qml6-module-qtquick-templates, qml6-module-qtqml-workerscript, qml6-module-qtwebengine, qml6-module-qtwebchannel, qml6-module-qtwebengine-controlsdelegates, libqt6sql6-sqlite"`, `CPACK_DEBIAN_PACKAGE_RECOMMENDS "gnome-shell (>= 45), pipewire, wireplumber, libxcb-cursor0, x11-utils"`, `CPACK_RPM_PACKAGE_LICENSE MIT`, `CPACK_RPM_PACKAGE_REQUIRES "qt6-qtbase, qt6-qtbase-gui, qt6-qtdeclarative, qt6-qtwebengine, qt6-qtwebchannel, qt6-qtpositioning, openssl-libs, xorg-x11-utils"`.
    CPack appends `dpkg-shlibdeps` output to `CPACK_DEBIAN_PACKAGE_DEPENDS` (verified in `CPackDeb.cmake` lines 596–597), so linked Qt libraries need no manual listing.
11. Add `target_compile_definitions(<target> PRIVATE ISLAND_VERSION="${PROJECT_VERSION}")` and `install(TARGETS ...)`:
    - `core/CMakeLists.txt`: `linux-island-core` → `${CMAKE_INSTALL_LIBEXECDIR}`.
    - `island-ui/CMakeLists.txt`: `linux-island-ui` → `${CMAKE_INSTALL_LIBEXECDIR}`.
    - `settings-app/CMakeLists.txt`: `linux-island-settings` → `${CMAKE_INSTALL_BINDIR}`.
12. Add `--version` to all three binaries. In each `main`, before constructing the application object, scan `argv` for `--version` and `std::printf("<binary-name> %s\n", ISLAND_VERSION)` then return 0 (`<cstdio>` in C++ files). In `island-ui/main.cpp` this must run before `QtWebEngineQuick::initialize()`.
13. Rename `packaging/systemd-user/linux-island-core.service` to `linux-island-core.service.in` with `ExecStart=@ISLAND_LIBEXECDIR@/linux-island-core`; delete `packaging/systemd-user/linux-island-ui.service` (its `Type=simple` process exits on GNOME by design and it duplicates XDG autostart). Keep `PartOf=`/`WantedBy=graphical-session.target` and `Type=dbus` unchanged.
14. In `island-ui/main.cpp` and `settings-app/main.cpp`, call `QGuiApplication::setDesktopFileName(...)` (`linux-island` and `linux-island-settings`) and, in `island-ui/main.cpp` only, `qputenv("RESOURCE_NAME", "linux-island-ui")` before constructing the application so X11 `WM_CLASS` instance is exactly `linux-island-ui` (verified Qt XCB derives instance from `RESOURCE_NAME`/argv0 and class from `applicationName`).
15. In `settings-app/main.cpp`, replace the hardcoded `qrc:/linuxisland/settings/qml/Main.qml` with the same two-step `QFile::exists` fallback used by `island-ui/main.cpp`: try `qrc:/qt/qml/linuxisland/settings/qml/Main.qml`, else `qrc:/linuxisland/settings/qml/Main.qml`.
16. Add a session-bus watchdog in `core/app/main.cpp`: a `QTimer` firing every 5000 ms that calls `qApp->quit()` when `QDBusConnection::sessionBus().isConnected()` is false. This lets a launcher-spawned Core exit after logout on systems without systemd user services.

### Phase 3 — Portable launcher

17. Rewrite `packaging/bin/linux-island-launch` with these exact behaviors:
    - `ISLAND_VERSION="0.1.0"`; `--version` prints `linux-island-launch 0.1.0`.
    - Binary resolution for `linux-island-core`/`linux-island-ui`: `$ISLAND_LIBEXECDIR`, then `$(cd "$SCRIPT_DIR/.." && pwd)/libexec`, then `$HOME/.local/libexec`, `/usr/libexec`, `/usr/local/libexec`, `/app/libexec`, then `command -v`. Settings: `$SCRIPT_DIR/linux-island-settings`, `$(dirname "$SCRIPT_DIR")/bin/...`, then `command -v`. Repo build-tree fallback only when `$SCRIPT_DIR/../../build/dev/core/linux-island-core` exists.
    - `displayMode` read from `${XDG_CONFIG_HOME:-$HOME/.config}/linux-island/settings.json` with shell only (no `python3`): `grep -o '"displayMode"[[:space:]]*:[[:space:]]*"[^"]*"' | sed 's/.*"\([^"]*\)"$/\1/'`, default `dynamic`.
    - `--print-config` prints exactly these `key=value` lines and exits 0 **before** any core start, extension toggle, lock or exec: `de=`, `session=`, `display_mode=`, `mode=` (`extension` or `overlay`), `platform=` (`xcb`, `wayland` or `default`), `core=`, `ui=`, `settings=`.
    - `--status` prints the same values plus `core_running=yes|no`, `autostart=yes|no`, and exits 0.
    - Routing: companion/smoke args → `overlay`; GNOME (`XDG_CURRENT_DESKTOP` contains `gnome`, case-insensitive) with `display_mode=dynamic` and no `--standalone` → `extension`; everything else → `overlay`.
    - Platform: `XDG_SESSION_TYPE=wayland` and `ISLAND_NATIVE_WAYLAND=1` → `wayland`; `XDG_SESSION_TYPE=wayland` and non-empty `DISPLAY` → `xcb`; `XDG_SESSION_TYPE=wayland` without `DISPLAY` → `wayland`; otherwise `default`. In overlay mode export `QT_QPA_PLATFORM` only when the value is not `default`.
    - `extension` mode: `gnome-extensions enable linux-island@local` when the command exists, else print a warning and continue in overlay mode; `pkill -x linux-island-ui` to stop a stale overlay; exit 0 for `--autostart`/`--systemd-ui`, otherwise print `Linux Island: GNOME Shell extension enabled for Dynamic Mode.` and exit 0.
    - `overlay` mode on GNOME: `gnome-extensions disable linux-island@local` (ignore failure) before exec.
    - `ensure_core`: skip if owned; start via `systemctl --user start linux-island-core.service` when `systemctl --user cat linux-island-core.service` succeeds (replaces the false-positive `list-unit-files` check), else `nohup "$CORE_BIN" >/dev/null 2>&1 &`; then poll up to 2 s using `gdbus call ... NameHasOwner` or, when `gdbus` is missing, `dbus-send --session --print-reply --dest=org.freedesktop.DBus / org.freedesktop.DBus.NameHasOwner string:io.github.linuxisland.Core | grep -q true`.
    - Single instance: only for overlay without companion/smoke, `flock -n` on `${XDG_RUNTIME_DIR:-/tmp}/linux-island-ui.lock` when `flock` exists. If the lock is held: with `--standalone`, `pkill -x linux-island-ui` then retry once; otherwise print `Linux Island overlay already running.` and exit 0.
    - `--install-autostart` writes `${XDG_CONFIG_HOME:-$HOME/.config}/autostart/linux-island.desktop` with `Exec=<absolute path of this script> --autostart`, copying the other keys from the installed template at `$PREFIX/share/linux-island/linux-island-autostart.desktop` (fallback: `packaging/autostart/linux-island.desktop` in the repo). `--remove-autostart` deletes it. Both exit 0.
    - Never pass `--print-config`, `--status`, `--version`, `--install-autostart`, `--remove-autostart` through to `linux-island-ui`.

### Phase 4 — Installer, uninstaller, tarball, Arch

18. Rewrite `packaging/dev/install-local.sh` to delegate to CMake instead of copying files by hand:
    - Flags: `--build`, `--prefix DIR` (default `$HOME/.local`), `--no-systemd`, `--no-autostart`, `--help`.
    - `--build` runs `cmake --preset dev` and `cmake --build build/dev`; otherwise require `build/dev/CMakeCache.txt` and the three binaries.
    - Run `cmake --install "$ROOT_DIR/build/dev" --prefix "$PREFIX"`.
    - Rewrite absolute `Exec=` in the three installed `.desktop` files to `$PREFIX/bin/linux-island-launch` / `$PREFIX/bin/linux-island-settings` using `sed -i`.
    - Unless `--no-systemd`: copy `$PREFIX/lib/systemd/user/linux-island-core.service` to `${XDG_CONFIG_HOME:-$HOME/.config}/systemd/user/`, delete the staging copy, then `systemctl --user daemon-reload` and `systemctl --user enable --now linux-island-core.service` (ignore failures).
    - Unless `--no-autostart`: call the installed launcher with `--install-autostart`.
    - Build the file manifest: copy `build/dev/install_manifest.txt`, append the unit and autostart paths, remove the deleted staging unit path, write to `${XDG_DATA_HOME:-$HOME/.local/share}/linux-island/installed-files.txt`.
    - If an older manifest exists, delete files listed there but absent from the new manifest before writing it (removes renamed extension modules).
    - Verify every manifest path exists; print `Verified: <n> installed files.` and exit non-zero on mismatch.
19. Rewrite `packaging/dev/uninstall-local.sh`:
    - Flags `--purge-config`, `--no-systemd`, `--help`.
    - Stop/disable `linux-island-core.service` and legacy `linux-island-ui.service` unless `--no-systemd`; `gnome-extensions disable linux-island@local` when available.
    - Read the manifest and `rm -f` each path; then remove these legacy paths unconditionally: `$HOME/.local/libexec/linux-island-{core,ui}`, `$HOME/.local/bin/linux-island-{launch,settings}`, `$HOME/.config/systemd/user/linux-island-{core,ui}.service`, `$HOME/.config/autostart/linux-island.desktop`, `$HOME/.local/share/applications/linux-island{,-settings}.desktop`, `$HOME/.local/share/gnome-shell/extensions/linux-island@local`.
    - `rmdir -p --ignore-fail-on-non-empty` on `${XDG_DATA_HOME:-$HOME/.local/share}/linux-island`, `$PREFIX/lib/systemd/user`, `$PREFIX/share/gnome-shell/extensions`, `$PREFIX/share/applications`, `$PREFIX/share/metainfo`, `$PREFIX/share/icons/hicolor/scalable/apps`.
    - Preserve `${XDG_CONFIG_HOME:-$HOME/.config}/linux-island` unless `--purge-config`.
    - `systemctl --user daemon-reload` unless `--no-systemd`.
20. Create `packaging/tarball/make-source-tarball.sh`: read the version from `project(LinuxIsland VERSION ...)`, write `${1:-build/dist}/linux-island-$VERSION.tar.gz` via `git archive --format=tar.gz --prefix="linux-island-$VERSION/" -o <out> HEAD`, print a warning when `git status --porcelain` is non-empty, and write a sibling `.sha256`.
21. Create `packaging/arch/PKGBUILD` with `pkgname=linux-island`, `pkgver=0.1.0`, `pkgrel=1`, `arch=('x86_64' 'aarch64')`, `url=https://github.com/farzah14/linux-island`, `license=('MIT')`, `depends=('qt6-base' 'qt6-declarative' 'qt6-webengine' 'qt6-webchannel' 'qt6-positioning' 'openssl' 'libxcb' 'xcb-util-cursor')`, `makedepends=('cmake' 'ninja' 'git')`, `optdepends=('python: AI quota and cookie-import helpers' 'gnome-shell: native GNOME extension' 'xorg-xprop: X11 and XWayland fullscreen detection')`, `source=("linux-island-$pkgver.tar.gz")`, `sha256sums=('SKIP')`; `build()` configures with `-DCMAKE_INSTALL_PREFIX=/usr -DBUILD_TESTING=OFF`; `package()` runs `DESTDIR="$pkgdir" cmake --install build`.
22. Create `packaging/ci/build-rpm.sh`: when `rpmbuild` exists, run `cmake -S . -B build/rpm -G Ninja -DCMAKE_BUILD_TYPE=Release -DBUILD_TESTING=OFF -DCMAKE_INSTALL_PREFIX=/usr && cmake --build build/rpm && (cd build/rpm && cpack -G RPM)`; otherwise print `SKIP: rpmbuild not installed` and exit 0.

### Phase 5 — GNOME Shell 45–50

23. Set `extension/metadata.json` `shell-version` to exactly `["45","46","47","48","49","50"]`.
24. Update `tests/integration/test_stage_metadata.py::test_repo_metadata_not_modified` to expect that exact list. `tests/integration/test_m0_scaffold.py` keeps passing because it only asserts `'46' in`.
25. Update `scripts/dev/dev-reload.sh` staged loader metadata (currently `["46", "48", "49", "50"]`) to `["45", "46", "47", "48", "49", "50"]`.
26. In `extension/lib/notificationAdapter.js`, make the `notification-removed` subscription conditional, because GNOME 45's `Source` class defines only `destroy`, `icon-updated`, `notification-added`, `notification-show`:
    ```
    let onRemovedId = null;
    try {
        onRemovedId = source.connect('notification-removed', (_src, notif) => { /* existing body */ });
    } catch (_) {
        onRemovedId = null;
    }
    signalIds.push(onAddedId, onDestroyId);
    if (onRemovedId !== null)
        signalIds.push(onRemovedId);
    ```
    Keep the existing `_untrackSource`/`destroy` loops unchanged; they already tolerate arbitrary IDs.
27. In `extension/prefs.js`, add `import GLib from 'gi://GLib';` and replace both `Gio.Subprocess.new(['linux-island-settings'], ...)` calls with a local `openSettings()` that tries `GLib.find_program_in_path('linux-island-settings')` and then `${GLib.get_home_dir()}/.local/bin/linux-island-settings`, swallowing failures.
28. In `extension/ui/mediaView.js` and `extension/ui/quickToggle.js`, replace the bare `Gio.Subprocess.new(['linux-island-settings'])` attempt with `GLib.find_program_in_path('linux-island-settings')` first, then the existing `~/.local/bin` fallback.
29. In `extension/ui/mediaView.js` `_openSearch`, extend the companion candidate list with `/usr/libexec/linux-island-ui` and `/app/libexec/linux-island-ui` (keep `$HOME/.local/libexec/linux-island-ui`, `linux-island-ui`, `linux-island-launch`).
30. In `extension/lib/gnomeDisplayAdapter.js` constructor, resolve the workspace manager as `options.workspaceManager ?? global.workspace_manager ?? global.display?.get_workspace_manager?.()`.
31. Do **not** change any `vertical:` property in `extension/ui/*.js` (23 sites). Verified: `PROP_VERTICAL` exists in GNOME 45, 46, 47, 48, 49 and 50 source; `PROP_ORIENTATION` appears only from 48, so an `orientation:` migration would throw on 45–47.
32. Add `tests/extension/notification-adapter.test.js`: construct `NotificationAdapter` with a fake `messageTray` whose `connect(name, fn)` throws `Error('no such signal')` for `notification-removed` and returns incrementing IDs otherwise; assert construction does not throw, that `notification-added` and `destroy` were subscribed, and that `notification-removed` was not. Run under both `node` and `gjs -m`.

### Phase 6 — Overlay behavior on X11/XWayland

33. In `island-ui/display_surface_manager.h` and `island-ui/display_surface_manager.cpp` (`updateInputMask` and `attachWindow`), track `int m_currentMaskRadius = 0;` alongside `m_currentMaskRect` so radius changes (`17` ↔ `20`) are not skipped by `if (m_currentMaskRect == targetRect && m_currentMaskRadius == radius && m_window) return;`. When `radius > 0` and `QGuiApplication::platformName().startsWith("xcb")`, build the mask from a rounded rectangle instead of ignoring the radius (and re-apply via `updateInputMask` in `attachWindow()` rather than overwriting with a plain `QRegion::Rectangle`):
    `QPainterPath path; path.addRoundedRect(QRectF(targetRect), radius, radius); QRegion region(path.toFillPolygon().toPolygon()); m_window->setMask(region);`
    Keep the existing plain `QRegion(targetRect, QRegion::Rectangle)` for Wayland (Qt maps it to `wl_surface.set_input_region`) and for `radius <= 0`. Add `#include <QPainterPath>`.
34. In `updateWindowPosition`, split move from resize: always `m_window->resize(windowWidth(), windowHeight())`; call `setGeometry(posX, posY, ...)` only when the platform is not Wayland. On Wayland log once via `qInfo()` that compositor placement is in effect. This keeps X11 and XWayland positioning while avoiding a silently ignored call on native Wayland.
35. In `island-ui/qml/IslandWindow.qml`, keep the existing `width`/`height`/`x`/`y` bindings; no change (the C++ side now owns the platform decision).
36. Create `docs/desktop-environments.md` with this matrix and no other claims:
    | Session | Path | Status |
    | GNOME 45–50, dynamic, Wayland or X11 | Shell extension | Supported; runtime acceptance still requires a disposable GNOME 45/46/47/48/49 session |
    | GNOME, floating/integrated | Qt overlay via XWayland | Experimental; Mutter may ignore top-center placement |
    | KDE Plasma 6 Wayland | Qt overlay via XWayland + optional `kwin-linux-island.kwinrule` | Supported with the rule for above/skip-taskbar; position relies on KWin honoring requested geometry |
    | KDE Plasma X11, XFCE, Cinnamon, MATE, i3, bspwm | Qt overlay | Supported, no rules needed |
    | Sway / Hyprland Wayland | Qt overlay via XWayland + `sway.conf` / `hyprland.conf` | Experimental; top-center position is not guaranteed by the compositor |
    | Wayland session with no `DISPLAY` (no XWayland) | Qt overlay native | Unsupported: no top-center pinning, no input shaping |
    Document rule installation: KWin `System Settings → Window Management → Window Rules → Import`; Hyprland `source = /usr/share/linux-island/window-rules/hyprland.conf`; Sway `include /usr/share/linux-island/window-rules/sway.conf`.
37. Create `docs/packaging.md` documenting: DEB (`cd build/dev && cpack -G DEB`), RPM (`packaging/ci/build-rpm.sh`), TGZ (`cpack -G TGZ`), Arch (`packaging/tarball/make-source-tarball.sh` then `cd packaging/arch && makepkg -si`), per-user (`bash packaging/dev/install-local.sh --build`), system (`sudo cmake --install build/dev --prefix /usr`), and `-DBUILD_TESTING=OFF`.

### Phase 7 — Tests and documentation

38. Add `tests/integration/test_packaging.py` accepting `--build-dir`, performing:
    - `cmake --install <build-dir> --prefix <tmp>/prefix`; assert `<tmp>/prefix/bin/linux-island-launch`, `.../bin/linux-island-settings`, `.../libexec/linux-island-{core,ui}`, `.../share/gnome-shell/extensions/linux-island@local/metadata.json`, `.../share/applications/linux-island.desktop`, `.../share/applications/linux-island-settings.desktop`, `.../share/metainfo/io.github.linuxisland.metainfo.xml`, `.../share/icons/hicolor/scalable/apps/io.github.linuxisland.svg`, `.../share/dbus-1/interfaces/io.github.linuxisland.Core1.xml`, `.../share/licenses/linux-island/LICENSE`, `.../share/linux-island/window-rules/{kwin-linux-island.kwinrule,hyprland.conf,sway.conf}`.
    - Assert `.../lib/systemd/user/linux-island-core.service` exists, its `ExecStart=` equals `<tmp>/prefix/libexec/linux-island-core`, and no `linux-island-ui.service` is installed.
    - Assert `metadata.json` `shell-version == ["45","46","47","48","49","50"]`.
    - Assert `packaging/bin/linux-island-launch` contains `ISLAND_VERSION="0.1.0"` and the root `CMakeLists.txt` `project(... VERSION 0.1.0 ...)` matches.
    - Run `desktop-file-validate` on all three desktop files and `appstreamcli validate --no-net` on the metainfo when those tools exist; otherwise print `SKIP`.
    - Run `cpack -G TGZ -B <tmp>/tgz` and assert one `.tar.gz`; run `cpack -G DEB -B <tmp>/deb` when `dpkg-deb` exists and assert `dpkg-deb -f` `Depends` contains `qml6-module-qtwebengine`; print `SKIP` for RPM when `rpmbuild` is absent.
39. Add `tests/integration/test_launcher.py`: copy `packaging/bin/linux-island-launch` to `<tmp>/prefix/bin/`, write stub executables `<tmp>/prefix/libexec/linux-island-core` (prints `core 0.1.0`), `<tmp>/prefix/libexec/linux-island-ui` (prints `ui "$@"`), `<tmp>/prefix/bin/linux-island-settings`; run with `HOME`, `XDG_CONFIG_HOME`, `XDG_RUNTIME_DIR` under the temp dir. Assert:
    - `--version` → `linux-island-launch 0.1.0`.
    - `XDG_CURRENT_DESKTOP=GNOME XDG_SESSION_TYPE=wayland DISPLAY=:0` + `--print-config` → `mode=extension`, `platform=xcb`.
    - same plus `--standalone` → `mode=overlay`, `platform=xcb`.
    - `XDG_CURRENT_DESKTOP=KDE XDG_SESSION_TYPE=wayland DISPLAY=:0` → `mode=overlay`, `platform=xcb`.
    - same plus `ISLAND_NATIVE_WAYLAND=1` → `platform=wayland`.
    - `XDG_SESSION_TYPE=wayland` with `DISPLAY` unset → `platform=wayland`.
    - `XDG_SESSION_TYPE=x11` → `platform=default`.
    - Remove the UI stub and run `--standalone` → exit 1 and stderr contains `linux-island-ui binary not found`.
40. Add `tests/integration/test_local_install.py`: with `HOME=<tmp>/home`, `XDG_CONFIG_HOME=<tmp>/home/.config`, `XDG_DATA_HOME=<tmp>/home/.local/share`, `XDG_RUNTIME_DIR=<tmp>/runtime`, run `bash packaging/dev/install-local.sh --no-systemd --no-autostart`; assert the manifest exists and lists `bin/linux-island-launch`, `libexec/linux-island-ui`, `share/applications/linux-island.desktop`; run `bash packaging/dev/uninstall-local.sh --no-systemd`; assert all manifest paths are gone and `${XDG_CONFIG_HOME}/linux-island` is preserved. Skip with exit 0 when `build/dev/CMakeCache.txt` is absent.
41. Update `tests/integration/test_session_service.py` to read `packaging/systemd-user/linux-island-core.service.in`, assert `ExecStart=@ISLAND_LIBEXECDIR@/linux-island-core`, keep the existing `WantedBy`/`PartOf`/`BusName`/`Type` assertions, and assert `packaging/systemd-user/linux-island-ui.service` does not exist.
42. Wire new tests in `tests/integration/CMakeLists.txt`: `packaging-install` (Python, `--build-dir ${CMAKE_BINARY_DIR}`), `launcher-routing`, `local-install`; add `extension-notification-adapter` when `find_program(NODE_EXECUTABLE node)` succeeds.
43. Update docs: `README.md` build requirements (Qt ≥ 6.4; Debian/Ubuntu, Fedora, Arch package names), install section (DEB/RPM/Arch/local/tarball), supported-DE table link, MIT license. `docs/testing.md` install section (manifest, `--no-systemd`, `--no-autostart`, no UI unit). `docs/compatibility.md` add a `## Distribution and desktop-environment support` section linking `docs/desktop-environments.md` and listing GNOME 45–50. `docs/release-checklist.md` section 4 replace “GNOME Shell on Wayland only” with the matrix and remove “X11, KDE, XFCE, wlroots out of scope”. `AGENTS.md` product fact 1 becomes “GNOME 45–50 Wayland is the primary target; other desktops use the Qt overlay via XWayland”.
44. Update `.gitignore` with `/build/dist/`, `*.deb`, `*.rpm`, `*.tar.gz`, `packaging/arch/pkg/`, `packaging/arch/src/`.

## Critical files & anchors

- `CMakeLists.txt` — entire file; install rules, CPack, `BUILD_TESTING` gate, `WebEngineCore` component.
- `packaging/bin/linux-island-launch` — entire file; path resolution, `--print-config`, XWayland selection, lock, `systemctl cat` check.
- `packaging/dev/install-local.sh` — entire file; `cmake --install` delegation, manifest, autostart rewrite.
- `extension/lib/notificationAdapter.js` — `_trackSource` (`source.connect('notification-removed', ...)`, currently lines 158–174).
- `island-ui/display_surface_manager.cpp` / `.h` — `attachWindow` (lines 27–42), `updateWindowPosition` (lines 48–62), and `updateInputMask` (lines 64–78).

## Verification

Run from the repo root unless stated. Every phase must leave the tree building.

1. Build and existing tests:
   `cmake --preset dev && cmake --build build/dev && ctest --test-dir build/dev --output-on-failure`
   Expected: configure succeeds with Qt ≥ 6.4; all pre-existing tests pass; new `packaging-install`, `launcher-routing`, `local-install`, `extension-notification-adapter` pass.
2. Staged install layout:
   `rm -rf /tmp/island-stage && DESTDIR=/tmp/island-stage cmake --install build/dev --prefix /usr`
   Expected: all paths asserted in `test_packaging.py` exist; `cat /tmp/island-stage/usr/lib/systemd/user/linux-island-core.service` shows `ExecStart=/usr/libexec/linux-island-core`; `ls /tmp/island-stage/usr/lib/systemd/user` shows no `linux-island-ui.service`.
3. Desktop/AppStream:
   `desktop-file-validate packaging/desktop/*.desktop packaging/autostart/*.desktop` → exit 0, no output.
   `appstreamcli validate --no-net packaging/metainfo/io.github.linuxisland.metainfo.xml` → `✔ Validation was successful.`
4. Packages:
   `cd build/dev && cpack -G TGZ -B /tmp/island-pkg && cpack -G DEB -B /tmp/island-pkg`
   Expected: `linux-island-0.1.0-<arch>.tar.gz` and `linux-island_0.1.0_amd64.deb`; `dpkg-deb -f /tmp/island-pkg/*.deb Depends` contains `qml6-module-qtwebengine` and the shlib-derived `libqt6webenginequick6`.
   `bash packaging/ci/build-rpm.sh` → builds when `rpmbuild` exists, otherwise prints `SKIP: rpmbuild not installed` and exits 0.
   `bash -n packaging/arch/PKGBUILD` → exit 0.
5. Launcher behavior (new behavior proof):
   `python3 tests/integration/test_launcher.py` → prints `PASS: launcher routing` and `PASS: launcher version`.
   Manual spot check: `XDG_CURRENT_DESKTOP=KDE XDG_SESSION_TYPE=wayland DISPLAY=:0 packaging/bin/linux-island-launch --print-config` → `mode=overlay` and `platform=xcb`.
6. Per-user install/uninstall:
   `HOME=/tmp/island-home XDG_CONFIG_HOME=/tmp/island-home/.config XDG_DATA_HOME=/tmp/island-home/.local/share XDG_RUNTIME_DIR=/tmp/island-rt bash packaging/dev/install-local.sh --no-systemd --no-autostart`
   Expected: `Verified: <n> installed files.`; `/tmp/island-home/.local/bin/linux-island-launch` exists; `/tmp/island-home/.local/share/linux-island/installed-files.txt` lists it.
   `HOME=/tmp/island-home XDG_CONFIG_HOME=/tmp/island-home/.config XDG_DATA_HOME=/tmp/island-home/.local/share bash packaging/dev/uninstall-local.sh --no-systemd`
   Expected: manifest paths gone, `/tmp/island-home/.config/linux-island` still present.
7. Extension logic:
   `node tests/extension/notification-adapter.test.js && gjs -m tests/extension/notification-adapter.test.js` → both print `PASS`.
   `python3 tests/integration/test_stage_metadata.py && python3 tests/integration/test_m0_scaffold.py` → `PASS`.
   `for f in tests/extension/*.test.js; do node "$f" || exit 1; done` → all pass (23 `vertical:` assertions unchanged).
8. Overlay smoke on X11/XWayland path:
   `xvfb-run -a env QT_QPA_PLATFORM=xcb QTWEBENGINE_CHROMIUM_FLAGS="--disable-gpu --no-sandbox" build/dev/island-ui/linux-island-ui --smoke-test` → `PASS: linux-island-ui smoke check`, exit 0 (verified today on the current tree).
   `build/dev/island-ui/linux-island-ui --version` → `linux-island-ui 0.1.0`; same for core and settings.
9. GNOME 45–50 runtime acceptance: **not runnable on this host**. Per `AGENTS.md`, record `BLOCKED: no disposable GNOME 45/46/47/48/49 session` in `docs/compatibility.md`; do not claim runtime PASS.

## Assumptions & contingencies

- Ubuntu 24.04's Qt 6.4.2 is the floor. If a build hits a Qt API newer than 6.4, guard it with `QT_VERSION_CHECK` rather than raising the minimum; the only known case (`QWebEngineClientHints`, Qt 6.8) is already guarded in `CompanionWindow.qml`.
- RPM verification cannot run on this host (`rpmbuild` missing, Docker daemon down). `packaging/ci/build-rpm.sh` must skip with exit 0; do not fake a PASS.
- Arch `makepkg` is absent. Only `bash -n packaging/arch/PKGBUILD` is required here; a real `makepkg` run is an Arch-host follow-up.
- If `flock` is missing, skip single-instance locking rather than failing the launch.
- If `gnome-extensions` is missing on a GNOME session, fall back to the overlay and print a warning instead of exiting.
- If a Wayland session has no `DISPLAY` (no XWayland), run native Wayland, print a warning that top-center placement and input shaping are unavailable, and keep the process running.
- If KWin ignores requested geometry on a given Plasma version, the shipped `.kwinrule` can be extended by the user with a `position=`/`positionrule=2` pair; the plan does not guess absolute coordinates.
- KWin/Hyprland/Sway rules are optional refinements; the overlay must still start and remain usable without them.
- The D-Bus Core1 schema is untouched; no signature changes.
- This hybrid architecture (GNOME Shell extension on GNOME 45–50 Dynamic Mode + `linux-island-ui` Qt6 overlay via XWayland on KDE/XFCE/tiling WMs and Floating/Standalone modes) supersedes `QT6_OVERLAY_STANDARDIZATION_PLAN.md`, because Mutter does not allow XWayland or `xdg_toplevel` windows to reserve or cleanly overlay the GNOME top panel.
