#include "settings_proxy.h"
#include <QDBusInterface>
#include <QDBusPendingCall>
#include <QDBusPendingCallWatcher>
#include <QDBusPendingReply>
#include <QDBusConnectionInterface>

SettingsProxy::SettingsProxy(const QDBusConnection &bus, QObject *parent)
    : QObject(parent),
      m_bus(bus) {
    if (m_bus.isConnected()) {
        m_bus.connect(
            QStringLiteral("org.freedesktop.DBus"),
            QStringLiteral("/org/freedesktop/DBus"),
            QStringLiteral("org.freedesktop.DBus"),
            QStringLiteral("NameOwnerChanged"),
            this,
            SLOT(onNameOwnerChanged(QString,QString,QString)));

        m_bus.connect(
            QStringLiteral("io.github.linuxisland.Core"),
            QStringLiteral("/io/github/linuxisland/Core"),
            QStringLiteral("io.github.linuxisland.Core1"),
            QStringLiteral("SettingsChanged"),
            this,
            SLOT(onSettingsChanged(quint64,QVariantMap)));

        refresh();
    }
}

SettingsProxy::~SettingsProxy() = default;

void SettingsProxy::refresh() {
    if (!m_bus.isConnected()) {
        m_connected = false;
        emit connectedChanged();
        return;
    }

    bool hasOwner = m_bus.interface() && m_bus.interface()->isServiceRegistered(QStringLiteral("io.github.linuxisland.Core"));
    if (m_connected != hasOwner) {
        m_connected = hasOwner;
        emit connectedChanged();
    }

    if (!hasOwner) {
        return;
    }

    m_busy = true;
    emit busyChanged();

    QDBusInterface coreIface(
        QStringLiteral("io.github.linuxisland.Core"),
        QStringLiteral("/io/github/linuxisland/Core"),
        QStringLiteral("io.github.linuxisland.Core1"),
        m_bus);

    QDBusPendingCall call = coreIface.asyncCall(QStringLiteral("GetSettings"));
    auto *watcher = new QDBusPendingCallWatcher(call, this);
    connect(watcher, &QDBusPendingCallWatcher::finished, this, [this](QDBusPendingCallWatcher *w) {
        w->deleteLater();
        m_busy = false;
        emit busyChanged();

        QDBusPendingReply<QVariantMap> reply = *w;
        if (reply.isValid()) {
            applySettingsMap(reply.value());
            m_errorMessage.clear();
            emit errorMessageChanged();
        } else {
            m_errorMessage = reply.error().message();
            emit errorMessageChanged();
        }
    });
}

void SettingsProxy::onNameOwnerChanged(const QString &serviceName, const QString &oldOwner, const QString &newOwner) {
    Q_UNUSED(oldOwner);
    if (serviceName == QLatin1String("io.github.linuxisland.Core")) {
        bool hasOwner = !newOwner.isEmpty();
        if (m_connected != hasOwner) {
            m_connected = hasOwner;
            emit connectedChanged();
        }
        if (hasOwner) {
            refresh();
        }
    }
}

void SettingsProxy::onSettingsChanged(quint64 revision, const QVariantMap &settings) {
    Q_UNUSED(revision);
    applySettingsMap(settings);
}

void SettingsProxy::applySettingsMap(const QVariantMap &settings) {
    if (settings.contains(QStringLiteral("theme")) && m_theme != settings.value(QStringLiteral("theme")).toString()) {
        m_theme = settings.value(QStringLiteral("theme")).toString();
        emit themeChanged();
    }
    if (settings.contains(QStringLiteral("capsuleSize")) && m_capsuleSize != settings.value(QStringLiteral("capsuleSize")).toString()) {
        m_capsuleSize = settings.value(QStringLiteral("capsuleSize")).toString();
        emit capsuleSizeChanged();
    }
    if (settings.contains(QStringLiteral("animationEnabled")) && m_animationEnabled != settings.value(QStringLiteral("animationEnabled")).toBool()) {
        m_animationEnabled = settings.value(QStringLiteral("animationEnabled")).toBool();
        emit animationEnabledChanged();
    }
    if (settings.contains(QStringLiteral("hoverPreviewEnabled")) && m_hoverPreviewEnabled != settings.value(QStringLiteral("hoverPreviewEnabled")).toBool()) {
        m_hoverPreviewEnabled = settings.value(QStringLiteral("hoverPreviewEnabled")).toBool();
        emit hoverPreviewEnabledChanged();
    }
    if (settings.contains(QStringLiteral("notificationPeekEnabled")) && m_notificationPeekEnabled != settings.value(QStringLiteral("notificationPeekEnabled")).toBool()) {
        m_notificationPeekEnabled = settings.value(QStringLiteral("notificationPeekEnabled")).toBool();
        emit notificationPeekEnabledChanged();
    }
    if (settings.contains(QStringLiteral("smartAdaptiveEnabled")) && m_smartAdaptiveEnabled != settings.value(QStringLiteral("smartAdaptiveEnabled")).toBool()) {
        m_smartAdaptiveEnabled = settings.value(QStringLiteral("smartAdaptiveEnabled")).toBool();
        emit smartAdaptiveEnabledChanged();
    }
    if (settings.contains(QStringLiteral("preferredPlayerId")) && m_preferredPlayerId != settings.value(QStringLiteral("preferredPlayerId")).toString()) {
        m_preferredPlayerId = settings.value(QStringLiteral("preferredPlayerId")).toString();
        emit preferredPlayerIdChanged();
    }
    if (settings.contains(QStringLiteral("displayMode")) && m_displayMode != settings.value(QStringLiteral("displayMode")).toString()) {
        m_displayMode = settings.value(QStringLiteral("displayMode")).toString();
        emit displayModeChanged();
    }
}

void SettingsProxy::sendPatch(const QVariantMap &patch) {
    if (!m_connected || !m_bus.isConnected()) {
        m_errorMessage = QStringLiteral("Core service is offline");
        emit errorMessageChanged();
        return;
    }

    m_busy = true;
    emit busyChanged();

    QDBusInterface coreIface(
        QStringLiteral("io.github.linuxisland.Core"),
        QStringLiteral("/io/github/linuxisland/Core"),
        QStringLiteral("io.github.linuxisland.Core1"),
        m_bus);

    QDBusPendingCall call = coreIface.asyncCall(QStringLiteral("UpdateSettings"), patch);
    auto *watcher = new QDBusPendingCallWatcher(call, this);
    connect(watcher, &QDBusPendingCallWatcher::finished, this, [this](QDBusPendingCallWatcher *w) {
        w->deleteLater();
        m_busy = false;
        emit busyChanged();

        QDBusPendingReply<quint64> reply = *w;
        if (reply.isValid()) {
            m_errorMessage.clear();
            emit errorMessageChanged();
        } else {
            m_errorMessage = reply.error().message();
            emit errorMessageChanged();
            // Refresh on error to restore committed server state
            refresh();
        }
    });
}

void SettingsProxy::setTheme(const QString &theme) {
    if (m_theme != theme) {
        sendPatch({{QStringLiteral("theme"), theme}});
    }
}

void SettingsProxy::setCapsuleSize(const QString &size) {
    if (m_capsuleSize != size) {
        sendPatch({{QStringLiteral("capsuleSize"), size}});
    }
}

void SettingsProxy::setAnimationEnabled(bool enabled) {
    if (m_animationEnabled != enabled) {
        sendPatch({{QStringLiteral("animationEnabled"), enabled}});
    }
}

void SettingsProxy::setHoverPreviewEnabled(bool enabled) {
    if (m_hoverPreviewEnabled != enabled) {
        sendPatch({{QStringLiteral("hoverPreviewEnabled"), enabled}});
    }
}

void SettingsProxy::setNotificationPeekEnabled(bool enabled) {
    if (m_notificationPeekEnabled != enabled) {
        sendPatch({{QStringLiteral("notificationPeekEnabled"), enabled}});
    }
}

void SettingsProxy::setSmartAdaptiveEnabled(bool enabled) {
    if (m_smartAdaptiveEnabled != enabled) {
        sendPatch({{QStringLiteral("smartAdaptiveEnabled"), enabled}});
    }
}

void SettingsProxy::setPreferredPlayerId(const QString &id) {
    if (m_preferredPlayerId != id) {
        sendPatch({{QStringLiteral("preferredPlayerId"), id}});
    }
}
