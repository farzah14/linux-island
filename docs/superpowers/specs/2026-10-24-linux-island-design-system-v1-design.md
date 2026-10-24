# Linux Island Warm Minimalist — Design System v1.0 Specification

**Status:** Candidate design baseline; visual review required prior to runtime styling integration.
**Design direction approved:** Warm Minimalist / Modern Minimalist (graphite, cream, amber).
**System deliverable:** [`../../../design-system/DESIGN_SYSTEM.md`](../../../design-system/DESIGN_SYSTEM.md)

The authoritative design system is stored in `design-system/` to keep tokens, component contracts, accessibility checks, and integration guidance together. This spec links to those resources rather than copying details that could drift.

## Artifact index

- `design-system/DESIGN_SYSTEM.md`
- `design-system/components/COMPONENT_SPECIFICATIONS.md`
- `design-system/tokens/tokens.json`
- `design-system/tokens/dark.flat.json`, `light.flat.json`
- `design-system/MOTION_AND_INTERACTION.md`
- `design-system/ACCESSIBILITY_AND_QA.md`
- `design-system/INTEGRATION_GUIDE.md`
- `design-system/qa/contrast-report.json`

## Integration gate

Do not modify GNOME Shell Extension or Qt/QML application theme implementation until design-system review. After approval, create a scoped implementation task for theme adapter and visual regression tests. Preserve existing Core1 D-Bus contract; no color values transported over D-Bus.
