import QtQuick
import QtQuick.Layouts
import QtQuick.Controls

Item {
    id: root

    implicitWidth: parent ? parent.width : 328
    objectName: "mediaPage"
    property string capsuleSize: "medium"
    readonly property int artworkSize: capsuleSize === "large" ? 56 : (capsuleSize === "small" || capsuleSize === "circle" ? 40 : 48)
    readonly property int buttonSize: capsuleSize === "large" ? 36 : (artworkSize === 40 ? 28 : 32)
    readonly property int playWidth: buttonSize + 8
    readonly property int controlIconSize: (buttonSize - 4) / 2
    readonly property int titleSize: artworkSize === 56 ? 14 : (artworkSize === 40 ? 12 : 13)
    readonly property int artistSize: titleSize - 1
    implicitHeight: artworkSize + 6 + buttonSize + 28 + 4 * 3
    property double lastUnmutedVolume: 1.0
    function formatPlayerName(id) {
        if (!id) return "Player";
        var prefix = "org.mpris.MediaPlayer2.";
        if (id.startsWith(prefix)) {
            var raw = id.substring(prefix.length).split('.')[0];
            return raw.charAt(0).toUpperCase() + raw.slice(1);
        }
        return id;
    }

    ColumnLayout {
        anchors.fill: parent
        anchors.margins: 0
        spacing: 4

        // Row 1: Album Artwork + Track Information (Title + BeatBars, Artist + Player Pill)
        RowLayout {
            Layout.fillWidth: true
            spacing: 10

            // Album Artwork (48x48, radius 12)
            Rectangle {
                id: artContainer
                implicitWidth: root.artworkSize
                implicitHeight: root.artworkSize
                radius: 12
                color: IslandTheme.surfaceRaised
                border.color: IslandTheme.borderSubtle
                clip: true

                Image {
                    id: albumArtImage
                    anchors.fill: parent
                    source: islandClient.albumArtUri ? islandClient.albumArtUri : ""
                    fillMode: Image.PreserveAspectCrop
                    visible: status === Image.Ready
                }

                NavIcon {
                    anchors.centerIn: parent
                    size: root.artworkSize
                    source: "qrc:/linuxisland/ui/icons/ui/media-symbolic.svg"
                    color: IslandTheme.textSecondary
                    visible: !islandClient.albumArtUri || albumArtImage.status !== Image.Ready
                }
            }

            // Track Information Column
            ColumnLayout {
                Layout.fillWidth: true
                spacing: 2

                // Title + BeatBars
                RowLayout {
                    Layout.fillWidth: true
                    spacing: 8

                    Text {
                        Layout.fillWidth: true
                        text: !islandClient.connected ? "Core offline" : (islandClient.title ? islandClient.title : "No Media Playing")
                        font.pixelSize: root.titleSize
                        font.bold: true
                        color: IslandTheme.textPrimary
                        elide: Text.ElideRight
                    }

                    BeatBars {
                        isPlaying: islandClient.isPlaying
                        audioLevels: islandClient.audioLevels
                        barColor: IslandTheme.accentPrimary
                    }
                }

                // Artist + Player Switcher Pill
                RowLayout {
                    Layout.fillWidth: true
                    spacing: 6

                    Text {
                        Layout.fillWidth: true
                        text: islandClient.artist ? islandClient.artist : ""
                        font.pixelSize: root.artistSize
                        color: IslandTheme.textSecondary
                        elide: Text.ElideRight
                    }

                    Rectangle {
                        implicitHeight: 18
                        implicitWidth: playerRow.implicitWidth + 10
                        radius: 6
                        color: playerMouse.containsMouse ? IslandTheme.surfaceHover : IslandTheme.surfaceRaised
                        border.color: IslandTheme.borderSubtle
                        visible: islandClient.availablePlayers.length > 1

                        RowLayout {
                            id: playerRow
                            anchors.centerIn: parent
                            spacing: 3

                            Text {
                                text: root.formatPlayerName(islandClient.playerId) + (islandClient.availablePlayers.length > 1 ? " ▾" : "")
                                font.pixelSize: 10
                                font.bold: true
                                color: IslandTheme.textPrimary
                            }
                        }

                        MouseArea {
                            id: playerMouse
                            anchors.fill: parent
                            hoverEnabled: true
                            cursorShape: Qt.PointingHandCursor
                            onClicked: islandClient.cycleActivePlayer()
                        }
                    }
                }
            }
        }

        // Row 2: Progress Track (Seek Bar)
        Item {
            Layout.fillWidth: true
            implicitHeight: 6

            Rectangle {
                id: seekBg
                anchors.verticalCenter: parent.verticalCenter
                width: parent.width
                height: 4
                radius: 2
                color: IslandTheme.progressTrack
            }

            Rectangle {
                anchors.verticalCenter: parent.verticalCenter
                x: seekBg.x
                width: Math.max(0, Math.min(seekBg.width, seekBg.width * (seekMouse.pressed ? seekMouse.dragFraction : islandClient.progress)))
                height: 4
                radius: 2
                color: IslandTheme.accentPrimary
            }

            // Thumb handle
            Rectangle {
                anchors.verticalCenter: parent.verticalCenter
                x: Math.max(0, Math.min(seekBg.width - 8, (seekBg.width * (seekMouse.pressed ? seekMouse.dragFraction : islandClient.progress)) - 4))
                width: 8
                height: 8
                radius: 4
                color: seekMouse.containsMouse || seekMouse.pressed ? IslandTheme.accentHover : IslandTheme.textPrimary
                visible: (seekMouse.containsMouse || seekMouse.pressed) && islandClient.canSeek && islandClient.durationUs > 0
            }

            MouseArea {
                id: seekMouse
                enabled: islandClient.canSeek && islandClient.durationUs > 0
                hoverEnabled: enabled
                cursorShape: enabled ? Qt.PointingHandCursor : Qt.ArrowCursor
                property real dragFraction: 0.0

                function updatePos(mouseX) {
                    dragFraction = Math.max(0.0, Math.min(1.0, mouseX / width));
                }

                onPressed: (mouse) => updatePos(mouse.x)
                onPositionChanged: (mouse) => {
                    if (pressed) updatePos(mouse.x);
                }
                onReleased: (mouse) => {
                    updatePos(mouse.x);
                    islandClient.seekToFraction(dragFraction);
                }
            }
        }

        // Row 3: Playback Controls + Duration labels row: [ 0:05 ]  <spacer>  [ ⏮ ] [ ▶ ] [ ⏭ ]  <spacer>  [ 3:58 ]
        RowLayout {
            Layout.fillWidth: true
            spacing: 4

            Text {
                text: islandClient.timeElapsedText
                font.pixelSize: 10
                color: IslandTheme.textTertiary
                Layout.preferredWidth: 36
            }

            Item { Layout.fillWidth: true }

            RowLayout {
                spacing: 4
                Layout.alignment: Qt.AlignHCenter

                // Prev
                Rectangle {
                    implicitWidth: root.buttonSize
                    implicitHeight: root.buttonSize
                    radius: 12
                    color: prevMouse.containsMouse ? IslandTheme.surfaceHover : IslandTheme.surfaceRaised
                    opacity: islandClient.canPrevious ? 1.0 : 0.4

                    NavIcon {
                        anchors.centerIn: parent
                        size: root.controlIconSize
                        source: "qrc:/linuxisland/ui/icons/ui/prev-symbolic.svg"
                        color: islandClient.canPrevious ? IslandTheme.textPrimary : IslandTheme.textTertiary
                    }

                    MouseArea {
                        id: prevMouse
                        anchors.fill: parent
                        hoverEnabled: true
                        cursorShape: islandClient.canPrevious ? Qt.PointingHandCursor : Qt.ArrowCursor
                        onClicked: if (islandClient.canPrevious) islandClient.previous()
                    }
                }

                // Play / Pause (Accent Amber Button)
                Rectangle {
                    implicitWidth: root.playWidth
                    implicitHeight: root.buttonSize
                    radius: 14
                    color: playMouse.containsMouse ? IslandTheme.accentHover : IslandTheme.accentPrimary
                    opacity: islandClient.canPlay || islandClient.canPause ? 1.0 : 0.4

                    NavIcon {
                        anchors.centerIn: parent
                        size: 16
                        source: islandClient.isPlaying ? "qrc:/linuxisland/ui/icons/ui/pause-symbolic.svg" : "qrc:/linuxisland/ui/icons/ui/play-symbolic.svg"
                        color: IslandTheme.surfaceIsland
                    }

                    MouseArea {
                        id: playMouse
                        anchors.fill: parent
                        hoverEnabled: true
                        cursorShape: islandClient.canPlay || islandClient.canPause ? Qt.PointingHandCursor : Qt.ArrowCursor
                        onClicked: islandClient.playPause()
                    }
                }

                // Next
                Rectangle {
                    implicitWidth: root.buttonSize
                    implicitHeight: root.buttonSize
                    radius: 12
                    color: nextMouse.containsMouse ? IslandTheme.surfaceHover : IslandTheme.surfaceRaised
                    opacity: islandClient.canNext ? 1.0 : 0.4

                    NavIcon {
                        anchors.centerIn: parent
                        size: root.controlIconSize
                        source: "qrc:/linuxisland/ui/icons/ui/next-symbolic.svg"
                        color: islandClient.canNext ? IslandTheme.textPrimary : IslandTheme.textTertiary
                    }
                    MouseArea {
                        id: nextMouse
                        anchors.fill: parent
                        hoverEnabled: true
                        cursorShape: islandClient.canNext ? Qt.PointingHandCursor : Qt.ArrowCursor
                        onClicked: if (islandClient.canNext) islandClient.next()
                    }
                }
            }

            Item { Layout.fillWidth: true }

            Text {
                text: islandClient.timeTotalText
                font.pixelSize: 10
                color: IslandTheme.textTertiary
                horizontalAlignment: Text.AlignRight
                Layout.preferredWidth: 36
            }
        }

        // Row 4: Volume Row: Mute Button + Volume Slider
        RowLayout {
            Layout.fillWidth: true
            spacing: 8

            // Mute button (28x28, radius 12 matching GNOME mediaView.js:455)
            Rectangle {
                implicitWidth: 28
                implicitHeight: 28
                radius: 12
                color: muteMouse.containsMouse ? IslandTheme.surfaceHover : IslandTheme.surfaceRaised

                NavIcon {
                    anchors.centerIn: parent
                    size: 14
                    source: islandClient.volume <= 0.0 ? "qrc:/linuxisland/ui/icons/ui/volume-muted-symbolic.svg" : "qrc:/linuxisland/ui/icons/ui/volume-high-symbolic.svg"
                    color: IslandTheme.textPrimary
                }

                MouseArea {
                    id: muteMouse
                    anchors.fill: parent
                    hoverEnabled: true
                    cursorShape: Qt.PointingHandCursor
                    onClicked: {
                        if (islandClient.volume > 0.0) {
                            root.lastUnmutedVolume = islandClient.volume;
                            islandClient.setVolume(0.0);
                        } else {
                            var restore = root.lastUnmutedVolume <= 0.0 ? 1.0 : root.lastUnmutedVolume;
                            islandClient.setVolume(restore);
                        }
                    }
                }
            }

            // Volume track
            Item {
                Layout.fillWidth: true
                implicitHeight: 16

                Rectangle {
                    id: volBg
                    anchors.verticalCenter: parent.verticalCenter
                    width: parent.width
                    height: 4
                    radius: 2
                color: IslandTheme.progressTrack
                }

                Rectangle {
                    anchors.verticalCenter: parent.verticalCenter
                    x: volBg.x
                    width: Math.max(0, Math.min(volBg.width, volBg.width * (volMouse.pressed ? volMouse.volDragFraction : islandClient.volume)))
                    height: 4
                    radius: 2
                    color: IslandTheme.accentPrimary
                }

                // Thumb handle
                Rectangle {
                    anchors.verticalCenter: parent.verticalCenter
                    x: Math.max(0, Math.min(volBg.width - 8, (volBg.width * (volMouse.pressed ? volMouse.volDragFraction : islandClient.volume)) - 4))
                    width: 8
                    height: 8
                    radius: 4
                    color: volMouse.containsMouse || volMouse.pressed ? IslandTheme.accentHover : IslandTheme.textPrimary
                    visible: volMouse.containsMouse || volMouse.pressed
                }

                MouseArea {
                    id: volMouse
                    anchors.fill: parent
                    hoverEnabled: true
                    cursorShape: Qt.PointingHandCursor
                    property real volDragFraction: 1.0

                    function updateFrac(mouseX) {
                        volDragFraction = Math.max(0.0, Math.min(1.0, mouseX / width));
                    }

                    onPressed: (mouse) => updateFrac(mouse.x)
                    onPositionChanged: (mouse) => {
                        if (pressed) updateFrac(mouse.x);
                    }
                    onReleased: (mouse) => {
                        updateFrac(mouse.x);
                        islandClient.setVolume(volDragFraction);
                    }
                }
            }
        }
    }
}
