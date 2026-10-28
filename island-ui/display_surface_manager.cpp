#include "display_surface_manager.h"
#include <QGuiApplication>
#include <QScreen>
#include <QColor>
#include <QProcess>
#include <QStandardPaths>
#include <QJsonDocument>
#include <QJsonObject>

DisplaySurfaceManager::DisplaySurfaceManager(QQuickWindow *window, IslandClient *client, QObject *parent)
    : QObject(parent),
      m_window(window),
      m_client(client) {
    if (m_window) {
        m_window->setFlags(Qt::FramelessWindowHint | Qt::WindowStaysOnTopHint | Qt::Tool);
        m_window->setColor(QColor(0, 0, 0, 0));
        updateWindowPosition();
    }

    if (m_client) {
        connect(m_client, &IslandClient::settingsChanged, this, &DisplaySurfaceManager::onSettingsChanged);
    }

    connect(&m_fullscreenTimer, &QTimer::timeout, this, &DisplaySurfaceManager::checkFullscreen);
    m_fullscreenTimer.setInterval(1500);
    m_fullscreenTimer.start();
}

void DisplaySurfaceManager::onSettingsChanged() {
    updateWindowPosition();
}

void DisplaySurfaceManager::updateWindowPosition() {
    if (!m_window) return;

    QScreen *primary = QGuiApplication::primaryScreen();
    if (!primary) return;

    QRect screenGeo = primary->geometry();
    int hOffset = m_client ? m_client->horizontalOffset() : 0;
    int vOffset = m_client ? m_client->verticalOffset() : 8;

    int posX = screenGeo.x() + (screenGeo.width() - windowWidth()) / 2 + hOffset;
    int posY = screenGeo.y() + vOffset;

    m_window->setGeometry(posX, posY, windowWidth(), windowHeight());
}

void DisplaySurfaceManager::updateInputMask(int x, int y, int width, int height, int radius) {
    Q_UNUSED(radius);
    if (!m_window) return;

    if (width <= 0 || height <= 0) {
        m_window->setMask(QRegion());
        return;
    }

    // Set interactive region to strictly cover the capsule / card
    m_window->setMask(QRegion(x, y, width, height, QRegion::Rectangle));
}

void DisplaySurfaceManager::checkFullscreen() {
    if (!m_client || !m_client->smartAdaptiveEnabled()) return;

    bool isFs = false;

    // Check Hyprland
    if (qEnvironmentVariableIsSet("HYPRLAND_INSTANCE_SIGNATURE")) {
        QString hyprctl = QStandardPaths::findExecutable(QStringLiteral("hyprctl"));
        if (!hyprctl.isEmpty()) {
            QProcess proc;
            proc.start(hyprctl, {QStringLiteral("activewindow"), QStringLiteral("-j")});
            if (proc.waitForFinished(200)) {
                QJsonDocument doc = QJsonDocument::fromJson(proc.readAllStandardOutput());
                if (doc.isObject()) {
                    isFs = doc.object().value(QStringLiteral("fullscreen")).toBool();
                }
            }
        }
    }
    // Check Sway
    else if (qEnvironmentVariableIsSet("SWAYSOCK")) {
        QString swaymsg = QStandardPaths::findExecutable(QStringLiteral("swaymsg"));
        if (!swaymsg.isEmpty()) {
            QProcess proc;
            proc.start(swaymsg, {QStringLiteral("-t"), QStringLiteral("get_tree")});
            if (proc.waitForFinished(300)) {
                QByteArray out = proc.readAllStandardOutput();
                if (out.contains("\"fullscreen_mode\": 1") || out.contains("\"fullscreen_mode\": 2") ||
                    out.contains("\"fullscreen_mode\":1") || out.contains("\"fullscreen_mode\":2")) {
                    isFs = true;
                }
            }
        }
    }
    // Check X11 / XWayland via xprop
    else if (qEnvironmentVariableIsSet("DISPLAY")) {
        QString xprop = QStandardPaths::findExecutable(QStringLiteral("xprop"));
        if (!xprop.isEmpty()) {
            QProcess proc;
            proc.start(xprop, {QStringLiteral("-root"), QStringLiteral("_NET_ACTIVE_WINDOW")});
            if (proc.waitForFinished(200)) {
                QString rootOut = QString::fromUtf8(proc.readAllStandardOutput());
                int hashIdx = rootOut.indexOf(QLatin1String("0x"));
                if (hashIdx != -1) {
                    QString winId = rootOut.mid(hashIdx).trimmed().split(QLatin1Char(' ')).first();
                    QProcess procWin;
                    procWin.start(xprop, {QStringLiteral("-id"), winId, QStringLiteral("_NET_WM_STATE")});
                    if (procWin.waitForFinished(200)) {
                        QString winOut = QString::fromUtf8(procWin.readAllStandardOutput());
                        if (winOut.contains(QLatin1String("_NET_WM_STATE_FULLSCREEN"))) {
                            isFs = true;
                        }
                    }
                }
            }
        }
    }

    if (m_isFullscreen != isFs) {
        m_isFullscreen = isFs;
        emit fullscreenDetected(m_isFullscreen);
        m_client->dispatchEvent(m_isFullscreen ? QStringLiteral("FULLSCREEN_ON") : QStringLiteral("FULLSCREEN_OFF"));
    }
}
