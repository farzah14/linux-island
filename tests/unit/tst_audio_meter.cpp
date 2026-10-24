#include <QtTest>
#include <QtEndian>
#include <cmath>
#include "media/audio_meter.h"

class TestAudioMeter : public QObject {
    Q_OBJECT
private slots:
    void liveMonitor() {
        if (!qEnvironmentVariableIsSet("LINUX_ISLAND_TEST_LIVE_AUDIO"))
            QSKIP("Opt-in speaker-output monitor test");
        AudioMeter meter;
        QSignalSpy frames(&meter, &AudioMeter::levelsChanged);
        meter.setActive(true);
        QTRY_VERIFY_WITH_TIMEOUT(frames.count() >= 10, 6000);
        QTest::qWait(3000); // Allows independent PipeWire graph inspection.
        for (const auto &frame : frames) {
            const auto levels = frame.first().toList();
            QCOMPARE(levels.size(), 3);
            for (const auto &value : levels) {
                QVERIFY(std::isfinite(value.toDouble()));
                QVERIFY(value.toDouble() >= 0 && value.toDouble() <= 1);
            }
        }
        qInfo("Speaker monitor delivered bounded three-band frames (no PCM retained)");
        meter.setActive(false);
        QTest::qWait(500);
        for (auto *process : meter.findChildren<QProcess *>())
            QCOMPARE(process->state(), QProcess::NotRunning);
    }
    void silence() {
        AudioBands bands;
        const auto values = bands.analyze(QByteArray(1600, '\0'));
        QCOMPARE(values, QVariantList({0.0, 0.0, 0.0}));
        QCOMPARE(bands.analyze(QByteArray("x")), QVariantList({0.0, 0.0, 0.0}));
    }
    void toneBands() {
        for (const auto &[frequency, dominant] : std::array<std::pair<double, int>, 3>{{{100, 0}, {1000, 1}, {6000, 2}}}) {
            AudioBands bands;
            QVariantList values;
            for (int frame = 0; frame < 10; ++frame) {
                QByteArray pcm(1600, '\0');
                for (int i = 0; i < 800; ++i) {
                    const qint16 sample = qint16(16000 * std::sin(2 * 3.141592653589793 * frequency * (frame * 800 + i) / 16000));
                    qToLittleEndian<qint16>(sample, pcm.data() + 2 * i);
                }
                values = bands.analyze(pcm);
            }
            for (int i = 0; i < 3; ++i) {
                QVERIFY(std::isfinite(values[i].toDouble()));
                QVERIFY(values[i].toDouble() >= 0 && values[i].toDouble() <= 1);
                if (i != dominant) QVERIFY2(values[dominant].toDouble() > values[i].toDouble(), "tone must dominate the expected band");
            }
            for (int i = 0; i < 80; ++i) values = bands.analyze(QByteArray(1600, '\0'));
            for (const auto &value : values) QVERIFY(value.toDouble() < 0.001);
        }
    }
};
QTEST_GUILESS_MAIN(TestAudioMeter)
#include "tst_audio_meter.moc"
