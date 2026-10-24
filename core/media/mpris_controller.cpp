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
        QStringLiteral("Previous")
    };

    if (action.isEmpty() || !whitelistedActions.contains(action)) {
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
    }

    if (!m_bus.isConnected()) {
        return ControlResult{
            false,
            QStringLiteral("io.github.linuxisland.Error.PlayerUnavailable"),
            QStringLiteral("Session bus not connected")
        };
    }

    QDBusInterface playerIface(
        playerId,
        QStringLiteral("/org/mpris/MediaPlayer2"),
        QStringLiteral("org.mpris.MediaPlayer2.Player"),
        m_bus);

    // Asynchronous non-blocking call
    playerIface.asyncCall(action);

    return ControlResult{true, QString(), QString()};
}
