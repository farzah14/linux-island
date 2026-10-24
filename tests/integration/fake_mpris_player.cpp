#include "fake_mpris_player.h"
#include <QDBusMessage>

FakeMprisPlayerAdaptor::FakeMprisPlayerAdaptor(FakeMprisPlayer *parent)
    : QDBusAbstractAdaptor(parent),
      m_player(parent) {}

FakeMprisPlayer::FakeMprisPlayer(const QString &serviceName, QObject *parent)
    : QObject(parent),
      m_serviceName(serviceName),
      m_bus(QDBusConnection::connectToBus(QDBusConnection::SessionBus, serviceName)) {
    new FakeMprisPlayerAdaptor(this);
    m_metadata[QStringLiteral("xesam:title")] = QStringLiteral("Fake Title");
    m_metadata[QStringLiteral("xesam:artist")] = QStringList{QStringLiteral("Fake Artist")};
    m_metadata[QStringLiteral("mpris:length")] = 180000000LL;
}

FakeMprisPlayer::~FakeMprisPlayer() {
    stop();
    QDBusConnection::disconnectFromBus(m_serviceName);
}

bool FakeMprisPlayer::start() {
    if (m_registered)
        return true;

    if (!m_bus.registerObject(QStringLiteral("/org/mpris/MediaPlayer2"), this, QDBusConnection::ExportAdaptors)) {
        return false;
    }

    if (!m_bus.registerService(m_serviceName)) {
        m_bus.unregisterObject(QStringLiteral("/org/mpris/MediaPlayer2"));
        return false;
    }

    m_registered = true;
    return true;
}

void FakeMprisPlayer::stop() {
    if (m_registered) {
        m_bus.unregisterService(m_serviceName);
        m_bus.unregisterObject(QStringLiteral("/org/mpris/MediaPlayer2"));
        m_registered = false;
    }
}

void FakeMprisPlayer::setPlaybackStatus(const QString &status) {
    if (m_playbackStatus != status) {
        m_playbackStatus = status;
        QVariantMap changed;
        changed[QStringLiteral("PlaybackStatus")] = m_playbackStatus;
        QDBusMessage sig = QDBusMessage::createSignal(
            QStringLiteral("/org/mpris/MediaPlayer2"),
            QStringLiteral("org.freedesktop.DBus.Properties"),
            QStringLiteral("PropertiesChanged"));
        sig << QStringLiteral("org.mpris.MediaPlayer2.Player") << changed << QStringList();
        m_bus.send(sig);
    }
}

void FakeMprisPlayer::setMetadata(const QVariantMap &metadata) {
    m_metadata = metadata;
    QVariantMap changed;
    changed[QStringLiteral("Metadata")] = m_metadata;
    QDBusMessage sig = QDBusMessage::createSignal(
        QStringLiteral("/org/mpris/MediaPlayer2"),
        QStringLiteral("org.freedesktop.DBus.Properties"),
        QStringLiteral("PropertiesChanged"));
    sig << QStringLiteral("org.mpris.MediaPlayer2.Player") << changed << QStringList();
    m_bus.send(sig);
}

void FakeMprisPlayer::seekTo(qint64 position) {
    m_position = position;
    auto signal = QDBusMessage::createSignal(QStringLiteral("/org/mpris/MediaPlayer2"),
        QStringLiteral("org.mpris.MediaPlayer2.Player"), QStringLiteral("Seeked"));
    signal << position;
    m_bus.send(signal);
}
