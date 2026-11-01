#include "player_registry.h"
#include "media_normalizer.h"
#include <QDBusInterface>
#include <QDBusReply>
#include <QDBusPendingCall>
#include <QDBusPendingCallWatcher>
#include <QDBusPendingReply>
#include <QDBusConnectionInterface>
#include <algorithm>
#include <chrono>
#include <limits>

static qint64 monotonicUs() {
    return std::chrono::duration_cast<std::chrono::microseconds>(
        std::chrono::steady_clock::now().time_since_epoch()).count();
}

static QVariantMap unpackMetaMap(const QVariant &var) {
    if (var.canConvert<QDBusArgument>()) {
        QVariantMap map = qdbus_cast<QVariantMap>(var.value<QDBusArgument>());
        if (!map.isEmpty())
            return map;
    }
    return var.toMap();
}

QString chooseActivePlayer(const QList<PlayerSummary> &players, const QString &preferredId) {
    if (players.isEmpty()) {
        return QString();
    }

    if (!preferredId.isEmpty()) {
        for (const auto &p : players) {
            if (p.serviceName == preferredId) {
                return preferredId;
            }
        }
    }

    QList<PlayerSummary> playing;
    for (const auto &p : players) {
        if (p.playbackStatus == QLatin1String("Playing")) {
            playing.append(p);
        }
    }

    if (!playing.isEmpty()) {
        std::sort(playing.begin(), playing.end(), [](const PlayerSummary &a, const PlayerSummary &b) {
            return a.serviceName < b.serviceName;
        });
        return playing.first().serviceName;
    }

    QList<PlayerSummary> sorted = players;
    std::sort(sorted.begin(), sorted.end(), [](const PlayerSummary &a, const PlayerSummary &b) {
        return a.serviceName < b.serviceName;
    });
    return sorted.first().serviceName;
}

PlayerRegistry::PlayerRegistry(const QDBusConnection &bus, QObject *parent)
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

        refresh();
    }
}

PlayerRegistry::~PlayerRegistry() {
    m_isDestroyed = true;
    for (const auto &service : m_players.keys()) {
        unsubscribePlayerSignals(service);
    }
}

QString PlayerRegistry::activePlayerId() const {
    return m_activeId;
}

MediaState PlayerRegistry::activeMediaState() const {
    if (m_players.contains(m_activeId)) {
        return m_players.value(m_activeId).normalizedState;
    }
    return MediaState{};
}

QStringList PlayerRegistry::availablePlayers() const {
    return m_players.keys();
}

bool PlayerRegistry::setActivePlayer(const QString &playerId) {
    if (playerId.isEmpty()) {
        m_overrideActiveId.clear();
        reevaluateActivePlayer();
        return true;
    }
    if (m_players.contains(playerId)) {
        m_overrideActiveId = playerId;
        reevaluateActivePlayer();
        return true;
    }
    return false;
}

void PlayerRegistry::setPreferredPlayerId(const QString &playerId) {
    if (m_preferredId != playerId) {
        m_preferredId = playerId;
        reevaluateActivePlayer();
    }
}

void PlayerRegistry::refresh() {
    if (!m_bus.isConnected() || m_isDestroyed)
        return;

    QDBusInterface dbusIface(
        QStringLiteral("org.freedesktop.DBus"),
        QStringLiteral("/org/freedesktop/DBus"),
        QStringLiteral("org.freedesktop.DBus"),
        m_bus);

    QDBusPendingCall call = dbusIface.asyncCall(QStringLiteral("ListNames"));
    auto *watcher = new QDBusPendingCallWatcher(call, this);
    connect(watcher, &QDBusPendingCallWatcher::finished, this, [this](QDBusPendingCallWatcher *w) {
        w->deleteLater();
        if (m_isDestroyed)
            return;
        QDBusPendingReply<QStringList> reply = *w;
        if (reply.isValid()) {
            for (const auto &name : reply.value()) {
                if (name.startsWith(QLatin1String("org.mpris.MediaPlayer2."))) {
                    if (!m_players.contains(name)) {
                        m_players[name] = PlayerData{name};
                        subscribePlayerSignals(name);
                        queryPlayerProperties(name);
                    }
                }
            }
            reevaluateActivePlayer();
        }
    });
}

void PlayerRegistry::onNameOwnerChanged(const QString &name, const QString &oldOwner, const QString &newOwner) {
    if (!name.startsWith(QLatin1String("org.mpris.MediaPlayer2.")) || m_isDestroyed)
        return;

    if (newOwner.isEmpty()) {
        // Player exited
        unsubscribePlayerSignals(name);
        m_players.remove(name);
        if (m_overrideActiveId == name)
            m_overrideActiveId.clear();
        reevaluateActivePlayer();
        emit playersChanged(m_players.keys());
    } else if (oldOwner.isEmpty() || !m_players.contains(name)) {
        // New player registered
        m_players[name] = PlayerData{name};
        subscribePlayerSignals(name);
        queryPlayerProperties(name);
        emit playersChanged(m_players.keys());
    } else {
        // Owner changed, re-query
        queryPlayerProperties(name);
    }
}

void PlayerRegistry::subscribePlayerSignals(const QString &serviceName) {
    if (!m_bus.isConnected() || m_isDestroyed)
        return;

    m_bus.connect(
        serviceName,
        QStringLiteral("/org/mpris/MediaPlayer2"),
        QStringLiteral("org.freedesktop.DBus.Properties"),
        QStringLiteral("PropertiesChanged"),
        this,
        SLOT(onPlayerPropertiesChanged(QString,QVariantMap,QStringList,QDBusMessage)));
    m_bus.connect(serviceName, QStringLiteral("/org/mpris/MediaPlayer2"),
        QStringLiteral("org.mpris.MediaPlayer2.Player"), QStringLiteral("Seeked"),
        this, SLOT(onPlayerSeeked(qint64,QDBusMessage)));
}

void PlayerRegistry::unsubscribePlayerSignals(const QString &serviceName) {
    if (!m_bus.isConnected())
        return;

    m_bus.disconnect(
        serviceName,
        QStringLiteral("/org/mpris/MediaPlayer2"),
        QStringLiteral("org.freedesktop.DBus.Properties"),
        QStringLiteral("PropertiesChanged"),
        this,
        SLOT(onPlayerPropertiesChanged(QString,QVariantMap,QStringList,QDBusMessage)));
    m_bus.disconnect(serviceName, QStringLiteral("/org/mpris/MediaPlayer2"),
        QStringLiteral("org.mpris.MediaPlayer2.Player"), QStringLiteral("Seeked"),
        this, SLOT(onPlayerSeeked(qint64,QDBusMessage)));
}

void PlayerRegistry::refreshPosition() {
    if (!m_activeId.isEmpty()) queryPlayerProperties(m_activeId);
}

QString PlayerRegistry::serviceForMessage(const QDBusMessage &msg) const {
    const QString sender = msg.service();
    for (auto it = m_players.cbegin(); it != m_players.cend(); ++it) {
        if (it.key() == sender || (!it->owner.isEmpty() && it->owner == sender))
            return it.key();
    }
    for (auto it = m_players.cbegin(); it != m_players.cend(); ++it) {
        if (m_bus.interface() && m_bus.interface()->serviceOwner(it.key()) == sender)
            return it.key();
    }
    return {};
}

void PlayerRegistry::onPlayerSeeked(qint64 position, const QDBusMessage &msg) {
    if (m_isDestroyed) return;
    const auto service = serviceForMessage(msg);
    if (!m_players.contains(service)) return;
    auto &data = m_players[service];
    ++data.querySequence; // A pending older GetAll must not undo this seek.
    data.properties[QStringLiteral("Position")] = std::max<qint64>(0, position);
    data.positionSampleUs = monotonicUs();
    data.normalizedState = normalizeMpris(service, data.metadata, data.properties);
    data.normalizedState.positionSampleUs = data.positionSampleUs;
    if (service == m_activeId) emit mediaStateChanged(data.normalizedState);
}

void PlayerRegistry::onPlayerPropertiesChanged(const QString &interfaceName,
                                              const QVariantMap &changedProps,
                                              const QStringList &invalidatedProps,
                                              const QDBusMessage &msg) {
    if (m_isDestroyed || interfaceName != QLatin1String("org.mpris.MediaPlayer2.Player"))
        return;

    const QString matchingService = serviceForMessage(msg);

    if (m_players.contains(matchingService)) {
        auto &data = m_players[matchingService];
        const auto now = monotonicUs();
        const auto previousMetadata = data.metadata;
        if (!changedProps.contains(QStringLiteral("Position")) && data.positionSampleUs > 0) {
            long double position = data.normalizedState.positionUs;
            if (data.playbackStatus == QLatin1String("Playing"))
                position += (now - data.positionSampleUs) * static_cast<long double>(data.normalizedState.rate);
            data.properties[QStringLiteral("Position")] = static_cast<qint64>(std::clamp<long double>(
                position, 0, std::numeric_limits<qint64>::max()));
        }
        data.positionSampleUs = now;
        for (auto it = changedProps.begin(); it != changedProps.end(); ++it) {
            data.properties[it.key()] = it.value();
            if (it.key() == QLatin1String("Metadata")) {
                data.metadata = unpackMetaMap(it.value());
            } else if (it.key() == QLatin1String("PlaybackStatus")) {
                data.playbackStatus = it.value().toString();
            }
        }
        if (!changedProps.contains(QStringLiteral("Position")) &&
            (previousMetadata.value(QStringLiteral("mpris:trackid")) != data.metadata.value(QStringLiteral("mpris:trackid")) ||
             previousMetadata.value(QStringLiteral("xesam:title")) != data.metadata.value(QStringLiteral("xesam:title"))))
            data.properties[QStringLiteral("Position")] = qint64(0);
        data.normalizedState = normalizeMpris(matchingService, data.metadata, data.properties);
        data.normalizedState.positionSampleUs = data.positionSampleUs;
        if (matchingService == m_activeId) {
            emit mediaStateChanged(data.normalizedState);
        }
        reevaluateActivePlayer();
        if (changedProps.contains(QStringLiteral("PlaybackStatus")) || changedProps.contains(QStringLiteral("Metadata")) ||
            changedProps.contains(QStringLiteral("Rate")) || invalidatedProps.contains(QStringLiteral("Position")))
            queryPlayerProperties(matchingService);
    }
}

void PlayerRegistry::queryPlayerProperties(const QString &serviceName) {
    if (!m_bus.isConnected() || m_isDestroyed || !m_players.contains(serviceName))
        return;
    const auto sequence = ++m_players[serviceName].querySequence;

    QDBusInterface propsIface(
        serviceName,
        QStringLiteral("/org/mpris/MediaPlayer2"),
        QStringLiteral("org.freedesktop.DBus.Properties"),
        m_bus);

    QDBusPendingCall call = propsIface.asyncCall(
        QStringLiteral("GetAll"),
        QStringLiteral("org.mpris.MediaPlayer2.Player"));

    auto *watcher = new QDBusPendingCallWatcher(call, this);
    connect(watcher, &QDBusPendingCallWatcher::finished, this, [this, serviceName, sequence](QDBusPendingCallWatcher *w) {
        w->deleteLater();
        if (m_isDestroyed || !m_players.contains(serviceName) || m_players[serviceName].querySequence != sequence)
            return;

        QDBusPendingReply<QVariantMap> reply = *w;
        if (reply.isValid()) {
            QVariantMap props = reply.value();
            QVariantMap meta = unpackMetaMap(props.value(QStringLiteral("Metadata")));

            auto &data = m_players[serviceName];
            const auto prevMeta = data.metadata;
            const bool sameTrack =
                prevMeta.value(QStringLiteral("mpris:trackid")) == meta.value(QStringLiteral("mpris:trackid")) &&
                prevMeta.value(QStringLiteral("xesam:title")) == meta.value(QStringLiteral("xesam:title"));
            if (!props.contains(QStringLiteral("Position")) && sameTrack &&
                data.properties.contains(QStringLiteral("Position"))) {
                props[QStringLiteral("Position")] = data.properties.value(QStringLiteral("Position"));
            }
            if (data.owner.isEmpty() && m_bus.interface()) {
                data.owner = m_bus.interface()->serviceOwner(serviceName);
            }
            data.properties = props;
            data.metadata = meta;
            data.playbackStatus = props.value(QStringLiteral("PlaybackStatus")).toString();
            data.normalizedState = normalizeMpris(serviceName, meta, props);
            data.positionSampleUs = monotonicUs();
            data.normalizedState.positionSampleUs = data.positionSampleUs;

            if (serviceName == m_activeId) {
                emit mediaStateChanged(data.normalizedState);
            }
            reevaluateActivePlayer();
        }
    });
}

void PlayerRegistry::reevaluateActivePlayer() {
    if (m_isDestroyed)
        return;

    QList<PlayerSummary> summaries;
    for (auto it = m_players.begin(); it != m_players.end(); ++it) {
        summaries.append({it.key(), it.value().playbackStatus});
    }

    QString preferred = !m_overrideActiveId.isEmpty() ? m_overrideActiveId : m_preferredId;
    QString nextActive = chooseActivePlayer(summaries, preferred);

    if (nextActive != m_activeId) {
        m_activeId = nextActive;
        emit activePlayerChanged(m_activeId);
        emit mediaStateChanged(activeMediaState());
    }
}
