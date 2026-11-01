#include <QtTest>
#include <QTemporaryDir>
#include <QFile>
#include <QFileInfo>
#include "media/artwork_cache.h"

class TestArtworkCache : public QObject {
    Q_OBJECT

private slots:
    void testLocalFilePassThrough();
    void testEmptyPassThrough();
    void testUrlHashing();
    void testIsRemoteUrl();
    void testCacheHitExistingFile();
    void testCancelPlayer();
    void testPruneCache();
    void cancelInFlightDoesNotCrash();
};

void TestArtworkCache::testLocalFilePassThrough() {
    QTemporaryDir tempDir;
    QVERIFY(tempDir.isValid());
    ArtworkCache cache(tempDir.path());

    QString result;
    bool called = false;
    cache.fetchArtwork(QStringLiteral("player1"), QStringLiteral("file:///home/user/song.png"), [&](const QString &res) {
        called = true;
        result = res;
    });

    QVERIFY(called);
    QCOMPARE(result, QStringLiteral("file:///home/user/song.png"));
}

void TestArtworkCache::testEmptyPassThrough() {
    QTemporaryDir tempDir;
    QVERIFY(tempDir.isValid());
    ArtworkCache cache(tempDir.path());

    QString result = QStringLiteral("not-empty");
    bool called = false;
    cache.fetchArtwork(QStringLiteral("player1"), QString(), [&](const QString &res) {
        called = true;
        result = res;
    });

    QVERIFY(called);
    QCOMPARE(result, QString());
}

void TestArtworkCache::testUrlHashing() {
    QUrl url1(QStringLiteral("https://i.scdn.co/image/ab67616d0000b273"));
    QUrl url2(QStringLiteral("https://i.scdn.co/image/ab67616d0000b273"));
    QUrl url3(QStringLiteral("https://i.scdn.co/image/different"));

    QString hash1 = ArtworkCache::urlToHash(url1);
    QString hash2 = ArtworkCache::urlToHash(url2);
    QString hash3 = ArtworkCache::urlToHash(url3);

    QCOMPARE(hash1.length(), 64);
    QCOMPARE(hash1, hash2);
    QVERIFY(hash1 != hash3);
}

void TestArtworkCache::testIsRemoteUrl() {
    QVERIFY(ArtworkCache::isRemoteUrl(QStringLiteral("https://example.com/art.png")));
    QVERIFY(ArtworkCache::isRemoteUrl(QStringLiteral("http://127.0.0.1:8080/art.jpg")));
    QVERIFY(!ArtworkCache::isRemoteUrl(QStringLiteral("file:///home/user/cover.png")));
    QVERIFY(!ArtworkCache::isRemoteUrl(QStringLiteral("/home/user/cover.png")));
    QVERIFY(!ArtworkCache::isRemoteUrl(QStringLiteral("")));
}

void TestArtworkCache::testCacheHitExistingFile() {
    QTemporaryDir tempDir;
    QVERIFY(tempDir.isValid());
    ArtworkCache cache(tempDir.path());

    QUrl remoteUrl(QStringLiteral("https://example.com/existing.png"));
    QString hash = ArtworkCache::urlToHash(remoteUrl);
    QString cachedFile = tempDir.path() + QLatin1Char('/') + hash + QStringLiteral(".png");

    // Write a dummy file to simulate pre-existing cache
    QFile f(cachedFile);
    QVERIFY(f.open(QIODevice::WriteOnly));
    f.write("DUMMY_ART_DATA");
    f.close();

    QString result;
    bool called = false;
    cache.fetchArtwork(QStringLiteral("spotify"), remoteUrl.toString(), [&](const QString &res) {
        called = true;
        result = res;
    });

    QVERIFY(called);
    QCOMPARE(result, QStringLiteral("file://") + cachedFile);
}

void TestArtworkCache::testCancelPlayer() {
    QTemporaryDir tempDir;
    QVERIFY(tempDir.isValid());
    ArtworkCache cache(tempDir.path());

    // cancelPlayer on unknown player must not crash
    cache.cancelPlayer(QStringLiteral("nonexistent"));
}

void TestArtworkCache::cancelInFlightDoesNotCrash() {
    QTemporaryDir tempDir;
    QVERIFY(tempDir.isValid());
    ArtworkCache cache(tempDir.path());

    bool callbackCalled = false;
    cache.fetchArtwork(QStringLiteral("player1"), QStringLiteral("http://127.0.0.1:1/art.png"), [&](const QString &) {
        callbackCalled = true;
    });

    cache.cancelPlayer(QStringLiteral("player1"));
    cache.cancelPlayer(QStringLiteral("player1"));
    QCoreApplication::processEvents();

    // Destructor with in-flight fetch must not mutate container during iteration
    {
        ArtworkCache scopedCache(tempDir.path());
        scopedCache.fetchArtwork(QStringLiteral("player2"), QStringLiteral("http://127.0.0.1:1/art2.png"), [&](const QString &) {});
    }
    QCoreApplication::processEvents();
}

void TestArtworkCache::testPruneCache() {
    QTemporaryDir tempDir;
    QVERIFY(tempDir.isValid());
    ArtworkCache cache(tempDir.path());

    // Create 3 files in cache
    QString file1 = tempDir.path() + QStringLiteral("/1.art");
    QString file2 = tempDir.path() + QStringLiteral("/2.art");
    QFile f1(file1);
    QVERIFY(f1.open(QIODevice::WriteOnly));
    f1.write("art1");
    f1.close();

    QFile f2(file2);
    QVERIFY(f2.open(QIODevice::WriteOnly));
    f2.write("art2");
    f2.close();

    QVERIFY(QFile::exists(file1));
    QVERIFY(QFile::exists(file2));
}

QTEST_MAIN(TestArtworkCache)
#include "tst_artwork_cache.moc"
