# Prompt 06 — Expose Core1 on user session bus with exact typed snapshot and introspection

You are a precise Linux desktop engineer implementing **one** Linux Island v0.1 task using Gemini Flash. This is an EXISTING project. Do not rebuild it, change technologies, or replace its approved Warm Minimalist design.

**Current task:** legacy 06, v2 card(s) `M1-06A + M1-06B` within `docs/superpowers/plans/gemini-flash-v2/M1.md`.
**Prerequisites:** 05.

## Objective

Expose Core1 on user session bus with exact typed snapshot and introspection.

## Read before editing

1. `docs/superpowers/plans/gemini-flash-v2/00-START-HERE.md` (execution rules).
2. `docs/superpowers/plans/gemini-flash-v2/M1.md` — find ONLY card(s) `M1-06A + M1-06B`; do not perform later cards.
3. Relevant existing files from the list below (read before overwriting anything).
4. For D-Bus edits: `schemas/io.github.linuxisland.Core1.xml` and approved spec (read-only).
5. For UI edits: `design-system/tokens/tokens.json` (read-only; theme **Warm Minimalist**).

**Scope files** (create only if absent; modify only when necessary):
- `core/app/main.cpp`
- `core/CMakeLists.txt`
- `core/dbus/core_service.h`
- `core/dbus/core_adaptor.h`
- `tests/integration/tst_core_dbus.cpp`

## Strict execution protocol

1. Check `git status --short` and current branch. If checkout is dirty or on main/master, stop and report before edits. Never silently discard changes.
2. Inspect existing code and relevant tests. If work already done, verify it; don't reimplement.
3. Perform **one smallest numbered STEP within the named subcard per response** in the v2 milestone document. Test-first whenever new code is required; observe RED for real missing behavior, then GREEN.
4. On an API dependency you cannot verify locally (GNOME 46, Qt6 or MPRIS), return BLOCKED and the diagnostic command/output. Never invent API names, performance figures, or PASS results.
5. Test using these exact relevant commands **only when prerequisites are available**:
   - `cmake --preset dev`
   - `cmake --build --preset dev`
   - `dbus-run-session -- ctest --test-dir build/dev -R core-dbus --output-on-failure`
6. Verify `git diff --check`, inspect diff and report changed paths. Commit only verified slices. No remote push, system package installation, sudo or release tag without explicit permission.
7. Stop after the selected subcard and await the next user instruction. Do not move to the next legacy task automatically.

**Milestone gate:** Earlier dependencies must be genuinely verified, not just marked done in chat. Stop if the prerequisite milestone has an unresolved blocker.

## Report format (use exactly)

```text
TASK: 06 / M1-06A + M1-06B
STATUS: PASS | PARTIAL | BLOCKED | FAIL
FILES_CHANGED: <exact paths>
TEST_RED: <command, exit code, observed result, or N/A for audits>
TEST_GREEN: <command, exit code, observed result>
ENVIRONMENT: <OS / GNOME / session / Qt / GJS versions, mark unknowns>
RISKS_OR_BLOCKERS: <factually verified concerns>
NEXT: STOP; request next small subtask when appropriate
```
