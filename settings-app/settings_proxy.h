#pragma once

#include <QObject>
#include <QString>
#include <QVariantMap>
#include <QDBusConnection>

class SettingsProxy : public QObject {
    Q_OBJECT
    Q_PROPERTY(QString theme READ theme WRITE setTheme NOTIFY themeChanged)
    Q_PROPERTY(QString capsuleSize READ capsuleSize WRITE setCapsuleSize NOTIFY capsuleSizeChanged)
    Q_PROPERTY(bool animationEnabled READ animationEnabled WRITE setAnimationEnabled NOTIFY animationEnabledChanged)
    Q_PROPERTY(bool hoverPreviewEnabled READ hoverPreviewEnabled WRITE setHoverPreviewEnabled NOTIFY hoverPreviewEnabledChanged)
    Q_PROPERTY(bool notificationPeekEnabled READ notificationPeekEnabled WRITE setNotificationPeekEnabled NOTIFY notificationPeekEnabledChanged)
    Q_PROPERTY(bool smartAdaptiveEnabled READ smartAdaptiveEnabled WRITE setSmartAdaptiveEnabled NOTIFY smartAdaptiveEnabledChanged)
    Q_PROPERTY(bool whatsappIntegrationEnabled READ whatsappIntegrationEnabled WRITE setWhatsappIntegrationEnabled NOTIFY whatsappIntegrationEnabledChanged)
    Q_PROPERTY(QString preferredPlayerId READ preferredPlayerId WRITE setPreferredPlayerId NOTIFY preferredPlayerIdChanged)
    Q_PROPERTY(QString displayMode READ displayMode WRITE setDisplayMode NOTIFY displayModeChanged)
    Q_PROPERTY(int verticalOffset READ verticalOffset WRITE setVerticalOffset NOTIFY verticalOffsetChanged)
    Q_PROPERTY(int horizontalOffset READ horizontalOffset WRITE setHorizontalOffset NOTIFY horizontalOffsetChanged)
    Q_PROPERTY(bool busy READ busy NOTIFY busyChanged)
    Q_PROPERTY(QString errorMessage READ errorMessage NOTIFY errorMessageChanged)
    Q_PROPERTY(bool connected READ connected NOTIFY connectedChanged)
    Q_PROPERTY(QStringList availablePlayers READ availablePlayers NOTIFY availablePlayersChanged)

public:
    explicit SettingsProxy(const QDBusConnection &bus = QDBusConnection::sessionBus(), QObject *parent = nullptr);
    ~SettingsProxy() override;

    QString theme() const { return m_theme; }
    QString capsuleSize() const { return m_capsuleSize; }
    bool animationEnabled() const { return m_animationEnabled; }
    bool hoverPreviewEnabled() const { return m_hoverPreviewEnabled; }
    bool notificationPeekEnabled() const { return m_notificationPeekEnabled; }
    bool smartAdaptiveEnabled() const { return m_smartAdaptiveEnabled; }
    bool whatsappIntegrationEnabled() const { return m_whatsappIntegrationEnabled; }
    QString preferredPlayerId() const { return m_preferredPlayerId; }
    QString displayMode() const { return m_displayMode; }
    int verticalOffset() const { return m_verticalOffset; }
    int horizontalOffset() const { return m_horizontalOffset; }
    bool busy() const { return m_busy; }
    QString errorMessage() const { return m_errorMessage; }
    bool connected() const { return m_connected; }
    QStringList availablePlayers() const { return m_availablePlayers; }
    Q_INVOKABLE QString playerDisplayName(const QString &playerId) const;

    Q_INVOKABLE void setTheme(const QString &theme);
    Q_INVOKABLE void setCapsuleSize(const QString &size);
    Q_INVOKABLE void setAnimationEnabled(bool enabled);
    Q_INVOKABLE void setHoverPreviewEnabled(bool enabled);
    Q_INVOKABLE void setNotificationPeekEnabled(bool enabled);
    Q_INVOKABLE void setSmartAdaptiveEnabled(bool enabled);
    Q_INVOKABLE void setWhatsappIntegrationEnabled(bool enabled);
    Q_INVOKABLE void setPreferredPlayerId(const QString &id);
    Q_INVOKABLE void setVerticalOffset(int val);
    Q_INVOKABLE void setHorizontalOffset(int val);
    Q_INVOKABLE void setDisplayMode(const QString &mode);
    Q_INVOKABLE void refresh();

signals:
    void themeChanged();
    void capsuleSizeChanged();
    void animationEnabledChanged();
    void hoverPreviewEnabledChanged();
    void notificationPeekEnabledChanged();
    void smartAdaptiveEnabledChanged();
    void whatsappIntegrationEnabledChanged();
    void preferredPlayerIdChanged();
    void displayModeChanged();
    void verticalOffsetChanged();
    void horizontalOffsetChanged();
    void busyChanged();
    void errorMessageChanged();
    void connectedChanged();
    void availablePlayersChanged();

private slots:
    void onNameOwnerChanged(const QString &serviceName, const QString &oldOwner, const QString &newOwner);
    void onSettingsChanged(quint64 revision, const QVariantMap &settings);

private:
    void applySettingsMap(const QVariantMap &settings);
    void sendPatch(const QVariantMap &patch);

    void queryAvailablePlayers();

    QDBusConnection m_bus;
    QString m_theme = QStringLiteral("system");
    QString m_capsuleSize = QStringLiteral("medium");
    bool m_animationEnabled = true;
    bool m_hoverPreviewEnabled = true;
    bool m_notificationPeekEnabled = false;
    bool m_smartAdaptiveEnabled = true;
    bool m_whatsappIntegrationEnabled = false;
    QString m_preferredPlayerId;
    QString m_displayMode = QStringLiteral("dynamic");
    int m_verticalOffset = 8;
    int m_horizontalOffset = 0;
    bool m_busy = false;
    QString m_errorMessage;
    bool m_connected = false;
    QStringList m_availablePlayers;
};
