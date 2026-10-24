# START HERE — Linux Island Warm Minimalist / Gemini Flash Plan v2

**You have a development starter, not a finished Linux application.**

## What is included

- Existing M0 C++/Qt scaffold and GNOME Shell Extension source.
- Approved Technical Design Specification v0.1 and immutable D-Bus Core1 XML.
- Warm Minimalist Design System v1.0 with tokens, docs, HTML + SVG/PNG previews.
- Original 21-task Implementation Plan v0.1.
- **NEW:** segmented Implementation Plan v2 optimized for smaller-model coding agents (M0–M5), 21 per-task prompts, task manifest and verification utilities.

## Run first (from `linux-island/`)

```bash
bash scripts/dev/audit-environment.sh
python3 scripts/dev/verify-kit.py
node tests/extension/state-machine.test.js
python3 tests/integration/test_m0_scaffold.py
python3 design-system/qa/verify_tokens.py
```

No installers run during the above commands. For native Qt build, follow M0 on an approved test host.

## Coding-agent start

Open `prompts/gemini-flash-v2/01-M0-bootstrap.md`, paste into Gemini Flash from the repository root. Complete only that task, verify, then continue to prompt 02.

**Do not run GNOME Shell Extension experiments in your daily-use GNOME session.** Use a disposable test user/VM first. M0 live runtime acceptance is currently unverified in this archive.

## Primary reading

- `GEMINI_FLASH_EXECUTION_GUIDE.md`
- `docs/superpowers/plans/gemini-flash-v2/00-START-HERE.md`
- `docs/superpowers/plans/gemini-flash-v2/M0.md`
- `docs/superpowers/specs/2026-10-24-linux-island-v0.1-design.md`
- `design-system/DESIGN_SYSTEM.md`

## Task tracker

Open `docs/TASK_STATUS.md` for initial verified/pending tasks. Update the tracker only after recording actual test evidence.
