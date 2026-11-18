# Linux Island Design System v2.0 — Obsidian Emerald

**Use with Linux Island MVP v0.1+.** Authoritative visual system and machine-readable token package.

## Contents

| File | Purpose |
|---|---|
| `DESIGN_SYSTEM.md` | complete visual language, foundations, interaction, layout and state specifications |
| `components/COMPONENT_SPECIFICATIONS.md` | 20 component contracts including 15 MVP and 5 future components |
| `tokens/tokens.json` | canonical machine-readable primitives, semantic themes, geometry, motion and typography |
| `tokens/dark.flat.json` / `tokens/light.flat.json` | flattened theme snapshots for cross-renderer handoff |
| `MOTION_AND_INTERACTION.md` | state transitions, priority, interruption, reduced motion |
| `OBSIDIAN_EMERALD_CHANGE_NOTES.md` | theme migration from Warm Minimalist v1.0 to Obsidian Emerald v2.0 |
| `ACCESSIBILITY_AND_QA.md` | visual-accessibility requirements and QA gates |
| `INTEGRATION_GUIDE.md` | mapping between GNOME GJS and Qt/QML; Core settings flow |
| `qa/contrast-report.json` | contrast ratios for 26 designated color-pair checks |

## Quick tokens

- Dark surface: `#0B0B0B`; dark raised: `#1C1C1C`; dark accent: `#59D66C`; dark text: `#F4F6F5`; on-accent text: `#08100A`.
- Light surface: `#F7F9FA`; light raised: `#E6EAEC`; light accent: `#147A38`; light text: `#111413`; on-accent text: `#F7F9FA`.
- Compact 124×32 (999px pill); Preview 248×56 (999px pill); Peek 296×72; Expanded 360×184 min (24px panel).
- Motion 90/150/220/300ms; no bounce; reduced-motion support.

## Important distinctions

1. **Obsidian Emerald is the approved direction.** Values are derived from the Dynamic Island visual specification and validated via `qa/verify_tokens.py`.
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

## Obsidian Emerald export assets

The offline preview illustrations included in this source package are:

- `previews/Linux_Island_Obsidian_Emerald_Preview.svg` — scalable vector preview.
- `previews/Linux_Island_Obsidian_Emerald_Preview.png` — 1280×820 raster preview.
- `STYLE_GUIDE_PREVIEW.html` — standalone specimen for states, widget patterns, and light/dark themes.

Run `python3 scripts/dev/generate-island-css.py` to export tokens into `extension/stylesheet.css`, `island-ui/qml/ThemeData.qml`, and `settings-app/qml/Theme.qml`.

For small-model implementation instructions read `../GEMINI_FLASH_EXECUTION_GUIDE.md` and `../docs/superpowers/plans/gemini-flash-v2/00-START-HERE.md`.
