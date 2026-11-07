import QtQuick
import QtQuick.Controls
import QtQuick.Layouts

Item {
    id: root

    implicitWidth: parent ? parent.width : 320
    implicitHeight: 116

    Timer {
        interval: 15000
        running: root.visible && root.SwipeView.isCurrentItem && islandClient.uiState === "EXPANDED"
        repeat: true
        triggeredOnStart: true
        onTriggered: aiQuota.refresh()
    }

    component QuotaRow: ColumnLayout {
        id: rowRoot
        property string providerId: ""
        property string providerName: ""
        property string iconSource: ""
        property var quotaData: null
        property string activeMode: "5h" // "5h" or "7d"

        readonly property bool isConnected: Boolean(quotaData && quotaData.connected)
        readonly property bool has5h: Boolean(quotaData && quotaData.has5h)
        readonly property bool has7d: Boolean(quotaData && quotaData.has7d)
        readonly property string activeDetail: !isConnected
            ? ((quotaData && quotaData.detailText) ? quotaData.detailText : "Offline")
            : (activeMode === "5h"
                ? (has5h
                    ? ((quotaData.detailText) ? quotaData.detailText : "")
                    : ((quotaData.altDetailText || quotaData.detailText) ? (quotaData.altDetailText || quotaData.detailText) : ""))
                : (has7d
                    ? ((quotaData.altDetailText || quotaData.detailText) ? (quotaData.altDetailText || quotaData.detailText) : "")
                    : ((quotaData.detailText) ? quotaData.detailText : "")))

        Layout.fillWidth: true
        spacing: 1

        // Row 1: [Icon 14x14] [Name] [Spacer] [5h Pill] [7d Pill]
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
                Layout.preferredWidth: 100
                elide: Text.ElideRight
            }

            Item { Layout.fillWidth: true }

            // 5h Quota Pill Button
            Rectangle {
                implicitHeight: 18
                implicitWidth: lbl5h.implicitWidth + 12
                radius: 6
                color: rowRoot.activeMode === "5h"
                    ? IslandTheme.surfaceHover
                    : (btn5Mouse.containsMouse ? IslandTheme.surfaceHover : IslandTheme.surfaceRaised)
                border.width: 1
                border.color: rowRoot.activeMode === "5h" ? IslandTheme.accentPrimary : IslandTheme.borderSubtle

                Text {
                    id: lbl5h
                    anchors.centerIn: parent
                    text: (rowRoot.isConnected && rowRoot.has5h)
                        ? ("5h: " + rowRoot.quotaData.percent5h + "%")
                        : "5h: --%"
                    font.pixelSize: 10
                    font.bold: true
                    color: rowRoot.activeMode === "5h"
                        ? IslandTheme.accentPrimary
                        : (btn5Mouse.containsMouse ? IslandTheme.textPrimary : IslandTheme.textSecondary)
                }

                MouseArea {
                    id: btn5Mouse
                    anchors.fill: parent
                    hoverEnabled: true
                    cursorShape: Qt.PointingHandCursor
                    onClicked: rowRoot.activeMode = "5h"
                }
            }

            // 7d / Weekly Quota Pill Button
            Rectangle {
                implicitHeight: 18
                implicitWidth: lbl7d.implicitWidth + 12
                radius: 6
                color: rowRoot.activeMode === "7d"
                    ? IslandTheme.surfaceHover
                    : (btn7Mouse.containsMouse ? IslandTheme.surfaceHover : IslandTheme.surfaceRaised)
                border.width: 1
                border.color: rowRoot.activeMode === "7d" ? IslandTheme.accentPrimary : IslandTheme.borderSubtle

                Text {
                    id: lbl7d
                    anchors.centerIn: parent
                    text: (rowRoot.isConnected && rowRoot.has7d)
                        ? (((rowRoot.quotaData.weeklyWindow === "30d") ? "30d: " : "7d: ") + rowRoot.quotaData.percent7d + "%")
                        : "7d: --%"
                    font.pixelSize: 10
                    font.bold: true
                    color: rowRoot.activeMode === "7d"
                        ? IslandTheme.accentPrimary
                        : (btn7Mouse.containsMouse ? IslandTheme.textPrimary : IslandTheme.textSecondary)
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

        // Row 2: Secondary detail line
        RowLayout {
            Layout.fillWidth: true
            spacing: 6

            Item { Layout.preferredWidth: 14 } // indent matching icon

            Text {
                Layout.fillWidth: true
                text: rowRoot.activeDetail
                font.pixelSize: 9
                color: IslandTheme.textSecondary
                elide: Text.ElideRight
            }
        }
    }

    ColumnLayout {
        anchors.fill: parent
        anchors.leftMargin: 4
        anchors.rightMargin: 4
        anchors.topMargin: 0
        anchors.bottomMargin: 0
        spacing: 2

        // Row 0: Top Bar
        RowLayout {
            Layout.fillWidth: true

            Text {
                text: aiQuota.checking ? "AI Quota · checking…" : "AI Quota"
                font.pixelSize: 11
                font.bold: true
                color: IslandTheme.textSecondary
            }

            Item { Layout.fillWidth: true }

            Text {
                text: aiQuota.refreshing ? "…" : "↻"
                font.pixelSize: 11
                font.bold: true
                color: syncMouse.containsMouse ? IslandTheme.accentHover : IslandTheme.textSecondary

                MouseArea {
                    id: syncMouse
                    anchors.fill: parent
                    hoverEnabled: true
                    cursorShape: Qt.PointingHandCursor
                    onClicked: aiQuota.refresh()
                }
            }
        }

        QuotaRow {
            providerId: "antigravity"
            providerName: "Antigravity"
            iconSource: "qrc:/linuxisland/ui/icons/antigravity.png"
            quotaData: aiQuota.antigravity
        }

        QuotaRow {
            providerId: "codex"
            providerName: "Codex"
            iconSource: "qrc:/linuxisland/ui/icons/codex.png"
            quotaData: aiQuota.codex
        }

        QuotaRow {
            providerId: "claude"
            providerName: (aiQuota.claude && aiQuota.claude.source === "antigravity-shared") ? "Claude (AGY)" : "Claude"
            iconSource: "qrc:/linuxisland/ui/icons/claude.png"
            quotaData: aiQuota.claude
        }
    }
}
