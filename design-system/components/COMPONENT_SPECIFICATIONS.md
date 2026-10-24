# Linux Island — Component Specifications v1.0

Scope label: **MVP** = Linux Island v0.1; **FUTURE** = designed but not implemented in v0.1. All dimensional units are logical px unless stated otherwise. Every component uses semantic colors from `tokens/tokens.json`, never hardcoded palette colors in business logic.

## Component anatomy and contracts

### 01. `IslandHost` — MVP

**Responsibility:** host one Island UI scene in GNOME Shell, own visibility and shell lifecycle.

- **Regions:** outer reactive container, content slot, input/focus boundary.
- **Inputs:** `uiState`, `layoutBounds`, `theme`, `reducedMotion`, `coreAvailable`, `activeContent`.
- **Events:** `hover-enter`, `hover-leave`, `activate`, `dismiss`, `fullscreen-changed`.
- **Rules:** state machine owned by Extension; never block shell thread waiting for Core; inactive HIDDEN must not intercept input.
- **Layout:** cap width to available geometry, respect panel host, no assumption of global always-on-top.
- **A11y:** accessible name “Linux Island”; focus moves safely when expanded scene is dismissed.
- **Failure:** Core missing → keep local capsule alive; disable unavailable media actions.

### 02. `CompactCapsule` — MVP

- **Anatomy:** activity glyph/dot, optional two-word state label, pill background.
- **Size:** default 124×32, min 96, max 240. Padding 12 horizontal, 4 vertical; pill radius.
- **Colors:** `surface.island`, `text.primary`, `accent.primary` for active signal only.
- **States:** idle, playing, disconnected. No flashing, infinite pulse, full song title marquee.
- **Input:** hover after 120ms → PREVIEW, click → EXPANDED.
- **A11y:** label describes current activity; do not use a green dot as sole indicator.

### 03. `PreviewCapsule` — MVP

- **Anatomy:** 20px symbolic icon or 40px clipped album artwork, primary line, secondary line.
- **Size:** default width 248, min height 56, padding 12, gap 8.
- **Content:** trim artist/title at 1 line each with ellipsis; accessible full text.
- **Exit:** hover leave +240ms grace → COMPACT, click → EXPANDED; no accidental closing when pointer moves to content.
- **Empty media:** show concise “No media playing” with empty-state glyph; never undefined/null UI strings.

### 04. `ExpandedPanel` — MVP

- **Anatomy:** header (title/close affordance), content slot, controls. Do not grow into a generic dashboard in v0.1.
- **Size:** default 360w × min184h, max 320h, radius 24, padding 16, section gaps 12.
- **Visual:** `surface.island`, raised content blocks on `surface.raised` where needed. No high-radius nested pills everywhere.
- **Input:** opens on click; Escape closes; click outside within supported actor capture path dismisses; focus returns to Capsule.
- **Concurrent event:** notification PEEK never replaces open ExpandedPanel; updates may be non-intrusive.
- **Overflow:** clamp to monitor, internal scroll for non-core content only; controls remain accessible.

### 05. `NotificationPeek` — MVP conditional

- **Anatomy:** app symbolic icon, app name/title, short body (max 2 lines), optional dismiss affordance.
- **Size:** default 296w × min72h, max104h, padding 12, radius 20; available width clamp.
- **Lifetime:** hold 3500ms; no auto-close while explicit interaction requiring more time, unless GNOME policy dictates otherwise.
- **Policy:** honor DND/fullscreen, no duplicate GNOME notification popup, no private notification persistence.
- **A11y:** app name+title announced once via existing GNOME mechanism; avoid double screen-reader announcements.
- **Fallback:** if Shell integration cannot guarantee no duplication, do not render PEEK; GNOME native notification stays functional.

### 06. `MediaCard` — MVP

- **Anatomy:** album artwork 48×48 radius8, title 16/600, artist 13/400, playback state, progress row, controls row.
- **Layout:** horizontal header group; title one line; artist one line; progress controlled by player capability.
- **Data:** use MPRIS2 title, artist, artwork URI, capabilities, duration, position. Artwork not trusted: remote URI loading controlled/sanitized by Core/renderer policy.
- **Loading:** show local placeholder artwork (disc icon), no indefinite spinner for missing cover.
- **Empty:** short empty state; controls hidden or disabled with reason.
- **A11y:** album cover decorative when text repeats song info; transport controls labelled.

### 07. `PlaybackControls` — MVP

- **Anatomy:** Previous / PlayPause / Next; visually centered with 40×40 hit area each; icon 20px.
- **Capabilities:** disable Previous/Next/Pause when respective MPRIS capability is false; button does not fake action success.
- **Behavior:** click sends D-Bus action; UI state updates only after real MPRIS playback change or a clearly shown pending state.
- **Keyboard:** Enter/Space activates focused buttons; focus ring visible.
- **Feedback:** if player disappears, controls disable; small inline status message; no modal error.

### 08. `PlaybackProgress` — MVP

- **Anatomy:** current time, track (4px height), remaining/total time; hit band min24px.
- **Values:** `positionUs`, `durationUs`, and `canSeek`. Display `m:ss` when duration known.
- **Rules:** if duration unknown/0 → show noninteractive track and `--:--`; don't divide by zero. If seek unsupported → noninteractive progress indicator.
- **Motion:** interpolate locally only during Playing; correct from MPRIS `Seeked` and properties update; no constant high-frequency D-Bus polling.
- **A11y:** accessible label “Playback position”; value exposed where renderer allows.

### 09. `IconButton` — MVP

- **Visual:** round or rounded square 32px, interactive hitbox 40px, symbol 16–20px.
- **Variants:** `ghost`, `tonal`, `primary`, `danger` (danger rare); `default`, `hover`, `pressed`, `focus`, `disabled`, `busy`.
- **Colors:** ghost text/icon primary, tonal on `control.secondary`, primary `control.primary` + `text.onAccent`.
- **Rules:** avoid color-only hover; 2px focus ring with outset2; disabled has no click handling.
- **A11y:** tooltip/title required for icon-only actions; no ambiguous symbol without accessible name.

### 10. `ActivityDot` — MVP

- **Size:** 8px diameter; accent color for playing, neutral for idle.
- **Purpose:** secondary visual cue only. Pair with status description for screen readers and text where room exists.
- **Motion:** no pulse loop in MVP.

### 11. `CoreStatus` — MVP

- **States:** connected, connecting, disconnected, incompatible schema.
- **UI:** small inline status with icon + text. Never full-screen blocking loader.
- **Behavior:** when disconnected, set actions disabled, offer “Unavailable” rather than phantom media controls.
- **Logging:** no user notification content in diagnostics.

### 12. `SettingsWindow` — MVP

- **Size:** prefer width680, min width520, min height560; native window resizing supported.
- **Layout:** two-column sidebar plus content when enough space, single-column when constrained; 24px section gaps.
- **Screens:** Appearance, Behavior, Media, Notifications, About.
- **Save behavior:** validated updates via Core; optimistic preview optional, but revert if rejected.
- **A11y:** standard Qt focus traversal, keyboard shortcuts, explanatory text, labels associated with fields.

### 13. `ThemePicker` — MVP

- **Options:** System / Dark / Light. Use radiogroup or segmented control, with text labels.
- **Default:** System; if system query unavailable choose dark fallback without forcing system theme change.
- **Preview:** two swatch panels using actual semantic colors, not screenshot of fake GNOME compositor.
- **A11y:** selected state verbalized; no color-only selection indicator.

### 14. `SettingsRow` — MVP

- **Anatomy:** title (14px), short description (13px), right-aligned control/toggle/dropdown; vertical gap 4px.
- **Minimum:** 40px interactive row; full hit target must not steal pointer events from adjacent controls.
- **States:** default, disabled (explain why), validation error (inline), focus.
- **Rules:** do not show settings for unimplemented feature as enabled toggles in v0.1.

### 15. `EmptyState` — MVP

- **Anatomy:** 20–24px symbolic icon, headline 14/500, short body13.
- **Examples:** “No media playing”, “Player unavailable”, “Core disconnected”.
- **Rules:** avoid large illustrations/marketing paragraphs. If recovery possible, provide concrete action.

## Future component specifications (NOT MVP)

### 16. `SystemMetricTile` — FUTURE v0.2

- **Anatomy:** small label (CPU, RAM, battery), numeric value (16/600), simple bar if useful.
- **Size:** suggested 144×72, radius12, padding12.
- **Updates:** avoid oversampling; values may be unavailable. Never show 0 for unknown.
- **Status:** text/numbers not color only.

### 17. `QuickToggle` — FUTURE v0.2

- **Anatomy:** icon20, label13, selected/on/off state; min height40.
- **Behavior:** require explicit action; reflect verified system state, not guessed success.
- **Caveat:** GNOME access controls/permissions vary; unsupported action disabled with explanation.

### 18. `FileShelfItem` — FUTURE v0.3

- **Anatomy:** filetype icon, sanitized filename, size metadata, remove/drag affordance.
- **Security:** don't render arbitrary file path content in shell logs; file privacy by default.
- **Input:** keyboard alternative to drag-and-drop must exist.

### 19. `TimerCard` — FUTURE v0.3

- **Anatomy:** remaining time display24/700, start/pause/reset, subtle progress indicator.
- **Policy:** system time monotonic where available; no loud surprise sound in MVP.

### 20. `CalendarAgendaRow` — FUTURE v0.3

- **Anatomy:** time, title, optional location, clipped single row; avoid exposing private details in idle.
- **Empty:** neutral “No upcoming events” label.
- **Privacy:** calendars opt-in, explicit scopes and permissions.

## Cross-component consistency matrix

| Rule | Compact | Preview | Peek | Expanded | Settings |
|---|---|---|---|---|---|
| Semantic token colors | ✓ | ✓ | ✓ | ✓ | ✓ |
| Reduced-motion variant | ✓ | ✓ | ✓ | ✓ | ✓ |
| Keyboard access | Activate | Reach via click | Native notification policy | Focus + Escape | Full traversal |
| Missing data fallback | Neutral dot | Empty subtitle | Native GNOME | EmptyState | Error row |
| Core disconnected | Keep capsule | No media metadata | Local GNOME unaffected | Disabled controls | Reconnect status |

## State diagram (textual)

```
COMPACT --hover dwell--> PREVIEW --click--> EXPANDED
   |                    |                 |
   | notification       | leave (+delay)  | dismiss/Escape
   v                    v                 v
  PEEK  --timeout-->  COMPACT <-----------+

All visible states --fullscreen on--> HIDDEN
HIDDEN --fullscreen off--> COMPACT (no stale PEEK)
```

The actual event reducer is defined in `extension/lib/interactionState.js` of the M0 starter. This document specifies desired visual behavior; it does not claim the existing prototype implements every event yet.
