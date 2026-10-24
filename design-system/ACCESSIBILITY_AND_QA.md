# Accessibility & QA — Linux Island DS v1.0

## Standards used as design targets

W3C WCAG 2.2 contrast criteria are useful for desktop UI design even though they do not by themselves certify GNOME Shell extension accessibility:

- **Normal text:** ≥4.5:1 contrast for expected foreground/background pairs (WCAG 1.4.3 AA).
- **Large text / non-text UI essentials:** ≥3:1 where applicable (WCAG 1.4.3, 1.4.11 AA).
- **Non-color cues:** icon + text conveys warning/error/success; never color alone (WCAG 1.4.1).
- **Keyboard:** all critical actions in expanded panel and settings reachable without mouse where Shell permits.
- **Target areas:** 40×40 logical px for media icon buttons, broader than the WCAG 2.2 minimum 24×24 CSS px target-size reference, with desktop context caveats.
- **Reduced motion:** spatial animation disabled when preference requests it.

Official reference: https://www.w3.org/TR/WCAG22/

## Contrast method

Measured against opaque semantic token backgrounds. WCAG relative luminance uses linearized sRGB values, then `(L_lighter + 0.05)/(L_darker + 0.05)`. Automated results are in `qa/contrast-report.json` and cover 13 critical pairs for each theme.

**Important:** These calculations are not a full UI accessibility audit. Real-world translucent compositing, font rendering, display configuration, media artwork, and focus placement require visual/manual testing.

### What to test manually

| Test | Required outcome |
|---|---|
| Compact on near-black wallpaper | capsule remains visibly distinct |
| Compact on near-white wallpaper | shadow/border ensures separability |
| Light/dark labels | legible at intended text scale |
| Accent buttons | text/icons remain readable |
| Album art | arbitrary artwork doesn't obscure controls |
| Focus keyboard navigation | focused item visibly obvious |
| Missing Core | controls disabled and unambiguous |
| Reduced motion | no spatial movement |
| Screen reader | appropriate names for available controls; no duplicate notification speaking |
| High text scaling | settings reflows; expanded panel preserves essential controls |
| Notifications + DND | no Island PEEK violating DND |
| 10 extension enable/disable cycles | no stale actor, pending timer, or focus trap |

## Error and copy guidelines

Use short, truthful status language: “No media playing”, “Media player unavailable”, “Core disconnected”, “This action is unavailable”. Don't show “Connected” based purely on a requested action. Don't imply a notification has been saved when it is not stored.

## Security/privacy and user expectation

- Notification text must not be persisted to Core diagnostic logs.
- When the Core restarts, do not briefly flash stale private metadata from old sessions if no player is available.
- External album-art URI is untrusted input. Handle missing, malformed, or oversized artwork without blocking Shell.
- Do not create a fake media transport action that appears successful before player confirms playback.
- Ensure a Settings toggle controls a supported feature; otherwise disable it and explain why.

## QA acceptance gates

1. Contrast JSON reports `allPass=true` and all designated pairs meet threshold.
2. Full 5-state reducer tests pass; no stale PEEK after fullscreen.
3. Feature-specific disabled states confirmed with Core absent and player disconnected.
4. Light/dark themes visually reviewed on reference GNOME machine.
5. GNOME Shell extension lifecycle smoke tests performed on Ubuntu/GNOME baseline.
6. QML Settings and GJS UI show same semantic accent and surface values.
7. Accessibility gaps documented without incorrectly claiming WCAG certification.
