import QtQuick
import QtQuick.Layouts

Item {
    id: root

    property var audioLevels: [0.0, 0.0, 0.0]
    property bool isPlaying: false
    property color barColor: IslandTheme.accentPrimary

    implicitWidth: 16
    implicitHeight: 14

    RowLayout {
        anchors.fill: parent
        spacing: 2

        Rectangle {
            id: bar0
            Layout.fillHeight: false
            Layout.preferredWidth: 3
            Layout.preferredHeight: Math.max(3, Math.min(14, root.isPlaying ? (root.audioLevels && root.audioLevels.length > 0 && root.audioLevels[0] > 0.02 ? root.audioLevels[0] * 14 : animHeight0) : 3))
            Layout.alignment: Qt.AlignVCenter
            radius: 1.5
            color: root.barColor
            Behavior on Layout.preferredHeight { NumberAnimation { duration: 60 } }
        }

        Rectangle {
            id: bar1
            Layout.fillHeight: false
            Layout.preferredWidth: 3
            Layout.preferredHeight: Math.max(3, Math.min(14, root.isPlaying ? (root.audioLevels && root.audioLevels.length > 1 && root.audioLevels[1] > 0.02 ? root.audioLevels[1] * 14 : animHeight1) : 3))
            Layout.alignment: Qt.AlignVCenter
            radius: 1.5
            color: root.barColor
            Behavior on Layout.preferredHeight { NumberAnimation { duration: 60 } }
        }

        Rectangle {
            id: bar2
            Layout.fillHeight: false
            Layout.preferredWidth: 3
            Layout.preferredHeight: Math.max(3, Math.min(14, root.isPlaying ? (root.audioLevels && root.audioLevels.length > 2 && root.audioLevels[2] > 0.02 ? root.audioLevels[2] * 14 : animHeight2) : 3))
            Layout.alignment: Qt.AlignVCenter
            radius: 1.5
            color: root.barColor
            Behavior on Layout.preferredHeight { NumberAnimation { duration: 60 } }
        }
    }

    property real animHeight0: 4
    property real animHeight1: 8
    property real animHeight2: 6

    SequentialAnimation {
        running: root.isPlaying && (!root.audioLevels || root.audioLevels[0] <= 0.02)
        loops: Animation.Infinite

        ParallelAnimation {
            NumberAnimation { target: root; property: "animHeight0"; to: 12; duration: 250; easing.type: Easing.InOutQuad }
            NumberAnimation { target: root; property: "animHeight1"; to: 5; duration: 250; easing.type: Easing.InOutQuad }
            NumberAnimation { target: root; property: "animHeight2"; to: 11; duration: 250; easing.type: Easing.InOutQuad }
        }
        ParallelAnimation {
            NumberAnimation { target: root; property: "animHeight0"; to: 4; duration: 250; easing.type: Easing.InOutQuad }
            NumberAnimation { target: root; property: "animHeight1"; to: 13; duration: 250; easing.type: Easing.InOutQuad }
            NumberAnimation { target: root; property: "animHeight2"; to: 6; duration: 250; easing.type: Easing.InOutQuad }
        }
    }
}
