#include "notification_watcher.h"
#include <QDesktopServices>
#include <QUrl>
#include <QProcess>
#include <QStandardPaths>

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
    }
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
