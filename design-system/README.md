# Linux Island Design System v1.0 — Warm Minimalist

**Use with Linux Island MVP v0.1.** This is a standalone reference and machine-readable token package; it is not a finished GNOME theme implementation.

## Contents

| File | Purpose |
|---|---|
| `DESIGN_SYSTEM.md` | complete visual language, foundations, interaction, layout and state specifications |
| `components/COMPONENT_SPECIFICATIONS.md` | 20 component contracts including 15 MVP and 5 future components |
| `tokens/tokens.json` | canonical machine-readable primitives, semantic themes, geometry, motion and typography |
| `tokens/dark.flat.json` / `tokens/light.flat.json` | flattened theme snapshots for cross-renderer handoff |
| `MOTION_AND_INTERACTION.md` | state transitions, priority, interruption, reduced motion |
| `WARM_MINIMALIST_CHANGE_NOTES.md` | theme migration from the earlier green-accent proposal |
| `ACCESSIBILITY_AND_QA.md` | visual-accessibility requirements and QA gates |
| `INTEGRATION_GUIDE.md` | mapping between GNOME GJS and Qt/QML; Core settings flow |
| `qa/contrast-report.json` | contrast ratios for 26 designated color-pair checks |

## Quick tokens

- Dark surface: `#191816`; dark accent: `#D8B77F`; dark text: `#F4F0E9`.
- Light surface: `#FBF8F1`; light accent: `#80551F`; light text: `#292621`.
- Compact 124×32; Preview 248×56; Peek 296×72; Expanded 360×184 min.
- Motion 90/150/220/300ms; no bounce; reduced-motion support.

## Important distinctions

1. **Warm Minimalist is the approved direction.** Specific numeric token values are proposed design baseline to test on actual GNOME UI.
2. **Future features are designed, not promised in v0.1.** System Monitoring, Quick Settings, File Shelf, Timer, Calendar remain future releases.
3. **No runtime code changes in this delivery.** M0 prototype still uses hardcoded colors until token wiring is separately implemented.
4. **Accessible color pairs do not imply entire application WCAG certification.** See QA guide.

## Review checklist

- Verify iconography, panel shape, state sizes and GJS/QML mappings against your preferences.
- Approve this design system before updating runtime styling.
- After implementation, execute manual GNOME+Qt visual regression tests.

## Validate tokens locally

```bash
python3 design-system/qa/rebuild_exports.py
python3 design-system/qa/verify_tokens.py
python3 -m unittest discover -s design-system/qa -p 'test_*.py'
```

This verifies both theme snapshots against the canonical token file and recalculates all 26 contrast checks. It does not require GNOME, Qt, or network access.

## Visual reference

Open `design-system/STYLE_GUIDE_PREVIEW.html` in a browser for an **offline, static** specimen of the dark/light palette and the four visible Island states. It intentionally does not emulate GNOME Shell interactions.

## Warm Minimalist export assets

The offline preview illustrations included in this source package are:

- `previews/Linux_Island_Warm_Minimalist_Preview.svg` — scalable concept preview.
- `previews/Linux_Island_Warm_Minimalist_Preview.png` — raster preview.
- `STYLE_GUIDE_PREVIEW.html` — standalone interactive-looking (but static) reference for states and light/dark themes.

These assets show the **visual specification**, not a tested GNOME extension screenshot. The running M0 capsule still uses prototype styling pending M3 token integration.

For small-model implementation instructions read `../GEMINI_FLASH_EXECUTION_GUIDE.md` and `../docs/superpowers/plans/gemini-flash-v2/00-START-HERE.md`.
