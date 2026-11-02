# Linux Island (v0.1)

A Dynamic Island-inspired interface for Linux desktops, built for GNOME on Wayland with C++20, Qt 6, and GJS.

## Approved Architecture

- **GNOME Shell Extension (GJS):** Owns capsule UI, animations, interaction states (`HIDDEN`, `COMPACT`, `PREVIEW`, `EXPANDED`, `PEEK`), and media cards.
- **C++20 / Qt 6 Core Service:** Owns MPRIS player discovery, metadata normalization, validated settings persistence, and session bus IPC.
- **D-Bus Session Bus (`io.github.linuxisland.Core1`):** Frozen, type-safe IPC interface linking the Core daemon, GNOME Shell Extension, and Settings client.
- **Qt Quick / QML Settings Application:** Independent preferences application (`linux-island-settings`) with live bidirectional synchronization.
- **Warm Minimalist Design System:** Canonical tokens (`design-system/tokens/tokens.json`) using graphite, cream, and warm amber palette.

---

## Build & Test Instructions

### 1. Build Requirements
- Linux with a C++20 compiler (GCC 12+ or Clang 15+)
- CMake 3.22+ and Ninja
- **Qt 6.4 or newer** (Core, DBus, Gui, Qml, Quick, Sql, Test)
- **Qt 6 WebEngine** (`Qt6WebEngineQuick`, `Qt6WebEngineCore`) — required by the
  embedded search companion and the cookie importer; the build fails at
  configure time without it
- **Qt 6 Sql** (`Qt6Sql`) — reads the copied Chromium cookie database
- **OpenSSL development headers** — AES-128-CBC cookie decryption
- GJS (GNOME JavaScript)
- Node.js (for offline pure logic tests)
- Python 3

Package names:

| Distribution | Install |
|---|---|
| Debian / Ubuntu | `sudo apt install qt6-webengine-dev qt6-base-dev libssl-dev` |
| Fedora | `sudo dnf install qt6-qtbase-devel qt6-qtdeclarative-devel qt6-qtwebengine-devel qt6-qtwebchannel-devel openssl-devel` |
| Arch | `sudo pacman -S qt6-base qt6-declarative qt6-webengine qt6-webchannel openssl` |

The build requires no other network access. Cookie import additionally needs an
unlocked Secret Service keyring at runtime (GNOME Keyring or KWallet); it is
optional and can be disabled with `ISLAND_NO_COOKIE_IMPORT=1`.

### 2. Configure & Build
```bash
cmake --preset dev
cmake --build build/dev
```

### 3. Run Automated Tests
```bash
# CTest suite (C++/Qt unit + integration tests)
ctest --test-dir build/dev --output-on-failure

# JavaScript logic and reducer tests
node tests/extension/state-machine.test.js
node tests/extension/display-policy.test.js
node tests/extension/island-controller.test.js
node tests/extension/core-proxy.test.js
node tests/extension/media-view.test.js
node tests/extension/controller.test.js
node tests/extension/search-engines.test.js

# Design system and scaffold verification
python3 scripts/dev/verify-kit.py
python3 design-system/qa/verify_tokens.py
```

The `companion-persistence` CTest launches the real companion twice against a
loopback server and asserts the second launch's first request already carries
the cookie set by the first. It skips (exit 0) when the UI binary is missing or
headless WebEngine is unavailable.

### 4. Embedded search and account sessions

The Search tab opens a Qt WebEngine companion. Its profile lives under
`~/.local/share/linux-island/webengine` and `~/.cache/linux-island/webengine`,
so a session that is signed in once survives later launches. On startup the
companion imports only Google/YouTube cookies from the default Chromium-family
browser (Brave, Chrome, Chromium, Edge) using the Secret Service keyring.

- Google's interactive sign-in is always handed to the system browser; embedded
  WebEngine is refused by Google regardless of imported cookies.
- `ISLAND_NO_COOKIE_IMPORT=1` disables cookie import entirely.
- Firefox profiles are not imported.

---

## Installation

One build produces the Core service, the Qt overlay, the Settings app, the
GNOME extension, desktop entries, AppStream metadata, icons, window rules and a
systemd user unit. Pick the path that matches your distribution.

| Method | Command |
|---|---|
| DEB | `cd build/dev && cpack -G DEB` then `sudo apt install ./*.deb` |
| RPM | `bash packaging/ci/build-rpm.sh` |
| Arch | `bash packaging/tarball/make-source-tarball.sh`, then `cd packaging/arch && makepkg -si` |
| Source tarball | `bash packaging/tarball/make-source-tarball.sh` |
| Per-user (no root) | `bash packaging/dev/install-local.sh --build` |
| System-wide from a build tree | `sudo cmake --install build/dev --prefix /usr` |

`packaging/dev/install-local.sh` accepts `--prefix DIR`, `--no-systemd` and
`--no-autostart`. It records every installed path in
`~/.local/share/linux-island/installed-files.txt`, so
`bash packaging/dev/uninstall-local.sh` removes exactly what it installed.
Your settings in `~/.config/linux-island` are kept unless you pass
`--purge-config`.

## Desktop Environments & Launching

`linux-island-launch` automatically detects your active desktop session and selects the matching renderer:

| Desktop / Compositor | Renderer Used | Placement & Window Rules |
|---|---|---|
| **GNOME 45–50 (Wayland / X11)** | GNOME Shell Extension (`extension/`) | Native Shell panel actor; enabled automatically in Dynamic Mode. |
| **KDE Plasma 6 (Wayland / X11)** | Qt 6 Overlay (`linux-island-ui`) | X11 works out of the box; on Wayland (via XWayland), import `kwin-linux-island.kwinrule`. |
| **XFCE / Cinnamon / MATE (X11)** | Qt 6 Overlay (`linux-island-ui`) | Native top-center placement and XShape input masking; no rules needed. |
| **Hyprland (Wayland + XWayland)** | Qt 6 Overlay (`linux-island-ui`) | Add `source = ~/.local/share/linux-island/window-rules/hyprland.conf` (or `/usr/share/...`) to `hyprland.conf`. |
| **Sway (Wayland + XWayland)** | Qt 6 Overlay (`linux-island-ui`) | Add `include ~/.local/share/linux-island/window-rules/sway.conf` (or `/usr/share/...`) to your Sway config. |
| **i3 / bspwm (X11)** | Qt 6 Overlay (`linux-island-ui`) | Add `for_window [class="^linux-island-ui$"] floating enable, border none` to your config. |

### Launching & Updating Across Devices

```bash
# Start Linux Island (auto-selects GNOME extension on GNOME, or Qt overlay on other DEs)
~/.local/bin/linux-island-launch

# Force the Qt 6 overlay even on a GNOME desktop
~/.local/bin/linux-island-launch --standalone

# Check detected desktop, session type, active mode, and Core service status
~/.local/bin/linux-island-launch --status

# Open the Settings application
~/.local/bin/linux-island-settings
```

**Updating an existing installation on another Linux distro / DE:**
```bash
git pull
bash packaging/dev/install-local.sh --build
pkill -x linux-island-ui || true
~/.local/bin/linux-island-launch
```
*(On non-GNOME desktops, restarting `linux-island-ui` applies UI updates immediately without logging out. On GNOME Wayland, log out and back in after updating extension files, or use `scripts/dev/dev.sh` for live isolated reload.)*

### Installing Optional Window Rules (KDE, Hyprland, Sway)

Window rules are installed to `~/.local/share/linux-island/window-rules/` (per-user install) or `/usr/share/linux-island/window-rules/` (system package):

- **KDE Plasma (KWin):** System Settings → Window Management → Window Rules → **Import** → select `kwin-linux-island.kwinrule`.
- **Hyprland:** Add `source = /usr/share/linux-island/window-rules/hyprland.conf` (or `~/.local/share/linux-island/window-rules/hyprland.conf`) to `~/.config/hypr/hyprland.conf`.
- **Sway:** Add `include /usr/share/linux-island/window-rules/sway.conf` (or `~/.local/share/linux-island/window-rules/sway.conf`) to `~/.config/sway/config`.

## License

MIT. See `LICENSE`.

---

## Repository References

- `tests/ui-parity/README.md`: Cross-desktop UI parity testing guide and deterministic fixture catalog.
- `packaging/window-rules/`: Shipped window rules for KWin (`kwin-linux-island.kwinrule`), Hyprland (`hyprland.conf`), and Sway (`sway.conf`).
- `schemas/io.github.linuxisland.Core1.xml`: Immutable D-Bus Core1 XML specification.
- `design-system/DESIGN_SYSTEM.md`: Warm Minimalist design system reference (`design-system/tokens/tokens.json`).
