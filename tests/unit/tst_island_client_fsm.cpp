#include <limits>
#include <QtTest>
#include "../../island-ui/island_client.h"
#include "../../island-ui/notification_watcher.h"

class TestIslandClientFsm : public QObject {
    Q_OBJECT

private slots:
    void testStateTransitions();
    void testFormatTime();
    void testIsWhatsAppSource();
    void testClampVolume();
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
    QCOMPARE(IslandClient::transitionState(QStringLiteral("PEEK"), QStringLiteral("CLICK")), QStringLiteral("EXPANDED"));
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

QTEST_MAIN(TestIslandClientFsm)
#include "tst_island_client_fsm.moc"
