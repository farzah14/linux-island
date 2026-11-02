#include <limits>
#include <QtTest>
#include "../../island-ui/island_client.h"
#include "../../island-ui/notification_watcher.h"
#include "../../island-ui/display_surface_manager.h"

class TestIslandClientFsm : public QObject {
    Q_OBJECT

private slots:
    void testStateTransitions();
    void testFormatTime();
    void testIsWhatsAppSource();
    void testClampVolume();
    void testCoreStatusConnectedMapping();
    void testFullscreenJsonParsing();
    void testDisplaySurfaceManagerGeometry();
    void testVolumeSetAndMute();
};

void TestIslandClientFsm::testStateTransitions() {
    // COMPACT transitions
    QCOMPARE(IslandClient::transitionState(QStringLiteral("COMPACT"), QStringLiteral("HOVER_ENTER")), QStringLiteral("PREVIEW"));
    QCOMPARE(IslandClient::transitionState(QStringLiteral("COMPACT"), QStringLiteral("CLICK")), QStringLiteral("EXPANDED"));
    QCOMPARE(IslandClient::transitionState(QStringLiteral("COMPACT"), QStringLiteral("PEEK_REQUEST")), QStringLiteral("PEEK"));
    QCOMPARE(IslandClient::transitionState(QStringLiteral("COMPACT"), QStringLiteral("FULLSCREEN_ON")), QStringLiteral("HIDDEN"));

    // PREVIEW transitions
    QCOMPARE(IslandClient::transitionState(QStringLiteral("PREVIEW"), QStringLiteral("HOVER_LEAVE")), QStringLiteral("COMPACT"));
    QCOMPARE(IslandClient::transitionState(QStringLiteral("PREVIEW"), QStringLiteral("CLICK")), QStringLiteral("EXPANDED"));
    QCOMPARE(IslandClient::transitionState(QStringLiteral("PREVIEW"), QStringLiteral("FULLSCREEN_ON")), QStringLiteral("HIDDEN"));

    // EXPANDED transitions
    QCOMPARE(IslandClient::transitionState(QStringLiteral("EXPANDED"), QStringLiteral("DISMISS")), QStringLiteral("COMPACT"));
    QCOMPARE(IslandClient::transitionState(QStringLiteral("EXPANDED"), QStringLiteral("FULLSCREEN_ON")), QStringLiteral("HIDDEN"));

    // PEEK transitions
    QCOMPARE(IslandClient::transitionState(QStringLiteral("PEEK"), QStringLiteral("PEEK_TIMEOUT")), QStringLiteral("COMPACT"));
    QCOMPARE(IslandClient::transitionState(QStringLiteral("PEEK"), QStringLiteral("CLICK")), QStringLiteral("PEEK"));
    QCOMPARE(IslandClient::transitionState(QStringLiteral("PEEK"), QStringLiteral("FULLSCREEN_ON")), QStringLiteral("HIDDEN"));

    // HIDDEN transitions
    QCOMPARE(IslandClient::transitionState(QStringLiteral("HIDDEN"), QStringLiteral("FULLSCREEN_OFF")), QStringLiteral("COMPACT"));
    QCOMPARE(IslandClient::transitionState(QStringLiteral("HIDDEN"), QStringLiteral("CLICK")), QStringLiteral("HIDDEN"));

    // Unrelated event leaves state unchanged
    QCOMPARE(IslandClient::transitionState(QStringLiteral("COMPACT"), QStringLiteral("UNKNOWN_EVENT")), QStringLiteral("COMPACT"));
}

void TestIslandClientFsm::testFormatTime() {
    QCOMPARE(IslandClient::formatTime(0), QStringLiteral("0:00"));
    QCOMPARE(IslandClient::formatTime(5000000), QStringLiteral("0:05"));
    QCOMPARE(IslandClient::formatTime(65000000), QStringLiteral("1:05"));
    QCOMPARE(IslandClient::formatTime(3600000000), QStringLiteral("60:00"));
}

void TestIslandClientFsm::testClampVolume() {
    QCOMPARE(IslandClient::clampVolume(0.75), 0.75);
    QCOMPARE(IslandClient::clampVolume(1.8), 1.0);
    QCOMPARE(IslandClient::clampVolume(-0.2), 0.0);
    QCOMPARE(IslandClient::clampVolume(std::numeric_limits<double>::quiet_NaN()), 1.0);
}

void TestIslandClientFsm::testIsWhatsAppSource() {
    QVERIFY(NotificationWatcher::isWhatsAppSource(QStringLiteral("WhatsApp"), QStringLiteral("whatsapp.desktop")));
    QVERIFY(NotificationWatcher::isWhatsAppSource(QStringLiteral("WhatsApp for Linux"), QStringLiteral("io.github.alexpose.whatsappforlinux.desktop")));
    QVERIFY(NotificationWatcher::isWhatsAppSource(QStringLiteral("com.whatsapp.whatsapp"), QStringLiteral("")));
    QVERIFY(!NotificationWatcher::isWhatsAppSource(QStringLiteral("Spotify"), QStringLiteral("spotify.desktop")));
    QVERIFY(!NotificationWatcher::isWhatsAppSource(QStringLiteral("Firefox"), QStringLiteral("firefox.desktop")));
}

void TestIslandClientFsm::testCoreStatusConnectedMapping() {
    IslandClient client;

    // Core emits "ready" on startup and "active" while it owns the bus name.
    // Both must count as connected; only a real loss of ownership is false.
    QMetaObject::invokeMethod(&client, "onCoreStatusChanged",
                              Qt::DirectConnection, Q_ARG(QString, QStringLiteral("ready")));
    QVERIFY2(client.connected(), "status 'ready' must mark the client connected");
    QMetaObject::invokeMethod(&client, "onCoreStatusChanged",
                              Qt::DirectConnection, Q_ARG(QString, QStringLiteral("active")));
    QVERIFY2(client.connected(), "status 'active' must keep the client connected");

    // Simulate active media
    QVariantMap media;
    media[QStringLiteral("playerId")] = QStringLiteral("spotify");
    media[QStringLiteral("title")] = QStringLiteral("Test Song");
    media[QStringLiteral("canSeek")] = true;
    media[QStringLiteral("canPlay")] = true;
    QMetaObject::invokeMethod(&client, "onMediaChanged",
                              Qt::DirectConnection, Q_ARG(quint64, 1), Q_ARG(QVariantMap, media));
    QCOMPARE(client.title(), QStringLiteral("Test Song"));
    QVERIFY(client.canSeek());
    QVERIFY(client.canPlayPause());

    QMetaObject::invokeMethod(&client, "onCoreStatusChanged",
                              Qt::DirectConnection, Q_ARG(QString, QStringLiteral("stopping")));
    QVERIFY2(!client.connected(), "status 'stopping' must mark the client disconnected");
    QVERIFY2(client.title().isEmpty(), "stopping must clear title");
    QVERIFY2(!client.canSeek(), "stopping must disable seek");
    QVERIFY2(!client.canPlayPause(), "stopping must disable playback controls");
}

void TestIslandClientFsm::testFullscreenJsonParsing() {
    // Hyprland reports fullscreen as a JSON bool on some versions and as an
    // integer (0/1/2) on others. QJsonValue::toBool() returns false for every
    // number, which silently broke fullscreen hiding.
    QVERIFY(DisplaySurfaceManager::parseHyprlandFullscreen(R"({"fullscreen": true})"));
    QVERIFY(DisplaySurfaceManager::parseHyprlandFullscreen(R"({"fullscreen": 1})"));
    QVERIFY(DisplaySurfaceManager::parseHyprlandFullscreen(R"({"fullscreen": 2})"));
    QVERIFY(!DisplaySurfaceManager::parseHyprlandFullscreen(R"({"fullscreen": false})"));
    QVERIFY(!DisplaySurfaceManager::parseHyprlandFullscreen(R"({"fullscreen": 0})"));
    QVERIFY(!DisplaySurfaceManager::parseHyprlandFullscreen(R"({"title": "x"})"));
    QVERIFY(!DisplaySurfaceManager::parseHyprlandFullscreen("not json"));

    // Sway: only the focused container may hide the island. A fullscreen
    // window on an inactive workspace must not count.
    const QByteArray swayInactive = R"({
        "fullscreen_mode": 0, "focused": false,
        "nodes": [
            {"fullscreen_mode": 1, "focused": false, "nodes": []},
            {"fullscreen_mode": 0, "focused": true, "nodes": []}
        ]
    })";
    QVERIFY(!DisplaySurfaceManager::parseSwayFullscreen(swayInactive));

    const QByteArray swayActive = R"({
        "fullscreen_mode": 0, "focused": false,
        "nodes": [
            {"fullscreen_mode": 1, "focused": true, "nodes": []}
        ]
    })";
    QVERIFY(DisplaySurfaceManager::parseSwayFullscreen(swayActive));

    const QByteArray swayNested = R"({
        "fullscreen_mode": 0, "focused": false,
        "nodes": [
            {"fullscreen_mode": 0, "focused": false, "nodes": [
                {"fullscreen_mode": 2, "focused": true, "nodes": []}
            ]}
        ]
    })";
    QVERIFY(DisplaySurfaceManager::parseSwayFullscreen(swayNested));
    QVERIFY(!DisplaySurfaceManager::parseSwayFullscreen("{}"));
}

void TestIslandClientFsm::testDisplaySurfaceManagerGeometry() {
    DisplaySurfaceManager mgr(nullptr, nullptr);
    QCOMPARE(mgr.windowWidth(), 440);
    QCOMPARE(mgr.windowHeight(), 360);
    // Contract dimensions (medium 328x148, large 388x174) must fit within window bounds
    QVERIFY(328 <= mgr.windowWidth());
    QVERIFY(148 <= mgr.windowHeight());
    QVERIFY(388 <= mgr.windowWidth());
}

void TestIslandClientFsm::testVolumeSetAndMute() {
    IslandClient client;
    QCOMPARE(client.volume(), 1.0);

    client.setVolume(0.65);
    QCOMPARE(client.volume(), 0.65);

    // Mute: volume to 0.0
    client.setVolume(0.0);
    QCOMPARE(client.volume(), 0.0);

    // Over-range clamping
    client.setVolume(1.5);
    QCOMPARE(client.volume(), 1.0);

    // Under-range clamping
    client.setVolume(-0.5);
    QCOMPARE(client.volume(), 0.0);
}

QTEST_MAIN(TestIslandClientFsm)
#include "tst_island_client_fsm.moc"
