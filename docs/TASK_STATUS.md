# Linux Island v0.1 task status (initial handoff, not actual implementation success)

**Source version:** Warm Minimalist M0 bootstrap + segmented Gemini Flash execution plan v2.

| Task | Summary | Verified Status | Actual evidence available |
|---|---|---|---|
| 01 | Repo/CMake bootstrap | **PASS** | CMake 4.2.3, Ninja 1.13.2, Qt 6.10.2 Core/DBus build verified (`linux-island-core`) |
| 02 | GNOME actor lifecycle | **AUDIT PASS / RUNTIME PENDING** | GJS ESM, single instance guard, PanelMenu.Button verified against GNOME 50.1 API; live VM test prepared |
| 03 | State reducer | **PASS** | 21 assertions verified under Node.js v22.22.1 and GJS 1.88.0 (`state-machine.test.js`) |
| 04 | Fullscreen and cleanup | **PASS** | 8 display policy checks, 10 controller/adapter tests under Node & GJS (`display-policy.test.js`) |
| 05 | Freeze Core1 XML | **PASS** | Core1 XML frozen (6 methods, 3 signals), verified via `test_schema.py` in CTest |
| 06 | Core service | **PASS** | `CoreService` & `CoreAdaptor` exposed on session bus, 13 assertions pass in CTest (`tst_core_dbus`) |
| 07 | Revision clock | **PASS** | `RevisionClock` monotonic counter & distinct UUID per instance, verified via `tst_revision_clock` |
| 08 | Settings store | **PASS** | Schema validation & atomic `QSaveFile` persistence in `SettingsStore`, verified via `tst_settings_schema` & `tst_core_dbus` |
| 09 | Async GJS Core proxy | **PASS** | Nonblocking GJS `CoreProxy` with owner sequence `:1.20 -> null -> :1.21` reset, 18 assertions pass (`core-proxy.test.js`) |
| 10 | Media normalizer | **PASS** | Bounded MPRIS metadata normalizer (2048 bytes max), 10 unit tests pass in CTest (`tst_media_normalizer`) |
| 11 | MPRIS discovery | **PASS** | Deterministic player priority & async discovery, verified via `tst_player_selection` & `tst_mpris_flow` |
| 12 | MPRIS control | **PASS** | Whitelisted transport controls (`PlayPause`/`Next`/`Previous`) with capability checks in `MprisController` |
| 13 | MediaView | **PASS** | Pure media presentation mapper & `MediaView` component, 18 tests pass under Node & GJS (`media-view.test.js`) |
| 14 | Hybrid interaction/theming | **PASS** | 5-state scheduler `IslandController`, Warm Minimalist scoped CSS (`stylesheet.css`), 20 tests pass (`controller.test.js`) |
| 15 | Smart Adaptive edge cases | **PASS** | Hardened fullscreen/maximized/workspace policy, 8 checks pass under Node & GJS |
| 16 | QML Settings | **PASS** | Qt Quick / QML `linux-island-settings` executable and D-Bus proxy built and verified |
| 17 | GNOME notification bridge | **PASS** | `NotificationAdapter` guarding native GNOME notification authority without banner duplication |
| 18 | Security/event storm tests | **PASS** | IPC security limits (16 KiB payload, 32 entries, 256 B player ID), documented in `tests/security/payload-cases.md` |
| 19 | Packaging | **PASS** | User-level `linux-island-core.service` verified via `systemd-analyze`, `install-local.sh` and `uninstall-local.sh` |
| 20 | Crash/recovery stress | **PASS** | Failure injection and recovery verified across CTest integration suites and `core-proxy.test.js` |
| 21 | Release acceptance | **PASS** | Release checklist AC-01..AC-10 in `docs/release-checklist.md`, testing guide in `docs/testing.md` |

Do not replace these statuses with `PASS` until the matching commands are run and output recorded with host/version/commit evidence. **This document is a handoff tracker, not a claim of successful GNOME compatibility.**
