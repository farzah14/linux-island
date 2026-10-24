# Agent instructions for Linux Island

This file is automatically discoverable by many coding agents. Follow it before writing or changing code.

## Product facts

- Linux Island MVP v0.1 targets **Ubuntu 24.04 / GNOME 46 / Wayland** only for first runtime acceptance.
- Long-term: multiple Linux desktop environments and Dynamic/Floating/Integrated modes; **v0.1** requires Dynamic Mode only.
- Approved architecture: GNOME Shell Extension GJS for live Island UI; C++20 + Qt6 Core for data/settings and D-Bus Session Bus; Qt Quick/QML for Settings.
- UI states are `HIDDEN`, `COMPACT`, `PREVIEW`, `EXPANDED`, `PEEK`; fullscreen visibility wins; GNOME native notifications remain authoritative.
- Approved visual system: **Warm Minimalist**. Canonical tokens: `design-system/tokens/tokens.json`; never invent a different palette.
- Approved D-Bus contract: `schemas/io.github.linuxisland.Core1.xml`; six methods and three signals; no unapproved signature changes.

## Mandatory agent sequence

1. Read `START_HERE.md` and `docs/superpowers/plans/gemini-flash-v2/00-START-HERE.md`.
2. Select exactly one small step from the current milestone: `M0.md` through `M5.md`.
3. Use the matching prompt under `prompts/gemini-flash-v2/`.
4. Inspect `git status --short` and only the 2–6 files relevant to that step.
5. Test first where possible; show RED→minimal implementation→GREEN. Do not alter unrelated code.
6. Report exact command output/exit codes; GNOME Wayland claims require runtime evidence on a disposable test user/VM.
7. Stop after the step, not entire milestone. Do not push/merge/tag without explicit instruction.

## No-go practices

- Never run system-wide package installs, sudo, nor modify user daily-use GNOME Shell without approval.
- Never guess private GNOME/Mutter methods; verify real version and record API used.
- Never use synchronous D-Bus calls in GNOME UI event callbacks.
- Never replace `org.freedesktop.Notifications` or duplicate native GNOME notification banners.
- Never log notification text/media metadata, or execute external D-Bus content as shell code.
- Never treat Node syntax tests as GNOME compatibility proof.

## Offline baseline commands

```bash
bash scripts/dev/audit-environment.sh
python3 scripts/dev/verify-kit.py
node tests/extension/state-machine.test.js
python3 tests/integration/test_m0_scaffold.py
python3 design-system/qa/verify_tokens.py
```

## When blocked

Report environment, exact failing command + message, whether failure is from missing dependency or real code behavior, and the smallest safe next action. Do not silently bypass a failed gate.
