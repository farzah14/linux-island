#pragma once

#include <QObject>
#include <QDBusContext>
#include <QVariantMap>
#include <QString>
#include <cmath>
#include "events/revision_clock.h"
#include "settings/settings_store.h"
#include "media/media_state.h"
#include "dbus/variant_codec.h"
#include "media/player_registry.h"
#include "media/mpris_controller.h"

class CoreService : public QObject, public QDBusContext {
    Q_OBJECT
public:
    explicit CoreService(QObject *parent = nullptr)
        : CoreService(QString(), QDBusConnection::sessionBus(), parent) {}

    explicit CoreService(const QString &configPath, QObject *parent = nullptr)
        : CoreService(configPath, QDBusConnection::sessionBus(), parent) {}

    explicit CoreService(const QString &configPath,
                         const QDBusConnection &bus,
                         QObject *parent = nullptr)
        : QObject(parent),
          m_status(QStringLiteral("ready")),
          m_settingsStore(configPath, this),
          m_playerRegistry(bus, this),
          m_controller(bus, this) {
        connect(&m_playerRegistry, &PlayerRegistry::mediaStateChanged, this, [this](const MediaState &state) {
            setMediaState(state);
        });
        QString pref = m_settingsStore.settings().value(QStringLiteral("preferredPlayerId")).toString();
        m_playerRegistry.setPreferredPlayerId(pref);
    }
    QString instanceId() const { return m_clock.instanceId(); }
    QString status() const { return m_status; }
    quint64 mediaRevision() const { return m_clock.mediaRevision(); }
    quint64 settingsRevision() const { return m_clock.settingsRevision(); }
    QVariantMap snapshot() const {
        QVariantMap snap;
        snap[QStringLiteral("schemaVersion")] = QVariant::fromValue<quint32>(1);
        snap[QStringLiteral("instanceId")] = m_clock.instanceId();
        snap[QStringLiteral("status")] = m_status;
        snap[QStringLiteral("mediaRevision")] = QVariant::fromValue<quint64>(m_clock.mediaRevision());
        snap[QStringLiteral("settingsRevision")] = QVariant::fromValue<quint64>(m_clock.settingsRevision());
        snap[QStringLiteral("media")] = mediaState();
        snap[QStringLiteral("settings")] = m_settingsStore.settings();
        snap[QStringLiteral("capabilities")] = m_capabilities;
        return snap;
    }

    QVariantMap mediaState() const {
        auto media = toMediaVariantMap(m_mediaState);
        media[QStringLiteral("audioLevels")] = m_audioLevels;
        return media;
    }

    void setAudioLevels(const QVariantList &levels) {
        if (levels.size() != 3 || m_mediaState.playbackStatus != QLatin1String("Playing")) return;
        for (const auto &value : levels)
            if (!std::isfinite(value.toDouble()) || value.toDouble() < 0 || value.toDouble() > 1) return;
        if (levels == m_audioLevels) return;
        m_audioLevels = levels;
        m_mediaState.revision = m_clock.mediaChanged();
        emit mediaChanged(m_mediaState.revision, mediaState());
    }

    QVariantMap settings() const {
        return m_settingsStore.settings();
    }
    void refreshMediaPosition() { m_playerRegistry.refreshPosition(); }
    bool controlMedia(const QString &action) {
        auto result = m_controller.perform(action, m_playerRegistry.activePlayerId(), m_playerRegistry.activeMediaState());
        if (!result.accepted) {
            if (calledFromDBus()) {
                setDelayedReply(true);
                sendErrorReply(result.errorName, result.errorMessage);
            }
            return false;
        }
        return true;
    }

    bool setActivePlayer(const QString &playerId) {
        if (!m_playerRegistry.availablePlayers().contains(playerId)) {
            if (calledFromDBus()) {
                setDelayedReply(true);
                sendErrorReply(QStringLiteral("io.github.linuxisland.Error.PlayerUnavailable"),
                               QStringLiteral("Requested player is not available: ") + playerId);
            }
            return false;
        }
        m_playerRegistry.setActivePlayer(playerId);
        return true;
    }

    quint64 updateSettings(const QVariantMap &changes) {
        if (changes.isEmpty()) {
            return m_clock.settingsRevision();
        }
        auto result = m_settingsStore.updateSettings(changes);
        if (!result.ok) {
            if (calledFromDBus()) {
                setDelayedReply(true);
                if (result.isWriteError) {
                    sendErrorReply(QStringLiteral("io.github.linuxisland.Error.SettingsWriteFailed"), result.error);
                } else {
                    sendErrorReply(QStringLiteral("org.freedesktop.DBus.Error.InvalidArgument"), result.error);
                }
            }
            return m_clock.settingsRevision();
        }
        quint64 rev = m_clock.settingsChanged();
        if (result.effective.contains(QStringLiteral("preferredPlayerId"))) {
            m_playerRegistry.setPreferredPlayerId(result.effective.value(QStringLiteral("preferredPlayerId")).toString());
        }
        emit settingsChanged(rev, result.effective);
        return rev;
    }

    void setStatus(const QString &status) {
        if (m_status != status) {
            m_status = status;
            emit coreStatusChanged(m_status);
        }
    }

    void setMediaState(const MediaState &media) {
        if (media.playerId != m_mediaState.playerId || media.playbackStatus != QLatin1String("Playing"))
            m_audioLevels = {0.0, 0.0, 0.0};
        m_mediaState = media;
        quint64 rev = m_clock.mediaChanged();
        m_mediaState.revision = rev;
        emit mediaChanged(rev, mediaState());
    }

    void setSettings(const QVariantMap &settings) {
        auto result = m_settingsStore.updateSettings(settings);
        if (result.ok) {
            quint64 rev = m_clock.settingsChanged();
            emit settingsChanged(rev, result.effective);
        }
    }

signals:
    void mediaChanged(quint64 revision, const QVariantMap &media);
    void settingsChanged(quint64 revision, const QVariantMap &settings);
    void coreStatusChanged(const QString &status);

private:
    RevisionClock m_clock;
    QString m_status;
    MediaState m_mediaState;
    SettingsStore m_settingsStore;
    PlayerRegistry m_playerRegistry;
    MprisController m_controller;
    QVariantMap m_capabilities;
    QVariantList m_audioLevels{0.0, 0.0, 0.0};
};
