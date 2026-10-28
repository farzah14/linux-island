#include <QtTest>
#include <QDBusObjectPath>
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
    void testVolumeValidation();
    void testTrackIdExtraction();
    void testCanSeekFallback();
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
    // HTTPS accepted
    QVariantMap metaHttps = {
        {QStringLiteral("mpris:artUrl"), QStringLiteral("https://example.com/art.png")}
    };
    MediaState s1 = normalizeMpris(QStringLiteral("org.mpris.MediaPlayer2.test"), metaHttps, {});
    QCOMPARE(s1.albumArtUri, QStringLiteral("https://example.com/art.png"));

    // HTTP accepted
    QVariantMap metaHttp = {
        {QStringLiteral("mpris:artUrl"), QStringLiteral("http://127.0.0.1:8080/art.jpg")}
    };
    MediaState sHttp = normalizeMpris(QStringLiteral("org.mpris.MediaPlayer2.test"), metaHttp, {});
    QCOMPARE(sHttp.albumArtUri, QStringLiteral("http://127.0.0.1:8080/art.jpg"));

    // Valid file:// accepted
    QVariantMap metaFile = {
        {QStringLiteral("mpris:artUrl"), QStringLiteral("file:///home/user/cover.jpg")}
    };
    MediaState s2 = normalizeMpris(QStringLiteral("org.mpris.MediaPlayer2.test"), metaFile, {});
    QCOMPARE(s2.albumArtUri, QStringLiteral("file:///home/user/cover.jpg"));

    // Dangerous/invalid schemes rejected
    QVariantMap metaBad = {
        {QStringLiteral("mpris:artUrl"), QStringLiteral("javascript:alert(1)")}
    };
    MediaState s3 = normalizeMpris(QStringLiteral("org.mpris.MediaPlayer2.test"), metaBad, {});
    QCOMPARE(s3.albumArtUri, QString());
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

void TestMediaNormalizer::testVolumeValidation() {
    QVariantMap props = {{QStringLiteral("Volume"), 0.75}};
    MediaState s = normalizeMpris(QStringLiteral("org.mpris.MediaPlayer2.test"), {}, props);
    QCOMPARE(s.volume, 0.75);

    QVariantMap propsHigh = {{QStringLiteral("Volume"), 1.8}};
    MediaState sHigh = normalizeMpris(QStringLiteral("org.mpris.MediaPlayer2.test"), {}, propsHigh);
    QCOMPARE(sHigh.volume, 1.0);

    QVariantMap propsLow = {{QStringLiteral("Volume"), -0.2}};
    MediaState sLow = normalizeMpris(QStringLiteral("org.mpris.MediaPlayer2.test"), {}, propsLow);
    QCOMPARE(sLow.volume, 0.0);
}

void TestMediaNormalizer::testTrackIdExtraction() {
    QVariantMap meta = {
        {QStringLiteral("mpris:trackid"), QVariant::fromValue(QDBusObjectPath(QStringLiteral("/org/mpris/MediaPlayer2/TrackList/123")))}
    };
    MediaState s = normalizeMpris(QStringLiteral("org.mpris.MediaPlayer2.test"), meta, {});
    QCOMPARE(s.trackId, QStringLiteral("/org/mpris/MediaPlayer2/TrackList/123"));
}

void TestMediaNormalizer::testCanSeekFallback() {
    // When CanSeek is omitted, but duration is positive, fallback to true
    QVariantMap meta = {{QStringLiteral("mpris:length"), 120000000LL}};
    MediaState s1 = normalizeMpris(QStringLiteral("org.mpris.MediaPlayer2.test"), meta, {});
    QCOMPARE(s1.canSeek, true);

    // When CanSeek is explicitly false, respect it even if duration is positive
    QVariantMap props = {{QStringLiteral("CanSeek"), false}};
    MediaState s2 = normalizeMpris(QStringLiteral("org.mpris.MediaPlayer2.test"), meta, props);
    QCOMPARE(s2.canSeek, false);
}

QTEST_MAIN(TestMediaNormalizer)
#include "tst_media_normalizer.moc"
