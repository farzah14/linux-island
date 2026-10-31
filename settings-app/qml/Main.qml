import QtQuick
import QtQuick.Controls
import QtQuick.Layouts

ApplicationWindow {
    id: root
    visible: true
    width: 540
    height: 720
    minimumWidth: 520
    minimumHeight: 560
    title: "Linux Island Settings"
    color: "#191816"

    function getPlayerItems() {
        let items = [{ text: "Automatic (Follows active playback)", value: "" }];
        let current = settingsProxy.preferredPlayerId;
        let found = (current === "");
        let available = settingsProxy.availablePlayers;
        for (let i = 0; i < available.length; ++i) {
            let pId = available[i];
            let displayName = settingsProxy.playerDisplayName(pId);
            items.push({ text: displayName + " (" + pId + ")", value: pId });
            if (pId === current) {
                found = true;
            }
        }
        if (!found && current !== "") {
            items.push({ text: settingsProxy.playerDisplayName(current) + " (" + current + ")", value: current });
        }
        items.push({ text: "Custom D-Bus service name...", value: "__custom__" });
        return items;
    }

    property var playerItems: getPlayerItems()
    property int currentTab: 0

    onCurrentTabChanged: {
        if (currentTab < 0 || currentTab > 1) {
            currentTab = 0;
        }
    }

    component GuideItem: RowLayout {
        id: itemRoot
        property alias badgeText: badgeLabel.text
        property alias description: descLabel.text
        Layout.fillWidth: true
        spacing: 12

        Rectangle {
            Layout.alignment: Qt.AlignTop
            color: "#191816"
            border.color: "#575148"
            border.width: 1
            radius: 4
            implicitHeight: 22
            implicitWidth: badgeLabel.implicitWidth + 16

            Text {
                id: badgeLabel
                anchors.centerIn: parent
                color: "#D8B77F"
                font.bold: true
                font.pixelSize: 11
            }
        }

        Text {
            id: descLabel
            color: "#C8C0B5"
            font.pixelSize: 12
            wrapMode: Text.WordWrap
            Layout.fillWidth: true
            Layout.topMargin: 2
        }
    }

    function syncComboIndex() {
        let current = settingsProxy.preferredPlayerId;
        for (let i = 0; i < playerItems.length; ++i) {
            if (playerItems[i].value === current) {
                playerCombo.currentIndex = i;
                return;
            }
        }
        playerCombo.currentIndex = playerItems.length - 1;
    }

    Connections {
        target: settingsProxy
        function onAvailablePlayersChanged() {
            root.playerItems = root.getPlayerItems();
            root.syncComboIndex();
        }
        function onPreferredPlayerIdChanged() {
            root.playerItems = root.getPlayerItems();
            root.syncComboIndex();
        }
    }

    Component.onCompleted: {
        root.syncComboIndex();
    }

    ColumnLayout {
        anchors.fill: parent
        anchors.margins: 24
        spacing: 16

        // Header
        RowLayout {
            Layout.fillWidth: true
            spacing: 12

            Text {
                text: "Linux Island"
                font.pixelSize: 22
                font.bold: true
                color: "#F4F0E9"
            }

            Item { Layout.fillWidth: true }

            Rectangle {
                width: 12
                height: 12
                radius: 6
                color: settingsProxy.connected ? "#9DD2B1" : "#F2A3A0"
            }

            Text {
                text: settingsProxy.connected ? "Core Connected" : "Core Offline"
                font.pixelSize: 12
                color: "#C8C0B5"
            }
        }

        Rectangle {
            Layout.fillWidth: true
            height: 1
            color: "#575148"
        }

        // Segmented Tab Bar
        Rectangle {
            Layout.fillWidth: true
            implicitHeight: 40
            radius: 8
            color: "#23211E"
            border.color: "#575148"

            RowLayout {
                anchors.fill: parent
                anchors.margins: 4
                spacing: 4

                // Tab 0: Preferences
                Rectangle {
                    Layout.fillWidth: true
                    Layout.fillHeight: true
                    radius: 6
                    color: root.currentTab === 0 ? "#D8B77F" : (tab0Mouse.containsMouse ? "#302D28" : "transparent")

                    Text {
                        anchors.centerIn: parent
                        text: "⚙ Preferences"
                        color: root.currentTab === 0 ? "#191816" : "#C8C0B5"
                        font.bold: root.currentTab === 0
                        font.pixelSize: 13
                    }

                    MouseArea {
                        id: tab0Mouse
                        anchors.fill: parent
                        hoverEnabled: true
                        cursorShape: Qt.PointingHandCursor
                        onClicked: root.currentTab = 0
                    }
                }

                // Tab 1: Shortcuts & Guide
                Rectangle {
                    Layout.fillWidth: true
                    Layout.fillHeight: true
                    radius: 6
                    color: root.currentTab === 1 ? "#D8B77F" : (tab1Mouse.containsMouse ? "#302D28" : "transparent")

                    Text {
                        anchors.centerIn: parent
                        text: "⌨ Shortcuts & Guide"
                        color: root.currentTab === 1 ? "#191816" : "#C8C0B5"
                        font.bold: root.currentTab === 1
                        font.pixelSize: 13
                    }

                    MouseArea {
                        id: tab1Mouse
                        anchors.fill: parent
                        hoverEnabled: true
                        cursorShape: Qt.PointingHandCursor
                        onClicked: root.currentTab = 1
                    }
                }
            }
        }

        ScrollView {
            id: contentScroll
            Layout.fillWidth: true
            Layout.fillHeight: true
            clip: true
            contentWidth: availableWidth
            visible: root.currentTab === 0

            ColumnLayout {
                width: contentScroll.availableWidth
                spacing: 16
                // Quick Navigation Banner
                Rectangle {
                    Layout.fillWidth: true
                    implicitHeight: guideBannerRow.implicitHeight + 24
                    color: "#23211E"
                    border.color: "#575148"
                    radius: 8

                    RowLayout {
                        id: guideBannerRow
                        anchors.left: parent.left
                        anchors.right: parent.right
                        anchors.top: parent.top
                        anchors.margins: 12
                        spacing: 12

                        Text {
                            text: "💡 New to Linux Island? Learn all shortcuts and gestures"
                            color: "#F4F0E9"
                            font.pixelSize: 12
                            Layout.fillWidth: true
                            wrapMode: Text.WordWrap
                        }

                        Rectangle {
                            implicitWidth: guideBtnText.implicitWidth + 24
                            implicitHeight: 28
                            radius: 6
                            color: guideBtnMouse.containsMouse ? "#E9CEA0" : "#D8B77F"

                            Text {
                                id: guideBtnText
                                 anchors.centerIn: parent
                                text: "View Guide →"
                                color: "#191816"
                                font.bold: true
                                font.pixelSize: 11
                            }

                            MouseArea {
                                id: guideBtnMouse
                                anchors.fill: parent
                                hoverEnabled: true
                                cursorShape: Qt.PointingHandCursor
                                onClicked: root.currentTab = 1
                            }
                        }
                    }
                }

        // Theme Selection
        ColumnLayout {
            Layout.fillWidth: true
            spacing: 6

            Text {
                text: "Appearance Theme"
                font.bold: true
                font.pixelSize: 14
                color: "#F4F0E9"
            }

            RowLayout {
                spacing: 12
                RadioButton {
                    text: "System"
                    checked: settingsProxy.theme === "system"
                    onClicked: settingsProxy.setTheme("system")
                }
                RadioButton {
                    text: "Dark"
                    checked: settingsProxy.theme === "dark"
                    onClicked: settingsProxy.setTheme("dark")
                }
                RadioButton {
                    text: "Light"
                    checked: settingsProxy.theme === "light"
                    onClicked: settingsProxy.setTheme("light")
                }
            }
        }

        // Capsule Size Selection
        ColumnLayout {
            Layout.fillWidth: true
            spacing: 6

            Text {
                text: "Capsule Size"
                font.bold: true
                font.pixelSize: 14
                color: "#F4F0E9"
            }

            RowLayout {
                spacing: 12
                RadioButton {
                    text: "Circle"
                    checked: settingsProxy.capsuleSize === "circle"
                    onClicked: settingsProxy.setCapsuleSize("circle")
                }
                RadioButton {
                    text: "Small"
                    checked: settingsProxy.capsuleSize === "small"
                    onClicked: settingsProxy.setCapsuleSize("small")
                }
                RadioButton {
                    text: "Medium"
                    checked: settingsProxy.capsuleSize === "medium"
                    onClicked: settingsProxy.setCapsuleSize("medium")
                }
                RadioButton {
                    text: "Large"
                    checked: settingsProxy.capsuleSize === "large"
                    onClicked: settingsProxy.setCapsuleSize("large")
                }
            }
                }

        // Display Mode Selection
        ColumnLayout {
            Layout.fillWidth: true
            spacing: 6

            Text {
                text: "Display Mode"
                font.bold: true
                font.pixelSize: 14
                color: "#F4F0E9"
            }

            RowLayout {
                spacing: 12
                RadioButton {
                    text: "Dynamic (Top Bar)"
                    checked: settingsProxy.displayMode === "dynamic"
                    onClicked: settingsProxy.setDisplayMode("dynamic")
                }
                RadioButton {
                    text: "Floating Overlay"
                    checked: settingsProxy.displayMode === "floating"
                    onClicked: settingsProxy.setDisplayMode("floating")
                }
                RadioButton {
                    text: "Panel Integrated"
                    checked: settingsProxy.displayMode === "integrated"
                    onClicked: settingsProxy.setDisplayMode("integrated")
                }
            }
        }

            // Screen & Notch Alignment
            ColumnLayout {
                Layout.fillWidth: true
                spacing: 8

                Text {
                    text: "Screen & Notch Alignment"
                    font.bold: true
                    font.pixelSize: 14
                    color: "#F4F0E9"
                }

                Text {
                    text: "Fine-tune capsule position to avoid overlapping camera notches, punch-holes, or top panel items."
                    font.pixelSize: 12
                    color: "#A69C8F"
                    wrapMode: Text.WordWrap
                    Layout.fillWidth: true
                }

                // Vertical Offset
                RowLayout {
                    Layout.fillWidth: true
                    Text {
                        text: "Top Offset: " + Math.round(vOffsetSlider.value) + " px"
                        font.pixelSize: 13
                        color: "#F4F0E9"
                    }
                    Item { Layout.fillWidth: true }
                }

                Slider {
                    id: vOffsetSlider
                    Layout.fillWidth: true
                    from: 0
                    to: 64
                    stepSize: 1
                    value: settingsProxy.verticalOffset

                    Binding {
                        target: vOffsetSlider
                        property: "value"
                        value: settingsProxy.verticalOffset
                        when: !vOffsetSlider.pressed
                    }

                    background: Rectangle {
                        x: vOffsetSlider.leftPadding
                        y: vOffsetSlider.topPadding + vOffsetSlider.availableHeight / 2 - height / 2
                        implicitWidth: 200
                        implicitHeight: 6
                        width: vOffsetSlider.availableWidth
                        height: implicitHeight
                        radius: 3
                        color: "#302D28"

                        Rectangle {
                            width: vOffsetSlider.visualPosition * parent.width
                            height: parent.height
                            color: "#D8B77F"
                            radius: 3
                        }
                    }

                    handle: Rectangle {
                        x: vOffsetSlider.leftPadding + vOffsetSlider.visualPosition * (vOffsetSlider.availableWidth - width)
                        y: vOffsetSlider.topPadding + vOffsetSlider.availableHeight / 2 - height / 2
                        implicitWidth: 18
                        implicitHeight: 18
                        radius: 9
                        color: vOffsetSlider.pressed ? "#F4F0E9" : "#D8B77F"
                        border.color: "#191816"
                        border.width: 1
                    }

                    onMoved: {
                        if (!pressed) {
                            settingsProxy.setVerticalOffset(Math.round(value))
                        }
                    }
                    onPressedChanged: {
                        if (!pressed) {
                            settingsProxy.setVerticalOffset(Math.round(value))
                        }
                    }
                }

                // Horizontal Offset
                RowLayout {
                    Layout.fillWidth: true
                    Text {
                        property int hVal: Math.round(hOffsetSlider.value)
                        text: "Horizontal Offset: " + (hVal === 0 ? "Center" : (hVal > 0 ? "+" + hVal + " px Right" : hVal + " px Left"))
                        font.pixelSize: 13
                        color: "#F4F0E9"
                    }
                    Item { Layout.fillWidth: true }
                }

                Slider {
                    id: hOffsetSlider
                    Layout.fillWidth: true
                    from: -200
                    to: 200
                    stepSize: 2
                    value: settingsProxy.horizontalOffset

                    Binding {
                        target: hOffsetSlider
                        property: "value"
                        value: settingsProxy.horizontalOffset
                        when: !hOffsetSlider.pressed
                    }

                    background: Rectangle {
                        x: hOffsetSlider.leftPadding
                        y: hOffsetSlider.topPadding + hOffsetSlider.availableHeight / 2 - height / 2
                        implicitWidth: 200
                        implicitHeight: 6
                        width: hOffsetSlider.availableWidth
                        height: implicitHeight
                        radius: 3
                        color: "#302D28"

                        Rectangle {
                            width: hOffsetSlider.visualPosition * parent.width
                            height: parent.height
                            color: "#D8B77F"
                            radius: 3
                        }
                    }

                    handle: Rectangle {
                        x: hOffsetSlider.leftPadding + hOffsetSlider.visualPosition * (hOffsetSlider.availableWidth - width)
                        y: hOffsetSlider.topPadding + hOffsetSlider.availableHeight / 2 - height / 2
                        implicitWidth: 18
                        implicitHeight: 18
                        radius: 9
                        color: hOffsetSlider.pressed ? "#F4F0E9" : "#D8B77F"
                        border.color: "#191816"
                        border.width: 1
                    }

                    onMoved: {
                        if (!pressed) {
                            settingsProxy.setHorizontalOffset(Math.round(value))
                        }
                    }
                    onPressedChanged: {
                        if (!pressed) {
                            settingsProxy.setHorizontalOffset(Math.round(value))
                        }
                    }
                }

                // Quick Presets
                RowLayout {
                    spacing: 8
                    Layout.topMargin: 4

                    Button {
                        text: "Flush Top (0 px)"
                        contentItem: Text {
                            text: parent.text
                            color: "#F4F0E9"
                            font.pixelSize: 12
                            horizontalAlignment: Text.AlignHCenter
                            verticalAlignment: Text.AlignVCenter
                        }
                        background: Rectangle {
                            implicitWidth: 110
                            implicitHeight: 32
                            radius: 6
                            color: parent.down ? "#403B34" : "#302D28"
                            border.color: "#575148"
                            border.width: 1
                        }
                        onClicked: settingsProxy.setVerticalOffset(0)
                    }

                    Button {
                        text: "Default (8 px)"
                        contentItem: Text {
                            text: parent.text
                            color: "#F4F0E9"
                            font.pixelSize: 12
                            horizontalAlignment: Text.AlignHCenter
                            verticalAlignment: Text.AlignVCenter
                        }
                        background: Rectangle {
                            implicitWidth: 100
                            implicitHeight: 32
                            radius: 6
                            color: parent.down ? "#403B34" : "#302D28"
                            border.color: "#575148"
                            border.width: 1
                        }
                        onClicked: {
                            settingsProxy.setVerticalOffset(8)
                            settingsProxy.setHorizontalOffset(0)
                        }
                    }

                    Button {
                        text: "Notch / Bar (32 px)"
                        contentItem: Text {
                            text: parent.text
                            color: "#F4F0E9"
                            font.pixelSize: 12
                            horizontalAlignment: Text.AlignHCenter
                            verticalAlignment: Text.AlignVCenter
                        }
                        background: Rectangle {
                            implicitWidth: 125
                            implicitHeight: 32
                            radius: 6
                            color: parent.down ? "#403B34" : "#302D28"
                            border.color: "#575148"
                            border.width: 1
                        }
                        onClicked: settingsProxy.setVerticalOffset(32)
                    }
                }
            }

        // Preferred Media Player Selection
        ColumnLayout {
            Layout.fillWidth: true
            spacing: 8

            Text {
                text: "Preferred Media Player"
                font.bold: true
                font.pixelSize: 14
                color: "#F4F0E9"
            }

            Text {
                text: "Prioritize controls for this player when multiple media apps are active."
                font.pixelSize: 12
                color: "#A69C8F"
                wrapMode: Text.WordWrap
                Layout.fillWidth: true
            }

            ComboBox {
                id: playerCombo
                Layout.fillWidth: true
                model: root.playerItems
                textRole: "text"
                valueRole: "value"
                contentItem: Text {
                    leftPadding: 12
                    rightPadding: 24
                    text: playerCombo.displayText
                    font.pixelSize: 13
                    color: "#F4F0E9"
                    verticalAlignment: Text.AlignVCenter
                    elide: Text.ElideRight
                }
                background: Rectangle {
                    implicitHeight: 38
                    radius: 8
                    color: "#302D28"
                    border.color: playerCombo.activeFocus ? "#D8B77F" : "#575148"
                    border.width: 1
                }
                popup: Popup {
                    y: playerCombo.height + 4
                    width: playerCombo.width
                    implicitHeight: Math.min(contentItem.implicitHeight + 16, 240)
                    padding: 8
                    contentItem: ListView {
                        clip: true
                        implicitHeight: contentHeight
                        model: playerCombo.popup.visible ? playerCombo.delegateModel : null
                        currentIndex: playerCombo.highlightedIndex
                        ScrollIndicator.vertical: ScrollIndicator {}
                    }
                    background: Rectangle {
                        radius: 8
                        color: "#302D28"
                        border.color: "#575148"
                        border.width: 1
                    }
                }
                delegate: ItemDelegate {
                    width: playerCombo.width - 16
                    contentItem: Text {
                        text: modelData.text
                        color: highlighted ? "#D8B77F" : "#F4F0E9"
                        font.pixelSize: 13
                        elide: Text.ElideRight
                        verticalAlignment: Text.AlignVCenter
                    }
                    background: Rectangle {
                        radius: 6
                        color: highlighted ? "#403B34" : "transparent"
                    }
                    highlighted: playerCombo.highlightedIndex === index
                }
                onActivated: function(index) {
                    let chosen = root.playerItems[index].value;
                    if (chosen !== "__custom__") {
                        customInputRow.visible = false;
                        settingsProxy.setPreferredPlayerId(chosen);
                    } else {
                        customInputRow.visible = true;
                        customPlayerField.forceActiveFocus();
                    }
                }
            }

            RowLayout {
                id: customInputRow
                Layout.fillWidth: true
                visible: playerCombo.currentIndex === root.playerItems.length - 1
                spacing: 8

                TextField {
                    id: customPlayerField
                    Layout.fillWidth: true
                    placeholderText: "e.g. org.mpris.MediaPlayer2.spotify"
                    placeholderTextColor: "#736B5E"
                    text: settingsProxy.preferredPlayerId
                    color: "#F4F0E9"
                    font.pixelSize: 13
                    background: Rectangle {
                        implicitHeight: 38
                        radius: 8
                        color: "#191816"
                        border.color: customPlayerField.activeFocus ? "#D8B77F" : "#575148"
                        border.width: 1
                    }
                    onAccepted: {
                        settingsProxy.setPreferredPlayerId(text.trim());
                    }
                }

                Button {
                    text: "Apply"
                    contentItem: Text {
                        text: "Apply"
                        color: "#191816"
                        font.bold: true
                        font.pixelSize: 12
                        horizontalAlignment: Text.AlignHCenter
                        verticalAlignment: Text.AlignVCenter
                    }
                    background: Rectangle {
                        implicitWidth: 64
                        implicitHeight: 38
                        radius: 8
                        color: "#D8B77F"
                    }
                    onClicked: {
                        settingsProxy.setPreferredPlayerId(customPlayerField.text.trim());
                    }
                }
            }
        }

        // Web Search
        ColumnLayout {
            Layout.fillWidth: true
            spacing: 8

            Text {
                text: "Web Search"
                font.bold: true
                font.pixelSize: 14
                color: "#F4F0E9"
            }

            Text {
                text: "Choose the engine used by the Island Search tab."
                font.pixelSize: 12
                color: "#A69C8F"
            }

            RowLayout {
                spacing: 12
                RadioButton {
                    text: "Google"
                    checked: settingsProxy.searchEngine === "google"
                    onClicked: settingsProxy.setSearchEngine("google")
                }
                RadioButton {
                    text: "DuckDuckGo"
                    checked: settingsProxy.searchEngine === "duckduckgo"
                    onClicked: settingsProxy.setSearchEngine("duckduckgo")
                }
                RadioButton {
                    text: "Brave"
                    checked: settingsProxy.searchEngine === "brave"
                    onClicked: settingsProxy.setSearchEngine("brave")
                }
                RadioButton {
                    text: "Bing"
                    checked: settingsProxy.searchEngine === "bing"
                    onClicked: settingsProxy.setSearchEngine("bing")
                }
            }
        }

        // Interaction Toggles
        ColumnLayout {
            Layout.fillWidth: true
            spacing: 8

            Text {
                text: "Interactions & Feeds"
                font.bold: true
                font.pixelSize: 14
                color: "#F4F0E9"
            }

            CheckBox {
                text: "Enable Smooth Animations"
                checked: settingsProxy.animationEnabled
                onToggled: settingsProxy.setAnimationEnabled(checked)
            }

            CheckBox {
                text: "Hover Preview on Capsule"
                checked: settingsProxy.hoverPreviewEnabled
                onToggled: settingsProxy.setHoverPreviewEnabled(checked)
            }

            CheckBox {
                text: "Smart Adaptive Fullscreen Auto-Hide"
                checked: settingsProxy.smartAdaptiveEnabled
                onToggled: settingsProxy.setSmartAdaptiveEnabled(checked)
            }

            CheckBox {
                text: "Notification Peek (Opt-in experimental)"
                checked: settingsProxy.notificationPeekEnabled
                onToggled: settingsProxy.setNotificationPeekEnabled(checked)
            }

            CheckBox {
                text: "WhatsApp Activity Indicator (Opt-in notification activity)"
                checked: settingsProxy.whatsappIntegrationEnabled
                onToggled: settingsProxy.setWhatsappIntegrationEnabled(checked)
            }
        }

        }
    }
        // Tab 1: Shortcuts & Guide View
        ScrollView {
            id: shortcutsScroll
            Layout.fillWidth: true
            Layout.fillHeight: true
            clip: true
            contentWidth: availableWidth
            visible: root.currentTab === 1

            ColumnLayout {
                width: shortcutsScroll.availableWidth
                spacing: 14

                // Cheatsheet Header
                ColumnLayout {
                    Layout.fillWidth: true
                    spacing: 4

                    Text {
                        text: "Cheatsheet & Gestures"
                        font.bold: true
                        font.pixelSize: 14
                        color: "#F4F0E9"
                    }

                    Text {
                        text: "Quick reference guide for interacting with the Linux Island capsule, carousel, and controls."
                        font.pixelSize: 12
                        color: "#A69C8F"
                        wrapMode: Text.WordWrap
                        Layout.fillWidth: true
                    }
                }

                // Section A: Island State & Basic Controls
                Rectangle {
                    Layout.fillWidth: true
                    implicitHeight: secALayout.implicitHeight + 28
                    color: "#302D28"
                    border.color: "#575148"
                    radius: 8

                    ColumnLayout {
                        id: secALayout
                        anchors.left: parent.left
                        anchors.right: parent.right
                        anchors.top: parent.top
                        anchors.margins: 14
                        spacing: 10

                        Text {
                            text: "Island State & Basic Controls"
                            font.bold: true
                            font.pixelSize: 13
                            color: "#F4F0E9"
                        }

                        GuideItem {
                            badgeText: "Click Capsule"
                            description: "Expands the compact pill into the interactive Expanded Panel."
                        }

                        GuideItem {
                            badgeText: "Hover Capsule"
                            description: "Quick preview of currently playing track or status (requires Hover Preview enabled)."
                        }

                        GuideItem {
                            badgeText: "Esc Key"
                            description: "Instantly collapses and dismisses the expanded island back to compact capsule."
                        }

                        GuideItem {
                            badgeText: "Click Outside"
                            description: "Clicking outside the expanded island dismisses it back to compact mode."
                        }
                    }
                }

                // Section B: Carousel & Navigation Gestures
                Rectangle {
                    Layout.fillWidth: true
                    implicitHeight: secBLayout.implicitHeight + 28
                    color: "#302D28"
                    border.color: "#575148"
                    radius: 8

                    ColumnLayout {
                        id: secBLayout
                        anchors.left: parent.left
                        anchors.right: parent.right
                        anchors.top: parent.top
                        anchors.margins: 14
                        spacing: 10

                        Text {
                            text: "Carousel & Navigation Gestures"
                            font.bold: true
                            font.pixelSize: 13
                            color: "#F4F0E9"
                        }

                        GuideItem {
                            badgeText: "Drag ← / →"
                            description: "Click and drag horizontally inside the expanded card to switch between Music and System & Controls."
                        }

                        GuideItem {
                            badgeText: "Scroll ◄ / ►"
                            description: "Horizontal trackpad or mouse wheel scroll to slide across carousel pages."
                        }

                        GuideItem {
                            badgeText: "Click ♫ / ⚙"
                            description: "Click top navigation icons or bottom indicator dots to jump directly between pages."
                        }
                    }
                }

                // Section C: Media Player Controls & Seeking
                Rectangle {
                    Layout.fillWidth: true
                    implicitHeight: secCLayout.implicitHeight + 28
                    color: "#302D28"
                    border.color: "#575148"
                    radius: 8

                    ColumnLayout {
                        id: secCLayout
                        anchors.left: parent.left
                        anchors.right: parent.right
                        anchors.top: parent.top
                        anchors.margins: 14
                        spacing: 10

                        Text {
                            text: "Media Player Controls & Seeking"
                            font.bold: true
                            font.pixelSize: 13
                            color: "#F4F0E9"
                        }

                        GuideItem {
                            badgeText: "Play / Pause / Next / Prev"
                            description: "Standard playback controls, dynamically enabled based on MPRIS capabilities."
                        }

                        GuideItem {
                            badgeText: "Click Progress Track"
                            description: "Instant seek to any position along the playback timeline."
                        }

                        GuideItem {
                            badgeText: "Player Switcher (▾)"
                            description: "Click the player dropdown on the artist line to cycle between active media apps (Spotify, Firefox, etc.)."
                        }
                    }
                }

                // Section D: System Metrics & Quick Toggles
                Rectangle {
                    Layout.fillWidth: true
                    implicitHeight: secDLayout.implicitHeight + 28
                    color: "#302D28"
                    border.color: "#575148"
                    radius: 8

                    ColumnLayout {
                        id: secDLayout
                        anchors.left: parent.left
                        anchors.right: parent.right
                        anchors.top: parent.top
                        anchors.margins: 14
                        spacing: 10

                        Text {
                            text: "System Metrics & Quick Toggles"
                            font.bold: true
                            font.pixelSize: 13
                            color: "#F4F0E9"
                        }

                        GuideItem {
                            badgeText: "Live System Metrics"
                            description: "Real-time CPU, RAM, and Battery percentage readouts."
                        }

                        GuideItem {
                            badgeText: "Quick Toggles"
                            description: "One-click toggles for audio mute, network status, or dark/light theme."
                        }
                    }
                }

                // Section E: Notch & Display Setup
                Rectangle {
                    Layout.fillWidth: true
                    implicitHeight: secELayout.implicitHeight + 28
                    color: "#302D28"
                    border.color: "#575148"
                    radius: 8

                    ColumnLayout {
                        id: secELayout
                        anchors.left: parent.left
                        anchors.right: parent.right
                        anchors.top: parent.top
                        anchors.margins: 14
                        spacing: 10

                        Text {
                            text: "Notch & Display Setup"
                            font.bold: true
                            font.pixelSize: 13
                            color: "#F4F0E9"
                        }

                        GuideItem {
                            badgeText: "Top Offset Slider"
                            description: "Adjust vertical positioning (0 px flush to panel, 8 px floating, 32 px below camera notch)."
                        }

                        GuideItem {
                            badgeText: "Horizontal Offset Slider"
                            description: "Center alignment adjustments for off-center camera punch-holes."
                        }
                    }
                }

                Item {
                    Layout.fillWidth: true
                    Layout.preferredHeight: 8
                }
            }
        }
        // Status & Error bar
        Rectangle {
            Layout.fillWidth: true
            height: 36
            radius: 8
            color: "#302D28"
            border.color: settingsProxy.errorMessage.length > 0 ? "#F2A3A0" : "#575148"

            RowLayout {
                anchors.fill: parent
                anchors.leftMargin: 12
                anchors.rightMargin: 12

                Text {
                    text: settingsProxy.errorMessage.length > 0 ? settingsProxy.errorMessage : (settingsProxy.busy ? "Synchronizing..." : "Settings Synchronized")
                    color: settingsProxy.errorMessage.length > 0 ? "#F2A3A0" : "#A69C8F"
                    font.pixelSize: 12
                    elide: Text.ElideRight
                    Layout.fillWidth: true
                }
            }
        }
    }
}
