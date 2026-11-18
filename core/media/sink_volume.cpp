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

// "Volume: front-left: 42598 /  65% / -11.22 dB, ..."
const QRegularExpression &pactlVolumePattern() {
    static const QRegularExpression re(QStringLiteral(R"((\d+)%)"));
    return re;
}

const QRegularExpression &pactlMutePattern() {
    static const QRegularExpression re(QStringLiteral(R"(^\s*Mute:\s*(yes|no))"),
                                       QRegularExpression::MultilineOption);
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
                if (code != 0 || status != QProcess::NormalExit) {
                    m_querying = false;
                    m_pactlReadingMute = false;
                    return;
                }
                const QString text = QString::fromUtf8(m_query.readAllStandardOutput());
                if (m_backend == Backend::Pactl) {
                    if (!m_pactlReadingMute) {
                        const auto match = pactlVolumePattern().match(text);
                        if (!match.hasMatch()) {
                            m_querying = false;
                            return;
                        }
                        bool ok = false;
                        const int pct = match.captured(1).toInt(&ok);
                        if (!ok) {
                            m_querying = false;
                            return;
                        }
                        m_pendingPactlLevel = std::clamp(pct / 100.0, 0.0, 1.0);
                        m_pactlReadingMute = true;
                        m_query.start(m_program, {QStringLiteral("get-sink-mute"), QStringLiteral("@DEFAULT_SINK@")});
                        return;
                    }
                    m_pactlReadingMute = false;
                    m_querying = false;
                    const auto match = pactlMutePattern().match(text);
                    if (!match.hasMatch()) return;
                    emitIfChanged(m_pendingPactlLevel, match.captured(1) == QLatin1String("yes"));
                    return;
                }

                m_querying = false;
                const auto match = volumePattern().match(text);
                if (!match.hasMatch()) return;
                bool ok = false;
                const double level = match.captured(1).toDouble(&ok);
                if (!ok || !std::isfinite(level)) return;
                emitIfChanged(std::clamp(level, 0.0, 1.0), !match.captured(2).isEmpty());
            });
    connect(&m_query, &QProcess::errorOccurred, this, [this](QProcess::ProcessError) {
        m_querying = false;
        m_pactlReadingMute = false;
    });
}

SinkVolume::~SinkVolume() {
    stop();
}

void SinkVolume::start() {
    if (m_running) return;
    m_program = QStandardPaths::findExecutable(QStringLiteral("wpctl"));
    if (!m_program.isEmpty()) {
        m_backend = Backend::Wpctl;
    } else {
        m_program = QStandardPaths::findExecutable(QStringLiteral("pactl"));
        m_backend = m_program.isEmpty() ? Backend::None : Backend::Pactl;
    }
    if (m_backend == Backend::None) return;
    m_running = true;
    poll();
    m_timer.start();
}

void SinkVolume::stop() {
    m_running = false;
    m_timer.stop();
    if (m_query.state() != QProcess::NotRunning) m_query.kill();
    m_querying = false;
    m_pactlReadingMute = false;
}

void SinkVolume::poll() {
    if (!m_running || m_querying) return;
    if (m_query.state() != QProcess::NotRunning) return;
    m_querying = true;
    m_pactlReadingMute = false;
    if (m_backend == Backend::Pactl) {
        m_query.start(m_program, {QStringLiteral("get-sink-volume"), QStringLiteral("@DEFAULT_SINK@")});
    } else {
        m_query.start(m_program, {QStringLiteral("get-volume"), QStringLiteral("@DEFAULT_AUDIO_SINK@")});
    }
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
        if (m_backend == Backend::Pactl) {
            QProcess::startDetached(m_program, {QStringLiteral("set-sink-mute"),
                                                QStringLiteral("@DEFAULT_SINK@"),
                                                QStringLiteral("0")});
        } else {
            QProcess::startDetached(m_program, {QStringLiteral("set-mute"),
                                                QStringLiteral("@DEFAULT_AUDIO_SINK@"),
                                                QStringLiteral("0")});
        }
    }
    if (m_backend == Backend::Pactl) {
        QProcess::startDetached(m_program, {QStringLiteral("set-sink-volume"),
                                            QStringLiteral("@DEFAULT_SINK@"),
                                            QString::number(qRound(clamped * 100.0)) + QLatin1Char('%')});
    } else {
        QProcess::startDetached(m_program, {QStringLiteral("set-volume"),
                                            QStringLiteral("@DEFAULT_AUDIO_SINK@"),
                                            QString::number(clamped, 'f', 3)});
    }

    // Show the new level immediately; the next poll confirms or reverts it.
    emitIfChanged(clamped, false);
}

void SinkVolume::setMuted(bool muted) {
    if (m_program.isEmpty()) return;
    if (m_backend == Backend::Pactl) {
        QProcess::startDetached(m_program, {QStringLiteral("set-sink-mute"),
                                            QStringLiteral("@DEFAULT_SINK@"),
                                            muted ? QStringLiteral("1") : QStringLiteral("0")});
    } else {
        QProcess::startDetached(m_program, {QStringLiteral("set-mute"),
                                            QStringLiteral("@DEFAULT_AUDIO_SINK@"),
                                            muted ? QStringLiteral("1") : QStringLiteral("0")});
    }
    emitIfChanged(m_level, muted);
}
