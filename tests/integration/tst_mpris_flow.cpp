#include <QtTest>
#include <QDBusConnection>
#include <QSignalSpy>
#include "media/player_registry.h"
#include "fake_mpris_player.h"

class TestMprisFlow : public QObject {
    Q_OBJECT

private slots:
    void initTestCase();
    void testDiscoveryAndMetadata();
    void testPlayerExitCleansState();
    void testMultiplePlayersPreference();
    void testSeekUpdatesPosition();
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
