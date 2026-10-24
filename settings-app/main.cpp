#include <QGuiApplication>
#include <QQmlApplicationEngine>
#include <QQmlContext>
#include "settings_proxy.h"

int main(int argc, char **argv) {
    QGuiApplication app(argc, argv);
    app.setApplicationName(QStringLiteral("Linux Island Settings"));
    app.setOrganizationName(QStringLiteral("LinuxIsland"));

    SettingsProxy proxy;

    QQmlApplicationEngine engine;
    engine.rootContext()->setContextProperty(QStringLiteral("settingsProxy"), &proxy);

    const QUrl url(QStringLiteral("qrc:/linuxisland/settings/qml/Main.qml"));
    QObject::connect(&engine, &QQmlApplicationEngine::objectCreated,
                     &app, [url](QObject *obj, const QUrl &objUrl) {
        if (!obj && url == objUrl)
            QCoreApplication::exit(-1);
    }, Qt::QueuedConnection);

    engine.load(url);

    return app.exec();
}
