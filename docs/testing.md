# Linux Island — Testing & Deployment Guide (M5)

## 1. Test Suite Execution

### Automated Build & Unit Tests (CTest)
```bash
cmake --preset dev
cmake --build build/dev
ctest --test-dir build/dev --output-on-failure
```
Executes all 7 automated C++/Qt unit and integration suites:
- `revision-clock`: monotonic revision counters and instance ID generation.
- `settings-schema`: schema validation, enums, length limits, and all-or-nothing patches.
- `media-normalizer`: bounded MPRIS metadata normalization and URL safety.
- `player-selection`: deterministic active player priority policy.
- `dbus-schema`: Core1 introspection XML signature verification.
- `core-dbus`: live private session bus service registration, introspection, and IPC.
- `mpris-flow`: asynchronous player discovery and metadata change propagation.

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
bash packaging/dev/install-local.sh
```
Installs binaries to `~/.local/libexec/` and `~/.local/bin/`, user service to `~/.config/systemd/user/`, and extension to `~/.local/share/gnome-shell/extensions/linux-island@local`.

### Start Core Service
```bash
systemctl --user start linux-island-core.service
systemctl --user status linux-island-core.service
```

### Uninstall & Reversal
```bash
bash packaging/dev/uninstall-local.sh
```
Stops the service, disables the extension, removes installed files, and reports preserved user settings location.

---

## 3. Failure Injection & Recovery (Task 20)

- **Daemon Kill & Restart:**
  When `linux-island-core` process is killed (`kill -9 $(pgrep linux-island-core)`), systemd restarts it (`Restart=on-failure`). The GNOME extension proxy detects `NameOwnerChanged` (`:1.X -> null -> :1.Y`), clears stale media actions, and retrieves fresh state with new `instanceId` without crashing GNOME Shell.
- **MPRIS Disappearance:**
  When a media player exits mid-playback, `PlayerRegistry` clears the active player and emits `mediaStateChanged` with status `Stopped`.
- **Malformed Settings Injection:**
  Oversized or invalid D-Bus calls to `UpdateSettings` return `org.freedesktop.DBus.Error.InvalidArgument` without corrupting persisted disk storage.
