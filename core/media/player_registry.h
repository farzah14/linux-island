#pragma once

#include <QObject>
#include <QString>
#include <QList>
#include <QMap>
#include <QDBusConnection>
#include "media_state.h"

struct PlayerSummary {
    QString serviceName;
    QString playbackStatus;
};

QString chooseActivePlayer(const QList<PlayerSummary> &players, const QString &preferredId);

class PlayerRegistry : public QObject {
    Q_OBJECT
public:
    explicit PlayerRegistry(const QDBusConnection &bus = QDBusConnection::sessionBus(), QObject *parent = nullptr);
    ~PlayerRegistry() override;

    QString activePlayerId() const;
    MediaState activeMediaState() const;
    QStringList availablePlayers() const;

    bool setActivePlayer(const QString &playerId);
    void setPreferredPlayerId(const QString &playerId);
    void refresh();

signals:
    void activePlayerChanged(const QString &playerId);
    void mediaStateChanged(const MediaState &state);
    void playersChanged(const QStringList &players);

private slots:
    void onNameOwnerChanged(const QString &name, const QString &oldOwner, const QString &newOwner);
    void onPlayerPropertiesChanged(const QString &interfaceName, const QVariantMap &changedProps, const QStringList &invalidatedProps, const QDBusMessage &msg);
private:
    void queryPlayerProperties(const QString &serviceName);
    void reevaluateActivePlayer();
    void subscribePlayerSignals(const QString &serviceName);
    void unsubscribePlayerSignals(const QString &serviceName);

    struct PlayerData {
        QString serviceName;
        QString playbackStatus = QStringLiteral("Stopped");
        QVariantMap metadata;
        QVariantMap properties;
        MediaState normalizedState;
    };

    QDBusConnection m_bus;
    QString m_preferredId;
    QString m_overrideActiveId;
    QString m_activeId;
    QMap<QString, PlayerData> m_players;
    bool m_isDestroyed = false;
};
