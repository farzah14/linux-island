#pragma once

#include <QDBusAbstractAdaptor>
#include <QVariantMap>
#include "core_service.h"

class CoreAdaptor : public QDBusAbstractAdaptor {
    Q_OBJECT
    Q_CLASSINFO("D-Bus Interface", "io.github.linuxisland.Core1")
public:
    explicit CoreAdaptor(CoreService *parent)
        : QDBusAbstractAdaptor(parent),
          m_service(parent) {
        connect(m_service, &CoreService::mediaChanged, this, &CoreAdaptor::MediaChanged);
        connect(m_service, &CoreService::settingsChanged, this, &CoreAdaptor::SettingsChanged);
        connect(m_service, &CoreService::coreStatusChanged, this, &CoreAdaptor::CoreStatusChanged);
    }

public slots:
    QVariantMap GetSnapshot() {
        return m_service->snapshot();
    }

    QVariantMap GetMediaState() {
        return m_service->mediaState();
    }

    bool ControlMedia(const QString &action) {
        return m_service->controlMedia(action);
    }

    bool SetActivePlayer(const QString &playerId) {
        return m_service->setActivePlayer(playerId);
    }

    QVariantMap GetSettings() {
        return m_service->settings();
    }

    quint64 UpdateSettings(const QVariantMap &changes) {
        return m_service->updateSettings(changes);
    }

signals:
    void MediaChanged(quint64 revision, const QVariantMap &media);
    void SettingsChanged(quint64 revision, const QVariantMap &settings);
    void CoreStatusChanged(const QString &status);

private:
    CoreService *m_service;
};
