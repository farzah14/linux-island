import QtQuick
import QtQuick.Controls
import QtQuick.Layouts

Item {
    id: root
    objectName: "todoPage"
    readonly property int contentHeight: 116
    implicitHeight: 116

    Connections {
        target: todoClient
        function onAdded(title) {
            if (input.text === title) input.text = "";
        }
    }

    ColumnLayout {
        anchors.fill: parent
        spacing: 5

        // Input row + circular emerald '+' CTA (matches GNOME todoView.js)
        RowLayout {
            Layout.fillWidth: true
            Layout.preferredHeight: 26
            spacing: 6

            TextField {
                id: input
                Layout.fillWidth: true
                implicitHeight: 26
                placeholderText: "Add a task..."
                font.pixelSize: 11
                color: IslandTheme.textPrimary
                placeholderTextColor: IslandTheme.textTertiary
                leftPadding: 10
                rightPadding: 10
                background: Rectangle {
                    radius: 10
                    color: IslandTheme.surfaceRaised
                    border.width: 1
                    border.color: input.activeFocus ? IslandTheme.borderFocus : IslandTheme.borderSubtle
                }
                onAccepted: { if (text.trim()) { todoClient.add(text); } }
            }

            Rectangle {
                implicitWidth: 26
                implicitHeight: 26
                radius: 999
                color: addMouse.containsMouse ? IslandTheme.accentHover : IslandTheme.accentPrimary

                Text {
                    anchors.centerIn: parent
                    text: "+"
                    font.pixelSize: 14
                    font.bold: true
                    color: IslandTheme.textOnAccent
                }

                MouseArea {
                    id: addMouse
                    anchors.fill: parent
                    hoverEnabled: true
                    cursorShape: Qt.PointingHandCursor
                    onClicked: { if (input.text.trim()) { todoClient.add(input.text); } }
                }
            }
        }

        // Bordered task cards (matches GNOME todoView.js)
        ListView {
            id: todoList
            Layout.fillWidth: true
            Layout.fillHeight: true
            clip: true
            spacing: 4
            model: todoClient.items

            delegate: Rectangle {
                required property var modelData
                width: todoList.width
                height: 26
                radius: 8
                color: rowMouse.containsMouse ? IslandTheme.surfaceHover : IslandTheme.surfaceRaised
                border.width: 1
                border.color: IslandTheme.borderSubtle

                RowLayout {
                    anchors.fill: parent
                    anchors.leftMargin: 8
                    anchors.rightMargin: 8
                    spacing: 8

                    Rectangle {
                        implicitWidth: 16
                        implicitHeight: 16
                        radius: 999
                        color: modelData.done ? IslandTheme.accentPrimary : "transparent"
                        border.width: modelData.done ? 0 : 1.5
                        border.color: IslandTheme.borderSubtle

                        Text {
                            anchors.centerIn: parent
                            visible: modelData.done
                            text: "✓"
                            font.pixelSize: 10
                            font.bold: true
                            color: IslandTheme.textOnAccent
                        }

                        MouseArea {
                            anchors.fill: parent
                            cursorShape: Qt.PointingHandCursor
                            onClicked: todoClient.setDone(modelData.id, !modelData.done)
                        }
                    }

                    Text {
                        Layout.fillWidth: true
                        text: modelData.title
                        font.pixelSize: modelData.done ? 10 : 11
                        font.weight: modelData.done ? Font.Normal : Font.DemiBold
                        color: modelData.done ? IslandTheme.textTertiary : IslandTheme.textPrimary
                        elide: Text.ElideRight
                    }

                    Rectangle {
                        implicitWidth: 18
                        implicitHeight: 18
                        radius: 6
                        color: delMouse.containsMouse ? IslandTheme.surfaceHover : IslandTheme.surfaceIsland

                        Text {
                            anchors.centerIn: parent
                            text: "×"
                            font.pixelSize: 10
                            font.weight: Font.DemiBold
                            color: delMouse.containsMouse ? IslandTheme.accentPrimary : IslandTheme.textSecondary
                        }

                        MouseArea {
                            id: delMouse
                            anchors.fill: parent
                            hoverEnabled: true
                            cursorShape: Qt.PointingHandCursor
                            onClicked: todoClient.remove(modelData.id)
                        }
                    }
                }

                MouseArea {
                    id: rowMouse
                    anchors.fill: parent
                    acceptedButtons: Qt.NoButton
                    hoverEnabled: true
                }
            }
        }

        Text {
            visible: todoClient.items.length === 0 || todoClient.status === "To-do service unavailable"
            text: todoClient.status
            font.pixelSize: 10
            color: IslandTheme.textTertiary
        }
    }
}
