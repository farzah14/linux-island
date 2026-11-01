# Linux Island — Testing & Deployment Guide (M5)

## 1. Test Suite Execution

### Automated Build & Unit Tests (CTest)
```bash
cmake --preset dev
cmake --build build/dev
ctest --test-dir build/dev --output-on-failure
```
Executes all automated C++/Qt unit and integration suites:
- `revision-clock`: monotonic revision counters and instance ID generation.
- `settings-schema`: schema validation, enums, length limits, and all-or-nothing patches.
- `media-normalizer`: bounded MPRIS metadata normalization and URL safety.
- `player-selection`: deterministic active player priority policy.
- `dbus-schema`: Core1 introspection XML signature verification.
- `core-dbus`: live private session bus service registration, introspection, and IPC.
- `mpris-flow`: asynchronous player discovery and metadata change propagation.
- `search-provider`: search URL building, percent-encoding, and navigation scheme validation.
- `cookie-importer`: v24+ digest stripping, expiry rejection, and decrypt success/failure separation.
- `companion-persistence`: two real companion launches share one cookie jar (skips when WebEngine is unavailable).
- `packaging-install`: staged `cmake --install`, systemd unit substitution, AppStream/desktop validation and CPack TGZ+DEB.
- `launcher-routing`: GNOME extension vs Qt overlay routing, XWayland platform selection, argument-only commands.
- `local-install`: `install-local.sh` → `uninstall-local.sh` round trip in a throwaway `$HOME`.
- `extension-notification-adapter`: the notification bridge under Node (registered when `node` is present).

### Build Dependencies for Search

The embedded companion adds three hard build requirements beyond the base Qt
modules: `Qt6WebEngineQuick`, `Qt6WebEngineCore`, `Qt6Sql`, and OpenSSL
(`libssl-dev`). Configure fails without them, by design — a silently missing
WebEngine would turn the Search tab into a no-op.

Runtime cookie import additionally needs an unlocked Secret Service keyring.
Set `ISLAND_NO_COOKIE_IMPORT=1` to disable import, for example in CI.

### JavaScript Pure Tests (Node.js & GJS)
```bash
node tests/extension/state-machine.test.js
gjs -m tests/extension/state-machine.test.js

node tests/extension/display-policy.test.js
gjs -m tests/extension/display-policy.test.js

node tests/extension/island-controller.test.js
gjs -m tests/extension/island-controller.test.js

node tests/extension/core-proxy.test.js
gjs -m tests/extension/core-proxy.test.js

node tests/extension/media-view.test.js
gjs -m tests/extension/media-view.test.js

node tests/extension/controller.test.js
gjs -m tests/extension/controller.test.js

node tests/extension/search-engines.test.js
gjs -m tests/extension/search-engines.test.js
```

### Static Quality Assurance
```bash
python3 scripts/dev/verify-kit.py
python3 tests/integration/test_m0_scaffold.py
python3 design-system/qa/verify_tokens.py
python3 design-system/qa/test_warm_palette.py
```

---

## 2. Local Installation & Verification (User-level)

### Install
```bash
bash packaging/dev/install-local.sh --build
```
The script runs `cmake --install` into `~/.local` (override with `--prefix`),
moves the systemd user unit into `~/.config/systemd/user/`, and installs the
XDG autostart entry. Binaries land in `~/.local/libexec/` and `~/.local/bin/`,
the extension in `~/.local/share/gnome-shell/extensions/linux-island@local`.

Every installed path is recorded in
`~/.local/share/linux-island/installed-files.txt`; the script verifies each one
exists and prints `Verified: <n> installed files.`.

`--no-systemd` skips the unit (useful on non-systemd sessions) and
`--no-autostart` skips the autostart entry. There is no UI systemd unit: the Qt
overlay is a graphical client that exits on GNOME by design, so it is started by
the XDG autostart entry instead.

### Start Core Service
```bash
systemctl --user start linux-island-core.service
systemctl --user status linux-island-core.service
```

### Uninstall & Reversal
```bash
bash packaging/dev/uninstall-local.sh
```
Stops the service, disables the extension, removes every path in the manifest
plus paths written by older releases, and reports the preserved settings
location. `--purge-config` deletes `~/.config/linux-island` as well.

---

## 3. Failure Injection & Recovery (Task 20)

- **Daemon Kill & Restart:**
  When `linux-island-core` process is killed (`kill -9 $(pgrep linux-island-core)`), systemd restarts it (`Restart=on-failure`). The GNOME extension proxy detects `NameOwnerChanged` (`:1.X -> null -> :1.Y`), clears stale media actions, and retrieves fresh state with new `instanceId` without crashing GNOME Shell.
- **MPRIS Disappearance:**
  When a media player exits mid-playback, `PlayerRegistry` clears the active player and emits `mediaStateChanged` with status `Stopped`.
- **Malformed Settings Injection:**
  Oversized or invalid D-Bus calls to `UpdateSettings` return `org.freedesktop.DBus.Error.InvalidArgument` without corrupting persisted disk storage.
# Core startup at each desktop login

Core is wanted by and part of `graphical-session.target`. The user manager's
`default.target` may remain active across logouts, so enabling Core only there
does not recover it for a subsequent desktop session. Do not add
`After=graphical-session.target`: the target already orders after its wanted
services, and the reverse ordering would create a cycle.

For an existing installation, back up the installed service file, copy
`packaging/systemd-user/linux-island-core.service.in` into
`~/.config/systemd/user/linux-island-core.service`, then run:

```bash
systemctl --user daemon-reload
systemctl --user reenable linux-island-core.service
systemctl --user start linux-island-core.service
```

`reenable` migrates the old `default.target.wants` link to
`graphical-session.target.wants`. This changes Core startup only and does not
install or reload the Shell extension. Validate the unit with
`python3 tests/integration/test_session_service.py` and
`systemd-analyze --user verify ~/.config/systemd/user/linux-island-core.service`.
A successful logout/login cycle still requires manual runtime acceptance; never
stop `graphical-session.target` inside the user's active desktop as a test.
