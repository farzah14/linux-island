#pragma once

#include <QObject>
#include <QString>
#include <QTimer>
#include <functional>
#include "time_types.h"

// In-memory countdown / pomodoro engine owned by the Core daemon. It is never
// persisted: a Core restart starts at idle with zeroed statistics.
//
// Beyond the basic countdown the engine supports:
//   * a configurable focus length, short break, long break and cycle length;
//   * optional auto-advance between pomodoro phases;
//   * per-session and per-process statistics for the UI.
class TimerService : public QObject {
    Q_OBJECT
public:
    using Clock = std::function<qint64()>;   // epoch milliseconds
    explicit TimerService(QObject *parent = nullptr);

    enum class State { Idle, Running, Paused, Finished };
    enum class Mode { Countdown, Pomodoro };

    State state() const;
    Mode mode() const;
    QString phase() const;
    QString label() const;
    int durationSec() const;
    int remainingSec() const;
    int cycle() const;
    int totalCycles() const;
    int completedFocus() const;
    int elapsedSec() const;
    bool autoAdvance() const;
    qint64 endsAtMs() const;
    TimerStats stats() const;
    TimerSnapshot snapshot() const;

    // Pomodoro shape. Clamped to sane bounds; applied at the next start().
    void setCycleConfig(int focusMin, int breakMin, int longBreakMin, int totalCycles);
    void setAutoAdvance(bool enabled);
    void resetStats();

    void setClock(Clock clock);                            // tests only
    bool start(Mode mode, int focusMin, int breakMin,
               const QString &label, QString *error);      // always resets
    // Extended start: also takes the long-break length and cycle count.
    bool startPomodoro(int focusMin, int breakMin, int longBreakMin,
                       int totalCycles, const QString &label, QString *error);
    bool control(const QString &action, QString *error);   // pause|resume|stop|skip
    void tick();                                           // 1 Hz QTimer + tests

signals:
    void changed();

private:
    bool beginSession(Mode mode, int focusMin, int breakMin, int longBreakMin,
                      int totalCycles, const QString &label, QString *error);
    void advancePhase();
    void resetToIdle();
    void recordCompletedPhase();
    int focusSec() const { return m_focusMin * 60; }
    int breakSec() const { return m_breakMin * 60; }
    int longBreakSec() const { return m_longBreakMin * 60; }

    State m_state = State::Idle;
    Mode m_mode = Mode::Countdown;
    QString m_phase;
    QString m_label;
    int m_durationSec = 0;
    int m_remainingSec = 0;
    int m_cycle = 0;
    int m_focusMin = 25;
    int m_breakMin = 5;
    int m_longBreakMin = 15;
    int m_totalCycles = 4;
    int m_completedFocus = 0;
    bool m_autoAdvance = true;
    qint64 m_phaseStartedMs = 0;
    qint64 m_endMs = 0;
    qint64 m_finishedAtMs = 0;
    Clock m_clock;
    QTimer m_tickTimer;
    QTimer m_finishTimer;
    TimerStats m_stats;
};
