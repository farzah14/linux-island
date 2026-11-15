import QtQuick
import QtQuick.Controls
import QtQuick.Layouts

Item {
    id: root
    objectName: "todoPage"
    readonly property int contentHeight: 116
    implicitHeight: 116
    Connections { target: todoClient; function onAdded(title) { if (input.text === title) input.text = ""; } }
    ColumnLayout {
        anchors.fill: parent
        spacing: 4
        RowLayout {
            Layout.fillWidth: true
            TextField {
                id: input
                Layout.fillWidth: true
                implicitHeight: 24
                placeholderText: "New task"
                onAccepted: { if (text.trim()) { todoClient.add(text); } }
            }
            Button { implicitHeight: 24; text: "Add"; onClicked: { if (input.text.trim()) { todoClient.add(input.text); } } }
        }
        Text { text: todoClient.status; color: IslandTheme.textSecondary; font.pixelSize: 10 }
        ListView {
            Layout.fillWidth: true
            Layout.fillHeight: true
            clip: true
            model: todoClient.items.filter(task => !task.done)
            delegate: RowLayout {
                required property var modelData
                width: ListView.view.width
                CheckBox { implicitWidth: 24; implicitHeight: 24; checked: modelData.done; onClicked: todoClient.setDone(modelData.id, checked) }
                Text { text: modelData.title; color: IslandTheme.textPrimary; elide: Text.ElideRight; Layout.fillWidth: true }
                Button { implicitWidth: 24; implicitHeight: 24; text: "×"; Accessible.name: "Delete task"; onClicked: todoClient.remove(modelData.id) }
            }
        }
    }
}
