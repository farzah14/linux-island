# Linux Island v0.1 — Release Readiness & Acceptance Checklist

## 1. Hardware & Execution Context

- **Host Machine:** x86_64, Linux kernel 7.0.0-38-generic
- **CPU:** Intel Core with VT-x hardware virtualization
- **RAM:** 14 GiB total, 5.9 GiB available
- **Operating System:** Ubuntu 26.04.1 LTS (Resolute Raccoon)
- **Desktop Environment:** GNOME Shell 50.1 / Wayland session (`XDG_SESSION_TYPE=wayland`)
- **Qt Version:** Qt 6.10.2 (Core, DBus, Test, Quick, Qml)
- **Compiler:** GCC 15.2.0 (g++ 15.2.0-16ubuntu1)
- **Build System:** CMake 4.2.3, Ninja 1.13.2
- **GJS Version:** 1.88.0
- **Node.js Version:** v22.22.1

---

## 2. Acceptance Criteria (AC-01 .. AC-10) Status

| AC | Name | Implementation Card | Status | Evidence |
|---|---|---|:---:|---|
| **AC-01** | Compact Capsule UI | M0-02, M3-14B | **VERIFIED (Static / Design)** | Center panel `PanelMenu.Button`, scoped `.linux-island__capsule` styling, Warm Minimalist tokens. |
| **AC-02** | Hover Preview | M0-03, M3-14A/B | **VERIFIED** | Pure 5-state reducer + GJS controller transitions `COMPACT` ↔ `PREVIEW` on `HOVER_ENTER`/`HOVER_LEAVE`. |
| **AC-03** | Expand / Dismiss | M0-03, M3-14A/B | **VERIFIED** | `CLICK` transitions to `EXPANDED`, Escape key dispatches `DISMISS` returning to `COMPACT`. |
| **AC-04** | Media & Controls | M2-10..13 | **VERIFIED** | Bounded MPRIS normalizer (`tst_media_normalizer`), async player registry (`tst_mpris_flow`), transport controls (`MprisController`). |
| **AC-05** | Native Notifications Unchanged | M4-17 | **VERIFIED** | Zero interception of `org.freedesktop.Notifications`; native GNOME notification authority preserved. |
| **AC-06** | Smart Adaptive Fullscreen | M0-04, M3-15A | **VERIFIED** | Pure policy (`tst_display_policy` with 8 checks); Mutter window tracking on primary display; maximized windows do not hide Island. |
| **AC-07** | Settings Persist and Sync | M1-08, M4-16 | **VERIFIED** | Atomic persistence via `QSaveFile` (`tst_settings_schema`, `tst_core_dbus`); QML settings app synchronized over D-Bus. |
| **AC-08** | Core Recovery & Restart | M1-09, M5-20 | **VERIFIED** | Monotonic `RevisionClock` per process (`tst_revision_clock`); GJS `CoreProxy` reconnects and resets state on owner `:1.X -> null -> :1.Y`. |
| **AC-09** | Extension Lifecycle | M0-02, M5-20 | **STATIC PASS / RUNTIME PENDING** | Single instance `enable()` guard, clean actor destruction in `disable()`. Live 10-cycle test prepared in `build/test-compat-gnome50/`. |
| **AC-10** | Performance Evidence | M4-18, M5-21 | **PARTIALLY MEASURED** | Core RSS measured ~14.2 MB (< 30 MB budget). Frame latency / live FPS marked **NOT MEASURED** on primary desktop. |

---

## 3. Security, Privacy & Safety Matrix

- **D-Bus Schema:** Immutable Core1 contract frozen (`schemas/io.github.linuxisland.Core1.xml`), verified by CTest `dbus-schema`.
- **Privilege Boundary:** 100% user-level execution; no `sudo`, no root daemons, no system bus modifications.
- **Privacy Policy:** Zero telemetry, no external network requests, no remote artwork downloads (vetted local `file://` only).
- **Crash Isolation:** Shell extension runs fully asynchronous D-Bus calls via `Gio.Cancellable`; Core service crash does not block or crash GNOME Shell.

---

## 4. Unsupported Scope & Documented Limitations in v0.1

- **Desktop Environments:** GNOME 45–50 on Wayland or X11 is the primary target
  and uses the Shell extension in Dynamic Mode. KDE Plasma (Wayland with the
  optional KWin rule, X11 without), XFCE, Cinnamon, MATE, i3 and bspwm run the
  Qt overlay. Sway/Hyprland Wayland and GNOME floating/integrated modes are
  experimental; a Wayland session without XWayland is unsupported. The full
  matrix is in [`desktop-environments.md`](desktop-environments.md).
- **Display Modes:** Dynamic Mode is the supported path. Floating Mode and
  Integrated Mode remain experimental on GNOME.
- **Artwork Fetching:** Remote HTTP/HTTPS album art downloads are intentionally disabled for security.
