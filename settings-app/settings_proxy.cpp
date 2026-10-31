#include "settings_proxy.h"
#include <algorithm>
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
    queryAvailablePlayers();

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
    if (serviceName == QLatin1String("io.github.linuxisland.Core")) {
        Q_UNUSED(oldOwner);
        bool hasOwner = !newOwner.isEmpty();
        if (m_connected != hasOwner) {
            m_connected = hasOwner;
            emit connectedChanged();
        }
        if (hasOwner) {
            refresh();
        }
    } else if (serviceName.startsWith(QLatin1String("org.mpris.MediaPlayer2."))) {
        if (newOwner.isEmpty()) {
            if (m_availablePlayers.removeOne(serviceName)) {
                emit availablePlayersChanged();
            }
        } else if (oldOwner.isEmpty() || !m_availablePlayers.contains(serviceName)) {
            if (!m_availablePlayers.contains(serviceName)) {
                m_availablePlayers.append(serviceName);
                std::sort(m_availablePlayers.begin(), m_availablePlayers.end());
                emit availablePlayersChanged();
            }
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
    if (settings.contains(QStringLiteral("whatsappIntegrationEnabled")) && m_whatsappIntegrationEnabled != settings.value(QStringLiteral("whatsappIntegrationEnabled")).toBool()) {
        m_whatsappIntegrationEnabled = settings.value(QStringLiteral("whatsappIntegrationEnabled")).toBool();
        emit whatsappIntegrationEnabledChanged();
    }
    if (settings.contains(QStringLiteral("preferredPlayerId")) && m_preferredPlayerId != settings.value(QStringLiteral("preferredPlayerId")).toString()) {
        m_preferredPlayerId = settings.value(QStringLiteral("preferredPlayerId")).toString();
        emit preferredPlayerIdChanged();
    }
    if (settings.contains(QStringLiteral("displayMode")) && m_displayMode != settings.value(QStringLiteral("displayMode")).toString()) {
        m_displayMode = settings.value(QStringLiteral("displayMode")).toString();
        emit displayModeChanged();
    }
    if (settings.contains(QStringLiteral("verticalOffset")) && m_verticalOffset != settings.value(QStringLiteral("verticalOffset")).toInt()) {
        m_verticalOffset = settings.value(QStringLiteral("verticalOffset")).toInt();
        emit verticalOffsetChanged();
    }
    if (settings.contains(QStringLiteral("horizontalOffset")) && m_horizontalOffset != settings.value(QStringLiteral("horizontalOffset")).toInt()) {
        m_horizontalOffset = settings.value(QStringLiteral("horizontalOffset")).toInt();
        emit horizontalOffsetChanged();
    }
    if (settings.contains(QStringLiteral("searchEngine")) && m_searchEngine != settings.value(QStringLiteral("searchEngine")).toString()) {
        m_searchEngine = settings.value(QStringLiteral("searchEngine")).toString();
        emit searchEngineChanged();
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

void SettingsProxy::setWhatsappIntegrationEnabled(bool enabled) {
    if (m_whatsappIntegrationEnabled != enabled) {
        sendPatch({{QStringLiteral("whatsappIntegrationEnabled"), enabled}});
    }
}

void SettingsProxy::setPreferredPlayerId(const QString &id) {
    if (m_preferredPlayerId != id) {
        sendPatch({{QStringLiteral("preferredPlayerId"), id}});
    }
}

void SettingsProxy::setVerticalOffset(int val) {
    int clamped = std::clamp(val, 0, 120);
    if (m_verticalOffset != clamped) {
        m_verticalOffset = clamped;
        emit verticalOffsetChanged();
        sendPatch({{QStringLiteral("verticalOffset"), clamped}});
    }
}

void SettingsProxy::setHorizontalOffset(int val) {
    int clamped = std::clamp(val, -500, 500);
    if (m_horizontalOffset != clamped) {
        m_horizontalOffset = clamped;
        emit horizontalOffsetChanged();
        sendPatch({{QStringLiteral("horizontalOffset"), clamped}});
    }
}

void SettingsProxy::setDisplayMode(const QString &mode) {
    if (m_displayMode != mode) {
        sendPatch({{QStringLiteral("displayMode"), mode}});
    }
}

void SettingsProxy::setSearchEngine(const QString &engine) {
    if (m_searchEngine != engine) {
        m_searchEngine = engine;
        emit searchEngineChanged();
        sendPatch({{QStringLiteral("searchEngine"), engine}});
    }
}

void SettingsProxy::queryAvailablePlayers() {
    if (!m_bus.isConnected()) {
        return;
    }

    QDBusInterface dbusIface(
        QStringLiteral("org.freedesktop.DBus"),
        QStringLiteral("/org/freedesktop/DBus"),
        QStringLiteral("org.freedesktop.DBus"),
        m_bus);

    QDBusPendingCall call = dbusIface.asyncCall(QStringLiteral("ListNames"));
    auto *watcher = new QDBusPendingCallWatcher(call, this);
    connect(watcher, &QDBusPendingCallWatcher::finished, this, [this](QDBusPendingCallWatcher *w) {
        w->deleteLater();
        QDBusPendingReply<QStringList> reply = *w;
        if (reply.isValid()) {
            QStringList players;
            for (const auto &name : reply.value()) {
                if (name.startsWith(QLatin1String("org.mpris.MediaPlayer2."))) {
                    players.append(name);
                }
            }
            std::sort(players.begin(), players.end());
            if (m_availablePlayers != players) {
                m_availablePlayers = players;
                emit availablePlayersChanged();
            }
        }
    });
}

QString SettingsProxy::playerDisplayName(const QString &playerId) const {
    if (playerId.isEmpty()) {
        return QStringLiteral("Automatic (Active playback)");
    }
    const QString prefix = QStringLiteral("org.mpris.MediaPlayer2.");
    if (playerId.startsWith(prefix)) {
        QString name = playerId.mid(prefix.length());
        QString base = name.section(QLatin1Char('.'), 0, 0);
        if (!base.isEmpty()) {
            base[0] = base[0].toUpper();
            return base;
        }
    }
    return playerId;
}
