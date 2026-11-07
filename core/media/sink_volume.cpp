#include "sink_volume.h"

#include <QRegularExpression>
#include <QStandardPaths>
#include <algorithm>
#include <cmath>

namespace {
constexpr int kPollIntervalMs = 800;
constexpr int kQueryTimeoutMs = 1200;
constexpr double kChangeEpsilon = 0.002;

// "Volume: 0.950000" / "Volume: 0.950000 [MUTED]"
const QRegularExpression &volumePattern() {
    static const QRegularExpression re(
        QStringLiteral(R"(^\s*Volume:\s*([0-9]*\.?[0-9]+)\s*(\[MUTED\])?)"));
    return re;
}
} // namespace

SinkVolume::SinkVolume(QObject *parent)
    : QObject(parent) {
    m_timer.setInterval(kPollIntervalMs);
    connect(&m_timer, &QTimer::timeout, this, &SinkVolume::poll);

    m_query.setStandardErrorFile(QProcess::nullDevice());
    connect(&m_query, qOverload<int, QProcess::ExitStatus>(&QProcess::finished), this,
            [this](int code, QProcess::ExitStatus status) {
                m_querying = false;
                if (code != 0 || status != QProcess::NormalExit) return;
                const QString text = QString::fromUtf8(m_query.readAllStandardOutput());
                const auto match = volumePattern().match(text);
                if (!match.hasMatch()) return;
                bool ok = false;
                const double level = match.captured(1).toDouble(&ok);
                if (!ok || !std::isfinite(level)) return;
                emitIfChanged(std::clamp(level, 0.0, 1.0), !match.captured(2).isEmpty());
            });
    connect(&m_query, &QProcess::errorOccurred, this, [this](QProcess::ProcessError) {
        m_querying = false;
    });
}

SinkVolume::~SinkVolume() {
    stop();
}

void SinkVolume::start() {
    if (m_running) return;
    m_program = QStandardPaths::findExecutable(QStringLiteral("wpctl"));
    if (m_program.isEmpty()) return;
    m_running = true;
    poll();
    m_timer.start();
}

void SinkVolume::stop() {
    m_running = false;
    m_timer.stop();
    if (m_query.state() != QProcess::NotRunning) m_query.kill();
    m_querying = false;
}

void SinkVolume::poll() {
    if (!m_running || m_querying) return;
    if (m_query.state() != QProcess::NotRunning) return;
    m_querying = true;
    m_query.start(m_program, {QStringLiteral("get-volume"), QStringLiteral("@DEFAULT_AUDIO_SINK@")});
    QTimer::singleShot(kQueryTimeoutMs, &m_query, [this] {
        if (m_query.state() != QProcess::NotRunning) m_query.kill();
    });
}

void SinkVolume::emitIfChanged(double level, bool muted) {
    const bool didChange = !m_known ||
        std::abs(level - m_level) > kChangeEpsilon ||
        muted != m_muted;
    m_level = level;
    m_muted = muted;
    m_known = true;
    if (didChange) {
        emit changed(volume(), m_muted);
    }
}

void SinkVolume::setVolume(double level) {
    if (!std::isfinite(level)) return;
    const double clamped = std::clamp(level, 0.0, 1.0);
    if (m_program.isEmpty()) return;

    // Silence is a mute, not a destructive write of 0 to the sink: the level
    // survives so unmuting restores what the user had.
    if (clamped <= 0.0) {
        setMuted(true);
        return;
    }

    // Setting a level always implies "audible", so a muted sink is unmuted in
    // the same breath; wpctl keeps the mute flag across a volume write.
    if (m_muted) {
        QProcess::startDetached(m_program, {QStringLiteral("set-mute"),
                                            QStringLiteral("@DEFAULT_AUDIO_SINK@"),
                                            QStringLiteral("0")});
    }
    QProcess::startDetached(m_program, {QStringLiteral("set-volume"),
                                        QStringLiteral("@DEFAULT_AUDIO_SINK@"),
                                        QString::number(clamped, 'f', 3)});

    // Show the new level immediately; the next poll confirms or reverts it.
    emitIfChanged(clamped, false);
}

void SinkVolume::setMuted(bool muted) {
    if (m_program.isEmpty()) return;
    QProcess::startDetached(m_program, {QStringLiteral("set-mute"),
                                        QStringLiteral("@DEFAULT_AUDIO_SINK@"),
                                        muted ? QStringLiteral("1") : QStringLiteral("0")});
    emitIfChanged(m_level, muted);
}
