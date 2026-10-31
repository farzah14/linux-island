# Full search pages inside Linux Island — Implementation Plan

**Date:** 2026-10-30  
**Specification:** `docs/superpowers/specs/2026-10-30-embedded-search-design.md`  
**Goal:** Display full search-engine pages and linked web pages inside an Island-styled Qt Quick WebEngine companion surface rather than delegating solely to the default browser.

## Architecture

1. **Companion Surface (Qt Quick / WebEngine):**
   - Implemented as `CompanionWindow.qml` in `island-ui/qml/`.
   - Hosted by `linux-island-ui` executable invoked with `--companion <URL>` or opened from standalone mode.
   - Built with `Qt6::WebEngineQuick`. Profile is **persistent**: cookies, localStorage and cache are stored under `~/.local/share/linux-island/webengine` and `~/.cache/linux-island/webengine`, so an account signed in once stays signed in across companion launches. Cookies are forced persistent (`ForcePersistentCookies`) and the profile presents a Chrome-compatible User-Agent plus matching client hints, because Qt's stock `QtWebEngine` UA made search engines demand a CAPTCHA on every search.
   - Downloads cancelled, permissions denied, popup requests routed inside companion.
   - Controls: Back, Forward, Reload/Stop, Address indicator, Loading progress bar, Retry overlay on load failure, "open in system browser" (⧉), Close button, and Escape key dismissal.
   - The companion must exit through normal Qt teardown so Chromium flushes its cookie store; an `_Exit`-style kill discards the session.
   - Follows Warm Minimalist design tokens (`ThemeData.qml`).

2. **Core/Frontends Contract & Handoff:**
   - Frozen Core1 D-Bus contract remains untouched.
   - Extension Search tab hands off to the companion surface via process launch (`linux-island-ui --companion <url>`).
   - During handoff, the native expanded capsule is hidden (`hideForCompanion()`) to avoid visual overlap.
   - When companion closes or exits, the native capsule is restored (`restoreFromCompanion()`).
   - In standalone Qt overlay mode, `searchProvider.openEmbedded(engine, query)` opens the companion window.

3. **URL & Navigation Security Validation:**
   - C++: `SearchProvider::isValidNavigationUrl(const QString &url)` rejects non-HTTP/HTTPS schemes (such as `file:`, `javascript:`, `data:`, `ftp:`) and empty/malformed URLs.
   - JavaScript: `isValidNavigationUrl(url)` in `extension/lib/searchEngines.js` enforces the identical validation.

## Implementation Steps

### Phase 1: URL and Navigation Scheme Validation (RED -> GREEN)
- Add `SearchProvider::isValidNavigationUrl` in `island-ui/search_provider.h` and `.cpp`.
- Add `openEmbedded` and `openEmbeddedRequested` signal in `SearchProvider`.
- Update `tests/unit/tst_search_provider.cpp` with unit tests for `isValidNavigationUrl` and `openEmbedded`.
- Add `isValidNavigationUrl` in `extension/lib/searchEngines.js`.
- Add unit tests in `tests/extension/search-engines.test.js`.

### Phase 2: CMake and WebEngine Integration
- Root `CMakeLists.txt`: Add `WebEngineQuick` to `find_package(Qt6 COMPONENTS ...)`.
- `island-ui/CMakeLists.txt`: Link `Qt6::WebEngineQuick`, add `qml/CompanionWindow.qml` to QML files.
- `island-ui/main.cpp`:
  - Call `QtWebEngineQuick::initialize()` before `QGuiApplication`.
  - Parse `--companion` argument; load `CompanionWindow.qml` when `--companion` is specified.
  - In `--smoke-test`, verify QML loading of both `IslandWindow` and `CompanionWindow`.

### Phase 3: Companion QML Window
- Create `island-ui/qml/CompanionWindow.qml`:
  - Persistent on-disk `WebEngineProfile` (disk HTTP cache, forced persistent cookies, Chrome-compatible UA).
  - Navigation controls (Back, Forward, Reload/Stop, Address pill, Open in system browser, Close).
  - WebEngineView with navigation scheme filtering and popup handling.
  - Load progress bar and error retry overlay.
  - Escape shortcut handling to close window.
- Integrate with `IslandWindow.qml` and `SearchPage.qml` for standalone mode.

### Phase 4: GNOME Extension Handoff
- Update `extension/ui/capsule.js`: Add `hideForCompanion()` and `restoreFromCompanion()`.
- Update `extension/ui/mediaView.js`: Launch companion subprocess with `--companion <url>`, hide capsule during session, restore capsule on completion, fallback gracefully.
- Update `tests/extension/capsule-rendering.test.js`: Add assertions verifying handoff and capsule restore.
- Update `packaging/bin/linux-island-launch`: Allow `--companion` arguments to pass directly to `linux-island-ui`.

### Phase 5: Verification
- Run all unit tests (`ctest`, node test suites).
- Smoke test `linux-island-ui --smoke-test`.
- Test `--companion` launching in offscreen mode.
