#include "quick_settings_provider.h"
#include <QProcess>
#include <QDBusInterface>
#include <QDBusMessage>
#include <QDBusConnection>
#include <QDBusPendingCall>
#include <QDBusPendingCallWatcher>
#include <QDBusPendingReply>
#include <QStandardPaths>
#include <QFileInfo>
#include <QDir>

namespace {
void runDetached(const QString &binName, const QStringList &args) {
    const QString bin = QStandardPaths::findExecutable(binName);
    if (!bin.isEmpty()) {
        QProcess::startDetached(bin, args);
    }
}

template <typename Callback>
void runAsyncCommand(const QString &binName, const QStringList &args, QObject *context, Callback &&cb) {
    const QString bin = QStandardPaths::findExecutable(binName);
    if (bin.isEmpty()) return;
    auto *proc = new QProcess(context);
    proc->setStandardErrorFile(QProcess::nullDevice());
    QObject::connect(proc, &QProcess::errorOccurred, context, [proc](QProcess::ProcessError) {
        proc->deleteLater();
    });
    QObject::connect(proc, QOverload<int, QProcess::ExitStatus>::of(&QProcess::finished), context,
                     [proc, cb = std::forward<Callback>(cb)](int code, QProcess::ExitStatus status) mutable {
        const QString out = QString::fromUtf8(proc->readAllStandardOutput()).trimmed();
        proc->deleteLater();
        if (code == 0 && status == QProcess::NormalExit) {
            cb(out);
        }
    });
    proc->start(bin, args);
}
} // namespace

QuickSettingsProvider::QuickSettingsProvider(QObject *parent)
    : QObject(parent) {
    detectInitialStates();
}

QString QuickSettingsProvider::currentDesktopLower() {
    return qEnvironmentVariable("XDG_CURRENT_DESKTOP").toLower();
}

void QuickSettingsProvider::detectInitialStates() {
    detectInitialTheme();
    detectInitialDnd();
    detectInitialNightLight();
}

void QuickSettingsProvider::detectInitialTheme() {
    QDBusInterface portal(
        QStringLiteral("org.freedesktop.portal.Desktop"),
        QStringLiteral("/org/freedesktop/portal/desktop"),
        QStringLiteral("org.freedesktop.portal.Settings"),
        QDBusConnection::sessionBus());

    if (portal.isValid()) {
        auto *watcher = new QDBusPendingCallWatcher(
            portal.asyncCall(QStringLiteral("Read"),
                             QStringLiteral("org.freedesktop.appearance"),
                             QStringLiteral("color-scheme")),
            this);
        connect(watcher, &QDBusPendingCallWatcher::finished, this, [this](QDBusPendingCallWatcher *w) {
            w->deleteLater();
            const QDBusMessage reply = w->reply();
            if (reply.type() == QDBusMessage::ReplyMessage && !reply.arguments().isEmpty()) {
                QVariant outer = reply.arguments().at(0);
                if (outer.userType() == qMetaTypeId<QDBusVariant>()) {
                    const uint schemeVal = qvariant_cast<QDBusVariant>(outer).variant().toUInt();
                    if (schemeVal == 1 || schemeVal == 2) {
                        const bool nextDark = (schemeVal == 1);
                        if (m_darkMode != nextDark) {
                            m_darkMode = nextDark;
                            emit stateChanged();
                        }
                        return;
                    }
                }
            }
            runAsyncCommand(QStringLiteral("gsettings"),
                            {QStringLiteral("get"), QStringLiteral("org.gnome.desktop.interface"), QStringLiteral("color-scheme")},
                            this, [this](const QString &out) {
                const bool nextDark = out.contains(QLatin1String("prefer-dark")) || !out.contains(QLatin1String("default"));
                if (m_darkMode != nextDark) {
                    m_darkMode = nextDark;
                    emit stateChanged();
                }
            });
        });
        return;
    }

    runAsyncCommand(QStringLiteral("gsettings"),
                    {QStringLiteral("get"), QStringLiteral("org.gnome.desktop.interface"), QStringLiteral("color-scheme")},
                    this, [this](const QString &out) {
        if (out.contains(QLatin1String("prefer-dark")) || out.contains(QLatin1String("default"))) {
            const bool nextDark = out.contains(QLatin1String("prefer-dark"));
            if (m_darkMode != nextDark) {
                m_darkMode = nextDark;
                emit stateChanged();
            }
        }
    });
}

void QuickSettingsProvider::detectInitialDnd() {
    const QString de = currentDesktopLower();
    if (de.contains(QLatin1String("kde")) || de.contains(QLatin1String("plasma"))) {
        QDBusInterface props(
            QStringLiteral("org.freedesktop.Notifications"),
            QStringLiteral("/org/freedesktop/Notifications"),
            QStringLiteral("org.freedesktop.DBus.Properties"),
            QDBusConnection::sessionBus());
        if (props.isValid()) {
            auto *w = new QDBusPendingCallWatcher(
                props.asyncCall(QStringLiteral("Get"),
                                QStringLiteral("org.freedesktop.Notifications"),
                                QStringLiteral("Inhibited")),
                this);
            connect(w, &QDBusPendingCallWatcher::finished, this, [this](QDBusPendingCallWatcher *watcher) {
                watcher->deleteLater();
                const QDBusMessage reply = watcher->reply();
                if (reply.type() == QDBusMessage::ReplyMessage && !reply.arguments().isEmpty()) {
                    QVariant val = reply.arguments().at(0);
                    if (val.userType() == qMetaTypeId<QDBusVariant>())
                        val = qvariant_cast<QDBusVariant>(val).variant();
                    const bool dnd = val.toBool();
                    if (m_dnd != dnd) { m_dnd = dnd; emit stateChanged(); }
                }
            });
        }
        return;
    }

    if (de.contains(QLatin1String("xfce"))) {
        runAsyncCommand(QStringLiteral("xfconf-query"),
                        {QStringLiteral("-c"), QStringLiteral("xfce4-notifyd"), QStringLiteral("-p"), QStringLiteral("/do-not-disturb")},
                        this, [this](const QString &out) {
            const bool dnd = (out == QLatin1String("true"));
            if (m_dnd != dnd) { m_dnd = dnd; emit stateChanged(); }
        });
        return;
    }

    if (!QStandardPaths::findExecutable(QStringLiteral("dunstctl")).isEmpty()) {
        runAsyncCommand(QStringLiteral("dunstctl"), {QStringLiteral("is-paused")}, this, [this](const QString &out) {
            const bool dnd = (out == QLatin1String("true"));
            if (m_dnd != dnd) { m_dnd = dnd; emit stateChanged(); }
        });
        return;
    }

    if (!QStandardPaths::findExecutable(QStringLiteral("swaync-client")).isEmpty()) {
        runAsyncCommand(QStringLiteral("swaync-client"), {QStringLiteral("-D")}, this, [this](const QString &out) {
            const bool dnd = (out == QLatin1String("true"));
            if (m_dnd != dnd) { m_dnd = dnd; emit stateChanged(); }
        });
        return;
    }

    runAsyncCommand(QStringLiteral("gsettings"),
                    {QStringLiteral("get"), QStringLiteral("org.gnome.desktop.notifications"), QStringLiteral("show-banners")},
                    this, [this](const QString &out) {
        if (out == QLatin1String("true") || out == QLatin1String("false")) {
            const bool dnd = (out == QLatin1String("false"));
            if (m_dnd != dnd) { m_dnd = dnd; emit stateChanged(); }
        }
    });
}

void QuickSettingsProvider::detectInitialNightLight() {
    const QString de = currentDesktopLower();
    if (de.contains(QLatin1String("kde")) || de.contains(QLatin1String("plasma"))) {
        QDBusInterface props(
            QStringLiteral("org.kde.KWin"),
            QStringLiteral("/org/kde/KWin/NightLight"),
            QStringLiteral("org.freedesktop.DBus.Properties"),
            QDBusConnection::sessionBus());
        if (props.isValid()) {
            auto *w = new QDBusPendingCallWatcher(
                props.asyncCall(QStringLiteral("Get"),
                                QStringLiteral("org.kde.KWin.NightLight"),
                                QStringLiteral("running")),
                this);
            connect(w, &QDBusPendingCallWatcher::finished, this, [this](QDBusPendingCallWatcher *watcher) {
                watcher->deleteLater();
                const QDBusMessage reply = watcher->reply();
                if (reply.type() == QDBusMessage::ReplyMessage && !reply.arguments().isEmpty()) {
                    QVariant val = reply.arguments().at(0);
                    if (val.userType() == qMetaTypeId<QDBusVariant>())
                        val = qvariant_cast<QDBusVariant>(val).variant();
                    const bool active = val.toBool();
                    if (m_nightLight != active) { m_nightLight = active; emit stateChanged(); }
                }
            });
        }
        return;
    }

    runAsyncCommand(QStringLiteral("gsettings"),
                    {QStringLiteral("get"), QStringLiteral("org.gnome.settings-daemon.plugins.color"), QStringLiteral("night-light-enabled")},
                    this, [this](const QString &out) {
        if (out == QLatin1String("true") || out == QLatin1String("false")) {
            const bool active = (out == QLatin1String("true"));
            if (m_nightLight != active) { m_nightLight = active; emit stateChanged(); }
        }
    });
}

void QuickSettingsProvider::toggleDarkMode() {
    m_darkMode = !m_darkMode;
    emit stateChanged();
    emit themeOverrideRequested(m_darkMode ? QStringLiteral("dark") : QStringLiteral("light"));

    const QString de = currentDesktopLower();
    runDetached(QStringLiteral("gsettings"), {
        QStringLiteral("set"),
        QStringLiteral("org.gnome.desktop.interface"),
        QStringLiteral("color-scheme"),
        m_darkMode ? QStringLiteral("prefer-dark") : QStringLiteral("default")
    });

    if (de.contains(QLatin1String("kde")) || de.contains(QLatin1String("plasma"))) {
        runAsyncCommand(QStringLiteral("kreadconfig6"),
                        {QStringLiteral("--group"), QStringLiteral("General"), QStringLiteral("--key"), QStringLiteral("ColorScheme")},
                        this, [dark = m_darkMode](const QString &scheme) {
            if (scheme.isEmpty() || scheme.startsWith(QLatin1String("Breeze"))) {
                runDetached(QStringLiteral("plasma-apply-colorscheme"),
                            {dark ? QStringLiteral("BreezeDark") : QStringLiteral("BreezeLight")});
            }
        });
    } else if (de.contains(QLatin1String("xfce"))) {
        runDetached(QStringLiteral("xfconf-query"), {
            QStringLiteral("-c"), QStringLiteral("xsettings"),
            QStringLiteral("-p"), QStringLiteral("/Net/ThemeName"),
            QStringLiteral("-s"), m_darkMode ? QStringLiteral("Adwaita-dark") : QStringLiteral("Adwaita")
        });
    }
}

void QuickSettingsProvider::toggleNightLight() {
    m_nightLight = !m_nightLight;
    emit stateChanged();

    const QString de = currentDesktopLower();
    if (de.contains(QLatin1String("kde")) || de.contains(QLatin1String("plasma"))) {
        QDBusInterface kdeColor(
            QStringLiteral("org.kde.KWin"),
            QStringLiteral("/ColorCorrect"),
            QStringLiteral("org.kde.kwin.ColorCorrect"),
            QDBusConnection::sessionBus());
        if (kdeColor.isValid()) {
            kdeColor.asyncCall(QStringLiteral("setNightColorConfig"),
                               QVariantMap{{QStringLiteral("Active"), m_nightLight}});
        }
        return;
    }

    if (de.contains(QLatin1String("gnome")) || de.contains(QLatin1String("budgie")) ||
        de.contains(QLatin1String("cinnamon")) || de.contains(QLatin1String("unity"))) {
        runDetached(QStringLiteral("gsettings"), {
            QStringLiteral("set"),
            QStringLiteral("org.gnome.settings-daemon.plugins.color"),
            QStringLiteral("night-light-enabled"),
            m_nightLight ? QStringLiteral("true") : QStringLiteral("false")
        });
        return;
    }

    if (!QStandardPaths::findExecutable(QStringLiteral("hyprctl")).isEmpty() &&
        !QStandardPaths::findExecutable(QStringLiteral("hyprsunset")).isEmpty()) {
        runDetached(QStringLiteral("hyprctl"), {
            QStringLiteral("hyprsunset"),
            QStringLiteral("temperature"),
            m_nightLight ? QStringLiteral("4500") : QStringLiteral("6500")
        });
        return;
    }

    if (!QStandardPaths::findExecutable(QStringLiteral("wlsunset")).isEmpty()) {
        runDetached(QStringLiteral("pkill"), {QStringLiteral("-USR1"), QStringLiteral("wlsunset")});
    }
}

void QuickSettingsProvider::toggleDnd() {
    m_dnd = !m_dnd;
    emit stateChanged();

    const QString de = currentDesktopLower();
    runDetached(QStringLiteral("makoctl"), {QStringLiteral("mode"), QStringLiteral("-t"), QStringLiteral("do-not-disturb")});
    runDetached(QStringLiteral("dunstctl"), {QStringLiteral("set-paused"), m_dnd ? QStringLiteral("true") : QStringLiteral("false")});
    runDetached(QStringLiteral("swaync-client"), {QStringLiteral("-d")});

    if (de.contains(QLatin1String("kde")) || de.contains(QLatin1String("plasma"))) {
        QDBusInterface props(
            QStringLiteral("org.freedesktop.Notifications"),
            QStringLiteral("/org/freedesktop/Notifications"),
            QStringLiteral("org.freedesktop.DBus.Properties"),
            QDBusConnection::sessionBus());
        if (props.isValid()) {
            props.asyncCall(QStringLiteral("Set"),
                            QStringLiteral("org.freedesktop.Notifications"),
                            QStringLiteral("Inhibited"),
                            QVariant::fromValue(QDBusVariant(m_dnd)));
        }
    } else if (de.contains(QLatin1String("xfce"))) {
        runDetached(QStringLiteral("xfconf-query"), {
            QStringLiteral("-c"), QStringLiteral("xfce4-notifyd"),
            QStringLiteral("-p"), QStringLiteral("/do-not-disturb"),
            QStringLiteral("-s"), m_dnd ? QStringLiteral("true") : QStringLiteral("false")
        });
    } else if (de.contains(QLatin1String("cinnamon"))) {
        runDetached(QStringLiteral("gsettings"), {
            QStringLiteral("set"),
            QStringLiteral("org.cinnamon.desktop.notifications"),
            QStringLiteral("display-notifications"),
            m_dnd ? QStringLiteral("false") : QStringLiteral("true")
        });
    } else {
        runDetached(QStringLiteral("gsettings"), {
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
