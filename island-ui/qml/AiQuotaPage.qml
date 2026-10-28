import QtQuick
import QtQuick.Layouts
import QtQuick.Controls

Item {
    id: root

    implicitWidth: parent ? parent.width : 340
    implicitHeight: 200

    component QuotaRow: Rectangle {
        id: rowRoot
        property string providerId: ""
        property string providerName: ""
        property string iconSource: ""
        property var quotaData: null
        property string activeMode: "5h" // "5h" or "7d"

        Layout.fillWidth: true
        Layout.preferredHeight: 52
        radius: 8
        color: IslandTheme.surfaceRaised
        border.color: IslandTheme.borderSubtle

        ColumnLayout {
            anchors.fill: parent
            anchors.margins: 6
            spacing: 2

            // Top Header: Icon + Name + Spacer + 5h button + 7d button
            RowLayout {
                Layout.fillWidth: true
                spacing: 6

                Image {
                    Layout.preferredWidth: 16
                    Layout.preferredHeight: 16
                    source: rowRoot.iconSource
                    fillMode: Image.PreserveAspectFit
                }

                Text {
                    text: rowRoot.providerName
                    font.pixelSize: 11
                    font.bold: true
                    color: IslandTheme.textPrimary
                }

                Item { Layout.fillWidth: true }

                // 5h Button
                Rectangle {
                    implicitWidth: 54
                    implicitHeight: 18
                    radius: 4
                    color: rowRoot.activeMode === "5h" ? IslandTheme.accentPrimary : (btn5Mouse.containsMouse ? IslandTheme.surfaceHover : IslandTheme.surfaceIsland)
                    border.color: IslandTheme.borderSubtle

                    Text {
                        anchors.centerIn: parent
                        text: (rowRoot.quotaData && rowRoot.quotaData.connected)
                            ? ("5h: " + rowRoot.quotaData.percent5h + "%")
                            : "5h: --%"
                        font.pixelSize: 9
                        font.bold: true
                        color: rowRoot.activeMode === "5h" ? IslandTheme.surfaceIsland : IslandTheme.textPrimary
                    }

                    MouseArea {
                        id: btn5Mouse
                        anchors.fill: parent
                        cursorShape: Qt.PointingHandCursor
                        onClicked: rowRoot.activeMode = "5h"
                    }
                }

                // 7d Button
                Rectangle {
                    implicitWidth: 54
                    implicitHeight: 18
                    radius: 4
                    color: rowRoot.activeMode === "7d" ? IslandTheme.accentPrimary : (btn7Mouse.containsMouse ? IslandTheme.surfaceHover : IslandTheme.surfaceIsland)
                    border.color: IslandTheme.borderSubtle

                    Text {
                        anchors.centerIn: parent
                        text: (rowRoot.quotaData && rowRoot.quotaData.connected)
                            ? ("7d: " + rowRoot.quotaData.percent7d + "%")
                            : "7d: --%"
                        font.pixelSize: 9
                        font.bold: true
                        color: rowRoot.activeMode === "7d" ? IslandTheme.surfaceIsland : IslandTheme.textPrimary
                    }

                    MouseArea {
                        id: btn7Mouse
                        anchors.fill: parent
                        cursorShape: Qt.PointingHandCursor
                        onClicked: rowRoot.activeMode = "7d"
                    }
                }
            }

            // Bottom row: Detail description
            RowLayout {
                Layout.fillWidth: true
                Text {
                    Layout.fillWidth: true
                    text: (rowRoot.quotaData && rowRoot.quotaData.connected)
                        ? (rowRoot.activeMode === "5h" ? rowRoot.quotaData.detailText : rowRoot.quotaData.altDetailText)
                        : "No active session"
                    font.pixelSize: 9
                    color: IslandTheme.textSecondary
                    elide: Text.ElideRight
                }
            }
        }
    }

    ColumnLayout {
        anchors.fill: parent
        anchors.margins: 8
        spacing: 6

        QuotaRow {
            providerId: "antigravity"
            providerName: "Antigravity"
            iconSource: "qrc:/linuxisland/ui/icons/antigravity.png"
            quotaData: aiQuota.antigravity
        }

        QuotaRow {
            providerId: "codex"
            providerName: "OpenAI Codex"
            iconSource: "qrc:/linuxisland/ui/icons/codex.png"
            quotaData: aiQuota.codex
        }

        QuotaRow {
            providerId: "claude"
            providerName: (aiQuota.claude && aiQuota.claude.source === "antigravity-shared") ? "Claude (AGY)" : "Claude"
            iconSource: "qrc:/linuxisland/ui/icons/claude.png"
            quotaData: aiQuota.claude
        }

        RowLayout {
            Layout.fillWidth: true
            Item { Layout.fillWidth: true }
            Text {
                text: aiQuota.refreshing ? "Refreshing quotas..." : "Sync AI Quotas ↻"
                font.pixelSize: 10
                color: refreshMouse.containsMouse ? IslandTheme.accentHover : IslandTheme.accentPrimary
                MouseArea {
                    id: refreshMouse
                    anchors.fill: parent
                    hoverEnabled: true
                    cursorShape: Qt.PointingHandCursor
                    onClicked: aiQuota.refresh()
                }
            }
        }
    }
}
