# Linux Island (M0 bootstrap)

Status: **development prototype — not a usable Dynamic Island yet**.

## Purpose

C++20/Qt 6 Core + GNOME Shell Extension (GJS) + Qt/QML Settings (later milestone), linked through a D-Bus session service. M0 validates GNOME capsule lifecycle and pure UI state semantics before the backend is implemented.

## Environment

First test platform: Ubuntu 24.04 GNOME 46 Wayland. Other desktop environments are **not** supported by this M0 scaffold yet.

## Baseline tests that run without GNOME or Qt

```bash
node tests/extension/state-machine.test.js
python3 tests/integration/test_m0_scaffold.py
node --check extension/extension.js
node --check extension/ui/capsule.js
```

These are **static or pure JavaScript checks only**. They do not establish GNOME runtime compatibility.

## Native Qt bootstrap (requires Qt 6 development packages)

```bash
cmake --preset dev
cmake --build --preset dev
ctest --preset dev
```

## Manual GNOME testing

Read `tests/extension/manual-smoke.md` first. Use an isolated VM/test user and save actual results in `docs/compatibility.md`.

## Reference documents

- `docs/superpowers/specs/2026-10-24-linux-island-v0.1-design.md`
- `docs/superpowers/plans/2026-10-24-linux-island-v0.1-implementation.md`
- `schemas/io.github.linuxisland.Core1.xml`
