#include "portal_color_scheme.h"

#include <QDBusInterface>
#include <QDBusMessage>
#include <QDBusPendingCall>
#include <QDBusPendingCallWatcher>
#include <QDBusPendingReply>
#include <QGuiApplication>
#include <QStyleHints>

PortalColorSchemeObserver::PortalColorSchemeObserver(const QDBusConnection &bus, QObject *parent)
    : QObject(parent),
      m_bus(bus) {
#if QT_VERSION >= QT_VERSION_CHECK(6, 5, 0)
    if (qGuiApp && QGuiApplication::styleHints()) {
        if (QGuiApplication::styleHints()->colorScheme() == Qt::ColorScheme::Light) {
            m_isDark = false;
        }
        connect(QGuiApplication::styleHints(), &QStyleHints::colorSchemeChanged, this,
                [this](Qt::ColorScheme scheme) {
                    const bool nextDark = (scheme != Qt::ColorScheme::Light);
                    if (m_isDark != nextDark) {
                        m_isDark = nextDark;
                        emit darkModeChanged(m_isDark);
                    }
                });
    }
#endif

    if (m_bus.isConnected()) {
        m_bus.connect(
            QStringLiteral("org.freedesktop.portal.Desktop"),
            QStringLiteral("/org/freedesktop/portal/desktop"),
            QStringLiteral("org.freedesktop.portal.Settings"),
            QStringLiteral("SettingChanged"),
            this,
            SLOT(onSettingChanged(QString,QString,QDBusVariant)));
        queryInitial();
    }
}

bool PortalColorSchemeObserver::parseScheme(const QVariant &value, bool fallbackDark) {
    QVariant unwrapped = value;
    if (unwrapped.userType() == qMetaTypeId<QDBusVariant>()) {
        unwrapped = qvariant_cast<QDBusVariant>(unwrapped).variant();
    }
    bool ok = false;
    const uint code = unwrapped.toUInt(&ok);
    if (!ok) {
        return fallbackDark;
    }
    if (code == 1) return true;
    if (code == 2) return false;
    return fallbackDark;
}

void PortalColorSchemeObserver::queryInitial() {
    QDBusInterface portal(
        QStringLiteral("org.freedesktop.portal.Desktop"),
        QStringLiteral("/org/freedesktop/portal/desktop"),
        QStringLiteral("org.freedesktop.portal.Settings"),
        m_bus);
    if (!portal.isValid()) {
        return;
    }
    QDBusPendingCall call = portal.asyncCall(
        QStringLiteral("Read"),
        QStringLiteral("org.freedesktop.appearance"),
        QStringLiteral("color-scheme"));
    auto *watcher = new QDBusPendingCallWatcher(call, this);
    connect(watcher, &QDBusPendingCallWatcher::finished, this, [this](QDBusPendingCallWatcher *w) {
        w->deleteLater();
        const QDBusMessage reply = w->reply();
        if (reply.type() == QDBusMessage::ReplyMessage && !reply.arguments().isEmpty()) {
            applyScheme(reply.arguments().at(0));
        }
    });
}

void PortalColorSchemeObserver::onSettingChanged(const QString &ns, const QString &key, const QDBusVariant &value) {
    if (ns == QLatin1String("org.freedesktop.appearance") &&
        key == QLatin1String("color-scheme")) {
        applyScheme(value.variant());
    }
}

void PortalColorSchemeObserver::applyScheme(const QVariant &value) {
    const bool nextDark = parseScheme(value, m_isDark);
    if (m_isDark != nextDark) {
        m_isDark = nextDark;
        emit darkModeChanged(m_isDark);
    }
}
