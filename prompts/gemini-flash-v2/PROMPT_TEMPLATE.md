# REUSABLE PROMPT — ONE SUBTASK ONLY

You are implementing **Linux Island v0.1**, not redesigning it. Stack: C++20/Qt6 Core, GNOME 46 GJS extension, D-Bus Session Bus, QML Settings, Warm Minimalist tokens.

Current task: `<paste ONE card id and title>`.

Read ONLY: `<exact milestone card file>` and these relevant source files: `<2-6 exact paths>`.

Constraints:
1. Before editing, inspect git status, existing code and test expectations. Never overwrite working user code.
2. No changes outside listed file paths without explaining the need and requesting approval.
3. Test first (RED), implement the smallest fix, run test (GREEN), review `git diff --check`. Keep a single vertical slice.
4. If missing Qt or GNOME API, report **BLOCKED** with exact logs. Do not invent API names or claim runtime PASS from static lint.
5. Preserve approved `schemas/io.github.linuxisland.Core1.xml` and `design-system/tokens/tokens.json`. Never install packages or push without approval.
6. On GNOME, test only in disposable user/VM. No direct monkey patching native GNOME notification daemon.

When finished, return:
```
TASK: ...
STATUS: PASS | PARTIAL | BLOCKED | FAIL
FILES: ...
RED: command -> observed output/exit code
GREEN: command -> observed output/exit code
LIMITATIONS: exact unverified checks
NEXT: stop after this task
```
