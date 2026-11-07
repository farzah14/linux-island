#include <QtTest>
#include <QDBusArgument>
#include <QDBusConnection>
#include <QDBusError>
#include <QDBusInterface>
#include <QDBusMessage>
#include <QDBusReply>
#include <QSignalSpy>
#include <QTemporaryDir>
#include <QXmlStreamReader>
#include "dbus/core_service.h"
#include "dbus/time_adaptor.h"

class TestTimeDBus : public QObject {
    Q_OBJECT

private slots:
    void initTestCase();
    void testIntrospectionSignatures();
    void testGetTimerIdle();
    void testStartTimerEmitsAndRuns();
    void testStartTimerValidation();
    void testControlTimerErrors();
    void testPauseResumeStopRevisionSequence();
    void testGetTimerStats();
    void testStartTimerExtended();
    void cleanupTestCase();

private:
    QVariantMap callMap(const QString &method);
    bool startTimer(const QVariantMap &request);
    bool controlTimer(const QString &action);

    QTemporaryDir m_tempDir;
    CoreService *m_service = nullptr;
    QDBusConnection m_bus = QDBusConnection::sessionBus();
};

void TestTimeDBus::initTestCase() {
    QVERIFY2(m_bus.isConnected(), "Session bus must be connected");
    QVERIFY(m_tempDir.isValid());
    m_service = new CoreService(m_tempDir.filePath(QStringLiteral("settings.json")), this);
    new TimeAdaptor(m_service);
    QVERIFY2(m_bus.registerObject(QStringLiteral("/io/github/linuxisland/Core"), m_service,
                                  QDBusConnection::ExportAdaptors),
             "Must register the Core object");
    QVERIFY2(m_bus.registerService(QStringLiteral("io.github.linuxisland.Core")),
             "Must register the Core service");
}

QVariantMap TestTimeDBus::callMap(const QString &method) {
    QDBusInterface iface(QStringLiteral("io.github.linuxisland.Core"),
                         QStringLiteral("/io/github/linuxisland/Core"),
                         QStringLiteral("io.github.linuxisland.Time1"), m_bus);
    QDBusReply<QVariantMap> reply = iface.call(method);
    if (!reply.isValid()) return {};
    const QVariant value = reply.value();
    if (value.metaType().id() == qMetaTypeId<QDBusArgument>()) {
        return qdbus_cast<QVariantMap>(value.value<QDBusArgument>());
    }
    return value.toMap();
}

bool TestTimeDBus::startTimer(const QVariantMap &request) {
    QDBusInterface iface(QStringLiteral("io.github.linuxisland.Core"),
                         QStringLiteral("/io/github/linuxisland/Core"),
                         QStringLiteral("io.github.linuxisland.Time1"), m_bus);
    QDBusReply<bool> reply = iface.call(QStringLiteral("StartTimer"), request);
    return reply.isValid() && reply.value();
}

bool TestTimeDBus::controlTimer(const QString &action) {
    QDBusInterface iface(QStringLiteral("io.github.linuxisland.Core"),
                         QStringLiteral("/io/github/linuxisland/Core"),
                         QStringLiteral("io.github.linuxisland.Time1"), m_bus);
    QDBusReply<bool> reply = iface.call(QStringLiteral("ControlTimer"), action);
    return reply.isValid() && reply.value();
}

void TestTimeDBus::testIntrospectionSignatures() {
    QDBusInterface intro(QStringLiteral("io.github.linuxisland.Core"),
                         QStringLiteral("/io/github/linuxisland/Core"),
                         QStringLiteral("org.freedesktop.DBus.Introspectable"), m_bus);
    QDBusReply<QString> reply = intro.call(QStringLiteral("Introspect"));
    QVERIFY2(reply.isValid(), qPrintable(reply.error().message()));

    QXmlStreamReader reader(reply.value());
    bool inTime = false;
    QSet<QString> methods;
    QSet<QString> signalNames;
    while (!reader.atEnd() && !reader.hasError()) {
        const auto token = reader.readNext();
        if (token != QXmlStreamReader::StartElement) continue;
        if (reader.name() == QLatin1String("interface")) {
            inTime = reader.attributes().value(QLatin1String("name")) ==
                     QLatin1String("io.github.linuxisland.Time1");
        } else if (inTime && reader.name() == QLatin1String("method")) {
            methods.insert(reader.attributes().value(QLatin1String("name")).toString());
        } else if (inTime && reader.name() == QLatin1String("signal")) {
            signalNames.insert(reader.attributes().value(QLatin1String("name")).toString());
        }
    }
    QCOMPARE(methods, (QSet<QString>{QStringLiteral("GetTimer"), QStringLiteral("GetTimerStats"),
                                     QStringLiteral("StartTimer"), QStringLiteral("ControlTimer")}));
    QCOMPARE(signalNames, (QSet<QString>{QStringLiteral("TimerChanged")}));
}

void TestTimeDBus::testGetTimerIdle() {
    const QVariantMap timer = callMap(QStringLiteral("GetTimer"));
    QCOMPARE(timer.value(QStringLiteral("state")).toString(), QStringLiteral("idle"));
    QCOMPARE(timer.value(QStringLiteral("mode")).toString(), QStringLiteral("countdown"));
    QCOMPARE(timer.value(QStringLiteral("remainingSec")).toInt(), 0);
    QCOMPARE(timer.value(QStringLiteral("revision")).toULongLong(), 0ull);
}

void TestTimeDBus::testStartTimerEmitsAndRuns() {
    QSignalSpy spy(m_service, &CoreService::timerChanged);
    QVERIFY(startTimer({{QStringLiteral("mode"), QStringLiteral("countdown")},
                        {QStringLiteral("durationMin"), 1}}));
    QCOMPARE(spy.count(), 1);

    const QVariantMap timer = callMap(QStringLiteral("GetTimer"));
    QCOMPARE(timer.value(QStringLiteral("state")).toString(), QStringLiteral("running"));
    const int remaining = timer.value(QStringLiteral("remainingSec")).toInt();
    QVERIFY2(remaining >= 59 && remaining <= 60, qPrintable(QString::number(remaining)));
    QCOMPARE(timer.value(QStringLiteral("durationSec")).toInt(), 60);
    QVERIFY(timer.value(QStringLiteral("revision")).toULongLong() > 0);
}

void TestTimeDBus::testStartTimerValidation() {
    QDBusInterface iface(QStringLiteral("io.github.linuxisland.Core"),
                         QStringLiteral("/io/github/linuxisland/Core"),
                         QStringLiteral("io.github.linuxisland.Time1"), m_bus);

    QDBusMessage bogus = iface.call(QStringLiteral("StartTimer"),
                                    QVariantMap{{QStringLiteral("mode"), QStringLiteral("bogus")}});
    QCOMPARE(bogus.type(), QDBusMessage::ErrorMessage);
    QCOMPARE(bogus.errorName(), QStringLiteral("io.github.linuxisland.Error.InvalidArgument"));

    QDBusMessage zero = iface.call(QStringLiteral("StartTimer"),
                                   QVariantMap{{QStringLiteral("mode"), QStringLiteral("countdown")},
                                               {QStringLiteral("durationMin"), 0}});
    QCOMPARE(zero.type(), QDBusMessage::ErrorMessage);
    QCOMPARE(zero.errorName(), QStringLiteral("io.github.linuxisland.Error.InvalidArgument"));

    QDBusMessage unknown = iface.call(QStringLiteral("ControlTimer"), QStringLiteral("explode"));
    QCOMPARE(unknown.type(), QDBusMessage::ErrorMessage);
    QCOMPARE(unknown.errorName(), QStringLiteral("io.github.linuxisland.Error.UnsupportedAction"));

    controlTimer(QStringLiteral("stop"));
    QDBusMessage pauseIdle = iface.call(QStringLiteral("ControlTimer"), QStringLiteral("pause"));
    QCOMPARE(pauseIdle.type(), QDBusMessage::ErrorMessage);
    QCOMPARE(pauseIdle.errorName(), QStringLiteral("io.github.linuxisland.Error.InvalidArgument"));
}

void TestTimeDBus::testControlTimerErrors() {
    QDBusInterface iface(QStringLiteral("io.github.linuxisland.Core"),
                         QStringLiteral("/io/github/linuxisland/Core"),
                         QStringLiteral("io.github.linuxisland.Time1"), m_bus);

    // skip is only meaningful for a running pomodoro.
    QVERIFY(startTimer({{QStringLiteral("mode"), QStringLiteral("countdown")},
                        {QStringLiteral("durationMin"), 1}}));
    QDBusMessage skip = iface.call(QStringLiteral("ControlTimer"), QStringLiteral("skip"));
    QCOMPARE(skip.type(), QDBusMessage::ErrorMessage);
    QCOMPARE(skip.errorName(), QStringLiteral("io.github.linuxisland.Error.UnsupportedAction"));
    QVERIFY(controlTimer(QStringLiteral("stop")));
}

void TestTimeDBus::testPauseResumeStopRevisionSequence() {
    QVERIFY(startTimer({{QStringLiteral("mode"), QStringLiteral("countdown")},
                        {QStringLiteral("durationMin"), 1}}));
    const quint64 startRev = callMap(QStringLiteral("GetTimer")).value(QStringLiteral("revision")).toULongLong();

    QVERIFY(controlTimer(QStringLiteral("pause")));
    QVariantMap paused = callMap(QStringLiteral("GetTimer"));
    QCOMPARE(paused.value(QStringLiteral("state")).toString(), QStringLiteral("paused"));
    const int pausedRemaining = paused.value(QStringLiteral("remainingSec")).toInt();
    const quint64 pauseRev = paused.value(QStringLiteral("revision")).toULongLong();
    QVERIFY(pauseRev > startRev);

    // A paused timer ignores the wall clock.
    QTest::qWait(1100);
    QVariantMap stillPaused = callMap(QStringLiteral("GetTimer"));
    QCOMPARE(stillPaused.value(QStringLiteral("remainingSec")).toInt(), pausedRemaining);

    QVERIFY(controlTimer(QStringLiteral("resume")));
    QVariantMap resumed = callMap(QStringLiteral("GetTimer"));
    QCOMPARE(resumed.value(QStringLiteral("state")).toString(), QStringLiteral("running"));
    QVERIFY(resumed.value(QStringLiteral("revision")).toULongLong() > pauseRev);

    QVERIFY(controlTimer(QStringLiteral("stop")));
    QVariantMap stopped = callMap(QStringLiteral("GetTimer"));
    QCOMPARE(stopped.value(QStringLiteral("state")).toString(), QStringLiteral("idle"));
    QCOMPARE(stopped.value(QStringLiteral("remainingSec")).toInt(), 0);
    QVERIFY(stopped.value(QStringLiteral("revision")).toULongLong() >
            resumed.value(QStringLiteral("revision")).toULongLong());
}

void TestTimeDBus::testGetTimerStats() {
    const QVariantMap stats = callMap(QStringLiteral("GetTimerStats"));
    // A freshly started Core has no completed focus phases.
    QCOMPARE(stats.value(QStringLiteral("focusCompleted")).toInt(), 0);
    QVERIFY(stats.contains(QStringLiteral("sessionsStarted")));
    QVERIFY(stats.contains(QStringLiteral("totalFocusSec")));
}

void TestTimeDBus::testStartTimerExtended() {
    QDBusInterface iface(QStringLiteral("io.github.linuxisland.Core"),
                         QStringLiteral("/io/github/linuxisland/Core"),
                         QStringLiteral("io.github.linuxisland.Time1"), m_bus);

    // Extended pomodoro shape is accepted and reflected in the snapshot.
    QDBusReply<bool> ok = iface.call(QStringLiteral("StartTimer"),
        QVariantMap{{QStringLiteral("mode"), QStringLiteral("pomodoro")},
                    {QStringLiteral("durationMin"), 10},
                    {QStringLiteral("breakMin"), 3},
                    {QStringLiteral("longBreakMin"), 20},
                    {QStringLiteral("cycles"), 3}});
    QVERIFY(ok.isValid());
    QVERIFY(ok.value());

    const QVariantMap timer = callMap(QStringLiteral("GetTimer"));
    QCOMPARE(timer.value(QStringLiteral("mode")).toString(), QStringLiteral("pomodoro"));
    QCOMPARE(timer.value(QStringLiteral("phase")).toString(), QStringLiteral("focus"));
    QCOMPARE(timer.value(QStringLiteral("totalCycles")).toInt(), 3);
    QCOMPARE(timer.value(QStringLiteral("durationSec")).toInt(), 600);
    QVERIFY(timer.contains(QStringLiteral("elapsedSec")));
    QVERIFY(timer.contains(QStringLiteral("autoAdvance")));

    // Out-of-range cycles and long break are rejected.
    QDBusMessage badCycles = iface.call(QStringLiteral("StartTimer"),
        QVariantMap{{QStringLiteral("mode"), QStringLiteral("pomodoro")},
                    {QStringLiteral("cycles"), 99}});
    QCOMPARE(badCycles.type(), QDBusMessage::ErrorMessage);
    QCOMPARE(badCycles.errorName(), QStringLiteral("io.github.linuxisland.Error.InvalidArgument"));

    QDBusMessage badLongBreak = iface.call(QStringLiteral("StartTimer"),
        QVariantMap{{QStringLiteral("mode"), QStringLiteral("pomodoro")},
                    {QStringLiteral("longBreakMin"), 0}});
    QCOMPARE(badLongBreak.type(), QDBusMessage::ErrorMessage);

    // `next` is rejected unless the timer is held at finished.
    QDBusMessage nextRunning = iface.call(QStringLiteral("ControlTimer"), QStringLiteral("next"));
    QCOMPARE(nextRunning.type(), QDBusMessage::ErrorMessage);
    QCOMPARE(nextRunning.errorName(), QStringLiteral("io.github.linuxisland.Error.InvalidArgument"));

    QVERIFY(controlTimer(QStringLiteral("stop")));
}

void TestTimeDBus::cleanupTestCase() {
    m_bus.unregisterService(QStringLiteral("io.github.linuxisland.Core"));
    m_bus.unregisterObject(QStringLiteral("/io/github/linuxisland/Core"));
}

QTEST_MAIN(TestTimeDBus)
#include "tst_time_dbus.moc"
