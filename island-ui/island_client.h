#pragma once

#include <QObject>
#include <QString>
#include <QVariantMap>
#include <QDBusConnection>
#include <QTimer>
#include <QStringList>

class IslandClient : public QObject {
    Q_OBJECT

    // UI state & interaction
    Q_PROPERTY(QString uiState READ uiState NOTIFY uiStateChanged)
    Q_PROPERTY(bool connected READ connected NOTIFY connectedChanged)

    // Media properties
    Q_PROPERTY(QString playerId READ playerId NOTIFY mediaChanged)
    Q_PROPERTY(QString title READ title NOTIFY mediaChanged)
    Q_PROPERTY(QString artist READ artist NOTIFY mediaChanged)
    Q_PROPERTY(QString albumArtUri READ albumArtUri NOTIFY mediaChanged)
    Q_PROPERTY(QString playbackStatus READ playbackStatus NOTIFY mediaChanged)
    Q_PROPERTY(bool isPlaying READ isPlaying NOTIFY mediaChanged)
    Q_PROPERTY(qlonglong positionUs READ positionUs NOTIFY mediaChanged)
    Q_PROPERTY(qlonglong durationUs READ durationUs NOTIFY mediaChanged)
    Q_PROPERTY(double progress READ progress NOTIFY mediaChanged)
    Q_PROPERTY(QString timeElapsedText READ timeElapsedText NOTIFY mediaChanged)
    Q_PROPERTY(QString timeTotalText READ timeTotalText NOTIFY mediaChanged)
    Q_PROPERTY(bool canPlayPause READ canPlayPause NOTIFY mediaChanged)
    Q_PROPERTY(bool canNext READ canNext NOTIFY mediaChanged)
    Q_PROPERTY(bool canPrevious READ canPrevious NOTIFY mediaChanged)
    Q_PROPERTY(bool canSeek READ canSeek NOTIFY mediaChanged)
    Q_PROPERTY(QVariantList audioLevels READ audioLevels NOTIFY mediaChanged)
    Q_PROPERTY(double volume READ volume NOTIFY mediaChanged)
    Q_PROPERTY(QStringList availablePlayers READ availablePlayers NOTIFY availablePlayersChanged)

    // Settings properties
    Q_PROPERTY(QString theme READ theme NOTIFY settingsChanged)
    Q_PROPERTY(bool effectiveDarkTheme READ effectiveDarkTheme NOTIFY settingsChanged)
    Q_PROPERTY(QString capsuleSize READ capsuleSize NOTIFY settingsChanged)
    Q_PROPERTY(bool animationEnabled READ animationEnabled NOTIFY settingsChanged)
    Q_PROPERTY(bool hoverPreviewEnabled READ hoverPreviewEnabled NOTIFY settingsChanged)
    Q_PROPERTY(bool notificationPeekEnabled READ notificationPeekEnabled NOTIFY settingsChanged)
    Q_PROPERTY(bool smartAdaptiveEnabled READ smartAdaptiveEnabled NOTIFY settingsChanged)
    Q_PROPERTY(bool whatsappIntegrationEnabled READ whatsappIntegrationEnabled NOTIFY settingsChanged)
    Q_PROPERTY(QString displayMode READ displayMode NOTIFY settingsChanged)
    Q_PROPERTY(int verticalOffset READ verticalOffset NOTIFY settingsChanged)
    Q_PROPERTY(int horizontalOffset READ horizontalOffset NOTIFY settingsChanged)
    Q_PROPERTY(QString searchEngine READ searchEngine NOTIFY settingsChanged)

public:
    explicit IslandClient(const QDBusConnection &bus = QDBusConnection::sessionBus(), QObject *parent = nullptr);

    QString uiState() const { return m_uiState; }
    bool connected() const { return m_connected; }

    QString playerId() const { return m_playerId; }
    QString title() const { return m_title; }
    QString artist() const { return m_artist; }
    QString albumArtUri() const { return m_albumArtUri; }
    QString playbackStatus() const { return m_playbackStatus; }
    bool isPlaying() const { return m_playbackStatus == QLatin1String("Playing"); }
    qlonglong positionUs() const { return m_positionUs; }
    qlonglong durationUs() const { return m_durationUs; }
    double progress() const;
    QString timeElapsedText() const;
    QString timeTotalText() const;
    bool canPlayPause() const { return m_canPlay || m_canPause; }
    bool canNext() const { return m_canNext; }
    bool canPrevious() const { return m_canPrevious; }
    bool canSeek() const { return m_canSeek; }
    QVariantList audioLevels() const { return m_audioLevels; }
    double volume() const { return m_volume; }
    QStringList availablePlayers() const { return m_availablePlayers; }

    QString theme() const { return m_theme; }
    bool effectiveDarkTheme() const;
    QString capsuleSize() const { return m_capsuleSize; }
    bool animationEnabled() const { return m_animationEnabled; }
    bool hoverPreviewEnabled() const { return m_hoverPreviewEnabled; }
    bool notificationPeekEnabled() const { return m_notificationPeekEnabled; }
    bool smartAdaptiveEnabled() const { return m_smartAdaptiveEnabled; }
    bool whatsappIntegrationEnabled() const { return m_whatsappIntegrationEnabled; }
    QString displayMode() const { return m_displayMode; }
    int verticalOffset() const { return m_verticalOffset; }
    int horizontalOffset() const { return m_horizontalOffset; }
    QString searchEngine() const { return m_searchEngine; }

    static QString transitionState(const QString &currentState, const QString &event);
    static QString formatTime(qlonglong us);
    static double clampVolume(double value);

    Q_INVOKABLE void dispatchEvent(const QString &event);
    Q_INVOKABLE void controlMedia(const QString &action);
    Q_INVOKABLE void seekToFraction(double fraction);
    Q_INVOKABLE void setVolume(double value);
    Q_INVOKABLE void setActivePlayer(const QString &playerId);
    Q_INVOKABLE void cycleActivePlayer();
    Q_INVOKABLE void updateSettings(const QVariantMap &patch);
    Q_INVOKABLE void cycleTheme();

signals:
    void uiStateChanged();
    void connectedChanged();
    void mediaChanged();
    void availablePlayersChanged();
    void settingsChanged();

private slots:
    void onNameOwnerChanged(const QString &serviceName, const QString &oldOwner, const QString &newOwner);
    void onMediaChanged(quint64 revision, const QVariantMap &media);
    void onSettingsChanged(quint64 revision, const QVariantMap &settings);
    void onCoreStatusChanged(const QString &status);
    void onPeekTimeout();

private:
    void fetchSnapshot();
    void applyMediaMap(const QVariantMap &media);
    void applySettingsMap(const QVariantMap &settings);
    void queryAvailablePlayers();

    QDBusConnection m_bus;
    QString m_uiState = QStringLiteral("COMPACT");
    bool m_connected = false;
    QTimer m_peekTimer;

    // Media
    QString m_playerId;
    QString m_title;
    QString m_artist;
    QString m_albumArtUri;
    QString m_playbackStatus = QStringLiteral("Stopped");
    qlonglong m_positionUs = 0;
    qlonglong m_durationUs = 0;
    bool m_canPlay = false;
    bool m_canPause = false;
    bool m_canNext = false;
    bool m_canPrevious = false;
    bool m_canSeek = false;
    QVariantList m_audioLevels = {0.0, 0.0, 0.0};
    double m_volume = 1.0;
    QStringList m_availablePlayers;

    // Settings
    QString m_theme = QStringLiteral("system");
    QString m_capsuleSize = QStringLiteral("medium");
    bool m_animationEnabled = true;
    bool m_hoverPreviewEnabled = true;
    bool m_notificationPeekEnabled = false;
    bool m_smartAdaptiveEnabled = true;
    bool m_whatsappIntegrationEnabled = false;
    QString m_displayMode = QStringLiteral("dynamic");
    int m_verticalOffset = 8;
    int m_horizontalOffset = 0;
    QString m_searchEngine = QStringLiteral("google");
};
