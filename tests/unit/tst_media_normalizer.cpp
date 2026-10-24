#include <QtTest>
#include "media/media_state.h"
#include "media/media_normalizer.h"

class TestMediaNormalizer : public QObject {
    Q_OBJECT

private slots:
    void testNoPlayer();
    void testEmptyTitle();
    void testUnicodeArtistArray();
    void testNegativeLengthClamped();
    void testHugeStringTruncated();
    void testWrongVariantTypes();
    void testInvalidPlaybackStatus();
    void testAlbumArtUriFiltering();
    void testRateValidation();
    void testCapabilitiesFlags();
};

void TestMediaNormalizer::testNoPlayer() {
    MediaState s = normalizeMpris(QString(), {}, {});
    QCOMPARE(s.playerId, QString());
    QCOMPARE(s.title, QString());
    QCOMPARE(s.artist, QString());
    QCOMPARE(s.playbackStatus, QStringLiteral("Stopped"));
    QCOMPARE(s.durationUs, 0);
    QCOMPARE(s.canPlay, false);
}

void TestMediaNormalizer::testEmptyTitle() {
    QVariantMap meta = {{QStringLiteral("xesam:title"), QStringLiteral("")}};
    QVariantMap props = {{QStringLiteral("PlaybackStatus"), QStringLiteral("Playing")}};
    MediaState s = normalizeMpris(QStringLiteral("org.mpris.MediaPlayer2.vlc"), meta, props);
    QCOMPARE(s.playerId, QStringLiteral("org.mpris.MediaPlayer2.vlc"));
    QCOMPARE(s.title, QStringLiteral(""));
    QCOMPARE(s.playbackStatus, QStringLiteral("Playing"));
}

void TestMediaNormalizer::testUnicodeArtistArray() {
    QStringList artists = {QStringLiteral("Ёлка"), QStringLiteral("佐々木 恵梨")};
    QVariantMap meta = {
        {QStringLiteral("xesam:title"), QStringLiteral("Campfire")},
        {QStringLiteral("xesam:artist"), artists}
    };
    MediaState s = normalizeMpris(QStringLiteral("org.mpris.MediaPlayer2.spotify"), meta, {});
    QCOMPARE(s.title, QStringLiteral("Campfire"));
    QCOMPARE(s.artist, QStringLiteral("Ёлка, 佐々木 恵梨"));
}

void TestMediaNormalizer::testNegativeLengthClamped() {
    QVariantMap meta = {
        {QStringLiteral("mpris:length"), -12345LL}
    };
    QVariantMap props = {
        {QStringLiteral("Position"), -500LL}
    };
    MediaState s = normalizeMpris(QStringLiteral("org.mpris.MediaPlayer2.test"), meta, props);
    QCOMPARE(s.durationUs, 0);
    QCOMPARE(s.positionUs, 0);
}

void TestMediaNormalizer::testHugeStringTruncated() {
    QString huge(5000, 'A');
    QVariantMap meta = {
        {QStringLiteral("xesam:title"), huge},
        {QStringLiteral("xesam:artist"), huge}
    };
    MediaState s = normalizeMpris(QStringLiteral("org.mpris.MediaPlayer2.test"), meta, {});
    QVERIFY(s.title.toUtf8().size() <= 2048);
    QVERIFY(s.artist.toUtf8().size() <= 2048);
}

void TestMediaNormalizer::testWrongVariantTypes() {
    QVariantMap meta = {
        {QStringLiteral("xesam:title"), 12345},
        {QStringLiteral("xesam:artist"), true},
        {QStringLiteral("mpris:length"), QStringLiteral("not_a_number")}
    };
    MediaState s = normalizeMpris(QStringLiteral("org.mpris.MediaPlayer2.test"), meta, {});
    QCOMPARE(s.title, QString());
    QCOMPARE(s.artist, QString());
    QCOMPARE(s.durationUs, 0);
}

void TestMediaNormalizer::testInvalidPlaybackStatus() {
    QVariantMap props = {
        {QStringLiteral("PlaybackStatus"), QStringLiteral("Exploding")}
    };
    MediaState s = normalizeMpris(QStringLiteral("org.mpris.MediaPlayer2.test"), {}, props);
    QCOMPARE(s.playbackStatus, QStringLiteral("Stopped"));
}

void TestMediaNormalizer::testAlbumArtUriFiltering() {
    // HTTP/HTTPS rejected in v0.1
    QVariantMap metaHttp = {
        {QStringLiteral("mpris:artUrl"), QStringLiteral("https://example.com/art.png")}
    };
    MediaState s1 = normalizeMpris(QStringLiteral("org.mpris.MediaPlayer2.test"), metaHttp, {});
    QCOMPARE(s1.albumArtUri, QString());

    // Valid file:// accepted
    QVariantMap metaFile = {
        {QStringLiteral("mpris:artUrl"), QStringLiteral("file:///home/user/cover.jpg")}
    };
    MediaState s2 = normalizeMpris(QStringLiteral("org.mpris.MediaPlayer2.test"), metaFile, {});
    QCOMPARE(s2.albumArtUri, QStringLiteral("file:///home/user/cover.jpg"));
}

void TestMediaNormalizer::testRateValidation() {
    QVariantMap propsZero = {{QStringLiteral("Rate"), 0.0}};
    MediaState s1 = normalizeMpris(QStringLiteral("org.mpris.MediaPlayer2.test"), {}, propsZero);
    QCOMPARE(s1.rate, 1.0);

    QVariantMap propsNeg = {{QStringLiteral("Rate"), -2.5}};
    MediaState s2 = normalizeMpris(QStringLiteral("org.mpris.MediaPlayer2.test"), {}, propsNeg);
    QCOMPARE(s2.rate, 1.0);

    QVariantMap propsValid = {{QStringLiteral("Rate"), 1.5}};
    MediaState s3 = normalizeMpris(QStringLiteral("org.mpris.MediaPlayer2.test"), {}, propsValid);
    QCOMPARE(s3.rate, 1.5);
}

void TestMediaNormalizer::testCapabilitiesFlags() {
    QVariantMap props = {
        {QStringLiteral("CanPlay"), true},
        {QStringLiteral("CanPause"), true},
        {QStringLiteral("CanGoNext"), false},
        {QStringLiteral("CanGoPrevious"), true},
        {QStringLiteral("CanSeek"), true}
    };
    MediaState s = normalizeMpris(QStringLiteral("org.mpris.MediaPlayer2.test"), {}, props);
    QCOMPARE(s.canPlay, true);
    QCOMPARE(s.canPause, true);
    QCOMPARE(s.canNext, false);
    QCOMPARE(s.canPrevious, true);
    QCOMPARE(s.canSeek, true);
}

QTEST_MAIN(TestMediaNormalizer)
#include "tst_media_normalizer.moc"
