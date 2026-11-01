# Desktop environments

Linux Island has two rendering paths. GNOME 45–50 in Dynamic Mode draws the
capsule inside the Shell; every other session runs the Qt overlay, preferring
XWayland so the window can be positioned at the top centre.

| Session | Path | Status |
| --- | --- | --- |
| GNOME 45–50, dynamic, Wayland or X11 | Shell extension | Supported; runtime acceptance still requires a disposable GNOME 45/46/47/48/49 session |
| GNOME, floating/integrated | Qt overlay via XWayland | Experimental; Mutter may ignore top-center placement |
| KDE Plasma 6 Wayland | Qt overlay via XWayland + optional `kwin-linux-island.kwinrule` | Supported with the rule for above/skip-taskbar; position relies on KWin honoring requested geometry |
| KDE Plasma X11, XFCE, Cinnamon, MATE, i3, bspwm | Qt overlay | Supported, no rules needed |
| Sway / Hyprland Wayland | Qt overlay via XWayland + `sway.conf` / `hyprland.conf` | Experimental; top-center position is not guaranteed by the compositor |
| Wayland session with no `DISPLAY` (no XWayland) | Qt overlay native | Unsupported: no top-center pinning, no input shaping |

## Installing the window rules

The rules ship in `share/linux-island/window-rules/` and are optional
refinements: the overlay starts and stays usable without them.

- **KWin** — System Settings → Window Management → Window Rules → Import, then
  pick `kwin-linux-island.kwinrule`.
- **Hyprland** — add `source = /usr/share/linux-island/window-rules/hyprland.conf`
  to `hyprland.conf`.
- **Sway** — add `include /usr/share/linux-island/window-rules/sway.conf` to the
  Sway config.
