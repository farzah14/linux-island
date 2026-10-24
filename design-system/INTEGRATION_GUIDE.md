# Integration Guide — Shared Tokens for GNOME Shell (GJS) and Qt/QML

## Source files

- `tokens/tokens.json` is the sole editable token source.
- `tokens/dark.flat.json`, `tokens/light.flat.json` are derived snapshots.
- `qa/contrast-report.json` is a computed QA artifact, not a token source.

When editing colors, regenerate both flat exports and contrast report from the master data, and review changed pairs. Do not manually diverge dark.flat / light.flat.

## GNOME Shell Extension (GJS)

GNOME Shell UI is built with Shell's St/Clutter actors. Use a scoped CSS class prefix, e.g. `.linux-island`, `.linux-island__capsule`, `.linux-island__media`, rather than global `StButton` overrides. Map semantic token colors to generated CSS or a small theme resolver in the Extension. Bundle required assets; never load theme CSS from arbitrary online providers.

**Example semantic mapping:**

| Semantic token | GNOME role |
|---|---|
| `surface.island` | capsule/panel background |
| `text.primary` | title and vital labels |
| `text.secondary` | artist, status description |
| `accent.primary` | active indicator, selected control |
| `border.focus` | keyboard focus outline |
| `radiusPx.pill` | capsule curvature |
| `motionMs.standard` | compact/expanded timing |

Implement state transitions in Extension logic, keeping them independent of IPC. Avoid synchronous D-Bus from hover/click callbacks. De-register signals and timers when extension is disabled. GNOME Shell theme CSS is not a web browser; validate supported properties against the target GNOME version.

## Qt/QML Settings

Use an app-local QML theme singleton (or C++ registered QObject singleton) whose semantic values are sourced from the exported token data at build time or packaged resources. `System` theme follows platform preference if detected; `Dark`/`Light` are explicit overrides.

**Example semantic mapping:**

| Semantic token | QML responsibility |
|---|---|
| `surface.canvas` | Settings window background |
| `surface.raised` | grouped settings card |
| `text.primary` | section headings |
| `text.secondary` | row description |
| `control.primary` | save/confirm primary button |
| `border.focus` | keyboard focus outline |
| `fontPx.body` | system font 14px logical |

Qt singleton reference: https://doc.qt.io/qt-6.12/qml-singleton.html

## D-Bus contract and theme preferences

The C++ Core stores validated preference values like `theme=system|dark|light` and `motion=system|off|standard` through already defined Settings contract (`GetSettings`, `UpdateSettings`, `SettingsChanged`). **It does not arbitrate hover state, pass animation frames, or send arbitrary hex colors.**

When a Settings update is accepted:

1. Qt/QML sends preference update to C++ Core.
2. Core validates, persists and publishes settings revision.
3. Extension picks the corresponding locally packaged dark/light semantic values.
4. Extension updates actors in place; existing user interaction state remains stable.

When Core is disconnected, GJS uses bundled fallback defaults (dark theme unless system preference resolved). Never crash Shell because token source is missing; ship a safe static fallback.

## Scope of this Design System handoff

The artifacts are **design documentation and token data**, not a merged runtime theme engine. The M0 `extension/ui/capsule.js` uses prototype colors; replacing them, implementing stylesheet injection and creating QML ThemeSingleton are separate implementation tasks after review/approval.

## Versioning

- `1.0.x`: fix typo, fix incorrect semantically equivalent value, add validation metadata without breaking role names.
- `1.x`: additive semantic roles and component tokens.
- `2.0`: remove/rename existing role, change interpretation/units, or overhaul component ownership.

Pin a design-system version in build metadata as soon as integration work begins. Document compatibility between UI token bundle version and C++ app version if separate binaries ship.
