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
        }

        Item { Layout.fillHeight: true }
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
