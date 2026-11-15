#include <QGuiApplication>
#include <QDBusConnection>
#include <QDBusConnectionInterface>
#include <QDBusMessage>
#include <QDBusArgument>
#include <QDBusReply>
#include <csignal>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <QQmlApplicationEngine>
#include <QQmlComponent>
#include <QQmlContext>
#include <QQuickWindow>
#include <QQuickItem>
#include <QEventLoop>
#include <QFile>
#include <QTimer>
#include <iostream>
#include "island_client.h"
#include "time_client.h"
#include "shelf_client.h"
#include "todo_client.h"
#include "system_metrics_provider.h"
#include "quick_settings_provider.h"
#include "ai_quota_provider.h"
#include "notification_watcher.h"
#include "display_surface_manager.h"

class UiControlAdaptor : public QObject {
    Q_OBJECT
    Q_CLASSINFO("D-Bus Interface", "io.github.linuxisland.Ui1")
public:
    explicit UiControlAdaptor(IslandClient *client, QObject *parent = nullptr)
        : QObject(parent), m_client(client) {}
public slots:
    void Toggle() {
        if (m_client)
            m_client->toggleExpanded();
    }
private:
    IslandClient *m_client = nullptr;
};

int main(int argc, char *argv[]) {
    for (int i = 1; i < argc; ++i) {
        if (std::strcmp(argv[i], "--version") == 0) {
            std::printf("linux-island-ui %s\n", ISLAND_VERSION);
            return 0;
        }
    }

    bool smokeTest = false;
    bool shelfPopout = false;
    bool toggleMode = false;
    for (int i = 1; i < argc; ++i) {
        const QString arg = QString::fromUtf8(argv[i]);
        if (arg == QLatin1String("--smoke-test")) {
            smokeTest = true;
        } else if (arg == QLatin1String("--shelf-popout")) {
            shelfPopout = true;
        } else if (arg == QLatin1String("--toggle")) {
            toggleMode = true;
        }
    }

    if (toggleMode) {
        QDBusConnection bus = QDBusConnection::sessionBus();
        if (!bus.isConnected())
            return 1;
        QDBusMessage msg = QDBusMessage::createMethodCall(
            QStringLiteral("io.github.linuxisland.Ui"),
            QStringLiteral("/io/github/linuxisland/Ui"),
            QStringLiteral("io.github.linuxisland.Ui1"),
            QStringLiteral("Toggle"));
        const QDBusMessage reply = bus.call(msg, QDBus::Block, 1000);
        return reply.type() == QDBusMessage::ErrorMessage ? 1 : 0;
    }

    if (smokeTest && !qEnvironmentVariableIsSet("QT_QPA_PLATFORM")) {
        qputenv("QT_QPA_PLATFORM", "offscreen");
    }

    // Refuse to draw a second island. The GNOME extension is a separate
    // renderer and neither knows about the other, so launching this binary
    // directly (bypassing linux-island-launch, which disables the extension)
    // used to leave two capsules on screen. ISLAND_ALLOW_DOUBLE_RENDER=1
    // overrides this for deliberate side-by-side comparison.
    if (!smokeTest && !shelfPopout && qEnvironmentVariableIsEmpty("ISLAND_ALLOW_DOUBLE_RENDER")) {
        QDBusConnection bus = QDBusConnection::sessionBus();
        if (bus.isConnected() && bus.interface()) {
            const QDBusReply<bool> enabled = bus.interface()->isServiceRegistered(
                QStringLiteral("org.gnome.Shell.Extensions"));
            if (enabled.isValid() && enabled.value()) {
                // Ask the Shell whether our extension is enabled.
                QDBusMessage msg = QDBusMessage::createMethodCall(
                    QStringLiteral("org.gnome.Shell.Extensions"),
                    QStringLiteral("/org/gnome/Shell/Extensions"),
                    QStringLiteral("org.gnome.Shell.Extensions"),
                    QStringLiteral("GetExtensionInfo"));
                msg << QStringLiteral("linux-island@local");
                const QDBusMessage reply = bus.call(msg, QDBus::Block, 1000);
                if (reply.type() == QDBusMessage::ReplyMessage && !reply.arguments().isEmpty()) {
                    const QVariantMap info = qdbus_cast<QVariantMap>(reply.arguments().at(0));
                    // state 1 == ENABLED/ACTIVE
                    if (info.value(QStringLiteral("enabled")).toBool()) {
                        std::cerr << "linux-island-ui: the GNOME extension is already "
                                     "rendering the island; refusing to start a second one.\n"
                                     "Disable it first, or set ISLAND_ALLOW_DOUBLE_RENDER=1.\n";
                        return 12;
                    }
                }
            }
        }
    }

    // X11 WM_CLASS instance comes from RESOURCE_NAME (or argv0), the class from
    // applicationName. Pin both so the shipped window rules and
    // StartupWMClass=linux-island-ui actually match.
    qputenv("RESOURCE_NAME", "linux-island-ui");

    QGuiApplication app(argc, argv);
    app.setApplicationName(QStringLiteral("linux-island-ui"));
    app.setDesktopFileName(QStringLiteral("linux-island"));
    app.setOrganizationName(QStringLiteral("LinuxIsland"));

    IslandClient client;
    TimeClient timeClient;
    ShelfClient shelfClient;
    TodoClient todoClient;
    UiControlAdaptor uiControl(&client);
    if (!smokeTest && QDBusConnection::sessionBus().isConnected()) {
        QDBusConnection::sessionBus().registerService(QStringLiteral("io.github.linuxisland.Ui"));
        QDBusConnection::sessionBus().registerObject(
            QStringLiteral("/io/github/linuxisland/Ui"),
            &uiControl,
            QDBusConnection::ExportAllSlots);
    }
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

    QObject::connect(&timeClient, &TimeClient::timerFinished,
                     &client, [&client]() {
        client.dispatchEvent(QStringLiteral("PEEK_REQUEST"));
    });

    // Keep the watcher's gating flags in sync with Core settings. Without this
    // the watcher stays at its constructor defaults (both false), so peeks and
    // WhatsApp activity never fire even when the user enabled them.
    auto syncNotificationPrefs = [&client, &notificationWatcher]() {
        notificationWatcher.setNotificationPeekEnabled(client.notificationPeekEnabled());
        notificationWatcher.setWhatsappEnabled(client.whatsappIntegrationEnabled());
    };
    syncNotificationPrefs();
    QObject::connect(&client, &IslandClient::settingsChanged,
                     &notificationWatcher, syncNotificationPrefs);

    QQmlApplicationEngine engine;
    bool qmlWarnings = false;
    if (smokeTest) {
        QObject::connect(&engine, &QQmlEngine::warnings, &engine,
                         [&qmlWarnings](const QList<QQmlError> &) { qmlWarnings = true; });
    }

    engine.rootContext()->setContextProperty(QStringLiteral("islandClient"), &client);
    engine.rootContext()->setContextProperty(QStringLiteral("timeClient"), &timeClient);
    engine.rootContext()->setContextProperty(QStringLiteral("shelfClient"), &shelfClient);
    engine.rootContext()->setContextProperty(QStringLiteral("todoClient"), &todoClient);
    engine.rootContext()->setContextProperty(QStringLiteral("shelfPopout"), shelfPopout);
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
        surfaceMgr->attachWindow(rootWindow);
    }

    if (smokeTest && rootWindow && rootWindow->mask().isEmpty()) {
        std::cerr << "Smoke test error: rootWindow mask is empty!" << std::endl;
        return 7;
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

        // Exercise the loaded QML rather than treating token/fixture checks as
        // geometry coverage. Presets must scale artwork and transport together.
        auto *mediaPage = rootWindow->findChild<QObject *>(QStringLiteral("mediaPage"));
        if (!mediaPage) {
            std::cerr << "Smoke test error: media page missing" << std::endl;
            return 8;
        }
        const QStringList presets = {QStringLiteral("circle"), QStringLiteral("small"),
                                     QStringLiteral("medium"), QStringLiteral("large")};
        const int artwork[] = {40, 40, 48, 56};
        const int buttons[] = {28, 28, 32, 36};
        for (int i = 0; i < presets.size(); ++i) {
            mediaPage->setProperty("capsuleSize", presets[i]);
            if (mediaPage->property("artworkSize").toInt() != artwork[i]
                || mediaPage->property("buttonSize").toInt() != buttons[i]
                || mediaPage->property("implicitHeight").toInt() != artwork[i] + buttons[i] + 46) {
                std::cerr << "Smoke test error: media preset geometry "
                          << presets[i].toStdString() << std::endl;
                return 8;
            }
        }
        mediaPage->setProperty("capsuleSize", client.capsuleSize());
        // Let animations/layout finish, then check the allocated content box.
        QEventLoop layoutLoop;
        QTimer::singleShot(400, &layoutLoop, &QEventLoop::quit);
        layoutLoop.exec();
        auto *mediaItem = qobject_cast<QQuickItem *>(mediaPage);
        const qreal expectedWidth = (client.capsuleSize() == QLatin1String("small") || client.capsuleSize() == QLatin1String("circle")) ? 234
                                  : (client.capsuleSize() == QLatin1String("large")) ? 354 : 294;
        const qreal expectedHeight = (client.capsuleSize() == QLatin1String("small") || client.capsuleSize() == QLatin1String("circle")) ? 114
                                   : (client.capsuleSize() == QLatin1String("large")) ? 142 : 126;
        if (!mediaItem || qAbs(mediaItem->width() - expectedWidth) > 0.5
            || qAbs(mediaItem->height() - expectedHeight) > 0.5) {
            std::cerr << "Smoke test error: media allocation "
                      << (mediaItem ? mediaItem->width() : -1) << "x"
                      << (mediaItem ? mediaItem->height() : -1) << std::endl;
            return 8;
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

        auto *timePage = rootWindow->findChild<QObject *>(QStringLiteral("timePage"));
        if (!timePage) {
            std::cerr << "Smoke test error: timer page missing" << std::endl;
            return 10;
        }
        if (timePage->property("implicitHeight").toInt() != 116) {
            std::cerr << "Smoke test error: timer page height" << std::endl;
            return 11;
        }

        auto *shelfPage = rootWindow->findChild<QObject *>(QStringLiteral("todoPage"));
        if (!shelfPage) {
            std::cerr << "Smoke test error: shelf page missing" << std::endl;
            return 12;
        }
        if (shelfPage->property("implicitHeight").toInt() != 116) {
            std::cerr << "Smoke test error: shelf page height" << std::endl;
            return 13;
        }

        if (qmlWarnings) {
            std::cerr << "Smoke test error: QML runtime warnings" << std::endl;
            return 9;
        }
        std::cout << "PASS: linux-island-ui smoke check" << std::endl;
        return 0;
    }

    return app.exec();
}

#include "main.moc"
