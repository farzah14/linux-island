#pragma once

#include <QObject>
#include <QDBusContext>
#include <QVariantMap>
#include <QString>
#include <cmath>
#include <algorithm>
#include <QTimer>
#include <QPointer>
#include <QDBusConnection>
#include <QDBusArgument>
#include <QDateTime>
#include <memory>
#include "events/revision_clock.h"
#include "settings/settings_store.h"
#include "media/media_state.h"
#include "dbus/variant_codec.h"
#include "media/player_registry.h"
#include "media/mpris_controller.h"
#include "media/sink_volume.h"
#include "media/artwork_cache.h"
#include "time/timer_service.h"
#include "time/time_types.h"

class CoreService : public QObject, public QDBusContext {
    Q_OBJECT
public:
    explicit CoreService(QObject *parent = nullptr)
        : CoreService(QString(), QDBusConnection::sessionBus(), parent) {}

    explicit CoreService(const QString &configPath, QObject *parent = nullptr)
        : CoreService(configPath, QDBusConnection::sessionBus(), parent) {}

    explicit CoreService(const QString &configPath,
                         const QDBusConnection &bus,
                         QObject *parent = nullptr,
                         SinkVolume *sink = nullptr)
        : QObject(parent),
          m_bus(bus),
          m_status(QStringLiteral("ready")),
          m_settingsStore(configPath, this),
          m_playerRegistry(bus, this),
          m_controller(bus, sink, this) {
        connect(&m_playerRegistry, &PlayerRegistry::mediaStateChanged, this, [this](const MediaState &state) {
            setMediaState(state);
        });
        QString pref = m_settingsStore.settings().value(QStringLiteral("preferredPlayerId")).toString();
        m_playerRegistry.setPreferredPlayerId(pref);

        connect(&m_timer, &TimerService::changed, this, [this] {
            const quint64 rev = m_clock.timerChanged();
            QVariantMap payload = timerSnapshot();
            payload[QStringLiteral("revision")] = QVariant::fromValue<quint64>(rev);
            emit timerChanged(rev, payload);
        });
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
        // `volume` is the level the user actually hears, which on PipeWire is
        // the sink, not the player's own gain. `unmutedVolume` keeps the level
        // behind a mute so the UI can restore it, and both fall back to the
        // player's Volume property when no sink is available.
        const bool sinkKnown = m_systemVolumeKnown;
        media[QStringLiteral("volume")] = sinkKnown ? m_systemVolume : m_mediaState.volume;
        media[QStringLiteral("unmutedVolume")] = sinkKnown ? m_systemLevel : m_mediaState.volume;
        media[QStringLiteral("muted")] = sinkKnown ? m_systemMuted : m_mediaState.volume <= 0.0;
        return media;
    }

    // Fed by SinkVolume in app/main.cpp. Tests and headless runs leave the
    // sink unknown, so everything degrades to the media player's own volume.
    void setSystemVolume(double volume, bool muted, double level) {
        if (!std::isfinite(volume) || !std::isfinite(level)) return;
        volume = std::clamp(volume, 0.0, 1.0);
        level = std::clamp(level, 0.0, 1.0);
        const bool changed = !m_systemVolumeKnown ||
            std::abs(volume - m_systemVolume) > 0.002 ||
            muted != m_systemMuted;
        m_systemVolume = volume;
        m_systemMuted = muted;
        m_systemLevel = level;
        m_systemVolumeKnown = true;
        if (!changed) return;
        quint64 rev = m_clock.mediaChanged();
        m_mediaState.revision = rev;
        emit mediaChanged(rev, mediaState());
    }

    void setAudioLevels(const QVariantList &levels) {
        if (levels.size() != 3 || m_mediaState.playbackStatus != QLatin1String("Playing")) return;
        for (const auto &value : levels)
            if (!std::isfinite(value.toDouble()) || value.toDouble() < 0 || value.toDouble() > 1) return;
        if (m_audioLevels.size() == 3) {
            bool significant = false;
            for (int i = 0; i < 3; ++i) {
                double prev = m_audioLevels[i].toDouble();
                double next = levels[i].toDouble();
                if (std::abs(next - prev) >= 0.015 || (next == 0.0 && prev != 0.0)) {
                    significant = true;
                    break;
                }
            }
            if (!significant) return;
        }
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
        if (action.startsWith(QLatin1String("SeekTo:")) || action == QLatin1String("SeekForward") || action == QLatin1String("SeekBackward")) {
            QTimer::singleShot(150, this, [this] {
                m_playerRegistry.refreshPosition();
            });
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
        applyTimerSettings(result.effective);
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

        if (ArtworkCache::isRemoteUrl(media.albumArtUri)) {
            QString rawRemote = media.albumArtUri;
            m_mediaState.albumArtUri = QString();
            bool syncResolved = false;
            bool inFetchCall = true;
            QPointer<CoreService> self(this);
            m_artworkCache.fetchArtwork(media.playerId, rawRemote,
                [self, &syncResolved, &inFetchCall, playerId = media.playerId, rawRemote](const QString &cachedUri) {
                    if (!self) return;
                    if (inFetchCall) {
                        self->m_mediaState.albumArtUri = cachedUri;
                        syncResolved = true;
                        return;
                    }
                    if (self->m_mediaState.playerId == playerId &&
                        (self->m_mediaState.albumArtUri == rawRemote || self->m_mediaState.albumArtUri.isEmpty())) {
                        self->m_mediaState.albumArtUri = cachedUri;
                        quint64 rev = self->m_clock.mediaChanged();
                        self->m_mediaState.revision = rev;
                        emit self->mediaChanged(rev, self->mediaState());
                    }
                });
            inFetchCall = false;
            Q_UNUSED(syncResolved);
        }

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

    QVariantMap timerSnapshot() const {
        QVariantMap map;
        switch (m_timer.state()) {
        case TimerService::State::Idle: map[QStringLiteral("state")] = QStringLiteral("idle"); break;
        case TimerService::State::Running: map[QStringLiteral("state")] = QStringLiteral("running"); break;
        case TimerService::State::Paused: map[QStringLiteral("state")] = QStringLiteral("paused"); break;
        case TimerService::State::Finished: map[QStringLiteral("state")] = QStringLiteral("finished"); break;
        }
        map[QStringLiteral("mode")] = m_timer.mode() == TimerService::Mode::Pomodoro
                                          ? QStringLiteral("pomodoro")
                                          : QStringLiteral("countdown");
        map[QStringLiteral("phase")] = m_timer.phase();
        map[QStringLiteral("label")] = m_timer.label();
        map[QStringLiteral("durationSec")] = QVariant::fromValue<quint32>(static_cast<quint32>(m_timer.durationSec()));
        map[QStringLiteral("remainingSec")] = QVariant::fromValue<quint32>(static_cast<quint32>(m_timer.remainingSec()));
        map[QStringLiteral("cycle")] = QVariant::fromValue<quint32>(static_cast<quint32>(m_timer.cycle()));
        map[QStringLiteral("totalCycles")] = QVariant::fromValue<quint32>(static_cast<quint32>(m_timer.totalCycles()));
        map[QStringLiteral("completedFocus")] = QVariant::fromValue<quint32>(static_cast<quint32>(m_timer.completedFocus()));
        map[QStringLiteral("elapsedSec")] = QVariant::fromValue<quint32>(static_cast<quint32>(m_timer.elapsedSec()));
        map[QStringLiteral("autoAdvance")] = m_timer.autoAdvance();
        map[QStringLiteral("endsAtMs")] = QVariant::fromValue<qint64>(m_timer.endsAtMs());
        map[QStringLiteral("revision")] = QVariant::fromValue<quint64>(m_clock.timerRevision());
        return map;
    }

    QVariantMap timerStatsSnapshot() const {
        const TimerStats stats = m_timer.stats();
        QVariantMap map;
        map[QStringLiteral("sessionsStarted")] = QVariant::fromValue<quint32>(static_cast<quint32>(stats.sessionsStarted));
        map[QStringLiteral("focusCompleted")] = QVariant::fromValue<quint32>(static_cast<quint32>(stats.focusCompleted));
        map[QStringLiteral("breaksCompleted")] = QVariant::fromValue<quint32>(static_cast<quint32>(stats.breaksCompleted));
        map[QStringLiteral("totalFocusSec")] = QVariant::fromValue<quint32>(static_cast<quint32>(stats.totalFocusSec));
        map[QStringLiteral("longestFocusSec")] = QVariant::fromValue<quint32>(static_cast<quint32>(stats.longestFocusSec));
        return map;
    }

    void applyTimerSettings(const QVariantMap &settings) {
        m_timer.setCycleConfig(
            settings.value(QStringLiteral("timerPresetMinutes"), 25).toInt(),
            settings.value(QStringLiteral("timerBreakMinutes"), 5).toInt(),
            settings.value(QStringLiteral("timerLongBreakMinutes"), 15).toInt(),
            settings.value(QStringLiteral("timerCycles"), 4).toInt());
        m_timer.setAutoAdvance(settings.value(QStringLiteral("timerAutoAdvance"), true).toBool());
    }

    bool startTimer(const QVariantMap &request) {
        QString mode = request.value(QStringLiteral("mode"), QStringLiteral("countdown")).toString();
        if (mode != QLatin1String("countdown") && mode != QLatin1String("pomodoro")) {
            sendTimerError(QStringLiteral("io.github.linuxisland.Error.InvalidArgument"),
                           QStringLiteral("mode must be countdown or pomodoro"));
            return false;
        }

        int focusMin = 0;
        if (request.contains(QStringLiteral("durationMin"))) {
            const QVariant raw = request.value(QStringLiteral("durationMin"));
            if (raw.typeId() != QMetaType::Int && raw.typeId() != QMetaType::LongLong &&
                raw.typeId() != QMetaType::UInt && raw.typeId() != QMetaType::ULongLong) {
                sendTimerError(QStringLiteral("io.github.linuxisland.Error.InvalidArgument"),
                               QStringLiteral("durationMin must be an integer"));
                return false;
            }
            focusMin = raw.toInt();
            if (focusMin < 1 || focusMin > 180) {
                sendTimerError(QStringLiteral("io.github.linuxisland.Error.InvalidArgument"),
                               QStringLiteral("focus minutes must be between 1 and 180"));
                return false;
            }
        } else {
            focusMin = m_settingsStore.settings().value(QStringLiteral("timerPresetMinutes"), 25).toInt();
        }

        int breakMin = m_settingsStore.settings().value(QStringLiteral("timerBreakMinutes"), 5).toInt();
        if (request.contains(QStringLiteral("breakMin"))) {
            const QVariant raw = request.value(QStringLiteral("breakMin"));
            if (raw.typeId() != QMetaType::Int && raw.typeId() != QMetaType::LongLong &&
                raw.typeId() != QMetaType::UInt && raw.typeId() != QMetaType::ULongLong) {
                sendTimerError(QStringLiteral("io.github.linuxisland.Error.InvalidArgument"),
                               QStringLiteral("breakMin must be an integer"));
                return false;
            }
            breakMin = raw.toInt();
            if (breakMin < 1 || breakMin > 60) {
                sendTimerError(QStringLiteral("io.github.linuxisland.Error.InvalidArgument"),
                               QStringLiteral("break minutes must be between 1 and 60"));
                return false;
            }
        }

        QString label;
        if (request.contains(QStringLiteral("label"))) {
            const QVariant raw = request.value(QStringLiteral("label"));
            if (raw.typeId() != QMetaType::QString) {
                sendTimerError(QStringLiteral("io.github.linuxisland.Error.InvalidArgument"),
                               QStringLiteral("label must be a string"));
                return false;
            }
            label = raw.toString();
            if (label.toUtf8().size() > 64) {
                sendTimerError(QStringLiteral("io.github.linuxisland.Error.InvalidArgument"),
                               QStringLiteral("label exceeds maximum length of 64 bytes"));
                return false;
            }
        }

        const QVariantMap settings = m_settingsStore.settings();
        int longBreakMin = settings.value(QStringLiteral("timerLongBreakMinutes"), 15).toInt();
        int cycles = settings.value(QStringLiteral("timerCycles"), 4).toInt();
        if (request.contains(QStringLiteral("longBreakMin"))) {
            const QVariant raw = request.value(QStringLiteral("longBreakMin"));
            if (raw.typeId() != QMetaType::Int && raw.typeId() != QMetaType::LongLong &&
                raw.typeId() != QMetaType::UInt && raw.typeId() != QMetaType::ULongLong) {
                sendTimerError(QStringLiteral("io.github.linuxisland.Error.InvalidArgument"),
                               QStringLiteral("longBreakMin must be an integer"));
                return false;
            }
            longBreakMin = raw.toInt();
            if (longBreakMin < 1 || longBreakMin > 60) {
                sendTimerError(QStringLiteral("io.github.linuxisland.Error.InvalidArgument"),
                               QStringLiteral("long break minutes must be between 1 and 60"));
                return false;
            }
        }
        if (request.contains(QStringLiteral("cycles"))) {
            const QVariant raw = request.value(QStringLiteral("cycles"));
            if (raw.typeId() != QMetaType::Int && raw.typeId() != QMetaType::LongLong &&
                raw.typeId() != QMetaType::UInt && raw.typeId() != QMetaType::ULongLong) {
                sendTimerError(QStringLiteral("io.github.linuxisland.Error.InvalidArgument"),
                               QStringLiteral("cycles must be an integer"));
                return false;
            }
            cycles = raw.toInt();
            if (cycles < 2 || cycles > 12) {
                sendTimerError(QStringLiteral("io.github.linuxisland.Error.InvalidArgument"),
                               QStringLiteral("cycles must be between 2 and 12"));
                return false;
            }
        }

        QString error;
        const TimerService::Mode timerMode = mode == QLatin1String("pomodoro")
                                                 ? TimerService::Mode::Pomodoro
                                                 : TimerService::Mode::Countdown;
        // Set the mode before configuring so a countdown start cannot inherit
        // a pomodoro phase from the previous session.
        m_timer.setCycleConfig(focusMin, breakMin, longBreakMin, cycles);
        if (!m_timer.start(timerMode, focusMin, breakMin, label, &error)) {
            sendTimerError(QStringLiteral("io.github.linuxisland.Error.InvalidArgument"), error);
            return false;
        }
        return true;
    }

    bool controlTimer(const QString &action) {
        QString error;
        if (!m_timer.control(action, &error)) {
            const bool unsupported = action != QLatin1String("pause") && action != QLatin1String("resume") &&
                                     action != QLatin1String("stop") && action != QLatin1String("skip") &&
                                     action != QLatin1String("next");
            const bool skipOutsidePomodoro = action == QLatin1String("skip") &&
                                             m_timer.mode() != TimerService::Mode::Pomodoro;
            const QString errorName = (unsupported || skipOutsidePomodoro)
                                          ? QStringLiteral("io.github.linuxisland.Error.UnsupportedAction")
                                          : QStringLiteral("io.github.linuxisland.Error.InvalidArgument");
            sendTimerError(errorName, error);
            return false;
        }
        return true;
    }

    // Applies the persisted pomodoro shape to the engine. Safe to call before
    // the first start(); the values are read again on every StartTimer.
    void startTimeServices() {
        if (m_timeStarted) return;
        m_timeStarted = true;
        applyTimerSettings(m_settingsStore.settings());
    }

signals:
    void mediaChanged(quint64 revision, const QVariantMap &media);
    void timerChanged(quint64 revision, const QVariantMap &timer);
    void settingsChanged(quint64 revision, const QVariantMap &settings);
    void coreStatusChanged(const QString &status);

private:
    void sendTimerError(const QString &name, const QString &message) {
        if (calledFromDBus()) {
            setDelayedReply(true);
            sendErrorReply(name, message);
        }
    }

    RevisionClock m_clock;
    QDBusConnection m_bus;
    TimerService m_timer;
    bool m_timeStarted = false;
    QString m_status;
    MediaState m_mediaState;
    SettingsStore m_settingsStore;
    PlayerRegistry m_playerRegistry;
    MprisController m_controller;
    QVariantMap m_capabilities;
    ArtworkCache m_artworkCache;
    QVariantList m_audioLevels{0.0, 0.0, 0.0};
    double m_systemVolume = 1.0;
    double m_systemLevel = 1.0;
    bool m_systemMuted = false;
    bool m_systemVolumeKnown = false;
};
