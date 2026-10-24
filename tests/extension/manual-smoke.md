# GNOME 46 Wayland manual acceptance — M0

**Environment required:** an isolated Ubuntu 24.04/GNOME 46 Wayland VM, disposable test user, or a dedicated test machine with a recoverable session. Do **not** run against a primary daily-use GNOME Shell session for the initial spike.

## Prerequisites
1. Record output of `gnome-shell --version`, `echo "$XDG_SESSION_TYPE"`, `gnome-extensions version`, and `journalctl --user -b --no-pager | tail -n 30`.
2. Copy `extension/` contents into `$HOME/.local/share/gnome-shell/extensions/linux-island@local/` with `metadata.json` directly inside that destination.
3. Restart the **test** GNOME session if a newly installed extension does not appear; do not force-restart GNOME Shell on Wayland.

## Tests (not yet executed)
- [ ] `gnome-extensions info linux-island@local` discovers extension.
- [ ] `gnome-extensions enable linux-island@local` displays one center-panel capsule.
- [ ] `gnome-extensions disable linux-island@local` removes the capsule.
- [ ] Enable/disable ten times; verify no duplicate actor, error, or Shell instability.
- [ ] Fullscreen a video player on primary monitor; record whether panel and capsule are suppressed. **Task 04's Smart Adaptive implementation is not in the scaffold yet.**
- [ ] Switch workspaces and return; watch the capsule's lifetime.
- [ ] `journalctl --user -b` shows no Linux Island-caused GNOME Shell exceptions.
- [ ] Confirm rollback by disabling the extension or removing only `linux-island@local` from the disposable test user.

## Evidence
Record GNOME version, compositor/session type, screenshot, 10-cycle enable/disable result, fullscreen behavior, relevant journal lines, and any compatibility deviations in `docs/compatibility.md`.
