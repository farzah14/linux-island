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

    // Function to calculate target capsule width
    function getPillWidth() {
        if (islandClient.capsuleSize === "circle") return 36;
        if (islandClient.capsuleSize === "small") return 146;
        if (islandClient.capsuleSize === "large") return 204;
        return 174; // medium default
    }

    function getExpandedWidth() {
        if (islandClient.capsuleSize === "small" || islandClient.capsuleSize === "circle") return 280;
        if (islandClient.capsuleSize === "large") return 388;
        return 340; // medium default
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
        height: isExpanded ? 260 : 34
        anchors.horizontalCenter: parent.horizontalCenter
        y: 4
        radius: isExpanded ? 20 : (isCircle ? 18 : 17)
        color: IslandTheme.surfaceIsland
        border.color: isHovered || isExpanded ? IslandTheme.borderFocus : IslandTheme.borderSubtle
        border.width: 1
        clip: true
        scale: (compactMouse.pressed && !islandContainer.isExpanded) ? 0.96 : 1.0

        Behavior on width {
            enabled: islandClient.animationEnabled
            NumberAnimation { duration: 300; easing.type: Easing.OutCubic }
        }
        Behavior on height {
            enabled: islandClient.animationEnabled
            NumberAnimation { duration: 300; easing.type: Easing.OutCubic }
        }
        Behavior on radius {
            enabled: islandClient.animationEnabled
            NumberAnimation { duration: 250; easing.type: Easing.OutCubic }
        }
        Behavior on scale {
            enabled: islandClient.animationEnabled
            NumberAnimation { duration: 120; easing.type: Easing.OutCubic }
        }
        // Notify surface manager of input mask whenever allocation updates
        onXChanged: updateMask()
        onYChanged: updateMask()
        onWidthChanged: updateMask()
        onHeightChanged: updateMask()
        onVisibleChanged: updateMask()

        function updateMask() {
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

            MouseArea {
                id: compactMouse
                anchors.fill: parent
                hoverEnabled: true
                cursorShape: Qt.PointingHandCursor
                onEntered: {
                    if (islandClient.hoverPreviewEnabled && islandClient.uiState === "COMPACT") {
                        islandClient.dispatchEvent("HOVER_ENTER");
                    }
                }
                onExited: {
                    if (islandClient.uiState === "PREVIEW") {
                        islandClient.dispatchEvent("HOVER_LEAVE");
                    }
                }
                onClicked: {
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

            // Segmented Carousel Navigation Bar
            Rectangle {
                Layout.fillWidth: true
                implicitHeight: 28
                radius: 6
                color: IslandTheme.surfaceRaised
                border.color: IslandTheme.borderSubtle

                RowLayout {
                    anchors.fill: parent
                    anchors.margins: 2
                    spacing: 2

                    // Tab 0: Music
                    Rectangle {
                        Layout.fillWidth: true
                        Layout.fillHeight: true
                        radius: 4
                        color: carouselView.currentIndex === 0 ? IslandTheme.accentPrimary : (tab0Mouse.containsMouse ? IslandTheme.surfaceHover : "transparent")

                        Text {
                            anchors.centerIn: parent
                            text: "🎵 Music"
                            font.pixelSize: 9
                            font.bold: true
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
                        Layout.fillWidth: true
                        Layout.fillHeight: true
                        radius: 4
                        color: carouselView.currentIndex === 1 ? IslandTheme.accentPrimary : (tab1Mouse.containsMouse ? IslandTheme.surfaceHover : "transparent")

                        Text {
                            anchors.centerIn: parent
                            text: "⚡ System"
                            font.pixelSize: 9
                            font.bold: true
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
                        Layout.fillWidth: true
                        Layout.fillHeight: true
                        radius: 4
                        color: carouselView.currentIndex === 2 ? IslandTheme.accentPrimary : (tab2Mouse.containsMouse ? IslandTheme.surfaceHover : "transparent")

                        Text {
                            anchors.centerIn: parent
                            text: "🤖 AI"
                            font.pixelSize: 9
                            font.bold: true
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
                        Layout.fillWidth: true
                        Layout.fillHeight: true
                        radius: 4
                        color: carouselView.currentIndex === 3 ? IslandTheme.accentPrimary : (tab3Mouse.containsMouse ? IslandTheme.surfaceHover : "transparent")

                        Text {
                            anchors.centerIn: parent
                            text: "🔍 Search"
                            font.pixelSize: 9
                            font.bold: true
                            color: carouselView.currentIndex === 3 ? IslandTheme.surfaceIsland : IslandTheme.textPrimary
                        }

                        MouseArea {
                            id: tab3Mouse
                            anchors.fill: parent
                            cursorShape: Qt.PointingHandCursor
                            onClicked: carouselView.currentIndex = 3
                        }
                    }

                    // Dismiss Button (✕)
                    Rectangle {
                        implicitWidth: 22
                        implicitHeight: 22
                        radius: 11
                        color: closeMouse.containsMouse ? IslandTheme.surfaceHover : "transparent"

                        Text {
                            anchors.centerIn: parent
                            text: "✕"
                            font.pixelSize: 10
                            color: IslandTheme.textSecondary
                        }

                        MouseArea {
                            id: closeMouse
                            anchors.fill: parent
                            cursorShape: Qt.PointingHandCursor
                            onClicked: islandClient.dispatchEvent("DISMISS")
                        }
                    }
                }
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
