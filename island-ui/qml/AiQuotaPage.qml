import QtQuick
import QtQuick.Controls
import QtQuick.Layouts

Item {
    id: root

    implicitWidth: parent ? parent.width : 320
    implicitHeight: 128

    property string selectedProvider: "antigravity"
    property string selectedWindow: "5h"

    readonly property var selectedQuotaData: {
        if (selectedProvider === "codex") return aiQuota.codex;
        if (selectedProvider === "claude") return aiQuota.claude;
        return aiQuota.antigravity;
    }

    readonly property string selectedProviderTitle: {
        if (selectedProvider === "codex") return "Codex";
        if (selectedProvider === "claude")
            return (aiQuota.claude && aiQuota.claude.source === "antigravity-shared") ? "Claude (AGY)" : "Claude";
        return "Antigravity";
    }

    readonly property bool selectedConnected: Boolean(selectedQuotaData && selectedQuotaData.connected)
    readonly property bool selectedHasWindow: Boolean(selectedQuotaData && (selectedWindow === "5h" ? selectedQuotaData.has5h : selectedQuotaData.has7d))
    readonly property int selectedPercent: selectedConnected && selectedHasWindow
        ? Math.round(Math.max(0, Math.min(100, Number(selectedWindow === "5h" ? selectedQuotaData.percent5h : selectedQuotaData.percent7d) || 0)))
        : 0
    readonly property string selectedDetailText: {
        if (!selectedQuotaData || !selectedQuotaData.connected) {
            return `${selectedProviderTitle} · ${(selectedQuotaData && selectedQuotaData.detailText) ? selectedQuotaData.detailText : "Offline"}`;
        }
        const raw = selectedWindow === "5h"
            ? (selectedQuotaData.detailText || selectedQuotaData.altDetailText || "")
            : (selectedQuotaData.altDetailText || selectedQuotaData.detailText || "");
        return raw ? `${selectedProviderTitle} (${selectedWindow}) · ${raw}` : `${selectedProviderTitle} · ${selectedWindow}`;
    }

    Timer {
        interval: 15000
        running: root.visible && root.SwipeView.isCurrentItem && islandClient.uiState === "EXPANDED"
        repeat: true
        triggeredOnStart: true
        onTriggered: aiQuota.refresh()
    }

    component EqualizerCol: ColumnLayout {
        id: colRoot
        property string providerId: ""
        property string providerName: ""
        property string iconSource: ""
        property var quotaData: null

        readonly property bool selected: root.selectedProvider === providerId
        readonly property bool isConnected: Boolean(quotaData && quotaData.connected)
        readonly property bool has5h: Boolean(quotaData && quotaData.has5h)
        readonly property bool has7d: Boolean(quotaData && quotaData.has7d)
        readonly property string mode: selected ? root.selectedWindow : "5h"

        readonly property string weeklyLabel: (quotaData && quotaData.weeklyWindow === "30d") ? "30d" : "7d"

        Layout.fillWidth: true
        spacing: 3

        // Dual vertical equalizer bars (5h, 7d)
        Row {
            Layout.alignment: Qt.AlignHCenter
            spacing: 5

            Repeater {
                model: 2
                Rectangle {
                    required property int index
                    readonly property string winName: index === 0 ? "5h" : "7d"
                    readonly property bool available: colRoot.isConnected && (index === 0 ? colRoot.has5h : colRoot.has7d)
                    readonly property real remaining: available
                        ? Math.max(0, Math.min(100, Number(index === 0 ? colRoot.quotaData.percent5h : colRoot.quotaData.percent7d) || 0))
                        : 0
                    width: 8
                    height: 34
                    radius: 4
                    color: IslandTheme.progressTrack
                    opacity: available ? 1.0 : 0.4

                    Rectangle {
                        anchors.bottom: parent.bottom
                        width: parent.width
                        height: parent.height * parent.remaining / 100
                        radius: 4
                        color: IslandTheme.accentPrimary
                        opacity: (colRoot.selected && colRoot.mode === parent.winName) ? 1.0 : (colRoot.selected ? 0.65 : 0.45)
                    }

                    MouseArea {
                        anchors.fill: parent
                        cursorShape: Qt.PointingHandCursor
                        onClicked: {
                            root.selectedProvider = colRoot.providerId;
                            root.selectedWindow = parent.winName;
                        }
                    }
                }
            }
        }

        // Icon + name
        Item {
            Layout.alignment: Qt.AlignHCenter
            implicitWidth: nameRow.implicitWidth
            implicitHeight: nameRow.implicitHeight

            Row {
                id: nameRow
                spacing: 4

                Image {
                    width: 12
                    height: 12
                    anchors.verticalCenter: parent.verticalCenter
                    source: colRoot.iconSource
                    fillMode: Image.PreserveAspectFit
                }

                Text {
                    text: colRoot.providerName
                    font.pixelSize: 10
                    font.weight: colRoot.selected ? Font.Bold : Font.Medium
                    color: colRoot.selected ? IslandTheme.textPrimary : IslandTheme.textSecondary
                }
            }

            MouseArea {
                anchors.fill: parent
                cursorShape: Qt.PointingHandCursor
                onClicked: root.selectedProvider = colRoot.providerId
            }
        }

        // 5h / 7d pills
        Row {
            Layout.alignment: Qt.AlignHCenter
            spacing: 3

            Repeater {
                model: ["5h", "7d"]
                Rectangle {
                    required property string modelData
                    readonly property bool activePill: colRoot.selected && root.selectedWindow === modelData
                    implicitWidth: pillText.implicitWidth + 12
                    implicitHeight: 16
                    radius: 999
                    color: (activePill || pillMouse.containsMouse) ? IslandTheme.surfaceHover : IslandTheme.surfaceRaised
                    border.width: 1
                    border.color: activePill ? IslandTheme.accentPrimary : IslandTheme.borderSubtle

                    Text {
                        id: pillText
                        anchors.centerIn: parent
                        text: modelData === "7d" ? colRoot.weeklyLabel : "5h"
                        font.pixelSize: 9
                        font.weight: Font.DemiBold
                        color: activePill ? IslandTheme.accentPrimary : (pillMouse.containsMouse ? IslandTheme.textPrimary : IslandTheme.textSecondary)
                    }

                    MouseArea {
                        id: pillMouse
                        anchors.fill: parent
                        hoverEnabled: true
                        cursorShape: Qt.PointingHandCursor
                        onClicked: {
                            root.selectedProvider = colRoot.providerId;
                            root.selectedWindow = modelData;
                        }
                    }
                }
            }
        }
    }

    ColumnLayout {
        anchors.fill: parent
        spacing: 4

        // Top Bar
        RowLayout {
            Layout.fillWidth: true
            Layout.preferredHeight: 14

            Text {
                text: aiQuota.checking ? "AI Quota · checking…" : "AI Quota"
                font.pixelSize: 11
                font.weight: Font.Bold
                color: IslandTheme.textSecondary
            }

            Item { Layout.fillWidth: true }

            Text {
                text: root.selectedConnected && root.selectedHasWindow
                    ? `${root.selectedProviderTitle} · ${root.selectedPercent}% left`
                    : ""
                font.pixelSize: 10
                font.weight: Font.DemiBold
                color: IslandTheme.accentPrimary
            }

            Text {
                text: aiQuota.refreshing ? " …" : " ↻"
                font.pixelSize: 11
                font.weight: Font.Bold
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

        // Raised Equalizer Card
        Rectangle {
            Layout.fillWidth: true
            Layout.preferredHeight: 74
            radius: 9
            color: IslandTheme.surfaceRaised
            border.width: 1
            border.color: IslandTheme.borderSubtle

            RowLayout {
                anchors.fill: parent
                anchors.leftMargin: 8
                anchors.rightMargin: 8
                anchors.topMargin: 5
                anchors.bottomMargin: 5
                spacing: 6

                EqualizerCol {
                    providerId: "antigravity"
                    providerName: "Antigravity"
                    iconSource: "qrc:/linuxisland/ui/icons/antigravity.png"
                    quotaData: aiQuota.antigravity
                }

                EqualizerCol {
                    providerId: "codex"
                    providerName: "Codex"
                    iconSource: "qrc:/linuxisland/ui/icons/codex.png"
                    quotaData: aiQuota.codex
                }

                EqualizerCol {
                    providerId: "claude"
                    providerName: (aiQuota.claude && aiQuota.claude.source === "antigravity-shared") ? "Claude (AGY)" : "Claude"
                    iconSource: "qrc:/linuxisland/ui/icons/claude.png"
                    quotaData: aiQuota.claude
                }
            }
        }

        // Bottom Rolling Window Card
        Rectangle {
            Layout.fillWidth: true
            Layout.preferredHeight: 30
            radius: 8
            color: IslandTheme.surfaceRaised
            border.width: 1
            border.color: IslandTheme.borderSubtle

            ColumnLayout {
                anchors.fill: parent
                anchors.leftMargin: 8
                anchors.rightMargin: 8
                anchors.topMargin: 4
                anchors.bottomMargin: 4
                spacing: 3

                RowLayout {
                    Layout.fillWidth: true
                    spacing: 6

                    Text {
                        text: root.selectedDetailText
                        font.pixelSize: 9
                        color: IslandTheme.textSecondary
                        Layout.fillWidth: true
                        elide: Text.ElideRight
                    }

                    Text {
                        text: (root.selectedConnected && root.selectedHasWindow) ? `${root.selectedPercent}% left` : "--%"
                        font.pixelSize: 10
                        font.weight: Font.Bold
                        color: (root.selectedConnected && root.selectedHasWindow) ? IslandTheme.textPrimary : IslandTheme.textTertiary
                    }
                }

                Rectangle {
                    Layout.fillWidth: true
                    implicitHeight: 4
                    radius: 2
                    color: IslandTheme.progressTrack

                    Rectangle {
                        width: Math.max(0, Math.min(parent.width, parent.width * root.selectedPercent / 100.0))
                        height: parent.height
                        radius: 2
                        color: IslandTheme.progressFill
                    }
                }
            }
        }
    }
}
