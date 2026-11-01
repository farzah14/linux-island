#include <QGuiApplication>
#include <QQmlApplicationEngine>
#include <QQmlContext>
#include <QFile>
#include <cstdio>
#include <cstring>
#include "settings_proxy.h"

int main(int argc, char **argv) {
    for (int i = 1; i < argc; ++i) {
        if (std::strcmp(argv[i], "--version") == 0) {
            std::printf("linux-island-settings %s\n", ISLAND_VERSION);
            return 0;
        }
    }

    QGuiApplication app(argc, argv);
    app.setApplicationName(QStringLiteral("linux-island-settings"));
    app.setOrganizationName(QStringLiteral("LinuxIsland"));
    app.setDesktopFileName(QStringLiteral("linux-island-settings"));

    SettingsProxy proxy;

    QQmlApplicationEngine engine;
    engine.rootContext()->setContextProperty(QStringLiteral("settingsProxy"), &proxy);

    QUrl url(QStringLiteral("qrc:/qt/qml/linuxisland/settings/qml/Main.qml"));
    if (!QFile::exists(QStringLiteral(":/qt/qml/linuxisland/settings/qml/Main.qml"))) {
        url = QUrl(QStringLiteral("qrc:/linuxisland/settings/qml/Main.qml"));
    }
    QObject::connect(&engine, &QQmlApplicationEngine::objectCreated,
                     &app, [url](QObject *obj, const QUrl &objUrl) {
        if (!obj && url == objUrl)
            QCoreApplication::exit(-1);
    }, Qt::QueuedConnection);

    engine.load(url);

    return app.exec();
}
