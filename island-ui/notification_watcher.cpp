#include "notification_watcher.h"
#include <QDBusArgument>
#include <QDBusInterface>
#include <QDBusMessage>
#include <QDBusPendingCall>
#include <QDBusPendingCallWatcher>
#include <QDBusVirtualObject>
#include <QDesktopServices>
#include <QUrl>
#include <QProcess>
#include <QStandardPaths>

namespace {
class NotifyMonitorObject final : public QDBusVirtualObject {
public:
    explicit NotifyMonitorObject(NotificationWatcher *owner)
        : QDBusVirtualObject(owner), m_owner(owner) {}

    QString introspect(const QString &) const override { return {}; }

    bool handleMessage(const QDBusMessage &message, const QDBusConnection &) override {
        if (!m_owner || message.type() != QDBusMessage::MethodCallMessage ||
            message.interface() != QLatin1String("org.freedesktop.Notifications") ||
            message.member() != QLatin1String("Notify")) {
            return true;
        }
        const QVariantList args = message.arguments();
        const QString appName = args.value(0).toString();
        QVariantMap hints;
        if (args.size() > 6) {
            const QVariant rawHints = args.at(6);
            if (rawHints.metaType().id() == qMetaTypeId<QDBusArgument>()) {
                hints = qdbus_cast<QVariantMap>(rawHints.value<QDBusArgument>());
            } else {
                hints = rawHints.toMap();
            }
        }
        const QString desktopEntry = hints.value(QStringLiteral("desktop-entry")).toString();
        m_owner->handleNotificationObserved(appName, desktopEntry, 0);
        return true;
    }

private:
    NotificationWatcher *m_owner = nullptr;
};
} // namespace

NotificationWatcher::NotificationWatcher(const QDBusConnection &bus, QObject *parent)
    : QObject(parent),
      m_bus(bus) {
    if (m_bus.isConnected()) {
        m_bus.connect(
            QString(),
            QStringLiteral("/org/freedesktop/Notifications"),
            QStringLiteral("org.freedesktop.Notifications"),
            QStringLiteral("NotificationClosed"),
            this,
            SLOT(onNotificationClosed(uint,uint)));

        if (m_bus.name() == QDBusConnection::sessionBus().name()) {
            startNotifyMonitor();
        }
    }
}

NotificationWatcher::~NotificationWatcher() {
    if (!m_monitorConnName.isEmpty()) {
        QDBusConnection::disconnectFromBus(m_monitorConnName);
    }
}

void NotificationWatcher::startNotifyMonitor() {
    m_monitorConnName = QStringLiteral("linux-island-notif-monitor-") +
                        QString::number(reinterpret_cast<quintptr>(this), 16);
    QDBusConnection monitorBus = QDBusConnection::connectToBus(QDBusConnection::SessionBus, m_monitorConnName);
    if (!monitorBus.isConnected()) {
        QDBusConnection::disconnectFromBus(m_monitorConnName);
        m_monitorConnName.clear();
        return;
    }

    m_monitorObject = new NotifyMonitorObject(this);
    monitorBus.registerVirtualObject(
        QStringLiteral("/org/freedesktop/Notifications"),
        m_monitorObject,
        QDBusConnection::SubPath);

    QDBusMessage msg = QDBusMessage::createMethodCall(
        QStringLiteral("org.freedesktop.DBus"),
        QStringLiteral("/org/freedesktop/DBus"),
        QStringLiteral("org.freedesktop.DBus.Monitoring"),
        QStringLiteral("BecomeMonitor"));
    msg << QStringList{QStringLiteral("type='method_call',interface='org.freedesktop.Notifications',member='Notify'")}
        << uint(0);

    auto *watcher = new QDBusPendingCallWatcher(monitorBus.asyncCall(msg), this);
    connect(watcher, &QDBusPendingCallWatcher::finished, this, [this](QDBusPendingCallWatcher *w) {
        w->deleteLater();
        if (w->reply().type() == QDBusMessage::ErrorMessage && !m_monitorConnName.isEmpty()) {
            QDBusConnection::disconnectFromBus(m_monitorConnName);
            m_monitorConnName.clear();
        }
    });
}

bool NotificationWatcher::isWhatsAppSource(const QString &appName, const QString &desktopEntry) {
    static const QStringList verified = {
        QStringLiteral("com.whatsapp.whatsapp"),
        QStringLiteral("whatsapp-for-linux"),
        QStringLiteral("whatsapp-desktop"),
        QStringLiteral("whatsapp"),
        QStringLiteral("io.github.alexpose.whatsappforlinux"),
        QStringLiteral("com.github.eneshecan.whatsapp-for-linux"),
        QStringLiteral("whatsapp-nativefier")
    };

    const QString lowerApp = appName.toLower();
    const QString lowerEntry = desktopEntry.toLower();

    for (const QString &v : verified) {
        if (lowerApp.contains(v) || lowerEntry.contains(v)) {
            return true;
        }
    }
    return false;
}

void NotificationWatcher::setNotificationPeekEnabled(bool enabled) {
    m_notificationPeekEnabled = enabled;
}

void NotificationWatcher::setWhatsappEnabled(bool enabled) {
    m_whatsappEnabled = enabled;
    if (!m_whatsappEnabled && m_whatsappActivity) {
        clearWhatsappActivity();
    }
}

void NotificationWatcher::setDnd(bool dnd) {
    m_dnd = dnd;
}

void NotificationWatcher::clearWhatsappActivity() {
    m_activeWhatsappIds.clear();
    if (m_whatsappActivity) {
        m_whatsappActivity = false;
        emit whatsappActivityChanged();
    }
}

void NotificationWatcher::handleNotificationObserved(const QString &appName, const QString &desktopEntry, uint id) {
    if (m_dnd) return;

    bool isWa = isWhatsAppSource(appName, desktopEntry);
    if (isWa && m_whatsappEnabled) {
        if (id > 0) m_activeWhatsappIds.insert(id);
        if (!m_whatsappActivity) {
            m_whatsappActivity = true;
            emit whatsappActivityChanged();
        }
    }

    if (m_notificationPeekEnabled) {
        emit peekRequested();
    }
}

void NotificationWatcher::onNotificationClosed(uint id, uint reason) {
    Q_UNUSED(reason);
    if (m_activeWhatsappIds.remove(id)) {
        if (m_activeWhatsappIds.isEmpty() && m_whatsappActivity) {
            m_whatsappActivity = false;
            emit whatsappActivityChanged();
        }
    }
}

void NotificationWatcher::activateWhatsapp() {
    clearWhatsappActivity();

    QStringList candidates = {
        QStringLiteral("whatsapp-for-linux"),
        QStringLiteral("whatsapp-desktop"),
        QStringLiteral("whatsapp")
    };

    for (const QString &binName : candidates) {
        QString bin = QStandardPaths::findExecutable(binName);
        if (!bin.isEmpty()) {
            if (QProcess::startDetached(bin, {})) {
                return;
            }
        }
    }

    // Web fallback
    QDesktopServices::openUrl(QUrl(QStringLiteral("https://web.whatsapp.com/")));
}
