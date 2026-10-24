#pragma once
#include <QObject>
#include <QProcess>
#include <QTimer>
#include <QElapsedTimer>
#include <QRegularExpression>
#include <QStandardPaths>
#include <QVariantList>
#include <QtEndian>
#include <array>
#include <cmath>
#include <algorithm>

// Fixed-rate mono PCM -> three RMS bands. No audio persisted or logged.
class AudioBands {
public:
    QVariantList analyze(const QByteArray &pcm);
private:
    double m_low = 0, m_high = 0;
    std::array<double, 3> m_levels{};
};

class AudioMeter : public QObject {
    Q_OBJECT
public:
    explicit AudioMeter(QObject *parent = nullptr);
    ~AudioMeter() override;
    void setActive(bool active);
signals:
    void levelsChanged(const QVariantList &levels);
private:
    void resolveSink();
    void startCapture();
    void stopCapture();
    bool m_active = false;
    QTimer m_retry;
    QProcess m_resolver;
    QProcess *m_capture = nullptr;
    QString m_target;
    QByteArray m_buffer;
    AudioBands m_bands;
    QElapsedTimer m_lastRead;
};
