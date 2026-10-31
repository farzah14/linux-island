#include <QGuiApplication>
#include <csignal>
#include <cstdlib>
#include <QtWebEngineQuick/qtwebenginequickglobal.h>
#include <QQmlApplicationEngine>
#include <QQmlComponent>
#include <QQmlContext>
#include <QQuickWindow>
#include <QFile>
#include <QTimer>
#include <iostream>
#include "island_client.h"
#include "system_metrics_provider.h"
#include "quick_settings_provider.h"
#include "ai_quota_provider.h"
#include "search_provider.h"
#include "companion_profile.h"
#include "cookie_importer.h"
#include "notification_watcher.h"
#include "display_surface_manager.h"

int main(int argc, char *argv[]) {
    bool smokeTest = false;
    bool isCompanionMode = false;
    QString companionUrl;
    for (int i = 1; i < argc; ++i) {
        const QString arg = QString::fromUtf8(argv[i]);
        if (arg == QLatin1String("--smoke-test")) {
            smokeTest = true;
        } else if (arg == QLatin1String("--companion")) {
            isCompanionMode = true;
            if (i + 1 < argc && !QString::fromUtf8(argv[i + 1]).startsWith(QLatin1Char('-'))) {
                companionUrl = QString::fromUtf8(argv[i + 1]);
                ++i;
            }
        } else if (arg.startsWith(QLatin1String("--companion="))) {
            isCompanionMode = true;
            companionUrl = arg.section(QLatin1Char('='), 1);
        }
    }

    if (smokeTest && !qEnvironmentVariableIsSet("QT_QPA_PLATFORM")) {
        qputenv("QT_QPA_PLATFORM", "offscreen");
    }

    QtWebEngineQuick::initialize();
    QGuiApplication app(argc, argv);
    app.setApplicationName(QStringLiteral("linux-island-ui"));
    app.setOrganizationName(QStringLiteral("LinuxIsland"));

    IslandClient client;
    SystemMetricsProvider metrics;
    QuickSettingsProvider quickSettings;
    AiQuotaProvider aiQuota;
    SearchProvider searchProvider;
    CookieImporter cookieImporter;
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
    engine.rootContext()->setContextProperty(QStringLiteral("searchProvider"), &searchProvider);
    engine.rootContext()->setContextProperty(QStringLiteral("cookieImporter"), &cookieImporter);
    engine.rootContext()->setContextProperty(QStringLiteral("notificationWatcher"), &notificationWatcher);

    engine.rootContext()->setContextProperty(QStringLiteral("initialCompanionUrl"), companionUrl);
    engine.rootContext()->setContextProperty(QStringLiteral("isStandaloneCompanion"), isCompanionMode);
    // Persistent browser session: cookies/localStorage/cache live on disk so an
    // account logged in once stays logged in across companion launches.
    engine.rootContext()->setContextProperty(QStringLiteral("companionProfileDataPath"),
                                             CompanionProfile::dataPath());
    engine.rootContext()->setContextProperty(QStringLiteral("companionProfileCachePath"),
                                             CompanionProfile::cachePath());
    engine.rootContext()->setContextProperty(QStringLiteral("companionUserAgent"),
                                             CompanionProfile::userAgent());
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

    if (isCompanionMode) {
        QUrl companionUrlQml(QStringLiteral("qrc:/qt/qml/linuxisland/ui/qml/CompanionWindow.qml"));
        if (!QFile::exists(QStringLiteral(":/qt/qml/linuxisland/ui/qml/CompanionWindow.qml"))) {
            companionUrlQml = QUrl(QStringLiteral("qrc:/linuxisland/ui/qml/CompanionWindow.qml"));
        }
        engine.load(companionUrlQml);

        if (engine.rootObjects().isEmpty()) {
            std::cerr << "FAIL: could not load CompanionWindow.qml" << std::endl;
            return 1;
        }
        // Shutdown: flush cookies, then exit without waiting for a WebEngine
        // teardown that can block. A plain Qt teardown flushes cookies but may
        // hang (companion stayed visible and spinning after a Google handoff);
        // _Exit alone is fast but loses the session. So give the cookie store
        // a moment to commit, then guarantee termination.
        std::signal(SIGTERM, [](int) {
            QMetaObject::invokeMethod(qApp, []() { QCoreApplication::quit(); },
                                      Qt::QueuedConnection);
        });
        QObject::connect(&app, &QGuiApplication::aboutToQuit, &app, []() {
            QTimer::singleShot(1500, qApp, []() { std::_Exit(0); });
        });

        return app.exec();
    }

    QUrl url(QStringLiteral("qrc:/qt/qml/linuxisland/ui/qml/IslandWindow.qml"));
    if (!QFile::exists(QStringLiteral(":/qt/qml/linuxisland/ui/qml/IslandWindow.qml"))) {
        url = QUrl(QStringLiteral("qrc:/linuxisland/ui/qml/IslandWindow.qml"));
    }
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

        // Test loading CompanionWindow.qml with WebEngine
        QUrl compTestUrl(QStringLiteral("qrc:/qt/qml/linuxisland/ui/qml/CompanionWindow.qml"));
        if (!QFile::exists(QStringLiteral(":/qt/qml/linuxisland/ui/qml/CompanionWindow.qml"))) {
            compTestUrl = QUrl(QStringLiteral("qrc:/linuxisland/ui/qml/CompanionWindow.qml"));
        }
        QQmlComponent companionComp(&engine, compTestUrl);
        if (companionComp.isError()) {
            std::cerr << "Smoke test error: could not load CompanionWindow.qml: "
                      << companionComp.errorString().toStdString() << std::endl;
            return 6;
        }
        std::cout << "PASS: linux-island-ui smoke check" << std::endl;
        return 0;
    }

    return app.exec();
}
