#pragma once

#include <QObject>
#include <QProcess>
#include <QTimer>

// Mirrors the default PipeWire sink so the island can show and drive the
// volume the rest of the desktop uses. wpctl is the only interface a headless
// Qt process has here; the value it reports is already the cubic perceptual
// volume that GNOME's slider and the media keys operate on.
//
// `volume()` reports the effective level: 0 while muted, so a muted sink draws
// an empty slider and the muted icon without a second signal. `known()` stays
// false when wpctl is missing or PipeWire is not running, letting callers fall
// back to the media player's own Volume property.
class SinkVolume : public QObject {
    Q_OBJECT
public:
    explicit SinkVolume(QObject *parent = nullptr);
    ~SinkVolume() override;

    double volume() const { return m_muted ? 0.0 : m_level; }
    double level() const { return m_level; }
    bool muted() const { return m_muted; }
    bool known() const { return m_known; }

    void start();
    void stop();

    // level is a 0..1 fraction on the sink's own scale. A non-zero level also
    // clears mute, matching what dragging a slider does everywhere else.
    void setVolume(double level);
    void setMuted(bool muted);

signals:
    void changed(double volume, bool muted);

private:
    enum class Backend { None, Wpctl, Pactl };

    void poll();
    void emitIfChanged(double level, bool muted);

    QTimer m_timer;
    QProcess m_query;
    bool m_querying = false;
    bool m_running = false;
    bool m_pactlReadingMute = false;
    Backend m_backend = Backend::None;
    QString m_program;
    double m_level = 1.0;
    double m_pendingPactlLevel = 1.0;
    bool m_muted = false;
    bool m_known = false;
};
