#pragma once

#include <QObject>
#include <QDBusConnection>
#include <QDBusAbstractAdaptor>
#include <QVariantMap>

class FakeMprisPlayer : public QObject {
    Q_OBJECT
public:
    explicit FakeMprisPlayer(const QString &serviceName = QStringLiteral("org.mpris.MediaPlayer2.LinuxIslandFake"),
                             QObject *parent = nullptr);
    ~FakeMprisPlayer() override;

    bool start();
    void stop();

    void setPlaybackStatus(const QString &status);
    void setMetadata(const QVariantMap &metadata);
    void seekTo(qint64 position);

    QString serviceName() const { return m_serviceName; }

private:
    QString m_serviceName;
    QDBusConnection m_bus;
    bool m_registered = false;
    QString m_playbackStatus = QStringLiteral("Playing");
    QVariantMap m_metadata;
    qint64 m_position = 1000000;

    friend class FakeMprisPlayerAdaptor;
};

class FakeMprisPlayerAdaptor : public QDBusAbstractAdaptor {
    Q_OBJECT
    Q_CLASSINFO("D-Bus Interface", "org.mpris.MediaPlayer2.Player")
    Q_PROPERTY(QString PlaybackStatus READ playbackStatus)
    Q_PROPERTY(QVariantMap Metadata READ metadata)
    Q_PROPERTY(double Rate READ rate)
    Q_PROPERTY(bool CanPlay READ canPlay)
    Q_PROPERTY(bool CanPause READ canPause)
    Q_PROPERTY(bool CanGoNext READ canGoNext)
    Q_PROPERTY(bool CanGoPrevious READ canGoPrevious)
    Q_PROPERTY(bool CanSeek READ canSeek)
    Q_PROPERTY(qint64 Position READ position)

public:
    explicit FakeMprisPlayerAdaptor(FakeMprisPlayer *parent);

    QString playbackStatus() const { return m_player->m_playbackStatus; }
    QVariantMap metadata() const { return m_player->m_metadata; }
    double rate() const { return 1.0; }
    bool canPlay() const { return true; }
    bool canPause() const { return true; }
    bool canGoNext() const { return true; }
    bool canGoPrevious() const { return true; }
    bool canSeek() const { return true; }
    qint64 position() const { return m_player->m_position; }

public slots:
    void Play() { m_player->setPlaybackStatus(QStringLiteral("Playing")); }
    void Pause() { m_player->setPlaybackStatus(QStringLiteral("Paused")); }
    void PlayPause() {
        if (m_player->m_playbackStatus == QLatin1String("Playing")) {
            m_player->setPlaybackStatus(QStringLiteral("Paused"));
        } else {
            m_player->setPlaybackStatus(QStringLiteral("Playing"));
        }
    }
    void Next() {}
    void Previous() {}
    void Stop() { m_player->setPlaybackStatus(QStringLiteral("Stopped")); }

private:
    FakeMprisPlayer *m_player;
};
