#include <QtTest>
#include <QDBusConnection>
#include <QDBusInterface>
#include <QDBusReply>
#include <QDBusMessage>
#include <QXmlStreamReader>
#include <QSignalSpy>
#include "dbus/core_service.h"
#include "dbus/core_adaptor.h"

class TestCoreDBus : public QObject {
    Q_OBJECT

private slots:
    void initTestCase();
    void testIntrospectionSignatures();
    void testGetSnapshotTypedFields();
    void testGetMediaState();
    void testGetSettings();
    void testMediaControlErrors();
    void testUpdateSettingsValidPersistsAndEmits();
    void testUpdateSettingsInvalidReturnsError();
    void testDuplicateServiceRegistrationFails();
    void testSignalsDelivered();
    void testRestartInstanceIdAndRevisionReset();
    void testSettingsPersistenceAcrossRestart();
    void cleanupTestCase();

private:
    QTemporaryDir m_tempDir;
    CoreService *m_service = nullptr;
    CoreAdaptor *m_adaptor = nullptr;
    QDBusConnection m_bus = QDBusConnection::sessionBus();
};

void TestCoreDBus::initTestCase() {
    QVERIFY2(m_bus.isConnected(), "Session bus must be connected");
    QVERIFY(m_tempDir.isValid());
    m_service = new CoreService(m_tempDir.filePath(QStringLiteral("settings.json")), this);
    m_adaptor = new CoreAdaptor(m_service);
    bool objRegistered = m_bus.registerObject(
        QStringLiteral("/io/github/linuxisland/Core"),
        m_service,
        QDBusConnection::ExportAdaptors);
    QVERIFY2(objRegistered, "Must register /io/github/linuxisland/Core object");

    bool srvRegistered = m_bus.registerService(QStringLiteral("io.github.linuxisland.Core"));
    QVERIFY2(srvRegistered, "Must register io.github.linuxisland.Core service");
}

void TestCoreDBus::testIntrospectionSignatures() {
    QDBusInterface introIface(
        QStringLiteral("io.github.linuxisland.Core"),
        QStringLiteral("/io/github/linuxisland/Core"),
        QStringLiteral("org.freedesktop.DBus.Introspectable"),
        m_bus);
    QVERIFY(introIface.isValid());

    QDBusReply<QString> xmlReply = introIface.call(QStringLiteral("Introspect"));
    QVERIFY2(xmlReply.isValid(), qPrintable(xmlReply.error().message()));

    QString xml = xmlReply.value();
    QVERIFY(!xml.isEmpty());

    QXmlStreamReader reader(xml);
    bool inCoreInterface = false;
    QSet<QString> foundMethods;
    QSet<QString> foundSignals;

    while (!reader.atEnd() && !reader.hasError()) {
        auto token = reader.readNext();
        if (token == QXmlStreamReader::StartElement) {
            if (reader.name() == QLatin1String("interface")) {
                inCoreInterface = (reader.attributes().value(QLatin1String("name")) ==
                                   QLatin1String("io.github.linuxisland.Core1"));
            } else if (inCoreInterface && reader.name() == QLatin1String("method")) {
                foundMethods.insert(reader.attributes().value(QLatin1String("name")).toString());
            } else if (inCoreInterface && reader.name() == QLatin1String("signal")) {
                foundSignals.insert(reader.attributes().value(QLatin1String("name")).toString());
            }
        } else if (token == QXmlStreamReader::EndElement) {
            if (reader.name() == QLatin1String("interface")) {
                inCoreInterface = false;
            }
        }
    }
    QVERIFY(!reader.hasError());

    const QSet<QString> expectedMethods = {
        QStringLiteral("GetSnapshot"),
        QStringLiteral("GetMediaState"),
        QStringLiteral("ControlMedia"),
        QStringLiteral("SetActivePlayer"),
        QStringLiteral("GetSettings"),
        QStringLiteral("UpdateSettings")
    };
    QCOMPARE(foundMethods, expectedMethods);

    const QSet<QString> expectedSignals = {
        QStringLiteral("MediaChanged"),
        QStringLiteral("SettingsChanged"),
        QStringLiteral("CoreStatusChanged")
    };
    QCOMPARE(foundSignals, expectedSignals);
}

void TestCoreDBus::testGetSnapshotTypedFields() {
    QDBusInterface coreIface(
        QStringLiteral("io.github.linuxisland.Core"),
        QStringLiteral("/io/github/linuxisland/Core"),
        QStringLiteral("io.github.linuxisland.Core1"),
        m_bus);
    QVERIFY(coreIface.isValid());

    QDBusReply<QVariantMap> reply = coreIface.call(QStringLiteral("GetSnapshot"));
    QVERIFY2(reply.isValid(), qPrintable(reply.error().message()));
    QVariantMap snapshot = reply.value();

    QVERIFY(snapshot.contains(QStringLiteral("schemaVersion")));
    QCOMPARE(snapshot.value(QStringLiteral("schemaVersion")).toUInt(), 1u);

    QVERIFY(snapshot.contains(QStringLiteral("instanceId")));
    QVERIFY(!snapshot.value(QStringLiteral("instanceId")).toString().isEmpty());

    QVERIFY(snapshot.contains(QStringLiteral("status")));
    QCOMPARE(snapshot.value(QStringLiteral("status")).toString(), QStringLiteral("ready"));

    QVERIFY(snapshot.contains(QStringLiteral("mediaRevision")));
    QCOMPARE(snapshot.value(QStringLiteral("mediaRevision")).toULongLong(), 0ull);

    QVERIFY(snapshot.contains(QStringLiteral("settingsRevision")));
    QCOMPARE(snapshot.value(QStringLiteral("settingsRevision")).toULongLong(), 0ull);

    QVERIFY(snapshot.contains(QStringLiteral("media")));
    QVERIFY(snapshot.contains(QStringLiteral("settings")));
    QVERIFY(snapshot.contains(QStringLiteral("capabilities")));
}

void TestCoreDBus::testGetMediaState() {
    QDBusInterface coreIface(
        QStringLiteral("io.github.linuxisland.Core"),
        QStringLiteral("/io/github/linuxisland/Core"),
        QStringLiteral("io.github.linuxisland.Core1"),
        m_bus);
    QVERIFY(coreIface.isValid());

    QDBusReply<QVariantMap> reply = coreIface.call(QStringLiteral("GetMediaState"));
    QVERIFY2(reply.isValid(), qPrintable(reply.error().message()));

    QVariantMap media = reply.value();
    QVERIFY(media.contains(QStringLiteral("playerId")));
    QVERIFY(media.contains(QStringLiteral("title")));
    QVERIFY(media.contains(QStringLiteral("artist")));
    QVERIFY(media.contains(QStringLiteral("albumArtUri")));
    QVERIFY(media.contains(QStringLiteral("playbackStatus")));
    QCOMPARE(media.value(QStringLiteral("playbackStatus")).toString(), QStringLiteral("Stopped"));
    QVERIFY(media.contains(QStringLiteral("positionUs")));
    QVERIFY(media.contains(QStringLiteral("durationUs")));
    QVERIFY(media.contains(QStringLiteral("canPlay")));
    QVERIFY(media.contains(QStringLiteral("canPause")));
    QVERIFY(media.contains(QStringLiteral("canNext")));
    QVERIFY(media.contains(QStringLiteral("canPrevious")));
    QVERIFY(media.contains(QStringLiteral("canSeek")));
    QVERIFY(media.contains(QStringLiteral("rate")));
    QVERIFY(media.contains(QStringLiteral("revision")));
}

void TestCoreDBus::testGetSettings() {
    QDBusInterface coreIface(
        QStringLiteral("io.github.linuxisland.Core"),
        QStringLiteral("/io/github/linuxisland/Core"),
        QStringLiteral("io.github.linuxisland.Core1"),
        m_bus);
    QVERIFY(coreIface.isValid());

    QDBusMessage reply = coreIface.call(QStringLiteral("GetSettings"));
    QCOMPARE(reply.type(), QDBusMessage::ReplyMessage);
}

void TestCoreDBus::testMediaControlErrors() {
    QDBusInterface coreIface(
        QStringLiteral("io.github.linuxisland.Core"),
        QStringLiteral("/io/github/linuxisland/Core"),
        QStringLiteral("io.github.linuxisland.Core1"),
        m_bus);
    QVERIFY(coreIface.isValid());

    // 1. ControlMedia with no player running -> PlayerUnavailable
    QDBusMessage rep1 = coreIface.call(QStringLiteral("ControlMedia"), QStringLiteral("PlayPause"));
    QCOMPARE(rep1.type(), QDBusMessage::ErrorMessage);
    QCOMPARE(rep1.errorName(), QStringLiteral("io.github.linuxisland.Error.PlayerUnavailable"));

    // 2. ControlMedia with unsupported action -> UnsupportedAction
    QDBusMessage repUnsupported = coreIface.call(QStringLiteral("ControlMedia"), QStringLiteral("Stop"));
    QCOMPARE(repUnsupported.type(), QDBusMessage::ErrorMessage);
    QCOMPARE(repUnsupported.errorName(), QStringLiteral("io.github.linuxisland.Error.UnsupportedAction"));

    // 3. SetActivePlayer with nonexistent player -> PlayerUnavailable
    QDBusMessage rep2 = coreIface.call(QStringLiteral("SetActivePlayer"), QStringLiteral("spotify"));
    QCOMPARE(rep2.type(), QDBusMessage::ErrorMessage);
    QCOMPARE(rep2.errorName(), QStringLiteral("io.github.linuxisland.Error.PlayerUnavailable"));
}

void TestCoreDBus::testUpdateSettingsValidPersistsAndEmits() {
    QDBusInterface coreIface(
        QStringLiteral("io.github.linuxisland.Core"),
        QStringLiteral("/io/github/linuxisland/Core"),
        QStringLiteral("io.github.linuxisland.Core1"),
        m_bus);
    QVERIFY(coreIface.isValid());

    QSignalSpy spy(m_service, &CoreService::settingsChanged);

    QVariantMap patch = {
        {QStringLiteral("theme"), QStringLiteral("dark")},
        {QStringLiteral("notificationPeekEnabled"), true}
    };

    QDBusMessage reply = coreIface.call(QStringLiteral("UpdateSettings"), patch);
    QCOMPARE(reply.type(), QDBusMessage::ReplyMessage);
    QVERIFY(reply.arguments().size() >= 1);
    quint64 rev = reply.arguments().at(0).toULongLong();
    QVERIFY(rev > 0);

    QCOMPARE(spy.count(), 1);
    QCOMPARE(spy.takeFirst().at(0).toULongLong(), rev);

    QDBusReply<QVariantMap> getRep = coreIface.call(QStringLiteral("GetSettings"));
    QVERIFY(getRep.isValid());
    QCOMPARE(getRep.value().value(QStringLiteral("theme")).toString(), QStringLiteral("dark"));
    QCOMPARE(getRep.value().value(QStringLiteral("notificationPeekEnabled")).toBool(), true);
}

void TestCoreDBus::testUpdateSettingsInvalidReturnsError() {
    QDBusInterface coreIface(
        QStringLiteral("io.github.linuxisland.Core"),
        QStringLiteral("/io/github/linuxisland/Core"),
        QStringLiteral("io.github.linuxisland.Core1"),
        m_bus);
    QVERIFY(coreIface.isValid());

    QSignalSpy spy(m_service, &CoreService::settingsChanged);

    QVariantMap invalidPatch = {
        {QStringLiteral("theme"), QStringLiteral("neon")},
        {QStringLiteral("capsuleSize"), QStringLiteral("huge")}
    };

    QDBusMessage reply = coreIface.call(QStringLiteral("UpdateSettings"), invalidPatch);
    QCOMPARE(reply.type(), QDBusMessage::ErrorMessage);
    QCOMPARE(reply.errorName(), QStringLiteral("org.freedesktop.DBus.Error.InvalidArgument"));
    QCOMPARE(spy.count(), 0);
}

void TestCoreDBus::testDuplicateServiceRegistrationFails() {
    auto secBus = QDBusConnection::connectToBus(QDBusConnection::SessionBus, QStringLiteral("second_connection"));
    QVERIFY(secBus.isConnected());
    bool secondReg = secBus.registerService(QStringLiteral("io.github.linuxisland.Core"));
    QVERIFY2(!secondReg, "Duplicate service registration must fail");
    QDBusConnection::disconnectFromBus(QStringLiteral("second_connection"));
}

void TestCoreDBus::testSignalsDelivered() {
    QSignalSpy statusSpy(m_service, &CoreService::coreStatusChanged);
    QSignalSpy mediaSpy(m_service, &CoreService::mediaChanged);
    QSignalSpy settingsSpy(m_service, &CoreService::settingsChanged);

    m_service->setStatus(QStringLiteral("active"));
    QCOMPARE(statusSpy.count(), 1);
    QCOMPARE(statusSpy.takeFirst().at(0).toString(), QStringLiteral("active"));

    MediaState fakeMedia;
    fakeMedia.title = QStringLiteral("Song");
    m_service->setMediaState(fakeMedia);
    QCOMPARE(mediaSpy.count(), 1);

    QVariantMap fakeSettings;
    fakeSettings[QStringLiteral("theme")] = QStringLiteral("dark");
    m_service->setSettings(fakeSettings);
    QCOMPARE(settingsSpy.count(), 1);
}
void TestCoreDBus::testRestartInstanceIdAndRevisionReset() {
    QString firstId = m_service->instanceId();
    QVERIFY(!firstId.isEmpty());

    // Simulate service restart by constructing a new service instance
    CoreService restartedService;
    QVERIFY(!restartedService.instanceId().isEmpty());
    QVERIFY(restartedService.instanceId() != firstId);
    QCOMPARE(restartedService.mediaRevision(), 0ull);
    QCOMPARE(restartedService.settingsRevision(), 0ull);
}

void TestCoreDBus::testSettingsPersistenceAcrossRestart() {
    // Create a new CoreService pointing to the same file
    CoreService restartedService(m_tempDir.filePath(QStringLiteral("settings.json")));
    QCOMPARE(restartedService.settings().value(QStringLiteral("theme")).toString(), QStringLiteral("dark"));
    QCOMPARE(restartedService.settings().value(QStringLiteral("notificationPeekEnabled")).toBool(), true);
    QCOMPARE(restartedService.settingsRevision(), 0ull);
}


void TestCoreDBus::cleanupTestCase() {
    if (m_bus.isConnected()) {
        m_bus.unregisterService(QStringLiteral("io.github.linuxisland.Core"));
        m_bus.unregisterObject(QStringLiteral("/io/github/linuxisland/Core"));
    }
}

QTEST_MAIN(TestCoreDBus)
#include "tst_core_dbus.moc"
