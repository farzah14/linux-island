#include <QtTest>
#include <QSignalSpy>
#include <QTemporaryDir>
#include <QFile>
#include <QProcessEnvironment>
#include "media/sink_volume.h"

namespace {
bool writeStubCommand(const QString &dir, const QString &name, const QString &body) {
    QFile script(dir + QLatin1Char('/') + name);
    if (!script.open(QIODevice::WriteOnly | QIODevice::Truncate)) return false;
    script.write("#!/bin/sh\n");
    script.write(body.toUtf8());
    script.close();
    script.setPermissions(QFile::ReadOwner | QFile::WriteOwner | QFile::ExeOwner |
                          QFile::ReadGroup | QFile::ExeGroup |
                          QFile::ReadOther | QFile::ExeOther);
    return true;
}

bool writeStubWpctl(const QString &dir, const QString &body) {
    return writeStubCommand(dir, QStringLiteral("wpctl"), body);
}
} // namespace

class TestSinkVolume : public QObject {
    Q_OBJECT
private slots:
    void readsPlainLevel();
    void readsMutedFlag();
    void rejectsGarbage();
    void muteHidesLevel();
    void pactlFallbackReadsLevelAndMute();
    void liveSinkRoundTrip();
};

void TestSinkVolume::readsPlainLevel() {
    QTemporaryDir dir;
    QVERIFY(dir.isValid());
    QVERIFY(writeStubWpctl(dir.path(), QStringLiteral("echo 'Volume: 0.370000'\n")));
    qputenv("PATH", (dir.path() + ':' + qEnvironmentVariable("PATH")).toUtf8());

    SinkVolume sink;
    QSignalSpy spy(&sink, &SinkVolume::changed);
    sink.start();
    QTRY_VERIFY_WITH_TIMEOUT(sink.known(), 4000);
    QVERIFY(std::abs(sink.level() - 0.37) < 0.001);
    QCOMPARE(sink.volume(), 0.37);
    QCOMPARE(sink.muted(), false);
    QVERIFY(spy.count() >= 1);
    sink.stop();
}

void TestSinkVolume::readsMutedFlag() {
    QTemporaryDir dir;
    QVERIFY(dir.isValid());
    QVERIFY(writeStubWpctl(dir.path(), QStringLiteral("echo 'Volume: 0.520000 [MUTED]'\n")));
    qputenv("PATH", (dir.path() + ':' + qEnvironmentVariable("PATH")).toUtf8());

    SinkVolume sink;
    sink.start();
    QTRY_VERIFY_WITH_TIMEOUT(sink.known(), 4000);
    QCOMPARE(sink.muted(), true);
    QCOMPARE(sink.volume(), 0.0);   // what the slider draws
    QVERIFY(std::abs(sink.level() - 0.52) < 0.001); // what unmuting restores
    sink.stop();
}

void TestSinkVolume::rejectsGarbage() {
    QTemporaryDir dir;
    QVERIFY(dir.isValid());
    QVERIFY(writeStubWpctl(dir.path(), QStringLiteral("echo 'not a volume'\n")));
    qputenv("PATH", (dir.path() + ':' + qEnvironmentVariable("PATH")).toUtf8());

    SinkVolume sink;
    sink.start();
    QTest::qWait(1500);
    QCOMPARE(sink.known(), false);
    QCOMPARE(sink.volume(), 1.0);
    sink.stop();
}

void TestSinkVolume::muteHidesLevel() {
    QTemporaryDir dir;
    QVERIFY(dir.isValid());
    QVERIFY(writeStubWpctl(dir.path(), QStringLiteral("echo 'Volume: 0.640000'\n")));
    qputenv("PATH", (dir.path() + ':' + qEnvironmentVariable("PATH")).toUtf8());

    SinkVolume sink;
    sink.start();
    QTRY_VERIFY_WITH_TIMEOUT(sink.known(), 4000);
    sink.setMuted(true);
    QCOMPARE(sink.volume(), 0.0);
    QVERIFY(std::abs(sink.level() - 0.64) < 0.001);
    sink.stop();
}

void TestSinkVolume::pactlFallbackReadsLevelAndMute() {
    QTemporaryDir dir;
    QVERIFY(dir.isValid());
    QVERIFY(writeStubCommand(dir.path(), QStringLiteral("pactl"), QStringLiteral(
        "if [ \"$1\" = \"get-sink-volume\" ]; then\n"
        "  echo 'Volume: front-left: 42598 /  65% / -11.22 dB,   front-right: 42598 /  65% / -11.22 dB'\n"
        "elif [ \"$1\" = \"get-sink-mute\" ]; then\n"
        "  echo 'Mute: no'\n"
        "fi\n")));
    const QByteArray prevPath = qgetenv("PATH");
    qputenv("PATH", dir.path().toUtf8());

    SinkVolume sink;
    QSignalSpy spy(&sink, &SinkVolume::changed);
    sink.start();
    const bool ok = QTest::qWaitFor([&sink] { return sink.known(); }, 4000);
    qputenv("PATH", prevPath);
    QVERIFY(ok);
    QVERIFY(std::abs(sink.level() - 0.65) < 0.001);
    QCOMPARE(sink.volume(), 0.65);
    QCOMPARE(sink.muted(), false);
    QVERIFY(spy.count() >= 1);
    sink.setMuted(true);
    QCOMPARE(sink.volume(), 0.0);
    QVERIFY(std::abs(sink.level() - 0.65) < 0.001);
    sink.stop();
}

void TestSinkVolume::liveSinkRoundTrip() {
    if (!qEnvironmentVariableIsSet("LINUX_ISLAND_TEST_LIVE_AUDIO"))
        QSKIP("Opt-in test that writes the real default sink volume");

    SinkVolume sink;
    sink.start();
    QTRY_VERIFY_WITH_TIMEOUT(sink.known(), 4000);
    const double original = sink.level();
    const bool wasMuted = sink.muted();
    QVERIFY(original >= 0.0 && original <= 1.0);

    sink.setVolume(0.42);
    QTRY_VERIFY_WITH_TIMEOUT(std::abs(sink.level() - 0.42) < 0.01, 4000);
    QVERIFY(!sink.muted());

    sink.setMuted(true);
    QTRY_VERIFY_WITH_TIMEOUT(sink.muted(), 4000);
    QCOMPARE(sink.volume(), 0.0);
    QVERIFY(sink.level() > 0.0);

    sink.setMuted(wasMuted);
    sink.setVolume(original);
    QTRY_VERIFY_WITH_TIMEOUT(std::abs(sink.level() - original) < 0.01, 4000);
    sink.stop();
}

QTEST_GUILESS_MAIN(TestSinkVolume)
#include "tst_sink_volume.moc"
