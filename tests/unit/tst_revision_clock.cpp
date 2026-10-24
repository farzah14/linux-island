#include <QtTest>
#include "events/revision_clock.h"

class TestRevisionClock : public QObject {
    Q_OBJECT

private slots:
    void testInitialState();
    void testMediaIncrement();
    void testSettingsIncrement();
    void testIndependentCounters();
    void testDistinctInstanceIds();
};

void TestRevisionClock::testInitialState() {
    RevisionClock clock;
    QCOMPARE(clock.mediaRevision(), 0ull);
    QCOMPARE(clock.settingsRevision(), 0ull);
    QVERIFY(!clock.instanceId().isEmpty());
}

void TestRevisionClock::testMediaIncrement() {
    RevisionClock clock;
    quint64 r1 = clock.mediaChanged();
    QCOMPARE(r1, 1ull);
    QCOMPARE(clock.mediaRevision(), 1ull);
    QCOMPARE(clock.settingsRevision(), 0ull);

    quint64 r2 = clock.mediaChanged();
    QCOMPARE(r2, 2ull);
    QCOMPARE(clock.mediaRevision(), 2ull);
}

void TestRevisionClock::testSettingsIncrement() {
    RevisionClock clock;
    quint64 r1 = clock.settingsChanged();
    QCOMPARE(r1, 1ull);
    QCOMPARE(clock.settingsRevision(), 1ull);
    QCOMPARE(clock.mediaRevision(), 0ull);

    quint64 r2 = clock.settingsChanged();
    QCOMPARE(r2, 2ull);
    QCOMPARE(clock.settingsRevision(), 2ull);
}

void TestRevisionClock::testIndependentCounters() {
    RevisionClock clock;
    clock.mediaChanged();
    clock.mediaChanged();
    clock.settingsChanged();
    QCOMPARE(clock.mediaRevision(), 2ull);
    QCOMPARE(clock.settingsRevision(), 1ull);
}

void TestRevisionClock::testDistinctInstanceIds() {
    RevisionClock clock1;
    RevisionClock clock2;
    QVERIFY(!clock1.instanceId().isEmpty());
    QVERIFY(!clock2.instanceId().isEmpty());
    QVERIFY(clock1.instanceId() != clock2.instanceId());
}

QTEST_MAIN(TestRevisionClock)
#include "tst_revision_clock.moc"
