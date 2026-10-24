#include "audio_meter.h"

QVariantList AudioBands::analyze(const QByteArray &pcm) {
    if (pcm.size() != 1600) return {0.0, 0.0, 0.0};
    std::array<double, 3> energy{};
    const double lowAlpha = 1.0 - std::exp(-2.0 * 3.141592653589793 * 250 / 16000);
    const double highAlpha = 1.0 - std::exp(-2.0 * 3.141592653589793 * 2500 / 16000);
    for (int i = 0; i < 800; ++i) {
        const double sample = qFromLittleEndian<qint16>(pcm.constData() + 2 * i) / 32768.0;
        m_low += lowAlpha * (sample - m_low);
        m_high += highAlpha * (sample - m_high);
        const std::array<double, 3> bands{m_low, m_high - m_low, sample - m_high};
        for (int b = 0; b < 3; ++b) energy[b] += bands[b] * bands[b];
    }
    QVariantList result;
    for (int b = 0; b < 3; ++b) {
        const double rms = std::sqrt(energy[b] / 800);
        const double level = std::clamp((20 * std::log10(std::max(rms, 1e-8)) + 60) / 60, 0.0, 1.0);
        m_levels[b] += (level > m_levels[b] ? 0.65 : 0.3) * (level - m_levels[b]);
        result.append(m_levels[b] < 0.001 ? 0.0 : m_levels[b]);
    }
    return result;
}

AudioMeter::AudioMeter(QObject *parent) : QObject(parent) {
    m_retry.setInterval(2000);
    connect(&m_retry, &QTimer::timeout, this, [this] {
        if (m_lastRead.isValid() && m_lastRead.elapsed() > 1000)
            emit levelsChanged({0.0, 0.0, 0.0});
        resolveSink();
    });
    connect(&m_resolver, qOverload<int, QProcess::ExitStatus>(&QProcess::finished), this,
            [this](int code, QProcess::ExitStatus status) {
        const QByteArray output = m_resolver.readAllStandardOutput();
        if (!m_active || code != 0 || status != QProcess::NormalExit || output.size() > 65536) return;
        const QString text = QString::fromUtf8(output);
        const QRegularExpression sink(R"re(media\.class\s*=\s*"Audio/Sink")re");
        const QRegularExpression name(R"re(node\.name\s*=\s*"([^"]+)")re");
        const auto match = name.match(text);
        if (!sink.match(text).hasMatch() || !match.hasMatch() || match.captured(1).size() > 512) return;
        if (m_capture && m_target == match.captured(1)) return;
        stopCapture();
        m_target = match.captured(1);
        startCapture();
    });
    m_resolver.setStandardErrorFile(QProcess::nullDevice());
}

AudioMeter::~AudioMeter() { stopCapture(); }

void AudioMeter::setActive(bool active) {
    if (m_active == active) return;
    m_active = active;
    if (active) { m_retry.start(); resolveSink(); }
    else {
        m_retry.stop();
        m_resolver.kill();
        stopCapture();
    }
}

void AudioMeter::resolveSink() {
    if (!m_active || m_resolver.state() != QProcess::NotRunning) return;
    const QString program = QStandardPaths::findExecutable(QStringLiteral("wpctl"));
    if (program.isEmpty()) return;
    m_resolver.start(program, {QStringLiteral("inspect"), QStringLiteral("@DEFAULT_AUDIO_SINK@")});
    QTimer::singleShot(1500, &m_resolver, [this] {
        if (m_resolver.state() != QProcess::NotRunning) m_resolver.kill();
    });
}

void AudioMeter::startCapture() {
    const QString program = QStandardPaths::findExecutable(QStringLiteral("pw-cat"));
    if (program.isEmpty()) return;
    auto *process = new QProcess(this);
    m_capture = process;
    process->setStandardErrorFile(QProcess::nullDevice());
    connect(process, &QProcess::readyReadStandardOutput, this, [this, process] {
        if (process != m_capture || !m_active) return;
        m_buffer += process->readAllStandardOutput();
        if (m_buffer.size() > 12800) {
            // Drop whole old frames; never accumulate a delayed audio backlog.
            const auto drop = ((m_buffer.size() - 1600) / 1600) * 1600;
            m_buffer.remove(0, drop);
            m_bands = AudioBands{};
        }
        QVariantList levels;
        while (m_buffer.size() >= 1600) {
            levels = m_bands.analyze(m_buffer.first(1600));
            m_buffer.remove(0, 1600);
        }
        if (!levels.isEmpty()) {
            m_lastRead.restart();
            emit levelsChanged(levels);
        }
    });
    const auto lost = [this, process] {
        if (process != m_capture) return;
        stopCapture();
    };
    connect(process, qOverload<int, QProcess::ExitStatus>(&QProcess::finished), this, lost);
    connect(process, &QProcess::errorOccurred, this, [lost](QProcess::ProcessError) { lost(); });
    process->start(program, {QStringLiteral("--record"), QStringLiteral("--raw"),
        QStringLiteral("--rate"), QStringLiteral("16000"), QStringLiteral("--channels"), QStringLiteral("1"),
        QStringLiteral("--format"), QStringLiteral("s16"), QStringLiteral("--latency"), QStringLiteral("50ms"),
        QStringLiteral("--target"), m_target,
        QStringLiteral("--properties"), QStringLiteral("{ stream.capture.sink=true node.dont-fallback=true node.linger=true node.name=linux-island-meter media.role=Music }"),
        QStringLiteral("-")});
}

void AudioMeter::stopCapture() {
    auto *process = m_capture;
    m_capture = nullptr;
    if (process) {
        process->disconnect(this);
        if (process->state() == QProcess::NotRunning) process->deleteLater();
        else {
            connect(process, qOverload<int, QProcess::ExitStatus>(&QProcess::finished), process, &QObject::deleteLater);
            process->terminate();
            QTimer::singleShot(300, process, [process] {
                if (process->state() != QProcess::NotRunning) process->kill();
            });
        }
    }
    m_buffer.clear();
    m_bands = AudioBands{};
    m_lastRead.invalidate();
    emit levelsChanged({0.0, 0.0, 0.0});
}
