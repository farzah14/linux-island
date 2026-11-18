# Obsidian Emerald — Theme Change Notes

**Date:** 2026-11-15
**Applies to:** Linux Island Design System v2.0.0; active across GNOME Shell Extension, Qt6 Overlay, and Qt6 Settings.

## What changed

Previous visual direction: Warm Minimalist (`#191816`, `#FBF8F1`, `#D8B77F`).
Current visual direction: **Obsidian Emerald** — pitch obsidian, cool neutral slate, Cool Mist light surfaces, and vivid emerald accents.

| Semantic role | Dark | Light |
|---|---|---|
| Surface / Island | `#0B0B0B` | `#F7F9FA` |
| Raised surface | `#1C1C1C` | `#E6EAEC` |
| Primary text | `#F4F6F5` | `#111413` |
| Primary accent | `#59D66C` | `#147A38` |
| Accent hover | `#7AE28A` | `#0F5D2B` |
| Text on accent | `#08100A` | `#F7F9FA` |
| Focus ring | `#59D66C` | `#147A38` |

## Unchanged contracts

- Five UI states: HIDDEN, COMPACT, PREVIEW, EXPANDED, PEEK.
- Compact 124×32, Preview 248×56, Peek 296×72, Expanded 360×184 minimum.
- Font scale, spacing scale, and motion durations (`90/150/220/300ms`).
- GNOME GJS UI + Qt/QML Overlay & Settings + C++ Core architectural boundaries.
- D-Bus `Core1` contract and system integration policies.

## Regenerating exports and QA

```bash
python3 design-system/qa/rebuild_exports.py
python3 design-system/qa/generate_preview.py
python3 design-system/qa/generate_previews.py
python3 scripts/dev/generate-island-css.py
python3 design-system/qa/verify_tokens.py
python3 -m unittest discover -s design-system/qa -p 'test_*.py'
python3 design-system/qa/test_ui_parity_tokens.py
```
