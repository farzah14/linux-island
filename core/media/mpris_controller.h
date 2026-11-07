#pragma once

#include <QObject>
#include <QString>
#include <QDBusConnection>
#include "media_state.h"

class SinkVolume;

struct ControlResult {
    bool accepted = false;
    QString errorName;
    QString errorMessage;
};

class MprisController : public QObject {
    Q_OBJECT
public:
    // `sink` is optional. When it is present and reports a known level, the
    // volume actions drive the system sink; otherwise they fall back to the
    // active player's MPRIS Volume property.
    explicit MprisController(const QDBusConnection &bus = QDBusConnection::sessionBus(),
                             SinkVolume *sink = nullptr,
                             QObject *parent = nullptr);

    ControlResult perform(const QString &action, const QString &playerId, const MediaState &currentState);

private:
    QDBusConnection m_bus;
    SinkVolume *m_sink = nullptr;
};
