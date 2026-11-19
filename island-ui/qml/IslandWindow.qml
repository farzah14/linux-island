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

    property bool _expandFocusGrace: false

    Timer {
        id: expandFocusTimer
        interval: 150
        repeat: false
        onTriggered: windowRoot._expandFocusGrace = false
    }

    onActiveChanged: {
        if (!active && !windowRoot._expandFocusGrace && islandContainer && islandContainer.isExpanded) {
            islandClient.dispatchEvent("DISMISS");
        }
    }

    // Function to calculate target capsule width
    function getCompactFontSize() {
        if (islandClient.capsuleSize === "small" || islandClient.capsuleSize === "circle") return 12;
        if (islandClient.capsuleSize === "large") return 14;
        return 13;
    }

    function getCompactCharLimit() {
        if (islandClient.capsuleSize === "small" || islandClient.capsuleSize === "circle") return 28;
        if (islandClient.capsuleSize === "large") return 44;
        return 36;
    }

    function truncateCompact(str) {
        var limit = getCompactCharLimit();
        if (!str) return "";
        return str.length > limit ? (str.substring(0, limit - 1) + "…") : str;
    }

    function getCompactIconSource() {
        if (!islandClient.connected) return "qrc:/linuxisland/ui/icons/ui/island-symbolic.svg";
        if (timeClient.timerActive) return "qrc:/linuxisland/ui/icons/ui/timer-symbolic.svg";
        if (islandClient.title && islandClient.title.trim().length > 0 && islandClient.isPlaying) {
            return "qrc:/linuxisland/ui/icons/ui/media-symbolic.svg";
        }
        return "qrc:/linuxisland/ui/icons/ui/island-symbolic.svg";
    }

    function getCompactDisplayText() {
        if (!islandClient.connected) return "Core offline";
        if (timeClient.timerActive && timeClient.compactText) return truncateCompact(timeClient.compactText);
        if (islandClient.title && islandClient.title.trim().length > 0) {
            var t = islandClient.title.trim();
            var a = (islandClient.artist && islandClient.artist.trim().length > 0) ? (" • " + islandClient.artist.trim()) : "";
            return truncateCompact(t + a);
        }
        return "Island";
    }

    function getPillWidth() {
        var padH = (islandClient.capsuleSize === "small" || islandClient.capsuleSize === "circle") ? 24
                 : (islandClient.capsuleSize === "large" ? 44 : 36);
        var natural = compactRowLayout ? (compactRowLayout.implicitWidth + padH) : 174;
        return Math.max(96, Math.min(260, Math.round(natural)));
    }

    function getPillHeight() {
        if (islandClient.capsuleSize === "small") return 32;
        return 36;
    }

    function getExpandedWidth() {
        if (islandClient.capsuleSize === "small" || islandClient.capsuleSize === "circle") return 268;
        if (islandClient.capsuleSize === "large") return 388;
        return 328; // medium default
    }

    function getExpandedHeight() {
        var waExtra = notificationWatcher.whatsappActivity ? 30 : 0;
        if (carouselView && carouselView.currentIndex === 1)
            return systemPage.contentHeight + 52 + waExtra;
        if (carouselView && carouselView.currentIndex === 2)
            return 128 + 52 + waExtra;
        if (carouselView && carouselView.currentIndex === 3)
            return timePage.contentHeight + 52 + waExtra;
        if (carouselView && carouselView.currentIndex === 4)
            return todoPage.contentHeight + 52 + waExtra;
        return musicPage.implicitHeight + 52 + waExtra;
    }

    function shortNavLabel(id) {
        if (id === "media") return "Music";
        if (id === "system") return "Sys";
        if (id === "ai") return "AI";
        if (id === "timer") return "Time";
        if (id === "todo") return "Todo";
        return id || "";
    }

    // Dynamic Island Root Box
    Rectangle {
        id: islandContainer

        property bool isExpanded: islandClient.uiState === "EXPANDED"
        property bool isIdleCircle: false
        property bool isPillExpanded: false
        property bool isCircle: !isExpanded && ((islandClient.capsuleSize === "circle" && !isPillExpanded) || isIdleCircle)
        property bool isHovered: islandClient.uiState === "PREVIEW"

        Timer {
            id: idleCircleTimer
            interval: 10000
            repeat: false
            running: !islandContainer.isExpanded
                     && islandClient.uiState === "COMPACT"
                     && islandClient.capsuleSize !== "circle"
                     && !islandContainer.isIdleCircle
                     && !compactMouse.containsMouse
                     && !timeClient.timerActive
            onTriggered: islandContainer.isIdleCircle = true
        }

        Connections {
            target: timeClient
            function onTimerChanged() {
                if (timeClient.timerActive) {
                    islandContainer.isIdleCircle = false;
                }
            }
        }

        Connections {
            target: islandClient
            function onMediaChanged() {
                if (islandClient.uiState === "COMPACT" && islandClient.capsuleSize !== "circle") {
                    idleCircleTimer.restart();
                }
            }
            function onUiStateChanged() {
                if (islandClient.uiState === "EXPANDED") {
                    windowRoot._expandFocusGrace = true;
                    expandFocusTimer.restart();
                    islandContainer.isIdleCircle = false;
                    islandContainer.isPillExpanded = false;
                } else {
                    expandFocusTimer.stop();
                    windowRoot._expandFocusGrace = false;
                }
            }
        }


        width: isExpanded ? windowRoot.getExpandedWidth() : (isCircle ? 36 : windowRoot.getPillWidth())
        height: isExpanded ? windowRoot.getExpandedHeight() : (isCircle ? 36 : windowRoot.getPillHeight())
        anchors.horizontalCenter: parent.horizontalCenter
        y: 0
        radius: isExpanded ? IslandTheme.radiusPanel : IslandTheme.radiusPill
        color: (!isExpanded && compactMouse.containsMouse) ? IslandTheme.surfaceHover : IslandTheme.surfaceIsland
        border.color: (isExpanded || (islandClient.displayMode === "floating" && !isCircle)) ? IslandTheme.borderSubtle : "transparent"
        border.width: 1
        clip: true

        Canvas {
            id: expandedGlow
            anchors.fill: parent
            visible: islandContainer.isExpanded
            onWidthChanged: requestPaint()
            onHeightChanged: requestPaint()
            onVisibleChanged: requestPaint()
            Connections { target: IslandTheme; function onIsDarkChanged() { expandedGlow.requestPaint(); } }
            onPaint: {
                const ctx = getContext("2d");
                ctx.clearRect(0, 0, width, height);
                const c = IslandTheme.accentPrimary;
                const gradient = ctx.createLinearGradient(0, 0, 0, height);
                gradient.addColorStop(0, "transparent");
                gradient.addColorStop(1, Qt.rgba(c.r, c.g, c.b, IslandTheme.isDark ? 0.10 : 0.06));
                ctx.fillStyle = gradient;
                ctx.beginPath();
                ctx.roundedRect(0, 0, width, height, islandContainer.radius, islandContainer.radius);
                ctx.fill();
            }
        }

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
        Component.onCompleted: {
            updateMask();
        }

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
                id: compactRowLayout
                anchors.centerIn: parent
                spacing: 8
                visible: !islandContainer.isCircle

                NavIcon {
                    size: windowRoot.getCompactFontSize() + 1
                    source: windowRoot.getCompactIconSource()
                    color: timeClient.timerActive ? IslandTheme.accentPrimary : IslandTheme.textPrimary
                    Layout.alignment: Qt.AlignVCenter
                }

                Text {
                    text: windowRoot.getCompactDisplayText()
                    font.pixelSize: windowRoot.getCompactFontSize()
                    font.weight: Font.DemiBold
                    color: IslandTheme.textPrimary
                    Layout.maximumWidth: 200
                    elide: Text.ElideRight
                    Layout.alignment: Qt.AlignVCenter
                }

                BeatBars {
                    visible: islandClient.isPlaying && islandClient.connected && !timeClient.timerActive
                    isPlaying: islandClient.isPlaying
                    animationEnabled: islandClient.animationEnabled
                    audioLevels: islandClient.audioLevels
                    barColor: IslandTheme.accentPrimary
                    Layout.alignment: Qt.AlignVCenter
                }

                Rectangle {
                    implicitWidth: 6
                    implicitHeight: 6
                    radius: 3
                    color: IslandTheme.statusSuccess
                    visible: notificationWatcher.whatsappActivity
                    Layout.alignment: Qt.AlignVCenter
                }
            }

            // Circle thumbnail mode view (matches capsule.js:_circleArtBox)
            Item {
                anchors.fill: parent
                visible: islandContainer.isCircle

                Rectangle {
                    id: circleArtBox
                    anchors.centerIn: parent
                    width: 32
                    height: 32
                    radius: 999
                    color: IslandTheme.surfaceRaised
                    border.width: 1
                    border.color: IslandTheme.borderSubtle
                    visible: islandClient.isPlaying && islandClient.connected
                    clip: true

                    Image {
                        id: circleArtImg
                        anchors.fill: parent
                        source: (islandClient.isPlaying && islandClient.connected && islandClient.albumArtUri) ? islandClient.albumArtUri : ""
                        fillMode: Image.PreserveAspectCrop
                        visible: status === Image.Ready
                    }

                    NavIcon {
                        anchors.centerIn: parent
                        size: 20
                        source: "qrc:/linuxisland/ui/icons/ui/media-symbolic.svg"
                        color: IslandTheme.textSecondary
                        visible: circleArtImg.status !== Image.Ready
                    }
                }

                NavIcon {
                    anchors.centerIn: parent
                    size: 18
                    source: "qrc:/linuxisland/ui/icons/ui/island-symbolic.svg"
                    color: IslandTheme.accentPrimary
                    visible: !(islandClient.isPlaying && islandClient.connected)
                }

                Rectangle {
                    anchors.right: parent.right
                    anchors.bottom: parent.bottom
                    anchors.margins: 2
                    width: 6
                    height: 6
                    radius: 3
                    color: IslandTheme.statusSuccess
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
                    islandContainer.isIdleCircle = false;
                    islandContainer.isPillExpanded = true;
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
                    if (islandClient.capsuleSize === "circle") {
                        islandContainer.isPillExpanded = false;
                    }
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
            // Match GNOME: shell padding/border 3px + MediaView 14px/8px.
            anchors.leftMargin: 17
            anchors.rightMargin: 17
            anchors.topMargin: 11
            anchors.bottomMargin: 11
            spacing: 6
            opacity: islandContainer.isExpanded ? 1 : 0
            visible: opacity > 0
            Behavior on opacity {
                enabled: islandClient.animationEnabled
                NumberAnimation { duration: 220; easing.type: Easing.OutCubic }
            }

            // Minimalist Carousel Section Navigation (matches GNOME FeatureCarousel)
            RowLayout {
                Layout.fillWidth: true
                Layout.preferredHeight: visible ? 24 : 0
                visible: islandClient.orderedPages.length > 1
                spacing: 6

                Item { Layout.fillWidth: true }

                RowLayout {
                    spacing: 6

                    Repeater {
                        model: islandClient.orderedPages
                        delegate: Rectangle {
                            required property var modelData
                            readonly property bool active: carouselView.currentIndex === modelData.swipeIndex
                            implicitWidth: pillLbl.implicitWidth + 18
                            implicitHeight: 22
                            radius: 999
                            color: active
                                ? (tabMouse.containsMouse ? IslandTheme.accentHover : IslandTheme.accentPrimary)
                                : (tabMouse.containsMouse ? IslandTheme.surfaceHover : IslandTheme.surfaceRaised)
                            border.width: 0

                            Text {
                                id: pillLbl
                                anchors.centerIn: parent
                                text: windowRoot.shortNavLabel(modelData.id)
                                font.pixelSize: 10
                                font.weight: active ? Font.Bold : Font.Medium
                                color: active ? IslandTheme.textOnAccent : (tabMouse.containsMouse ? IslandTheme.textPrimary : IslandTheme.textSecondary)
                            }

                            MouseArea {
                                id: tabMouse
                                anchors.fill: parent
                                hoverEnabled: true
                                cursorShape: Qt.PointingHandCursor
                                onClicked: carouselView.currentIndex = modelData.swipeIndex
                            }
                        }
                    }

                }
                Item { Layout.fillWidth: true }
            }

            Connections {
                target: islandClient
                function onToggleRequested() {
                    carouselView.currentIndex = islandClient.defaultSwipeIndex;
                }
                function onSettingsChanged() {
                    var target = islandClient.nearestOrderedSwipeIndex(carouselView.currentIndex);
                    if (carouselView.currentIndex !== target) {
                        carouselView.currentIndex = target;
                    }
                }
            }

            // Swipeable Pages
            SwipeView {
                id: carouselView
                objectName: "featureCarousel"
                Layout.fillWidth: true
                Layout.fillHeight: true
                currentIndex: islandClient.defaultSwipeIndex
                interactive: islandClient.orderedPages.length > 1
                clip: true
                onCurrentIndexChanged: {
                    var nearest = islandClient.nearestOrderedSwipeIndex(currentIndex);
                    if (nearest !== currentIndex) {
                        currentIndex = nearest;
                    }
                }

                MusicPage { id: musicPage; capsuleSize: islandClient.capsuleSize }
                SystemPage { id: systemPage; capsuleSize: islandClient.capsuleSize }
                AiQuotaPage {}
                TimePage { id: timePage }
                TodoPage { id: todoPage }

            }

            // Bottom WhatsApp Activity Pill (matches GNOME capsule.js:_waActionRow)
            Rectangle {
                Layout.alignment: Qt.AlignHCenter
                implicitHeight: 24
                implicitWidth: waRowLayout.implicitWidth + 20
                radius: 12
                color: IslandTheme.surfaceRaised
                border.width: 1
                border.color: IslandTheme.borderSubtle
                visible: notificationWatcher.whatsappActivity

                RowLayout {
                    id: waRowLayout
                    anchors.centerIn: parent
                    spacing: 8

                    Rectangle {
                        implicitWidth: 6
                        implicitHeight: 6
                        radius: 3
                        color: IslandTheme.statusSuccess
                    }

                    Text {
                        text: "New WhatsApp activity"
                        font.pixelSize: 11
                        font.weight: Font.DemiBold
                        color: IslandTheme.textPrimary
                    }

                    Rectangle {
                        implicitHeight: 18
                        implicitWidth: waBtnLabel.implicitWidth + 16
                        radius: 6
                        color: waBtnMouse.containsMouse ? IslandTheme.surfaceHover : IslandTheme.surfaceRaised

                        Text {
                            id: waBtnLabel
                            anchors.centerIn: parent
                            text: "Open WhatsApp"
                            font.pixelSize: 10
                            font.weight: Font.DemiBold
                            color: IslandTheme.accentPrimary
                        }

                        MouseArea {
                            id: waBtnMouse
                            anchors.fill: parent
                            hoverEnabled: true
                            cursorShape: Qt.PointingHandCursor
                            onClicked: {
                                notificationWatcher.activateWhatsapp();
                                notificationWatcher.clearWhatsappActivity();
                            }
                        }
                    }
                }
            }
        }
    }

}
