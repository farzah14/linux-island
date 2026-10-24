#include <QtTest>
#include "media/player_registry.h"

class TestPlayerSelection : public QObject {
    Q_OBJECT

private slots:
    void testEmptyList();
    void testSinglePlayer();
    void testPreferredIdInList();
    void testPreferredMissingMultiplePlaying();
    void testNonePlayingLexicographical();
    void testPreferredPlayerInactiveStillChosen();
};

void TestPlayerSelection::testEmptyList() {
    QList<PlayerSummary> players;
    QCOMPARE(chooseActivePlayer(players, QStringLiteral("spotify")), QString());
    QCOMPARE(chooseActivePlayer(players, QString()), QString());
}

void TestPlayerSelection::testSinglePlayer() {
    QList<PlayerSummary> players = {
        {QStringLiteral("org.mpris.MediaPlayer2.vlc"), QStringLiteral("Paused")}
    };
    QCOMPARE(chooseActivePlayer(players, QString()), QStringLiteral("org.mpris.MediaPlayer2.vlc"));
}

void TestPlayerSelection::testPreferredIdInList() {
    QList<PlayerSummary> players = {
        {QStringLiteral("org.mpris.MediaPlayer2.vlc"), QStringLiteral("Playing")},
        {QStringLiteral("org.mpris.MediaPlayer2.spotify"), QStringLiteral("Paused")}
    };
    // Preferred ID present -> preferred wins
    QCOMPARE(chooseActivePlayer(players, QStringLiteral("org.mpris.MediaPlayer2.spotify")),
             QStringLiteral("org.mpris.MediaPlayer2.spotify"));
}

void TestPlayerSelection::testPreferredMissingMultiplePlaying() {
    QList<PlayerSummary> players = {
        {QStringLiteral("org.mpris.MediaPlayer2.vlc"), QStringLiteral("Playing")},
        {QStringLiteral("org.mpris.MediaPlayer2.audacious"), QStringLiteral("Playing")},
        {QStringLiteral("org.mpris.MediaPlayer2.rhythmbox"), QStringLiteral("Paused")}
    };
    // Preferred ID missing, two playing -> first playing ordered by service name (audacious < vlc)
    QCOMPARE(chooseActivePlayer(players, QStringLiteral("org.mpris.MediaPlayer2.nonexistent")),
             QStringLiteral("org.mpris.MediaPlayer2.audacious"));
}

void TestPlayerSelection::testNonePlayingLexicographical() {
    QList<PlayerSummary> players = {
        {QStringLiteral("org.mpris.MediaPlayer2.vlc"), QStringLiteral("Paused")},
        {QStringLiteral("org.mpris.MediaPlayer2.amberol"), QStringLiteral("Stopped")},
        {QStringLiteral("org.mpris.MediaPlayer2.rhythmbox"), QStringLiteral("Paused")}
    };
    // None playing, no preferred -> lexicographically first service name (amberol < rhythmbox < vlc)
    QCOMPARE(chooseActivePlayer(players, QString()),
             QStringLiteral("org.mpris.MediaPlayer2.amberol"));
}

void TestPlayerSelection::testPreferredPlayerInactiveStillChosen() {
    QList<PlayerSummary> players = {
        {QStringLiteral("org.mpris.MediaPlayer2.vlc"), QStringLiteral("Playing")},
        {QStringLiteral("org.mpris.MediaPlayer2.spotify"), QStringLiteral("Stopped")}
    };
    // User preferred player has priority when available
    QCOMPARE(chooseActivePlayer(players, QStringLiteral("org.mpris.MediaPlayer2.spotify")),
             QStringLiteral("org.mpris.MediaPlayer2.spotify"));
}

QTEST_MAIN(TestPlayerSelection)
#include "tst_player_selection.moc"
