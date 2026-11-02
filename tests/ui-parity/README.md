# Linux Island Cross-Desktop UI Parity Testing Guide

This directory contains the reproducible test harnesses, fixtures, and execution procedures for verifying UI parity between the GNOME Shell extension and the Qt Quick overlay renderer.

---

## 1. Prerequisites and Safety Rules

1. **Strictly No Daily Session Modification:** Never restart, replace, or reconfigure the user's primary daily-use desktop environment to capture test evidence (`AGENTS.md`).
2. **Approved Isolation:**
   - **GNOME Shell:** Use an isolated headless session (`scripts/dev/dev-session.sh`) or a dedicated test user account (`gnometest`) with hardware acceleration and separate D-Bus session bus.
   - **Qt Overlay:** Run `build/dev/island-ui/linux-island-ui` directly with `QT_QPA_PLATFORM=xcb` (on X11 or XWayland) or `QT_QPA_PLATFORM=offscreen` for headless verification.
3. **Privacy First:** Never use personal accounts, live browser cookies, personal notifications, or private music libraries in test fixtures. Use the fake deterministic fixtures defined in `fixture_runner.py`.

---

## 2. Deterministic Fixture Catalog

The fixture runner (`tests/ui-parity/fixture_runner.py`) provides 12 deterministic states covering all 4 carousel pages:

| Fixture ID | Carousel Page | Scenario Tested | Key Invariants to Verify |
|---|---|---|---|
| `FIX-MEDIA-EMPTY` | Media (0) | Stopped / Zero players | Title: "No Media Playing", artist: `""`, duration: `"--:--"`, controls disabled (0.4 opacity), artwork placeholder. |
| `FIX-MEDIA-PLAYING` | Media (0) | Active playing audio | 48x48 artwork, BeatBars active, 25% progress, 0.8 volume, pause button visible, elapsed "1:00", duration "4:00". |
| `FIX-MEDIA-PAUSED` | Media (0) | Paused audio | BeatBars frozen, play button visible, progress retained at 25%. |
| `FIX-MEDIA-LONG-TEXT` | Media (0) | Exceedingly long text | Title and artist text elide gracefully with `...` on right without layout bursting or clipping. |
| `FIX-MEDIA-NO-SEEK` | Media (0) | Unseekable live stream | Seek track non-interactive, thumb handle hidden, default arrow cursor. |
| `FIX-CORE-OFFLINE` | Media (0) | D-Bus Core disconnected | Title: "Core offline", controls disabled, safe fallback state. |
| `FIX-SYSTEM-NORMAL` | System (1) | Normal hardware metrics | 3-slot layout: CPU (25%), RAM (48%), BAT (85%), NET (↓ 1.2 MB/s, ↑ 140 KB/s), 4 quick toggles (Theme, Night, DND, Config). |
| `FIX-SYSTEM-NO-BAT` | System (1) | Desktop without battery | Battery tile cleanly hidden; CPU and RAM tiles balance without gap. |
| `FIX-AI-QUOTA-NORMAL` | AI Quota (2) | Normal quotas loaded | 3 provider rows (Antigravity, Codex, Claude), 5h/Wk toggles, active progress tracks, reset countdowns. |
| `FIX-AI-QUOTA-OFFLINE` | AI Quota (2) | Offline AI session | Honest "No active session" detail, progress 0%, "--%". |
| `FIX-SEARCH-INITIAL` | Search (3) | Initial web search page | Google and Brave engine selection chips, 32px query field with search icon, hint "Enter to search · Esc to close". |
| `FIX-SEARCH-FOCUSED` | Search (3) | Active search focus | Focus outline on query field, typed query text, primary search action button enabled (1.0 opacity). |

### Listing & Inspecting Fixtures
```bash
python3 tests/ui-parity/fixture_runner.py --list
python3 tests/ui-parity/fixture_runner.py --fixture FIX-MEDIA-PLAYING --json
python3 tests/ui-parity/fixture_runner.py --verify
```

---

## 3. Evidence Capture Procedure

### Capturing GNOME Extension Evidence
From an approved isolated GNOME session:
```bash
# Start isolated dev session
scripts/dev/dev-session.sh start

# Capture evidence with scripts/dev/capture-visual.sh
scripts/dev/capture-visual.sh --out build/ui-parity/gnome-wayland/
```

### Capturing Qt Overlay Evidence
From the build directory:
```bash
# Build dev target
cmake --build build/dev

# Run automated smoke test
build/dev/island-ui/linux-island-ui --smoke-test

# Launch under XWayland/X11 with an isolated fake player
QT_QPA_PLATFORM=xcb build/dev/island-ui/linux-island-ui &
PID=$!

# Capture screenshots via scrot / import / spectacle
import -window root build/ui-parity/qt-overlay/fullscreen.png
import -window root -crop 360x220+503+8 build/ui-parity/qt-overlay/crop-expanded.png

kill $PID
```

---

## 4. Evaluation & Comparison Criteria

Compare captures side-by-side against `docs/ui-parity/UI_CONTRACT.md`:
1. **Geometric Invariants:**
   - Width: 328px (medium), 268px (small), 388px (large).
   - Radius: 20px (`IslandTheme.radiusXl`) for expanded capsule, 18px for compact pill, 999px for circle.
   - Component spacing: 6px between top nav pills, 6px between page rows.
2. **Visual Consistency:**
   - Vector symbolic icons: verify monochrome SVG assets match (`media-symbolic`, `system-symbolic`, `ai-symbolic`, `search-symbolic`, `prev-symbolic`, `play-symbolic`, etc.). Zero text emojis.
   - Header: verify tabs are horizontally centered and no `'✕'` close button is rendered on the capsule.
   - Palette: colors must match Warm Minimalist tokens (`#191816` dark surface, `#D8B77F` amber accent, `#F4F0E9` primary text).
3. **Tolerances:**
   - Exact logical pixel metrics required; up to 1px antialiased raster edge variation is permitted.
   - Font rasterization differences between Pango/Cairo and Qt FreeType are expected and allowed under the `system-ui` font strategy.

---

## 5. Evidence Storage & Indexing

Store local visual evidence under:
```text
build/ui-parity/<target-platform>/<fixture-id>/
  ├── fullscreen.png       # Full desktop screenshot for placement verification
  ├── component.png        # Cropped component image for detail review
  └── metadata.json        # Build commit, session type, display resolution, scale
```

*Note:* Do not commit binary screenshots or screen recordings to Git; keep results indexed in `docs/ui-parity/TEST_MATRIX.md`.
