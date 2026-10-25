#include "mpris_controller.h"
#include <QDBusInterface>
#include <QDBusPendingCall>
#include <QSet>

MprisController::MprisController(const QDBusConnection &bus, QObject *parent)
    : QObject(parent),
      m_bus(bus) {}

ControlResult MprisController::perform(const QString &action, const QString &playerId, const MediaState &currentState) {
    static const QSet<QString> whitelistedActions = {
        QStringLiteral("PlayPause"),
        QStringLiteral("Next"),
        QStringLiteral("Previous"),
        QStringLiteral("SeekForward"),
        QStringLiteral("SeekBackward")
    };

    const bool isSeekTo = action.startsWith(QLatin1String("SeekTo:"));
    const bool isVolume = action.startsWith(QLatin1String("Volume:"));
    const bool isSupported = whitelistedActions.contains(action) || isSeekTo || isVolume;

    if (action.isEmpty() || !isSupported) {
        return ControlResult{
            false,
            QStringLiteral("io.github.linuxisland.Error.UnsupportedAction"),
            QStringLiteral("Unsupported or empty media action: ") + action
        };
    }
    if (playerId.isEmpty()) {
        return ControlResult{
            false,
            QStringLiteral("io.github.linuxisland.Error.PlayerUnavailable"),
            QStringLiteral("No active media player available")
        };
    }

    // Verify capability flags
    if (action == QLatin1String("PlayPause")) {
        if (!currentState.canPlay && !currentState.canPause) {
            return ControlResult{
                false,
                QStringLiteral("io.github.linuxisland.Error.ActionNotAllowed"),
                QStringLiteral("Player cannot play or pause")
            };
        }
    } else if (action == QLatin1String("Next")) {
        if (!currentState.canNext) {
            return ControlResult{
                false,
                QStringLiteral("io.github.linuxisland.Error.ActionNotAllowed"),
                QStringLiteral("Player cannot skip to next track")
            };
        }
    } else if (action == QLatin1String("Previous")) {
        if (!currentState.canPrevious) {
            return ControlResult{
                false,
                QStringLiteral("io.github.linuxisland.Error.ActionNotAllowed"),
                QStringLiteral("Player cannot skip to previous track")
            };
        }
    } else if (action == QLatin1String("SeekForward") || action == QLatin1String("SeekBackward") || isSeekTo) {
        if (!currentState.canSeek) {
            return ControlResult{
                false,
                QStringLiteral("io.github.linuxisland.Error.ActionNotAllowed"),
                QStringLiteral("Player cannot seek")
            };
        }
    }
    if (!m_bus.isConnected()) {
        return ControlResult{
            false,
            QStringLiteral("io.github.linuxisland.Error.PlayerUnavailable"),
            QStringLiteral("Session bus not connected")
        };
    }

    // Asynchronous non-blocking call via D-Bus message
    if (action == QLatin1String("SeekForward")) {
        QDBusMessage msg = QDBusMessage::createMethodCall(
            playerId,
            QStringLiteral("/org/mpris/MediaPlayer2"),
            QStringLiteral("org.mpris.MediaPlayer2.Player"),
            QStringLiteral("Seek"));
        msg << qint64(10000000);
        m_bus.send(msg);
    } else if (action == QLatin1String("SeekBackward")) {
        QDBusMessage msg = QDBusMessage::createMethodCall(
            playerId,
            QStringLiteral("/org/mpris/MediaPlayer2"),
            QStringLiteral("org.mpris.MediaPlayer2.Player"),
            QStringLiteral("Seek"));
        msg << qint64(-10000000);
        m_bus.send(msg);
    } else if (isSeekTo) {
        bool ok = false;
        qint64 targetUs = action.mid(7).toLongLong(&ok);
        if (ok && targetUs >= 0) {
            qint64 offset = targetUs - currentState.positionUs;
            QDBusMessage msg = QDBusMessage::createMethodCall(
                playerId,
                QStringLiteral("/org/mpris/MediaPlayer2"),
                QStringLiteral("org.mpris.MediaPlayer2.Player"),
                QStringLiteral("Seek"));
            msg << offset;
            m_bus.send(msg);
        }
    } else if (isVolume) {
        bool ok = false;
        double vol = action.mid(7).toDouble(&ok);
        if (ok) {
            vol = std::max(0.0, std::min(1.0, vol));
            QDBusMessage msg = QDBusMessage::createMethodCall(
                playerId,
                QStringLiteral("/org/mpris/MediaPlayer2"),
                QStringLiteral("org.freedesktop.DBus.Properties"),
                QStringLiteral("Set"));
            msg << QStringLiteral("org.mpris.MediaPlayer2.Player")
                << QStringLiteral("Volume")
                << QVariant::fromValue(QDBusVariant(vol));
            m_bus.send(msg);
        }
    } else {
        QDBusMessage msg = QDBusMessage::createMethodCall(
            playerId,
            QStringLiteral("/org/mpris/MediaPlayer2"),
            QStringLiteral("org.mpris.MediaPlayer2.Player"),
            action);
        m_bus.send(msg);
    }
    return ControlResult{true, QString(), QString()};
}
