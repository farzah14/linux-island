# Linux Island: Gemini Flash Implementation Runbook v2.0

> **For agentic workers:** REQUIRED SUB-SKILL: Use `executing-plans` for inline development. Execute one task card at a time. Each card uses checkbox (`- [ ]`) syntax and a verification gate. Never assume an unrun test passes.

**Goal:** Deliver an Ubuntu 24.04 / GNOME 46 Wayland MVP of Linux Island using the **existing** repository, with independently verifiable small tasks suitable for Gemini Flash.

**Architecture:** GNOME Shell Extension (GJS/St/Clutter) owns UI and five interaction states. Qt 6/C++20 Core owns media, settings, revision and the versioned D-Bus interface. Qt Quick/QML is an independent settings client. GNOME remains notification authority. The extension may not block on D-Bus or crash the Shell if the Core disappears.

**Tech Stack:** GJS ES modules (GNOME 46), GNOME St/Clutter, JavaScript pure reducer tests, C++20, Qt 6 Core/DBus/Quick/Test, CMake/Ninja, D-Bus Session Bus, MPRIS2, Python 3 standard-library validation, systemd user services.

---

## 0. Canonical inputs, priority and hard constraints

Read these (by path, in this order):
1. `START_HERE.md` — this package's entrypoint.
2. `README.md` — actual repository M0 status.
3. `docs/m0-progress.md` and `docs/compatibility.md` — observed vs. unverified behavior.
4. `docs/superpowers/specs/2026-10-24-linux-island-v0.1-design.md` — approved product/architecture.
5. `schemas/io.github.linuxisland.Core1.xml` — immutable Core1 signature.
6. `design-system/tokens/tokens.json` — **Warm Minimalist** canonical token source.
7. `design-system/INTEGRATION_GUIDE.md` — GJS/QML mapping.
8. `docs/superpowers/plans/2026-10-24-linux-island-v0.1-implementation.md` — legacy 21-task plan; new v2 cards supersede ambiguous commands, not API or scope.

If two sources disagree, **STOP** and report the exact conflicting lines. Never silently change the approved architecture or frozen D-Bus signature.

Do not rebuild from scratch, overwrite uncommitted work, install system packages without approval, change system bus settings, or test untrusted shell code in the daily-use GNOME session.

Do not add React/Electron/web runtime or change Warm Minimalist. Do not implement KDE/Floating/Integrated before GNOME v0.1 passes its compatibility gate. Media/notifications/system monitoring are not required in M0.

## 1. Which version of the code is real?

As supplied in the source archive:

| Item | Baseline status | Required next verification |
|---|---|---|
| `CMakeLists.txt`, presets and `core/app/main.cpp` | EXIST | Qt6 build on target Ubuntu; prior sandbox had missing Qt6 package. |
| `extension/extension.js`, `extension/ui/capsule.js` | EXIST | Live GNOME Shell 46 enable/disable (NOT YET VERIFIED). |
| `extension/lib/interactionState.js` | EXIST | Node baseline PASS 17 assertions; GJS in GNOME not yet run. |
| `extension/lib/gnomeDisplayAdapter.js` | MISSING | Probe actual GNOME 46 API and implement. |
| `extension/lib/islandController.js` | MISSING | Must be added after tested policy. |
| Live D-Bus core service | MISSING | M1, not M0. |
| Warm Minimalist token data | EXISTS | Renderer integration is not done. No new palette. |
| GNOME notifications adapter | MISSING | M4, optional PEEK with GNOME-native fallback. |

A `PASS` on Node or XML does **not** establish GNOME Wayland compatibility. Build `ctest` and GJS must be run on suitable host. UI acceptance must be recorded manually.

## 2. Run order, one task per agent message

1. `M0.md`: M0-00 audit → M0-01 native build → M0-02 live lifecycle → M0-03 reducer validation → M0-04 fullscreen adapter → M0-05 gate.
2. `M1.md`: Core1 schema, service, revision, settings and reconnect.
3. `M2.md`: MPRIS normalization, registry, controls and media UI.
4. `M3.md`: full hybrid interaction, Smart Adaptive edge conditions and theming.
5. `M4.md`: QML settings, safe GNOME notifications and IPC security.
6. `M5.md`: packaging, failure injection, measured performance and release.

The 21 legacy tasks remain mapped 01–21; v2 divides them into smaller subtask cards. The M0-00 and M0-05 verification gates are extra organizational cards, not new product features.

## 3. Guardrails for Gemini Flash

- **Context:** Read the selected task card and at most six relevant source files. Do not re-ingest all docs each subtask.
- **Scope:** Change only the task's declared files. If another file is necessary, explain the dependency first.
- **Output:** 1 small vertical change and 1 associated test per turn; stop at the card checkpoint.
- **Test-first:** Demonstrate an expected RED (missing behavior, not syntax errors) before new production code.
- **Evidence:** Quote command, exit code, actual results. "Should pass" is not proof.
- **Version safety:** For any GNOME/Mutter API, inspect on the actual supported GNOME version. A guessed private name is a blocker.
- **IPC safety:** No synchronous D-Bus call in Shell UI or no root/sudo at runtime.
- **Security:** Do not execute content from D-Bus, remote art URLs, or notification text as commands.
- **Recovery:** If blocked after one investigated failure, stop and return diagnostics. No speculative edits spanning unrelated modules.
- **Commits:** Commit only after tests pass; never push or tag without explicit approval.

## 4. Standard task execution transcript

Each subtask must end with exactly this factual report:

```text
TASK: <task code>
STATUS: PASS | BLOCKED | FAIL | PARTIAL
FILES: <created/modified paths>
RED: <test command and observed expected failure, or NOT APPLICABLE for read-only audit>
GREEN: <test command, exit code, exact test count/output>
ENVIRONMENT: <OS, GNOME, session, Qt/GJS versions; unknown when unverified>
LIMITATIONS: <what has NOT been tested>
NEXT: <next task code; no implementation until requested>
```

If no suitable GNOME session is available, M0-02 and M0-04 must remain BLOCKED, even if static checks pass.

## 5. Key commands (do not pretend they have run)

```bash
# From the repository root
node tests/extension/state-machine.test.js
python3 tests/integration/test_m0_scaffold.py
python3 design-system/qa/verify_tokens.py
python3 design-system/qa/test_warm_palette.py
node --check extension/extension.js
node --check extension/ui/capsule.js

# Only where Qt 6 dev tools are installed
cmake --preset dev
cmake --build --preset dev
ctest --preset dev --output-on-failure

# GNOME 46 test VM or isolated test user only
gnome-shell --version
printf '%s\n' "$XDG_SESSION_TYPE"
gjs -m tests/extension/state-machine.test.js
```

## 6. Acceptance and source mapping

| AC | Meaning | Implementation card | Evidence required |
|---|---|---|---|
| 01 | Compact capsule | M0-02, M3-14 | GNOME Wayland screenshot, actor count |
| 02 | Hover preview | M0-03, M3-14 | Pure reducer + live interaction |
| 03 | Expand/dismiss | M0-03, M3-14 | Live pointer, Escape, focus checks |
| 04 | Media and controls | M2-10..13 | Fake MPRIS + real player |
| 05 | Native notifications unchanged | M4-17 | DND/duplicate-prompt matrix |
| 06 | Smart Adaptive fullscreen | M0-04, M3-15 | Live GNOME fullscreen matrix |
| 07 | Settings persist and sync | M1-08, M4-16 | Core restart / QML live updates |
| 08 | Core recovery | M1-09, M5-20 | Kill/restart private D-Bus tests |
| 09 | Extension lifecycle | M0-02, M5-20 | 10/20 on-off cycles with journal |
| 10 | Performance evidence | M4-18, M5-21 | Measured CPU/RSS/frame latency |

## 7. Links

Official references that the agent should consult when verifying platform specifics:
- GNOME extension guide: https://gjs.guide/extensions/
- GNOME Shell extension lifecycle: https://gjs.guide/extensions/topics/extension.html
- GNOME notifications: https://gjs.guide/extensions/topics/notifications.html
- Qt D-Bus: https://doc.qt.io/qt-6/qtdbus-index.html
- MPRIS2: https://specifications.freedesktop.org/mpris-spec/latest/

These are references, not proof that a method works on the actual user machine.
