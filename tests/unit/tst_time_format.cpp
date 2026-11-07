#include <QtTest>
#include <QDateTime>
#include <QTimeZone>
#include "time_format.h"

class TestTimeFormat : public QObject {
    Q_OBJECT

private slots:
    void testFormatClock();
    void testFormatTimerCompact();
    void testFormatEventTime_data();
    void testFormatEventTime();
    void testWeekdayNames();
};

void TestTimeFormat::testFormatClock() {
    QCOMPARE(formatClock(0), QStringLiteral("0:00"));
    QCOMPARE(formatClock(7), QStringLiteral("0:07"));
    QCOMPARE(formatClock(59), QStringLiteral("0:59"));
    QCOMPARE(formatClock(1499), QStringLiteral("24:59"));
    QCOMPARE(formatClock(3600), QStringLiteral("1:00:00"));
    QCOMPARE(formatClock(3900), QStringLiteral("1:05:00"));
    QCOMPARE(formatClock(3661), QStringLiteral("1:01:01"));
    QCOMPARE(formatClock(-5), QStringLiteral("0:00"));
}

void TestTimeFormat::testFormatTimerCompact() {
    QCOMPARE(formatTimerCompact(QStringLiteral("finished"), QStringLiteral("countdown"), QString(),
                                QString(), 0),
             QStringLiteral("Time's up"));
    QCOMPARE(formatTimerCompact(QStringLiteral("running"), QStringLiteral("countdown"), QString(),
                                QString(), 1499),
             QStringLiteral("24:59"));
    QCOMPARE(formatTimerCompact(QStringLiteral("running"), QStringLiteral("countdown"), QString(),
                                QStringLiteral("tea"), 1499),
             QStringLiteral("24:59 · tea"));
    QCOMPARE(formatTimerCompact(QStringLiteral("running"), QStringLiteral("pomodoro"),
                                QStringLiteral("focus"), QString(), 60),
             QStringLiteral("Focus 1:00"));
    QCOMPARE(formatTimerCompact(QStringLiteral("running"), QStringLiteral("pomodoro"),
                                QStringLiteral("break"), QString(), 300),
             QStringLiteral("Break 5:00"));
    QCOMPARE(formatTimerCompact(QStringLiteral("running"), QStringLiteral("pomodoro"),
                                QStringLiteral("long-break"), QString(), 900),
             QStringLiteral("Long break 15:00"));
}

void TestTimeFormat::testFormatEventTime_data() {
    QTest::addColumn<qint64>("startOffsetMin");
    QTest::addColumn<qint64>("endOffsetMin");
    QTest::addColumn<QString>("expected");

    QTest::newRow("in progress") << qint64(-30) << qint64(30) << QStringLiteral("Now");
    QTest::newRow("starting now") << qint64(0) << qint64(60) << QStringLiteral("Now");
    QTest::newRow("one minute") << qint64(1) << qint64(15) << QStringLiteral("in 1m");
    QTest::newRow("twelve minutes") << qint64(12) << qint64(42) << QStringLiteral("in 12m");
    QTest::newRow("59 minutes") << qint64(59) << qint64(90) << QStringLiteral("in 59m");
}

void TestTimeFormat::testFormatEventTime() {
    QFETCH(qint64, startOffsetMin);
    QFETCH(qint64, endOffsetMin);
    QFETCH(QString, expected);

    const qint64 now = QDateTime(QDate(2026, 3, 1), QTime(14, 0), QTimeZone::LocalTime)
                           .toMSecsSinceEpoch();
    QCOMPARE(formatEventTime(now + startOffsetMin * 60000, now + endOffsetMin * 60000, now), expected);

    // A start 30 s away rounds up to a whole minute.
    QCOMPARE(formatEventTime(now + 30000, now + 15 * 60000, now), QStringLiteral("in 1m"));
}

void TestTimeFormat::testWeekdayNames() {
    // 2026-03-01 is a Sunday; build each later day from local midnight so the
    // test does not depend on the machine's time zone.
    const QDate today(2026, 3, 1);
    const qint64 now = QDateTime(today, QTime(14, 0), QTimeZone::LocalTime).toMSecsSinceEpoch();

    const auto local = [](const QDate &date, int h, int m) {
        return QDateTime(date, QTime(h, m), QTimeZone::LocalTime).toMSecsSinceEpoch();
    };

    QCOMPARE(formatEventTime(local(today.addDays(2), 9, 0), local(today.addDays(2), 9, 30), now),
             QStringLiteral("Tue 09:00"));
    QCOMPARE(formatEventTime(local(today.addDays(4), 9, 5), local(today.addDays(4), 9, 30), now),
             QStringLiteral("Thu 09:05"));
    QCOMPARE(formatEventTime(local(today.addDays(7), 9, 0), local(today.addDays(7), 9, 30), now),
             QStringLiteral("Sun 09:00"));

    // Tomorrow keeps its word instead of a weekday.
    QCOMPARE(formatEventTime(local(today.addDays(1), 9, 0), local(today.addDays(1), 9, 30), now),
             QStringLiteral("Tomorrow 09:00"));

    // Later today stays a plain clock.
    QCOMPARE(formatEventTime(local(today, 16, 30), local(today, 17, 0), now),
             QStringLiteral("16:30"));

    // No event.
    QCOMPARE(formatEventTime(0, 0, now), QString());
}

QTEST_MAIN(TestTimeFormat)
#include "tst_time_format.moc"
