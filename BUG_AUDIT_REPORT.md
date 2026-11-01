# Linux Island — Comprehensive Bug & Error Audit Report

**Date**: 2026-10-30  
**Scope**: Read-only static & offline verification audit across `extension/`, `core/`, `island-ui/`, `settings-app/`, `packaging/`, `scripts/`, `schemas/`, `design-system/`, and `tests/`.  
**Code Changes Made**: None (read-only analysis).

---

## Baseline Test & Verification Status

All existing offline verification scripts and unit test suites currently pass, which masks the runtime and integration defects documented below:

| Command | Result | Notes |
| :--- | :---: | :--- |
| `python3 scripts/dev/verify-kit.py` | **PASS** | 21 prompts, 7 v2 runbooks, warm tokens, Core1 schema verified |
| `python3 design-system/qa/verify_tokens.py` | **PASS** | 26 contrast checks, flat themes match canonical JSON |
| `python3 tests/integration/test_m0_scaffold.py` | **PASS** | M0 static scaffold checks |
| `node tests/extension/*.test.js` (16 suites) | **PASS** | Passed under mocked GLib/St/Gio harnesses |
| `ctest --test-dir build/dev` (10 tests) | **PASS** | 9 C++ unit suites + `dbus-schema` (`test_session_service.py` omitted from CTest) |

---

## Executive Summary by Subsystem & Severity

| Subsystem | Critical / High | Medium | Low | Total |
| :--- | :---: | :---: | :---: | :---: |
| **GNOME Extension (`extension/`)** | 5 | 5 | 4 | **14** |
| **Core Daemon (`core/`)** | 4 | 3 | 0 | **7** |
| **Qt6 Overlay & Settings (`island-ui/`, `settings-app/`)** | 4 | 4 | 2 | **10** |
| **Packaging, Systemd & Scripts (`packaging/`, `scripts/`)** | 3 | 4 | 2 | **9** |
| **Total** | **16** | **16** | **8** | **40** |

---

## 1. Critical & High-Severity Bugs

### 1.1 250ms Polling Storm & Unstopped Subprocesses in `AiQuotaSection` and `SystemMetricsRow`
- **Files**:
  - `extension/ui/mediaView.js:124–129, 398–402, 446`
  - `extension/ui/aiQuotaView.js:270–277, 394`
  - `extension/ui/systemMetricTile.js:481, 495`
- **Mechanism**:
  `MediaView` constructs a default scheduler:
  ```javascript
  this._scheduler = scheduler ?? {
      repeat: fn => GLib ? GLib.timeout_add(GLib.PRIORITY_DEFAULT, 250, () => {
          fn(); return GLib.SOURCE_CONTINUE;
      }) : null,
      cancel: id => { if (GLib) GLib.source_remove(id); },
  };
  ```
  `MediaView` passes `this._scheduler` into both `SystemMetricsRow` (which calls `this._scheduler.add(1500, ...)`) and `AiQuotaSection` (which calls `this._scheduler.add(15000, ...)`). Both child classes adapt `rawSched.repeat(fn, ms)` assuming the second parameter controls the interval. Because `MediaView._scheduler.repeat` ignores the second argument and hardcodes `250` ms:
  1. `SystemMetricsRow` polls `/proc/stat`, `/proc/meminfo`, `/proc/net/dev`, and `/sys/class/power_supply` synchronously on the GNOME Shell compositor thread **4 times per second** (250ms) instead of every 1.5s.
  2. `AiQuotaSection` (which also lacks a `notify::mapped` signal listener to stop polling when unmapped) executes `AiQuotaCollector.refreshAsync()` every **250ms** indefinitely—spawning `python3` subprocesses and firing outbound HTTP quota requests 4 times per second even when the Island is collapsed in `COMPACT` mode.
- **Impact**: Severe CPU/battery drain, process fork storms, network rate-limiting, and compositor frame drops.

---

### 1.2 Iterator Invalidation & Double-Erase Segfault in `ArtworkCache`
- **Files**: `core/media/artwork_cache.cpp:32–38, 59–69, 120–127`
- **Mechanism**:
  ```cpp
  void ArtworkCache::cancelPlayer(const QString &playerId) {
      auto it = m_activeFetches.find(playerId);
      if (it != m_activeFetches.end()) {
          if (it->reply) {
              it->reply->abort(); // Synchronously emits &QNetworkReply::finished!
              it->reply->deleteLater();
          }
          m_activeFetches.erase(it); // Double-erase of invalidated iterator!
      }
  }
  ```
  In Qt, `QNetworkReply::abort()` synchronously emits `&QNetworkReply::finished` when connected via `Qt::AutoConnection` on the same thread. The `finished` lambda (`artwork_cache.cpp:126`) looks up `playerId` and calls `m_activeFetches.erase(it)`. Control then returns to `cancelPlayer()`, which calls `m_activeFetches.erase(it)` a second time on the already-erased iterator.
  Additionally, `~ArtworkCache()` (`artwork_cache.cpp:32`) iterates `for (auto &fetch : m_activeFetches)` and calls `fetch.reply->abort()`, which mutates `m_activeFetches` while iterating over it.
- **Impact**: `SIGSEGV` / heap corruption in `linux-island-core` when a track changes while remote album art is in flight or when the daemon exits.

---

### 1.3 Use-After-Free & Missing Initial Input Mask in `island-ui/main.cpp`
- **Files**: `island-ui/main.cpp:78–94`, `island-ui/qml/IslandWindow.qml:106–113`
- **Mechanism**:
  ```cpp
  DisplaySurfaceManager *surfaceMgr = new DisplaySurfaceManager(nullptr, &client, &app);
  engine.rootContext()->setContextProperty(QStringLiteral("surfaceManager"), surfaceMgr);

  const QUrl url(QStringLiteral("qrc:/linuxisland/ui/qml/IslandWindow.qml"));
  engine.load(url);
  ...
  QQuickWindow *rootWindow = qobject_cast<QQuickWindow*>(engine.rootObjects().first());
  if (rootWindow) {
      delete surfaceMgr;
      surfaceMgr = new DisplaySurfaceManager(rootWindow, &client, &app);
      engine.rootContext()->setContextProperty(QStringLiteral("surfaceManager"), surfaceMgr);
  }
  ```
  1. During `engine.load(url)`, `IslandWindow.qml` binds to the dummy `surfaceMgr` (`m_window == nullptr`) and calls `surfaceManager.setMaskRegion(...)`, which no-ops because `m_window` is null.
  2. `delete surfaceMgr;` frees the object while QML engine internals still hold references to the initial context property.
  3. After replacing `surfaceManager`, `islandContainer.width` and `height` do not change, so `updateMask()` is never re-invoked on the real `rootWindow`.
- **Impact**: Use-after-free hazard and an unset window input mask at startup, causing the invisible $440 \times 360$ transparent window region to swallow mouse clicks meant for underlying desktop windows.

---

### 1.4 Inconsistent QML Resource Prefix in `island-ui/main.cpp`
- **File**: `island-ui/main.cpp:58–61, 81–82`
- **Mechanism**:
  Lines 58–61 check `:/qt/qml/linuxisland/ui/qml/ThemeData.qml` before falling back to `qrc:/linuxisland/ui/qml/ThemeData.qml`, but line 81 hardcodes `qrc:/linuxisland/ui/qml/IslandWindow.qml` without checking the `/qt/qml/` prefix generated by Qt6's `qt_add_qml_module`.
- **Impact**: On Qt6 builds where `qt_add_qml_module` uses the default `/qt/qml` resource prefix, `engine.load(url)` fails with `FAIL: could not load IslandWindow.qml`.

---

### 1.5 Systemd Startup Ordering Cycle in `linux-island-ui.service`
- **Files**: `packaging/systemd-user/linux-island-ui.service:3–4, 14`, `tests/integration/test_session_service.py:14`
- **Mechanism**:
  `linux-island-ui.service` specifies:
  ```ini
  [Unit]
  PartOf=graphical-session.target
  After=graphical-session.target linux-island-core.service
  ...
  [Install]
  WantedBy=graphical-session.target
  ```
  In systemd, targets automatically order `After=` the units in their `Wants=`/`WantedBy=` list. Specifying both `WantedBy=graphical-session.target` and `After=graphical-session.target` creates a dependency ordering cycle. (`test_session_service.py` explicitly tests against this bug on `linux-island-core.service`, but never checks `linux-island-ui.service`.)
- **Impact**: Systemd logs `Ordering cycle found, breaking cycle by deleting job...` at user login and can skip starting the UI service.

---

### 1.6 Unrelated Desktop Notifications Erase All WhatsApp Activity
- **Files**: `extension/lib/notificationAdapter.js:166–176`, `extension/lib/whatsappActivity.js:82–89`
- **Mechanism**:
  ```javascript
  _untrackSource(source) {
      const signalIds = this._sourceSubscriptions.get(source);
      if (signalIds) {
          for (const sigId of signalIds) {
              try { source.disconnect(sigId); } catch (_) {}
          }
          this._sourceSubscriptions.delete(source);
      }
      this._whatsappModel.onSourceDisconnected();
  }
  ```
  `_untrackSource(source)` is called whenever *any* notification source in GNOME Shell is destroyed, and unconditionally invokes `this._whatsappModel.onSourceDisconnected()` without checking `this._isWhatsAppSource(source)`. `onSourceDisconnected()` clears `this._entries` in `WhatsAppActivityModel`.
- **Impact**: Whenever any non-WhatsApp desktop notification (e.g., terminal, calendar, browser, system alert) expires or is dismissed, the unread WhatsApp badge on the Island is wiped out.

---

### 1.7 Notification Peek (`PEEK_REQUEST`) Never Fires on Incoming Notifications
- **Files**:
  - `extension/lib/notificationAdapter.js:111–116, 135–146`
  - `extension/extension.js:48–51`
  - `island-ui/notification_watcher.cpp:11–20`
  - `island-ui/main.cpp:44–49`
- **Mechanism**:
  - **GNOME Extension**: `NotificationAdapter` defines `notifyPeek()` (line 111) and `extension.js` passes `onNotificationPeek: () => this._controller?.dispatch('PEEK_REQUEST')`, but the `notification-added` handler (`notificationAdapter.js:135`) only processes WhatsApp entries and **never calls `this.notifyPeek()`**.
  - **Qt Overlay UI**: `NotificationWatcher` only subscribes to `NotificationClosed` on `org.freedesktop.Notifications` and never monitors incoming notifications; furthermore, `island-ui/main.cpp` never connects `IslandClient::settingsChanged` to `NotificationWatcher::setNotificationPeekEnabled()` or `setWhatsappEnabled()`, leaving both flags `false` permanently.
- **Impact**: The `PEEK` state is never triggered by live desktop notifications in either the GNOME extension or the Qt6 overlay.

---

### 1.8 Multi-Player Switcher (`queryAvailablePlayers`) Is Dead Code in GNOME Extension
- **Files**: `extension/lib/coreProxy.js:401–424`, `extension/extension.js:42–44`
- **Mechanism**:
  `CoreProxy.queryAvailablePlayers()` is implemented at line 401 and `extension.js` passes `onPlayersChanged: players => this._capsule?.setAvailablePlayers(players)`, but `queryAvailablePlayers()` is never called during `CoreProxy.start()`, `_onNameAppeared()`, or `_onMediaChangedSignal()`.
- **Impact**: `MediaView._playerSwitcherBtn` remains permanently hidden (`visible: false`); switching between multiple active MPRIS players is unreachable in the GNOME extension.

---

### 1.9 Numeric Settings (`verticalOffset`, `horizontalOffset`) Silently Dropped by `CoreProxy`
- **Files**: `extension/lib/coreProxy.js:336–345`, `core/settings/settings_schema.cpp:14–15, 27–28`
- **Mechanism**:
  ```javascript
  const dict = {};
  for (const [key, val] of Object.entries(patch)) {
      if (typeof val === 'string') {
          dict[key] = new GLib.Variant('s', val);
      } else if (typeof val === 'boolean') {
          dict[key] = new GLib.Variant('b', val);
      }
  }
  ```
  `typeof val === 'number'` is unhandled and omitted from `dict`.
- **Impact**: Any `UpdateSettings` patch containing numeric settings (`verticalOffset`, `horizontalOffset`) sends an empty dictionary to Core.

---

### 1.10 20 Hz Audio Meter Broadcasts Full `MediaChanged` Payload & Bumps Revisions
- **File**: `core/dbus/core_service.h:70–78`
- **Mechanism**:
  `AudioMeter` emits 3-band levels every 50ms (20 Hz). `CoreService::setAudioLevels()` increments `m_clock.mediaChanged()` and emits the full `mediaChanged(rev, mediaState())` D-Bus signal 20 times per second while playing.
- **Impact**: Floods the session D-Bus with 1,200 full media dictionary broadcasts per minute and forces UI clients to re-parse all metadata every 50ms.

---

### 1.11 Architecture & Security Invariant Violations in `aiQuota.js` and `ai_quota_provider.cpp`
- **Files**:
  - `extension/lib/aiQuota.js:655–790, 972–985`
  - `island-ui/ai_quota_provider.cpp:250–390, 588–605`
  - `AGENTS.md`, `tests/security/payload-cases.md`
- **Mechanism**:
  1. Both UI layers directly spawn `python3 -c <PROBE_PYTHON_SNIPPET>` to query `libsecret`, read `~/.omp/agent/agent.db`, `~/.config/linux-island/oauth.json`, and `~/.codex/auth.json`, and execute live outbound HTTPS requests to Google Cloud Code / OpenAI endpoints directly from the UI process.
  2. In `island-ui/ai_quota_provider.cpp:588–605`, `m_process` connects `QProcess::finished` but omits `QProcess::errorOccurred`. If `python3` is missing or fails to spawn, `m_refreshing` remains `true` forever and permanently bricks all future quota refreshes.

---

## 2. Medium-Severity Bugs

### 2.1 Inverted `CanSeek` Capability Check in `MprisController::perform`
- **File**: `core/media/mpris_controller.cpp:64–71`
- **Mechanism**:
  ```cpp
  if (!currentState.canSeek && currentState.durationUs <= 0) {
      return ControlResult{false, QStringLiteral("io.github.linuxisland.Error.ActionNotAllowed"), ...};
  }
  ```
  Using `&&` instead of `||` allows `SeekForward`, `SeekBackward`, and `SeekTo:` commands to proceed on players that explicitly report `CanSeek = false` whenever `durationUs > 0`.

---

### 2.2 Malformed `SeekTo:` and `Volume:` Actions Return `accepted = true`
- **File**: `core/media/mpris_controller.cpp:92–149`
- **Mechanism**:
  When `action` starts with `SeekTo:` or `Volume:` but fails numeric parsing (`ok == false` or `targetUs < 0`), the `if (ok ...)` block is skipped and execution falls through to `return ControlResult{true, QString(), QString()};`.
- **Impact**: Invalid D-Bus `ControlMedia` calls report success (`accepted = true`) without performing any action or returning an error code.

---

### 2.3 MPRIS `GetAll` Overwrites Cached Track `Position` with `0`
- **File**: `core/media/player_registry.cpp:295–305`
- **Mechanism**:
  `data.properties = props;` replaces the entire stored property map with the `GetAll` reply. When players omit `Position` in `PropertiesChanged` or `GetAll` updates, `normalizeMpris` falls back to `positionUs = 0`.
- **Impact**: Media progress bar jumps back to `0:00` on metadata or playback state updates.

---

### 2.4 Synchronous D-Bus `serviceOwner()` Blocking Inside MPRIS Signal Handlers
- **File**: `core/media/player_registry.cpp:216–223`
- **Mechanism**:
  `PlayerRegistry::serviceForMessage` calls `m_bus.interface()->serviceOwner(it.key())` (a blocking synchronous `org.freedesktop.DBus.GetNameOwner` call) on every `PropertiesChanged` and `Seeked` signal.

---

### 2.5 Duplicate `MediaChanged` Signal & Double Revision Bump on Local Artwork Cache Hits
- **Files**: `core/dbus/core_service.h:144–160`, `core/media/artwork_cache.cpp:89–97`
- **Mechanism**:
  When a remote artwork URL is already cached on disk, `ArtworkCache::fetchArtwork` invokes its completion callback synchronously before returning. The callback bumps `m_clock.mediaChanged()` and emits `mediaChanged`, and then `CoreService::setMediaState` immediately bumps `m_clock.mediaChanged()` a second time and emits a duplicate `mediaChanged`.

---

### 2.6 Raw Pointer Capture of `this` in `CoreService` Async Artwork Callback
- **File**: `core/dbus/core_service.h:144–152`
- **Mechanism**:
  `m_artworkCache.fetchArtwork` captures `[this, ...]` without `QPointer<CoreService>`. If a callback fires during destruction, `this` is dereferenced after free.

---

### 2.7 GUI Thread Stalls & Broken Hyprland/Sway Fullscreen Detection in `DisplaySurfaceManager`
- **File**: `island-ui/display_surface_manager.cpp:64–118`
- **Mechanism**:
  1. **UI Stalls**: Runs synchronous `QProcess::waitForFinished(300)` on the Qt GUI thread every 1.5 seconds.
  2. **Hyprland Bug (Line 73)**: `doc.object().value(QStringLiteral("fullscreen")).toBool()` always returns `false` because Hyprland's `hyprctl activewindow -j` outputs `"fullscreen"` as an integer (`0`, `1`, `2`), and `QJsonValue::toBool()` does not coerce integers.
  3. **Sway Bug (Line 85)**: `swaymsg -t get_tree` dumps all workspaces; searching stdout for `"fullscreen_mode": 1` matches fullscreen windows on inactive background workspaces and hides the Island on the active workspace.

---

### 2.8 `IslandClient::onCoreStatusChanged` Treats `"active"` Status as Disconnected
- **File**: `island-ui/island_client.cpp:226–232`
- **Mechanism**:
  ```cpp
  void IslandClient::onCoreStatusChanged(const QString &status) {
      bool ready = (status == QLatin1String("ready"));
      if (m_connected != ready) {
          m_connected = ready;
          emit connectedChanged();
      }
  }
  ```
  If `CoreService::setStatus` emits `"active"` or any non-`"ready"` operational string, `m_connected` flips to `false`.

---

### 2.9 Storage Critical Warning Wipes Base Actor Class & References Missing CSS Selector
- **Files**: `extension/ui/systemMetricTile.js:320–322`, `extension/stylesheet.css`, `scripts/dev/generate-island-css.py`
- **Mechanism**:
  ```javascript
  this.actor.style_class = this._percent >= 90
      ? 'linux-island__storage--critical'
      : '';
  ```
  1. Assigning `this.actor.style_class` directly wipes any base style classes on `this.actor` instead of using `add_style_class_name` / `remove_style_class_name`.
  2. `linux-island__storage--critical` is not defined in `extension/stylesheet.css` or `scripts/dev/generate-island-css.py`.

---

### 2.10 `MediaView.destroy()` Triggers `notify::mapped` Callback During Teardown
- **File**: `extension/ui/mediaView.js:137–140, 725–765`
- **Mechanism**:
  `this._actor.connect('notify::mapped', ...)` is never disconnected before `this._actor.destroy()`. Unmapping during destruction triggers `_renderProgress()` and `_syncProgressTimer()` while child widgets are already nulled out.

---

### 2.11 `displayPolicy.js` Ignores `inOverview` & `GnomeDisplayAdapter` Never Connects Overview Signals
- **Files**: `extension/lib/displayPolicy.js:1–22`, `extension/lib/gnomeDisplayAdapter.js:25–43`
- **Mechanism**:
  `shouldHideIsland` accepts `inOverview = false` in its signature but never reads it in the function body, and `GnomeDisplayAdapter` never connects to `Main.overview` `showing`/`hiding` signals.

---

### 2.12 QML Seek Bar Scrubbing Floods D-Bus on Every Mouse Move Event
- **File**: `island-ui/qml/MusicPage.qml:159–169`
- **Mechanism**:
  `seekMouse.onPositionChanged` calls `islandClient.seekToFraction(frac)` on every mouse drag event (120–250 Hz), dispatching synchronous/queued `ControlMedia("SeekTo:...")` D-Bus calls for every pixel moved.

---

### 2.13 `SystemPage.qml` Polls `/proc` Continuously Even When Island Is Collapsed or Hidden
- **File**: `island-ui/qml/SystemPage.qml:11–17`
- **Mechanism**:
  `SystemPage` is instantiated eagerly inside `IslandWindow.qml`'s `SwipeView`. `Component.onCompleted` enables `systemMetrics.setPollingActive(true)` at startup, and it never stops while the Island is in `COMPACT` or `HIDDEN` state.

---

### 2.14 Broken Declarative Bindings & Truncated Slider Ranges in Settings App
- **Files**: `settings-app/qml/Main.qml:284–297, 403–404, 471–472, 745–772`, `core/settings/settings_schema.cpp:117–133`
- **Mechanism**:
  1. `RadioButton` and `CheckBox` controls assign `checked: settingsProxy.<prop>` directly; clicking them in Qt Quick Controls severs the QML binding.
  2. `vOffsetSlider` (`to: 64`) and `hOffsetSlider` (`from: -200, to: 200`) truncate valid schema ranges defined in `settings_schema.cpp` (`0..120` and `-500..500`).

---

### 2.15 Launcher & Packaging Bugs (`linux-island-launch`, `install-local.sh`, `linux-island-ui.service`)
- **Files**:
  - `packaging/bin/linux-island-launch:81–86, 105–122`
  - `packaging/systemd-user/linux-island-ui.service:7–9`
  - `packaging/dev/install-local.sh:58–64`
- **Mechanisms**:
  1. **False-positive unit check (`linux-island-launch:81`)**: `systemctl --user list-unit-files linux-island-core.service` returns exit code `0` even when 0 unit files match, preventing fallback to `$CORE_BIN` when running uninstalled from the build tree.
  2. **Premature service exit on GNOME (`linux-island-launch:108`)**: Under GNOME `dynamic` mode, `linux-island-launch --systemd-ui` enables the extension and runs `exit 0`, causing `linux-island-ui.service` (`Type=simple`) to immediately enter `inactive (dead)`.
  3. **Double rendering on `--standalone` (`linux-island-launch:118`)**: Running `linux-island-launch --standalone` on GNOME when `displayMode == "dynamic"` does not disable `linux-island@local`, rendering both the GNOME extension and Qt6 overlay simultaneously.
  4. **Duplicate autostart spawning (`install-local.sh:58–64`)**: Installing both `linux-island-ui.service` and `~/.config/autostart/linux-island.desktop` (without `X-systemd-skip=true`) launches two overlay instances on non-GNOME sessions.

---

### 2.16 Unbound `$USER` Crash in `uninstall-local.sh`
- **File**: `packaging/dev/uninstall-local.sh:2, 19–20`
- **Mechanism**:
  Runs under `set -euo pipefail` and references `"$USER"` without `${USER:-$(id -un)}`. In non-interactive shells or environments where `USER` is unset, the script aborts at line 19 before removing installed files.

---

## 3. Low-Severity & Polish Issues

1. **Unsupported `box-shadow: inset` in GNOME Shell St CSS** (`scripts/dev/generate-island-css.py:74`, `extension/stylesheet.css:122, 335`):
   - GNOME Shell's St CSS parser does not support `inset` box shadows; `.linux-island__media-button:focus` has no visible keyboard focus ring.
2. **Unstyled `.linux-island__quota-toggle-btn` in Theme Generator** (`scripts/dev/generate-island-css.py:52, 60–100`):
   - Defined in base layout rules, but omitted from light/dark theme color generation.
3. **Missing GNOME 47 in `metadata.json` and `dev-reload.sh`** (`extension/metadata.json:6–9`, `scripts/dev/dev-reload.sh:46`):
   - `metadata.json` lists `["46", "50"]` and `dev-reload.sh` lists `["46", "48", "49", "50"]`, skipping GNOME `"47"`.
4. **Screen Lock Permanently Clears WhatsApp Entries Instead of Masking** (`extension/lib/whatsappActivity.js:48–57`):
   - `setLocked(true)` calls `this._entries.clear()`, erasing unread WhatsApp notifications across lock/unlock even though `hasActivity` already checks `!this._locked`.
5. **Opening GNOME Extension Preferences Immediately Spawns `linux-island-settings`** (`extension/prefs.js:8–10`):
   - `fillPreferencesWindow()` unconditionally spawns `linux-island-settings` on dialog creation before the user clicks the "Launch Settings" button.
6. **`dev-reload.sh` Runtime Dir Fallback Mismatch** (`scripts/dev/dev-reload.sh:24, 39`):
   - Bash falls back to `/tmp/linux-island-dev` when `XDG_RUNTIME_DIR` is unset, whereas GJS `GLib.get_user_runtime_dir()` resolves to `/run/user/<uid>` or `~/.cache`.
7. **Fragile `parent.children[0].status` Lookup in `MusicPage.qml`** (`island-ui/qml/MusicPage.qml:91`):
   - Relies on child index `0` being the `Image` element instead of referencing its `id` directly.
8. **Python Integration Tests Missing from CTest (`tests/integration/CMakeLists.txt:1–4`)**:
   - Only `test_schema.py` is registered via `add_test()`; `test_session_service.py` and `test_m0_scaffold.py` are omitted from CTest, and `test_session_service.py` does not inspect `linux-island-ui.service`.
