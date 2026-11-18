import QtQuick
import QtQuick.Controls
import QtQuick.Layouts

// Timer / Pomodoro page matching FigCraft layout & GNOME timeView.js.
Item {
    id: root
    objectName: "timePage"

    implicitWidth: parent ? parent.width : 320
    readonly property int contentHeight: root.idle ? 132 : 84
    implicitHeight: 132

    readonly property bool idle: timeClient.timerState === "idle"
    readonly property bool running: timeClient.timerState === "running"
    readonly property bool paused: timeClient.timerState === "paused"
    readonly property bool finished: timeClient.timerState === "finished"
    readonly property real progress: timeClient.timerDurationSec > 0
        ? Math.max(0, Math.min(1, 1 - timeClient.timerRemainingSec / timeClient.timerDurationSec))
        : 0
    readonly property string phaseText: timeClient.timerPhase === "long-break"
        ? "Long Break"
        : (timeClient.timerPhase === "break" ? "Break"
            : (timeClient.timerPhase === "focus" ? "Focus" : ""))
    readonly property bool showCycle: timeClient.timerMode === "pomodoro" && !idle

    property int customMin: 25
    property bool pomodoroSelected: false

    readonly property var stats: timeClient.timerStats
    readonly property string statsText: {
        const focus = Number(stats.focusCompleted ?? 0);
        if (focus <= 0) return "";
        const minutes = Math.round(Number(stats.totalFocusSec ?? 0) / 60);
        return `${focus} focus · ${minutes} min`;
    }

    component PillChip: Rectangle {
        id: chip
        property string label: ""
        property bool active: false
        property bool primaryCta: false
        signal clicked()

        implicitWidth: chipLabel.implicitWidth + 16
        implicitHeight: primaryCta ? 24 : 20
        radius: 999
        color: primaryCta
            ? (chipMouse.containsMouse ? IslandTheme.accentHover : IslandTheme.accentPrimary)
            : ((active || chipMouse.containsMouse) ? IslandTheme.surfaceHover : IslandTheme.surfaceRaised)
        border.width: primaryCta ? 0 : 1
        border.color: active ? IslandTheme.accentPrimary : IslandTheme.borderSubtle

        Text {
            id: chipLabel
            anchors.centerIn: parent
            text: chip.label
            font.pixelSize: primaryCta ? 11 : 10
            font.weight: (primaryCta || active) ? Font.Bold : Font.Medium
            color: primaryCta
                ? IslandTheme.textOnAccent
                : (active ? IslandTheme.accentPrimary : (chipMouse.containsMouse ? IslandTheme.textPrimary : IslandTheme.textSecondary))
        }

        MouseArea {
            id: chipMouse
            anchors.fill: parent
            hoverEnabled: true
            cursorShape: Qt.PointingHandCursor
            onClicked: chip.clicked()
        }
    }

    ColumnLayout {
        anchors.fill: parent
        spacing: 2

        // Mode switcher pills (idle only, left-aligned matching GNOME timeView.js)
        RowLayout {
            Layout.fillWidth: true
            Layout.preferredHeight: 18
            spacing: 6
            Layout.alignment: Qt.AlignLeft
            visible: root.idle && timeClient.timerServiceAvailable

            PillChip {
                implicitHeight: 18
                label: "Timer"
                active: !root.pomodoroSelected
                onClicked: root.pomodoroSelected = false
            }
            PillChip {
                implicitHeight: 18
                label: "Pomodoro"
                active: root.pomodoroSelected
                onClicked: root.pomodoroSelected = true
            }
        }

        // Hero Row: 22px clock + phase/cycle left, 40x40 ring + centered % right
        RowLayout {
            Layout.fillWidth: true
            Layout.preferredHeight: 40
            spacing: 8
            visible: timeClient.timerServiceAvailable

            ColumnLayout {
                Layout.fillWidth: true
                Layout.alignment: Qt.AlignVCenter
                spacing: 2

                Text {
                    text: root.idle
                        ? (root.pomodoroSelected ? "Ready" : timeClient.formatClock(root.customMin * 60))
                        : timeClient.formatClock(timeClient.timerRemainingSec)
                    font.pixelSize: 22
                    font.weight: Font.Bold
                    color: IslandTheme.textPrimary
                }

                RowLayout {
                    spacing: 6
                    visible: root.phaseText !== "" || root.showCycle || root.idle

                    Text {
                        text: root.idle
                            ? (root.pomodoroSelected ? "Pomodoro session" : "Countdown timer")
                            : root.phaseText
                        font.pixelSize: 10
                        font.weight: Font.Bold
                        color: IslandTheme.textSecondary
                    }

                    Text {
                        text: root.showCycle
                            ? `${Math.min(timeClient.timerCycle, timeClient.timerTotalCycles)}/${timeClient.timerTotalCycles}`
                            : ""
                        visible: root.showCycle
                        font.pixelSize: 10
                        font.weight: Font.Bold
                        color: IslandTheme.accentPrimary
                    }
                }
            }

            Item {
                Layout.preferredWidth: 40
                Layout.preferredHeight: 40
                Layout.alignment: Qt.AlignVCenter

                Canvas {
                    id: ring
                    anchors.fill: parent
                    readonly property real ringProgress: root.progress
                    onRingProgressChanged: requestPaint()
                    onVisibleChanged: requestPaint()
                    Connections { target: IslandTheme; function onIsDarkChanged() { ring.requestPaint(); } }
                    onPaint: {
                        const ctx = getContext("2d");
                        ctx.clearRect(0, 0, width, height);
                        ctx.lineWidth = 3.5;
                        ctx.lineCap = "round";
                        ctx.strokeStyle = IslandTheme.progressTrack;
                        ctx.beginPath();
                        ctx.arc(width / 2, height / 2, 17, 0, 2 * Math.PI);
                        ctx.stroke();
                        if (ringProgress > 0) {
                            ctx.strokeStyle = IslandTheme.progressFill;
                            ctx.beginPath();
                            ctx.arc(width / 2, height / 2, 17, -Math.PI / 2, -Math.PI / 2 + ringProgress * 2 * Math.PI);
                            ctx.stroke();
                        }
                    }
                }

                Text {
                    anchors.centerIn: parent
                    text: Math.round(root.progress * 100) + "%"
                    font.pixelSize: 10
                    font.weight: Font.Bold
                    color: root.progress > 0 ? IslandTheme.accentPrimary : IslandTheme.textSecondary
                }
            }
        }

        // Offline notice
        Text {
            Layout.fillWidth: true
            Layout.preferredHeight: 40
            visible: !timeClient.timerServiceAvailable
            text: "Timer service offline"
            font.pixelSize: 11
            font.bold: true
            color: IslandTheme.textSecondary
            horizontalAlignment: Text.AlignHCenter
            verticalAlignment: Text.AlignVCenter
        }

        // Progress bar
        Rectangle {
            Layout.fillWidth: true
            Layout.preferredHeight: 4
            radius: 2
            color: IslandTheme.progressTrack

            Rectangle {
                height: parent.height
                radius: 2
                color: IslandTheme.progressFill
                width: parent.width * root.progress
            }
        }

        // Idle Presets Row
        RowLayout {
            Layout.fillWidth: true
            Layout.preferredHeight: 20
            spacing: 4
            visible: root.idle && !root.pomodoroSelected && timeClient.timerServiceAvailable

            PillChip {
                Layout.fillWidth: true
                label: "5"
                active: root.customMin === 5
                onClicked: root.customMin = 5
            }
            PillChip {
                Layout.fillWidth: true
                label: "15"
                active: root.customMin === 15
                onClicked: root.customMin = 15
            }
            PillChip {
                Layout.fillWidth: true
                label: "25"
                active: root.customMin === 25
                onClicked: root.customMin = 25
            }
            PillChip {
                Layout.fillWidth: true
                label: "45"
                active: root.customMin === 45
                onClicked: root.customMin = 45
            }
        }

        // Action CTA Row (Idle or Running/Paused/Finished)
        RowLayout {
            Layout.fillWidth: true
            Layout.preferredHeight: 24
            spacing: 4
            visible: timeClient.timerServiceAvailable

            PillChip {
                visible: root.idle && !root.pomodoroSelected
                label: "−5"
                onClicked: root.customMin = Math.max(1, root.customMin - 5)
            }
            Text {
                visible: root.idle && !root.pomodoroSelected
                text: root.customMin + " min"
                font.pixelSize: 10
                font.weight: Font.DemiBold
                color: IslandTheme.textSecondary
                Layout.minimumWidth: 40
                horizontalAlignment: Text.AlignHCenter
            }
            PillChip {
                visible: root.idle && !root.pomodoroSelected
                label: "+5"
                onClicked: root.customMin = Math.min(180, root.customMin + 5)
            }
            PillChip {
                Layout.fillWidth: true
                visible: root.idle
                primaryCta: true
                label: root.pomodoroSelected ? "Start Pomodoro" : "Start Timer"
                onClicked: { if (root.pomodoroSelected) timeClient.startPomodoro(); else timeClient.startTimer(root.customMin); }
            }

            PillChip {
                Layout.fillWidth: true
                visible: root.running
                primaryCta: true
                label: "Pause"
                onClicked: timeClient.pauseTimer()
            }
            PillChip {
                Layout.fillWidth: true
                visible: root.paused
                primaryCta: true
                label: "Resume"
                onClicked: timeClient.resumeTimer()
            }
            PillChip {
                visible: root.running || root.paused
                label: "Stop"
                onClicked: timeClient.stopTimer()
            }
            PillChip {
                visible: root.running && timeClient.timerMode === "pomodoro"
                label: "Skip"
                onClicked: timeClient.skipPhase()
            }
            PillChip {
                Layout.fillWidth: true
                visible: root.finished && timeClient.timerMode === "pomodoro"
                primaryCta: true
                label: "Next"
                onClicked: timeClient.nextPhase()
            }
            PillChip {
                visible: root.finished
                label: "Dismiss"
                onClicked: timeClient.stopTimer()
            }
        }

        // Session statistics (idle only)
        Text {
            Layout.fillWidth: true
            Layout.preferredHeight: 14
            visible: root.idle && root.statsText !== ""
            text: root.statsText
            font.pixelSize: 9
            font.weight: Font.Bold
            color: IslandTheme.textTertiary
            horizontalAlignment: Text.AlignHCenter
            verticalAlignment: Text.AlignVCenter
        }
    }
}
