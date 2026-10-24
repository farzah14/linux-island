# Gemini Flash: Linux Island execution guide (v2)

This project is **not** complete. You are receiving M0 source code, an approved architecture and a segmented implementation plan. The first task is an audit, not a full rewrite.

## Start here

1. Unzip the complete distribution and open the `linux-island/` directory.
2. Inspect `START_HERE.md` and `docs/superpowers/plans/gemini-flash-v2/00-START-HERE.md`.
3. Use `prompts/gemini-flash-v2/01-M0-bootstrap.md` as the first coding-agent prompt.
4. On each subsequent turn, select the next prompt **only after** the current task's verifications are confirmed.
5. Stop at M0 if no isolated Ubuntu GNOME Wayland test account/VM exists. Do not pretend Node tests prove GNOME runtime behavior.

## Suggested prompting settings

- Use Gemini Flash for small one-file/one-test changes where the plan is explicit. No verified provider benchmark is implied.
- Start with a moderate thinking budget for routine edits; increase reasoning for GNOME API and Qt D-Bus integration when available. Settings and availability depend on your coding agent.
- Keep per-task context small: task prompt + 2–6 relevant source files + one canonical spec section.
- **Never** submit the entire 21-task plan with "implement everything". This increases drift, repeats work and obscures failures.
- Require actual commands with exit codes and clear `BLOCKED` when environment cannot test GNOME.
- Reserve a second independent review before merging major GNOME/D-Bus changes.

## Files in this distribution

- `docs/superpowers/plans/gemini-flash-v2/00-START-HERE.md`: scope and safe execution.
- `docs/superpowers/plans/gemini-flash-v2/M0.md` … `M5.md`: explicit small-step milestone cards.
- `prompts/gemini-flash-v2/01-M0-bootstrap.md` … `21-M5-release.md`: single-task prompts.
- `prompts/gemini-flash-v2/PROMPT_TEMPLATE.md`: reusable wrapper for further subtasks.
- `prompts/gemini-flash-v2/TASK_MANIFEST.json`: task map, dependencies and evidence.
- `scripts/dev/audit-environment.sh`: read-only environment audit, **does not install anything**.
- `scripts/dev/verify-kit.py`: offline checks for packaging, prompts, warm tokens and D-Bus signatures.

## Existing source ownership

- `extension/`: GJS (GNOME actor & state machine). Current live Shell tests pending.
- `core/`: C++/Qt scaffolding; full service is future M1.
- `schemas/`: approved frozen Core1 introspection XML.
- `design-system/`: Warm Minimalist canonical tokens, HTML/SVG/PNG preview and design docs.
- `docs/superpowers/specs/`: approved technical and design system specs.
- `docs/superpowers/plans/`: legacy original and segmented v2 plan.

## One-task workflow

```bash
cd linux-island
bash scripts/dev/audit-environment.sh
python3 scripts/dev/verify-kit.py
node tests/extension/state-machine.test.js
python3 tests/integration/test_m0_scaffold.py
```

If Qt and GNOME development tools exist on test host, run native build and GJS tests as instructed by `M0.md`. Log the actual output; do not change CMake to bypass missing dependencies.

## Critical distinctions

- **Status:** `docs/m0-progress.md` is historical baseline; update only after new tests.
- **Theme:** Warm Minimalist. Do not use Graphite & Mint from earlier artifacts.
- **Window systems:** first target GNOME 46 Wayland; other environments are a future roadmap.
- **Display modes:** Dynamic Mode in v0.1; Floating/Integrated later.
- **Notifications:** native GNOME stays in charge, no duplicate PEEK without confirmed compatibility.
- **Git:** work in an isolated branch; never push without explicit approval.
