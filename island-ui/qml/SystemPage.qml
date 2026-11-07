import QtQuick
import QtQuick.Controls
import QtQuick.Layouts

Item {
    id: root

    implicitWidth: parent ? parent.width : 320
    implicitHeight: 98

    property string capsuleSize: "medium"
    readonly property int pageWidth: width > 0 ? width - 8 : 286
    readonly property int colGap: pageWidth < 286 ? 6 : 10
    readonly property int netColWidth: 78
    readonly property int sideColWidth: Math.max(64, Math.floor((pageWidth - netColWidth - colGap * 2) / 2))
    readonly property bool compactMetrics: sideColWidth < 76
    readonly property int storageColWidth: Math.max(0, sideColWidth - 22 - 4)
    readonly property bool showStorageDetail: storageColWidth >= 58

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
        anchors.leftMargin: 4
        anchors.rightMargin: 4
        anchors.topMargin: 0
        anchors.bottomMargin: 0
        spacing: root.colGap

        // Slot 1: Left Metrics Column (CPU, RAM, BAT)
        ColumnLayout {
            Layout.fillWidth: true
            Layout.preferredWidth: root.sideColWidth
            Layout.alignment: Qt.AlignVCenter
            spacing: 4

            // CPU Row
            RowLayout {
                Layout.fillWidth: true
                Layout.preferredHeight: 20
                spacing: root.compactMetrics ? 4 : 8
                NavIcon {
                    size: 14
                    source: "qrc:/linuxisland/ui/icons/ui/cpu-symbolic.svg"
                    color: IslandTheme.textSecondary
                    visible: !root.compactMetrics
                }
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

            // RAM Row
            RowLayout {
                Layout.fillWidth: true
                Layout.preferredHeight: 20
                spacing: root.compactMetrics ? 4 : 8
                NavIcon {
                    size: 14
                    source: "qrc:/linuxisland/ui/icons/ui/ram-symbolic.svg"
                    color: IslandTheme.textSecondary
                    visible: !root.compactMetrics
                }
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

            // BAT Row
            RowLayout {
                Layout.fillWidth: true
                Layout.preferredHeight: 20
                visible: systemMetrics.hasBattery
                spacing: root.compactMetrics ? 4 : 8
                NavIcon {
                    size: 14
                    source: "qrc:/linuxisland/ui/icons/ui/battery-symbolic.svg"
                    color: IslandTheme.textSecondary
                    visible: !root.compactMetrics
                }
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
        }

        // Slot 2: Centre NET Monitor
        ColumnLayout {
            Layout.preferredWidth: 78
            Layout.alignment: Qt.AlignHCenter | Qt.AlignVCenter
            spacing: 3

            RowLayout {
                Layout.alignment: Qt.AlignHCenter
                spacing: 4

                NavIcon {
                    size: 13
                    source: "qrc:/linuxisland/ui/icons/ui/network-symbolic.svg"
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
                font.pixelSize: 11
                font.bold: true
                color: IslandTheme.textPrimary
                Layout.alignment: Qt.AlignHCenter
            }

            Text {
                text: {
                    var parts = systemMetrics.netDetailText.split(" · ");
                    return parts.length > 1 ? parts[1] : "↑ 0 B/s";
                }
                font.pixelSize: 11
                font.bold: true
                color: IslandTheme.textPrimary
                Layout.alignment: Qt.AlignHCenter
            }
        }

        // Slot 3: Right Slot (Storage Indicator + Vertical 4-Icon Column)
        RowLayout {
            Layout.fillWidth: true
            Layout.preferredWidth: root.sideColWidth
            Layout.alignment: Qt.AlignVCenter
            spacing: 4

            // Storage Indicator Block
            ColumnLayout {
                Layout.fillWidth: true
                Layout.alignment: Qt.AlignVCenter
                spacing: 2

                NavIcon {
                    size: 13
                    source: "qrc:/linuxisland/ui/icons/ui/disk-symbolic.svg"
                    color: IslandTheme.textSecondary
                    Layout.alignment: Qt.AlignHCenter
                }

                Text {
                    text: systemMetrics.storageText
                    font.pixelSize: 11
                    font.bold: true
                    color: systemMetrics.storagePercent >= 90 ? IslandTheme.statusWarning : IslandTheme.textPrimary
                    Layout.alignment: Qt.AlignHCenter
                }

                Text {
                    id: storageDetailText
                    text: systemMetrics.storageDetailText
                    font.pixelSize: 9
                    color: IslandTheme.textSecondary
                    Layout.alignment: Qt.AlignHCenter
                    visible: root.showStorageDetail
                }
            }

            // Quick Toggle Icon Column (Vertical stack of 4 borderless 22x20px icon buttons)
            ColumnLayout {
                Layout.preferredWidth: 22
                Layout.alignment: Qt.AlignVCenter
                spacing: 4

                // 1. Theme Toggle
                Rectangle {
                    implicitWidth: 22
                    implicitHeight: 20
                    color: themeMouse.containsMouse ? IslandTheme.surfaceHover : "transparent"
                    radius: 4

                    NavIcon {
                        anchors.centerIn: parent
                        size: 14
                        source: "qrc:/linuxisland/ui/icons/ui/theme-symbolic.svg"
                        color: islandClient.theme !== "light" ? IslandTheme.accentPrimary : IslandTheme.textSecondary
                    }

                    MouseArea {
                        id: themeMouse
                        anchors.fill: parent
                        hoverEnabled: true
                        cursorShape: Qt.PointingHandCursor
                        onClicked: islandClient.cycleTheme()
                    }
                }

                // 2. DND Toggle
                Rectangle {
                    implicitWidth: 22
                    implicitHeight: 20
                    color: dndMouse.containsMouse ? IslandTheme.surfaceHover : "transparent"
                    radius: 4

                    NavIcon {
                        anchors.centerIn: parent
                        size: 14
                        source: "qrc:/linuxisland/ui/icons/ui/dnd-symbolic.svg"
                        color: quickSettings.dnd ? IslandTheme.accentPrimary : IslandTheme.textSecondary
                    }

                    MouseArea {
                        id: dndMouse
                        anchors.fill: parent
                        hoverEnabled: true
                        cursorShape: Qt.PointingHandCursor
                        onClicked: quickSettings.toggleDnd()
                    }
                }

                // 3. Night Light Toggle
                Rectangle {
                    implicitWidth: 22
                    implicitHeight: 20
                    color: nightMouse.containsMouse ? IslandTheme.surfaceHover : "transparent"
                    radius: 4

                    NavIcon {
                        anchors.centerIn: parent
                        size: 14
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

                // 4. Settings Launcher
                Rectangle {
                    implicitWidth: 22
                    implicitHeight: 20
                    color: settingsMouse.containsMouse ? IslandTheme.surfaceHover : "transparent"
                    radius: 4

                    NavIcon {
                        anchors.centerIn: parent
                        size: 14
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
        }
    }
}
