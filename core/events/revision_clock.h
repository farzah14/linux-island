#pragma once

#include <QString>
#include <QtGlobal>

class RevisionClock {
public:
    RevisionClock();
    QString instanceId() const;
    quint64 mediaRevision() const;
    quint64 settingsRevision() const;
    quint64 timerRevision() const;
    quint64 shelfRevision() const;
    quint64 mediaChanged();
    quint64 settingsChanged();
    quint64 timerChanged();
    quint64 shelfChanged();

private:
    QString m_instanceId;
    quint64 m_media = 0;
    quint64 m_settings = 0;
    quint64 m_timer = 0;
    quint64 m_shelf = 0;
};
