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
- Ubuntu 24.04 LTS or 26.04 LTS (Wayland)
- GCC / G++ (C++20 support)
- CMake 3.22+ and Ninja
- Qt 6 (Core, DBus, Test, Gui, Qml, Quick)
- **Qt 6 WebEngine** (`Qt6WebEngineQuick`, `Qt6WebEngineCore`) — required by the
  embedded search companion and the cookie importer; the build fails at
  configure time without it
- **Qt 6 Sql** (`Qt6Sql`) — reads the copied Chromium cookie database
- **OpenSSL development headers** (`libssl-dev`) — AES-128-CBC cookie decryption
- GJS (GNOME JavaScript)
- Node.js (for offline pure logic tests)
- Python 3

On Debian/Ubuntu the Qt packages are:

```bash
sudo apt install qt6-webengine-dev qt6-base-dev libssl-dev
```

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

## Local User Installation

Install without root privileges:
```bash
bash packaging/dev/install-local.sh
```

Uninstall and cleanly revert:
```bash
bash packaging/dev/uninstall-local.sh
```

---

## Documentation

- `docs/release-checklist.md`: Acceptance criteria AC-01 through AC-10 verification report.
- `docs/testing.md`: Complete testing and deployment instructions.
- `docs/compatibility.md`: Target platform compatibility matrix and host audit facts.
- `schemas/io.github.linuxisland.Core1.xml`: Immutable D-Bus Core1 XML specification.
- `design-system/DESIGN_SYSTEM.md`: Warm Minimalist design system reference.
