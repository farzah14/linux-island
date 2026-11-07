#include "timer_service.h"

#include <QDateTime>
#include <algorithm>
#include <cmath>

namespace {
constexpr int kFinishHoldSec = 60;
constexpr int kMaxFocusMin = 180;
constexpr int kMaxBreakMin = 60;
constexpr int kMaxLongBreakMin = 60;
constexpr int kMaxCycles = 12;
constexpr int kMinCycles = 2;

int clampInt(int value, int lo, int hi) {
    return std::clamp(value, lo, hi);
}
} // namespace

TimerService::TimerService(QObject *parent)
    : QObject(parent),
      m_clock([] { return QDateTime::currentMSecsSinceEpoch(); }) {
    m_tickTimer.setInterval(1000);
    m_tickTimer.setSingleShot(false);
    connect(&m_tickTimer, &QTimer::timeout, this, &TimerService::tick);

    m_finishTimer.setSingleShot(true);
    m_finishTimer.setInterval(kFinishHoldSec * 1000);
    connect(&m_finishTimer, &QTimer::timeout, this, [this] {
        if (m_state != State::Finished) return;
        resetToIdle();
        emit changed();
    });
}

TimerService::State TimerService::state() const {
    return m_state;
}

TimerService::Mode TimerService::mode() const {
    return m_mode;
}

QString TimerService::phase() const {
    return m_phase;
}

QString TimerService::label() const {
    return m_label;
}

int TimerService::durationSec() const {
    return m_durationSec;
}

int TimerService::remainingSec() const {
    return m_remainingSec;
}

int TimerService::cycle() const {
    return m_cycle;
}

int TimerService::totalCycles() const {
    return m_totalCycles;
}

int TimerService::completedFocus() const {
    return m_completedFocus;
}

int TimerService::elapsedSec() const {
    return std::max(0, m_durationSec - m_remainingSec);
}

bool TimerService::autoAdvance() const {
    return m_autoAdvance;
}

qint64 TimerService::endsAtMs() const {
    return m_state == State::Running ? m_endMs : 0;
}

TimerStats TimerService::stats() const {
    return m_stats;
}

TimerSnapshot TimerService::snapshot() const {
    TimerSnapshot snap;
    switch (m_state) {
    case State::Idle: snap.state = QStringLiteral("idle"); break;
    case State::Running: snap.state = QStringLiteral("running"); break;
    case State::Paused: snap.state = QStringLiteral("paused"); break;
    case State::Finished: snap.state = QStringLiteral("finished"); break;
    }
    snap.mode = m_mode == Mode::Pomodoro ? QStringLiteral("pomodoro") : QStringLiteral("countdown");
    snap.phase = m_phase;
    snap.label = m_label;
    snap.durationSec = m_durationSec;
    snap.remainingSec = m_remainingSec;
    snap.cycle = m_cycle;
    snap.totalCycles = m_totalCycles;
    snap.completedFocus = m_completedFocus;
    snap.elapsedSec = elapsedSec();
    snap.autoAdvance = m_autoAdvance;
    snap.endsAtMs = endsAtMs();
    return snap;
}

void TimerService::setCycleConfig(int focusMin, int breakMin, int longBreakMin, int totalCycles) {
    const int focus = clampInt(focusMin, 1, kMaxFocusMin);
    const int brk = clampInt(breakMin, 1, kMaxBreakMin);
    const int longBrk = clampInt(longBreakMin, 1, kMaxLongBreakMin);
    const int cycles = clampInt(totalCycles, kMinCycles, kMaxCycles);
    // Configuring the next session is not a state change: StartTimer emits the
    // single TimerChanged for the session it actually begins.
    if (focus == m_focusMin && brk == m_breakMin && longBrk == m_longBreakMin &&
        cycles == m_totalCycles) {
        return;
    }
    m_focusMin = focus;
    m_breakMin = brk;
    m_longBreakMin = longBrk;
    m_totalCycles = cycles;
}

void TimerService::setAutoAdvance(bool enabled) {
    if (m_autoAdvance == enabled) return;
    m_autoAdvance = enabled;
    emit changed();
}

void TimerService::resetStats() {
    m_stats = TimerStats();
    emit changed();
}

void TimerService::setClock(Clock clock) {
    if (clock) m_clock = std::move(clock);
}

void TimerService::resetToIdle() {
    m_state = State::Idle;
    m_mode = Mode::Countdown;
    m_phase.clear();
    m_label.clear();
    m_durationSec = 0;
    m_remainingSec = 0;
    m_cycle = 0;
    m_completedFocus = 0;
    m_endMs = 0;
    m_phaseStartedMs = 0;
    m_tickTimer.stop();
    m_finishTimer.stop();
}

bool TimerService::start(Mode mode, int focusMin, int breakMin,
                         const QString &label, QString *error) {
    return beginSession(mode, focusMin, breakMin, m_longBreakMin, m_totalCycles, label, error);
}

bool TimerService::startPomodoro(int focusMin, int breakMin, int longBreakMin,
                                 int totalCycles, const QString &label, QString *error) {
    return beginSession(Mode::Pomodoro, focusMin, breakMin, longBreakMin, totalCycles, label, error);
}

bool TimerService::beginSession(Mode mode, int focusMin, int breakMin, int longBreakMin,
                                int totalCycles, const QString &label, QString *error) {
    m_mode = mode;
    if (focusMin < 1 || focusMin > kMaxFocusMin) {
        if (error) *error = QStringLiteral("focus minutes must be between 1 and 180");
        return false;
    }
    if (breakMin < 1 || breakMin > kMaxBreakMin) {
        if (error) *error = QStringLiteral("break minutes must be between 1 and 60");
        return false;
    }
    if (longBreakMin < 1 || longBreakMin > kMaxLongBreakMin) {
        if (error) *error = QStringLiteral("long break minutes must be between 1 and 60");
        return false;
    }
    if (totalCycles < kMinCycles || totalCycles > kMaxCycles) {
        if (error) *error = QStringLiteral("cycles must be between 2 and 12");
        return false;
    }

    m_focusMin = focusMin;
    m_breakMin = breakMin;
    m_longBreakMin = longBreakMin;
    m_totalCycles = totalCycles;
    m_label = label;
    m_cycle = 0;
    m_completedFocus = 0;
    m_phase.clear();
    m_finishTimer.stop();

    if (m_mode == Mode::Pomodoro) {
        m_phase = QStringLiteral("focus");
        m_cycle = 1;
    }

    m_durationSec = focusMin * 60;
    m_remainingSec = m_durationSec;
    m_phaseStartedMs = m_clock();
    m_endMs = m_phaseStartedMs + static_cast<qint64>(m_durationSec) * 1000;
    m_state = State::Running;
    m_tickTimer.start();
    ++m_stats.sessionsStarted;
    emit changed();
    return true;
}

void TimerService::recordCompletedPhase() {
    if (m_phase == QLatin1String("focus")) {
        ++m_stats.focusCompleted;
        m_stats.totalFocusSec += m_durationSec;
        m_stats.longestFocusSec = std::max(m_stats.longestFocusSec, m_durationSec);
        ++m_completedFocus;
    } else if (m_phase == QLatin1String("break") || m_phase == QLatin1String("long-break")) {
        ++m_stats.breaksCompleted;
    }
}

void TimerService::tick() {
    if (m_state == State::Finished) {
        if (m_clock() - m_finishedAtMs >= kFinishHoldSec * 1000) {
            resetToIdle();
            emit changed();
        }
        return;
    }
    if (m_state != State::Running) return;

    const double secondsLeft = static_cast<double>(m_endMs - m_clock()) / 1000.0;
    const int remaining = secondsLeft > 0.0 ? static_cast<int>(std::ceil(secondsLeft)) : 0;
    if (remaining == m_remainingSec) return;
    m_remainingSec = remaining;

    if (remaining > 0) {
        emit changed();
        return;
    }

    recordCompletedPhase();

    if (m_mode == Mode::Countdown) {
        m_state = State::Finished;
        m_remainingSec = 0;
        m_finishedAtMs = m_clock();
        m_tickTimer.stop();
        emit changed();
        m_finishTimer.start();
        return;
    }

    if (!m_autoAdvance) {
        // Hold at zero so the user can decide when the next phase begins.
        m_state = State::Finished;
        m_remainingSec = 0;
        m_finishedAtMs = m_clock();
        m_tickTimer.stop();
        emit changed();
        return;
    }

    advancePhase();
}

void TimerService::advancePhase() {
    if (m_phase == QLatin1String("focus")) {
        const bool longBreak = m_cycle >= m_totalCycles;
        m_phase = longBreak ? QStringLiteral("long-break") : QStringLiteral("break");
        m_durationSec = longBreak ? longBreakSec() : breakSec();
    } else if (m_phase == QLatin1String("break")) {
        ++m_cycle;
        m_phase = QStringLiteral("focus");
        m_durationSec = focusSec();
    } else if (m_phase == QLatin1String("long-break")) {
        m_cycle = 1;
        m_completedFocus = 0;
        m_phase = QStringLiteral("focus");
        m_durationSec = focusSec();
    } else {
        m_phase = QStringLiteral("focus");
        m_cycle = 1;
        m_durationSec = focusSec();
    }

    m_remainingSec = m_durationSec;
    m_phaseStartedMs = m_clock();
    m_endMs = m_phaseStartedMs + static_cast<qint64>(m_durationSec) * 1000;
    m_state = State::Running;
    m_tickTimer.start();
    emit changed();
}

bool TimerService::control(const QString &action, QString *error) {
    if (action == QLatin1String("pause")) {
        if (m_state != State::Running) {
            if (error) *error = QStringLiteral("timer is not running");
            return false;
        }
        const double secondsLeft = static_cast<double>(m_endMs - m_clock()) / 1000.0;
        m_remainingSec = secondsLeft > 0.0 ? static_cast<int>(std::ceil(secondsLeft)) : 0;
        m_state = State::Paused;
        m_tickTimer.stop();
        emit changed();
        return true;
    }

    if (action == QLatin1String("resume")) {
        if (m_state != State::Paused) {
            if (error) *error = QStringLiteral("timer is not paused");
            return false;
        }
        m_endMs = m_clock() + static_cast<qint64>(m_remainingSec) * 1000;
        m_state = State::Running;
        m_tickTimer.start();
        emit changed();
        return true;
    }

    if (action == QLatin1String("stop")) {
        if (m_state == State::Idle) {
            if (error) *error = QStringLiteral("timer is idle");
            return false;
        }
        resetToIdle();
        emit changed();
        return true;
    }

    if (action == QLatin1String("skip")) {
        if (m_state != State::Running || m_mode != Mode::Pomodoro) {
            if (error) *error = QStringLiteral("timer is not running");
            return false;
        }
        // Skipping a focus phase does not count as completed.
        if (m_phase == QLatin1String("focus")) {
            const bool longBreak = m_cycle >= m_totalCycles;
            m_phase = longBreak ? QStringLiteral("long-break") : QStringLiteral("break");
            m_durationSec = longBreak ? longBreakSec() : breakSec();
            m_remainingSec = m_durationSec;
            m_phaseStartedMs = m_clock();
            m_endMs = m_phaseStartedMs + static_cast<qint64>(m_durationSec) * 1000;
            emit changed();
            return true;
        }
        advancePhase();
        return true;
    }

    if (action == QLatin1String("next")) {
        // Advance from a held finish (auto-advance off) into the next phase.
        if (m_state != State::Finished || m_mode != Mode::Pomodoro) {
            if (error) *error = QStringLiteral("timer is not finished");
            return false;
        }
        advancePhase();
        return true;
    }

    if (error) *error = QStringLiteral("unsupported timer action: ") + action;
    return false;
}
