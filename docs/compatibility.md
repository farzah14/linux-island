# Linux Island M0 environment audit

**Date:** 2026-10-24

## Execution container (NOT the user's local Ubuntu machine)

| Check | Observed result | Implication |
|---|---|---|
| Operating system | Debian GNU/Linux 13 (trixie) | Not the Ubuntu 24.04 target |
| Git | Available | Local repository and branch supported |
| CMake, g++, Ninja | Available | Build entrypoint can be generated |
| Qt 6 development libraries | Not installed (`qt6-base-dev`, `qt6-declarative-dev`) | Cannot compile Core here |
| GNOME Shell | Not installed | Cannot execute Shell extension |
| GJS | Not installed | Cannot run GJS test harness here |
| GNOME Wayland session | Not established (`XDG_SESSION_TYPE` unset) | Cannot validate fullscreen, panel, extension lifecycle |
| Node.js 22 | Available | Pure JavaScript reducer tests can execute as a substitute syntax/logic check, not a GNOME integration test |

## Official GNOME baseline

Proposed first acceptance platform: **Ubuntu 24.04 LTS + GNOME 46 + Wayland**. Not tested in this container.

## Local host audit commands (run on the actual Ubuntu test machine)

```bash
cat /etc/os-release
gnome-shell --version
printf 'session type: %s\n' "${XDG_SESSION_TYPE:-unset}"
command -v gjs && gjs --version
command -v gnome-extensions && gnome-extensions version
cmake --version
pkg-config --modversion Qt6Core Qt6DBus Qt6Quick Qt6Qml
```

## Acceptance blockers

- **M0 Task 01 Qt build verification:** blocked by missing Qt 6 development dependencies in container.
- **M0 Task 02 live GNOME enable/disable:** blocked by missing GNOME Shell/Wayland test session.
- **M0 Task 04 Smart Adaptive fullscreen:** blocked by live GNOME API/Wayland test session; implementation deferred to compatibility validation.

No live GNOME acceptance claims can be made until the above checks are completed on the test host.
