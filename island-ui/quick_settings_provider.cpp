#include "quick_settings_provider.h"
#include <QProcess>
#include <QDBusInterface>
#include <QDBusReply>
#include <QDBusMessage>
#include <QDBusConnection>
#include <QStandardPaths>
#include <QFileInfo>
#include <QDir>

QuickSettingsProvider::QuickSettingsProvider(QObject *parent)
    : QObject(parent) {
    detectInitialTheme();
}

void QuickSettingsProvider::detectInitialTheme() {
    // Try XDG Desktop Portal Settings
    QDBusInterface portal(
        QStringLiteral("org.freedesktop.portal.Desktop"),
        QStringLiteral("/org/freedesktop/portal/desktop"),
        QStringLiteral("org.freedesktop.portal.Settings"),
        QDBusConnection::sessionBus());

    if (portal.isValid()) {
        QDBusMessage reply = portal.call(
            QStringLiteral("Read"),
            QStringLiteral("org.freedesktop.appearance"),
            QStringLiteral("color-scheme"));

        if (reply.type() == QDBusMessage::ReplyMessage && !reply.arguments().isEmpty()) {
            QVariant outer = reply.arguments().at(0);
            if (outer.userType() == qMetaTypeId<QDBusVariant>()) {
                uint schemeVal = qvariant_cast<QDBusVariant>(outer).variant().toUInt();
                m_darkMode = (schemeVal == 1); // 1 = Prefer dark
                return;
            }
        }
    }

    // Fallback: check gsettings
    QString gsettingsBin = QStandardPaths::findExecutable(QStringLiteral("gsettings"));
    if (!gsettingsBin.isEmpty()) {
        QProcess proc;
        proc.start(gsettingsBin, {QStringLiteral("get"), QStringLiteral("org.gnome.desktop.interface"), QStringLiteral("color-scheme")});
        if (proc.waitForFinished(500)) {
            QString out = QString::fromUtf8(proc.readAllStandardOutput()).trimmed();
            if (out.contains(QLatin1String("prefer-dark"))) {
                m_darkMode = true;
                return;
            } else if (out.contains(QLatin1String("default"))) {
                m_darkMode = false;
                return;
            }
        }
    }

    // Default to dark mode for Warm Minimalist dark palette
    m_darkMode = true;
}

void QuickSettingsProvider::toggleDarkMode() {
    m_darkMode = !m_darkMode;
    emit stateChanged();
    emit themeOverrideRequested(m_darkMode ? QStringLiteral("dark") : QStringLiteral("light"));

    // Async notify system if gsettings exists
    QString gsettingsBin = QStandardPaths::findExecutable(QStringLiteral("gsettings"));
    if (!gsettingsBin.isEmpty()) {
        QProcess::startDetached(gsettingsBin, {
            QStringLiteral("set"),
            QStringLiteral("org.gnome.desktop.interface"),
            QStringLiteral("color-scheme"),
            m_darkMode ? QStringLiteral("prefer-dark") : QStringLiteral("default")
        });
    }

    // If KDE plasma-apply-colorscheme exists
    QString plasmaBin = QStandardPaths::findExecutable(QStringLiteral("plasma-apply-colorscheme"));
    if (!plasmaBin.isEmpty()) {
        QProcess::startDetached(plasmaBin, {
            m_darkMode ? QStringLiteral("BreezeDark") : QStringLiteral("BreezeLight")
        });
    }
}

void QuickSettingsProvider::toggleNightLight() {
    m_nightLight = !m_nightLight;
    emit stateChanged();

    // Try gsettings for GNOME / Budgie / Cinnamon
    QString gsettingsBin = QStandardPaths::findExecutable(QStringLiteral("gsettings"));
    if (!gsettingsBin.isEmpty()) {
        QProcess::startDetached(gsettingsBin, {
            QStringLiteral("set"),
            QStringLiteral("org.gnome.settings-daemon.plugins.color"),
            QStringLiteral("night-light-enabled"),
            m_nightLight ? QStringLiteral("true") : QStringLiteral("false")
        });
    }

    // Try KDE KWin NightColor via D-Bus
    QDBusInterface kdeColor(
        QStringLiteral("org.kde.KWin"),
        QStringLiteral("/ColorCorrect"),
        QStringLiteral("org.kde.kwin.ColorCorrect"),
        QDBusConnection::sessionBus());
    if (kdeColor.isValid()) {
        kdeColor.call(QStringLiteral("setNightColorConfig"), QVariantMap{{QStringLiteral("Active"), m_nightLight}});
    }
}

void QuickSettingsProvider::toggleDnd() {
    m_dnd = !m_dnd;
    emit stateChanged();

    // Sync with mako / dunst / swaync / gsettings if available
    QString makoctl = QStandardPaths::findExecutable(QStringLiteral("makoctl"));
    if (!makoctl.isEmpty()) {
        QProcess::startDetached(makoctl, {QStringLiteral("mode"), QStringLiteral("-t"), QStringLiteral("do-not-disturb")});
    }

    QString dunstctl = QStandardPaths::findExecutable(QStringLiteral("dunstctl"));
    if (!dunstctl.isEmpty()) {
        QProcess::startDetached(dunstctl, {QStringLiteral("set-paused"), QStringLiteral("toggle")});
    }

    QString swaync = QStandardPaths::findExecutable(QStringLiteral("swaync-client"));
    if (!swaync.isEmpty()) {
        QProcess::startDetached(swaync, {QStringLiteral("-d")});
    }

    QString gsettingsBin = QStandardPaths::findExecutable(QStringLiteral("gsettings"));
    if (!gsettingsBin.isEmpty()) {
        QProcess::startDetached(gsettingsBin, {
            QStringLiteral("set"),
            QStringLiteral("org.gnome.desktop.notifications"),
            QStringLiteral("show-banners"),
            m_dnd ? QStringLiteral("false") : QStringLiteral("true")
        });
    }
}

void QuickSettingsProvider::openSettingsApp() {
    QString bin = QStandardPaths::findExecutable(QStringLiteral("linux-island-settings"));
    if (bin.isEmpty()) {
        QString localBin = QDir::homePath() + QStringLiteral("/.local/bin/linux-island-settings");
        if (QFileInfo::exists(localBin)) {
            bin = localBin;
        }
    }

    if (!bin.isEmpty()) {
        QProcess::startDetached(bin, {});
    }
}
