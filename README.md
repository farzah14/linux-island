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
- GJS (GNOME JavaScript)
- Node.js (for offline pure logic tests)
- Python 3

### 2. Configure & Build
```bash
cmake --preset dev
cmake --build build/dev
```

### 3. Run Automated Tests
```bash
# CTest suite (7 C++/Qt tests)
ctest --test-dir build/dev --output-on-failure

# JavaScript logic and reducer tests
node tests/extension/state-machine.test.js
node tests/extension/display-policy.test.js
node tests/extension/island-controller.test.js
node tests/extension/core-proxy.test.js
node tests/extension/media-view.test.js
node tests/extension/controller.test.js

# Design system and scaffold verification
python3 scripts/dev/verify-kit.py
python3 design-system/qa/verify_tokens.py
```

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
