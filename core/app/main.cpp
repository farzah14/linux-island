#include <QCoreApplication>
#include <QDBusConnection>
#include "dbus/core_service.h"
#include "dbus/core_adaptor.h"

int main(int argc, char** argv) {
    QCoreApplication app(argc, argv);
    app.setApplicationName(QStringLiteral("Linux Island Core"));

    CoreService service;
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
