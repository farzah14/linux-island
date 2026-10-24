# Linux Island — Design System v1.0

**ID:** LI-DS-001
**Tanggal:** 2026-10-24
**Status:** Design baseline for review and implementation (not yet runtime-verified)
**Brand:** Graphite & Mint
**Produk:** Linux Island v0.1 MVP; design catalog anticipates later releases
**Platform pertama:** Ubuntu 24.04 GNOME Wayland; Qt/QML Settings and GNOME Shell/GJS Island UI

> **Tujuan:** menyediakan bahasa visual, interaction contract, dan single source of truth token yang konsisten antara GNOME Shell Extension dan aplikasi Qt/QML tanpa menjanjikan kemampuan compositor yang belum diuji.

## 1. Konsep dan karakter visual

**Modern Minimalist, bukan replika macOS.** Desain harus terasa native terhadap Linux, terbaca pada wallpaper terang/gelap, tenang saat idle, dan aktif hanya ketika pengguna membutuhkannya. Identitas Graphite & Mint menggunakan permukaan graphite netral dan aksen mint selektif. Tidak menggunakan gradien spektakuler, glow neon, emoji untuk kontrol, 3D, atau bounce berlebihan.

**Prinsip yang tidak boleh dilanggar:**

1. **Calm by default** — COMPACT tidak berganti bentuk karena perubahan media pasif.
2. **Intent first** — hover preview, klik membuka detail, notifikasi normal tidak merebut EXPANDED.
3. **One primary action** — maksimal satu aksi dominan per panel, sisanya tonal/ghost.
4. **Accessible as-designed** — identitas tidak bergantung pada warna; teks dan fokus memiliki kontras yang diuji.
5. **Wallpaper independent** — background teks kritikal harus solid/opaque; jangan memerlukan blur untuk keterbacaan.
6. **Token parity** — kedua renderer menggunakan nilai semantik yang sama, tetapi menerjemahkannya ke platform masing-masing.
7. **Degradation gracefully** — jika Core mati, render fallback lokal; jangan menampilkan kontrol semu.

### 1.1 Arah visual yang disetujui

| Elemen | Keputusan |
|---|---|
| Aksen utama | Mint `#8BD9A9` untuk dark; evergreen `#2C7355` untuk light demi kontras |
| Surface utama dark | Graphite `#171A18` |
| Surface utama light | Putih `#FFFFFF` di atas canvas `#F5F7F5` |
| Tipografi | System font; preferensi Cantarell/Noto Sans jika fallback diperlukan |
| Ikon | Monoline 1.75–2px optical stroke, rounded joins, native/symbolic style |
| Shape | Capsule pill, panel radius 24px, nested card 12–16px |
| Motion | Subtle ease-out, tidak memakai bouncy spring |
| Tekstur | Flat; subtle border opsional; hindari shadow berlebihan |

## 2. Arsitektur token

Token utama berada di `tokens/tokens.json`; dua file `tokens/dark.flat.json` dan `tokens/light.flat.json` adalah snapshot turunan untuk konsumsi tool. `tokens/tokens.json` adalah sumber kebenaran.

**Tiga lapisan:**

- **Primitive:** `palette.graphite.900`, `palette.mint.300`, dsb. Nilai warna mentah.
- **Semantic:** `semantic.dark.text.primary`, `semantic.light.control.primary`. Konteks fungsional.
- **Component / metrics:** `metrics.componentsPx.compact.width`, `metrics.motionMs.standard`, `metrics.radiusPx.panel`.

**Pemisahan design token vs preference:** token menetapkan default, sedangkan preferensi pengguna (mis. theme, compact size, motion) disimpan oleh Core. Backend tidak mengirimkan hex color melalui D-Bus untuk setiap frame; Extension dan Settings membundel design token yang sama.

**Konvensi:** dot-separated semantic role; size in logical pixels, duration in milliseconds. Angka tidak boleh diperlakukan sebagai physical pixels pada layar HiDPI. Token versi 1.x hanya boleh berubah tanpa breaking change pada nama role existing.

### 2.1 Color foundation

| Primitive | HEX | Pemakaian |
|---|---|---|
| Graphite 950 | `#111411` | scrim / deepest background |
| Graphite 900 | `#171A18` | dark Island surface |
| Graphite 850 | `#1D211E` | overlay background |
| Graphite 800 | `#262B28` | raised card |
| Graphite 700 | `#323A34` | hover background |
| Graphite 600 | `#455047` | subtle stroke, decorative separators |
| Graphite 400 | `#89948D` | tertiary dark text |
| Graphite 300 | `#B8C2BB` | secondary dark text |
| Graphite 050 | `#F5F7F5` | primary dark text/light canvas |
| Mint 300 | `#8BD9A9` | primary dark accent |
| Mint 200 | `#BAEACA` | dark accent hover |
| Mint 700 | `#2C7355` | primary light accent |
| Mint 800 | `#226646` | light accent hover |

**Mengapa aksen dark/light berbeda?** Warna mint yang cerah sulit dipakai sebagai teks/ikon pada surface putih. Light menggunakan mint yang lebih gelap agar tetap sesuai prinsip Graphite & Mint dan terbaca.

### 2.2 Semantic colors

| Role | Dark | Light | Aturan |
|---|---|---|---|
| `surface.island` | `#171A18` | `#FFFFFF` | solid; selalu memiliki kontras dengan teks |
| `surface.raised` | `#262B28` | `#E8EEE9` | nested panels |
| `text.primary` | `#F5F7F5` | `#202923` | heading/body |
| `text.secondary` | `#B8C2BB` | `#47584C` | subtitle/metadata |
| `text.tertiary` | `#89948D` | `#526458` | noncritical status timestamps |
| `accent.primary` | `#8BD9A9` | `#2C7355` | emphasize intent |
| `text.onAccent` | `#171A18` | `#FFFFFF` | primary action text |
| `border.focus` | `#8BD9A9` | `#2C7355` | focus ring 2px |
| `status.warning` | `#E9B872` | `#875000` | always pair with icon/text |
| `status.danger` | `#FF9B94` | `#A42C34` | always pair with icon/text |

**Status:** success/connected = mint + check/icon + label; warning = amber + alert glyph + label; error = red + error glyph + label. Tidak pernah warna saja.

**Contrast QA:** gunakan `qa/contrast-report.json` untuk hasil penghitungan color-pair. Target desain mengikuti WCAG 2.2 AA: teks normal ≥4.5:1, komponen visual esensial ≥3:1. Ini bukan deklarasi bahwa keseluruhan UI sudah conformant; layering, blur, rendering fonts dan real-world capture harus diuji terpisah.

## 3. Typography

| Token | Px | Weight | Line-height | Kegunaan |
|---|---:|---:|---:|---|
| `fontPx.tiny` | 11 | 500 | 1.2 | counter non-kritis, jangan untuk instruksi |
| `fontPx.caption` | 12 | 400/500 | 1.4 | timestamps, metadata |
| `fontPx.bodySmall` | 13 | 400 | 1.4 | secondary content |
| `fontPx.body` | 14 | 400 | 1.4 | normal controls and settings |
| `fontPx.bodyEmphasis` | 16 | 600 | 1.4 | currently playing track |
| `fontPx.headingSmall` | 18 | 600 | 1.2 | settings section |
| `fontPx.heading` | 20 | 600 | 1.2 | settings panel title |
| `fontPx.display` | 24 | 700 | 1.2 | timers/large counters |

Use system font. Do not embed proprietary fonts. Support text scale increase 200% for settings screens via reflow/scrolling; compact UI may truncate nonessential metadata with accessible full label. Use actual ellipsis and tooltip for long title, never scale text down to 8px to fit.

## 4. Spacing, geometry, density

4px spacing scale: `0=0, 1=4, 2=8, 3=12, 4=16, 5=20, 6=24, 7=28, 8=32, 10=40, 12=48`. Component nesting uses 8–16px gaps; 24px for settings sections. Avoid ad hoc 7/11/19px gaps.

Shape: `xs=4, sm=8, md=12, lg=16, xl=20, panel=24, pill=999` logical pixels. Panel uses 24px radius and remains clipped to surface bounds. Avoid opaque giant shadow; prefer 1px border on light and dark where needed.

| Island state | Default size | Internal layout | Responsive behavior |
|---|---|---|---|
| `HIDDEN` | 0 × 0 | none | no input target |
| `COMPACT` | 124 × 32 | icon/dot + short status | min 96, max 240; avoid title marquee |
| `PREVIEW` | 248 × min 56 | icon/artwork + 1–2 text lines | clamp to available width |
| `PEEK` | 296 × min 72 | icon + title + 2-line snippet | max height 104, no scrolling |
| `EXPANDED` | 360 × min 184 | header + media + controls | width ≥280, height ≤320 default; scroll internal content as needed |
| `Settings Window` | 680 × ≥560 | sidebar/sections | min width 520; reflow at smaller viewport |

These are **design targets**, not guaranteed Shell actor pixel sizes. For GNOME top panel integration, cap dimensions to the available panel/monitor geometry and use shell-supported placement. Don't claim to overlap fullscreen apps reliably.

### 4.1 Hit areas

- Icon glyph 16–20px, visual circle 32px, **hitbox 40×40px** in expanded UI.
- Sliders: visual progress 4px, interaction band ≥24px vertical, keyboard accessible.
- Settings rows ≥40px high and focusable where interactive.
- Use hitbox extents that do not collide with adjacent actors or GNOME panel targets.

## 5. The five Island states

**State ownership remains in GJS Extension.** The Core supplies data and preferences, not frame-by-frame animation commands.

| State | Visual | Trigger | Exit | Accessibility |
|---|---|---|---|---|
| COMPACT | 124×32 pill; quiet activity indicator | desktop normal | hover, click, PEEK, fullscreen | accessible name “Linux Island” |
| PREVIEW | 248×56; title/artist or latest context | hover dwell 120ms | pointer leaves +240ms debounce; click | not hover-only; same info reachable via click |
| EXPANDED | 360×184 min; interactive media content | click | Escape, click outside within supported actor scope | keyboard focus, visible ring, focus return |
| PEEK | 296×72; one short notification | allowed incoming notification | 3.5s timeout, context-priority rule | do not block keyboard workflow |
| HIDDEN | no actor visual/input | fullscreen visibility policy | fullscreen ends | no invisible focus traps |

**Priority:** fullscreen policy > user-expanded panel > GNOME notification policy > passive media metadata. Never allow a normal notification to forcibly replace expanded interaction. DND suppresses PEEK. An urgent GNOME notification is still handled by GNOME; this UI doesn't bypass system policy.

**Animation interruptions:** only one active geometry transition; new events interrupt/retarget existing transition. Stale PEEK must not animate after fullscreen ends. Debug state change logs must omit notification content.

## 6. Motion & interaction

| Token | Default | Usage |
|---|---:|---|
| `motionMs.micro` | 90ms | small icon/feedback |
| `motionMs.fast` | 150ms | hover micro-feedback |
| `motionMs.standard` | 220ms | compact→preview or expanded |
| `motionMs.emphasis` | 300ms | larger panel change |
| `motionMs.hoverEnterDelay` | 120ms | prevent accidental hover |
| `motionMs.hoverExitDelay` | 240ms | pointer exit grace |
| `motionMs.peekHold` | 3500ms | non-urgent peek lifetime |
| `motionMs.peekCooldown` | 250ms | suppress rapid oscillation |
| `motionMs.reducedOpacity` | 80ms | reduced motion crossfade |

Enter easing `cubic-bezier(0.2,0,0,1)`; exit `cubic-bezier(0.4,0,1,1)`. These are design descriptions, not direct enums in Qt or GNOME; preserve similar motion profile when translating. Use scale 0.98→1.00 max if needed, no spring bounce or pulsing for infinite animation. Prefer opacity/transform over repeatedly changing layout in hot paths when supported by the renderer.

**Reduced motion:** disable spatial transforms; geometry changes are immediate and optional ≤80ms opacity only. Respect GNOME/Qt accessibility settings where available; independent override in Settings can force off.

**Sound/Haptics:** no automatic UI sounds for MVP. No haptics desktop assumption.

## 7. Component model

Detailed props/states/layout/behavior: [`COMPONENT_SPECIFICATIONS.md`](components/COMPONENT_SPECIFICATIONS.md).

**MVP components:** `IslandHost`, `CompactCapsule`, `PreviewCapsule`, `ExpandedPanel`, `NotificationPeek`, `MediaCard`, `PlaybackControls`, `PlaybackProgress`, `IconButton`, `ActivityDot`, `CoreStatus`, `SettingsWindow`, `ThemePicker`, `SettingsRow`, `EmptyState`.

**Future version components:** `SystemMetricTile`, `QuickToggle`, `FileShelfItem`, `TimerCard`, `CalendarAgendaRow`. Design tokens cover them but they are **not accepted as v0.1 commitments**.

## 8. Settings screen design

Navigation: Appearance / Behavior / Media / Notifications / About. Do not show disabled fake toggles as if implemented. Each panel has one clear title, description, section dividers only when necessary, and visible confirmation on settings changes.

- **Appearance:** follow system / dark / light, compact width (bounded), animation preference, contrast preview.
- **Behavior:** Smart Adaptive default, hover preview enable, notification peek duration (when feature supported).
- **Media:** active player selection/auto, artwork visibility, media controls supported by player.
- **Notifications:** enable peek (if supported), DND honored, no persistent notification storage.
- **About:** version, compatibility matrix, diagnostics with no private content.

Use Qt/QML for Settings, not GNOME Shell components. Settings may show brief source-of-truth preview drawn in QML but must not pretend to be a compositor-perfect GNOME renderer.

## 9. Data flow and design system boundaries

```
               tokens/tokens.json (single source of truth)
                      |                      |
             flattened dark/light      runtime theme bridge
                      |                      |
           GNOME GJS / St CSS         Qt/QML theme singleton
                      |                      |
                 UI state + skin       Settings window
                      \                      /
                         D-Bus Core1
                 (media data and preferences)
```

**No design colors on the D-Bus API**; Core stores preference `theme` / `motion`. UI renderer resolves semantic tokens locally. If an unsupported property arrives, use documented theme defaults and log a non-fatal warning.

**Implementation note:** existing M0 `extension/ui/capsule.js` uses hardcoded `#202124`, `#ffffff`, and `16px` radius. These are **temporary bootstrap values** and must be replaced only during an explicitly planned implementation task, not silently during the design-system documentation phase.

See [`INTEGRATION_GUIDE.md`](INTEGRATION_GUIDE.md) for translation to GJS and QML.

## 10. Theming constraints

1. Default dark follows system when detectable; fallback to dark with predictable contrast.
2. Expose exactly three choices: System / Dark / Light. System updates without Shell restart where platform permits.
3. Light and dark share components, geometry, and behavior; only semantic colors differ.
4. Album artwork may contain arbitrary colors; overlay text on artwork needs an independent opaque surface, not raw tinting.
5. No 0.7-alpha background for text-bearing capsules on unknown wallpaper, as that cannot guarantee contrast.
6. Accent override not included in MVP. If future user-custom accent is added, regenerate accessible foreground/hover/focus tokens and test rather than accepting arbitrary input unvalidated.
7. High contrast / reduced motion cannot be suppressed by developer-only presets.

## 11. Responsive and platform policy

- Use logical pixel tokens; compare GNOME stage allocation and available monitor width before expanding. Clamp widths to fit with ≥8px safe insets.
- At font enlargement, prefer vertical growth and scrollable expanded content; never clip essential action buttons.
- GNOME top panel mounting should not obscure existing status icons and Activities; GNOME integration feasibility takes precedence over theoretical center alignment.
- On screens smaller than expanded target width, cap at `availableWidth − 2×8px` and adjust layout; `minWidth` is a preference, not justification to overflow.
- On fullscreen, follow previously approved HIDDEN policy. Floating and Integrated modes on other compositors belong to later versions.
- GNOME Shell GJS actors require actor cleanup and reactive state handling; Qt/QML window is separate and will not be embedded inside the Shell.

## 12. Acceptance checklist

- [ ] Both themes checked under real GNOME dark/light wallpaper; no wallpaper-dependent text contrast.
- [ ] Text/button/icon/focus critical color pairs meet specified contrast thresholds.
- [ ] No state causes duplicate notification popups.
- [ ] COMPACT, PREVIEW, EXPANDED, PEEK and HIDDEN behave per state machine.
- [ ] 40px hitbox available in expanded controls; keyboard access where supported.
- [ ] Escape and click-outside close expanded state; focus returns safely.
- [ ] Reduced motion disables spatial transitions.
- [ ] Truncation retains full title through accessible name or tooltip.
- [ ] Theme changes do not require restarting Linux Island where possible.
- [ ] Unknown media metadata/album art fails gracefully without broken image placeholders.
- [ ] Settings app uses semantically identical tokens to GJS Island.
- [ ] Terminal reports no uncaught exception on repeated enable/disable.
- [ ] Future-release UI components are not advertised as working MVP features.

## 13. Supporting files

- `tokens/tokens.json` — source of truth.
- `tokens/dark.flat.json`, `tokens/light.flat.json` — derived export snapshots.
- `components/COMPONENT_SPECIFICATIONS.md` — component-level specs.
- `MOTION_AND_INTERACTION.md` — transition and interruption rules.
- `ACCESSIBILITY_AND_QA.md` — WCAG color math, keyboard testing, non-color cues.
- `INTEGRATION_GUIDE.md` — portable implementation guidance and ownership.
- `qa/contrast-report.json` — computed pair checks (no alpha).

## 14. Sources and terminology

- W3C WCAG 2.2, 1.4.3 and 1.4.11: https://www.w3.org/TR/WCAG22/
- Qt 6 QML Singletons: https://doc.qt.io/qt-6.12/qml-singleton.html
- GNOME Shell Extensions guides: https://gjs.guide/extensions/
- Project Technical Design v0.1: `../docs/superpowers/specs/2026-10-24-linux-island-v0.1-design.md`

Values and proportions in this document are **project design decisions**, not empirical GNOME or Qt performance measurements. Verify visually and through integration tests before shipping.
