#pragma once

#include <QDBusAbstractAdaptor>
#include <QVariantMap>
#include "core_service.h"

class TimeAdaptor : public QDBusAbstractAdaptor {
    Q_OBJECT
    Q_CLASSINFO("D-Bus Interface", "io.github.linuxisland.Time1")
public:
    explicit TimeAdaptor(CoreService *parent)
        : QDBusAbstractAdaptor(parent),
          m_service(parent) {
        connect(m_service, &CoreService::timerChanged, this, &TimeAdaptor::TimerChanged);
    }

public slots:
    QVariantMap GetTimer() {
        return m_service->timerSnapshot();
    }

    bool StartTimer(const QVariantMap &request) {
        return m_service->startTimer(request);
    }

    bool ControlTimer(const QString &action) {
        return m_service->controlTimer(action);
    }

    QVariantMap GetTimerStats() {
        return m_service->timerStatsSnapshot();
    }

signals:
    void TimerChanged(quint64 revision, const QVariantMap &timer);

private:
    CoreService *m_service;
};
