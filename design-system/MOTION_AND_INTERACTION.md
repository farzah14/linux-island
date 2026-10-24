# Motion & Interaction — Linux Island DS v1.0

## Event arbitration

UI state and animation scheduling live in GNOME Shell Extension (GJS). C++ Core publishes data changes and handles media control commands. User events are prioritized by local Extension reducer, not by the Core's event arrival order.

**Priority:** `fullscreen policy > active interaction > GNOME notifications policy > passive media`.

| Current | Event | Result | Timing |
|---|---|---|---|
| COMPACT | hover enter | PREVIEW | 120ms dwell, 220ms visual |
| PREVIEW | hover leave | COMPACT | 240ms grace, 150ms visual |
| COMPACT/PREVIEW | click | EXPANDED | 220ms visual |
| EXPANDED | Escape/click outside in actor boundary | COMPACT | 150ms visual |
| COMPACT | allowed notification | PEEK | 220ms visual, 3500ms hold |
| PEEK | hold elapsed | COMPACT | 150ms visual |
| Any visible | fullscreen enter | HIDDEN | immediate policy, no stale popups |
| HIDDEN | fullscreen exit | COMPACT | immediate or 80ms opacity |
| EXPANDED | passive media update | EXPANDED | data replace, no size animation |
| EXPANDED | notification | EXPANDED | GNOME native notification only |

## Interruptions

- A new UI state cancels the current geometry transition and interpolates toward the new endpoint; never queue multiple spring animations.
- `PEEK_REQUEST` while `PEEK` may update content subject to cooldown and duplicate suppression; never grow an unbounded notification queue.
- A delayed hover trigger must validate both current state and actor presence when its callback fires.
- `disable()` of Extension cancels all scheduled operations, signals, animations, and actors.
- A reconnect must re-fetch snapshot and discard stale events from earlier revision.

## Motion profile

- Main enter: 220ms, ease-out `[0.2,0,0,1]`.
- Main exit: 150ms, accelerated easing `[0.4,0,1,1]`.
- Small icons: 90ms.
- Long expansions: up to 300ms; no bounce or infinite loop.
- Visual interpolation: size + opacity sparingly; use transforms where compositor permits without stale hitboxes.
- Never animate album artwork with 3D spins, equalizer bars on idle, or constant glowing rim.

## Reduced motion

When system reduced motion is active or user override is `off`, animate **no spatial movement**. Component dimensions switch immediately; optional opacity ≤80ms is allowed if not prohibited by user preference. Do not depend on a browser CSS `prefers-reduced-motion` flag inside GJS: detect it through the GNOME/GTK facilities available on the validated target version.

## Keyboard behavior

- Enter/Space activates the capsule when focused and triggers transport buttons.
- Escape dismisses EXPANDED, and restores logical focus when possible.
- Hover is never the only route to essential information; click opens the same information.
- No global keyboard grabbing for MVP. Avoid pretending QML keyboard shortcuts can control Shell globally on Wayland.
- Focus ring 2px, focus token, 2px outset; never remove without a visible alternative.

## Smart Adaptive

Fullscreen detection comes from GNOME Shell/Mutter APIs of the tested GNOME version. On entering fullscreen, cancel delayed PEEK; do not show content on monitor until fullscreen ends. On exit, go to COMPACT, not previous notification state. If monitor/fullscreen API isn't reliable, choose the safest nonintrusive fallback and document behavior in compatibility matrix.

## Visual regression fixtures

Check at least: idle dark, idle light, preview media, expanded media, notifications PEEK (if supported), fullscreen hidden, disconnected Core, disabled media controls, very long song title, missing album art, 200% text scale settings, reduced motion, DND enabled.
