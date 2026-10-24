#pragma once

#include <QObject>
#include <QString>
#include <QDBusConnection>
#include "media_state.h"

struct ControlResult {
    bool accepted = false;
    QString errorName;
    QString errorMessage;
};

class MprisController : public QObject {
    Q_OBJECT
public:
    explicit MprisController(const QDBusConnection &bus = QDBusConnection::sessionBus(), QObject *parent = nullptr);

    ControlResult perform(const QString &action, const QString &playerId, const MediaState &currentState);

private:
    QDBusConnection m_bus;
};
