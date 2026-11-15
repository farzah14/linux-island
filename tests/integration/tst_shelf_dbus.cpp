#include <QtTest>
#include <QDBusArgument>
#include <QDBusConnection>
#include <QDBusError>
#include <QDBusInterface>
#include <QDBusMessage>
#include <QDBusReply>
#include <QFile>
#include <QSignalSpy>
#include <QTemporaryDir>
#include <QUrl>
#include <QXmlStreamReader>
#include "dbus/core_service.h"
#include "dbus/shelf_adaptor.h"

namespace {

QVariantMap demarshalMap(const QVariant &value) {
    if (value.metaType().id() == qMetaTypeId<QDBusArgument>()) {
        return qdbus_cast<QVariantMap>(value.value<QDBusArgument>());
    }
    return value.toMap();
}

QVariantList demarshalList(const QVariant &value) {
    if (value.metaType().id() == qMetaTypeId<QDBusArgument>()) {
        QVariantList list;
        const auto arg = value.value<QDBusArgument>();
        arg >> list;
        return list;
    }
    return value.toList();
}

} // namespace

class TestShelfDBus : public QObject {
    Q_OBJECT

private slots:
    void initTestCase();
    void testIntrospectionSignatures();
    void testGetAddRemoveClearFlow();
    void testInvalidUriReturnsDBusError();
    void cleanupTestCase();

private:
    QVariantMap callGetShelf();

    QTemporaryDir m_tempDir;
    CoreService *m_service = nullptr;
    QDBusConnection m_bus = QDBusConnection::sessionBus();
};

void TestShelfDBus::initTestCase() {
    QVERIFY2(m_bus.isConnected(), "Session bus must be connected");
    QVERIFY(m_tempDir.isValid());
    m_service = new CoreService(m_tempDir.filePath(QStringLiteral("settings.json")), this);
    new ShelfAdaptor(m_service);
    QVERIFY2(m_bus.registerObject(QStringLiteral("/io/github/linuxisland/Core"), m_service,
                                  QDBusConnection::ExportAdaptors),
             "Must register Core object");
    QVERIFY2(m_bus.registerService(QStringLiteral("io.github.linuxisland.Core")),
             "Must register Core service");
}

QVariantMap TestShelfDBus::callGetShelf() {
    QDBusInterface iface(QStringLiteral("io.github.linuxisland.Core"),
                         QStringLiteral("/io/github/linuxisland/Core"),
                         QStringLiteral("io.github.linuxisland.Shelf1"), m_bus);
    QDBusReply<QVariantMap> reply = iface.call(QStringLiteral("GetShelf"));
    if (!reply.isValid()) return {};
    return demarshalMap(reply.value());
}

void TestShelfDBus::testIntrospectionSignatures() {
    QDBusInterface intro(QStringLiteral("io.github.linuxisland.Core"),
                         QStringLiteral("/io/github/linuxisland/Core"),
                         QStringLiteral("org.freedesktop.DBus.Introspectable"), m_bus);
    QDBusReply<QString> reply = intro.call(QStringLiteral("Introspect"));
    QVERIFY2(reply.isValid(), qPrintable(reply.error().message()));

    QXmlStreamReader reader(reply.value());
    bool inShelf = false;
    QSet<QString> methods;
    QSet<QString> signalNames;
    while (!reader.atEnd() && !reader.hasError()) {
        const auto token = reader.readNext();
        if (token != QXmlStreamReader::StartElement) continue;
        if (reader.name() == QLatin1String("interface")) {
            inShelf = reader.attributes().value(QLatin1String("name")) ==
                      QLatin1String("io.github.linuxisland.Shelf1");
        } else if (inShelf && reader.name() == QLatin1String("method")) {
            methods.insert(reader.attributes().value(QLatin1String("name")).toString());
        } else if (inShelf && reader.name() == QLatin1String("signal")) {
            signalNames.insert(reader.attributes().value(QLatin1String("name")).toString());
        }
    }
    QCOMPARE(methods, (QSet<QString>{QStringLiteral("GetShelf"), QStringLiteral("AddFiles"),
                                     QStringLiteral("RemoveFile"), QStringLiteral("ClearShelf")}));
    QCOMPARE(signalNames, (QSet<QString>{QStringLiteral("ShelfChanged")}));
}

void TestShelfDBus::testGetAddRemoveClearFlow() {
    QVariantMap initial = callGetShelf();
    QCOMPARE(initial.value(QStringLiteral("count")).toInt(), 0);
    QCOMPARE(initial.value(QStringLiteral("maxItems")).toInt(), 12);
    QCOMPARE(initial.value(QStringLiteral("revision")).toULongLong(), 0ull);

    const QString filePath = m_tempDir.filePath(QStringLiteral("report.txt"));
    QFile f(filePath);
    QVERIFY(f.open(QIODevice::WriteOnly));
    f.write("linux-island-shelf");
    f.close();

    QSignalSpy spy(m_service, &CoreService::shelfChanged);
    QDBusInterface iface(QStringLiteral("io.github.linuxisland.Core"),
                         QStringLiteral("/io/github/linuxisland/Core"),
                         QStringLiteral("io.github.linuxisland.Shelf1"), m_bus);
    QDBusReply<bool> addReply = iface.call(QStringLiteral("AddFiles"),
                                           QStringList{QUrl::fromLocalFile(filePath).toString()});
    QVERIFY2(addReply.isValid(), qPrintable(addReply.error().message()));
    QCOMPARE(addReply.value(), true);
    QCOMPARE(spy.count(), 1);
    QCOMPARE(spy.first().at(0).toULongLong(), 1ull);

    QVariantMap loaded = callGetShelf();
    QCOMPARE(loaded.value(QStringLiteral("count")).toInt(), 1);
    QCOMPARE(loaded.value(QStringLiteral("revision")).toULongLong(), 1ull);
    const QVariantList items = demarshalList(loaded.value(QStringLiteral("items")));
    QCOMPARE(items.size(), 1);
    const QVariantMap item = demarshalMap(items.first());
    QCOMPARE(item.value(QStringLiteral("name")).toString(), QStringLiteral("report.txt"));
    const QString itemId = item.value(QStringLiteral("id")).toString();
    QVERIFY(!itemId.isEmpty());

    QDBusReply<bool> remReply = iface.call(QStringLiteral("RemoveFile"), itemId);
    QVERIFY(remReply.isValid() && remReply.value());
    QCOMPARE(callGetShelf().value(QStringLiteral("count")).toInt(), 0);
    QCOMPARE(callGetShelf().value(QStringLiteral("revision")).toULongLong(), 2ull);

    QDBusReply<bool> reAddReply = iface.call(QStringLiteral("AddFiles"), QStringList{filePath});
    QVERIFY(reAddReply.isValid() && reAddReply.value());
    QDBusReply<bool> clearReply = iface.call(QStringLiteral("ClearShelf"));
    QVERIFY(clearReply.isValid() && clearReply.value());
    QCOMPARE(callGetShelf().value(QStringLiteral("count")).toInt(), 0);
}

void TestShelfDBus::testInvalidUriReturnsDBusError() {
    QDBusInterface iface(QStringLiteral("io.github.linuxisland.Core"),
                         QStringLiteral("/io/github/linuxisland/Core"),
                         QStringLiteral("io.github.linuxisland.Shelf1"), m_bus);
    QDBusMessage reply = iface.call(QStringLiteral("AddFiles"),
                                    QStringList{QStringLiteral("https://example.com/bad")});
    QCOMPARE(reply.type(), QDBusMessage::ErrorMessage);
    QCOMPARE(reply.errorName(), QStringLiteral("io.github.linuxisland.Error.InvalidArgument"));
}

void TestShelfDBus::cleanupTestCase() {
    m_bus.unregisterService(QStringLiteral("io.github.linuxisland.Core"));
    m_bus.unregisterObject(QStringLiteral("/io/github/linuxisland/Core"));
}

QTEST_MAIN(TestShelfDBus)
#include "tst_shelf_dbus.moc"
