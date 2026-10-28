import QtQuick
import QtQuick.Layouts
import QtQuick.Controls

Item {
    id: root

    implicitWidth: parent ? parent.width : 340
    implicitHeight: 200

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
        anchors.margins: 10
        spacing: 8

        // Top Row: Player Switcher Pill + BeatBars
        RowLayout {
            Layout.fillWidth: true
            spacing: 6

            Rectangle {
                implicitHeight: 22
                implicitWidth: playerRow.implicitWidth + 14
                radius: 11
                color: playerMouse.containsMouse ? IslandTheme.surfaceHover : IslandTheme.surfaceRaised
                border.color: IslandTheme.borderSubtle

                RowLayout {
                    id: playerRow
                    anchors.centerIn: parent
                    spacing: 4

                    Text {
                        text: root.formatPlayerName(islandClient.playerId)
                        font.pixelSize: 11
                        font.bold: true
                        color: IslandTheme.textPrimary
                    }

                    Text {
                        text: "▾"
                        font.pixelSize: 10
                        color: IslandTheme.textSecondary
                        visible: islandClient.availablePlayers.length > 1
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

            Item { Layout.fillWidth: true }

            BeatBars {
                isPlaying: islandClient.isPlaying
                audioLevels: islandClient.audioLevels
                barColor: IslandTheme.accentPrimary
            }
        }

        // Middle Row: Album Artwork + Track Information
        RowLayout {
            Layout.fillWidth: true
            spacing: 12

            Rectangle {
                id: artContainer
                implicitWidth: 54
                implicitHeight: 54
                radius: 10
                color: IslandTheme.surfaceRaised
                border.color: IslandTheme.borderSubtle
                clip: true

                Image {
                    anchors.fill: parent
                    source: islandClient.albumArtUri ? islandClient.albumArtUri : ""
                    fillMode: Image.PreserveAspectCrop
                    visible: status === Image.Ready
                }

                Text {
                    anchors.centerIn: parent
                    text: "🎵"
                    font.pixelSize: 24
                    visible: !islandClient.albumArtUri || parent.children[0].status !== Image.Ready
                }
            }

            ColumnLayout {
                Layout.fillWidth: true
                spacing: 2

                Text {
                    Layout.fillWidth: true
                    text: islandClient.title ? islandClient.title : "No Media Playing"
                    font.pixelSize: 14
                    font.bold: true
                    color: IslandTheme.textPrimary
                    elide: Text.ElideRight
                }

                Text {
                    Layout.fillWidth: true
                    text: islandClient.artist ? islandClient.artist : "Desktop Audio"
                    font.pixelSize: 12
                    color: IslandTheme.textSecondary
                    elide: Text.ElideRight
                }
            }
        }

        // Seek Bar & Timers
        ColumnLayout {
            Layout.fillWidth: true
            spacing: 2

            Item {
                Layout.fillWidth: true
                implicitHeight: 14

                // Track background
                Rectangle {
                    id: seekBg
                    anchors.verticalCenter: parent.verticalCenter
                    width: parent.width
                    height: 4
                    radius: 2
                    color: IslandTheme.surfaceRaised
                }

                // Progress filled
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
                    x: Math.max(0, Math.min(seekBg.width - 10, (seekBg.width * (seekMouse.pressed ? seekMouse.dragFraction : islandClient.progress)) - 5))
                    width: 10
                    height: 10
                    radius: 5
                    color: seekMouse.containsMouse || seekMouse.pressed ? IslandTheme.accentHover : IslandTheme.textPrimary
                }

                MouseArea {
                    id: seekMouse
                    anchors.fill: parent
                    hoverEnabled: true
                    cursorShape: Qt.PointingHandCursor
                    property real dragFraction: 0.0

                    function updatePos(mouseX) {
                        var frac = Math.max(0.0, Math.min(1.0, mouseX / width));
                        dragFraction = frac;
                        islandClient.seekToFraction(frac);
                    }

                    onPressed: (mouse) => updatePos(mouse.x)
                    onPositionChanged: (mouse) => {
                        if (pressed) updatePos(mouse.x);
                    }
                }
            }

            RowLayout {
                Layout.fillWidth: true
                Text {
                    text: islandClient.timeElapsedText
                    font.pixelSize: 10
                    color: IslandTheme.textTertiary
                }
                Item { Layout.fillWidth: true }
                Text {
                    text: islandClient.timeTotalText
                    font.pixelSize: 10
                    color: IslandTheme.textTertiary
                }
            }
        }

        // Bottom Controls: Previous, Play/Pause, Next
        RowLayout {
            Layout.alignment: Qt.AlignHCenter
            spacing: 24

            // Previous button
            Rectangle {
                implicitWidth: 32
                implicitHeight: 32
                radius: 16
                color: prevMouse.containsMouse ? IslandTheme.surfaceHover : IslandTheme.surfaceRaised

                Text {
                    anchors.centerIn: parent
                    text: "⏮"
                    font.pixelSize: 14
                    color: islandClient.canPrevious ? IslandTheme.textPrimary : IslandTheme.textTertiary
                }

                MouseArea {
                    id: prevMouse
                    anchors.fill: parent
                    hoverEnabled: true
                    cursorShape: Qt.PointingHandCursor
                    onClicked: islandClient.controlMedia("Previous")
                }
            }

            // Play / Pause button
            Rectangle {
                implicitWidth: 40
                implicitHeight: 40
                radius: 20
                color: playMouse.containsMouse ? IslandTheme.accentHover : IslandTheme.accentPrimary

                Text {
                    anchors.centerIn: parent
                    text: islandClient.isPlaying ? "⏸" : "▶"
                    font.pixelSize: 16
                    color: IslandTheme.surfaceIsland
                }

                MouseArea {
                    id: playMouse
                    anchors.fill: parent
                    hoverEnabled: true
                    cursorShape: Qt.PointingHandCursor
                    onClicked: islandClient.controlMedia("PlayPause")
                }
            }

            // Next button
            Rectangle {
                implicitWidth: 32
                implicitHeight: 32
                radius: 16
                color: nextMouse.containsMouse ? IslandTheme.surfaceHover : IslandTheme.surfaceRaised

                Text {
                    anchors.centerIn: parent
                    text: "⏭"
                    font.pixelSize: 14
                    color: islandClient.canNext ? IslandTheme.textPrimary : IslandTheme.textTertiary
                }

                MouseArea {
                    id: nextMouse
                    anchors.fill: parent
                    hoverEnabled: true
                    cursorShape: Qt.PointingHandCursor
                    onClicked: islandClient.controlMedia("Next")
                }
            }
        }
    }
}
