#pragma once

#include <QDBusConnection>
#include <QObject>
#include <QString>
#include <QTimer>
#include <QVariantList>
#include <QVariantMap>

// Qt mirror of the Time1 client. The timer is owned by the Core daemon, so
// this object never counts down on its own: it only applies snapshots and
// signals. Availability follows a valid snapshot or timer signal.
class TimeClient : public QObject {
    Q_OBJECT

    Q_PROPERTY(QString timerState READ timerState NOTIFY timerChanged)
    Q_PROPERTY(QString timerMode READ timerMode NOTIFY timerChanged)
    Q_PROPERTY(QString timerPhase READ timerPhase NOTIFY timerChanged)
    Q_PROPERTY(QString timerLabel READ timerLabel NOTIFY timerChanged)
    Q_PROPERTY(int timerDurationSec READ timerDurationSec NOTIFY timerChanged)
    Q_PROPERTY(int timerRemainingSec READ timerRemainingSec NOTIFY timerChanged)
    Q_PROPERTY(int timerCycle READ timerCycle NOTIFY timerChanged)
    Q_PROPERTY(bool timerActive READ timerActive NOTIFY timerChanged)
    Q_PROPERTY(bool timerServiceAvailable READ timerServiceAvailable NOTIFY availabilityChanged)

    Q_PROPERTY(int timerTotalCycles READ timerTotalCycles NOTIFY timerChanged)
    Q_PROPERTY(int timerCompletedFocus READ timerCompletedFocus NOTIFY timerChanged)
    Q_PROPERTY(int timerElapsedSec READ timerElapsedSec NOTIFY timerChanged)
    Q_PROPERTY(bool timerAutoAdvance READ timerAutoAdvance NOTIFY timerChanged)
    Q_PROPERTY(QVariantMap timerStats READ timerStats NOTIFY statsChanged)

    Q_PROPERTY(QString compactText READ compactText NOTIFY compactChanged)
    Q_PROPERTY(QString compactIcon READ compactIcon NOTIFY compactChanged)

public:
    explicit TimeClient(const QDBusConnection &bus = QDBusConnection::sessionBus(),
                        QObject *parent = nullptr);

    QString timerState() const { return m_timerState; }
    QString timerMode() const { return m_timerMode; }
    QString timerPhase() const { return m_timerPhase; }
    QString timerLabel() const { return m_timerLabel; }
    int timerDurationSec() const { return m_timerDurationSec; }
    int timerRemainingSec() const { return m_timerRemainingSec; }
    int timerCycle() const { return m_timerCycle; }
    bool timerActive() const;
    bool timerServiceAvailable() const { return m_timerServiceAvailable; }

    int timerTotalCycles() const { return m_timerTotalCycles; }
    int timerCompletedFocus() const { return m_timerCompletedFocus; }
    int timerElapsedSec() const { return m_timerElapsedSec; }
    bool timerAutoAdvance() const { return m_timerAutoAdvance; }
    QVariantMap timerStats() const { return m_timerStats; }

    QString compactText() const;
    QString compactIcon() const;

    Q_INVOKABLE void startTimer(int minutes);
    Q_INVOKABLE void startPomodoro();
    Q_INVOKABLE void pauseTimer();
    Q_INVOKABLE void resumeTimer();
    Q_INVOKABLE void stopTimer();
    Q_INVOKABLE void skipPhase();
    Q_INVOKABLE void nextPhase();
    Q_INVOKABLE void fetchStats();

    Q_INVOKABLE QString formatEventTime(qlonglong startMs, qlonglong endMs, qlonglong nowMs) const;
    Q_INVOKABLE QString formatClock(int seconds) const;
    Q_INVOKABLE qlonglong nowMs() const;

signals:
    void timerChanged();
    void statsChanged();
    void compactChanged();
    void availabilityChanged();
    void timerFinished();

private slots:
    void onTimerChanged(quint64 revision, const QVariantMap &timer);

    void onNameOwnerChanged(const QString &service, const QString &oldOwner, const QString &newOwner);

private:
    void fetchTimer();
    void fetchTimerStats();
    void applyTimerMap(const QVariantMap &timer);

    void call(const QString &method, const QVariantList &args = {});
    void setTimerServiceAvailable(bool available);

    QDBusConnection m_bus;
    quint64 m_timerRevision = 0;
    quint64 m_ownerGeneration = 0;
    quint64 m_statsRequestId = 0;
    bool m_fetchInFlight = false;
    QTimer m_retryTimer;

    QString m_timerState = QStringLiteral("idle");
    QString m_timerMode = QStringLiteral("countdown");
    QString m_timerPhase;
    QString m_timerLabel;
    int m_timerDurationSec = 0;
    int m_timerRemainingSec = 0;
    int m_timerCycle = 0;
    bool m_timerServiceAvailable = false;

    int m_timerTotalCycles = 4;
    int m_timerCompletedFocus = 0;
    int m_timerElapsedSec = 0;
    bool m_timerAutoAdvance = true;
    QVariantMap m_timerStats;
};
