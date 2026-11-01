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

GNOME 45–50 in Dynamic Mode uses the Shell extension. Other desktops run the Qt
overlay through XWayland, optionally refined by the shipped KWin, Sway or
Hyprland rules. See `docs/desktop-environments.md` for the support matrix and
`docs/packaging.md` for package details.

## License

MIT. See `LICENSE`.

---

## Documentation

- `docs/release-checklist.md`: Acceptance criteria AC-01 through AC-10 verification report.
- `docs/testing.md`: Complete testing and deployment instructions.
- `docs/compatibility.md`: Target platform compatibility matrix and host audit facts.
- `docs/desktop-environments.md`: Which desktops use the Shell extension or the Qt overlay.
- `docs/packaging.md`: DEB, RPM, Arch, tarball and per-user install instructions.
- `schemas/io.github.linuxisland.Core1.xml`: Immutable D-Bus Core1 XML specification.
- `design-system/DESIGN_SYSTEM.md`: Warm Minimalist design system reference.
