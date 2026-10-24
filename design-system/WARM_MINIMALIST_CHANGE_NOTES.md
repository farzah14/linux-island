# Warm Minimalist — Theme Change Notes

**Date:** 2026-10-24
**Applies to:** Linux Island Design System v1.0; M0 bootstrap remains unchanged at runtime.

## What changed

Previous visual direction: Graphite & Mint.
Current visual direction: **Warm Minimalist** — warm graphite, cream, and soft amber.

| Semantic role | Dark | Light |
|---|---|---|
| Surface / Island | `#191816` | `#FBF8F1` |
| Raised surface | `#302D28` | `#EEE9DF` |
| Primary text | `#F4F0E9` | `#292621` |
| Primary accent | `#D8B77F` | `#80551F` |
| Accent hover | `#E9CEA0` | `#6B471B` |
| Focus ring | `#D8B77F` | `#80551F` |

`#898278` is retained as a warm graphite/stone reference shade.
Only functional success states use sage green, not brand accents. Errors remain red; warning states remain amber, always paired with an icon or label.

## Unchanged contracts

- Five UI states: HIDDEN, COMPACT, PREVIEW, EXPANDED, PEEK.
- Compact 124x32, Preview 248x56, Peek 296x72, Expanded 360x184 minimum.
- Font scale, spacing scale, radius scale, and motion durations.
- GNOME GJS UI + Qt/QML Settings + C++ Core architectural boundaries.
- D-Bus `Core1` contract and system integration policies.

## For an existing M0 checkout

1. Replace `design-system/` with the new directory.
2. Replace `docs/superpowers/specs/2026-10-24-linux-island-design-system-v1-design.md` with this version.
3. Rebuild derived exports when editing tokens: `python3 design-system/qa/rebuild_exports.py`.
4. Run `python3 design-system/qa/verify_tokens.py` and `python3 -m unittest discover -s design-system/qa -p 'test_*.py'`.
5. Open `design-system/STYLE_GUIDE_PREVIEW.html` locally to inspect dark/light specimens.

## Runtime caveat

The current M0 GNOME extension still has temporary hardcoded capsule styling. **Replacing the design-system files does not yet restyle the running Extension or implement Qt/QML settings.** Do that in a separate integration change after validating the GNOME runtime. The HTML preview is a static visual specimen, not a live GNOME Island.
