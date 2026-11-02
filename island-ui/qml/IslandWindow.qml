import QtQuick
import QtQuick.Window
import QtQuick.Layouts
import QtQuick.Controls

Window {
    id: windowRoot
    visible: islandClient.uiState !== "HIDDEN"
    width: surfaceManager ? surfaceManager.windowWidth : 440
    height: surfaceManager ? surfaceManager.windowHeight : 360
    color: "transparent"
    flags: Qt.FramelessWindowHint | Qt.WindowStaysOnTopHint

    // Shortcut for Esc dismissal
    Shortcut {
        sequence: "Escape"
        onActivated: islandClient.dispatchEvent("DISMISS")
    }

    onActiveChanged: {
        if (!active && islandContainer && islandContainer.isExpanded && !companionLoader.active) {
            islandClient.dispatchEvent("DISMISS");
        }
    }

    // Function to calculate target capsule width
    function getPillWidth() {
        if (islandClient.capsuleSize === "circle") return 36;
        if (islandClient.capsuleSize === "small") return 146;
        if (islandClient.capsuleSize === "large") return 204;
        return 174; // medium default
    }

    function getExpandedWidth() {
        if (islandClient.capsuleSize === "small" || islandClient.capsuleSize === "circle") return 268;
        if (islandClient.capsuleSize === "large") return 388;
        return 328; // medium default
    }

    function getExpandedHeight() {
        if (carouselView && carouselView.currentIndex === 1) return 184;
        if (carouselView && carouselView.currentIndex === 2) return 190;
        return 174;
    }

    // Dynamic Island Root Box
    Rectangle {
        id: islandContainer

        property bool isExpanded: islandClient.uiState === "EXPANDED"
        property bool isCircle: islandClient.capsuleSize === "circle" && !isExpanded
        property bool isHovered: islandClient.uiState === "PREVIEW"

        onIsExpandedChanged: {
            if (isExpanded && carouselView.currentIndex === 3) {
                windowRoot.requestActivate();
                Qt.callLater(searchPage.forceFocus);
            }
        }

        width: isExpanded ? windowRoot.getExpandedWidth() : (isCircle ? 36 : windowRoot.getPillWidth())
        height: isExpanded ? windowRoot.getExpandedHeight() : 36
        anchors.horizontalCenter: parent.horizontalCenter
        y: 4
        radius: isExpanded ? IslandTheme.radiusXl : (isCircle ? IslandTheme.radiusPill : 18)
        color: IslandTheme.surfaceIsland
        border.color: isHovered || isExpanded ? IslandTheme.borderFocus : IslandTheme.borderSubtle
        border.width: 1
        clip: true
        Behavior on width {
            enabled: islandClient.animationEnabled
            NumberAnimation { duration: islandContainer.isExpanded ? 300 : 220; easing.type: Easing.OutCubic }
        }
        Behavior on height {
            enabled: islandClient.animationEnabled
            NumberAnimation { duration: islandContainer.isExpanded ? 300 : 220; easing.type: Easing.OutCubic }
        }
        Behavior on radius {
            enabled: islandClient.animationEnabled
            NumberAnimation { duration: 220; easing.type: Easing.OutCubic }
        }
        // Notify surface manager of input mask whenever allocation updates
        property bool _maskUpdatePending: false

        onXChanged: queueMaskUpdate()
        onYChanged: queueMaskUpdate()
        onWidthChanged: queueMaskUpdate()
        onHeightChanged: queueMaskUpdate()
        onVisibleChanged: queueMaskUpdate()
        Component.onCompleted: updateMask()

        function queueMaskUpdate() {
            if (_maskUpdatePending) return;
            _maskUpdatePending = true;
            Qt.callLater(updateMask);
        }

        function updateMask() {
            _maskUpdatePending = false;
            if (!visible || islandClient.uiState === "HIDDEN") {
                surfaceManager.updateInputMask(0, 0, 0, 0);
            } else {
                surfaceManager.updateInputMask(islandContainer.x, islandContainer.y, islandContainer.width, islandContainer.height, islandContainer.radius);
            }
        }

        // 1. Compact Pill View (COMPACT / PREVIEW / PEEK)
        Item {
            id: compactRow
            anchors.fill: parent
            opacity: islandContainer.isExpanded ? 0 : 1
            visible: opacity > 0
            Behavior on opacity {
                enabled: islandClient.animationEnabled
                NumberAnimation { duration: 180; easing.type: Easing.OutCubic }
            }
            RowLayout {
                anchors.centerIn: parent
                spacing: 6
                visible: !islandContainer.isCircle

                Text {
                    text: islandClient.isPlaying ? "🎵" : "🏝️"
                    font.pixelSize: 12
                    Layout.alignment: Qt.AlignVCenter
                }

                Text {
                    text: islandClient.title ? islandClient.title : "Island"
                    font.pixelSize: 11
                    font.bold: true
                    color: IslandTheme.textPrimary
                    Layout.maximumWidth: islandContainer.width - 68
                    elide: Text.ElideRight
                    Layout.alignment: Qt.AlignVCenter
                }

                BeatBars {
                    isPlaying: islandClient.isPlaying
                    audioLevels: islandClient.audioLevels
                    barColor: IslandTheme.accentPrimary
                    Layout.alignment: Qt.AlignVCenter
                }

                // WhatsApp green notification indicator dot
                Rectangle {
                    implicitWidth: 6
                    implicitHeight: 6
                    radius: 3
                    color: "#25D366" // WhatsApp brand green
                    visible: notificationWatcher.whatsappActivity
                    Layout.alignment: Qt.AlignVCenter
                }
            }

            // Circle thumbnail mode view
            Item {
                anchors.fill: parent
                visible: islandContainer.isCircle

                Text {
                    anchors.centerIn: parent
                    text: islandClient.isPlaying ? "🎵" : "🏝️"
                    font.pixelSize: 16
                }

                Rectangle {
                    anchors.right: parent.right
                    anchors.bottom: parent.bottom
                    anchors.margins: 2
                    width: 6
                    height: 6
                    radius: 3
                    color: "#25D366"
                    visible: notificationWatcher.whatsappActivity
                }
            }

            Timer {
                id: hoverEnterTimer
                interval: islandClient.animationEnabled ? 120 : 0
                onTriggered: {
                    if (compactMouse.containsMouse && islandClient.hoverPreviewEnabled && islandClient.uiState === "COMPACT") {
                        islandClient.dispatchEvent("HOVER_ENTER");
                    }
                }
            }

            Timer {
                id: hoverExitTimer
                interval: islandClient.animationEnabled ? 240 : 0
                onTriggered: {
                    if (!compactMouse.containsMouse && islandClient.uiState === "PREVIEW") {
                        islandClient.dispatchEvent("HOVER_LEAVE");
                    }
                }
            }

            MouseArea {
                id: compactMouse
                anchors.fill: parent
                hoverEnabled: true
                cursorShape: Qt.PointingHandCursor
                onEntered: {
                    hoverExitTimer.stop();
                    if (islandClient.hoverPreviewEnabled && islandClient.uiState === "COMPACT") {
                        if (islandClient.animationEnabled) {
                            hoverEnterTimer.start();
                        } else {
                            islandClient.dispatchEvent("HOVER_ENTER");
                        }
                    }
                }
                onExited: {
                    hoverEnterTimer.stop();
                    if (islandClient.uiState === "PREVIEW") {
                        if (islandClient.animationEnabled) {
                            hoverExitTimer.start();
                        } else {
                            islandClient.dispatchEvent("HOVER_LEAVE");
                        }
                    }
                }
                onClicked: {
                    hoverEnterTimer.stop();
                    hoverExitTimer.stop();
                    islandClient.dispatchEvent("CLICK");
                }
            }
        }

        // 2. Expanded Carousel View (EXPANDED)
        ColumnLayout {
            id: expandedView
            anchors.fill: parent
            anchors.margins: 10
            spacing: 6
            opacity: islandContainer.isExpanded ? 1 : 0
            visible: opacity > 0
            Behavior on opacity {
                enabled: islandClient.animationEnabled
                NumberAnimation { duration: 220; easing.type: Easing.OutCubic }
            }
            Rectangle {
                Layout.fillWidth: true
                implicitHeight: 24
                radius: 6
                color: IslandTheme.surfaceRaised
                border.color: "#25D366"
                visible: notificationWatcher.whatsappActivity

                RowLayout {
                    anchors.fill: parent
                    anchors.margins: 4
                    spacing: 6

                    Rectangle {
                        implicitWidth: 6
                        implicitHeight: 6
                        radius: 3
                        color: "#25D366"
                    }

                    Text {
                        text: "WhatsApp Activity"
                        font.pixelSize: 10
                        font.bold: true
                        color: IslandTheme.textPrimary
                    }

                    Item { Layout.fillWidth: true }

                    Text {
                        text: "Open →"
                        font.pixelSize: 10
                        font.bold: true
                        color: "#25D366"

                        MouseArea {
                            anchors.fill: parent
                            cursorShape: Qt.PointingHandCursor
                            onClicked: notificationWatcher.activateWhatsapp()
                        }
                    }
                }
            }

            // Minimalist Carousel Section Navigation (matches GNOME FeatureCarousel)
            RowLayout {
                Layout.fillWidth: true
                Layout.preferredHeight: 22
                spacing: 6

                Item { Layout.fillWidth: true }

                RowLayout {
                    spacing: 6

                    // Tab 0: Music
                    Rectangle {
                        implicitWidth: 28
                        implicitHeight: 22
                        radius: 8
                        color: carouselView.currentIndex === 0 ? IslandTheme.accentPrimary : (tab0Mouse.containsMouse ? IslandTheme.surfaceHover : "transparent")

                        NavIcon {
                            anchors.centerIn: parent
                            source: "qrc:/linuxisland/ui/icons/ui/media-symbolic.svg"
                            color: carouselView.currentIndex === 0 ? IslandTheme.surfaceIsland : IslandTheme.textPrimary
                        }

                        MouseArea {
                            id: tab0Mouse
                            anchors.fill: parent
                            cursorShape: Qt.PointingHandCursor
                            onClicked: carouselView.currentIndex = 0
                        }
                    }

                    // Tab 1: System
                    Rectangle {
                        implicitWidth: 28
                        implicitHeight: 22
                        radius: 8
                        color: carouselView.currentIndex === 1 ? IslandTheme.accentPrimary : (tab1Mouse.containsMouse ? IslandTheme.surfaceHover : "transparent")

                        NavIcon {
                            anchors.centerIn: parent
                            source: "qrc:/linuxisland/ui/icons/ui/system-symbolic.svg"
                            color: carouselView.currentIndex === 1 ? IslandTheme.surfaceIsland : IslandTheme.textPrimary
                        }

                        MouseArea {
                            id: tab1Mouse
                            anchors.fill: parent
                            cursorShape: Qt.PointingHandCursor
                            onClicked: carouselView.currentIndex = 1
                        }
                    }

                    // Tab 2: AI Quota
                    Rectangle {
                        implicitWidth: 28
                        implicitHeight: 22
                        radius: 8
                        color: carouselView.currentIndex === 2 ? IslandTheme.accentPrimary : (tab2Mouse.containsMouse ? IslandTheme.surfaceHover : "transparent")

                        NavIcon {
                            anchors.centerIn: parent
                            source: "qrc:/linuxisland/ui/icons/ui/ai-symbolic.svg"
                            color: carouselView.currentIndex === 2 ? IslandTheme.surfaceIsland : IslandTheme.textPrimary
                        }

                        MouseArea {
                            id: tab2Mouse
                            anchors.fill: parent
                            cursorShape: Qt.PointingHandCursor
                            onClicked: carouselView.currentIndex = 2
                        }
                    }

                    // Tab 3: Search
                    Rectangle {
                        implicitWidth: 28
                        implicitHeight: 22
                        radius: 8
                        color: carouselView.currentIndex === 3 ? IslandTheme.accentPrimary : (tab3Mouse.containsMouse ? IslandTheme.surfaceHover : "transparent")

                        NavIcon {
                            anchors.centerIn: parent
                            source: "qrc:/linuxisland/ui/icons/ui/search-symbolic.svg"
                            color: carouselView.currentIndex === 3 ? IslandTheme.surfaceIsland : IslandTheme.textPrimary
                        }

                        MouseArea {
                            id: tab3Mouse
                            anchors.fill: parent
                            cursorShape: Qt.PointingHandCursor
                            onClicked: carouselView.currentIndex = 3
                        }
                    }
                }
                Item { Layout.fillWidth: true }
            }

            // Swipeable Pages
            SwipeView {
                id: carouselView
                Layout.fillWidth: true
                Layout.fillHeight: true
                currentIndex: 0
                clip: true

                MusicPage {}
                SystemPage {}
                AiQuotaPage {}
                SearchPage { id: searchPage }

                onCurrentIndexChanged: {
                    if (currentIndex === 3 && islandContainer.isExpanded) {
                        windowRoot.requestActivate();
                        Qt.callLater(searchPage.forceFocus);
                    }
                }
            }
        }
    }

    Connections {
        target: searchProvider
        function onOpenEmbeddedRequested(url) {
            companionLoader.targetUrl = url;
            companionLoader.active = false;
            companionLoader.active = true;
        }
    }

    Loader {
        id: companionLoader
        active: false
        property string targetUrl: ""
        source: "CompanionWindow.qml"
        onLoaded: {
            item.initialUrl = targetUrl;
            item.closedByUser.connect(function() {
                companionLoader.active = false;
            });
        }
    }
}
