#pragma once

#include <QObject>
#include <QString>
#include <QTimer>

struct CpuSample {
    qint64 idle = 0;
    qint64 work = 0;
    qint64 total = 0;
    bool valid = false;
};

struct MemSample {
    qint64 totalKb = 0;
    qint64 availableKb = 0;
    qint64 usedKb = 0;
    double percent = 0.0;
    double totalGb = 0.0;
    double usedGb = 0.0;
    bool valid = false;
};

struct BatterySample {
    int percent = 0;
    QString status;
    bool isCharging = false;
    bool valid = false;
};

struct NetSample {
    qint64 rxBytes = 0;
    qint64 txBytes = 0;
    qint64 timestampMs = 0;
    bool valid = false;
};

class SystemMetricsProvider : public QObject {
    Q_OBJECT
    Q_PROPERTY(double cpuPercent READ cpuPercent NOTIFY metricsChanged)
    Q_PROPERTY(QString cpuText READ cpuText NOTIFY metricsChanged)
    Q_PROPERTY(double memPercent READ memPercent NOTIFY metricsChanged)
    Q_PROPERTY(QString memText READ memText NOTIFY metricsChanged)
    Q_PROPERTY(QString memDetailText READ memDetailText NOTIFY metricsChanged)
    Q_PROPERTY(bool hasBattery READ hasBattery NOTIFY metricsChanged)
    Q_PROPERTY(int batteryPercent READ batteryPercent NOTIFY metricsChanged)
    Q_PROPERTY(bool batteryCharging READ batteryCharging NOTIFY metricsChanged)
    Q_PROPERTY(QString batteryText READ batteryText NOTIFY metricsChanged)
    Q_PROPERTY(QString netText READ netText NOTIFY metricsChanged)
    Q_PROPERTY(QString netDetailText READ netDetailText NOTIFY metricsChanged)

public:
    explicit SystemMetricsProvider(QObject *parent = nullptr);

    double cpuPercent() const { return m_cpuPercent; }
    QString cpuText() const;
    double memPercent() const { return m_memPercent; }
    QString memText() const;
    QString memDetailText() const { return m_memDetailText; }
    bool hasBattery() const { return m_hasBattery; }
    int batteryPercent() const { return m_batteryPercent; }
    bool batteryCharging() const { return m_batteryCharging; }
    QString batteryText() const;
    QString netText() const { return m_netText; }
    QString netDetailText() const { return m_netDetailText; }

    static CpuSample parseCpuStat(const QString &content);
    static double computeCpuPercent(const CpuSample &prev, const CpuSample &curr);
    static MemSample parseMeminfo(const QString &content);
    static BatterySample parseBattery(const QString &capacityContent, const QString &statusContent);
    static NetSample parseNetDev(const QString &content, qint64 nowMs);
    static QString formatTransferRate(double bytesPerSec);

    Q_INVOKABLE void setPollingActive(bool active);
    Q_INVOKABLE void refresh();

signals:
    void metricsChanged();

private:
    void readSystemFiles();

    QTimer m_timer;
    CpuSample m_prevCpu;
    NetSample m_prevNet;

    double m_cpuPercent = 0.0;
    double m_memPercent = 0.0;
    QString m_memDetailText;
    bool m_hasBattery = false;
    int m_batteryPercent = 0;
    bool m_batteryCharging = false;
    QString m_netText = QStringLiteral("0 B/s");
    QString m_netDetailText = QStringLiteral("↓ 0 B/s · ↑ 0 B/s");
};
