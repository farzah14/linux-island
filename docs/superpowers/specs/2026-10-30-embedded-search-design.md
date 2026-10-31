# Full search pages inside Linux Island

User-approved scope: display full search-engine pages and linked pages inside the Island rather than opening the default browser.

## Approach

Use a separate Qt Quick WebEngine surface owned by Linux Island, invoked from the GNOME Search tab. GNOME Shell cannot host a WebEngine widget. Keep the native Shell capsule for existing features, and hand off to an Island-styled companion surface for web content. Do not claim the companion is a child actor of GNOME Shell. On Wayland it is a separate application surface; positioning and focus need live verification.

Qt WebEngine is preferred because the existing overlay uses Qt Quick. A WebKit GTK companion introduces a second UI stack. A scraped results list does not satisfy full-page results.

## Interaction

Submitting a valid query opens the companion at the selected engine's encoded HTTPS URL. Keep the Island visible as the companion; hide the native expanded capsule during handoff to avoid overlapping surfaces. Provide Back, Forward, Reload, Close, an address indicator, loading progress and retry on failure, plus an action that hands the current page to the user's system browser. Linked HTTP/HTTPS pages stay in the companion. Escape closes the companion and returns to the capsule. Preserve the existing engine setting.

## Boundaries

Use a dedicated web profile owned by Linux Island, persisted on disk under `~/.local/share/linux-island/webengine`, so accounts signed in once stay signed in. This profile is separate from the user's system browser profile and must never read or write it. Do not expose native objects to page JavaScript. Reject non-HTTP/HTTPS navigation, deny downloads and device permissions by default, and handle popup requests explicitly. Do not change the frozen Core1 D-Bus contract. Keep web rendering outside GNOME Shell's process.

## Verification

Test URL encoding and navigation scheme validation. Build with WebEngine available and smoke-test QML loading. In a disposable GNOME Wayland session verify submission, full page rendering, scrolling, links, back navigation, focus, Escape, fullscreen behavior, and companion crash isolation. Host unit tests alone cannot establish these results.

Session persistence has a host-level regression check: serve a page that sets a cookie, launch the companion, close it, then launch it again and confirm the first HTTP request already carries that cookie. Two consecutive companion processes must show the cookie on the second launch's initial request; if it is missing, the profile silently reverted to in-memory and every login is lost on exit.

## Current prerequisite

This host has no discoverable Qt6WebEngineQuick pkg-config package, and Python GI reports no WebKit 6.0 namespace. Verify CMake package availability before deciding a package install is necessary. No system package installation is authorized by this design document.
