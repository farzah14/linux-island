#pragma once

#include <QObject>
#include <QString>
#include <QVariantMap>
#include <QDBusConnection>
#include "events/portal_color_scheme.h"

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
    Q_PROPERTY(int timerLongBreakMinutes READ timerLongBreakMinutes WRITE setTimerLongBreakMinutes NOTIFY timerLongBreakMinutesChanged)
    Q_PROPERTY(int timerCycles READ timerCycles WRITE setTimerCycles NOTIFY timerCyclesChanged)
    Q_PROPERTY(bool timerAutoAdvance READ timerAutoAdvance WRITE setTimerAutoAdvance NOTIFY timerAutoAdvanceChanged)
    Q_PROPERTY(bool timerCompactHintEnabled READ timerCompactHintEnabled WRITE setTimerCompactHintEnabled NOTIFY timerCompactHintEnabledChanged)
    Q_PROPERTY(int timerPresetMinutes READ timerPresetMinutes WRITE setTimerPresetMinutes NOTIFY timerPresetMinutesChanged)
    Q_PROPERTY(int timerBreakMinutes READ timerBreakMinutes WRITE setTimerBreakMinutes NOTIFY timerBreakMinutesChanged)
    Q_PROPERTY(QString carouselPages READ carouselPages WRITE setCarouselPages NOTIFY carouselPagesChanged)
    Q_PROPERTY(QString defaultPage READ defaultPage WRITE setDefaultPage NOTIFY defaultPageChanged)
    Q_PROPERTY(QString toggleShortcut READ toggleShortcut WRITE setToggleShortcut NOTIFY toggleShortcutChanged)
    Q_PROPERTY(QVariantList carouselModel READ carouselModel NOTIFY carouselPagesChanged)
    Q_PROPERTY(bool busy READ busy NOTIFY busyChanged)
    Q_PROPERTY(QString errorMessage READ errorMessage NOTIFY errorMessageChanged)
    Q_PROPERTY(bool connected READ connected NOTIFY connectedChanged)
    Q_PROPERTY(bool systemDarkTheme READ systemDarkTheme NOTIFY systemDarkThemeChanged)
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
    int timerLongBreakMinutes() const { return m_timerLongBreakMinutes; }
    int timerCycles() const { return m_timerCycles; }
    bool timerAutoAdvance() const { return m_timerAutoAdvance; }
    bool timerCompactHintEnabled() const { return m_timerCompactHintEnabled; }
    int timerPresetMinutes() const { return m_timerPresetMinutes; }
    int timerBreakMinutes() const { return m_timerBreakMinutes; }
    QString carouselPages() const { return m_carouselPages; }
    QString defaultPage() const { return m_defaultPage; }
    QString toggleShortcut() const { return m_toggleShortcut; }
    QVariantList carouselModel() const;
    bool busy() const { return m_busy; }
    QString errorMessage() const { return m_errorMessage; }
    bool connected() const { return m_connected; }
    bool systemDarkTheme() const { return m_portalScheme.isDark(); }
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
    Q_INVOKABLE void setTimerLongBreakMinutes(int minutes);
    Q_INVOKABLE void setTimerCycles(int cycles);
    Q_INVOKABLE void setTimerAutoAdvance(bool enabled);
    Q_INVOKABLE void setTimerCompactHintEnabled(bool enabled);
    Q_INVOKABLE void setTimerPresetMinutes(int minutes);
    Q_INVOKABLE void setTimerBreakMinutes(int minutes);
    Q_INVOKABLE void setCarouselPages(const QString &pages);
    Q_INVOKABLE void setDefaultPage(const QString &page);
    Q_INVOKABLE void setToggleShortcut(const QString &shortcut);
    Q_INVOKABLE void togglePageEnabled(const QString &id);
    Q_INVOKABLE void movePage(const QString &id, int delta);
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
    void timerLongBreakMinutesChanged();
    void timerCyclesChanged();
    void timerAutoAdvanceChanged();
    void timerCompactHintEnabledChanged();
    void timerPresetMinutesChanged();
    void timerBreakMinutesChanged();
    void carouselPagesChanged();
    void defaultPageChanged();
    void toggleShortcutChanged();
    void busyChanged();
    void errorMessageChanged();
    void connectedChanged();
    void systemDarkThemeChanged();
    void availablePlayersChanged();

private slots:
    void onNameOwnerChanged(const QString &serviceName, const QString &oldOwner, const QString &newOwner);
    void onSettingsChanged(quint64 revision, const QVariantMap &settings);

private:
    void applySettingsMap(const QVariantMap &settings);
    void sendPatch(const QVariantMap &patch);

    void queryAvailablePlayers();

    QDBusConnection m_bus;
    PortalColorSchemeObserver m_portalScheme;
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
    int m_timerLongBreakMinutes = 15;
    int m_timerCycles = 4;
    bool m_timerAutoAdvance = true;
    bool m_timerCompactHintEnabled = true;
    int m_timerPresetMinutes = 25;
    int m_timerBreakMinutes = 5;
    QString m_carouselPages = QStringLiteral("media,system,ai,timer,todo");
    QString m_defaultPage = QStringLiteral("media");
    QString m_toggleShortcut = QStringLiteral("<Super><Shift>i");
    bool m_busy = false;
    QString m_errorMessage;
    bool m_connected = false;
    QStringList m_availablePlayers;
};
