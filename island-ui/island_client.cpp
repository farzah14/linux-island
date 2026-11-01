#include "island_client.h"
#include <QDBusArgument>
#include <QDBusInterface>
#include <QDBusReply>
#include <QDBusMessage>
#include <QDBusPendingCall>
#include <QDBusPendingCallWatcher>
#include <algorithm>
#include <cmath>

namespace {
// GetSnapshot returns nested a{sv} values as QDBusArgument, which toMap()
// silently turns into an empty map. Demarshal those explicitly.
QVariantMap variantToMap(const QVariant &value) {
    if (value.metaType().id() == qMetaTypeId<QDBusArgument>()) {
        return qdbus_cast<QVariantMap>(value.value<QDBusArgument>());
    }
    return value.toMap();
}
} // namespace

IslandClient::IslandClient(const QDBusConnection &bus, QObject *parent)
    : QObject(parent),
      m_bus(bus) {
    m_peekTimer.setSingleShot(true);
    connect(&m_peekTimer, &QTimer::timeout, this, &IslandClient::onPeekTimeout);

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
            QStringLiteral("MediaChanged"),
            this,
            SLOT(onMediaChanged(quint64,QVariantMap)));

        m_bus.connect(
            QStringLiteral("io.github.linuxisland.Core"),
            QStringLiteral("/io/github/linuxisland/Core"),
            QStringLiteral("io.github.linuxisland.Core1"),
            QStringLiteral("SettingsChanged"),
            this,
            SLOT(onSettingsChanged(quint64,QVariantMap)));

        m_bus.connect(
            QStringLiteral("io.github.linuxisland.Core"),
            QStringLiteral("/io/github/linuxisland/Core"),
            QStringLiteral("io.github.linuxisland.Core1"),
            QStringLiteral("CoreStatusChanged"),
            this,
            SLOT(onCoreStatusChanged(QString)));

        fetchSnapshot();
        queryAvailablePlayers();
    }
}

QString IslandClient::transitionState(const QString &currentState, const QString &event) {
    if (event == QLatin1String("FULLSCREEN_ON")) {
        return QStringLiteral("HIDDEN");
    }
    if (currentState == QLatin1String("HIDDEN")) {
        if (event == QLatin1String("FULLSCREEN_OFF")) {
            return QStringLiteral("COMPACT");
        }
        return currentState;
    }
    if (currentState == QLatin1String("COMPACT")) {
        if (event == QLatin1String("CLICK")) return QStringLiteral("EXPANDED");
        if (event == QLatin1String("HOVER_ENTER")) return QStringLiteral("PREVIEW");
        if (event == QLatin1String("PEEK_REQUEST")) return QStringLiteral("PEEK");
        return currentState;
    }
    if (currentState == QLatin1String("PREVIEW")) {
        if (event == QLatin1String("HOVER_LEAVE")) return QStringLiteral("COMPACT");
        if (event == QLatin1String("CLICK")) return QStringLiteral("EXPANDED");
        if (event == QLatin1String("PEEK_REQUEST")) return QStringLiteral("PEEK");
        return currentState;
    }
    if (currentState == QLatin1String("EXPANDED")) {
        if (event == QLatin1String("DISMISS")) return QStringLiteral("COMPACT");
        return currentState;
    }
    if (currentState == QLatin1String("PEEK")) {
        if (event == QLatin1String("PEEK_TIMEOUT")) return QStringLiteral("COMPACT");
        if (event == QLatin1String("CLICK")) return QStringLiteral("EXPANDED");
        return currentState;
    }
    return currentState;
}

void IslandClient::dispatchEvent(const QString &event) {
    QString next = transitionState(m_uiState, event);
    if (next != m_uiState) {
        m_uiState = next;
        if (m_uiState == QLatin1String("PEEK")) {
            m_peekTimer.start(4000);
        } else {
            m_peekTimer.stop();
        }
        emit uiStateChanged();
    }
}

void IslandClient::onPeekTimeout() {
    dispatchEvent(QStringLiteral("PEEK_TIMEOUT"));
}

QString IslandClient::formatTime(qlonglong us) {
    if (us < 0) us = 0;
    qint64 totalSec = us / 1000000;
    qint64 m = totalSec / 60;
    qint64 s = totalSec % 60;
    return QString::number(m) + QStringLiteral(":") + (s < 10 ? QStringLiteral("0") : QStringLiteral("")) + QString::number(s);
}

double IslandClient::clampVolume(double value) {
    if (std::isnan(value)) {
        return 1.0;
    }
    return std::clamp(value, 0.0, 1.0);
}

double IslandClient::progress() const {
    if (m_durationUs > 0 && m_positionUs >= 0) {
        return std::clamp(double(m_positionUs) / double(m_durationUs), 0.0, 1.0);
    }
    return 0.0;
}

QString IslandClient::timeElapsedText() const {
    return formatTime(m_positionUs);
}

QString IslandClient::timeTotalText() const {
    return formatTime(m_durationUs);
}

bool IslandClient::effectiveDarkTheme() const {
    if (m_theme == QLatin1String("light")) return false;
    // Default or "dark" or "system" defaults to dark Warm Minimalist
    return true;
}

void IslandClient::cycleTheme() {
    QString next;
    if (m_theme == QLatin1String("system")) next = QStringLiteral("dark");
    else if (m_theme == QLatin1String("dark")) next = QStringLiteral("light");
    else next = QStringLiteral("system");

    updateSettings({{QStringLiteral("theme"), next}});
}

void IslandClient::controlMedia(const QString &action) {
    if (!m_bus.isConnected()) return;

    QDBusInterface iface(
        QStringLiteral("io.github.linuxisland.Core"),
        QStringLiteral("/io/github/linuxisland/Core"),
        QStringLiteral("io.github.linuxisland.Core1"),
        m_bus);

    if (iface.isValid()) {
        iface.asyncCall(QStringLiteral("ControlMedia"), action);
    }
}

void IslandClient::seekToFraction(double fraction) {
    if (m_durationUs > 0) {
        qlonglong targetUs = qlonglong(std::clamp(fraction, 0.0, 1.0) * double(m_durationUs));
        controlMedia(QStringLiteral("SeekTo:") + QString::number(targetUs));
    }
}

void IslandClient::setVolume(double value) {
    const double v = clampVolume(value);
    m_volume = v;
    emit mediaChanged();
    controlMedia(QStringLiteral("Volume:") + QString::number(v, 'f', 2));
}

void IslandClient::setActivePlayer(const QString &playerId) {
    if (!m_bus.isConnected() || playerId.isEmpty()) return;

    QDBusInterface iface(
        QStringLiteral("io.github.linuxisland.Core"),
        QStringLiteral("/io/github/linuxisland/Core"),
        QStringLiteral("io.github.linuxisland.Core1"),
        m_bus);

    if (iface.isValid()) {
        iface.asyncCall(QStringLiteral("SetActivePlayer"), playerId);
    }
}

void IslandClient::cycleActivePlayer() {
    if (m_availablePlayers.size() <= 1) return;
    int idx = m_availablePlayers.indexOf(m_playerId);
    int nextIdx = (idx + 1) % m_availablePlayers.size();
    setActivePlayer(m_availablePlayers.at(nextIdx));
}

void IslandClient::updateSettings(const QVariantMap &patch) {
    if (patch.contains(QStringLiteral("searchEngine")) && m_searchEngine != patch.value(QStringLiteral("searchEngine")).toString()) {
        m_searchEngine = patch.value(QStringLiteral("searchEngine")).toString();
        emit settingsChanged();
    }

    if (!m_bus.isConnected() || patch.isEmpty()) return;

    QDBusInterface iface(
        QStringLiteral("io.github.linuxisland.Core"),
        QStringLiteral("/io/github/linuxisland/Core"),
        QStringLiteral("io.github.linuxisland.Core1"),
        m_bus);

    if (iface.isValid()) {
        iface.asyncCall(QStringLiteral("UpdateSettings"), patch);
    }
}

void IslandClient::onNameOwnerChanged(const QString &serviceName, const QString &oldOwner, const QString &newOwner) {
    Q_UNUSED(oldOwner);
    if (serviceName == QLatin1String("io.github.linuxisland.Core")) {
        bool nowConnected = !newOwner.isEmpty();
        if (m_connected != nowConnected) {
            m_connected = nowConnected;
            emit connectedChanged();
            if (m_connected) {
                fetchSnapshot();
            }
        }
    } else if (serviceName.startsWith(QLatin1String("org.mpris.MediaPlayer2."))) {
        queryAvailablePlayers();
    }
}

void IslandClient::onMediaChanged(quint64 revision, const QVariantMap &media) {
    Q_UNUSED(revision);
    applyMediaMap(media);
}

void IslandClient::onSettingsChanged(quint64 revision, const QVariantMap &settings) {
    Q_UNUSED(revision);
    applySettingsMap(settings);
}

void IslandClient::onCoreStatusChanged(const QString &status) {
    // Core announces itself as "ready"; a live-but-busy service reports
    // "active". Both mean the D-Bus name is owned and calls will succeed.
    bool ready = (status == QLatin1String("ready") || status == QLatin1String("active"));
    if (m_connected != ready) {
        m_connected = ready;
        emit connectedChanged();
    }
}

void IslandClient::applyMediaMap(const QVariantMap &media) {
    m_playerId = media.value(QStringLiteral("playerId")).toString();
    m_title = media.value(QStringLiteral("title")).toString();
    m_artist = media.value(QStringLiteral("artist")).toString();
    m_albumArtUri = media.value(QStringLiteral("albumArtUri")).toString();
    m_playbackStatus = media.value(QStringLiteral("playbackStatus"), QStringLiteral("Stopped")).toString();
    m_positionUs = media.value(QStringLiteral("positionUs")).toLongLong();
    m_durationUs = media.value(QStringLiteral("durationUs")).toLongLong();
    m_canPlay = media.value(QStringLiteral("canPlay")).toBool();
    m_canPause = media.value(QStringLiteral("canPause")).toBool();
    m_canNext = media.value(QStringLiteral("canNext")).toBool();
    m_canPrevious = media.value(QStringLiteral("canPrevious")).toBool();
    m_canSeek = media.value(QStringLiteral("canSeek")).toBool();

    if (media.contains(QStringLiteral("audioLevels"))) {
        m_audioLevels = media.value(QStringLiteral("audioLevels")).toList();
    }

    m_volume = clampVolume(media.value(QStringLiteral("volume"), 1.0).toDouble());

    emit mediaChanged();
}

void IslandClient::applySettingsMap(const QVariantMap &settings) {
    if (settings.contains(QStringLiteral("theme"))) m_theme = settings.value(QStringLiteral("theme")).toString();
    if (settings.contains(QStringLiteral("capsuleSize"))) m_capsuleSize = settings.value(QStringLiteral("capsuleSize")).toString();
    if (settings.contains(QStringLiteral("animationEnabled"))) m_animationEnabled = settings.value(QStringLiteral("animationEnabled")).toBool();
    if (settings.contains(QStringLiteral("hoverPreviewEnabled"))) m_hoverPreviewEnabled = settings.value(QStringLiteral("hoverPreviewEnabled")).toBool();
    if (settings.contains(QStringLiteral("notificationPeekEnabled"))) m_notificationPeekEnabled = settings.value(QStringLiteral("notificationPeekEnabled")).toBool();
    if (settings.contains(QStringLiteral("smartAdaptiveEnabled"))) m_smartAdaptiveEnabled = settings.value(QStringLiteral("smartAdaptiveEnabled")).toBool();
    if (settings.contains(QStringLiteral("whatsappIntegrationEnabled"))) m_whatsappIntegrationEnabled = settings.value(QStringLiteral("whatsappIntegrationEnabled")).toBool();
    if (settings.contains(QStringLiteral("displayMode"))) m_displayMode = settings.value(QStringLiteral("displayMode")).toString();
    if (settings.contains(QStringLiteral("verticalOffset"))) m_verticalOffset = settings.value(QStringLiteral("verticalOffset")).toInt();
    if (settings.contains(QStringLiteral("horizontalOffset"))) m_horizontalOffset = settings.value(QStringLiteral("horizontalOffset")).toInt();
    if (settings.contains(QStringLiteral("searchEngine"))) m_searchEngine = settings.value(QStringLiteral("searchEngine")).toString();

    emit settingsChanged();
}

void IslandClient::fetchSnapshot() {
    if (!m_bus.isConnected()) return;

    QDBusInterface iface(
        QStringLiteral("io.github.linuxisland.Core"),
        QStringLiteral("/io/github/linuxisland/Core"),
        QStringLiteral("io.github.linuxisland.Core1"),
        m_bus);

    if (!iface.isValid()) return;

    QDBusPendingCall call = iface.asyncCall(QStringLiteral("GetSnapshot"));
    QDBusPendingCallWatcher *watcher = new QDBusPendingCallWatcher(call, this);
    connect(watcher, &QDBusPendingCallWatcher::finished, this, [this](QDBusPendingCallWatcher *w) {
        w->deleteLater();
        QDBusReply<QVariantMap> reply = *w;
        if (reply.isValid()) {
            m_connected = true;
            emit connectedChanged();

            QVariantMap snapshot = reply.value();
            if (snapshot.contains(QStringLiteral("media"))) {
                applyMediaMap(variantToMap(snapshot.value(QStringLiteral("media"))));
            }
            if (snapshot.contains(QStringLiteral("settings"))) {
                applySettingsMap(variantToMap(snapshot.value(QStringLiteral("settings"))));
            }
        }
    });
}

void IslandClient::queryAvailablePlayers() {
    if (!m_bus.isConnected()) return;

    QDBusInterface iface(
        QStringLiteral("org.freedesktop.DBus"),
        QStringLiteral("/org/freedesktop/DBus"),
        QStringLiteral("org.freedesktop.DBus"),
        m_bus);

    if (!iface.isValid()) return;

    QDBusPendingCall call = iface.asyncCall(QStringLiteral("ListNames"));
    QDBusPendingCallWatcher *watcher = new QDBusPendingCallWatcher(call, this);
    connect(watcher, &QDBusPendingCallWatcher::finished, this, [this](QDBusPendingCallWatcher *w) {
        w->deleteLater();
        QDBusReply<QStringList> reply = *w;
        if (reply.isValid()) {
            QStringList players;
            for (const QString &name : reply.value()) {
                if (name.startsWith(QLatin1String("org.mpris.MediaPlayer2."))) {
                    players.append(name);
                }
            }
            if (m_availablePlayers != players) {
                m_availablePlayers = players;
                emit availablePlayersChanged();
            }
        }
    });
}
