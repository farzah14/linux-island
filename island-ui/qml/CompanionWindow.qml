import QtQuick
import QtQuick.Layouts
import QtQuick.Controls
import QtWebEngine

Window {
    id: windowRoot

    visible: true
    flags: Qt.FramelessWindowHint | Qt.WindowStaysOnTopHint
    color: "transparent"

    property string initialUrl: typeof initialCompanionUrl !== "undefined" ? initialCompanionUrl : ""
    property bool standaloneProcess: typeof isStandaloneCompanion !== "undefined" ? isStandaloneCompanion : false

    width: 720
    height: 520

    x: Screen.width > 0 ? Math.round((Screen.width - width) / 2 + (typeof islandClient !== "undefined" ? islandClient.horizontalOffset : 0)) : 100
    y: (typeof islandClient !== "undefined" ? islandClient.verticalOffset : 8) + 48

    signal closedByUser()

    // Google refuses OAuth sign-in from any embedded browser (WebView/WebEngine)
    // as an anti-phishing measure; spoofing UA and client hints does not help.
    // Rather than showing a dead-end error page, these URLs are handed to the
    // user's real browser, where the account session already exists.
    // Host matching lives in C++ (SearchProvider::requiresSystemBrowser):
    // QML's JS engine has no global URL object, so parsing there silently
    // failed and the handoff never fired.
    //
    // Set only when a valid, non-expired Google auth cookie (SID/HSID/SSID/
    // __Secure-*-PSID on .google.com) was actually imported. Importing any
    // unrelated browser cookie must not disable the handoff: interactive
    // sign-in stays blocked in embedded WebEngine regardless of other cookies,
    // and passive account pages need a real Google session, not just any one.
    property bool googleSessionImported: false

    function requiresSystemBrowser(urlStr) {
        if (typeof searchProvider === "undefined") {
            return false;
        }
        return searchProvider.requiresSystemBrowser(urlStr, windowRoot.googleSessionImported);
    }

    property bool handedOff: false

    // Hide the window before touching the desktop portal. openExternal() does a
    // blocking D-Bus call to the running browser; doing that first left the
    // companion visible and spinning until the call returned.
    function handOffToSystemBrowser(urlStr) {
        if (handedOff) {
            return;
        }
        handedOff = true;
        windowRoot.visible = false;
        Qt.callLater(function() {
            if (typeof searchProvider !== "undefined") {
                searchProvider.openExternal(urlStr);
            }
            // Capture the mode first: in overlay mode closedByUser() makes the
            // Loader destroy this window synchronously, so reading windowRoot
            // afterwards would touch a deleted object.
            var standalone = windowRoot.standaloneProcess;
            closedByUser();
            if (standalone) {
                Qt.callLater(Qt.quit);
            }
            // Overlay mode needs no further teardown: the Loader owns this
            // window. Calling close() here would close the last *visible*
            // window while the Island is hidden, and Qt's default
            // quitOnLastWindowClosed would then terminate linux-island-ui.
        });
    }

    function dismiss() {
        windowRoot.visible = false;
        // Same ordering rule as the handoff: the Loader may delete this object
        // from inside closedByUser().
        var standalone = windowRoot.standaloneProcess;
        closedByUser();
        if (standalone) {
            // Never tear down WebEngine synchronously from a navigation/JS
            // callback: that deadlocks teardown and leaves the window spinning.
            // Deferring past the current call stack lets the callback return.
            Qt.callLater(Qt.quit);
        }
    }

    Shortcut {
        sequence: "Escape"
        onActivated: windowRoot.dismiss()
    }

    Rectangle {
        id: container
        anchors.fill: parent
        color: IslandTheme.surfaceIsland
        radius: 16
        border.width: 1
        border.color: IslandTheme.borderSubtle
        clip: true

        // Navigation header bar
        Rectangle {
            id: navBar
            anchors.top: parent.top
            anchors.left: parent.left
            anchors.right: parent.right
            height: 44
            color: IslandTheme.surfaceRaised

            RowLayout {
                anchors.fill: parent
                anchors.leftMargin: 8
                anchors.rightMargin: 8
                spacing: 6

                // Back Button
                Rectangle {
                    implicitWidth: 30
                    implicitHeight: 30
                    radius: 8
                    color: backMouse.containsMouse && webView.canGoBack ? IslandTheme.surfaceHover : "transparent"
                    opacity: webView.canGoBack ? 1.0 : 0.35

                    Text {
                        anchors.centerIn: parent
                        text: "◀"
                        font.pixelSize: 11
                        color: IslandTheme.textPrimary
                    }

                    MouseArea {
                        id: backMouse
                        anchors.fill: parent
                        hoverEnabled: true
                        enabled: webView.canGoBack
                        cursorShape: enabled ? Qt.PointingHandCursor : Qt.ArrowCursor
                        onClicked: webView.goBack()
                    }
                }

                // Forward Button
                Rectangle {
                    implicitWidth: 30
                    implicitHeight: 30
                    radius: 8
                    color: fwdMouse.containsMouse && webView.canGoForward ? IslandTheme.surfaceHover : "transparent"
                    opacity: webView.canGoForward ? 1.0 : 0.35

                    Text {
                        anchors.centerIn: parent
                        text: "▶"
                        font.pixelSize: 11
                        color: IslandTheme.textPrimary
                    }

                    MouseArea {
                        id: fwdMouse
                        anchors.fill: parent
                        hoverEnabled: true
                        enabled: webView.canGoForward
                        cursorShape: enabled ? Qt.PointingHandCursor : Qt.ArrowCursor
                        onClicked: webView.goForward()
                    }
                }

                // Reload / Stop Button
                Rectangle {
                    implicitWidth: 30
                    implicitHeight: 30
                    radius: 8
                    color: reloadMouse.containsMouse ? IslandTheme.surfaceHover : "transparent"

                    Text {
                        anchors.centerIn: parent
                        text: webView.loading ? "✕" : "↻"
                        font.pixelSize: webView.loading ? 11 : 14
                        font.bold: true
                        color: IslandTheme.textPrimary
                    }

                    MouseArea {
                        id: reloadMouse
                        anchors.fill: parent
                        hoverEnabled: true
                        cursorShape: Qt.PointingHandCursor
                        onClicked: {
                            if (webView.loading) {
                                webView.stop();
                            } else {
                                webView.reload();
                            }
                        }
                    }
                }

                // Address indicator pill
                Rectangle {
                    Layout.fillWidth: true
                    implicitHeight: 28
                    radius: 8
                    color: IslandTheme.surfaceIsland
                    border.width: 1
                    border.color: IslandTheme.borderSubtle

                    RowLayout {
                        anchors.fill: parent
                        anchors.leftMargin: 8
                        anchors.rightMargin: 8
                        spacing: 6

                        Text {
                            text: webView.url.toString().indexOf("https://") === 0 ? "🔒" : "🌐"
                            font.pixelSize: 11
                            color: IslandTheme.accentPrimary
                        }

                        Text {
                            Layout.fillWidth: true
                            text: webView.url.toString() || windowRoot.initialUrl || "about:blank"
                            font.pixelSize: 11
                            color: IslandTheme.textSecondary
                            elide: Text.ElideMiddle
                        }
                    }
                }

                // Open current page in the system browser (signed-in sessions)
                Rectangle {
                    implicitWidth: 30
                    implicitHeight: 30
                    radius: 8
                    color: externalMouse.containsMouse ? IslandTheme.surfaceHover : "transparent"

                    Text {
                        anchors.centerIn: parent
                        text: "⧉"
                        font.pixelSize: 12
                        color: externalMouse.containsMouse ? IslandTheme.accentPrimary : IslandTheme.textPrimary
                    }

                    MouseArea {
                        id: externalMouse
                        anchors.fill: parent
                        hoverEnabled: true
                        cursorShape: Qt.PointingHandCursor
                        onClicked: {
                            var current = webView.url.toString();
                            if (current && typeof searchProvider !== "undefined") {
                                searchProvider.openExternal(current);
                            }
                        }
                    }
                }

                // Close Button
                Rectangle {
                    implicitWidth: 30
                    implicitHeight: 30
                    radius: 8
                    color: closeMouse.containsMouse ? IslandTheme.surfaceHover : "transparent"

                    Text {
                        anchors.centerIn: parent
                        text: "✕"
                        font.pixelSize: 12
                        font.bold: true
                        color: closeMouse.containsMouse ? IslandTheme.accentPrimary : IslandTheme.textPrimary
                    }

                    MouseArea {
                        id: closeMouse
                        anchors.fill: parent
                        hoverEnabled: true
                        cursorShape: Qt.PointingHandCursor
                        onClicked: windowRoot.dismiss()
                    }
                }
            }
        }

        // Loading Progress Bar
        Rectangle {
            id: progressBar
            anchors.top: navBar.bottom
            anchors.left: parent.left
            height: 2
            width: parent.width * (webView.loadProgress / 100.0)
            color: IslandTheme.accentPrimary
            visible: webView.loading && webView.loadProgress < 100
            z: 10
        }

        // Persistent browser session.
        // Cookies, localStorage and cache live under ~/.local/share/linux-island
        // and ~/.cache/linux-island, so an account signed in once inside the
        // Island stays signed in on every later search. The profile used to be
        // off-the-record, which made each search look like a brand-new bot
        // browser and forced a CAPTCHA every single time.
        WebEngineProfile {
            id: companionProfile
            storageName: "linux-island-search"
            // Must stay false: with the default (off-the-record) profile Qt
            // keeps cookies in memory and drops them when the window closes.
            // Qt logs a benign "storage name is empty" note while applying
            // properties, then switches the profile to disk-backed.
            offTheRecord: false
            persistentStoragePath: typeof companionProfileDataPath !== "undefined"
                ? companionProfileDataPath : ""
            cachePath: typeof companionProfileCachePath !== "undefined"
                ? companionProfileCachePath : ""
            httpCacheType: WebEngineProfile.DiskHttpCache
            persistentCookiesPolicy: WebEngineProfile.ForcePersistentCookies
            // Qt's stock UA advertises "QtWebEngine", which search engines score
            // as an unsupported/automated client. Present as plain Chrome.
            httpUserAgent: typeof companionUserAgent !== "undefined" ? companionUserAgent : ""

            onDownloadRequested: function(download) {
                // Deny downloads by default per spec boundaries
                download.cancel();
            }
        }

        // Match the reduced Chrome UA with consistent client hints so the
        // session does not look like a mismatched/automated client.
        // (clientHints exists from Qt 6.8; the guard keeps older Qt working.)
        Component.onCompleted: {
            if (companionProfile.clientHints) {
                var version = companionUserAgent.split("Chrome/")[1] || "";
                version = version.split(" ")[0];
                var major = version.split(".")[0];
                companionProfile.clientHints.platform = "Linux";
                companionProfile.clientHints.arch = "x86";
                companionProfile.clientHints.bitness = "64";
                companionProfile.clientHints.fullVersion = version;
                companionProfile.clientHints.fullVersionList = {
                    "Chromium": version,
                    "Google Chrome": version,
                    "Not-A.Brand": "99.0.0.0"
                };
                companionProfile.clientHints.isAllClientHintsEnabled = true;
            }
        }

        // WebEngineView
        WebEngineView {
            id: webView
            anchors.top: navBar.bottom
            anchors.bottom: parent.bottom
            anchors.left: parent.left
            anchors.right: parent.right
            profile: companionProfile

            onNavigationRequested: function(request) {
                var urlStr = request.url.toString();
                // Google blocks embedded-browser sign-in; send it to the real
                // browser instead of letting the user hit "Couldn't sign you in".
                if (windowRoot.requiresSystemBrowser(urlStr)) {
                    if (typeof request.reject === "function") {
                        request.reject();
                    } else {
                        request.action = WebEngineNavigationRequest.IgnoreRequest;
                    }
                    windowRoot.handOffToSystemBrowser(urlStr);
                    return;
                }
                var valid = (typeof searchProvider !== "undefined") ? searchProvider.isValidUrl(urlStr) : (urlStr.indexOf("http://") === 0 || urlStr.indexOf("https://") === 0);
                if (!valid) {
                    if (typeof request.reject === "function") {
                        request.reject();
                    } else {
                        request.action = WebEngineNavigationRequest.IgnoreRequest;
                    }
                } else {
                    if (typeof request.accept === "function") {
                        request.accept();
                    } else {
                        request.action = WebEngineNavigationRequest.AcceptRequest;
                    }
                }
            }

            onNewWindowRequested: function(request) {
                var urlStr = request.requestedUrl.toString();
                // Google opens sign-in in a popup; hand that off too, otherwise
                // it lands in an embedded window and is rejected by Google.
                if (windowRoot.requiresSystemBrowser(urlStr)) {
                    if (typeof request.reject === "function") {
                        request.reject();
                    }
                    windowRoot.handOffToSystemBrowser(urlStr);
                    return;
                }
                if (typeof searchProvider === "undefined" || searchProvider.isValidUrl(urlStr)) {
                    request.openIn(webView);
                }
            }

            onPermissionRequested: function(permission) {
                // Deny device permissions by default
                permission.deny();
            }

            Component.onCompleted: {
                // Bring the user's existing browser session into this profile,
                // so search results open already signed in without hitting
                // OAuth embedded-browser blocks.
                if (typeof cookieImporter !== "undefined") {
                    var imported = cookieImporter.importInto(companionProfile);
                    if (imported >= 0) {
                        // Only a real Google auth cookie unlocks in-app account
                        // pages; importing unrelated cookies proves nothing.
                        windowRoot.googleSessionImported = cookieImporter.googleSessionImported();
                        console.log("linux-island: imported " + imported + " cookies from "
                            + cookieImporter.sourceBrowserLabel()
                            + (windowRoot.googleSessionImported ? " (Google session)" : " (no Google session)"));
                    } else {
                        console.log("linux-island: cookie import skipped: " + cookieImporter.lastError());
                    }
                }
                if (windowRoot.initialUrl && windowRoot.initialUrl.length > 0) {
                    webView.url = windowRoot.initialUrl;
                }
            }
        }

        // Error / Retry Overlay
        Rectangle {
            id: errorOverlay
            anchors.top: navBar.bottom
            anchors.bottom: parent.bottom
            anchors.left: parent.left
            anchors.right: parent.right
            color: IslandTheme.surfaceIsland
            visible: webView.loadingStatus === WebEngineView.LoadFailedStatus
            z: 5

            ColumnLayout {
                anchors.centerIn: parent
                spacing: 12

                Text {
                    text: "⚠️"
                    font.pixelSize: 32
                    Layout.alignment: Qt.AlignHCenter
                }

                Text {
                    text: "Failed to load page"
                    color: IslandTheme.textPrimary
                    font.pixelSize: 14
                    font.bold: true
                    Layout.alignment: Qt.AlignHCenter
                }

                Text {
                    text: "The web companion could not reach this address."
                    color: IslandTheme.textTertiary
                    font.pixelSize: 11
                    Layout.alignment: Qt.AlignHCenter
                }

                Rectangle {
                    implicitWidth: 84
                    implicitHeight: 28
                    radius: 8
                    color: IslandTheme.accentPrimary
                    Layout.alignment: Qt.AlignHCenter

                    Text {
                        anchors.centerIn: parent
                        text: "Retry"
                        color: IslandTheme.surfaceIsland
                        font.pixelSize: 11
                        font.bold: true
                    }

                    MouseArea {
                        anchors.fill: parent
                        cursorShape: Qt.PointingHandCursor
                        onClicked: webView.reload()
                    }
                }
            }
        }
    }
}
