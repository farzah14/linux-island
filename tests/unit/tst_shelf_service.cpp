#include <QtTest>
#include <QDir>
#include <QFile>
#include <QTemporaryDir>
#include <QUrl>
#include "shelf/shelf_service.h"

class TestShelfService : public QObject {
    Q_OBJECT

private slots:
    void testAddAndMetadata();
    void testValidationRejectsInvalidInputs();
    void testDeduplicationAndFifoCapacity();
    void testRemoveClearAndPersistencePruning();
};

namespace {

QString createFile(const QTemporaryDir &dir, const QString &name, const QByteArray &data = "hello") {
    const QString path = dir.filePath(name);
    QFile f(path);
    if (!f.open(QIODevice::WriteOnly)) return {};
    f.write(data);
    f.close();
    return path;
}

} // namespace

void TestShelfService::testAddAndMetadata() {
    QTemporaryDir dir;
    QVERIFY(dir.isValid());
    const QString filePath = createFile(dir, QStringLiteral("notes.txt"), "sample text");
    QVERIFY(!filePath.isEmpty());
    QVERIFY(QDir(dir.path()).mkdir(QStringLiteral("docs")));

    ShelfService svc(dir.filePath(QStringLiteral("shelf.json")));
    svc.setClock([]() { return qint64(1700000000000LL); });

    QSignalSpy spy(&svc, &ShelfService::changed);
    QString err;
    QVERIFY2(svc.addFiles({QUrl::fromLocalFile(filePath).toString(), dir.filePath(QStringLiteral("docs"))}, &err),
             qPrintable(err));
    QCOMPARE(spy.count(), 1);
    QCOMPARE(svc.count(), 2);

    const ShelfSnapshot snap = svc.snapshot();
    QCOMPARE(snap.maxItems, 12);
    QCOMPARE(snap.items.size(), 2);
    QCOMPARE(snap.items[0].name, QStringLiteral("notes.txt"));
    QCOMPARE(snap.items[0].isDir, false);
    QCOMPARE(snap.items[0].sizeBytes, 11);
    QCOMPARE(snap.items[0].sizeText, QStringLiteral("11 B"));
    QCOMPARE(snap.items[0].addedAtMs, 1700000000000LL);
    QCOMPARE(snap.items[1].name, QStringLiteral("docs"));
    QCOMPARE(snap.items[1].isDir, true);
    QCOMPARE(snap.items[1].sizeText, QStringLiteral("Folder"));
}

void TestShelfService::testValidationRejectsInvalidInputs() {
    QTemporaryDir dir;
    QVERIFY(dir.isValid());
    const QString realPath = createFile(dir, QStringLiteral("valid.txt"));

    ShelfService svc(dir.filePath(QStringLiteral("shelf.json")));
    QString err;

    QVERIFY(!svc.addFiles({}, &err));
    QVERIFY(!svc.addFiles({QStringLiteral("https://example.com/a.png")}, &err));
    QVERIFY(!svc.addFiles({dir.filePath(QStringLiteral("missing.txt"))}, &err));

    // Atomic batch rejection: valid + invalid must not mutate shelf.
    QVERIFY(!svc.addFiles({realPath, QStringLiteral("http://evil.local/payload")}, &err));
    QCOMPARE(svc.count(), 0);

    // Oversized URI (>2048 bytes) rejected.
    const QString huge = QStringLiteral("/") + QString(2100, QLatin1Char('a'));
    QVERIFY(!svc.addFiles({huge}, &err));

    // Batch > 32 entries rejected.
    QStringList tooMany;
    for (int i = 0; i < 33; ++i) {
        tooMany.append(realPath);
    }
    QVERIFY(!svc.addFiles(tooMany, &err));
    QCOMPARE(svc.count(), 0);
}

void TestShelfService::testDeduplicationAndFifoCapacity() {
    QTemporaryDir dir;
    QVERIFY(dir.isValid());
    ShelfService svc(dir.filePath(QStringLiteral("shelf.json")));

    QStringList paths;
    for (int i = 0; i < 14; ++i) {
        const QString p = createFile(dir, QStringLiteral("f%1.txt").arg(i, 2, 10, QLatin1Char('0')));
        QVERIFY(!p.isEmpty());
        paths.append(p);
    }

    for (const QString &p : paths) {
        QVERIFY(svc.addFiles({p}));
    }
    QCOMPARE(svc.count(), 12);
    // f13 is newest (index 0), f00 and f01 were evicted.
    QCOMPARE(svc.snapshot().items.first().name, QStringLiteral("f13.txt"));
    QCOMPARE(svc.snapshot().items.last().name, QStringLiteral("f02.txt"));

    // Re-adding f02 moves it to index 0 without creating a duplicate.
    QVERIFY(svc.addFiles({QUrl::fromLocalFile(paths[2]).toString()}));
    QCOMPARE(svc.count(), 12);
    QCOMPARE(svc.snapshot().items.first().name, QStringLiteral("f02.txt"));
}

void TestShelfService::testRemoveClearAndPersistencePruning() {
    QTemporaryDir dir;
    QVERIFY(dir.isValid());
    const QString p1 = createFile(dir, QStringLiteral("keep.txt"));
    const QString p2 = createFile(dir, QStringLiteral("vanish.txt"));
    const QString storePath = dir.filePath(QStringLiteral("shelf.json"));

    {
        ShelfService svc(storePath);
        QVERIFY(svc.addFiles({p1, p2}));
        QCOMPARE(svc.count(), 2);
    }

    // Delete p2 on disk before reopening Core.
    QVERIFY(QFile::remove(p2));

    ShelfService reloaded(storePath);
    QCOMPARE(reloaded.count(), 1);
    QCOMPARE(reloaded.snapshot().items.first().name, QStringLiteral("keep.txt"));

    const QString keepId = reloaded.snapshot().items.first().id;
    QVERIFY(!reloaded.removeFile(QStringLiteral("nonexistent")));
    QVERIFY(reloaded.removeFile(keepId));
    QCOMPARE(reloaded.count(), 0);

    QVERIFY(reloaded.addFiles({p1}));
    QVERIFY(reloaded.clear());
    QCOMPARE(reloaded.count(), 0);
}

QTEST_MAIN(TestShelfService)
#include "tst_shelf_service.moc"
