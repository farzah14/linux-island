#include "display_surface_manager.h"
#include <QGuiApplication>
#include <QScreen>
#include <QColor>
#include <QProcess>
#include <QStandardPaths>
#include <QJsonDocument>
#include <QJsonObject>
#include <QJsonArray>
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

bool DisplaySurfaceManager::parseHyprlandFullscreen(const QByteArray &jsonBytes) {
    const QJsonDocument doc = QJsonDocument::fromJson(jsonBytes);
    if (!doc.isObject())
        return false;
    const QJsonValue val = doc.object().value(QStringLiteral("fullscreen"));
    // Hyprland reports 0/1/2 (int) on some versions and a bool on others.
    if (val.isBool())
        return val.toBool();
    if (val.isDouble())
        return val.toInt() > 0;
    return false;
}

namespace {
// Only the focused container matters: sway's get_tree dumps every workspace,
// so scanning for any fullscreen_mode would match windows the user cannot see.
bool focusedNodeIsFullscreen(const QJsonObject &node) {
    if (node.value(QStringLiteral("focused")).toBool())
        return node.value(QStringLiteral("fullscreen_mode")).toInt(0) > 0;

    const QStringList childKeys = {QStringLiteral("nodes"), QStringLiteral("floating_nodes")};
    for (const QString &key : childKeys) {
        const QJsonArray arr = node.value(key).toArray();
        for (const QJsonValue &child : arr) {
            if (child.isObject() && focusedNodeIsFullscreen(child.toObject()))
                return true;
        }
    }
    return false;
}
} // namespace

bool DisplaySurfaceManager::parseSwayFullscreen(const QByteArray &jsonBytes) {
    const QJsonDocument doc = QJsonDocument::fromJson(jsonBytes);
    if (!doc.isObject())
        return false;
    return focusedNodeIsFullscreen(doc.object());
}

void DisplaySurfaceManager::applyFullscreenState(bool isFullscreen) {
    if (m_isFullscreen == isFullscreen)
        return;
    m_isFullscreen = isFullscreen;
    emit fullscreenDetected(m_isFullscreen);
    if (m_client) {
        m_client->dispatchEvent(m_isFullscreen ? QStringLiteral("FULLSCREEN_ON")
                                              : QStringLiteral("FULLSCREEN_OFF"));
    }
}

void DisplaySurfaceManager::checkFullscreen() {
    if (!m_client || !m_client->smartAdaptiveEnabled())
        return;
    // One probe at a time: the timer fires every 1.5 s and a slow compositor
    // call must not stack processes on the GUI thread.
    if (m_checkInFlight)
        return;

    QString program;
    QStringList arguments;
    bool isHyprland = false;
    bool isSway = false;

    if (qEnvironmentVariableIsSet("HYPRLAND_INSTANCE_SIGNATURE")) {
        program = QStandardPaths::findExecutable(QStringLiteral("hyprctl"));
        arguments = {QStringLiteral("activewindow"), QStringLiteral("-j")};
        isHyprland = true;
    } else if (qEnvironmentVariableIsSet("SWAYSOCK")) {
        program = QStandardPaths::findExecutable(QStringLiteral("swaymsg"));
        arguments = {QStringLiteral("-t"), QStringLiteral("get_tree")};
        isSway = true;
    } else if (qEnvironmentVariableIsSet("DISPLAY")) {
        program = QStandardPaths::findExecutable(QStringLiteral("xprop"));
        arguments = {QStringLiteral("-root"), QStringLiteral("_NET_ACTIVE_WINDOW")};
    }

    if (program.isEmpty())
        return;

    m_checkInFlight = true;
    auto *proc = new QProcess(this);
    proc->setProcessChannelMode(QProcess::SeparateChannels);
    connect(proc, &QProcess::errorOccurred, this, [this, proc](QProcess::ProcessError) {
        m_checkInFlight = false;
        proc->deleteLater();
    });
    connect(proc, QOverload<int, QProcess::ExitStatus>::of(&QProcess::finished), this,
            [this, proc, isHyprland, isSway](int, QProcess::ExitStatus status) {
        m_checkInFlight = false;
        const QByteArray out = proc->readAllStandardOutput();
        proc->deleteLater();

        if (status != QProcess::NormalExit)
            return;

        if (isHyprland) {
            applyFullscreenState(parseHyprlandFullscreen(out));
            return;
        }
        if (isSway) {
            applyFullscreenState(parseSwayFullscreen(out));
            return;
        }

        // X11 / XWayland: resolve the active window, then query its state.
        const QString rootOut = QString::fromUtf8(out);
        const int hashIdx = rootOut.indexOf(QLatin1String("0x"));
        if (hashIdx < 0)
            return;
        const QString winId = rootOut.mid(hashIdx).trimmed().split(QLatin1Char(' ')).first();
        if (winId.isEmpty())
            return;

        const QString xprop = QStandardPaths::findExecutable(QStringLiteral("xprop"));
        if (xprop.isEmpty())
            return;

        auto *winProc = new QProcess(this);
        connect(winProc, &QProcess::errorOccurred, this, [winProc](QProcess::ProcessError) {
            winProc->deleteLater();
        });
        connect(winProc, QOverload<int, QProcess::ExitStatus>::of(&QProcess::finished), this,
                [this, winProc](int, QProcess::ExitStatus winStatus) {
            const QString winOut = QString::fromUtf8(winProc->readAllStandardOutput());
            winProc->deleteLater();
            if (winStatus != QProcess::NormalExit)
                return;
            applyFullscreenState(winOut.contains(QLatin1String("_NET_WM_STATE_FULLSCREEN")));
        });
        winProc->start(xprop, {QStringLiteral("-id"), winId, QStringLiteral("_NET_WM_STATE")});
    });
    proc->start(program, arguments);
}
