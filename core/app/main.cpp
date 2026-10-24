#include <QCoreApplication>
#include <QDBusConnection>
#include "dbus/core_service.h"
#include "dbus/core_adaptor.h"
#include "media/audio_meter.h"

int main(int argc, char** argv) {
    QCoreApplication app(argc, argv);
    app.setApplicationName(QStringLiteral("Linux Island Core"));

    CoreService service;
    AudioMeter meter;
    QObject::connect(&meter, &AudioMeter::levelsChanged, &service, &CoreService::setAudioLevels);
    const auto updateMeter = [&] {
        meter.setActive(service.mediaState().value(QStringLiteral("playbackStatus")).toString() == QLatin1String("Playing") &&
                        service.settings().value(QStringLiteral("animationEnabled"), true).toBool());
    };
    QObject::connect(&service, &CoreService::mediaChanged, &meter, updateMeter);
    QObject::connect(&service, &CoreService::settingsChanged, &meter, updateMeter);
    new CoreAdaptor(&service);
    auto bus = QDBusConnection::sessionBus();
    if (!bus.registerObject(QStringLiteral("/io/github/linuxisland/Core"), &service,
                            QDBusConnection::ExportAdaptors) ||
        !bus.registerService(QStringLiteral("io.github.linuxisland.Core"))) {
        qCritical("Unable to register Linux Island Core1 service");
        return 1;
    }

    return app.exec();
}
