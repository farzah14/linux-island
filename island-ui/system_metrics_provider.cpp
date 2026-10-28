#include "system_metrics_provider.h"
#include <QFile>
#include <QDir>
#include <QDateTime>
#include <QRegularExpression>
#include <cmath>
#include <algorithm>

SystemMetricsProvider::SystemMetricsProvider(QObject *parent)
    : QObject(parent) {
    connect(&m_timer, &QTimer::timeout, this, &SystemMetricsProvider::refresh);
    m_timer.setInterval(2000);
    // Initial read
    refresh();
}

QString SystemMetricsProvider::cpuText() const {
    return QString::number(m_cpuPercent, 'f', 0) + QStringLiteral("%");
}

QString SystemMetricsProvider::memText() const {
    return QString::number(m_memPercent, 'f', 0) + QStringLiteral("%");
}

QString SystemMetricsProvider::batteryText() const {
    return QString::number(m_batteryPercent) + QStringLiteral("%");
}

void SystemMetricsProvider::setPollingActive(bool active) {
    if (active) {
        if (!m_timer.isActive()) {
            refresh();
            m_timer.start();
        }
    } else {
        if (m_timer.isActive()) {
            m_timer.stop();
        }
    }
}

CpuSample SystemMetricsProvider::parseCpuStat(const QString &content) {
    CpuSample sample;
    if (content.isEmpty()) return sample;

    const QStringList lines = content.split(QLatin1Char('\n'));
    if (lines.isEmpty()) return sample;

    const QString firstLine = lines.first().trimmed();
    if (!firstLine.startsWith(QLatin1String("cpu "))) return sample;

    const QStringList parts = firstLine.split(QRegularExpression(QStringLiteral("\\s+")), Qt::SkipEmptyParts);
    if (parts.size() < 5) return sample; // "cpu", user, nice, system, idle...

    bool ok = false;
    qint64 user = parts.value(1).toLongLong(&ok);
    if (!ok) return sample;
    qint64 nice = parts.value(2).toLongLong(&ok);
    if (!ok) return sample;
    qint64 system = parts.value(3).toLongLong(&ok);
    if (!ok) return sample;
    qint64 idleTime = parts.value(4).toLongLong(&ok);
    if (!ok) return sample;
    qint64 iowait = parts.size() > 5 ? parts.value(5).toLongLong(&ok) : 0;
    qint64 irq = parts.size() > 6 ? parts.value(6).toLongLong(&ok) : 0;
    qint64 softirq = parts.size() > 7 ? parts.value(7).toLongLong(&ok) : 0;
    qint64 steal = parts.size() > 8 ? parts.value(8).toLongLong(&ok) : 0;

    sample.idle = idleTime + iowait;
    sample.work = user + nice + system + irq + softirq + steal;
    sample.total = sample.idle + sample.work;
    sample.valid = true;
    return sample;
}

double SystemMetricsProvider::computeCpuPercent(const CpuSample &prev, const CpuSample &curr) {
    if (!prev.valid || !curr.valid) return 0.0;
    const qint64 deltaTotal = curr.total - prev.total;
    const qint64 deltaWork = curr.work - prev.work;
    if (deltaTotal <= 0) return 0.0;

    double pct = (double(deltaWork) / double(deltaTotal)) * 100.0;
    pct = std::clamp(pct, 0.0, 100.0);
    return std::round(pct * 10.0) / 10.0;
}

MemSample SystemMetricsProvider::parseMeminfo(const QString &content) {
    MemSample sample;
    if (content.isEmpty()) return sample;

    qint64 totalKb = -1;
    qint64 availableKb = -1;

    const QStringList lines = content.split(QLatin1Char('\n'));
    static const QRegularExpression totalRx(QStringLiteral("^MemTotal:\\s+(\\d+)\\s+kB"));
    static const QRegularExpression availRx(QStringLiteral("^MemAvailable:\\s+(\\d+)\\s+kB"));

    for (const QString &line : lines) {
        auto mTotal = totalRx.match(line);
        if (mTotal.hasMatch()) {
            totalKb = mTotal.captured(1).toLongLong();
        } else {
            auto mAvail = availRx.match(line);
            if (mAvail.hasMatch()) {
                availableKb = mAvail.captured(1).toLongLong();
            }
        }
        if (totalKb > 0 && availableKb >= 0) break;
    }

    if (totalKb <= 0 || availableKb < 0) return sample;

    sample.totalKb = totalKb;
    sample.availableKb = availableKb;
    sample.usedKb = std::max<qint64>(0, totalKb - availableKb);
    sample.percent = std::round((double(sample.usedKb) / double(totalKb)) * 1000.0) / 10.0;
    sample.totalGb = std::round((double(totalKb) / 1048576.0) * 10.0) / 10.0;
    sample.usedGb = std::round((double(sample.usedKb) / 1048576.0) * 10.0) / 10.0;
    sample.valid = true;
    return sample;
}

BatterySample SystemMetricsProvider::parseBattery(const QString &capacityContent, const QString &statusContent) {
    BatterySample sample;
    bool ok = false;
    int cap = capacityContent.trimmed().toInt(&ok);
    if (!ok || cap < 0 || cap > 100) return sample;

    sample.percent = cap;
    sample.status = statusContent.trimmed();
    sample.isCharging = (sample.status == QLatin1String("Charging"));
    sample.valid = true;
    return sample;
}

NetSample SystemMetricsProvider::parseNetDev(const QString &content, qint64 nowMs) {
    NetSample sample;
    sample.timestampMs = nowMs;
    if (content.isEmpty()) return sample;

    const QStringList lines = content.split(QLatin1Char('\n'));
    for (const QString &line : lines) {
        int colonIdx = line.indexOf(QLatin1Char(':'));
        if (colonIdx == -1) continue;

        QString iface = line.left(colonIdx).trimmed();
        if (iface == QLatin1String("lo")) continue;

        QString data = line.mid(colonIdx + 1).trimmed();
        QStringList parts = data.split(QRegularExpression(QStringLiteral("\\s+")), Qt::SkipEmptyParts);
        if (parts.size() >= 9) {
            bool okRx = false;
            bool okTx = false;
            qint64 rx = parts.value(0).toLongLong(&okRx);
            qint64 tx = parts.value(8).toLongLong(&okTx);
            if (okRx && okTx) {
                sample.rxBytes += rx;
                sample.txBytes += tx;
                sample.valid = true;
            }
        }
    }
    return sample;
}

QString SystemMetricsProvider::formatTransferRate(double bytesPerSec) {
    if (bytesPerSec < 1024.0) {
        return QString::number(std::round(bytesPerSec)) + QStringLiteral(" B/s");
    } else if (bytesPerSec < 1048576.0) {
        return QString::number(bytesPerSec / 1024.0, 'f', 1) + QStringLiteral(" KB/s");
    } else if (bytesPerSec < 1073741824.0) {
        return QString::number(bytesPerSec / 1048576.0, 'f', 1) + QStringLiteral(" MB/s");
    } else {
        return QString::number(bytesPerSec / 1073741824.0, 'f', 1) + QStringLiteral(" GB/s");
    }
}

void SystemMetricsProvider::readSystemFiles() {
    // 1. CPU
    QFile statFile(QStringLiteral("/proc/stat"));
    if (statFile.open(QIODevice::ReadOnly | QIODevice::Text)) {
        QString content = QString::fromUtf8(statFile.readAll());
        statFile.close();
        CpuSample currCpu = parseCpuStat(content);
        if (currCpu.valid) {
            if (m_prevCpu.valid) {
                m_cpuPercent = computeCpuPercent(m_prevCpu, currCpu);
            }
            m_prevCpu = currCpu;
        }
    }

    // 2. Memory
    QFile memFile(QStringLiteral("/proc/meminfo"));
    if (memFile.open(QIODevice::ReadOnly | QIODevice::Text)) {
        QString content = QString::fromUtf8(memFile.readAll());
        memFile.close();
        MemSample mem = parseMeminfo(content);
        if (mem.valid) {
            m_memPercent = mem.percent;
            m_memDetailText = QString::number(mem.usedGb, 'f', 1) + QStringLiteral(" / ") +
                              QString::number(mem.totalGb, 'f', 1) + QStringLiteral(" GB");
        }
    }

    // 3. Battery
    m_hasBattery = false;
    QDir powerSupplyDir(QStringLiteral("/sys/class/power_supply"));
    if (powerSupplyDir.exists()) {
        const QStringList entries = powerSupplyDir.entryList({QStringLiteral("BAT*")}, QDir::Dirs | QDir::NoDotAndDotDot);
        for (const QString &batName : entries) {
            QFile capFile(powerSupplyDir.filePath(batName + QStringLiteral("/capacity")));
            QFile statusFile(powerSupplyDir.filePath(batName + QStringLiteral("/status")));
            if (capFile.open(QIODevice::ReadOnly | QIODevice::Text)) {
                QString capContent = QString::fromUtf8(capFile.readAll());
                capFile.close();
                QString statusContent;
                if (statusFile.open(QIODevice::ReadOnly | QIODevice::Text)) {
                    statusContent = QString::fromUtf8(statusFile.readAll());
                    statusFile.close();
                }
                BatterySample bat = parseBattery(capContent, statusContent);
                if (bat.valid) {
                    m_hasBattery = true;
                    m_batteryPercent = bat.percent;
                    m_batteryCharging = bat.isCharging;
                    break;
                }
            }
        }
    }

    // 4. Network Rate
    QFile netFile(QStringLiteral("/proc/net/dev"));
    if (netFile.open(QIODevice::ReadOnly | QIODevice::Text)) {
        QString content = QString::fromUtf8(netFile.readAll());
        netFile.close();
        qint64 nowMs = QDateTime::currentMSecsSinceEpoch();
        NetSample currNet = parseNetDev(content, nowMs);
        if (currNet.valid) {
            if (m_prevNet.valid && currNet.timestampMs > m_prevNet.timestampMs) {
                double elapsedSec = double(currNet.timestampMs - m_prevNet.timestampMs) / 1000.0;
                if (elapsedSec > 0.05) {
                    double rxRate = std::max(0.0, double(currNet.rxBytes - m_prevNet.rxBytes) / elapsedSec);
                    double txRate = std::max(0.0, double(currNet.txBytes - m_prevNet.txBytes) / elapsedSec);
                    double totalRate = rxRate + txRate;
                    m_netText = formatTransferRate(totalRate);
                    m_netDetailText = QStringLiteral("↓ ") + formatTransferRate(rxRate) +
                                      QStringLiteral(" · ↑ ") + formatTransferRate(txRate);
                }
            }
            m_prevNet = currNet;
        }
    }
}

void SystemMetricsProvider::refresh() {
    readSystemFiles();
    emit metricsChanged();
}
