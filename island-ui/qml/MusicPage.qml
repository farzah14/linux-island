import QtQuick
import QtQuick.Layouts
import QtQuick.Controls

Item {
    id: root

    implicitWidth: parent ? parent.width : 340
    implicitHeight: 130

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
        anchors.margins: 6
        spacing: 8

        // Row 1: Album Artwork + Track Information (Title + BeatBars, Artist + Player Pill)
        RowLayout {
            Layout.fillWidth: true
            spacing: 12

            // Album Artwork (48x48, radius 12)
            Rectangle {
                id: artContainer
                implicitWidth: 48
                implicitHeight: 48
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

                Text {
                    anchors.centerIn: parent
                    text: "🎵"
                    font.pixelSize: 20
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
                        text: islandClient.title ? islandClient.title : "No Media Playing"
                        font.pixelSize: 13
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
                        text: islandClient.artist ? islandClient.artist : "Desktop Audio"
                        font.pixelSize: 12
                        color: IslandTheme.textSecondary
                        elide: Text.ElideRight
                    }

                    Rectangle {
                        implicitHeight: 18
                        implicitWidth: playerRow.implicitWidth + 10
                        radius: 6
                        color: playerMouse.containsMouse ? IslandTheme.surfaceHover : IslandTheme.surfaceRaised
                        border.color: IslandTheme.borderSubtle
                        visible: islandClient.availablePlayers.length > 0

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
            implicitHeight: 10

            Rectangle {
                id: seekBg
                anchors.verticalCenter: parent.verticalCenter
                width: parent.width
                height: 4
                radius: 2
                color: IslandTheme.surfaceRaised
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
                visible: seekMouse.containsMouse || seekMouse.pressed
            }

            MouseArea {
                id: seekMouse
                anchors.fill: parent
                hoverEnabled: true
                cursorShape: Qt.PointingHandCursor
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
                spacing: 12
                Layout.alignment: Qt.AlignHCenter

                // Prev
                Rectangle {
                    implicitWidth: 32
                    implicitHeight: 32
                    radius: 12
                    color: prevMouse.containsMouse ? IslandTheme.surfaceHover : IslandTheme.surfaceRaised
                    opacity: islandClient.canPrevious ? 1.0 : 0.4

                    Text {
                        anchors.centerIn: parent
                        text: "⏮"
                        font.pixelSize: 13
                        color: IslandTheme.textPrimary
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
                    implicitWidth: 40
                    implicitHeight: 32
                    radius: 14
                    color: playMouse.containsMouse ? IslandTheme.accentHover : IslandTheme.accentPrimary
                    opacity: islandClient.canPlay || islandClient.canPause ? 1.0 : 0.4

                    Text {
                        anchors.centerIn: parent
                        text: islandClient.isPlaying ? "⏸" : "▶"
                        font.pixelSize: 15
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
                    implicitWidth: 32
                    implicitHeight: 32
                    radius: 12
                    color: nextMouse.containsMouse ? IslandTheme.surfaceHover : IslandTheme.surfaceRaised
                    opacity: islandClient.canNext ? 1.0 : 0.4

                    Text {
                        anchors.centerIn: parent
                        text: "⏭"
                        font.pixelSize: 13
                        color: IslandTheme.textPrimary
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
    }
}
