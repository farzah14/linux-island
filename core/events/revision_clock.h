#pragma once

#include <QString>
#include <QtGlobal>

class RevisionClock {
public:
    RevisionClock();
    QString instanceId() const;
    quint64 mediaRevision() const;
    quint64 settingsRevision() const;
    quint64 mediaChanged();
    quint64 settingsChanged();

private:
    QString m_instanceId;
    quint64 m_media = 0;
    quint64 m_settings = 0;
};
