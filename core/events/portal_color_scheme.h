#pragma once

#include <QDBusConnection>
#include <QDBusVariant>
#include <QObject>
#include <QVariant>

// Observes org.freedesktop.portal.Settings (org.freedesktop.appearance color-scheme)
// asynchronously so "system" theme tracks dark/light mode across GNOME, KDE, XFCE,
// and wlroots desktops on Qt 6.4+.
class PortalColorSchemeObserver : public QObject {
    Q_OBJECT

public:
    explicit PortalColorSchemeObserver(const QDBusConnection &bus = QDBusConnection::sessionBus(),
                                       QObject *parent = nullptr);

    bool isDark() const { return m_isDark; }

    // 1 = prefer dark, 2 = prefer light, 0/other = keep fallback.
    static bool parseScheme(const QVariant &value, bool fallbackDark = true);

signals:
    void darkModeChanged(bool isDark);

private slots:
    void onSettingChanged(const QString &ns, const QString &key, const QDBusVariant &value);

private:
    void queryInitial();
    void applyScheme(const QVariant &value);

    QDBusConnection m_bus;
    bool m_isDark = true;
};
