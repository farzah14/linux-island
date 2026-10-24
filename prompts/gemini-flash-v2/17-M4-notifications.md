# Prompt 17 — Verify native GNOME notifications remain unchanged; add opt-in PEEK only if safe

You are a precise Linux desktop engineer implementing **one** Linux Island v0.1 task using Gemini Flash. This is an EXISTING project. Do not rebuild it, change technologies, or replace its approved Warm Minimalist design.

**Current task:** legacy 17, v2 card(s) `M4-17A + M4-17B` within `docs/superpowers/plans/gemini-flash-v2/M4.md`.
**Prerequisites:** 14.

## Objective

Verify native GNOME notifications remain unchanged; add opt-in PEEK only if safe.

## Read before editing

1. `docs/superpowers/plans/gemini-flash-v2/00-START-HERE.md` (execution rules).
2. `docs/superpowers/plans/gemini-flash-v2/M4.md` — find ONLY card(s) `M4-17A + M4-17B`; do not perform later cards.
3. Relevant existing files from the list below (read before overwriting anything).
4. For D-Bus edits: `schemas/io.github.linuxisland.Core1.xml` and approved spec (read-only).
5. For UI edits: `design-system/tokens/tokens.json` (read-only; theme **Warm Minimalist**).

**Scope files** (create only if absent; modify only when necessary):
- `extension/lib/notificationAdapter.js`
- `extension/lib/islandController.js`
- `extension/extension.js`
- `tests/extension/manual-smoke.md`

## Strict execution protocol

1. Check `git status --short` and current branch. If checkout is dirty or on main/master, stop and report before edits. Never silently discard changes.
2. Inspect existing code and relevant tests. If work already done, verify it; don't reimplement.
3. Perform **one smallest numbered STEP within the named subcard per response** in the v2 milestone document. Test-first whenever new code is required; observe RED for real missing behavior, then GREEN.
4. On an API dependency you cannot verify locally (GNOME 46, Qt6 or MPRIS), return BLOCKED and the diagnostic command/output. Never invent API names, performance figures, or PASS results.
5. Test using these exact relevant commands **only when prerequisites are available**:
   - `gnome-extensions info linux-island@local`
6. Verify `git diff --check`, inspect diff and report changed paths. Commit only verified slices. No remote push, system package installation, sudo or release tag without explicit permission.
7. Stop after the selected subcard and await the next user instruction. Do not move to the next legacy task automatically.

**Milestone gate:** Earlier dependencies must be genuinely verified, not just marked done in chat. Stop if the prerequisite milestone has an unresolved blocker.

## Report format (use exactly)

```text
TASK: 17 / M4-17A + M4-17B
STATUS: PASS | PARTIAL | BLOCKED | FAIL
FILES_CHANGED: <exact paths>
TEST_RED: <command, exit code, observed result, or N/A for audits>
TEST_GREEN: <command, exit code, observed result>
ENVIRONMENT: <OS / GNOME / session / Qt / GJS versions, mark unknowns>
RISKS_OR_BLOCKERS: <factually verified concerns>
NEXT: STOP; request next small subtask when appropriate
```
