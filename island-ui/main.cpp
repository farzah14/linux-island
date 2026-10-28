#include <QGuiApplication>
#include <QQmlApplicationEngine>
#include <QQmlComponent>
#include <QQmlContext>
#include <QQuickWindow>
#include <QFile>
#include <iostream>
#include "island_client.h"
#include "system_metrics_provider.h"
#include "quick_settings_provider.h"
#include "ai_quota_provider.h"
#include "notification_watcher.h"
#include "display_surface_manager.h"

int main(int argc, char *argv[]) {
    bool smokeTest = false;
    for (int i = 1; i < argc; ++i) {
        if (std::string(argv[i]) == "--smoke-test") {
            smokeTest = true;
            break;
        }
    }

    if (smokeTest && !qEnvironmentVariableIsSet("QT_QPA_PLATFORM")) {
        qputenv("QT_QPA_PLATFORM", "offscreen");
    }

    QGuiApplication app(argc, argv);
    app.setApplicationName(QStringLiteral("linux-island-ui"));
    app.setOrganizationName(QStringLiteral("LinuxIsland"));

    IslandClient client;
    SystemMetricsProvider metrics;
    QuickSettingsProvider quickSettings;
    AiQuotaProvider aiQuota;
    NotificationWatcher notificationWatcher;

    // Connect theme toggle request from QuickSettingsProvider to IslandClient
    QObject::connect(&quickSettings, &QuickSettingsProvider::themeOverrideRequested,
                     &client, [&client](const QString &theme) {
        client.updateSettings({{QStringLiteral("theme"), theme}});
    });

    // Connect notification watcher peek request to IslandClient FSM
    QObject::connect(&notificationWatcher, &NotificationWatcher::peekRequested,
                     &client, [&client]() {
        client.dispatchEvent(QStringLiteral("PEEK_REQUEST"));
    });

    QQmlApplicationEngine engine;

    engine.rootContext()->setContextProperty(QStringLiteral("islandClient"), &client);
    engine.rootContext()->setContextProperty(QStringLiteral("systemMetrics"), &metrics);
    engine.rootContext()->setContextProperty(QStringLiteral("quickSettings"), &quickSettings);
    engine.rootContext()->setContextProperty(QStringLiteral("aiQuota"), &aiQuota);
    engine.rootContext()->setContextProperty(QStringLiteral("notificationWatcher"), &notificationWatcher);

    QUrl themeUrl = QUrl(QStringLiteral("qrc:/qt/qml/linuxisland/ui/qml/ThemeData.qml"));
    if (!QFile::exists(QStringLiteral(":/qt/qml/linuxisland/ui/qml/ThemeData.qml"))) {
        themeUrl = QUrl(QStringLiteral("qrc:/linuxisland/ui/qml/ThemeData.qml"));
    }
    QQmlComponent themeComponent(&engine, themeUrl);
    if (themeComponent.isError()) {
        for (const auto &err : themeComponent.errors()) {
            std::cerr << "Theme component error: " << err.toString().toStdString() << std::endl;
        }
    }
    QObject *themeInstance = themeComponent.create();
    if (themeInstance) {
        themeInstance->setProperty("isDark", client.effectiveDarkTheme());
        QObject::connect(&client, &IslandClient::settingsChanged, themeInstance, [&client, themeInstance]() {
            themeInstance->setProperty("isDark", client.effectiveDarkTheme());
        });
        engine.rootContext()->setContextProperty(QStringLiteral("IslandTheme"), themeInstance);
    }

    // Initial dummy / placeholder surface manager until window is created
    DisplaySurfaceManager *surfaceMgr = new DisplaySurfaceManager(nullptr, &client, &app);
    engine.rootContext()->setContextProperty(QStringLiteral("surfaceManager"), surfaceMgr);

    const QUrl url(QStringLiteral("qrc:/linuxisland/ui/qml/IslandWindow.qml"));
    engine.load(url);

    if (engine.rootObjects().isEmpty()) {
        std::cerr << "FAIL: could not load IslandWindow.qml" << std::endl;
        return 1;
    }

    QQuickWindow *rootWindow = qobject_cast<QQuickWindow*>(engine.rootObjects().first());
    if (rootWindow) {
        delete surfaceMgr;
        surfaceMgr = new DisplaySurfaceManager(rootWindow, &client, &app);
        engine.rootContext()->setContextProperty(QStringLiteral("surfaceManager"), surfaceMgr);
    }

    if (smokeTest) {
        // Exercise state machine: COMPACT -> PREVIEW -> EXPANDED -> COMPACT
        client.dispatchEvent(QStringLiteral("HOVER_ENTER"));
        if (client.uiState() != QLatin1String("PREVIEW")) {
            std::cerr << "Smoke test error: expected PREVIEW state, got " << client.uiState().toStdString() << std::endl;
            return 2;
        }

        client.dispatchEvent(QStringLiteral("CLICK"));
        if (client.uiState() != QLatin1String("EXPANDED")) {
            std::cerr << "Smoke test error: expected EXPANDED state, got " << client.uiState().toStdString() << std::endl;
            return 3;
        }

        client.dispatchEvent(QStringLiteral("DISMISS"));
        if (client.uiState() != QLatin1String("COMPACT")) {
            std::cerr << "Smoke test error: expected COMPACT state, got " << client.uiState().toStdString() << std::endl;
            return 4;
        }

        // Test notification simulation
        notificationWatcher.setWhatsappEnabled(true);
        notificationWatcher.handleNotificationObserved(QStringLiteral("com.whatsapp.whatsapp"), QStringLiteral("whatsapp.desktop"), 999);
        if (!notificationWatcher.whatsappActivity()) {
            std::cerr << "Smoke test error: expected whatsappActivity to be true" << std::endl;
            return 5;
        }
        notificationWatcher.clearWhatsappActivity();

        std::cout << "PASS: linux-island-ui smoke check" << std::endl;
        return 0;
    }

    return app.exec();
}
