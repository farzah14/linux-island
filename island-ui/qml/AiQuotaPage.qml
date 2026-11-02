import QtQuick
import QtQuick.Layouts

Item {
    id: root

    implicitWidth: parent ? parent.width : 320
    implicitHeight: 130

    component QuotaRow: ColumnLayout {
        id: rowRoot
        property string providerId: ""
        property string providerName: ""
        property string iconSource: ""
        property var quotaData: null
        property string activeMode: "5h" // "5h" or "7d"

        readonly property bool isConnected: Boolean(quotaData && quotaData.connected)
        readonly property int activePercent: isConnected
            ? (activeMode === "5h" ? (quotaData.percent5h || 0) : (quotaData.percent7d || 0))
            : 0
        readonly property string activeDetail: isConnected
            ? (activeMode === "5h" ? (quotaData.detailText || "") : (quotaData.altDetailText || ""))
            : "No active session"

        Layout.fillWidth: true
        spacing: 2

        // Row 1: Icon + Name + Window chips + Progress track + Percentage
        RowLayout {
            Layout.fillWidth: true
            spacing: 6

            Image {
                Layout.preferredWidth: 14
                Layout.preferredHeight: 14
                source: rowRoot.iconSource
                fillMode: Image.PreserveAspectFit
            }

            Text {
                text: rowRoot.providerName
                font.pixelSize: 11
                font.bold: true
                color: IslandTheme.textPrimary
                Layout.preferredWidth: 78
                elide: Text.ElideRight
            }

            // Window Toggle: [5h] [Wk]
            RowLayout {
                spacing: 2

                Rectangle {
                    implicitWidth: 26
                    implicitHeight: 16
                    radius: 4
                    color: rowRoot.activeMode === "5h" ? IslandTheme.surfaceHover : "transparent"
                    border.width: 1
                    border.color: rowRoot.activeMode === "5h" ? IslandTheme.accentPrimary : "transparent"

                    Text {
                        anchors.centerIn: parent
                        text: "5h"
                        font.pixelSize: 9
                        font.bold: true
                        color: rowRoot.activeMode === "5h" ? IslandTheme.accentPrimary : IslandTheme.textSecondary
                    }

                    MouseArea {
                        id: btn5Mouse
                        anchors.fill: parent
                        hoverEnabled: true
                        cursorShape: Qt.PointingHandCursor
                        onClicked: rowRoot.activeMode = "5h"
                    }
                }

                Rectangle {
                    implicitWidth: 26
                    implicitHeight: 16
                    radius: 4
                    color: rowRoot.activeMode === "7d" ? IslandTheme.surfaceHover : "transparent"
                    border.width: 1
                    border.color: rowRoot.activeMode === "7d" ? IslandTheme.accentPrimary : "transparent"

                    Text {
                        anchors.centerIn: parent
                        text: "Wk"
                        font.pixelSize: 9
                        font.bold: true
                        color: rowRoot.activeMode === "7d" ? IslandTheme.accentPrimary : IslandTheme.textSecondary
                    }

                    MouseArea {
                        id: btn7Mouse
                        anchors.fill: parent
                        hoverEnabled: true
                        cursorShape: Qt.PointingHandCursor
                        onClicked: rowRoot.activeMode = "7d"
                    }
                }
            }

            // Progress Track
            Rectangle {
                Layout.fillWidth: true
                Layout.preferredHeight: 4
                radius: 2
                color: IslandTheme.surfaceRaised

                Rectangle {
                    height: parent.height
                    width: Math.max(0, Math.min(parent.width, parent.width * (rowRoot.activePercent / 100.0)))
                    radius: 2
                    color: rowRoot.activePercent > 95
                        ? IslandTheme.statusDanger
                        : (rowRoot.activePercent > 80 ? IslandTheme.statusWarning : IslandTheme.accentPrimary)
                }
            }

            // Percentage Value
            Text {
                text: rowRoot.isConnected ? (rowRoot.activePercent + "%") : "--%"
                font.pixelSize: 10
                font.bold: true
                color: rowRoot.activePercent > 95
                    ? IslandTheme.statusDanger
                    : (rowRoot.activePercent > 80 ? IslandTheme.statusWarning : IslandTheme.textPrimary)
                Layout.preferredWidth: 28
                horizontalAlignment: Text.AlignRight
            }
        }

        // Row 2: Secondary detail line
        RowLayout {
            Layout.fillWidth: true
            spacing: 6

            Item { Layout.preferredWidth: 14 } // indent matching icon

            Text {
                Layout.fillWidth: true
                text: rowRoot.activeDetail
                font.pixelSize: 9
                color: IslandTheme.textTertiary
                elide: Text.ElideRight
            }
        }
    }

    ColumnLayout {
        anchors.fill: parent
        anchors.margins: 6
        spacing: 4

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

        // Bottom Action: Refresh / Sync
        RowLayout {
            Layout.fillWidth: true
            Layout.topMargin: 2

            Item { Layout.fillWidth: true }

            Text {
                text: aiQuota.refreshing ? "Refreshing quotas..." : "Sync AI Quotas ↻"
                font.pixelSize: 10
                font.bold: true
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
