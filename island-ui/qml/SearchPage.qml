import QtQuick
import QtQuick.Layouts
import QtQuick.Controls
import QtQuick.Window

Item {
    id: root

    implicitWidth: parent ? parent.width : 340
    implicitHeight: 200
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

        Layout.fillWidth: true
        implicitHeight: 22
        radius: 6
        color: chip.activeEngine === chip.engineId ? IslandTheme.accentPrimary : IslandTheme.surfaceRaised

        Text {
            anchors.centerIn: parent
            text: chip.engineLabel
            font.pixelSize: 9
            font.bold: true
            color: chip.activeEngine === chip.engineId ? IslandTheme.surfaceIsland : IslandTheme.textSecondary
        }

        MouseArea {
            anchors.fill: parent
            cursorShape: Qt.PointingHandCursor
            onClicked: islandClient.updateSettings({"searchEngine": chip.engineId})
        }
    }

    ColumnLayout {
        anchors.fill: parent
        anchors.margins: 10
        spacing: 8

        RowLayout {
            Layout.fillWidth: true
            spacing: 4

            EngineChip { engineId: "google"; engineLabel: "Google"; activeEngine: root.effectiveSearchEngine }
            EngineChip { engineId: "brave"; engineLabel: "Brave"; activeEngine: root.effectiveSearchEngine }
        }

        TextField {
            id: searchField
            Layout.fillWidth: true
            implicitHeight: 34
            leftPadding: 28
            rightPadding: 10
            placeholderText: "Search the web…"
            placeholderTextColor: IslandTheme.textTertiary
            color: IslandTheme.textPrimary
            font.pixelSize: 12
            selectByMouse: true
            onAccepted: root.submit()
            Keys.onEscapePressed: islandClient.dispatchEvent("DISMISS")
            // In standalone/overlay mode the frameless window is not always
            // the active window; clicking into the field must raise it or
            // keystrokes never reach the TextField.
            onActiveFocusChanged: {
                if (activeFocus && Window.window) {
                    Window.window.requestActivate();
                }
            }

            background: Rectangle {
                radius: 8
                color: IslandTheme.surfaceRaised
                border.width: 1
                border.color: searchField.activeFocus ? IslandTheme.accentPrimary : IslandTheme.borderSubtle

                Text {
                    anchors.left: parent.left
                    anchors.leftMargin: 10
                    anchors.verticalCenter: parent.verticalCenter
                    text: "🔍"
                    font.pixelSize: 11
                    color: searchField.activeFocus ? IslandTheme.accentPrimary : IslandTheme.textTertiary
                }
            }
        }

        RowLayout {
            Layout.fillWidth: true
            spacing: 6

            Text {
                text: "Enter to search · Esc to close"
                font.pixelSize: 9
                color: IslandTheme.textTertiary
                Layout.fillWidth: true
            }

            Rectangle {
                implicitWidth: 64
                implicitHeight: 26
                radius: 8
                color: IslandTheme.accentPrimary
                opacity: searchField.text.trim().length > 0 ? 1 : 0.45

                Text {
                    anchors.centerIn: parent
                    text: "Search"
                    color: IslandTheme.surfaceIsland
                    font.pixelSize: 11
                    font.bold: true
                }

                MouseArea {
                    anchors.fill: parent
                    enabled: searchField.text.trim().length > 0
                    cursorShape: Qt.PointingHandCursor
                    onClicked: root.submit()
                }
            }
        }

        Item { Layout.fillHeight: true }
    }
}
