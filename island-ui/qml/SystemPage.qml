import QtQuick
import QtQuick.Layouts

Item {
    id: root

    implicitWidth: parent ? parent.width : 320
    implicitHeight: 120

    readonly property bool shouldPoll: visible && SwipeView.isCurrentItem && islandClient.uiState === "EXPANDED"

    onShouldPollChanged: {
        systemMetrics.setPollingActive(shouldPoll);
    }

    Component.onCompleted: {
        systemMetrics.setPollingActive(shouldPoll);
    }

    Component.onDestruction: {
        systemMetrics.setPollingActive(false);
    }

    RowLayout {
        anchors.fill: parent
        anchors.margins: 6
        spacing: 10

        // Slot 1: Left Metrics Column (CPU, RAM, BAT)
        ColumnLayout {
            Layout.fillWidth: true
            Layout.preferredWidth: 100
            Layout.alignment: Qt.AlignVCenter
            spacing: 6

            // CPU Tile
            ColumnLayout {
                Layout.fillWidth: true
                spacing: 2

                RowLayout {
                    Layout.fillWidth: true
                    Text {
                        text: "CPU"
                        font.pixelSize: 11
                        font.bold: true
                        color: IslandTheme.textSecondary
                    }
                    Item { Layout.fillWidth: true }
                    Text {
                        text: systemMetrics.cpuText
                        font.pixelSize: 11
                        font.bold: true
                        color: systemMetrics.cpuPercent > 85 ? IslandTheme.statusWarning : IslandTheme.textPrimary
                    }
                }

                Rectangle {
                    Layout.fillWidth: true
                    Layout.preferredHeight: 2
                    radius: 1
                    color: IslandTheme.surfaceHover
                    Rectangle {
                        height: parent.height
                        width: Math.max(0, Math.min(parent.width, parent.width * (systemMetrics.cpuPercent / 100.0)))
                        radius: 1
                        color: systemMetrics.cpuPercent > 85 ? IslandTheme.statusWarning : IslandTheme.accentPrimary
                    }
                }
            }

            // RAM Tile
            ColumnLayout {
                Layout.fillWidth: true
                spacing: 2

                RowLayout {
                    Layout.fillWidth: true
                    Text {
                        text: "RAM"
                        font.pixelSize: 11
                        font.bold: true
                        color: IslandTheme.textSecondary
                    }
                    Item { Layout.fillWidth: true }
                    Text {
                        text: systemMetrics.memText
                        font.pixelSize: 11
                        font.bold: true
                        color: systemMetrics.memPercent > 85 ? IslandTheme.statusWarning : IslandTheme.textPrimary
                    }
                }

                Rectangle {
                    Layout.fillWidth: true
                    Layout.preferredHeight: 2
                    radius: 1
                    color: IslandTheme.surfaceHover
                    Rectangle {
                        height: parent.height
                        width: Math.max(0, Math.min(parent.width, parent.width * (systemMetrics.memPercent / 100.0)))
                        radius: 1
                        color: systemMetrics.memPercent > 85 ? IslandTheme.statusWarning : IslandTheme.accentPrimary
                    }
                }
            }

            // Battery Tile (if battery hardware present)
            ColumnLayout {
                Layout.fillWidth: true
                spacing: 2
                visible: systemMetrics.hasBattery

                RowLayout {
                    Layout.fillWidth: true
                    Text {
                        text: systemMetrics.batteryCharging ? "BAT ⚡" : "BAT"
                        font.pixelSize: 11
                        font.bold: true
                        color: IslandTheme.textSecondary
                    }
                    Item { Layout.fillWidth: true }
                    Text {
                        text: systemMetrics.batteryText
                        font.pixelSize: 11
                        font.bold: true
                        color: systemMetrics.batteryPercent < 20 ? IslandTheme.statusDanger : IslandTheme.textPrimary
                    }
                }

                Rectangle {
                    Layout.fillWidth: true
                    Layout.preferredHeight: 2
                    radius: 1
                    color: IslandTheme.surfaceHover
                    Rectangle {
                        height: parent.height
                        width: Math.max(0, Math.min(parent.width, parent.width * (systemMetrics.batteryPercent / 100.0)))
                        radius: 1
                        color: systemMetrics.batteryPercent < 20 ? IslandTheme.statusDanger : IslandTheme.accentPrimary
                    }
                }
            }
        }

        // Slot 2: Centre NET Monitor
        ColumnLayout {
            Layout.alignment: Qt.AlignHCenter | Qt.AlignVCenter
            Layout.preferredWidth: 80
            spacing: 3

            RowLayout {
                Layout.alignment: Qt.AlignHCenter
                spacing: 4

                NavIcon {
                    size: 12
                    source: "qrc:/linuxisland/ui/icons/ui/system-symbolic.svg"
                    color: IslandTheme.textSecondary
                }

                Text {
                    text: "NET"
                    font.pixelSize: 11
                    font.bold: true
                    color: IslandTheme.textSecondary
                }
            }

            Text {
                text: {
                    var parts = systemMetrics.netDetailText.split(" · ");
                    return parts.length > 0 ? parts[0] : "↓ 0 B/s";
                }
                font.pixelSize: 10
                font.bold: true
                color: IslandTheme.textPrimary
                Layout.alignment: Qt.AlignHCenter
            }

            Text {
                text: {
                    var parts = systemMetrics.netDetailText.split(" · ");
                    return parts.length > 1 ? parts[1] : "↑ 0 B/s";
                }
                font.pixelSize: 10
                font.bold: true
                color: IslandTheme.textPrimary
                Layout.alignment: Qt.AlignHCenter
            }
        }

        // Slot 3: Right Quick Toggles & Storage Readout
        ColumnLayout {
            Layout.fillWidth: true
            Layout.preferredWidth: 100
            Layout.alignment: Qt.AlignVCenter
            spacing: 8

            // 4 Icon Quick Toggles
            RowLayout {
                Layout.alignment: Qt.AlignRight
                spacing: 4

                // Theme Toggle
                Rectangle {
                    implicitWidth: 24
                    implicitHeight: 24
                    radius: 6
                    color: themeMouse.containsMouse ? IslandTheme.surfaceHover : IslandTheme.surfaceRaised

                    NavIcon {
                        anchors.centerIn: parent
                        size: 13
                        source: "qrc:/linuxisland/ui/icons/ui/theme-symbolic.svg"
                        color: quickSettings.darkMode ? IslandTheme.accentPrimary : IslandTheme.textSecondary
                    }

                    MouseArea {
                        id: themeMouse
                        anchors.fill: parent
                        hoverEnabled: true
                        cursorShape: Qt.PointingHandCursor
                        onClicked: quickSettings.toggleDarkMode()
                    }
                }

                // Night Light Toggle
                Rectangle {
                    implicitWidth: 24
                    implicitHeight: 24
                    radius: 6
                    color: nightMouse.containsMouse ? IslandTheme.surfaceHover : IslandTheme.surfaceRaised

                    NavIcon {
                        anchors.centerIn: parent
                        size: 13
                        source: "qrc:/linuxisland/ui/icons/ui/night-light-symbolic.svg"
                        color: quickSettings.nightLight ? IslandTheme.accentPrimary : IslandTheme.textSecondary
                    }

                    MouseArea {
                        id: nightMouse
                        anchors.fill: parent
                        hoverEnabled: true
                        cursorShape: Qt.PointingHandCursor
                        onClicked: quickSettings.toggleNightLight()
                    }
                }

                // DND Toggle
                Rectangle {
                    implicitWidth: 24
                    implicitHeight: 24
                    radius: 6
                    color: dndMouse.containsMouse ? IslandTheme.surfaceHover : IslandTheme.surfaceRaised

                    NavIcon {
                        anchors.centerIn: parent
                        size: 13
                        source: "qrc:/linuxisland/ui/icons/ui/dnd-symbolic.svg"
                        color: quickSettings.dnd ? IslandTheme.statusDanger : IslandTheme.textSecondary
                    }

                    MouseArea {
                        id: dndMouse
                        anchors.fill: parent
                        hoverEnabled: true
                        cursorShape: Qt.PointingHandCursor
                        onClicked: quickSettings.toggleDnd()
                    }
                }

                // Settings Launcher
                Rectangle {
                    implicitWidth: 24
                    implicitHeight: 24
                    radius: 6
                    color: settingsMouse.containsMouse ? IslandTheme.surfaceHover : IslandTheme.surfaceRaised

                    NavIcon {
                        anchors.centerIn: parent
                        size: 13
                        source: "qrc:/linuxisland/ui/icons/ui/system-symbolic.svg"
                        color: IslandTheme.textSecondary
                    }

                    MouseArea {
                        id: settingsMouse
                        anchors.fill: parent
                        hoverEnabled: true
                        cursorShape: Qt.PointingHandCursor
                        onClicked: quickSettings.openSettingsApp()
                    }
                }
            }

            // Memory detail readout
            Text {
                text: systemMetrics.memDetailText ? systemMetrics.memDetailText : "System Memory"
                font.pixelSize: 9
                color: IslandTheme.textTertiary
                Layout.alignment: Qt.AlignRight
                elide: Text.ElideRight
            }
        }
    }
}
