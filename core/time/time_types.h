#pragma once

#include <QString>
#include <QList>

struct TimerSnapshot {
    QString state = QStringLiteral("idle");        // idle|running|paused|finished
    QString mode = QStringLiteral("countdown");    // countdown|pomodoro
    QString phase;                                 // "" | focus | break | long-break
    QString label;
    int durationSec = 0;
    int remainingSec = 0;
    int cycle = 0;
    // Expanded timer surface.
    int totalCycles = 4;        // pomodoro: focus phases before a long break
    int completedFocus = 0;     // focus phases finished this session
    int elapsedSec = 0;         // time spent in the current phase
    bool autoAdvance = true;    // pomodoro: roll into the next phase automatically
    qint64 endsAtMs = 0;        // wall-clock deadline (0 when idle/paused)
};

// Aggregate counters for the current Core process. Not persisted: a restart
// resets them, matching the timer's in-memory contract.
struct TimerStats {
    int sessionsStarted = 0;
    int focusCompleted = 0;
    int breaksCompleted = 0;
    int totalFocusSec = 0;
    int longestFocusSec = 0;
};
