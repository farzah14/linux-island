# Changelog

## v2.0.0 — 2026-11-15 (Obsidian Emerald visual identity)

- Replaced Warm Minimalist palette with **Obsidian Emerald** (`#0B0B0B` / `#1C1C1C` obsidian dark surfaces, `#59D66C` vivid emerald dark accent, `#08100A` dark-on-emerald ink, and Cool Mist `#F7F9FA` / `#DCE0E2` + `#147A38` light theme).
- Added pill/circular control corner specs (`999px`) and `24px` expanded panel corners, plus Circular Progress Ring and Telemetry Card specifications.
- Updated `scripts/dev/generate-island-css.py` to export tokens to `extension/stylesheet.css`, `island-ui/qml/ThemeData.qml`, and `settings-app/qml/Theme.qml`.
- Recalculated all 26 WCAG AA contrast checks (`allPass=true`) and regenerated SVG, PNG, and HTML previews.

## v1.0.0 — 2026-10-24 (Warm Minimalist visual revision — superseded)

- Replaced the earlier mint accent direction with warm amber and cream, retaining semantic role names.
- Recalculated all dark/light color pairs and refreshed offline preview and exports.
- No GNOME or Qt runtime styling was changed.

## Initial design proposal (superseded) — 2026-10-24

- Established dark/light palette and semantic role system.
- Defined spacing, typography, radius, geometry, icon, motion and opacity tokens.
- Documented five Island states, context-aware priority and reduced-motion behavior.
- Specified 15 MVP and 5 future UI component contracts.
- Added GJS/Qt integration guide and contrast QA report.
