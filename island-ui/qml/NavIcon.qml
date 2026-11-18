import QtQuick
import QtQuick.Window

Item {
    id: root
    property url source
    property color color: "#ffffff"
    property int size: 14

    implicitWidth: size
    implicitHeight: size

    readonly property string iconName: {
        const s = root.source ? root.source.toString() : "";
        const idx = s.lastIndexOf("/");
        return idx >= 0 ? s.substring(idx + 1) : s;
    }

    readonly property real dpr: Screen.devicePixelRatio > 0 ? Screen.devicePixelRatio : 1.0

    Image {
        anchors.fill: parent
        visible: root.iconName.length > 0
        source: root.iconName.length > 0
            ? ("image://tinted/" + root.iconName + "?color=" + encodeURIComponent(root.color.toString()))
            : ""
        sourceSize.width: Math.max(1, Math.round(root.size * root.dpr))
        sourceSize.height: Math.max(1, Math.round(root.size * root.dpr))
        fillMode: Image.PreserveAspectFit
        smooth: true
    }
}
