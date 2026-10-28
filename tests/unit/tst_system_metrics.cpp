#include <QtTest>
#include "../../island-ui/system_metrics_provider.h"

class TestSystemMetrics : public QObject {
    Q_OBJECT

private slots:
    void testParseCpuStat();
    void testComputeCpuPercent();
    void testParseMeminfo();
    void testParseBattery();
    void testParseNetDev();
    void testFormatTransferRate();
};

void TestSystemMetrics::testParseCpuStat() {
    QString validStat = QStringLiteral("cpu  10132153 290696 3084719 46828483 16683 0 25195 0 0 0\n"
                                       "cpu0 1393280 32914 422065 5767220 2209 0 7117 0 0 0\n");

    CpuSample sample = SystemMetricsProvider::parseCpuStat(validStat);
    QVERIFY(sample.valid);
    QCOMPARE(sample.idle, 46828483 + 16683);
    QCOMPARE(sample.work, 10132153 + 290696 + 3084719 + 0 + 25195 + 0);
    QCOMPARE(sample.total, sample.idle + sample.work);

    // Invalid content
    QVERIFY(!SystemMetricsProvider::parseCpuStat(QString()).valid);
    QVERIFY(!SystemMetricsProvider::parseCpuStat(QStringLiteral("invalid file content")).valid);
}

void TestSystemMetrics::testComputeCpuPercent() {
    CpuSample s1;
    s1.idle = 1000;
    s1.work = 1000;
    s1.total = 2000;
    s1.valid = true;

    CpuSample s2;
    s2.idle = 1100; // +100
    s2.work = 1100; // +100
    s2.total = 2200; // +200 total -> 50%
    s2.valid = true;

    double pct = SystemMetricsProvider::computeCpuPercent(s1, s2);
    QCOMPARE(pct, 50.0);

    // Edge cases
    QCOMPARE(SystemMetricsProvider::computeCpuPercent(s2, s2), 0.0);
    QCOMPARE(SystemMetricsProvider::computeCpuPercent(s1, CpuSample()), 0.0);
}

void TestSystemMetrics::testParseMeminfo() {
    QString validMem = QStringLiteral("MemTotal:       32646196 kB\n"
                                      "MemFree:         4352128 kB\n"
                                      "MemAvailable:   19587716 kB\n"
                                      "Buffers:          562148 kB\n");

    MemSample sample = SystemMetricsProvider::parseMeminfo(validMem);
    QVERIFY(sample.valid);
    QCOMPARE(sample.totalKb, 32646196);
    QCOMPARE(sample.availableKb, 19587716);
    QCOMPARE(sample.usedKb, 32646196 - 19587716);
    QVERIFY(sample.percent > 39.0 && sample.percent < 41.0);
    QCOMPARE(sample.totalGb, 31.1);

    // Invalid content
    QVERIFY(!SystemMetricsProvider::parseMeminfo(QString()).valid);
    QVERIFY(!SystemMetricsProvider::parseMeminfo(QStringLiteral("No mem lines here")).valid);
}

void TestSystemMetrics::testParseBattery() {
    BatterySample s1 = SystemMetricsProvider::parseBattery(QStringLiteral("85\n"), QStringLiteral("Discharging\n"));
    QVERIFY(s1.valid);
    QCOMPARE(s1.percent, 85);
    QCOMPARE(s1.isCharging, false);

    BatterySample s2 = SystemMetricsProvider::parseBattery(QStringLiteral("98\n"), QStringLiteral("Charging\n"));
    QVERIFY(s2.valid);
    QCOMPARE(s2.percent, 98);
    QCOMPARE(s2.isCharging, true);

    // Invalid percent
    QVERIFY(!SystemMetricsProvider::parseBattery(QStringLiteral("150"), QStringLiteral("Charging")).valid);
    QVERIFY(!SystemMetricsProvider::parseBattery(QStringLiteral("abc"), QStringLiteral("Charging")).valid);
}

void TestSystemMetrics::testParseNetDev() {
    QString content = QStringLiteral("Inter-|   Receive                                                |  Transmit\n"
                                     " face |bytes    packets errs drop fifo frame compressed multicast|bytes    packets errs drop fifo colls carrier compressed\n"
                                     "    lo: 48679417   78018    0    0    0     0          0         0 48679417   78018    0    0    0     0       0          0\n"
                                     "  eth0: 1000000    5000    0    0    0     0          0         0  2000000    4000    0    0    0     0       0          0\n"
                                     " wlan0:  500000    2000    0    0    0     0          0         0   300000    1000    0    0    0     0       0          0\n");

    NetSample net = SystemMetricsProvider::parseNetDev(content, 123456789);
    QVERIFY(net.valid);
    QCOMPARE(net.timestampMs, 123456789);
    // lo should be ignored; eth0 (1M + 2M) + wlan0 (0.5M + 0.3M) = 1.5M rx, 2.3M tx
    QCOMPARE(net.rxBytes, 1500000);
    QCOMPARE(net.txBytes, 2300000);
}

void TestSystemMetrics::testFormatTransferRate() {
    QCOMPARE(SystemMetricsProvider::formatTransferRate(500.0), QStringLiteral("500 B/s"));
    QCOMPARE(SystemMetricsProvider::formatTransferRate(2048.0), QStringLiteral("2.0 KB/s"));
    QCOMPARE(SystemMetricsProvider::formatTransferRate(5242880.0), QStringLiteral("5.0 MB/s"));
}

QTEST_MAIN(TestSystemMetrics)
#include "tst_system_metrics.moc"
