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
- [ ] Fullscreen a video player on primary monitor; verify capsule is hidden (`FULLSCREEN_ON`); exit fullscreen; verify capsule restored to `COMPACT` (`FULLSCREEN_OFF`).
- [ ] Switch workspaces and return; watch the capsule's lifetime.
- [ ] `journalctl --user -b` shows no Linux Island-caused GNOME Shell exceptions.
- [ ] Confirm rollback by disabling the extension or removing only `linux-island@local` from the disposable test user.

## Evidence
Record GNOME version, compositor/session type, screenshot, 10-cycle enable/disable result, fullscreen behavior, relevant journal lines, and any compatibility deviations in `docs/compatibility.md`.

---

## GNOME 50.1 Compatibility Assessment (M0-02)

**Host Environment:** Ubuntu 26.04.1 LTS (x86_64), GNOME Shell 50.1, GJS 1.88.0, Wayland.

### Code Audit Findings
1. **Extension Lifecycle:** `Extension` ESM base class (`resource:///org/gnome/shell/extensions/extension.js`) and lifecycle hooks (`enable()`, `disable()`) match GNOME 50 specifications.
2. **Capsule UI & Panel Integration:** `Main.panel.addToStatusArea(role, indicator, position, box)` in GNOME 50 requires `PanelMenu.Button` and automatically disconnects and cleans `Main.panel.statusArea[role]` when the indicator actor is destroyed. The M0 capsule implementation adheres strictly to this contract.
3. **UI Elements:** `St.BoxLayout`, `St.Label`, and `Clutter.ActorAlign.CENTER` remain available in GNOME 50 Mutter/St typelibs (`libst-18.so`, `libshell-18.so`).
4. **Review Guidelines:** No actors or side effects are instantiated at module import time; instantiation occurs strictly within `enable()`, and full destruction occurs within `disable()`.

### Runtime Acceptance Status: BLOCKED (Awaiting User Environment Authorization)
- **Observed Environment:** The active workstation session is a primary daily-use GNOME Shell 50.1 desktop.
- **Constraint:** Per `AGENTS.md` and safety guidelines, extensions must never be installed or enabled in a primary daily-use GNOME session.
- **Prepared Test Staging Package:** `build/test-compat-gnome50/linux-island@local.shell-extension.zip` (staged copy with `"shell-version": ["46", "50"]`; repository source `extension/metadata.json` remains strictly `"46"`).
- **Recommended Procedure (Dedicated User):**
  1. Create test user: `sudo useradd -m -s /bin/bash gnometest && sudo passwd gnometest`
  2. Switch to GDM login screen and log into GNOME Wayland as `gnometest`.
  3. Install and test:
     ```bash
     gnome-extensions install /path/to/linux-island/build/test-compat-gnome50/linux-island@local.shell-extension.zip
     gnome-extensions enable linux-island@local
     # Verify single center capsule
     gnome-extensions disable linux-island@local
     # Verify capsule removed
     # Execute 10-cycle enable/disable test
     for i in {1..10}; do
         gnome-extensions enable linux-island@local
         sleep 0.5
         gnome-extensions disable linux-island@local
         sleep 0.5
     done
     # Check logs
     journalctl --user -b -o cat /usr/bin/gnome-shell | grep -i "linux-island"
     # Uninstall
     gnome-extensions uninstall linux-island@local
     ```
  4. Rollback: Log back into `farzah` and remove test user: `sudo userdel -r gnometest`.
- **Status:** BLOCKED pending user authorization and execution of isolated test user session.
