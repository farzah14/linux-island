import QtQuick
import QtQuick.Controls
import QtQuick.Layouts

// Timer / Pomodoro page. Mirrors extension/ui/timeView.js.
// The Core daemon owns the countdown, so this page is a pure view.
Item {
    id: root
    objectName: "timePage"

    implicitWidth: parent ? parent.width : 320

    // Row budget: clock 26 (a 20px bold label needs its full line box),
    // progress 4, controls 18, custom 18, modes 18, stats 16, plus 4px
    // spacing between six children.
    readonly property int contentHeight: root.idle ? 116 : 56
    implicitHeight: 116

    readonly property bool idle: timeClient.timerState === "idle"
    readonly property bool running: timeClient.timerState === "running"
    readonly property bool paused: timeClient.timerState === "paused"
    readonly property bool finished: timeClient.timerState === "finished"
    readonly property string phaseText: timeClient.timerPhase === "long-break"
        ? "Long break"
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

    component Chip: Rectangle {
        id: chip
        property string label: ""
        property bool active: false
        signal clicked()

        implicitWidth: chipLabel.implicitWidth + 16
        implicitHeight: 18
        radius: 6
        color: chipMouse.containsMouse || active ? IslandTheme.surfaceHover : IslandTheme.surfaceRaised
        border.width: 1
        border.color: chip.active ? IslandTheme.accentPrimary : "transparent"

        Text {
            id: chipLabel
            anchors.centerIn: parent
            text: chip.label
            font.pixelSize: 10
            font.bold: true
            color: chip.active ? IslandTheme.accentPrimary : (chipMouse.containsMouse ? IslandTheme.textPrimary : IslandTheme.textSecondary)
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
        spacing: 4

        // Row 5: mode chips, idle only.
        RowLayout {
            Layout.fillWidth: true
            Layout.preferredHeight: 18
            spacing: 4
            Layout.alignment: Qt.AlignHCenter
            visible: root.idle && timeClient.timerServiceAvailable

            Chip {
                label: "Timer"
                active: !root.pomodoroSelected
                onClicked: root.pomodoroSelected = false
            }
            Chip {
                label: "Pomodoro"
                active: root.pomodoroSelected
                onClicked: root.pomodoroSelected = true
            }
        }

        // Row 1: clock, phase, cycle position.
        RowLayout {
            Layout.fillWidth: true
            Layout.preferredHeight: 26
            spacing: 6
            visible: timeClient.timerServiceAvailable
            Layout.alignment: Qt.AlignHCenter

            Text {
                text: root.idle ? (root.pomodoroSelected ? "Ready" : timeClient.formatClock(root.customMin * 60)) : timeClient.formatClock(timeClient.timerRemainingSec)
                font.pixelSize: 20
                font.bold: true
                color: IslandTheme.textPrimary
                Layout.alignment: Qt.AlignVCenter
            }

            Text {
                text: root.phaseText
                visible: text !== ""
                font.pixelSize: 10
                font.bold: true
                color: IslandTheme.textSecondary
                Layout.alignment: Qt.AlignVCenter
            }

            Text {
                text: root.showCycle
                    ? `${Math.min(timeClient.timerCycle, timeClient.timerTotalCycles)}/${timeClient.timerTotalCycles}`
                    : ""
                visible: root.showCycle
                font.pixelSize: 10
                font.bold: true
                color: IslandTheme.accentPrimary
                Layout.alignment: Qt.AlignVCenter
            }
        }

        // Offline notice replaces the clock when the timer service is missing.
        Text {
            Layout.fillWidth: true
            Layout.preferredHeight: 26
            visible: !timeClient.timerServiceAvailable
            text: "Timer service offline"
            font.pixelSize: 11
            font.bold: true
            color: IslandTheme.textSecondary
            horizontalAlignment: Text.AlignHCenter
            verticalAlignment: Text.AlignVCenter
        }

        // Row 2: progress.
        Rectangle {
            Layout.fillWidth: true
            Layout.preferredHeight: 4
            radius: 2
            color: IslandTheme.progressTrack

            Rectangle {
                height: parent.height
                radius: 2
                color: IslandTheme.progressFill
                // Idle has no duration; guard so it does not paint a full bar.
                width: timeClient.timerDurationSec > 0
                    ? parent.width * Math.max(0, Math.min(1,
                        1 - timeClient.timerRemainingSec / timeClient.timerDurationSec))
                    : 0
            }
        }

        // Row 3: state-dependent controls.
        RowLayout {
            Layout.fillWidth: true
            Layout.preferredHeight: 18
            spacing: 4
            Layout.alignment: Qt.AlignHCenter
            visible: timeClient.timerServiceAvailable

            Chip {
                visible: root.idle && !root.pomodoroSelected
                label: "5"
                active: root.customMin === 5
                onClicked: root.customMin = 5
            }
            Chip {
                visible: root.idle && !root.pomodoroSelected
                label: "15"
                active: root.customMin === 15
                onClicked: root.customMin = 15
            }
            Chip {
                visible: root.idle && !root.pomodoroSelected
                label: "25"
                active: root.customMin === 25
                onClicked: root.customMin = 25
            }
            Chip {
                visible: root.idle && !root.pomodoroSelected
                label: "45"
                active: root.customMin === 45
                onClicked: root.customMin = 45
            }

            Chip {
                visible: root.running
                label: "Pause"
                active: true
                onClicked: timeClient.pauseTimer()
            }
            Chip {
                visible: root.paused
                label: "Resume"
                active: true
                onClicked: timeClient.resumeTimer()
            }
            Chip {
                visible: root.running || root.paused
                label: "Stop"
                onClicked: timeClient.stopTimer()
            }
            Chip {
                visible: root.running && timeClient.timerMode === "pomodoro"
                label: "Skip"
                onClicked: timeClient.skipPhase()
            }
            // Pomodoro with auto-advance off holds at zero: offer the next phase.
            Chip {
                visible: root.finished && timeClient.timerMode === "pomodoro"
                label: "Next"
                active: true
                onClicked: timeClient.nextPhase()
            }
            Chip {
                visible: root.finished
                label: "Dismiss"
                onClicked: timeClient.stopTimer()
            }
        }

        // Row 4: custom countdown duration, idle only.
        RowLayout {
            Layout.fillWidth: true
            Layout.preferredHeight: 18
            spacing: 4
            Layout.alignment: Qt.AlignHCenter
            visible: root.idle && timeClient.timerServiceAvailable

            Chip {
                visible: !root.pomodoroSelected
                label: "−5"
                onClicked: root.customMin = Math.max(1, root.customMin - 5)
            }
            Text {
                visible: !root.pomodoroSelected
                text: root.customMin + " min"
                font.pixelSize: 10
                font.bold: true
                color: IslandTheme.textSecondary
                Layout.alignment: Qt.AlignVCenter
                horizontalAlignment: Text.AlignHCenter
                Layout.preferredWidth: 44
            }
            Chip {
                visible: !root.pomodoroSelected
                label: "+5"
                onClicked: root.customMin = Math.min(180, root.customMin + 5)
            }
            Chip {
                label: root.pomodoroSelected ? "Start Pomodoro" : "Start Timer"
                active: true
                onClicked: { if (root.pomodoroSelected) timeClient.startPomodoro(); else timeClient.startTimer(root.customMin); }
            }
        }

        // Row 6: session statistics, idle only.
        Text {
            Layout.fillWidth: true
            Layout.preferredHeight: 16
            visible: root.idle && root.statsText !== ""
            text: root.statsText
            font.pixelSize: 9
            font.bold: true
            color: IslandTheme.textTertiary
            horizontalAlignment: Text.AlignHCenter
            verticalAlignment: Text.AlignVCenter
        }
    }
}
