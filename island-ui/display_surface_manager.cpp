#include "display_surface_manager.h"
#include <QGuiApplication>
#include <QScreen>
#include <QColor>
#include <QProcess>
#include <QStandardPaths>
#include <QJsonDocument>
#include <QJsonObject>
#include <QPainterPath>

DisplaySurfaceManager::DisplaySurfaceManager(QQuickWindow *window, IslandClient *client, QObject *parent)
    : QObject(parent),
      m_window(nullptr),
      m_client(client) {
    if (window) {
        attachWindow(window);
    }

    if (m_client) {
        connect(m_client, &IslandClient::settingsChanged, this, &DisplaySurfaceManager::onSettingsChanged);
    }

    connect(&m_fullscreenTimer, &QTimer::timeout, this, &DisplaySurfaceManager::checkFullscreen);
    m_fullscreenTimer.setInterval(1500);
    m_fullscreenTimer.start();
}

void DisplaySurfaceManager::attachWindow(QQuickWindow *window) {
    m_window = window;
    if (!m_window) return;

    Qt::WindowFlags flags = Qt::FramelessWindowHint | Qt::WindowStaysOnTopHint;
    if (QGuiApplication::platformName().startsWith(QLatin1String("xcb"))) {
        flags |= Qt::Tool;
    }
    m_window->setFlags(flags);
    m_window->setColor(QColor(0, 0, 0, 0));
    updateWindowPosition();

    if (!m_currentMaskRect.isEmpty()) {
        // Re-apply through the mask builder so the rounded shape survives
        // window (re)attachment instead of collapsing to a plain rectangle.
        // QML usually calls updateInputMask before the window exists, which
        // caches the geometry but cannot apply it; invalidate the cache so the
        // call below is not skipped by the "unchanged" guard.
        const QRect pendingRect = m_currentMaskRect;
        const int pendingRadius = m_currentMaskRadius;
        m_currentMaskRect = QRect();
        m_currentMaskRadius = -1;
        updateInputMask(pendingRect.x(), pendingRect.y(),
                        pendingRect.width(), pendingRect.height(),
                        pendingRadius);
    }
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

    // Wayland compositors place toplevels themselves and ignore a requested
    // origin; keep the size in sync but skip the move there. X11 and XWayland
    // still honour the top-centre position.
    const bool isWayland = QGuiApplication::platformName().startsWith(QLatin1String("wayland"));
    if (isWayland) {
        static bool warned = false;
        if (!warned) {
            qInfo("Wayland session: compositor placement is in effect for the overlay.");
            warned = true;
        }
        m_window->resize(windowWidth(), windowHeight());
        return;
    }
    m_window->setGeometry(posX, posY, windowWidth(), windowHeight());
}

void DisplaySurfaceManager::updateInputMask(int x, int y, int width, int height, int radius) {
    QRect targetRect = (width <= 0 || height <= 0) ? QRect() : QRect(x, y, width, height);
    if (m_currentMaskRect == targetRect && m_currentMaskRadius == radius && m_window) return;
    m_currentMaskRect = targetRect;
    m_currentMaskRadius = radius;

    if (!m_window) return;

    if (targetRect.isEmpty()) {
        m_window->setMask(QRegion());
        return;
    }

    // Wayland maps the region onto wl_surface.set_input_region, which has no
    // notion of a rounded shape, so the plain rectangle stays correct there.
    // X11/XWayland masks are a real pixel mask and can follow the capsule.
    if (radius > 0 && QGuiApplication::platformName().startsWith(QLatin1String("xcb"))) {
        QPainterPath path;
        path.addRoundedRect(QRectF(targetRect), radius, radius);
        m_window->setMask(QRegion(path.toFillPolygon().toPolygon()));
        return;
    }

    m_window->setMask(QRegion(targetRect, QRegion::Rectangle));
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
