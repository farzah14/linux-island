import QtQuick
import QtQuick.Layouts
import QtQuick.Controls
import QtQuick.Window

Item {
    id: root

    implicitWidth: parent ? parent.width : 320
    implicitHeight: 110
    readonly property string effectiveSearchEngine: islandClient.searchEngine === "brave" ? "brave" : "google"

    function forceFocus() {
        searchField.forceActiveFocus();
    }

    function submit() {
        var q = searchField.text.trim();
        if (q.length === 0 || q.length > 500)
            return;
        if (searchProvider.openEmbedded(root.effectiveSearchEngine, q)) {
            searchField.text = "";
            islandClient.dispatchEvent("DISMISS");
        }
    }

    component EngineChip: Rectangle {
        id: chip
        property string engineId: ""
        property string engineLabel: ""
        property string activeEngine: ""

        readonly property bool isActive: chip.activeEngine === chip.engineId

        implicitWidth: 64
        implicitHeight: 22
        radius: 8
        color: chip.isActive
            ? IslandTheme.surfaceHover
            : (chipMouse.containsMouse ? IslandTheme.surfaceHover : IslandTheme.surfaceRaised)
        border.width: 1
        border.color: chip.isActive ? IslandTheme.accentPrimary : IslandTheme.borderSubtle

        Text {
            anchors.centerIn: parent
            text: chip.engineLabel
            font.pixelSize: 10
            font.bold: true
            color: chip.isActive ? IslandTheme.accentPrimary : IslandTheme.textSecondary
        }

        MouseArea {
            id: chipMouse
            anchors.fill: parent
            hoverEnabled: true
            cursorShape: Qt.PointingHandCursor
            onClicked: {
                islandClient.updateSettings({"searchEngine": chip.engineId});
                searchField.forceActiveFocus();
            }
        }
    }

    ColumnLayout {
        anchors.fill: parent
        anchors.margins: 6
        spacing: 6

        // Row 1: Engine Selection Chips
        RowLayout {
            Layout.alignment: Qt.AlignHCenter
            spacing: 6

            EngineChip {
                engineId: "google"
                engineLabel: "Google"
                activeEngine: root.effectiveSearchEngine
            }
            EngineChip {
                engineId: "brave"
                engineLabel: "Brave"
                activeEngine: root.effectiveSearchEngine
            }
        }

        // Row 2: Search Input Field + Submit Action
        RowLayout {
            Layout.fillWidth: true
            spacing: 6

            TextField {
                id: searchField
                Layout.fillWidth: true
                implicitHeight: 32
                leftPadding: 26
                rightPadding: 10
                placeholderText: "Search the web…"
                placeholderTextColor: IslandTheme.textTertiary
                color: IslandTheme.textPrimary
                font.pixelSize: 12
                selectByMouse: true
                onAccepted: root.submit()
                Keys.onEscapePressed: islandClient.dispatchEvent("DISMISS")

                onActiveFocusChanged: {
                    if (activeFocus && Window.window) {
                        Window.window.requestActivate();
                    }
                }

                background: Rectangle {
                    radius: 8
                    color: IslandTheme.surfaceRaised
                    border.width: 1
                    border.color: searchField.activeFocus ? IslandTheme.borderFocus : IslandTheme.borderSubtle

                    NavIcon {
                        anchors.left: parent.left
                        anchors.leftMargin: 8
                        anchors.verticalCenter: parent.verticalCenter
                        size: 13
                        source: "qrc:/linuxisland/ui/icons/ui/search-symbolic.svg"
                        color: searchField.activeFocus ? IslandTheme.accentPrimary : IslandTheme.textTertiary
                    }
                }
            }

            Rectangle {
                implicitWidth: 64
                implicitHeight: 32
                radius: 8
                color: searchActionMouse.containsMouse ? IslandTheme.accentHover : IslandTheme.accentPrimary
                opacity: searchField.text.trim().length > 0 ? 1.0 : 0.45

                Text {
                    anchors.centerIn: parent
                    text: "Search"
                    color: IslandTheme.surfaceIsland
                    font.pixelSize: 11
                    font.bold: true
                }

                MouseArea {
                    id: searchActionMouse
                    anchors.fill: parent
                    hoverEnabled: true
                    enabled: searchField.text.trim().length > 0
                    cursorShape: enabled ? Qt.PointingHandCursor : Qt.ArrowCursor
                    onClicked: root.submit()
                }
            }
        }

        // Row 3: Hint
        RowLayout {
            Layout.fillWidth: true

            Text {
                text: "Enter to search · Esc to close"
                font.pixelSize: 10
                color: IslandTheme.textTertiary
                Layout.alignment: Qt.AlignHCenter
                horizontalAlignment: Text.AlignHCenter
            }
        }
    }
}
