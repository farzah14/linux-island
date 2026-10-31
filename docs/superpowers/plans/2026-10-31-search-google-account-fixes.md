# Web Search & Google Account Session Bug Fixes — Implementation Plan

**Date:** 2026-10-31  
**Related Spec / Plan:** `docs/superpowers/specs/2026-10-30-embedded-search-design.md`, `docs/superpowers/plans/2026-10-30-embedded-search.md`  
**Goal:** Resolve all 8 defects in the embedded WebEngine search companion, Chromium cookie importer, Google account sign-in handoff, and GNOME Shell extension companion lifecycle without altering the frozen `io.github.linuxisland.Core1` D-Bus contract.

---

## Defects Addressed

| # | Severity | Location | Bug / Failure Mode |
|---|---|---|---|
| **1** | **High** | `island-ui/qml/CompanionWindow.qml:36-42, 401-403` | `sessionImported` disables Google sign-in handoff whenever *any* browser cookie is imported, even when no `.google.com` auth session exists or the Google session is logged out. |
| **2** | **High** | `island-ui/qml/CompanionWindow.qml:49-62` | `handOffToSystemBrowser()` calls `Qt.callLater(Qt.quit)` unconditionally, terminating the entire `linux-island-ui` overlay app when `standaloneProcess === false`. |
| **3** | **High** | `island-ui/cookie_importer.cpp:380-390` | Expired browser cookies (`has_expires == 1` and `expiration <= now`) are not skipped; they are imported without an expiration date as active session cookies. |
| **4** | **Medium** | `island-ui/cookie_importer.cpp:149-153` | `if (out.size() > 32) out = out.mid(32);` ignores `meta.version >= 24` and fails to strip the 32-byte SHA-256 domain digest on empty v24+ cookies (`out.size() == 32`), returning 32 raw digest bytes as the cookie value. |
| **5** | **Medium** | `island-ui/cookie_importer.cpp:52-81, 203-238` | `detectBrowserSource()` misses Flatpak/Snap `.desktop` IDs and only falls back to Brave on disk; `fetchBrowserSecret()` matches any keyring item whose label contains the browser name without checking `xdg:schema` and leaves the Secret Service session open. |
| **6** | **Medium** | `island-ui/qml/CompanionWindow.qml:395-411` | Every companion launch re-decrypts all cookies across all domains in the browser DB on the UI thread before setting `webView.url`. |
| **7** | **Low** | `extension/ui/mediaView.js:787-802` & `extension/ui/capsule.js:52, 666-673` | `_openSearch()` spawns a new `--companion` subprocess without terminating an already-running one; `hideForCompanion()` sets `_companionActive = true` (never read) and dispatches a duplicate `'DISMISS'`. |
| **8** | **Low** | `extension/lib/searchEngines.js:20-31` | `isValidNavigationUrl()` is exported and tested but never called in `searchView.js` or `mediaView.js`. |

---

## Architecture & Design Decisions

1. **Google Sign-In Handoff vs. Imported Session (`SearchProvider` & `CompanionWindow.qml`):**
   - Google blocks interactive OAuth sign-in flows (`/v3/signin/`, `/ServiceLogin`, `/signin/`, `/InteractiveLogin`, `/o/oauth2/`) inside embedded `QtWebEngine`, even when cookies from other domains were imported.
   - `CookieImporter` will expose `Q_INVOKABLE bool googleSessionImported() const` (true only when valid, non-expired Google auth cookies such as `SID`, `HSID`, `SSID`, `__Secure-1PSID`, or `__Secure-3PSID` on `.google.com` were decrypted and imported).
   - Interactive sign-in endpoints on `accounts.google.com` and `accounts.youtube.com` will **always** hand off to the system browser; passive account pages (`myaccount.google.com`) stay in-app only when `googleSessionImported` is `true`.
   - `handOffToSystemBrowser()` will check `if (standaloneProcess) Qt.quit(); else windowRoot.close();` so overlay mode does not terminate `linux-island-ui`.

2. **Chromium Cookie Decryption & Expiration Correctness (`CookieImporter`):**
   - Read `SELECT value FROM meta WHERE key = 'version'` from the copied SQLite database. Strip the 32-byte SHA-256 domain digest prefix (`out = out.mid(32)`) **if and only if** `metaVersion >= 24` and `out.size() >= 32` (handling empty v24+ cookies where `out.size() == 32` by returning `""`).
   - When `has_expires == 1`, if `expires_utc <= 0` or `expiration <= QDateTime::currentDateTimeUtc()`, skip (`continue`) the expired cookie instead of importing it as a session cookie.
   - Close the freedesktop Secret Service D-Bus session (`org.freedesktop.Secret.Session.Close`) before returning.
   - Match Secret Service items by checking `Attributes` (`xdg:schema == "chrome_libsecret_os_crypt_password_v2"`) before falling back to `Label` matching, and expand `detectBrowserSource()` to support Flatpak/Snap desktop IDs and fallback probing for `BraveSoftware/Brave-Browser`, `google-chrome`, `chromium`, and `microsoft-edge`.

3. **GNOME Extension Companion Lifecycle & URL Validation (`mediaView.js`, `capsule.js`, `searchView.js`):**
   - Call `isValidNavigationUrl(url)` in `SearchSection._submit()` and `MediaView._openSearch(url)` before launching the companion or fallback browser.
   - In `MediaView._openSearch(url)`, if `this._companionSubprocess` is already running, send `SIGTERM` (`send_signal(15)`) to the previous subprocess before spawning the new one, and guard the `wait_async` callback with `if (this._companionSubprocess === proc)` so an exiting old process does not prematurely trigger `_onCompanionEnd()` for the new process.
   - Remove the duplicate `this._onDismiss?.()` call in `MediaView._openSearch(url)` when `this._onCompanionStart?.()` already dismisses the capsule, and wire `this._companionActive` in `Capsule` so hover events do not pop the capsule over an active companion window.

---

## Phased Implementation Steps (RED -> GREEN)

### Phase 1: `SearchProvider` & `CompanionWindow` Handoff Fixes
**Files:**
- `island-ui/search_provider.h`
- `island-ui/search_provider.cpp`
- `island-ui/qml/CompanionWindow.qml`
- `tests/unit/tst_search_provider.cpp`

**Steps:**
1. **RED (`tests/unit/tst_search_provider.cpp`):**
   - Add test cases in `testRequiresSystemBrowser()` verifying interactive Google login paths (`https://accounts.google.com/v3/signin/...`, `https://accounts.google.com/ServiceLogin...`) vs. non-login URLs, and test `requiresSystemBrowser(url, bool hasGoogleSession)`.
2. **GREEN (`island-ui/search_provider.h`, `island-ui/search_provider.cpp`):**
   - Update `SearchProvider::requiresSystemBrowser(const QString &url, bool hasGoogleSession = false) const`:
     - Always return `true` for interactive login hosts (`accounts.google.com`, `accounts.youtube.com`).
     - For `myaccount.google.com`, return `!hasGoogleSession`.
3. **GREEN (`island-ui/qml/CompanionWindow.qml`):**
   - Replace `property bool sessionImported: false` with `property bool googleSessionImported: false` populated from `cookieImporter.googleSessionImported()`.
   - Delegate `requiresSystemBrowser(urlStr)` directly to `searchProvider.requiresSystemBrowser(urlStr, windowRoot.googleSessionImported)`.
   - In `handOffToSystemBrowser(urlStr)` (`lines 49–62`), replace unconditional `Qt.callLater(Qt.quit)` with:
     ```qml
     if (windowRoot.standaloneProcess) {
         Qt.callLater(Qt.quit);
     } else {
         windowRoot.close();
     }
     ```

---

### Phase 2: `CookieImporter` Decryption, Expiration, and Keyring Hardening
**Files:**
- `island-ui/cookie_importer.h`
- `island-ui/cookie_importer.cpp`
- `tests/unit/CMakeLists.txt`
- `tests/unit/tst_cookie_importer.cpp` *(new unit test target)*

**Steps:**
1. **RED (`tests/unit/tst_cookie_importer.cpp`):**
   - Expose pure helper methods (`CookieImporter::decryptChromiumCookie(encrypted, key, metaVersion)` and `CookieImporter::isCookieExpired(hasExpires, expiresUtc, nowUtc)`) for unit testing:
     - Verify a v24 cookie with an empty value (32-byte SHA-256 digest only) decrypts to `QByteArray("")`, not 32 raw hash bytes.
     - Verify a v24 cookie with a 10-byte value (42 bytes post-unpad) strips the 32-byte digest and returns the 10-byte value.
     - Verify a pre-v24 cookie (`metaVersion = 20`) with a 40-byte value retains all 40 bytes without stripping 32 bytes.
     - Verify `hasExpires == 1` with a past `expires_utc` is rejected as expired.
2. **GREEN (`island-ui/cookie_importer.cpp`, `island-ui/cookie_importer.h`):**
   - Query `SELECT value FROM meta WHERE key = 'version'` and pass `metaVersion` into `decryptChromiumCookie`.
   - For `metaVersion >= 24`: require `out.size() >= 32` and apply `out = out.mid(32)` (so `out.size() == 32` yields `""`).
   - In the cookie row loop (`lines 380–390`):
     ```cpp
     if (hasExpires == 1) {
         const qint64 expiresUtc = query.value(4).toLongLong();
         if (expiresUtc <= 0) {
             continue;
         }
         const qint64 unixMicros = expiresUtc - 11644473600000000LL;
         const QDateTime expiration = QDateTime::fromSecsSinceEpoch(unixMicros / 1000000, QTimeZone::UTC);
         if (expiration <= QDateTime::currentDateTimeUtc()) {
             continue;
         }
         cookie.setExpirationDate(expiration);
     }
     ```
   - Track `m_googleSessionImported` when a non-empty, non-expired Google auth cookie (`SID`, `HSID`, `SSID`, `__Secure-1PSID`, `__Secure-3PSID`) on `.google.com` is imported; expose `Q_INVOKABLE bool googleSessionImported() const`.
   - In `detectBrowserSource()`:
     - Match `.desktop` names with `contains()` (handling `com.brave.Browser`, `com.google.Chrome`, `org.chromium.Chromium`, `com.microsoft.Edge`).
     - In the filesystem fallback (`lines 75–79`), iterate through all four candidate directories (`BraveSoftware/Brave-Browser`, `google-chrome`, `chromium`, `microsoft-edge`) in order.
   - In `fetchBrowserSecret()`:
     - Check item `Attributes` for `xdg:schema == "chrome_libsecret_os_crypt_password_v2"` and matching `application` before falling back to `Label.contains(..., Safe Storage)`.
     - Call `org.freedesktop.Secret.Session.Close` on `session` before returning.

---

### Phase 3: GNOME Extension Subprocess Lifecycle & URL Validation
**Files:**
- `extension/ui/searchView.js`
- `extension/ui/mediaView.js`
- `extension/ui/capsule.js`
- `tests/extension/capsule-rendering.test.js`
- `tests/extension/media-view.test.js`

**Steps:**
1. **RED (`tests/extension/media-view.test.js` & `tests/extension/capsule-rendering.test.js`):**
   - Add test asserting `_openSearch('javascript:alert(1)')` is rejected and does not spawn a subprocess or call `launch_default_for_uri`.
   - Add test asserting a second `_openSearch('https://www.google.com/search?q=two')` while the first companion subprocess is still running sends `SIGTERM` (`15`) to the first subprocess and that the first subprocess's exit callback does not clear the second subprocess's state.
   - Add test asserting `hideForCompanion()` suppresses hover state transitions while `_companionActive` is `true`, and `restoreFromCompanion()` re-enables them.
2. **GREEN (`extension/ui/searchView.js`, `extension/ui/mediaView.js`, `extension/ui/capsule.js`):**
   - Import `isValidNavigationUrl` in `searchView.js` and `mediaView.js`; guard `SearchSection._submit()` and `MediaView._openSearch(url)` with `if (!isValidNavigationUrl(url)) return;`.
   - In `MediaView._openSearch(url)`:
     - If `this._companionSubprocess` is non-null, send `send_signal(15)` before spawning the new `Gio.Subprocess`.
     - Remove the duplicate `this._onDismiss?.()` call when `launchedCompanion` is `true` (`this._onCompanionStart?.()` already dispatches `'DISMISS'`).
     - In `proc.wait_async`, check `if (this._companionSubprocess === proc)` before setting `this._companionSubprocess = null` and calling `this._onCompanionEnd?.()`.
   - In `Capsule` (`extension/ui/capsule.js`):
     - Ignore `HOVER_ENTER` when `this._companionActive` is `true`.

---

## Verification Plan

1. **JavaScript / Extension Unit Tests:**
   ```bash
   node tests/extension/search-engines.test.js
   node tests/extension/media-view.test.js
   node tests/extension/capsule-rendering.test.js
   ```
2. **C++ / Qt Unit Tests:**
   ```bash
   cmake -B build -DCMAKE_BUILD_TYPE=Debug
   cmake --build build
   ctest --test-dir build --output-on-failure -R "search-provider|cookie-importer|settings-schema"
   ```
3. **Offline Smoke & Kit Verification:**
   ```bash
   ./build/island-ui/linux-island-ui --smoke-test
   python3 scripts/dev/verify-kit.py
   python3 design-system/qa/verify_tokens.py
   ```
