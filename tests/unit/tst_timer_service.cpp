#include <QtTest>
#include "time/timer_service.h"

class TestTimerService : public QObject {
    Q_OBJECT

private slots:
    void testCountdownStartAndTick();
    void testPauseResume();
    void testFinishHoldReturnsToIdle();
    void testPomodoroPhases();
    void testSkipAdvancesPhase();
    void testInvalidControls();
    void testStartValidation();
    void testCustomCycleConfig();
    void testAutoAdvanceOff();
    void testStatistics();
    void testLongBreakLength();

private:
    qint64 m_now = 1000000;
};

void TestTimerService::testCountdownStartAndTick() {
    m_now = 1000000;
    TimerService timer;
    timer.setClock([this] { return m_now; });

    QString error;
    QVERIFY(timer.start(TimerService::Mode::Countdown, 1, 5, QStringLiteral("tea"), &error));
    QVERIFY2(error.isEmpty(), qPrintable(error));
    QCOMPARE(timer.state(), TimerService::State::Running);
    QCOMPARE(timer.mode(), TimerService::Mode::Countdown);
    QCOMPARE(timer.durationSec(), 60);
    QCOMPARE(timer.remainingSec(), 60);
    QCOMPARE(timer.cycle(), 0);
    QVERIFY(timer.phase().isEmpty());
    QCOMPARE(timer.label(), QStringLiteral("tea"));

    m_now += 30000;
    timer.tick();
    QCOMPARE(timer.remainingSec(), 30);
}

void TestTimerService::testPauseResume() {
    m_now = 500000;
    TimerService timer;
    timer.setClock([this] { return m_now; });

    QString error;
    QVERIFY(timer.start(TimerService::Mode::Countdown, 1, 5, QString(), &error));
    m_now += 30000;
    timer.tick();
    QCOMPARE(timer.remainingSec(), 30);

    QVERIFY(timer.control(QStringLiteral("pause"), &error));
    QCOMPARE(timer.state(), TimerService::State::Paused);
    QCOMPARE(timer.remainingSec(), 30);

    // A paused timer ignores the wall clock.
    m_now += 10000;
    timer.tick();
    QCOMPARE(timer.remainingSec(), 30);
    QCOMPARE(timer.state(), TimerService::State::Paused);

    QVERIFY(timer.control(QStringLiteral("resume"), &error));
    QCOMPARE(timer.state(), TimerService::State::Running);
    QCOMPARE(timer.remainingSec(), 30);

    // The deadline was recomputed from "now", so 10 more seconds leaves 20.
    m_now += 10000;
    timer.tick();
    QCOMPARE(timer.remainingSec(), 20);
}

void TestTimerService::testFinishHoldReturnsToIdle() {
    m_now = 0;
    TimerService timer;
    timer.setClock([this] { return m_now; });

    QString error;
    QVERIFY(timer.start(TimerService::Mode::Countdown, 1, 5, QString(), &error));
    QSignalSpy spy(&timer, &TimerService::changed);

    m_now += 60000;
    timer.tick();
    QCOMPARE(timer.state(), TimerService::State::Finished);
    QCOMPARE(timer.remainingSec(), 0);
    QCOMPARE(spy.count(), 1);

    // Still inside the hold window.
    m_now += 30000;
    timer.tick();
    QCOMPARE(timer.state(), TimerService::State::Finished);
    QCOMPARE(spy.count(), 1);

    // Past the 60 s hold the timer drops back to idle and says so.
    m_now += 30001;
    timer.tick();
    QCOMPARE(timer.state(), TimerService::State::Idle);
    QCOMPARE(timer.remainingSec(), 0);
    QCOMPARE(timer.durationSec(), 0);
    QCOMPARE(spy.count(), 2);
}

void TestTimerService::testPomodoroPhases() {
    m_now = 0;
    TimerService timer;
    timer.setClock([this] { return m_now; });

    QString error;
    QVERIFY(timer.start(TimerService::Mode::Pomodoro, 1, 1, QString(), &error));
    QCOMPARE(timer.phase(), QStringLiteral("focus"));
    QCOMPARE(timer.cycle(), 1);
    QCOMPARE(timer.durationSec(), 60);

    QStringList phases;
    for (int i = 0; i < 4; ++i) {
        // Finish the current focus phase.
        m_now += 60000;
        timer.tick();
        phases << timer.phase();
        if (timer.phase() == QLatin1String("long-break")) {
            QCOMPARE(timer.durationSec(), 15 * 60);
        } else {
            QCOMPARE(timer.durationSec(), 60);
        }
        // Finish the break to return to focus. The fourth break is the long
        // one, so completing it restarts the cycle at 1 instead of 5.
        m_now += timer.durationSec() * 1000;
        timer.tick();
        QCOMPARE(timer.phase(), QStringLiteral("focus"));
        QCOMPARE(timer.cycle(), i < 3 ? i + 2 : 1);
    }

    QCOMPARE(phases, QStringList({QStringLiteral("break"), QStringLiteral("break"),
                                  QStringLiteral("break"), QStringLiteral("long-break")}));
}

void TestTimerService::testSkipAdvancesPhase() {
    m_now = 0;
    TimerService timer;
    timer.setClock([this] { return m_now; });

    QString error;
    QVERIFY(timer.start(TimerService::Mode::Pomodoro, 25, 5, QString(), &error));
    QVERIFY(timer.control(QStringLiteral("skip"), &error));
    QCOMPARE(timer.phase(), QStringLiteral("break"));
    QCOMPARE(timer.durationSec(), 5 * 60);
    QCOMPARE(timer.state(), TimerService::State::Running);

    QVERIFY(timer.control(QStringLiteral("skip"), &error));
    QCOMPARE(timer.phase(), QStringLiteral("focus"));
    QCOMPARE(timer.cycle(), 2);
}

void TestTimerService::testInvalidControls() {
    TimerService timer;
    QString error;

    QVERIFY(!timer.control(QStringLiteral("pause"), &error));
    QCOMPARE(error, QStringLiteral("timer is not running"));

    error.clear();
    QVERIFY(!timer.control(QStringLiteral("resume"), &error));
    QCOMPARE(error, QStringLiteral("timer is not paused"));

    error.clear();
    QVERIFY(!timer.control(QStringLiteral("stop"), &error));
    QCOMPARE(error, QStringLiteral("timer is idle"));

    error.clear();
    QVERIFY(!timer.control(QStringLiteral("explode"), &error));
    QCOMPARE(error, QStringLiteral("unsupported timer action: explode"));

    // `skip` outside pomodoro is rejected and leaves the state untouched.
    QVERIFY(timer.start(TimerService::Mode::Countdown, 1, 1, QString(), &error));
    error.clear();
    QVERIFY(!timer.control(QStringLiteral("skip"), &error));
    QVERIFY(!error.isEmpty());
    QCOMPARE(timer.state(), TimerService::State::Running);
}

void TestTimerService::testStartValidation() {
    TimerService timer;
    QString error;

    QVERIFY(!timer.start(TimerService::Mode::Countdown, 0, 5, QString(), &error));
    QCOMPARE(error, QStringLiteral("focus minutes must be between 1 and 180"));

    error.clear();
    QVERIFY(!timer.start(TimerService::Mode::Countdown, 181, 5, QString(), &error));
    QCOMPARE(error, QStringLiteral("focus minutes must be between 1 and 180"));

    error.clear();
    QVERIFY(!timer.start(TimerService::Mode::Countdown, 25, 0, QString(), &error));
    QCOMPARE(error, QStringLiteral("break minutes must be between 1 and 60"));

    error.clear();
    QVERIFY(!timer.start(TimerService::Mode::Countdown, 25, 61, QString(), &error));
    QCOMPARE(error, QStringLiteral("break minutes must be between 1 and 60"));

    QVERIFY(timer.start(TimerService::Mode::Countdown, 180, 60, QString(), &error));
}

void TestTimerService::testCustomCycleConfig() {
    m_now = 0;
    TimerService timer;
    timer.setClock([this] { return m_now; });
    QString error;

    QVERIFY(timer.startPomodoro(10, 3, 20, 3, QString(), &error));
    QCOMPARE(timer.phase(), QStringLiteral("focus"));
    QCOMPARE(timer.durationSec(), 10 * 60);
    QCOMPARE(timer.totalCycles(), 3);

    // Finish focus -> short break, because cycle 1 < 3.
    m_now += 600000;
    timer.tick();
    QCOMPARE(timer.phase(), QStringLiteral("break"));
    QCOMPARE(timer.durationSec(), 3 * 60);

    m_now += 180000;
    timer.tick();
    QCOMPARE(timer.phase(), QStringLiteral("focus"));
    QCOMPARE(timer.cycle(), 2);

    // Second focus, then third: the third triggers the long break.
    m_now += 600000;
    timer.tick();
    QCOMPARE(timer.phase(), QStringLiteral("break"));
    m_now += 180000;
    timer.tick();
    QCOMPARE(timer.cycle(), 3);
    m_now += 600000;
    timer.tick();
    QCOMPARE(timer.phase(), QStringLiteral("long-break"));
    QCOMPARE(timer.durationSec(), 20 * 60);
}

void TestTimerService::testAutoAdvanceOff() {
    m_now = 0;
    TimerService timer;
    timer.setClock([this] { return m_now; });
    timer.setAutoAdvance(false);
    QVERIFY(!timer.autoAdvance());

    QString error;
    QVERIFY(timer.startPomodoro(1, 1, 5, 4, QString(), &error));
    m_now += 60000;
    timer.tick();

    // Holds at finished instead of rolling into the break.
    QCOMPARE(timer.state(), TimerService::State::Finished);
    QCOMPARE(timer.phase(), QStringLiteral("focus"));

    // `next` advances into the break.
    QVERIFY(timer.control(QStringLiteral("next"), &error));
    QCOMPARE(timer.phase(), QStringLiteral("break"));
    QCOMPARE(timer.state(), TimerService::State::Running);

    // `next` is meaningless while running.
    QVERIFY(!timer.control(QStringLiteral("next"), &error));
    QCOMPARE(error, QStringLiteral("timer is not finished"));
}

void TestTimerService::testStatistics() {
    m_now = 0;
    TimerService timer;
    timer.setClock([this] { return m_now; });
    QString error;

    QVERIFY(timer.startPomodoro(1, 1, 5, 2, QString(), &error));
    QCOMPARE(timer.stats().sessionsStarted, 1);

    // Complete a focus phase.
    m_now += 60000;
    timer.tick();
    QCOMPARE(timer.stats().focusCompleted, 1);
    QCOMPARE(timer.stats().totalFocusSec, 60);
    QCOMPARE(timer.stats().longestFocusSec, 60);

    // Complete the break.
    m_now += 60000;
    timer.tick();
    QCOMPARE(timer.stats().breaksCompleted, 1);

    // Skipping a focus must not count as completed.
    QVERIFY(timer.control(QStringLiteral("skip"), &error));
    QCOMPARE(timer.stats().focusCompleted, 1);

    timer.resetStats();
    QCOMPARE(timer.stats().focusCompleted, 0);
    QCOMPARE(timer.stats().sessionsStarted, 0);
}

void TestTimerService::testLongBreakLength() {
    m_now = 0;
    TimerService timer;
    timer.setClock([this] { return m_now; });
    QString error;

    // totalCycles 2 means the second focus is followed by the long break.
    QVERIFY(timer.startPomodoro(1, 1, 25, 2, QString(), &error));
    m_now += 60000; timer.tick();          // focus 1 done -> break
    m_now += 60000; timer.tick();          // break done -> focus 2
    QCOMPARE(timer.cycle(), 2);
    m_now += 60000; timer.tick();          // focus 2 done -> long break
    QCOMPARE(timer.phase(), QStringLiteral("long-break"));
    QCOMPARE(timer.durationSec(), 25 * 60);
}

QTEST_MAIN(TestTimerService)
#include "tst_timer_service.moc"
