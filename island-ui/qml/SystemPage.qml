import QtQuick
import QtQuick.Controls
import QtQuick.Layouts

Item {
    id: root
    objectName: "systemPage"

    implicitWidth: parent ? parent.width : 320
    implicitHeight: systemColumn.implicitHeight
    readonly property real contentHeight: implicitHeight

    property string capsuleSize: "medium"
    readonly property bool shouldPoll: visible && SwipeView.isCurrentItem && islandClient.uiState === "EXPANDED"

    onShouldPollChanged: systemMetrics.setPollingActive(shouldPoll)
    Component.onCompleted: systemMetrics.setPollingActive(shouldPoll)
    Component.onDestruction: systemMetrics.setPollingActive(false)

    // Matches GNOME systemMetricTile.js: clean percentage-only 2x2 cards (no mini progress bars)
    component MetricCard: Rectangle {
        objectName: "systemMetricCard"
        property string title: ""
        property string value: ""
        property color valueColor: IslandTheme.textPrimary

        Layout.fillWidth: true
        Layout.preferredHeight: 48
        radius: 10
        color: IslandTheme.surfaceRaised
        border.width: 1
        border.color: IslandTheme.borderSubtle

        ColumnLayout {
            anchors.fill: parent
            anchors.leftMargin: 8
            anchors.rightMargin: 8
            anchors.topMargin: 5
            anchors.bottomMargin: 5
            spacing: 1

            Text {
                text: title
                font.pixelSize: 9
                font.weight: Font.DemiBold
                color: IslandTheme.textTertiary
                Layout.fillWidth: true
                elide: Text.ElideRight
            }

            Text {
                text: value
                font.pixelSize: 13
                font.weight: Font.Bold
                color: valueColor
                Layout.fillWidth: true
                elide: Text.ElideRight
            }
        }
    }

    component QuickPill: Rectangle {
        property string label: ""
        property bool active: false
        signal triggered()

        Layout.fillWidth: true
        implicitHeight: 24
        radius: 999
        color: (pillMouse.containsMouse || active) ? IslandTheme.surfaceHover : IslandTheme.surfaceRaised
        border.width: 1
        border.color: active ? IslandTheme.accentPrimary : IslandTheme.borderSubtle

        Text {
            anchors.centerIn: parent
            text: parent.label
            font.pixelSize: 10
            font.weight: Font.DemiBold
            color: parent.active
                ? (pillMouse.containsMouse ? IslandTheme.accentHover : IslandTheme.accentPrimary)
                : (pillMouse.containsMouse ? IslandTheme.textPrimary : IslandTheme.textSecondary)
            elide: Text.ElideRight
        }

        MouseArea {
            id: pillMouse
            anchors.fill: parent
            hoverEnabled: true
            cursorShape: Qt.PointingHandCursor
            onClicked: parent.triggered()
        }
    }

    ColumnLayout {
        id: systemColumn
        anchors.fill: parent
        spacing: 6

        GridLayout {
            Layout.fillWidth: true
            columns: 2
            columnSpacing: 6
            rowSpacing: 4

            MetricCard {
                title: "CPU LOAD"
                value: systemMetrics.cpuText
                valueColor: systemMetrics.cpuPercent > 85 ? IslandTheme.statusWarning : IslandTheme.textPrimary
            }

            MetricCard {
                title: "MEMORY"
                value: systemMetrics.memText
                valueColor: systemMetrics.memPercent > 85 ? IslandTheme.statusWarning : IslandTheme.textPrimary
            }

            MetricCard {
                title: "BATTERY"
                value: systemMetrics.hasBattery
                    ? (systemMetrics.batteryCharging ? (systemMetrics.batteryText + " · AC") : systemMetrics.batteryText)
                    : "AC"
                valueColor: systemMetrics.hasBattery && systemMetrics.batteryPercent < 20
                    ? IslandTheme.statusDanger
                    : IslandTheme.textPrimary
            }

            MetricCard {
                title: "NETWORK"
                value: systemMetrics.netDetailText
                    ? systemMetrics.netDetailText.replace(/\/s/g, "")
                    : "↓ 0 B · ↑ 0 B"
            }
        }

        // Bare Disk progress bar strip (matches GNOME StorageIndicator)
        Item {
            Layout.fillWidth: true
            implicitHeight: 22

            ColumnLayout {
                anchors.fill: parent
                spacing: 3

                RowLayout {
                    Layout.fillWidth: true
                    spacing: 6

                    Text {
                        text: systemMetrics.storageDetailText ? ("Disk · " + systemMetrics.storageDetailText) : "Disk"
                        font.pixelSize: 10
                        font.weight: Font.DemiBold
                        color: IslandTheme.textSecondary
                        Layout.fillWidth: true
                        elide: Text.ElideRight
                    }

                    Text {
                        text: systemMetrics.storageText
                        font.pixelSize: 10
                        font.weight: Font.DemiBold
                        color: systemMetrics.storagePercent >= 90 ? IslandTheme.statusWarning : IslandTheme.textPrimary
                    }
                }

                Rectangle {
                    Layout.fillWidth: true
                    implicitHeight: 4
                    radius: 2
                    color: IslandTheme.progressTrack

                    Rectangle {
                        width: Math.max(0, Math.min(parent.width, parent.width * Math.max(0, Math.min(1, systemMetrics.storagePercent / 100.0))))
                        height: parent.height
                        radius: 2
                        color: systemMetrics.storagePercent >= 90 ? IslandTheme.statusWarning : IslandTheme.accentPrimary
                    }
                }
            }
        }

        // Bottom 4 horizontal quick pills (matches GNOME QuickTogglesRow)
        RowLayout {
            objectName: "systemQuickActions"
            Layout.fillWidth: true
            spacing: 6

            QuickPill {
                label: islandClient.theme === "light" ? "Light" : (islandClient.theme === "system" ? "Auto" : "Theme")
                active: islandClient.theme !== "light"
                onTriggered: islandClient.cycleTheme()
            }

            QuickPill {
                label: "DND"
                active: quickSettings.dnd
                onTriggered: quickSettings.toggleDnd()
            }

            QuickPill {
                label: "Night"
                active: quickSettings.nightLight
                onTriggered: quickSettings.toggleNightLight()
            }

            QuickPill {
                label: "Settings"
                active: false
                onTriggered: quickSettings.openSettingsApp()
            }
        }
    }
}
