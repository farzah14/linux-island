#include <QCoreApplication>
#include <QDBusConnection>
#include <QTimer>
#include <cstdio>
#include <cstring>
#include "dbus/core_service.h"
#include "dbus/core_adaptor.h"
#include "dbus/time_adaptor.h"
#include "dbus/shelf_adaptor.h"
#include "dbus/todo_adaptor.h"
#include "media/audio_meter.h"
#include "media/sink_volume.h"

int main(int argc, char** argv) {
    for (int i = 1; i < argc; ++i) {
        if (std::strcmp(argv[i], "--version") == 0) {
            std::printf("linux-island-core %s\n", ISLAND_VERSION);
            return 0;
        }
    }

    QCoreApplication app(argc, argv);
    app.setApplicationName(QStringLiteral("Linux Island Core"));

    SinkVolume sink;
    CoreService service(QString(), QDBusConnection::sessionBus(), nullptr, &sink);
    QObject::connect(&sink, &SinkVolume::changed, &service, [&service, &sink](double volume, bool muted) {
        service.setSystemVolume(volume, muted, sink.level());
    });
    sink.start();
    AudioMeter meter;
    QObject::connect(&meter, &AudioMeter::levelsChanged, &service, &CoreService::setAudioLevels);
    const auto updateMeter = [&] {
        meter.setActive(service.mediaState().value(QStringLiteral("playbackStatus")).toString() == QLatin1String("Playing") &&
                        service.settings().value(QStringLiteral("animationEnabled"), true).toBool());
    };
    QObject::connect(&service, &CoreService::mediaChanged, &meter, updateMeter);
    QObject::connect(&service, &CoreService::settingsChanged, &meter, updateMeter);
    new CoreAdaptor(&service);
    new TimeAdaptor(&service);
    new ShelfAdaptor(&service);
    new TodoAdaptor(&service);
    auto bus = QDBusConnection::sessionBus();
    if (!bus.registerObject(QStringLiteral("/io/github/linuxisland/Core"), &service,
                            QDBusConnection::ExportAdaptors) ||
        !bus.registerService(QStringLiteral("io.github.linuxisland.Core"))) {
        qCritical("Unable to register Linux Island Core1 service");
        return 1;
    }
    service.startTimeServices();

    // Without systemd user services a launcher-spawned Core outlives logout.
    // The session bus is the only signal we get, so poll it and exit.
    QTimer sessionWatchdog;
    sessionWatchdog.setInterval(5000);
    QObject::connect(&sessionWatchdog, &QTimer::timeout, &app, [] {
        if (!QDBusConnection::sessionBus().isConnected()) {
            QCoreApplication::quit();
        }
    });
    sessionWatchdog.start();

    return app.exec();
}
