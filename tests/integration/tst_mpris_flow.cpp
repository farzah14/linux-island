#include <QtTest>
#include <QDBusConnection>
#include <QDBusMessage>
#include <QSignalSpy>
#include "media/player_registry.h"
#include "media/mpris_controller.h"
#include "fake_mpris_player.h"
#include <chrono>

class TestMprisFlow : public QObject {
    Q_OBJECT

private slots:
    void initTestCase();
    void testDiscoveryAndMetadata();
    void testPlayerExitCleansState();
    void testMultiplePlayersPreference();
    void testSeekUpdatesPosition();
    void testMprisControllerSeeking();
    void testPositionPreservedAcrossPartialGetAll();
};

void TestMprisFlow::initTestCase() {
    QVERIFY2(QDBusConnection::sessionBus().isConnected(), "Session bus must be connected");
}

void TestMprisFlow::testSeekUpdatesPosition() {
    PlayerRegistry registry;
    FakeMprisPlayer fake(QStringLiteral("org.mpris.MediaPlayer2.LinuxIslandTimeline"));
    QVERIFY(fake.start());
    QTRY_COMPARE_WITH_TIMEOUT(registry.activeMediaState().positionUs, 1000000, 2000);
    QVERIFY(registry.activeMediaState().positionSampleUs > 0);
    const auto sampled = registry.activeMediaState().positionSampleUs;
    registry.refreshPosition();
    QTRY_VERIFY_WITH_TIMEOUT(registry.activeMediaState().positionSampleUs > sampled, 2000);
    fake.seekTo(42000000);
    QTRY_COMPARE_WITH_TIMEOUT(registry.activeMediaState().positionUs, 42000000, 2000);
    fake.seekTo(-100);
    QTRY_COMPARE_WITH_TIMEOUT(registry.activeMediaState().positionUs, 0, 2000);
    fake.stop();
}

void TestMprisFlow::testMprisControllerSeeking() {
    PlayerRegistry registry;
    FakeMprisPlayer fake(QStringLiteral("org.mpris.MediaPlayer2.LinuxIslandSeeker"));
    QVERIFY(fake.start());
    QTRY_COMPARE_WITH_TIMEOUT(registry.activeMediaState().positionUs, 1000000, 2000);
    MprisController controller(QDBusConnection::sessionBus());

    // 1. SeekTo absolute position
    auto res = controller.perform(QStringLiteral("SeekTo:30000000"), fake.serviceName(), registry.activeMediaState());
    QVERIFY(res.accepted);
    QTRY_COMPARE_WITH_TIMEOUT(registry.activeMediaState().positionUs, 30000000, 2000);

    // 2. SeekForward +10s
    res = controller.perform(QStringLiteral("SeekForward"), fake.serviceName(), registry.activeMediaState());
    QVERIFY(res.accepted);
    QTRY_COMPARE_WITH_TIMEOUT(registry.activeMediaState().positionUs, 40000000, 2000);

    // 3. SeekBackward -10s
    res = controller.perform(QStringLiteral("SeekBackward"), fake.serviceName(), registry.activeMediaState());
    QVERIFY(res.accepted);
    QTRY_COMPARE_WITH_TIMEOUT(registry.activeMediaState().positionUs, 30000000, 2000);

    // 4. SeekTo without valid trackId uses real-time estimated offset
    MediaState stateNoTrack = registry.activeMediaState();
    stateNoTrack.trackId = QString();
    stateNoTrack.playbackStatus = QStringLiteral("Playing");
    stateNoTrack.positionSampleUs = std::chrono::duration_cast<std::chrono::microseconds>(
        std::chrono::steady_clock::now().time_since_epoch()).count() - 5000000;
    res = controller.perform(QStringLiteral("SeekTo:50000000"), fake.serviceName(), stateNoTrack);
    QVERIFY(res.accepted);
    QTRY_VERIFY_WITH_TIMEOUT(qAbs(registry.activeMediaState().positionUs - 45000000) < 50000, 2000);

    // 5. Malformed SeekTo or Volume values rejected with accepted == false
    res = controller.perform(QStringLiteral("SeekTo:notanumber"), fake.serviceName(), registry.activeMediaState());
    QVERIFY(!res.accepted);
    res = controller.perform(QStringLiteral("SeekTo:-500"), fake.serviceName(), registry.activeMediaState());
    QVERIFY(!res.accepted);
    res = controller.perform(QStringLiteral("Volume:abc"), fake.serviceName(), registry.activeMediaState());
    QVERIFY(!res.accepted);

    fake.stop();
}

void TestMprisFlow::testPositionPreservedAcrossPartialGetAll() {
    PlayerRegistry registry;
    FakeMprisPlayer fake(QStringLiteral("org.mpris.MediaPlayer2.LinuxIslandPosition"));
    QVERIFY(fake.start());

    QTRY_VERIFY_WITH_TIMEOUT(registry.activePlayerId() == QStringLiteral("org.mpris.MediaPlayer2.LinuxIslandPosition"), 2000);
    QTRY_VERIFY_WITH_TIMEOUT(registry.activeMediaState().title == QStringLiteral("Fake Title"), 2000);

    // Advance the fake position, then trigger a Seeked signal so the registry
    // caches a non-zero Position.
    fake.seekTo(42000000);
    QTRY_COMPARE_WITH_TIMEOUT(registry.activeMediaState().positionUs, 42000000, 2000);

    // A PropertiesChanged for a non-position property on the same track must
    // not reset the cached Position back to 0:00.
    QVariantMap changed;
    changed[QStringLiteral("Rate")] = 1.0;
    QDBusMessage sig = QDBusMessage::createSignal(
        QStringLiteral("/org/mpris/MediaPlayer2"),
        QStringLiteral("org.freedesktop.DBus.Properties"),
        QStringLiteral("PropertiesChanged"));
    sig << QStringLiteral("org.mpris.MediaPlayer2.Player") << changed << QStringList();
    QDBusConnection::sessionBus().send(sig);

    QTest::qWait(300);
    QVERIFY2(registry.activeMediaState().positionUs >= 42000000,
             "Partial PropertiesChanged must preserve the cached Position");

    fake.stop();
}

void TestMprisFlow::testDiscoveryAndMetadata() {
    PlayerRegistry registry;
    QSignalSpy playerSpy(&registry, &PlayerRegistry::activePlayerChanged);
    QSignalSpy mediaSpy(&registry, &PlayerRegistry::mediaStateChanged);

    FakeMprisPlayer fake(QStringLiteral("org.mpris.MediaPlayer2.LinuxIslandFake"));
    QVERIFY(fake.start());

    // Give D-Bus loop time to notify
    QTRY_VERIFY_WITH_TIMEOUT(!registry.activePlayerId().isEmpty(), 2000);
    QCOMPARE(registry.activePlayerId(), QStringLiteral("org.mpris.MediaPlayer2.LinuxIslandFake"));

    QTRY_VERIFY_WITH_TIMEOUT(!registry.activeMediaState().title.isEmpty(), 2000);
    MediaState state = registry.activeMediaState();
    QCOMPARE(state.playerId, QStringLiteral("org.mpris.MediaPlayer2.LinuxIslandFake"));
    QCOMPARE(state.title, QStringLiteral("Fake Title"));
    QCOMPARE(state.artist, QStringLiteral("Fake Artist"));
    QCOMPARE(state.playbackStatus, QStringLiteral("Playing"));

    // Update metadata
    QVariantMap newMeta;
    newMeta[QStringLiteral("xesam:title")] = QStringLiteral("Updated Song");
    newMeta[QStringLiteral("xesam:artist")] = QStringList{QStringLiteral("New Artist")};
    fake.setMetadata(newMeta);

    QTRY_COMPARE_WITH_TIMEOUT(registry.activeMediaState().title, QStringLiteral("Updated Song"), 2000);
    QCOMPARE(registry.activeMediaState().artist, QStringLiteral("New Artist"));

    fake.stop();
}

void TestMprisFlow::testPlayerExitCleansState() {
    PlayerRegistry registry;

    FakeMprisPlayer fake(QStringLiteral("org.mpris.MediaPlayer2.LinuxIslandFakeExit"));
    QVERIFY(fake.start());

    QTRY_COMPARE_WITH_TIMEOUT(registry.activePlayerId(),
                              QStringLiteral("org.mpris.MediaPlayer2.LinuxIslandFakeExit"), 2000);

    // Stop player
    fake.stop();

    QTRY_VERIFY_WITH_TIMEOUT(registry.activePlayerId().isEmpty(), 2000);
    MediaState state = registry.activeMediaState();
    QCOMPARE(state.playbackStatus, QStringLiteral("Stopped"));
    QCOMPARE(state.playerId, QString());
}

void TestMprisFlow::testMultiplePlayersPreference() {
    PlayerRegistry registry;

    FakeMprisPlayer player1(QStringLiteral("org.mpris.MediaPlayer2.player1"));
    FakeMprisPlayer player2(QStringLiteral("org.mpris.MediaPlayer2.player2"));

    QVERIFY(player1.start());
    QVERIFY(player2.start());

    QTRY_VERIFY_WITH_TIMEOUT(registry.availablePlayers().size() >= 2, 2000);

    // Set preference to player2
    registry.setPreferredPlayerId(QStringLiteral("org.mpris.MediaPlayer2.player2"));
    QCOMPARE(registry.activePlayerId(), QStringLiteral("org.mpris.MediaPlayer2.player2"));

    // Set override to player1
    QVERIFY(registry.setActivePlayer(QStringLiteral("org.mpris.MediaPlayer2.player1")));
    QCOMPARE(registry.activePlayerId(), QStringLiteral("org.mpris.MediaPlayer2.player1"));

    player1.stop();
    player2.stop();
}

QTEST_MAIN(TestMprisFlow)
#include "tst_mpris_flow.moc"
