import QtQuick
import QtQuick.Layouts

Item {
    id: root
    objectName: "shelfPage"
    readonly property int contentHeight: 116
    implicitHeight: contentHeight

    component ShelfChip: Rectangle {
        property string label: ""
        property bool active: false
        signal clicked()

        height: 18
        implicitWidth: Math.max(26, chipText.implicitWidth + 12)
        radius: 6
        color: active ? IslandTheme.accentPrimary
             : chipMouse.containsMouse ? IslandTheme.surfaceHover : IslandTheme.surfaceRaised
        border.width: 1
        border.color: active ? IslandTheme.accentPrimary : IslandTheme.borderSubtle

        Text {
            id: chipText
            anchors.centerIn: parent
            text: parent.label
            font.pixelSize: 10
            font.bold: true
            color: active ? IslandTheme.surfaceIsland : IslandTheme.textPrimary
        }

        MouseArea {
            id: chipMouse
            anchors.fill: parent
            hoverEnabled: true
            cursorShape: Qt.PointingHandCursor
            onClicked: parent.clicked()
        }
    }

    ColumnLayout {
        anchors.fill: parent
        spacing: 4

        // Row 1: header & toolbar
        RowLayout {
            Layout.fillWidth: true
            Layout.preferredHeight: 20
            spacing: 4

            Text {
                text: "Shelf"
                font.pixelSize: 11
                font.bold: true
                color: IslandTheme.textPrimary
                Layout.alignment: Qt.AlignVCenter
            }

            Text {
                text: `${shelfClient.count}/${shelfClient.maxItems}`
                font.pixelSize: 10
                color: IslandTheme.textSecondary
                Layout.fillWidth: true
                Layout.alignment: Qt.AlignVCenter
            }

            ShelfChip {
                label: "+ Add"
                onClicked: shelfClient.openFileChooser()
            }
            ShelfChip {
                label: "Paste"
                onClicked: shelfClient.pasteFromClipboard()
            }
            ShelfChip {
                visible: shelfClient.count > 0
                label: "Copy"
                onClicked: shelfClient.copyAllToClipboard()
            }
            ShelfChip {
                visible: shelfClient.count > 0
                label: "Drag"
                onClicked: shelfClient.startDragAll()
            }
            ShelfChip {
                visible: shelfClient.count > 0
                label: "Clear"
                onClicked: shelfClient.clearShelf()
            }
        }

        // Empty dropzone state
        Rectangle {
            Layout.fillWidth: true
            Layout.fillHeight: true
            visible: shelfClient.count === 0
            radius: 10
            color: IslandTheme.surfaceRaised
            border.width: 1
            border.color: IslandTheme.borderSubtle

            Text {
                anchors.centerIn: parent
                width: parent.width - 16
                text: shelfClient.shelfServiceAvailable
                    ? "Drop files here or use + Add / Paste"
                    : "Shelf service offline"
                font.pixelSize: 10
                font.bold: true
                color: IslandTheme.textSecondary
                horizontalAlignment: Text.AlignHCenter
                elide: Text.ElideRight
            }
        }

        // File list
        ListView {
            id: shelfList
            Layout.fillWidth: true
            Layout.fillHeight: true
            visible: shelfClient.count > 0
            clip: true
            spacing: 3
            model: shelfClient.items

            delegate: Rectangle {
                required property var modelData
                width: shelfList.width
                height: 26
                radius: 8
                color: rowHover.containsMouse ? IslandTheme.surfaceHover : IslandTheme.surfaceRaised
                border.width: 1
                border.color: IslandTheme.borderSubtle

                RowLayout {
                    anchors.fill: parent
                    anchors.leftMargin: 6
                    anchors.rightMargin: 6
                    spacing: 5

                    // Drag-out handle + name/meta
                    Item {
                        Layout.fillWidth: true
                        Layout.fillHeight: true

                        ColumnLayout {
                            anchors.fill: parent
                            spacing: 0

                            Text {
                                Layout.fillWidth: true
                                text: modelData.name || modelData.path || "File"
                                font.pixelSize: 11
                                font.bold: true
                                color: IslandTheme.textPrimary
                                elide: Text.ElideRight
                            }

                            Text {
                                Layout.fillWidth: true
                                text: modelData.exists === false
                                    ? "Missing"
                                    : (modelData.isDir ? "Folder" : shelfClient.formatSize(modelData.sizeBytes || 0))
                                font.pixelSize: 9
                                color: modelData.exists === false ? IslandTheme.statusDanger : IslandTheme.textSecondary
                                elide: Text.ElideRight
                            }
                        }

                        MouseArea {
                            id: rowHover
                            anchors.fill: parent
                            hoverEnabled: true
                            cursorShape: Qt.OpenHandCursor
                            property point pressPos: Qt.point(0, 0)
                            property bool dragged: false
                            onPressed: (mouse) => {
                                pressPos = Qt.point(mouse.x, mouse.y);
                                dragged = false;
                            }
                            onPositionChanged: (mouse) => {
                                if (!pressed || dragged) return;
                                if (Math.abs(mouse.x - pressPos.x) > 6 || Math.abs(mouse.y - pressPos.y) > 6) {
                                    dragged = true;
                                    shelfClient.startDrag(modelData.uri || "");
                                }
                            }
                            onClicked: {
                                if (!dragged)
                                    shelfClient.openItem(modelData.uri || "");
                            }
                        }
                    }

                    ShelfChip {
                        label: "Open"
                        onClicked: shelfClient.openItem(modelData.uri || "")
                    }
                    ShelfChip {
                        label: "Show"
                        onClicked: shelfClient.revealItem(modelData.uri || "")
                    }
                    ShelfChip {
                        label: "Copy"
                        onClicked: shelfClient.copyItemToClipboard(modelData.uri || "")
                    }
                    ShelfChip {
                        label: "×"
                        onClicked: shelfClient.removeFile(modelData.id || "")
                    }
                }
            }
        }
    }
}
