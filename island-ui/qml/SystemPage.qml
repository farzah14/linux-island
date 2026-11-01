import QtQuick
import QtQuick.Layouts
import QtQuick.Controls

Item {
    id: root

    implicitWidth: parent ? parent.width : 340
    implicitHeight: 200

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

    ColumnLayout {
        anchors.fill: parent
        anchors.margins: 10
        spacing: 12

        // Top Row: 3 Metric Cards
        RowLayout {
            Layout.fillWidth: true
            spacing: 8

            // 1. CPU Card
            Rectangle {
                Layout.fillWidth: true
                Layout.preferredHeight: 74
                radius: 10
                color: IslandTheme.surfaceRaised
                border.color: IslandTheme.borderSubtle

                ColumnLayout {
                    anchors.fill: parent
                    anchors.margins: 8
                    spacing: 4

                    RowLayout {
                        Layout.fillWidth: true
                        Text { text: "⚡"; font.pixelSize: 12 }
                        Text { text: "CPU"; font.pixelSize: 11; font.bold: true; color: IslandTheme.textPrimary }
                        Item { Layout.fillWidth: true }
                        Text { text: systemMetrics.cpuText; font.pixelSize: 12; font.bold: true; color: IslandTheme.accentPrimary }
                    }

                    Rectangle {
                        Layout.fillWidth: true
                        height: 4
                        radius: 2
                        color: IslandTheme.surfaceHover
                        Rectangle {
                            height: parent.height
                            width: Math.max(0, Math.min(parent.width, parent.width * (systemMetrics.cpuPercent / 100.0)))
                            radius: 2
                            color: IslandTheme.accentPrimary
                        }
                    }

                    Text {
                        text: "Active Load"
                        font.pixelSize: 9
                        color: IslandTheme.textTertiary
                    }
                }
            }

            // 2. RAM Card
            Rectangle {
                Layout.fillWidth: true
                Layout.preferredHeight: 74
                radius: 10
                color: IslandTheme.surfaceRaised
                border.color: IslandTheme.borderSubtle

                ColumnLayout {
                    anchors.fill: parent
                    anchors.margins: 8
                    spacing: 4

                    RowLayout {
                        Layout.fillWidth: true
                        Text { text: "🧠"; font.pixelSize: 12 }
                        Text { text: "RAM"; font.pixelSize: 11; font.bold: true; color: IslandTheme.textPrimary }
                        Item { Layout.fillWidth: true }
                        Text { text: systemMetrics.memText; font.pixelSize: 12; font.bold: true; color: IslandTheme.accentPrimary }
                    }

                    Rectangle {
                        Layout.fillWidth: true
                        height: 4
                        radius: 2
                        color: IslandTheme.surfaceHover
                        Rectangle {
                            height: parent.height
                            width: Math.max(0, Math.min(parent.width, parent.width * (systemMetrics.memPercent / 100.0)))
                            radius: 2
                            color: IslandTheme.accentPrimary
                        }
                    }

                    Text {
                        text: systemMetrics.memDetailText ? systemMetrics.memDetailText : "System Memory"
                        font.pixelSize: 9
                        color: IslandTheme.textTertiary
                        elide: Text.ElideRight
                    }
                }
            }

            // 3. Battery or Network Card
            Rectangle {
                Layout.fillWidth: true
                Layout.preferredHeight: 74
                radius: 10
                color: IslandTheme.surfaceRaised
                border.color: IslandTheme.borderSubtle

                ColumnLayout {
                    anchors.fill: parent
                    anchors.margins: 8
                    spacing: 4

                    RowLayout {
                        Layout.fillWidth: true
                        Text { text: systemMetrics.hasBattery ? (systemMetrics.batteryCharging ? "⚡" : "🔋") : "🌐"; font.pixelSize: 12 }
                        Text { text: systemMetrics.hasBattery ? "Battery" : "Net"; font.pixelSize: 11; font.bold: true; color: IslandTheme.textPrimary }
                        Item { Layout.fillWidth: true }
                        Text {
                            text: systemMetrics.hasBattery ? systemMetrics.batteryText : systemMetrics.netText
                            font.pixelSize: 12
                            font.bold: true
                            color: IslandTheme.accentPrimary
                        }
                    }

                    Rectangle {
                        Layout.fillWidth: true
                        height: 4
                        radius: 2
                        color: IslandTheme.surfaceHover
                        Rectangle {
                            height: parent.height
                            width: systemMetrics.hasBattery
                                ? Math.max(0, Math.min(parent.width, parent.width * (systemMetrics.batteryPercent / 100.0)))
                                : parent.width * 0.5
                            radius: 2
                            color: systemMetrics.hasBattery && systemMetrics.batteryPercent < 20 ? IslandTheme.statusDanger : IslandTheme.accentPrimary
                        }
                    }

                    Text {
                        text: systemMetrics.hasBattery
                            ? (systemMetrics.batteryCharging ? "Charging" : "Discharging")
                            : systemMetrics.netDetailText
                        font.pixelSize: 9
                        color: IslandTheme.textTertiary
                        elide: Text.ElideRight
                    }
                }
            }
        }

        // Bottom Row: 4 Quick Toggle Buttons
        RowLayout {
            Layout.fillWidth: true
            spacing: 8

            // 1. Theme toggle
            Rectangle {
                Layout.fillWidth: true
                Layout.preferredHeight: 38
                radius: 8
                color: themeBtnMouse.containsMouse ? IslandTheme.surfaceHover : IslandTheme.surfaceRaised
                border.color: IslandTheme.borderSubtle

                RowLayout {
                    anchors.centerIn: parent
                    spacing: 4
                    Text { text: quickSettings.darkMode ? "🌙" : "☀️"; font.pixelSize: 12 }
                    Text { text: quickSettings.darkMode ? "Dark" : "Light"; font.pixelSize: 11; font.bold: true; color: IslandTheme.textPrimary }
                }

                MouseArea {
                    id: themeBtnMouse
                    anchors.fill: parent
                    hoverEnabled: true
                    cursorShape: Qt.PointingHandCursor
                    onClicked: quickSettings.toggleDarkMode()
                }
            }

            // 2. Night Light toggle
            Rectangle {
                Layout.fillWidth: true
                Layout.preferredHeight: 38
                radius: 8
                color: quickSettings.nightLight ? IslandTheme.surfaceHover : (nightBtnMouse.containsMouse ? IslandTheme.surfaceHover : IslandTheme.surfaceRaised)
                border.color: quickSettings.nightLight ? IslandTheme.accentPrimary : IslandTheme.borderSubtle

                RowLayout {
                    anchors.centerIn: parent
                    spacing: 4
                    Text { text: "👁️"; font.pixelSize: 12 }
                    Text { text: "Night"; font.pixelSize: 11; font.bold: true; color: quickSettings.nightLight ? IslandTheme.accentPrimary : IslandTheme.textPrimary }
                }

                MouseArea {
                    id: nightBtnMouse
                    anchors.fill: parent
                    hoverEnabled: true
                    cursorShape: Qt.PointingHandCursor
                    onClicked: quickSettings.toggleNightLight()
                }
            }

            // 3. DND toggle
            Rectangle {
                Layout.fillWidth: true
                Layout.preferredHeight: 38
                radius: 8
                color: quickSettings.dnd ? IslandTheme.surfaceHover : (dndBtnMouse.containsMouse ? IslandTheme.surfaceHover : IslandTheme.surfaceRaised)
                border.color: quickSettings.dnd ? IslandTheme.statusDanger : IslandTheme.borderSubtle

                RowLayout {
                    anchors.centerIn: parent
                    spacing: 4
                    Text { text: quickSettings.dnd ? "🔕" : "🔔"; font.pixelSize: 12 }
                    Text { text: "DND"; font.pixelSize: 11; font.bold: true; color: quickSettings.dnd ? IslandTheme.statusDanger : IslandTheme.textPrimary }
                }

                MouseArea {
                    id: dndBtnMouse
                    anchors.fill: parent
                    hoverEnabled: true
                    cursorShape: Qt.PointingHandCursor
                    onClicked: quickSettings.toggleDnd()
                }
            }

            // 4. Settings launcher
            Rectangle {
                Layout.fillWidth: true
                Layout.preferredHeight: 38
                radius: 8
                color: settingsBtnMouse.containsMouse ? IslandTheme.surfaceHover : IslandTheme.surfaceRaised
                border.color: IslandTheme.borderSubtle

                RowLayout {
                    anchors.centerIn: parent
                    spacing: 4
                    Text { text: "⚙"; font.pixelSize: 12; color: IslandTheme.textPrimary }
                    Text { text: "Config"; font.pixelSize: 11; font.bold: true; color: IslandTheme.textPrimary }
                }

                MouseArea {
                    id: settingsBtnMouse
                    anchors.fill: parent
                    hoverEnabled: true
                    cursorShape: Qt.PointingHandCursor
                    onClicked: quickSettings.openSettingsApp()
                }
            }
        }
    }
}
