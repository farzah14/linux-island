#include <QtTest>
#include <QTemporaryDir>
#include <QFile>
#include "todo/todo_service.h"

class TestTodoService : public QObject {
    Q_OBJECT
private slots:
    void persistence() {
        QTemporaryDir dir;
        QVERIFY(dir.isValid());
        const auto path = dir.filePath("tasks.json");
        TodoService service(path);
        QVERIFY(!service.add("  "));
        QVERIFY(service.add("  Read a book  "));
        QCOMPARE(service.items().size(), 1);
        const auto id = service.items().first().toMap().value("id").toString();
        QVERIFY(service.setDone(id, true));
        TodoService restored(path);
        QCOMPARE(restored.items().first().toMap().value("title").toString(), QString("Read a book"));
        QVERIFY(restored.items().first().toMap().value("done").toBool());
        QVERIFY(restored.remove(id));
        QCOMPARE(TodoService(path).items().size(), 0);
    }
    void corruptFileIsPreserved() {
        QTemporaryDir dir;
        const auto path = dir.filePath("tasks.json");
        QFile file(path);
        QVERIFY(file.open(QIODevice::WriteOnly));
        QCOMPARE(file.write("invalid"), qint64(7));
        file.close();
        TodoService service(path);
        QVERIFY(!service.add("task"));
        QVERIFY(file.open(QIODevice::ReadOnly));
        QCOMPARE(file.readAll(), QByteArray("invalid"));
    }
    void failedSaveDoesNotMutate() {
        QTemporaryDir dir;
        TodoService service(dir.filePath("missing/tasks.json"));
        QVERIFY(!service.add("task"));
        QVERIFY(service.items().isEmpty());
    }
};
QTEST_GUILESS_MAIN(TestTodoService)
#include "tst_todo_service.moc"
