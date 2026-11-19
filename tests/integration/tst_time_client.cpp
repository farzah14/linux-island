#include <QtTest>
#include <QDBusConnection>
#include <QDBusContext>
#include <QDBusError>
#include <QProcess>
#include <QDBusMessage>
#include <QDBusPendingCall>
#include <QElapsedTimer>
#include <QThread>
#include "time_client.h"

class FakeTime : public QObject, protected QDBusContext {
    Q_OBJECT
    Q_CLASSINFO("D-Bus Interface", "io.github.linuxisland.Time1")
public slots:
    QVariantMap GetTimer() {
        if (first) {
            first = false;
            sendErrorReply(QDBusError::Failed, "temporary failure");
            return {};
        }
        return {{"state", "running"}, {"remainingSec", 59}};
    }
    QVariantMap GetTimerStats() { return {{"focusCompleted", focus}}; }
    void Complete() {
        focus = 1;
        emit TimerChanged(1, {{"state", "finished"}, {"mode", "pomodoro"}, {"completedFocus", 1}});
    }
    void Block() { QThread::msleep(1200); }
    bool StartTimer(const QVariantMap &) { qInfo("started"); return true; }
signals:
    void TimerChanged(quint64 revision, const QVariantMap &timer);
private:
    bool first = true;
    int focus = 0;
};

class TestTimeClient : public QObject {
    Q_OBJECT
private slots:
    void recoversAfterTransientFailure() {
        QProcess server;
        server.setProcessChannelMode(QProcess::MergedChannels);
        server.start(QCoreApplication::applicationFilePath(), {"--server"});
        QVERIFY(server.waitForStarted());
        QVERIFY(server.waitForReadyRead(5000));
        QCOMPARE(server.readLine().trimmed(), QByteArray("ready"));
        TimeClient client;
        QTRY_VERIFY_WITH_TIMEOUT(client.timerServiceAvailable(), 7000);
        QCOMPARE(client.timerState(), QStringLiteral("running"));
        server.terminate();
        QVERIFY(server.waitForFinished(3000));
        QTRY_VERIFY_WITH_TIMEOUT(!client.timerServiceAvailable(), 3000);
        server.start(QCoreApplication::applicationFilePath(), {"--server"});
        QVERIFY(server.waitForStarted());
        QVERIFY(server.waitForReadyRead(5000));
        QCOMPARE(server.readLine().trimmed(), QByteArray("ready"));
        QTRY_VERIFY_WITH_TIMEOUT(client.timerServiceAvailable(), 7000);
        QCOMPARE(client.timerState(), QStringLiteral("running"));
        server.terminate();
        QVERIFY(server.waitForFinished(3000));
    }
    void signalRestoresAvailability() {
        TimeClient client;
        const QVariantMap timer{{"state", "running"}, {"remainingSec", 59}};
        QVERIFY(QMetaObject::invokeMethod(&client, "onTimerChanged", Qt::DirectConnection,
                                         Q_ARG(quint64, 1), Q_ARG(QVariantMap, timer)));
        QVERIFY(client.timerServiceAvailable());
        QCOMPARE(client.timerState(), QStringLiteral("running"));
    }
    void rejectsStaleZeroRevision() {
        TimeClient client;
        const QVariantMap newer{{"state", "paused"}, {"revision", QVariant::fromValue<quint64>(1)}};
        const QVariantMap older{{"state", "idle"}, {"revision", QVariant::fromValue<quint64>(0)}};
        QVERIFY(QMetaObject::invokeMethod(&client, "onTimerChanged", Qt::DirectConnection, Q_ARG(quint64, 1), Q_ARG(QVariantMap, newer)));
        QVERIFY(QMetaObject::invokeMethod(&client, "onTimerChanged", Qt::DirectConnection, Q_ARG(quint64, 0), Q_ARG(QVariantMap, older)));
        QCOMPARE(client.timerState(), QStringLiteral("paused"));
    }
    void statsAndCommands() {
        QProcess server;
        server.setProcessChannelMode(QProcess::MergedChannels);
        server.start(QCoreApplication::applicationFilePath(), {"--server"});
        QVERIFY(server.waitForStarted());
        QVERIFY(server.waitForReadyRead(5000));
        QCOMPARE(server.readLine().trimmed(), QByteArray("ready"));
        TimeClient client;
        QTRY_VERIFY_WITH_TIMEOUT(client.timerServiceAvailable(), 7000);
        const auto message = [](const QString &method) {
            return QDBusMessage::createMethodCall("io.github.linuxisland.Core", "/io/github/linuxisland/Core", "io.github.linuxisland.Time1", method);
        };
        QDBusConnection::sessionBus().asyncCall(message("Complete"));
        QTRY_COMPARE_WITH_TIMEOUT(client.timerStats().value("focusCompleted").toInt(), 1, 3000);
        QDBusConnection::sessionBus().asyncCall(message("Block"));
        QTest::qWait(100);
        QElapsedTimer elapsed; elapsed.start();
        client.startTimer(1);
        QVERIFY2(elapsed.elapsed() < 500, "Timer commands must not block the UI");
        QTRY_VERIFY_WITH_TIMEOUT(server.canReadLine(), 3000);
        QCOMPARE(server.readLine().trimmed(), QByteArray("started"));
        server.terminate();
        QVERIFY(server.waitForFinished(3000));
    }
};

int main(int argc, char **argv) {
    QCoreApplication app(argc, argv);
    if (app.arguments().contains("--server")) {
        FakeTime fake;
        auto bus = QDBusConnection::sessionBus();
        if (!bus.registerObject("/io/github/linuxisland/Core", &fake,
                                QDBusConnection::ExportAllSlots | QDBusConnection::ExportAllSignals)
            || !bus.registerService("io.github.linuxisland.Core")) return 2;
        qInfo("ready");
        return app.exec();
    }
    TestTimeClient test;
    return QTest::qExec(&test, argc, argv);
}
#include "tst_time_client.moc"
